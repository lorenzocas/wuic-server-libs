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
import re
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

# Profilo di deployment.
#   'internal' (DEFAULT): assistente full-source per chi ha i sorgenti (uso locale
#               dello sviluppatore framework). Nessuna redazione.
#   'release' : chat spedita ai developer-cliente, che hanno SOLO DLL offuscate +
#               npm dist/.d.ts + docs pubbliche. Il sorgente proprietario del
#               framework viene REDATTO alla sola firma del metodo (l'end developer
#               ottiene comunque l'API da chiamare, in RAG+LLM anche un esempio),
#               MAI il body; window-chunk interni e guide AI (skill/script) scartati.
# ATTENZIONE: il deploy verso i clienti DEVE impostare WUIC_RAG_PROFILE=release
# (vedi skill rag-chatbot-deploy). Default 'internal' per non alterare l'uso locale.
RAG_PROFILE = os.environ.get("WUIC_RAG_PROFILE", "internal").strip().lower()
if RAG_PROFILE not in ("internal", "release"):
    RAG_PROFILE = "internal"
SYSTEM_PROMPT = (
    "Sei un assistente esperto del codebase WUIC. Rispondi alla domanda dell'utente "
    "usando ESCLUSIVAMENTE il contesto fornito. Se la risposta non e' nel contesto, "
    "rispondi 'Non ho trovato informazioni sufficienti nel codebase per rispondere.' "
    "Cita sempre i file rilevanti tra parentesi quadre nel formato [file.ext::SimboloOpzionale]. "
    "Rispondi in italiano salvo richiesta esplicita di un'altra lingua. "
    "Non inventare API o nomi di metodi: se non sono nel contesto, dillo esplicitamente."
)

# System prompt SPECIALE per il /compact: l'LLM produce un riassunto della
# conversazione (NON una risposta normale). Usato da `POST /api/rag/compact`.
COMPACT_SYSTEM_PROMPT = (
    "Sei un compattatore di conversazioni. Dato l'archivio di una conversazione "
    "tra un utente e un assistente, produci un RIASSUNTO conciso (target 1500-3000 "
    "token, MAI superare 5000) che preservi:\n"
    "  - Le decisioni architetturali / di design prese\n"
    "  - I vincoli tecnici scoperti\n"
    "  - Le route/colonne/entita' discusse\n"
    "  - Gli endpoint/API menzionati\n"
    "  - Le preferenze dell'utente esplicitate\n"
    "  - Lo stato dei task in costruzione (cosa fatto, cosa pendente)\n"
    "OMETTI:\n"
    "  - Snippet di codice (l'utente li recupera dalla history visibile)\n"
    "  - Spiegazioni didattiche/concettuali\n"
    "  - Errori gia' risolti\n"
    "  - Chiarimenti gia' dati\n"
    "Formato: paragrafi italiani, niente bullet eccessivi. Scrivi SOLO il riassunto, "
    "senza intro tipo 'Ecco il riassunto:'. Sii denso ma leggibile."
)


# Context window per modello Anthropic. Hardcoded perche' Anthropic non espone
# un endpoint enumerativo; aggiorna qui se aggiungi modelli nuovi al menu.
_MODEL_CONTEXT_WINDOWS: Dict[str, int] = {
    # Haiku 4.5: 200k token base, no extended context.
    "claude-haiku-4-5-20251001": 200_000,
    # Sonnet/Opus: 200k base; con beta header `context-1m-2025-08-07` arrivano
    # a 1M. Per ora tracciamo solo il base — se attiviamo il beta header lato
    # client.messages.create andra' aggiornato qui.
    "claude-sonnet-4-5-20250929": 200_000,
    "claude-opus-4-20250514": 200_000,
}


def _model_context_window(model: str) -> int:
    """Token context window del modello. Default conservativo 200k se sconosciuto."""
    return _MODEL_CONTEXT_WINDOWS.get(model, 200_000)


def _safe_count_tokens(client, model: str, system: str, messages: List[Dict[str, Any]],
                       tools: Optional[List[Dict[str, Any]]] = None) -> Optional[int]:
    """Conta i token della prossima call al modello via API ufficiale Anthropic
    (`client.messages.count_tokens`). Gratis, esatto.
    Best-effort: ritorna None su errore (timeout, modello non supportato, ecc.)
    invece di propagare l'eccezione - count e' utility per UX/warning, non
    deve mai impedire la chat normale.
    """
    try:
        kwargs = {"model": model, "system": system, "messages": messages}
        if tools:
            kwargs["tools"] = tools
        ct = client.messages.count_tokens(**kwargs)
        return getattr(ct, "input_tokens", None)
    except Exception as exc:  # noqa: BLE001
        LOG.warning("count_tokens failed: %s", exc)
        return None


_CALLBACK_FN_HEAD_RE = re.compile(
    # Match alternative:
    #   1. `[async ] function [name] (...) { ... }`  (function declaration con nome opt)
    #   2. `[async ] (...) => { ... }`               (arrow function)
    # Il nome dopo `function` deve essere OPZIONALE (`async function (...) {}` e' anonima).
    r"^\s*(?:"
    r"(?:async\s+)?function\b\s*(?:[A-Za-z_$][\w$]*\s*)?\([^)]*\)\s*\{"
    r"|"
    r"(?:async\s+)?\([^)]*\)\s*=>\s*\{"
    r")",
    re.DOTALL,
)


