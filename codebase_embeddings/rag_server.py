"""WUIC Codebase RAG server (FastAPI).

Esposto in localhost:8765, viene proxiato dal `RagController.cs` di KonvergenceCore.

Endpoint:
  POST /api/rag/query   — retrieval pure (top-K chunks)
  POST /api/rag/chat    — RAG + Claude (con fallback retrieval-only se ANTHROPIC_API_KEY manca)
  GET  /health          — stato server + LLM enabled flag
  POST /admin/reload    — hot reload dell'indice + LoRA dopo rebuild RAG

Caricamento al boot:
  - hybrid index (BM25 + bge-m3 vectors) da `index/`
  - LoRA cross-encoder v2 da `lora_ce_v4/` (auto-detect via generate_embeddings)
  - translation cache IT->EN da `_translate_cache_v3.json`

Run:
  cd c:/src/Wuic/codebase_embeddings
  $env:ANTHROPIC_API_KEY = "sk-ant-..."   # opzionale; se assente, /chat degrada a retrieval-only
  ../KonvergenceCore/.venv/Scripts/python.exe -m uvicorn rag_server:app --host 127.0.0.1 --port 8765
"""
from __future__ import annotations

import json
import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Defer heavy imports until startup so the module is importable for tooling/tests.
_state: Dict[str, Any] = {}

LOG = logging.getLogger("rag_server")
LOG.setLevel(logging.INFO)
if not LOG.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"))
    LOG.addHandler(_h)

INDEX_DIR = Path(os.environ.get("WUIC_RAG_INDEX_DIR", "index"))
TRANSLATE_CACHE_PATH = Path(os.environ.get("WUIC_RAG_TRANSLATE_CACHE", "_translate_cache_v3.json"))
DEFAULT_CHAT_MODEL = os.environ.get("WUIC_RAG_DEFAULT_MODEL", "claude-haiku-4-5-20251001")
SYSTEM_PROMPT = (
    "Sei un assistente esperto del codebase WUIC. Rispondi alla domanda dell'utente "
    "usando ESCLUSIVAMENTE il contesto fornito. Se la risposta non e' nel contesto, "
    "rispondi 'Non ho trovato informazioni sufficienti nel codebase per rispondere.' "
    "Cita sempre i file rilevanti tra parentesi quadre nel formato [file.ext::SimboloOpzionale]. "
    "Rispondi in italiano salvo richiesta esplicita di un'altra lingua. "
    "Non inventare API o nomi di metodi: se non sono nel contesto, dillo esplicitamente."
)