def _unwrap_callback_body(callback_js: str) -> str:
    """Estrae il BODY-only se l'LLM ha emesso una function declaration / arrow.

    I callback in `_mtdt__cstom__actions__tabelle.actioncallback` e affini sono
    salvati come BODY senza wrapper: il framework runtime li avvolge in
    `async (datasource, metaInfo, record, event, wtoolbox) => { <BODY> }` al fly.
    L'LLM nei dataset di training quasi sempre scrive callback come funzione
    completa (`async function (...) { ... }` o `(...) => { ... }`); questo
    helper la riconosce e ne strippa l'involucro, preservando solo il body.

    Robusto a:
      - `async function (a,b,c) { ... }`
      - `function name(a,b,c) { ... }`
      - `(a,b,c) => { ... }`
      - `async (a,b,c) => { ... }`
      - body con `{ }` annidati (uso bracket depth count, non regex)
      - codice gia' body-only (ritornato as-is).

    Failsafe: se non trova bilanciamento valido o l'unwrap produrrebbe una
    stringa vuota / brutta, ritorna l'input ORIGINALE.
    """
    if not callback_js or not callback_js.strip():
        return callback_js
    text = callback_js.strip()
    head_match = _CALLBACK_FN_HEAD_RE.match(text)
    if not head_match:
        return callback_js  # gia' body-only
    # head_match.end() punta al carattere DOPO la `{` di apertura del body
    body_start = head_match.end()
    depth = 1
    i = body_start
    while i < len(text) and depth > 0:
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    if depth != 0:
        return callback_js  # parentesi sbilanciate: non rischio, ritorno originale
    body = text[body_start:i].strip()
    # Failsafe: se l'unwrap produce vuoto, restituisce originale (meglio una
    # function fastidiosa di una stringa vuota che non fa niente).
    if not body:
        return callback_js
    return body


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
    LOG.info("rag_server starting up (profile=%s)", RAG_PROFILE)
    if RAG_PROFILE == "internal":
        LOG.warning("RAG_PROFILE=internal: full-source mode. Per il deploy ai "
                    "clienti impostare WUIC_RAG_PROFILE=release (anti source-leak).")
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
    # Profilo richiesto dall'UI (toggle). Puo' solo RENDERE PIU' STRETTA la
    # redazione, mai piu' larga: l'effettivo = strictest-of(env, richiesta).
    profile: Optional[str] = None


class ChatTurn(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    history: List[ChatTurn] = Field(default_factory=list)
    top_k: int = Field(5, ge=1, le=15)
    model: str = DEFAULT_CHAT_MODEL
    profile: Optional[str] = None  # vedi QueryIn.profile (strictest-of)
    # Riepilogo contesto pagina utente (route + tabella + colonne) costruito
    # dal client Angular. Iniettato nel system prompt LLM per usare i nomi
    # REALI delle colonne nelle risposte. Accetta sia `route_context` (snake,
    # convenzione Python) sia `routeContext` (camel, default System.Text.Json
    # da C#) grazie all'alias + populate_by_name.
    route_context: Optional[str] = Field(default=None, alias="routeContext", max_length=8000)
    # Contesto di sessione persistente (caricato dal C# da `_rag_chat_sessions`)
    # iniettato nel system prompt. `context_summary` rimpiazza i turn vecchi
    # nella history (riassunto dei turn fino a `summary_up_to_message_id`); i
    # `memory_facts` sono fatti "pinnati" dall'LLM via tool `remember_fact`.
    context_summary: Optional[str] = Field(default=None, alias="contextSummary", max_length=10000)
    memory_facts: Optional[str] = Field(default=None, alias="memoryFacts", max_length=8000)
    model_config = {"populate_by_name": True}


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


class CompactIn(BaseModel):
    """Payload `POST /api/rag/compact`: produce un summary della conversazione
    per persistenza lato backend (context_summary + summary_up_to_message_id).
    """
    history: List[ChatTurn] = Field(default_factory=list)
    model: str = DEFAULT_CHAT_MODEL
    profile: Optional[str] = None
    # Riepilogo PRECEDENTE (per compact incrementale: il nuovo summary include il vecchio)
    previous_summary: Optional[str] = Field(default=None, alias="previousSummary", max_length=10000)
    model_config = {"populate_by_name": True}


class CompactOut(BaseModel):
    summary: str
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    warning: Optional[str] = None


class ChatOut(BaseModel):
    mode: str  # "rag-llm" | "retrieval-only"
    answer: Optional[str] = None
    sources: List[RagSourceOut]
    warning: Optional[str] = None
    model: Optional[str] = None
    tokens_in: Optional[int] = None
    tokens_out: Optional[int] = None
    # Stima context usage attuale: tokens_in / context_window_max per il modello.
    # Iniettato in OGNI risposta cosi' il client puo' aggiornare il cerchio
    # visuale (verde/giallo/arancione/rosso) senza fare lui il counting.
    context_window_max: Optional[int] = None
    context_used: Optional[int] = None
    # JSON serializzato della proposta strutturata emessa dall'LLM via tool-use.
    # Forma: {"kind":"toolbar_action","route":"cities","label":"Genera PDF",
    #         "icon":"pi pi-file-pdf","callback_js":"...","rationale":"..."}
    # Null se il modello ha risposto solo con testo (nessun tool_use emesso).
    # Il backend C# lo persiste in `_rag_chat_messages.proposed_action_json`.
    proposed_action_json: Optional[str] = None
    # Follow-up questions emesse dall'LLM via tool `suggest_followups`. Max 3,
    # ognuna <=80 char. Il backend le persiste in `_rag_chat_messages` (via
    # campo dedicato) e il client le rende come chip cliccabili sotto la risposta.
    followup_questions: Optional[List[str]] = None
    # Memory facts updates: array di {"op":"add"|"remove","fact"?:str,"id"?:int}
    # emessi dall'LLM via tool `remember_fact` / `forget_fact`. Il backend li
    # applica al JSON corrente in `_rag_chat_sessions.memory_facts_json`.
    proposed_memory_changes: Optional[List[Dict[str, Any]]] = None
    # Summary aggiornato emesso al summarization round (history > N turn).
    # Il backend lo persiste su `_rag_chat_sessions.context_summary` insieme
    # a `summary_up_to_message_id` (passato come `proposed_summary_up_to`).
    proposed_summary_update: Optional[str] = None
    proposed_summary_up_to: Optional[int] = None


class HealthOut(BaseModel):
    status: str
    llm_enabled: bool
    docs_loaded: int
    translate_cache_size: int
    loaded_at: Optional[float] = None
    default_model: str
    profile: str = "internal"


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


# Finestra di candidati pre-CE FISSA per il chatbot (allineata al config eval:
# top_k=8 -> max(30, 32) = 32). Disaccoppiata dal numero di risultati richiesti
# cosi' l'over-fetch per il dedup locali NON altera il ranking dei top risultati.
_CHATBOT_CANDIDATE_WINDOW = 32


def _effective_profile(req_profile: Optional[str]) -> str:
    """Profilo effettivo = strictest-of(env, richiesta). 'release' e' piu' stretto
    di 'internal'. Il toggle UI puo' SOLO aumentare la redazione (preview release
    su un server internal), MAI scendere sotto il floor del server (un client su
    deploy release non puo' chiedere 'internal' e leakare)."""
    req = (req_profile or "").strip().lower()
    if RAG_PROFILE == "release" or req == "release":
        return "release"
    return "internal"


def _retrieval_pool(top_k: int, profile: str) -> int:
    """Quanti risultati pescare prima di dedup/filtro. In release scartiamo i
    chunk 'deny', quindi peschiamo l'intera finestra per avere abbastanza
    risultati visibili da riempire top_k."""
    if profile == "release":
        return _CHATBOT_CANDIDATE_WINDOW
    return min(_CHATBOT_CANDIDATE_WINDOW, max(top_k * 4, 20))


def _do_search(query_text: str, top_k: int) -> List[Dict[str, Any]]:
    from generate_embeddings import search_loaded  # noqa: WPS433
    return search_loaded(
        model=_state["model"],
        vectors=_state["vectors"],
        docs=_state["docs"],
        bm25=_state["bm25"],
        query=query_text,
        top_k=top_k,
        candidate_window=_CHATBOT_CANDIDATE_WINDOW,
        use_cross_encoder=True,
        # Defaults Phase C (gia' wired in generate_embeddings.py, ridichiarati qui per chiarezza)
        cross_encoder_top_n=40,
        cross_encoder_blend=0.85,
        cross_encoder_intent_weight=0.0,
        use_hyde=False,
    )


# ---------- dedup locali documentazione ----------
# Le pagine docs/pages esistono in 5 lingue: sorgente italiano (senza prefisso)
# + en-US/ fr-FR/ es-ES/ de-DE/. Dopo il boost docs tutte le varianti dello
# stesso slug emergono insieme e il chatbot mostra 5 link quasi-identici della
# stessa pagina. Qui le collassiamo in UN solo risultato per slug, preferendo la
# variante nella lingua della query (rilevata sull'originale, NON sul testo
# tradotto), e tenendo la posizione del miglior ranking.

# segmento path locale -> codice lingua. Il sorgente senza prefisso e' italiano.
_DOC_LOCALE_SEGMENTS = {"en-us": "en", "fr-fr": "fr", "es-es": "es", "de-de": "de"}

# Stopword distintive per rilevare la lingua della query (heuristica leggera,
# zero dipendenze). La lingua col maggior numero di hit vince; default 'it'
# (lingua sorgente della documentazione) in caso di parita'/zero match.
_LANG_STOPWORDS = {
    "it": {"il", "lo", "la", "di", "che", "come", "una", "un", "per", "con", "del",
           "non", "sono", "gli", "le", "dei", "nella", "anche", "quale", "dove", "voglio"},
    "en": {"the", "is", "how", "what", "of", "to", "and", "in", "for", "with",
           "do", "does", "can", "are", "where", "which", "want"},
    "fr": {"le", "les", "comment", "est", "une", "des", "du", "pour", "avec",
           "dans", "je", "ne", "pas", "et", "ou", "quel", "veux"},
    "es": {"el", "los", "como", "qué", "una", "para", "con", "del", "no", "es",
           "por", "cómo", "dónde", "cuál", "quiero"},
    "de": {"der", "die", "das", "wie", "ist", "und", "ein", "eine", "mit", "für",
           "nicht", "was", "den", "auf", "wird", "wo", "welche", "ich"},
}

_WORD_RE = re.compile(r"[a-zA-Zà-ÿ]+", re.UNICODE)


def _detect_query_lang(query: str) -> str:
    """Rileva la lingua della query tra it/en/fr/es/de. Default 'it'."""
    toks = [t.lower() for t in _WORD_RE.findall(query or "")]
    if not toks:
        return "it"
    best_lang, best_hits = "it", 0
    for lang, sw in _LANG_STOPWORDS.items():
        hits = sum(1 for t in toks if t in sw)
        if hits > best_hits:
            best_lang, best_hits = lang, hits
    return best_lang


def _doc_page_slug(rel_path: Optional[str]) -> Optional[tuple]:
    """Per un chunk docs/pages ritorna (slug, locale); None se non e' una doc page.
    `slug` e' il nome file senza .md (language-agnostic), `locale` il codice lingua."""
    if not rel_path:
        return None
    norm = rel_path.replace("\\", "/").lower()
    marker = "/docs/pages/"
    i = norm.find(marker)
    if i < 0 or not norm.endswith(".md"):
        return None
    rest = norm[i + len(marker):]
    parts = rest.split("/")
    if len(parts) >= 2 and parts[0] in _DOC_LOCALE_SEGMENTS:
        return parts[-1][:-3], _DOC_LOCALE_SEGMENTS[parts[0]]
    return parts[-1][:-3], "it"


def _locale_pref(locale: str, query_lang: str) -> int:
    """Ordine di preferenza variante (minore = preferito): lingua query > sorgente IT > altre."""
    if locale == query_lang:
        return 0
    if locale == "it":
        return 1
    return 2


def _dedup_doc_locales(results: List[Dict[str, Any]], query_lang: str) -> List[Dict[str, Any]]:
    """Collassa le varianti cross-locale (e multi-window) della stessa pagina
    docs/pages in un unico risultato, preferendo la variante nella lingua della
    query e mantenendo la posizione del miglior ranking. I risultati non-doc
    passano inalterati, l'ordine e' preservato."""
    out: List[Dict[str, Any]] = []
    slot_by_slug: Dict[str, int] = {}
    for r in results:
        info = _doc_page_slug(r.get("rel_path"))
        if not info:
            out.append(r)
            continue
        slug, locale = info
        if slug not in slot_by_slug:
            slot_by_slug[slug] = len(out)
            out.append(r)
            continue
        idx = slot_by_slug[slug]
        cur_info = _doc_page_slug(out[idx].get("rel_path"))
        cur_locale = cur_info[1] if cur_info else "it"
        # variante migliore (lingua query) -> rimpiazza il contenuto, tiene la posizione
        if _locale_pref(locale, query_lang) < _locale_pref(cur_locale, query_lang):
            out[idx] = r
    return out


# ---------- profilo release: redazione a query-time (difesa in profondita') ----------
# Le regole canoniche vivono in release_redaction.py, condivise col build dell'indice
# release (build_release_chunks.py) cosi' server e indice non possono divergere.
# NB: su un indice release i body non ci sono gia' piu'; questa redazione e' un
# secondo strato che vale anche se il server gira (per errore) sull'indice internal.
import release_redaction as _redact  # noqa: E402


def _snippet_for_display(r: Dict[str, Any], full_text: str, profile: str, max_len: int = 1200) -> Optional[str]:
    """Snippet rispettando il profilo. None => chunk da scartare (deny o firma
    non estraibile). In 'internal' tutto integrale."""
    if profile != "release":
        return full_text[:max_len]
    return _redact.redact_text(r.get("rel_path"), r.get("symbol_type"),
                               r.get("symbol_name"), full_text)


def _apply_release_filter(results: List[Dict[str, Any]], profile: str) -> List[Dict[str, Any]]:
    """Nel profilo release scarta i chunk non mostrabili (deny, o sorgente la cui
    firma non e' estraibile). I 'signature'/'public' restano (redatti in display)."""
    if profile != "release":
        return results
    return [r for r in results if _snippet_for_display(r, _full_text_for(r), profile) is not None]


def _drop_ai_internal(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Risultati NON utili al developer nel chatbot (entrambi i profili):
      - guide AI (skills/, scripts/*.md, playbook) -> istruzioni per l'agente;
      - bundle `.d.ts` in `assets/declarations/` -> dump single-file duplicato
        dell'API gia' coperta dal sorgente .ts della lib (rumore: lo stesso
        symbol esce piu' volte dallo stesso file). Richieste utente 2026-06-01.
    """
    out: List[Dict[str, Any]] = []
    for r in results:
        if _redact.is_ai_internal_guide(r.get("rel_path")):
            continue
        rp = (r.get("rel_path") or "").replace("\\", "/").lower()
        if "/assets/declarations/" in rp:
            continue
        out.append(r)
    return out


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


def _format_sources(results: List[Dict[str, Any]], limit: int, profile: str) -> List[RagSourceOut]:
    out: List[RagSourceOut] = []
    for i, r in enumerate(results[:limit], start=1):
        # In release i 'signature'-class ritornano la sola firma; 'deny' sono gia'
        # stati filtrati a monte (_apply_release_filter), qui difensivamente -> "".
        snippet = (_snippet_for_display(r, _full_text_for(r), profile) or "")[:1200]
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


def _build_llm_context(results: List[Dict[str, Any]], limit: int, profile: str, max_chars_per_chunk: int = 1500) -> str:
    parts: List[str] = []
    for r in results[:limit]:
        rel = r.get("rel_path") or "?"
        sym = r.get("symbol_name") or ""
        header = f"[{rel}::{sym}]" if sym else f"[{rel}]"
        # In release passa all'LLM la sola firma per i sorgenti framework: il
        # modello costruisce l'esempio di chiamata senza vedere il body proprietario.
        body = (_snippet_for_display(r, _full_text_for(r), profile, max_len=max_chars_per_chunk)
                or "")[:max_chars_per_chunk]
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
        profile=RAG_PROFILE,
    )


@app.post("/api/rag/query", response_model=QueryOut)
def query_endpoint(req: QueryIn) -> QueryOut:
    _ensure_loaded()
    q_en = _translate_query(req.query)
    q_lang = _detect_query_lang(req.query)
    prof = _effective_profile(req.profile)
    LOG.info("query: top_k=%d lang=%s profile=%s query=%r", req.top_k, q_lang, prof, req.query[:80])
    # Over-fetch -> dedup cross-locale docs -> filtro release -> slice a top_k.
    results = _dedup_doc_locales(_do_search(q_en, _retrieval_pool(req.top_k, prof)), q_lang)
    results = _drop_ai_internal(results)
    results = _apply_release_filter(results, prof)
    return QueryOut(results=_format_sources(results, req.top_k, prof))


@app.post("/api/rag/chat", response_model=ChatOut)
def chat_endpoint(req: ChatIn) -> ChatOut:
    _ensure_loaded()
    q_en = _translate_query(req.query)
    q_lang = _detect_query_lang(req.query)
    prof = _effective_profile(req.profile)
    LOG.info("chat: top_k=%d model=%s lang=%s profile=%s query=%r", req.top_k, req.model, q_lang, prof, req.query[:80])

    # Over-fetch -> dedup cross-locale docs -> filtro release. Dedup/filtro PRIMA
    # dello slice cosi' i top_k sono pagine distinte e gia' release-safe.
    results = _dedup_doc_locales(_do_search(q_en, _retrieval_pool(req.top_k, prof)), q_lang)
    results = _drop_ai_internal(results)
    results = _apply_release_filter(results, prof)
    sources = _format_sources(results, req.top_k, prof)

    # Fallback se LLM disabilitato
    if not _state.get("llm_enabled"):
        return ChatOut(
            mode="retrieval-only",
            answer=None,
            sources=sources,
            warning="ANTHROPIC_API_KEY not set on the rag server; LLM disabled, returning retrieval results only",
        )

    # Build LLM context dai top-K (non over-fetched, per stare sotto budget token)
    context = _build_llm_context(results, req.top_k, prof)
    system = f"{SYSTEM_PROMPT}\n\nCONTESTO:\n{context}"
    # Inietta il contesto pagina utente (route + tabella + colonne) nel system
    # prompt cosi' l'LLM possa usare i nomi REALI delle colonne (es.
    # `record.CityName.value`) invece di placeholder generici quando l'utente
    # chiede snippet di callback contestuali alla pagina che sta vedendo.
    if req.route_context:
        rc = req.route_context.strip()
        if rc:
            system += (
                "\n\nCONTESTO PAGINA UTENTE (route corrente + metadata colonne):\n"
                f"{rc}\n"
                "Quando generi snippet di callback usa i NOMI REALI delle colonne sopra "
                "(es. `record.<nome>.value` / `record.<nome>.next(...)`). Non inventare "
                "nomi placeholder se nelle colonne sopra esiste un match."
            )

    # Inject context_summary (riassunto turn vecchi) + memory_facts (fatti pinnati
    # dall'LLM via remember_fact). Permettono sessioni lunghe restando entro il
    # budget token, e mantengono "memoria" continuativa di decisioni cross-turn.
    if req.context_summary and req.context_summary.strip():
        system += (
            "\n\nSUMMARY SESSIONE (turn precedenti riassunti):\n"
            f"{req.context_summary.strip()}\n"
            "Usa questo summary come contesto storico ma cita SOLO sources nuovi del retrieval."
        )
    if req.memory_facts and req.memory_facts.strip():
        system += (
            "\n\nMEMORY FACTS (decisioni/preferenze pinnate via remember_fact):\n"
            f"{req.memory_facts.strip()}\n"
            "Rispetta SEMPRE questi fatti. Usa `forget_fact(id)` se l'utente li contraddice "
            "esplicitamente o se sono diventati obsoleti."
        )

    history_payload = [{"role": t.role, "content": t.content} for t in req.history]
    history_payload.append({"role": "user", "content": req.query})

    # Definizione tool che l'LLM puo' chiamare per PROPORRE un'azione applicabile
    # sui metadata. Il rag_server NON esegue niente: serializza la proposta in
    # `proposed_action_json` e la passa al backend C# (che la persiste in
    # `_rag_chat_messages.proposed_action_json`). L'esecuzione vera (INSERT +
    # InvalidateMetadataRuntime) avviene SOLO dopo conferma esplicita dell'utente
    # tramite `POST /api/Rag/ApplyAction`.
    tools_def = [
        {
            "name": "propose_toolbar_action",
            "description": (
                "Propone la creazione di una toolbar action (button sopra la list-grid) "
                "sulla route corrente. Da chiamare SOLO quando l'utente chiede esplicitamente "
                "di 'creare/aggiungere/fare un'azione di toolbar' o equivalente. NON chiamarla "
                "se l'utente vuole solo un esempio di codice. La proposta NON viene applicata: "
                "l'utente vedra' una preview e dovra' confermare. Usa i NOMI REALI delle colonne "
                "dal contesto pagina (se presente). Includi sempre `rationale` in italiano."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {
                        "type": "string",
                        "description": "Route name dove aggiungere l'azione (es. 'cities'). DEVE essere quella del contesto pagina se presente."
                    },
                    "label": {
                        "type": "string",
                        "description": "Etichetta visibile del button (it). Es. 'Genera PDF', 'Marca pagate'."
                    },
                    "icon": {
                        "type": "string",
                        "description": "Classe PrimeIcons. Es. 'pi pi-file-pdf', 'pi pi-check', 'pi pi-send'."
                    },
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "SOLO IL BODY del callback (NON una function declaration o arrow function). "
                            "Le variabili `datasource`, `metaInfo`, `record`, `event`, `wtoolbox` "
                            "sono GIA' nello scope al runtime perche' il framework wrappa il body in "
                            "una funzione anonima `async (datasource, metaInfo, record, event, wtoolbox) "
                            "=> { <BODY> }`. Quindi NON scrivere `async function (...) { ... }` ne "
                            "`(datasource, ...) => { ... }`: scrivi DIRETTAMENTE le statement.\n\n"
                            "Esempio CORRETTO (body-only):\n"
                            "  const selected = (datasource.getSelectedRows && datasource.getSelectedRows()) || [];\n"
                            "  if (!selected.length) { wtoolbox.messageNotificationService.add({severity:'warn',summary:'Selezione vuota',detail:'Seleziona almeno una riga'}); return; }\n"
                            "  const ids = selected.map(r => Number(r.id?.value ?? r.id));\n"
                            "  const resp = await fetch('/api/feature/bulk-action', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ids})});\n"
                            "  const j = await resp.json();\n"
                            "  wtoolbox.messageNotificationService.add(j.ok ? {severity:'success',summary:'OK',detail:`${j.updated||ids.length} aggiornati`} : {severity:'error',summary:'Errore',detail:j.error||'unknown'});\n"
                            "  if (j.ok && datasource.fetchData) await datasource.fetchData();\n\n"
                            "Esempio SBAGLIATO (NON fare): `async function (datasource, metaInfo, record, event, wtoolbox) { const selected = ... }`.\n\n"
                            "Per le API disponibili su `wtoolbox` (`confirm`, `messageNotificationService`, "
                            "`isBusy`, `http`, `dialogService`, ecc.) usa ESCLUSIVAMENTE quelle che trovi nei "
                            "sources/docs del contesto fornito (in particolare la pagina `wtoolbox-api.md`). "
                            "NON inventare API: se ti serve una capability che non e' nel contesto, "
                            "scegli un approccio alternativo o segnalalo nel `rationale`."
                        )
                    },
                    "rationale": {
                        "type": "string",
                        "description": "1-2 frasi in italiano che spiegano cosa fa l'azione (mostrata all'utente come summary)."
                    }
                },
                "required": ["route", "label", "callback_js", "rationale"]
            }
        },
        # ---------------- Memory tools ----------------
        # `remember_fact` permette all'LLM di pinnare un "fatto high-priority"
        # della sessione (preferenze utente, decisioni architetturali, vincoli
        # tecnici scoperti) che persistera' cross-turn nel system prompt.
        # `forget_fact` rimuove un fact diventato obsoleto.
        {
            "name": "remember_fact",
            "description": (
                "Pinna un fatto importante della sessione che vuoi ricordare nei turn successivi. "
                "Da usare per: preferenze esplicite utente ('preferisco TS strict'), decisioni "
                "architetturali ('useremo endpoint /api/cities/bulk-archive per il bulk delete'), "
                "vincoli tecnici scoperti ('il backend richiede X-CSRF header'), stato di un task "
                "in costruzione ('stiamo definendo step 2/3 del workflow X'). "
                "NON usare per: codice gia' nella history (e' gia' visibile), chiarimenti gia' dati, "
                "errori gia' risolti, dettagli effimeri. Limiti: max 20 fact attivi, ognuno <=200 char."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "fact": {
                        "type": "string",
                        "description": "Il fatto da ricordare (italiano, conciso, <=200 char). Sii specifico e actionable: 'la route X usa endpoint Y' meglio di 'parliamo di route X'."
                    }
                },
                "required": ["fact"]
            }
        },
        {
            "name": "forget_fact",
            "description": (
                "Rimuove un fact precedentemente pinnato che non e' piu' rilevante. Usa quando: "
                "(1) l'utente contraddice esplicitamente il fact ('no, in realta' uso PG, non MSSQL'), "
                "(2) il task associato e' completato e il fact non serve piu', "
                "(3) sono stati aggiunti fact aggiornati che lo superseguono. "
                "L'`id` lo trovi nella sezione MEMORY FACTS del system prompt."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer",
                        "description": "ID numerico del fact da rimuovere."
                    }
                },
                "required": ["id"]
            }
        },
        # ---------------- Follow-up suggestions ----------------
        {
            "name": "suggest_followups",
            "description": (
                "Suggerisce 1-3 follow-up question contestuali alla risposta appena data, "
                "rese all'utente come chip cliccabili che popolano l'input. Da CHIAMARE QUASI SEMPRE "
                "a fine response (a meno che la domanda non chiuda gia' un thread). Esempi di buone "
                "follow-up: alternative ('come faresti lo stesso con una row action?'), "
                "approfondimenti ('come gestisco l'errore di rete?'), edge case ('cosa se la "
                "selezione e' vuota?'). Cattive follow-up: meta-domande ('ti e' chiaro?'), "
                "domande generiche non legate alla risposta corrente."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": 3,
                        "items": {
                            "type": "string",
                            "description": "Una follow-up question (italiano, <=80 char, terminale '?')."
                        }
                    }
                },
                "required": ["questions"]
            }
        }
    ]

    context_window_max = _model_context_window(req.model)
    context_used: Optional[int] = None

    try:
        import anthropic  # noqa: WPS433

        client = anthropic.Anthropic(api_key=_state["anthropic_api_key"])

        # Pre-check token: se la prossima call supererebbe il 95% del context
        # window, ritorna SUBITO un errore strutturato senza chiamare l'API
        # (eviterebbe HTTP 400 dall'upstream + ci permette di guidare l'utente
        # verso /compact). 95% e' la soglia hard: il client warna gia' a 80-90%.
        # 5% di margine perche' count_tokens non include `max_tokens` di output
        # ne' eventual tools_def overhead (lo Anthropic sa, ma vogliamo essere
        # conservativi).
        count = _safe_count_tokens(client, req.model, system, history_payload, tools=tools_def)
        if count is not None:
            context_used = count
            usage_ratio = count / max(1, context_window_max)
            if usage_ratio > 0.95:
                LOG.warning("context-overflow: %d tokens > 95%% of %d", count, context_window_max)
                return ChatOut(
                    mode="retrieval-only",
                    answer=None,
                    sources=sources,
                    warning="context-overflow",
                    model=req.model,
                    context_window_max=context_window_max,
                    context_used=count,
                )

        msg = client.messages.create(
            model=req.model,
            max_tokens=2048,
            system=system,
            messages=history_payload,
            tools=tools_def,
        )
    except Exception as exc:  # noqa: BLE001
        LOG.error("anthropic call failed: %s", exc)
        # Heuristica errore Anthropic: se il messaggio menziona "prompt is too long"
        # o "too many tokens", ritorna come context-overflow strutturato (l'utente
        # vedra' il dialog /compact al posto del toast generico).
        exc_str = str(exc).lower()
        is_overflow = "prompt is too long" in exc_str or "tokens >" in exc_str or "context window" in exc_str
        return ChatOut(
            mode="retrieval-only",
            answer=None,
            sources=sources,
            warning="context-overflow" if is_overflow else f"Anthropic call failed ({type(exc).__name__}); degraded to retrieval-only",
            model=req.model,
            context_window_max=context_window_max,
            context_used=context_used,
        )

    # Estrai text + tool_use multipli. L'LLM puo' emettere N tool_use nella stessa
    # response (es. testo + propose_toolbar_action + remember_fact + suggest_followups).
    # Aggreghiamo per tool_name:
    #   - propose_toolbar_action: una sola (la prima vince)
    #   - remember_fact / forget_fact: TUTTE (accumulate in proposed_memory_changes)
    #   - suggest_followups: una sola (la prima vince, lista di question)
    answer_text = ""
    proposed_action_json: Optional[str] = None
    proposed_memory_changes: List[Dict[str, Any]] = []
    followup_questions: Optional[List[str]] = None

    if getattr(msg, "content", None):
        for block in msg.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                answer_text += getattr(block, "text", "")
                continue
            if btype != "tool_use":
                continue
            tool_name = getattr(block, "name", "") or ""
            tool_input = getattr(block, "input", {}) or {}
            if not isinstance(tool_input, dict):
                continue

            if tool_name == "propose_toolbar_action" and proposed_action_json is None:
                # Post-processing difensivo: il framework salva i callback come
                # BODY-ONLY; se l'LLM produce comunque una function wrapper, lo
                # unwrappa qui prima di salvare. (Vedi `_unwrap_callback_body`.)
                cbk = tool_input.get("callback_js")
                if isinstance(cbk, str) and cbk.strip():
                    tool_input["callback_js"] = _unwrap_callback_body(cbk)
                try:
                    proposed_action_json = json.dumps({"kind": "toolbar_action", **tool_input}, ensure_ascii=False)
                    LOG.info("LLM tool_use: propose_toolbar_action")
                except Exception as exc:  # noqa: BLE001
                    LOG.warning("tool_use serialization failed: %s", exc)

            elif tool_name == "remember_fact":
                fact = (tool_input.get("fact") or "").strip()
                if fact:
                    # Trim difensivo a 200 char (lo schema dice <=200 ma l'LLM puo' eccedere)
                    proposed_memory_changes.append({"op": "add", "fact": fact[:200]})
                    LOG.info("LLM tool_use: remember_fact (%d chars)", len(fact))

            elif tool_name == "forget_fact":
                fact_id = tool_input.get("id")
                if isinstance(fact_id, int) and fact_id > 0:
                    proposed_memory_changes.append({"op": "remove", "id": fact_id})
                    LOG.info("LLM tool_use: forget_fact id=%d", fact_id)

            elif tool_name == "suggest_followups" and followup_questions is None:
                questions = tool_input.get("questions") or []
                if isinstance(questions, list):
                    # Sanitizza: stringhe, trim, <=80 char, max 3.
                    cleaned = [str(q).strip()[:80] for q in questions if str(q).strip()][:3]
                    if cleaned:
                        followup_questions = cleaned
                        LOG.info("LLM tool_use: suggest_followups (%d question)", len(cleaned))

    # Token usage: preferisci il count REALE dell'API (usage.input_tokens) come
    # ground truth; fallback al pre-check count se assente. context_used e' utile
    # al client per aggiornare il cerchio visuale.
    real_tokens_in = getattr(getattr(msg, "usage", None), "input_tokens", None)
    return ChatOut(
        mode="rag-llm",
        answer=answer_text,
        sources=sources,
        model=req.model,
        tokens_in=real_tokens_in,
        tokens_out=getattr(getattr(msg, "usage", None), "output_tokens", None),
        proposed_action_json=proposed_action_json,
        proposed_memory_changes=proposed_memory_changes or None,
        followup_questions=followup_questions,
        context_window_max=context_window_max,
        context_used=real_tokens_in if real_tokens_in is not None else context_used,
    )


@app.post("/api/rag/compact", response_model=CompactOut)
def compact_post(req: CompactIn) -> CompactOut:
    """Produce un summary della conversazione (vedi COMPACT_SYSTEM_PROMPT).
    Chiamato dal backend C# quando l'utente preme /compact o quando il context
    e' >90% via il visual cue. Il backend persiste il summary risultante in
    `_rag_chat_sessions.context_summary` + `summary_up_to_message_id`.

    Best-effort: se la chiamata Anthropic fallisce ritorniamo un summary vuoto
    + warning - il backend in tal caso NON persistera' nulla e segnalera' al client.
    """
    if not _state.get("llm_enabled"):
        return CompactOut(summary="", warning="llm-disabled")

    # Costruisci il prompt: history + eventuale previous_summary per compact incrementale.
    msgs = [{"role": t.role, "content": t.content} for t in req.history]
    if not msgs:
        return CompactOut(summary="", warning="empty-history")

    system = COMPACT_SYSTEM_PROMPT
    if req.previous_summary and req.previous_summary.strip():
        system += (
            "\n\nRIASSUNTO PRECEDENTE (i turn sopra sono successivi a questo summary; "
            "merge-a entrambi mantenendo la coerenza cronologica):\n"
            f"{req.previous_summary.strip()}"
        )
    # Forza all'LLM una chiusura esplicita perche' i `tool_use` non vanno qui.
    instruction_turn = {"role": "user", "content": "Produci ora il riassunto della conversazione qui sopra, seguendo le regole del system prompt."}
    msgs.append(instruction_turn)

    try:
        import anthropic  # noqa: WPS433
        client = anthropic.Anthropic(api_key=_state["anthropic_api_key"])
        msg = client.messages.create(
            model=req.model,
            max_tokens=5000,
            system=system,
            messages=msgs,
        )
    except Exception as exc:  # noqa: BLE001
        LOG.error("compact call failed: %s", exc)
        return CompactOut(summary="", warning=f"Anthropic call failed: {type(exc).__name__}")

    summary_text = ""
    if getattr(msg, "content", None):
        for block in msg.content:
            if getattr(block, "type", None) == "text":
                summary_text += getattr(block, "text", "")
    return CompactOut(
        summary=summary_text.strip(),
        tokens_in=getattr(getattr(msg, "usage", None), "input_tokens", None),
        tokens_out=getattr(getattr(msg, "usage", None), "output_tokens", None),
    )


class SetApiKeyIn(BaseModel):
    api_key: str = Field(..., alias="apiKey", min_length=10, max_length=500)
    model_config = {"populate_by_name": True}


@app.post("/admin/set-api-key")
def admin_set_api_key(req: SetApiKeyIn) -> Dict[str, Any]:
    """Aggiorna a runtime la chiave API Anthropic usata per /chat. Chiamato dal
    backend C# all'avvio e quando l'AppSettings cambia. Localhost-only (il rag_server
    bind-a 127.0.0.1 — nessun altro processo puo' chiamarlo).
    Niente log della chiave stessa: solo prefisso a fini diagnostici."""
    key = (req.api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="empty api_key")
    _state["anthropic_api_key"] = key
    _state["llm_enabled"] = True
    LOG.info("Anthropic API key updated via admin endpoint (prefix=%s..., llm_enabled=True)", key[:10])
    return {"ok": True, "llm_enabled": True}


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