def _load_state() -> None:
    """Carica indice + cache + LoRA. Idempotente: chiamabile da boot e da /admin/reload."""
    LOG.info("loading index from %s", INDEX_DIR.resolve())
    t0 = time.time()
    # Import lazy: evita di importare torch finche' non serve davvero.
    from generate_embeddings import load_index  # noqa: WPS433
    model, vectors, docs, bm25 = load_index(INDEX_DIR)
    LOG.info("index loaded in %.1fs (%d chunks)", time.time() - t0, len(docs))

    # Indice ausiliario chunk_id -> doc dict per recuperare il text completo:
    # search_loaded() ritorna 'preview' (a volte vuoto) ma noi vogliamo 'text' integro
    # per snippet UI e per il contesto LLM.
    docs_by_id: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        cid = doc.get("chunk_id")
        if cid:
            docs_by_id[cid] = doc

    cache: Dict[str, str] = {}
    if TRANSLATE_CACHE_PATH.exists():
        try:
            cache = json.loads(TRANSLATE_CACHE_PATH.read_text(encoding="utf-8"))
            LOG.info("translate cache loaded (%d entries)", len(cache))
        except Exception as exc:  # noqa: BLE001
            LOG.warning("failed to load translate cache: %s", exc)
    else:
        LOG.warning("translate cache missing at %s, IT->EN translations skipped", TRANSLATE_CACHE_PATH)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    llm_enabled = bool(api_key)
    LOG.info("Anthropic API key %s; chat mode %s", "present" if llm_enabled else "MISSING", "enabled" if llm_enabled else "DEGRADED to retrieval-only")

    # Cross-encoder rerank (BGE reranker v2-m3 + LoRA v2): di default ON. Su CPU
    # costa 30-120s per query con top_n=40 su ~5600 chunks, con rischio OOM+swap
    # prolungato su VPS <=4 GB RAM (sintomo: query che restano appese per ore,
    # processo Python con CPU time elevato ma nessun progresso stdout).
    # Disabilitabile in 2 modi:
    #   1) env var WUIC_RAG_DISABLE_CROSS_ENCODER=1 (persistente, consigliato su CPU-only)
    #   2) CLI flag --disable-cross-encoder
    # Quando disabilitato: BM25 + vector search only, ~2-5s per query.
    # Tradeoff qualita': hit@8 da 0.87 (CE+LoRA v2) → 0.74 (no-CE) sul benchmark
    # interno. Accettabile per demo pubblico, sconsigliato su deploy con GPU.
    disable_ce_env = os.environ.get("WUIC_RAG_DISABLE_CROSS_ENCODER", "").strip().lower() in ("1", "true", "yes", "on")
    disable_ce_cli = "--disable-cross-encoder" in sys.argv or "--no-use-cross-encoder" in sys.argv
    use_cross_encoder = not (disable_ce_env or disable_ce_cli)
    LOG.info(
        "cross-encoder rerank %s (env=%s cli=%s)",
        "ENABLED" if use_cross_encoder else "DISABLED",
        "set" if disable_ce_env else "unset",
        "set" if disable_ce_cli else "unset",
    )

    _state.clear()
    _state.update(
        model=model,
        vectors=vectors,
        docs=docs,
        docs_by_id=docs_by_id,
        bm25=bm25,
        translate_cache=cache,
        anthropic_api_key=api_key,
        llm_enabled=llm_enabled,
        use_cross_encoder=use_cross_encoder,
        loaded_at=time.time(),
    )

    # Warm-up esplicito del cross-encoder (lazy-loaded in get_cross_encoder()
    # cache la prima volta che search_loaded() viene chiamato con
    # use_cross_encoder=True). Senza warm-up, la PRIMA query reale del client
    # paga il cold start ~30-60s di bge-reranker-v2-m3 (~600 MB) + LoRA v2
    # adapter, scatenando rag-server-timeout sul backend C# (timeout HttpClient
    # default 300s coprirebbe ma e' UX scadente: l'utente aspetta minuti per
    # la prima domanda). Spostando il cold start qui, lo paghiamo durante il
    # boot del server (rag-setup.ps1 ha timeout bind 600s) e tutte le query
    # reali partono ~1-3s.
    # Se il cross-encoder e' disabilitato (CPU-only deploy), skip del warm-up:
    # eviterebbe di caricare inutilmente ~600 MB di model + LoRA in RAM, liberando
    # spazio per retrieval plain BM25+vector che e' l'unico path attivo.
    if not use_cross_encoder:
        LOG.info("cross-encoder DISABLED → skipping warm-up (saves ~600 MB RAM + ~45s boot time)")
        return
    LOG.info("warming up cross-encoder (pre-loading bge-reranker-v2-m3 + LoRA v2)...")
    t1 = time.time()
    try:
        from generate_embeddings import search_loaded  # noqa: WPS433
        _ = search_loaded(
            model=model, vectors=vectors, docs=docs, bm25=bm25,
            query="warmup",
            top_k=1,
            use_cross_encoder=True,
            cross_encoder_top_n=2,
            cross_encoder_blend=0.85,
            cross_encoder_intent_weight=0.0,
            use_hyde=False,
        )
        LOG.info("cross-encoder warmed up in %.1fs (first real query sara' veloce)", time.time() - t1)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("cross-encoder warm-up fallito: %s (la prima query paghera' il cold start)", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    LOG.info("rag_server starting up")
    _load_state()
    yield
    LOG.info("rag_server shutting down")


app = FastAPI(title="WUIC Codebase RAG server", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # Bind only to 127.0.0.1 anyway; CORS open is fine for local proxy use.
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    allow_credentials=False,
)


# ---------- DTO ----------

class QueryIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(8, ge=1, le=20)
    use_lora: bool = True


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    history: List[ChatTurn] = Field(default_factory=list)
    top_k: int = Field(5, ge=1, le=15)
    model: str = DEFAULT_CHAT_MODEL


class RagSourceOut(BaseModel):
    rank: int
    chunk_id: Optional[str] = None
    rel_path: Optional[str] = None
    symbol_name: Optional[str] = None
    symbol_type: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None
    score_vector: Optional[float] = None
    score_bm25: Optional[float] = None
    snippet: str = ""


class QueryOut(BaseModel):
    results: List[RagSourceOut]


class ChatOut(BaseModel):
    mode: str  # "rag-llm" | "retrieval-only"
    answer: Optional[str] = None
    sources: List[RagSourceOut]
    warning: Optional[str] = None
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None


class HealthOut(BaseModel):
    status: str
    llm_enabled: bool
    docs_loaded: int
    translate_cache_size: int
    loaded_at: Optional[float] = None
    default_model: str


# ---------- helpers ----------

def _ensure_loaded() -> None:
    if not _state.get("docs"):
        raise HTTPException(status_code=503, detail="rag-server not initialized")


def _translate_query(query_text: str) -> str:
    """Best-effort lookup nella cache IT->EN. Se non trovato, ritorna l'originale.

    Non chiamiamo NLLB live qui per evitare cold start (~1.2GB) sul primo hit di una query nuova.
    Per query non in cache, usiamo l'originale: il vettoriale bge-m3 e' multilingue.
    """
    cache: Dict[str, str] = _state.get("translate_cache") or {}
    return cache.get(query_text, query_text)


def _do_search(query_text: str, top_k: int) -> List[Dict[str, Any]]:
    from generate_embeddings import search_loaded  # noqa: WPS433
    # Rispetta il flag dinamico: su CPU-only deployment il cross-encoder rerank
    # e' tipicamente disabilitato per evitare 30-120s di latenza per query +
    # rischio OOM (vedi env WUIC_RAG_DISABLE_CROSS_ENCODER / --disable-cross-encoder).
    use_ce = bool(_state.get("use_cross_encoder", True))
    return search_loaded(
        model=_state["model"],
        vectors=_state["vectors"],
        docs=_state["docs"],
        bm25=_state["bm25"],
        query=query_text,
        top_k=top_k,
        use_cross_encoder=use_ce,
        # Defaults Phase C (gia' wired in generate_embeddings.py, ridichiarati qui per chiarezza)
        cross_encoder_top_n=40,
        cross_encoder_blend=0.85,
        cross_encoder_intent_weight=0.0,
        use_hyde=False,
    )


def _full_text_for(result: Dict[str, Any]) -> str:
    """Recupera il testo completo del chunk via lookup nel docs index by chunk_id.

    `search_loaded()` ritorna `preview` (a volte vuoto/troncato); `text` integro vive
    solo nel doc originale. Fallback ordinato: text > preview > "".
    """
    cid = result.get("chunk_id")
    docs_by_id = _state.get("docs_by_id") or {}
    if cid and cid in docs_by_id:
        doc = docs_by_id[cid]
        text = doc.get("text") or doc.get("content") or ""
        if text:
            return text
    return result.get("preview") or result.get("text") or ""


def _format_sources(results: List[Dict[str, Any]], limit: int) -> List[RagSourceOut]:
    out: List[RagSourceOut] = []
    for i, r in enumerate(results[:limit], start=1):
        snippet = _full_text_for(r)[:500]
        out.append(
            RagSourceOut(
                rank=i,
                chunk_id=r.get("chunk_id"),
                rel_path=r.get("rel_path"),
                symbol_name=r.get("symbol_name"),
                symbol_type=r.get("symbol_type"),
                start_line=r.get("start_line"),
                end_line=r.get("end_line"),
                score_vector=float(r["score_vector"]) if r.get("score_vector") is not None else None,
                score_bm25=float(r["score_bm25"]) if r.get("score_bm25") is not None else None,
                snippet=snippet,
            )
        )
    return out


def _build_llm_context(results: List[Dict[str, Any]], limit: int, max_chars_per_chunk: int = 1500) -> str:
    parts: List[str] = []
    for r in results[:limit]:
        rel = r.get("rel_path") or "?"
        sym = r.get("symbol_name") or ""
        header = f"[{rel}::{sym}]" if sym else f"[{rel}]"
        body = _full_text_for(r)[:max_chars_per_chunk]
        parts.append(f"{header}\n{body}")
    return "\n\n".join(parts)


# ---------- endpoints ----------

@app.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    return HealthOut(
        status="ok" if _state.get("docs") else "loading",
        llm_enabled=bool(_state.get("llm_enabled")),
        docs_loaded=len(_state.get("docs") or []),
        translate_cache_size=len(_state.get("translate_cache") or {}),
        loaded_at=_state.get("loaded_at"),
        default_model=DEFAULT_CHAT_MODEL,
    )


@app.post("/api/rag/query", response_model=QueryOut)
def query_endpoint(req: QueryIn) -> QueryOut:
    _ensure_loaded()
    q_en = _translate_query(req.query)
    LOG.info("query: top_k=%d query=%r", req.top_k, req.query[:80])
    results = _do_search(q_en, req.top_k)
    return QueryOut(results=_format_sources(results, req.top_k))


@app.post("/api/rag/chat", response_model=ChatOut)
def chat_endpoint(req: ChatIn) -> ChatOut:
    _ensure_loaded()
    q_en = _translate_query(req.query)
    LOG.info("chat: top_k=%d model=%s query=%r", req.top_k, req.model, req.query[:80])

    # Over-fetch leggero per dare contesto piu' largo all'LLM (se attivo)
    over_fetch = max(req.top_k, min(req.top_k * 2, 12))
    results = _do_search(q_en, over_fetch)
    sources = _format_sources(results, req.top_k)

    # Fallback se LLM disabilitato
    if not _state.get("llm_enabled"):
        return ChatOut(
            mode="retrieval-only",
            answer=None,
            sources=sources,
            warning="ANTHROPIC_API_KEY not set on the rag server; LLM disabled, returning retrieval results only",
        )

    # Build LLM context dai top-K (non over-fetched, per stare sotto budget token)
    context = _build_llm_context(results, req.top_k)
    system = f"{SYSTEM_PROMPT}\n\nCONTESTO:\n{context}"

    history_payload = [{"role": t.role, "content": t.content} for t in req.history]
    history_payload.append({"role": "user", "content": req.query})

    try:
        import anthropic  # noqa: WPS433

        client = anthropic.Anthropic(api_key=_state["anthropic_api_key"])
        msg = client.messages.create(
            model=req.model,
            max_tokens=1024,
            system=system,
            messages=history_payload,
        )
    except Exception as exc:  # noqa: BLE001
        LOG.error("anthropic call failed: %s", exc)
        return ChatOut(
            mode="retrieval-only",
            answer=None,
            sources=sources,
            warning=f"Anthropic call failed ({type(exc).__name__}); degraded to retrieval-only",
        )

    answer_text = ""
    if getattr(msg, "content", None):
        for block in msg.content:
            if getattr(block, "type", None) == "text":
                answer_text += getattr(block, "text", "")

    return ChatOut(
        mode="rag-llm",
        answer=answer_text,
        sources=sources,
        model=req.model,
        tokens_in=getattr(getattr(msg, "usage", None), "input_tokens", None),
        tokens_out=getattr(getattr(msg, "usage", None), "output_tokens", None),
    )


@app.post("/admin/reload")
def admin_reload() -> Dict[str, Any]:
    LOG.info("admin reload requested")
    try:
        _load_state()
    except Exception as exc:  # noqa: BLE001
        LOG.error("reload failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"reload failed: {exc}")
    return {
        "status": "reloaded",
        "docs_loaded": len(_state.get("docs") or []),
        "llm_enabled": bool(_state.get("llm_enabled")),
        "loaded_at": _state.get("loaded_at"),
    }
