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


def _strip_xml_tag_residue(value: str) -> str:
    """Sanitizza i campi string del tool_input rimuovendo residui di markup
    XML che Claude (raramente) emette dentro un value scalare.

    Sintomo reale osservato: rationale = "Aggiunge una grid ... per
    visualizzarli in tabella.</anionale> </invoke>"
      - `</anionale>` = `</rationale>` storpiato (manca 'r')
      - `</invoke>`  = chiusura tag tool_use Anthropic-style

    Questi tag fanno parte del MARKUP del tool_use (che e' parsato dal SDK
    e mai esposto alla logica utente), ma il modello a volte li "leaka"
    DENTRO il valore stringa. Probabile causa: training data dove tool
    descriptions / examples mostravano l'XML inline.

    Strategy: rimuovere TUTTI i tag XML-like al di fuori di marker di
    codice. Conservativo: per i campi che potrebbero LEGITTIMAMENTE
    contenere HTML/markup (es. `template_html`, `callback_js`,
    `condition_js`) NON applichiamo questa sanitizzazione - il chiamante
    deve passare solo i campi natural-language (rationale, label,
    description).
    """
    if not isinstance(value, str) or not value:
        return value
    import re
    # Rimuovi tag XML-like (es. </rationale>, </anionale>, </invoke>,
    # <thinking>, <answer>, ecc.) sia opening che closing, sia
    # self-closing. Pattern conservativo: matcha solo tag con nome che
    # sembra un identifier (non interferisce con < e > usati in confronti
    # o operatori che potrebbero comparire in testo tecnico, perche'
    # quelli non hanno la forma `<word...>`).
    cleaned = re.sub(r"</?[A-Za-z_][A-Za-z0-9_:.-]*(\s+[^>]*)?/?>", "", value)
    return cleaned.strip()


# Campi natural-language che vanno sanitizzati prima di serializzare
# `proposed_action_json`. NON includere `callback_js`, `condition_js`,
# `template_html` (markup/code legittimo).
_SANITIZE_TEXT_FIELDS = ("rationale", "label", "description")


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
                "REGOLE per gli snippet di callback:\n"
                "1. Usa SEMPRE i NOMI REALI delle colonne sopra (es. `record.<nome>.value` "
                "/ `record.<nome>.next(...)`). Non inventare nomi placeholder se nelle "
                "colonne sopra esiste un match.\n"
                "2. Per i tool `propose_*` (toolbar_action, row_action, table_style, "
                "column_style, display_formula, form_title_formula, default_value_callback, "
                "custom_validation, selection_changed, lifecycle_callback): se l'utente NON "
                "menziona esplicitamente una route diversa, il parametro `route` DEVE essere "
                "quello sopra (la pagina corrente). Non chiedere conferma, non chiedere "
                "all'utente quale route usare se e' gia' implicito dal contesto.\n"
                "3. Per i tool che richiedono `column_name` (display_formula, "
                "default_value_callback, custom_validation, selection_changed, column_style): "
                "se l'utente descrive la colonna semanticamente (es. 'la colonna popolazione', "
                "'il campo nome citta'), scegli il `mc_nome_colonna` REALE corrispondente "
                "dalle colonne sopra. Se non c'e' un match chiaro, allora (e solo allora) "
                "chiedi all'utente di specificare quale colonna."
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
                    },
                    "requires_multi_selection": {
                        "type": "boolean",
                        "description": (
                            "TRUE quando l'azione opera sulla SELEZIONE corrente di righe — "
                            "cioe' il callback_js legge `datasource.getSelectedRows()` o equivalente, "
                            "tipicamente per bulk delete / bulk archive / bulk export / bulk update. "
                            "FALSE per azioni che non leggono la selezione (es. apri dialog di import, "
                            "naviga a un'altra route, genera report di tutta la tabella). "
                            "Quando TRUE il backend abilita automaticamente `md_multiple_selection` "
                            "sulla route se non gia' attivo (le checkbox di selezione riga compaiono "
                            "in UI). Omettere significa FALSE."
                        )
                    }
                },
                "required": ["route", "label", "callback_js", "rationale"]
            }
        },
        # ---------------- Row action ----------------
        {
            "name": "propose_row_action",
            "description": (
                "Propone una row-level action (un button nel menu dropdown di riga) sulla "
                "route corrente. Da chiamare quando l'utente chiede 'aggiungi un'azione su "
                "ogni riga' o equivalenti (es. 'tasto Genera PDF per ogni record'). Il "
                "framework la persiste come colonna nuova in `_metadati__colonne` di tipo "
                "button (`mc_voa_class=6`). La callback riceve la signature "
                "`(datasource, record, event, field, wtoolbox)` - NB la differenza con "
                "toolbar action: qui c'e' `record` (la riga corrente) al posto di `metaInfo`. "
                "NON chiamarla se l'azione lavora sulla SELEZIONE multipla (usa propose_toolbar_action)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string", "description": "Route name dove aggiungere la row action."},
                    "label": {"type": "string", "description": "Etichetta del button (es. 'Genera PDF')."},
                    "icon": {"type": "string", "description": "Classe PrimeIcons (default 'pi pi-bolt')."},
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "SOLO BODY del callback (NO function declaration). Scope: "
                            "`datasource`, `record`, `event`, `field`, `wtoolbox`. "
                            "`record` e' un oggetto `{colName: {value: ..., display: ...}}` "
                            "della riga; usa `record.id?.value` per l'id. Esempio:\n"
                            "  const id = record.id?.value ?? record.id;\n"
                            "  const resp = await fetch(`/api/cities/pdf/${id}`, {credentials:'include'});\n"
                            "  wtoolbox.messageNotificationService.add({severity: resp.ok?'success':'error', summary: resp.ok?'PDF generato':'Errore'});"
                        )
                    },
                    "column_name": {
                        "type": "string",
                        "description": "Opzionale. Nome interno della colonna metadata (snake_case). Se omesso, derivato dal label."
                    },
                    "confirm_message": {
                        "type": "string",
                        "description": "Opzionale. Se valorizzato, prima di eseguire il callback il framework mostra confirm dialog con questo messaggio."
                    },
                    "rationale": {"type": "string", "description": "1-2 frasi in italiano che spiegano cosa fa l'azione."}
                },
                "required": ["route", "label", "callback_js", "rationale"]
            }
        },
        # ---------------- Table style ----------------
        {
            "name": "propose_table_style",
            "description": (
                "Propone una regola di stile condizionale sulle righe della list-grid. "
                "Da chiamare quando l'utente chiede 'colora di rosso le righe con X', "
                "'evidenzia i record scaduti', 'metti grassetto se Y' o simili. Il "
                "framework la persiste in `_metadati__u_i__stili__tabelle`: "
                "`must_attribute_name` = classe CSS da applicare alla `<tr>` quando la "
                "condizione e' vera, `must_attribute_value` = callback JS che ritorna "
                "true/false leggendo i campi della riga. Le classi CSS predefinite "
                "(`row-danger`, `row-warning`, `row-info`, `row-success`) sono gia' "
                "stilizzate dal framework. Per classi custom va aggiunto CSS lato app."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string", "description": "Route name della list-grid."},
                    "css_class": {
                        "type": "string",
                        "description": "Classe CSS applicata alla riga quando condition_js ritorna true. Preferire `row-danger`/`row-warning`/`row-info`/`row-success` se possibile."
                    },
                    "condition_js": {
                        "type": "string",
                        "description": (
                            "Callback JS che ritorna `true`/`false`. Scope: la variabile `record` "
                            "(stesso shape della row_action). Esempio - 'evidenzia righe con popolazione < 1000':\n"
                            "  return Number(record.population?.value ?? 0) < 1000;\n"
                            "Body-only, sara' wrappato dal framework."
                        )
                    },
                    "rationale": {"type": "string", "description": "1-2 frasi in italiano che spiegano cosa fa la regola."}
                },
                "required": ["route", "css_class", "condition_js", "rationale"]
            }
        },
        # ---------------- Display formula (column) ----------------
        # NB: il framework NON supporta JS body-only sul render delle celle.
        # Il pattern reale e' un TEMPLATE ANGULAR MARKUP (HTML + interpolation
        # + pipe) scritto nel campo `_metadati__colonne.mc_ui_grid_column_data_template`,
        # processato da `list-grid.component.ts:buildGridColumnTemplateSwitchCases`.
        # I campi `mccomputedclientformula` / `mc_display_string_in_view` erano
        # storicamente documentati ma sono dead/wrong (verificato 2026-06-03).
        {
            "name": "propose_display_formula",
            "description": (
                "Propone un TEMPLATE ANGULAR MARKUP che produce il valore MOSTRATO in "
                "cella per una colonna esistente (NON il valore in DB - solo presentazione). "
                "Tipici casi: 'concatena nome + cognome', 'mostra popolazione in formato "
                "12.5k', 'formatta data come dd/MM/yyyy', 'badge testuale per uno stato', "
                "'icona condizionale'. Campo SQL: `_metadati__colonne.mc_ui_grid_column_data_template`. "
                "NB: il framework NON supporta JS body-only sulla cella, va usata la "
                "sintassi Angular template (markup HTML + interpolation `{{}}` + pipe "
                "standard come number/date/currency + ternario inline)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string", "description": "Route name della tabella."},
                    "column_name": {"type": "string", "description": "Nome SQL reale della colonna (`_metadati__colonne.mc_nome_colonna`)."},
                    "template_html": {
                        "type": "string",
                        "description": (
                            "Template Angular markup. DEVE contenere `<` o `{{`. Scope: "
                            "`rowData` (oggetto riga con accesso diretto ai campi - es. "
                            "`rowData.first_name`, NO BehaviorSubject). Sintassi supportata:\n"
                            " 1. Interpolation: `{{ rowData.col }}` o `{{ rowData.a + ' ' + rowData.b }}`\n"
                            " 2. Pipe standard Angular: `number:'1.1-1'`, `date:'dd/MM/yyyy'`, `currency:'EUR'`, `percent:'1.0-2'`, `uppercase`, `lowercase`, `slice:0:10`\n"
                            " 3. Ternario inline: `{{ rowData.x > 100 ? 'alto' : 'basso' }}`\n"
                            " 4. `*ngIf` block: `<ng-container *ngIf=\"rowData.x > 0\">{{ rowData.x }}</ng-container>`\n"
                            " 5. Tag HTML: `<span class='badge'>`, `<i class='pi pi-check'>`, ecc.\n"
                            "ESEMPI CANONICI:\n"
                            "  // popolazione formato k/M\n"
                            "  <span>{{ rowData.population >= 1000000 ? (rowData.population / 1000000 | number:'1.1-1') + 'M' : rowData.population >= 1000 ? (rowData.population / 1000 | number:'1.1-1') + 'k' : rowData.population }}</span>\n"
                            "  // concatena nome cognome\n"
                            "  <span>{{ rowData.first_name }} {{ rowData.last_name }}</span>\n"
                            "  // data formattata\n"
                            "  <span>{{ rowData.created_at | date:'dd/MM/yyyy' }}</span>\n"
                            "  // badge stato\n"
                            "  <span class='badge'>{{ rowData.stato === 0 ? 'Bozza' : rowData.stato === 1 ? 'Confermato' : 'Annullato' }}</span>\n"
                            "  // valuta\n"
                            "  <span>{{ rowData.totale | currency:'EUR':'symbol':'1.2-2' }}</span>\n"
                            "NON usare `record.X.value` ne' `BehaviorSubject` - quello scope vale per i tool callback (toolbar/row/lifecycle), NON per il display template."
                        )
                    },
                    "rationale": {"type": "string", "description": "1-2 frasi italiano."}
                },
                "required": ["route", "column_name", "template_html", "rationale"]
            }
        },
        # ---------------- Form title formula (table-level) ----------------
        {
            "name": "propose_form_title_formula",
            "description": (
                "Propone una formula JS che produce il TITOLO del form di edit (header del "
                "popup/pagina di modifica record). Sezione 1 docs callback. Da chiamare "
                "quando l'utente chiede 'mostra il nome della citta' nel titolo invece di "
                "''Modifica''' o 'voglio vedere id + descrizione nell'header'. "
                "Campo SQL: `_metadati__tabelle.mddisplayformula`."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string", "description": "Route name della tabella."},
                    "formula_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS che ritorna `string`. Scope: `metaInfo`, `record`, "
                            "`datasource`, `wtoolbox`. Esempi:\n"
                            "  return `Modifica ${record.nome?.value ?? '(nuovo)'}`;\n"
                            "  return record.id?.value ? `Citta' #${record.id.value} - ${record.nome.value}` : 'Nuova citta';"
                        )
                    },
                    "rationale": {"type": "string", "description": "1-2 frasi italiano."}
                },
                "required": ["route", "formula_js", "rationale"]
            }
        },
        # ---------------- Default value callback (column) ----------------
        {
            "name": "propose_default_value_callback",
            "description": (
                "Propone un callback JS che imposta il VALORE DI DEFAULT di una colonna in "
                "inserimento (record nuovo) SCRIVENDOLO nel record "
                "(`record[field.mc_nome_colonna]=...`; il return e' ignorato dal framework). "
                "Sezione 3 docs callback. Da chiamare quando "
                "l'utente chiede 'precompila la data con oggi', 'metti come default "
                "l'utente corrente', 'valore iniziale uguale al campo X'. Campo SQL: "
                "`_metadati__colonne.mcdefaultvaluecallback`."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string"},
                    "column_name": {"type": "string", "description": "Nome SQL della colonna che riceve il default."},
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS che imposta il valore di default. Scope (param reali con cui il "
                            "framework compila il callback): `record` (il NUOVO record in costruzione, plain "
                            "object), `field` (MetadatiColonna della colonna target), `metaInfo`, `wtoolbox`. "
                            "IMPORTANTE: il framework IGNORA il valore di `return` "
                            "(DataSourceComponent.addNewRecord scarta il ritorno). Il callback DEVE SCRIVERE "
                            "il valore dentro il record: `record[field.mc_nome_colonna] = <valore>;`. "
                            "ESEMPI CANONICI:\n"
                            "  record[field.mc_nome_colonna] = new Date().toISOString().slice(0, 10);  // data odierna ISO\n"
                            "  record[field.mc_nome_colonna] = wtoolbox.userInfoService.getuserInfo().user_id;  // utente corrente\n"
                            "  record[field.mc_nome_colonna] = 'Lat: 0.0 - Long: 0.0';  // valore fisso\n"
                            "  record[field.mc_nome_colonna] = record['altro_campo'] ?? 0;  // derivato da altro campo\n"
                            "NB: per l'utente corrente usa SEMPRE UserInfoService, MAI cookie/localStorage. NON usare `return`."
                        )
                    },
                    "rationale": {"type": "string"}
                },
                "required": ["route", "column_name", "callback_js", "rationale"]
            }
        },
        # ---------------- Custom validation (column) ----------------
        {
            "name": "propose_custom_validation",
            "description": (
                "Propone una validazione custom che blocca il salvataggio se la condizione "
                "non e' rispettata. Sezione 4 docs callback. Da chiamare quando l'utente "
                "chiede 'campo obbligatorio se Y e' valorizzato', 'non puo' essere negativo', "
                "'lunghezza minima 5', regole cross-field. Campo SQL: "
                "`_metadati__colonne.mc_validation_custom_callback`."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string"},
                    "column_name": {"type": "string", "description": "Colonna sotto validazione."},
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS (puo' essere async). Scope (param reali con cui il framework "
                            "compila il callback via new AsyncFunction('record, field, vr, wtoolbox', ...)): "
                            "`record` (la riga, valori wrappati in BehaviorSubject -> leggi con "
                            "`record[field.mc_nome_colonna].value` o `record['altraColonna'].value`), "
                            "`field` (MetadatiColonna della colonna validata), "
                            "`vr` (ValidationRule: setta `vr.message='...'` per il messaggio d'errore), `wtoolbox`. "
                            "DEVE RITORNARE un boolean: `return true` se valido, `return false` per BLOCCARE il "
                            "salvataggio. NON esistono `valore` ne `validateResult` nello scope: NON usarli.\n"
                            "Esempi:\n"
                            "  if (Number(record[field.mc_nome_colonna].value) < 0) { vr.message = 'Non puo essere negativo'; return false; } return true;\n"
                            "  const a = record['CampoA'].value, b = record['CampoB'].value; if (a && !b) { vr.message = 'CampoB obbligatorio'; return false; } return true;\n"
                            "  return String(record[field.mc_nome_colonna].value || '').length >= 5;  // lunghezza minima 5"
                        )
                    },
                    "rationale": {"type": "string"}
                },
                "required": ["route", "column_name", "callback_js", "rationale"]
            }
        },
        # ---------------- Selection changed (lookup/select column) ----------------
        {
            "name": "propose_selection_changed",
            "description": (
                "Propone un callback che scatta al CAMBIO DI SELEZIONE di un lookup/select, "
                "per ricalcolare/precompilare altri campi del record. Sezione 5 docs callback. "
                "Da chiamare quando l'utente dice 'quando seleziona il cliente, riempi P.IVA "
                "e listino', 'al cambio del prodotto aggiorna prezzo unitario'. Campo SQL: "
                "`_metadati__colonne.mcslctionchangedcustomfunction`."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string"},
                    "column_name": {"type": "string", "description": "Colonna lookup/select che scatena l'evento."},
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS. Scope: `record`, `value`, `datasource`, `wtoolbox`. "
                            "L'oggetto lookup risolto e' in `record.<col>__lookup_obj.value`. "
                            "Esempio (al cambio cliente, copia P.IVA e listino):\n"
                            "  const cliente = record.cliente__lookup_obj?.value;\n"
                            "  if (cliente) {\n"
                            "    record.partita_iva.next(cliente.partita_iva ?? '');\n"
                            "    record.listino_id.next(cliente.listino_id ?? null);\n"
                            "  }"
                        )
                    },
                    "rationale": {"type": "string"}
                },
                "required": ["route", "column_name", "callback_js", "rationale"]
            }
        },
        # ---------------- Column style (cella condizionale) ----------------
        {
            "name": "propose_column_style",
            "description": (
                "Variant di `propose_table_style` ma per la SINGOLA CELLA di una colonna, "
                "non per l'intera riga. Sezione 8 docs callback. Da chiamare quando l'utente "
                "chiede 'colora di rosso SOLO la cella popolazione quando < 1000' (non tutta "
                "la riga). Campo SQL: `_metadati__u_i__stili__colonne` con "
                "`musc_attribute_name` (classe CSS) + `musc_attribute_value` (condizione JS)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string"},
                    "column_name": {"type": "string", "description": "Colonna a cui applicare lo stile cella."},
                    "css_class": {"type": "string", "description": "Classe CSS (preferire `cell-danger`/`cell-warning`/`cell-info`/`cell-success` se disponibili)."},
                    "condition_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS che ritorna `boolean`. Scope: `record`. Esempio:\n"
                            "  return Number(record.population?.value ?? 0) < 1000;"
                        )
                    },
                    "rationale": {"type": "string"}
                },
                "required": ["route", "column_name", "css_class", "condition_js", "rationale"]
            }
        },
        # ---------------- Lifecycle callback (table-level) ----------------
        {
            "name": "propose_lifecycle_callback",
            "description": (
                "Propone un callback che scatta su uno dei LIFECYCLE EVENTS del record: "
                "`before_save` (prima del salvataggio - normalizza/uppercase/timestamp), "
                "`after_save` (post-salvataggio - logging/refresh), `after_load` (post-load - "
                "calcola campi derivati). Sezione 9 docs callback. Da chiamare quando l'utente "
                "chiede 'maiuscolo automatico al save', 'calcola totale dopo il caricamento', "
                "'normalizza prima di salvare'. Campi SQL: `_metadati__tabelle.mdbeforesave` / "
                "`mdaftersave` / `mdafterload`."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string"},
                    "event": {
                        "type": "string",
                        "enum": ["before_save", "after_save", "after_load"],
                        "description": "Lifecycle event a cui agganciare il callback."
                    },
                    "callback_js": {
                        "type": "string",
                        "description": (
                            "Body-only JS. Scope: `record`, `datasource`, `wtoolbox`. "
                            "Il record e' reattivo: `record.<col>.value` per leggere, "
                            "`record.<col>.next(v)` per scrivere. Esempi:\n"
                            "  // before_save: uppercase su codice\n"
                            "  record.codice.next((record.codice.value || '').toUpperCase());\n"
                            "  // after_load: calcola totale derivato\n"
                            "  const tot = Number(record.imponibile.value ?? 0) + Number(record.iva.value ?? 0);\n"
                            "  record.totale.next(tot);"
                        )
                    },
                    "rationale": {"type": "string"}
                },
                "required": ["route", "event", "callback_js", "rationale"]
            }
        },
        # ---------------- Simple metadata update (generic) ----------------
        # Tool generico per modifiche "scalari" di un singolo campo metadata
        # (label header, flag boolean, page size, ecc.). Copre ~29 campi semplici
        # via mappa friendly-label -> SQL field server-side (whitelist). NON
        # adatto per callback JS / template Angular (per quelli usa i tool dedicati).
        {
            "name": "propose_simple_metadata_update",
            "description": (
                "Aggiorna un SINGOLO campo metadata semplice (string/int/bool) su una colonna "
                "o sulla tabella corrente. Esempi tipici: 'cambia il titolo della colonna X', "
                "'nascondi la colonna Y in lista', 'rendi obbligatorio il campo Z', "
                "'imposta pagesize della tabella a 50', 'disabilita il sort sulla colonna W'. "
                "Da chiamare quando l'utente chiede tweak rapidi alla metadata che NON richiedono "
                "JS body / template Angular. La modifica e' atomica su un solo field; per modifiche "
                "multiple, emetti tool_use multipli (il backend processa solo il primo per turn — "
                "informa l'utente che gli altri vanno fatti uno alla volta)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {"type": "string", "description": "Route name della tabella."},
                    "target": {
                        "type": "string",
                        "enum": ["column", "table"],
                        "description": "Su cosa agisce: 'column' = singola colonna (richiede column_name), 'table' = la tabella stessa."
                    },
                    "column_name": {
                        "type": "string",
                        "description": "Nome SQL reale della colonna (mc_nome_colonna). OBBLIGATORIO se target='column'."
                    },
                    "field_label": {
                        "type": "string",
                        "description": (
                            "Identificatore semantico del campo da modificare (whitelist). "
                            "Per target='column': "
                            "header_label (string - titolo header lista), "
                            "header_label_edit (string - titolo label form edit), "
                            "hide_in_list (bool), hide_in_edit (bool), hide_in_export (bool), "
                            "is_required (bool - validation), max_length (int), "
                            "disable_sorting (bool), width_px (int), order (int - mc_ordine), "
                            "tooltip (string), default_value (string - valore default come stringa, NON callback). "
                            "Per target='table': "
                            "display_string (string - titolo pagina), long_description (string), "
                            "pagesize (int), editable (bool), insertable (bool), deletable (bool), "
                            "pageable (bool), sortable (bool), scrollable (bool), groupable (bool), "
                            "edit_popup (bool - edit in dialog vs inline), inline_edit (bool), "
                            "multiple_selection (bool - checkbox selezione riga), "
                            "default_filter (string - filtro SQL/JSON default), "
                            "header_rows_edit (bool), props_bag (string JSON - bag opzioni avanzate)."
                        )
                    },
                    "value": {
                        "description": (
                            "Valore da scrivere. Tipo conforme al field_label scelto: "
                            "string per *_label/description/tooltip/default_*/string_*/filter/props_bag, "
                            "int per pagesize/max_length/width_px/order, "
                            "bool (true/false) per hide_*/is_required/disable_*/editable/insertable/deletable/"
                            "pageable/sortable/scrollable/groupable/*_popup/inline_edit/multiple_selection/header_rows_edit. "
                            "Per clear di un valore string usa null o stringa vuota."
                        )
                    },
                    "rationale": {"type": "string", "description": "1-2 frasi italiano che spiegano la modifica."}
                },
                "required": ["route", "target", "field_label", "value", "rationale"]
            }
        },
        # ---------------- Designer inject (client-only) ----------------
        # Tool dedicato all'iniezione di componenti nello state Angular del
        # dashboard designer. NON tocca DB metadata. Il client (rag-chatbot
        # component) intercetta il kind='designer_inject' e delega l'apply
        # a un handler registrato dal designer.component via
        # ChatbotHostRegistryService (vedi C1 nel plan). Catalogo tool +
        # constraint disponibili come ground truth indicizzata dal RAG:
        # docs/pages/_internal/designer-tool-catalog.md.
        {
            "name": "propose_designer_inject",
            "description": (
                "USA QUESTO TOOL quando l'utente sta sulla pagina /designer "
                "(editor visuale della dashboard) e chiede operazioni sul layout "
                "via lingua naturale.\n\n"
                "Supporta 3 azioni discriminate da `action_type`:\n\n"
                "1. **action_type='inject'**: aggiunge nuovi componenti al canvas. "
                "Esempi: 'crea layout tabellare 2x2', 'aggiungi DATASOURCE su cities "
                "con DATAREPEATER', 'splitter verticale 3 aree', 'metti un KPI "
                "Fatturato', 'dashboard con 4 KPI', 'form nome/email/data', "
                "'master-detail cities a sinistra'. Compila `layout[]`.\n\n"
                "2. **action_type='set_property'**: modifica UN valore di proprieta' "
                "(inputs) di un componente gia' presente nel canvas. Esempi: "
                "'cambia background del riquadro in alto a destra in rosso', "
                "'metti width=300px alla colonna 2', 'rendi la table 3x3 invece "
                "di 2x2 (rows=3, cols=3)', 'imposta caption KPI a Vendite', "
                "'datasource route=orders'. Compila `target_unique_name` + "
                "`prop_name` + `value`. Il `target_unique_name` lo trovi nel "
                "DESIGNER STATE CORRENTE (iniettato nel system prompt quando "
                "sei sul designer): tree con righe tipo `TABLE__123 (rows=2, "
                "cols=2)\\n  TR__124\\n    TD__125 (top-left)\\n    TD__126 "
                "(top-right)\\n  TR__127\\n    TD__128 (bottom-left)\\n    "
                "TD__129 (bottom-right)`. Per 'riquadro in alto a destra' "
                "scegli TD__126.\n\n"
                "3. **action_type='remove'**: rimuove un componente (e tutti i "
                "suoi figli) dal canvas. Esempi: 'cancella il SPLITTER', "
                "'rimuovi la riga 2 della tabella', 'elimina il KPI Fatturato'. "
                "Compila `target_unique_name`.\n\n"
                "IMPORTANTE: NON usare per modifiche metadata permanenti (per "
                "quelle usa propose_simple_metadata_update e gli altri propose_*). "
                "Questo tool agisce solo sullo state client del designer (visibile "
                "fino al click 'Salva dashboard').\n\n"
                "Consulta SEMPRE il catalogo tool prima di proporre 'inject': usa "
                "ESCLUSIVAMENTE i tool_name documentati (TABLE, DIV, SPAN, LABEL, "
                "Hx, ANCHOR, IMG, IFRAME, UL, BUTTON, INPUT, TEXTAREA, CHECKBOX, "
                "SEPARATOR, HR, KPI, DATE, SELECT, MULTISELECT, DATASOURCE, "
                "DATAREPEATER, FILTERBAR, PAGER, TABVIEW, TABPANEL, SPLITTER, "
                "ACCORDION). Mai inventare nomi nuovi. Mai proporre come top-level "
                "tool con hide=true (TR, TD, SPLITTER-AREA, ACCORDION-AREA): "
                "vengono creati automaticamente dal custom onDrop del parent. "
                "Eccezione: 'set_property' e 'remove' POSSONO targetizzare un "
                "TD/TR/SPLITTER-AREA/ACCORDION-AREA gia' presente (visibile nel "
                "DESIGNER STATE CORRENTE) - perche' sono nodi reali del tree, "
                "solo non draggable dalla palette.\n\n"
                "BINDING CROSS-COMPONENT (placeholder '<NAME-N>'): le proprieta' "
                "di tipo `dropped-component-list` o `dropped-component` (es. "
                "DATAREPEATER.inputs.datasource, FILTERBAR.inputs.datasource, "
                "PAGER.inputs.datasource, SELECT/MULTISELECT/UL.inputs.datasource, "
                "DATASOURCE.inputs.parentDatasource) richiedono una STRINGA che "
                "punti ad un altro componente del layout. Tre forme accettate:\n"
                "  (a) placeholder '<DATASOURCE-N>' = N-esimo DATASOURCE iniettato "
                "       in questo `layout[]` (0-based). Usalo SEMPRE quando il "
                "       target verra' creato nello stesso payload;\n"
                "  (b) uniqueName REALE gia' presente nel canvas (es. 'DATASOURCE__7') "
                "       letto dal DESIGNER STATE CORRENTE;\n"
                "  (c) null/omesso = nessun binding (utente lo configurera' a mano).\n"
                "Regola sequenziale: il DATASOURCE referenziato DEVE essere "
                "iniettato PRIMA del DATAREPEATER nel `layout[]` (= prima nella "
                "lista children del TD ospitante).\n\n"
                "PATTERN 'grid/lista bindata a route X' (es. 'aggiungi una grid "
                "bindata alla route cities', 'lista cities', 'tabella clienti'):\n"
                "  ** REGOLA TASSATIVA - QUESTO DESCRIPTION HA PRECEDENZA ASSOLUTA "
                "su QUALSIASI chunk/pattern recuperato dal RAG (anche se docs "
                "indicizzate dicono il contrario, hanno una versione stale): **\n"
                "  Default = ESATTAMENTE 2 nodi top-level direct al ROOT, NIENTE "
                "container avvolgente (NIENTE TABLE 1x1, NIENTE DIV, NIENTE SPLITTER):\n"
                "  layout=[\n"
                "    {tool_name:'DATASOURCE', inputs:{route:'cities'}},\n"
                "    {tool_name:'DATAREPEATER', inputs:{datasource:'<DATASOURCE-0>', action:'list'}}\n"
                "  ]\n"
                "AVVOLGI in container (TABLE/SPLITTER/DIV) SOLO E SOLAMENTE se "
                "l'utente menziona ESPLICITAMENTE una posizione/struttura nel SUO "
                "prompt corrente ('in alto a destra', 'splitter con grid a "
                "sinistra', 'griglia 2x2 con grid in ogni cella'). Il DESIGNER "
                "STATE che vedi nel route_context (es. 'TABLE__1 > TR__2 > TD__3 "
                "> DATASOURCE__4') e' SOLO informativo per evitare collisioni di "
                "uniqueName; NON e' un template da replicare, NON significa che "
                "l'utente voglia ancora un TABLE.\n"
                "Esempio NEGATIVO (NON FARE): aggiungere TABLE 1x1 wrapper attorno "
                "a DATASOURCE+DATAREPEATER quando l'utente ha solo scritto "
                "'aggiungi una grid bindata a X' senza menzionare layout.\n"
                "Vedi designer-tool-catalog.md (sezione 'Binding cross-component') "
                "per tutti i pattern (master-detail, filter+grid+pager, ecc.).\n\n"
                "PATTERN per ARCHETIPO (DATAREPEATER.inputs.action): lo STESSO "
                "DATAREPEATER bindato a una route renderizza in MODALITA' diverse a "
                "seconda di `action`. NON esiste un tool separato 'CHART'/'MAP'/'KANBAN'/"
                "'SCHEDULER'/ecc.: sono tutte action dello stesso DATAREPEATER. Pattern "
                "IDENTICO al grid (DATASOURCE + DATAREPEATER bindato), cambia SOLO `action`. "
                "Default `list`; mappa la richiesta dell'utente all'action giusta (NON "
                "ripiegare su 'list' quando l'utente chiede esplicitamente un'altra vista):\n"
                "  - 'griglia'/'lista'/'tabella di dati'            -> action:'list' (default)\n"
                "  - 'grafico'/'chart'/'a barre'/'a torta'/'a linee'-> action:'chart'\n"
                "  - 'mappa'/'map'/'sulla cartina'/'geolocalizza'   -> action:'map'\n"
                "  - 'scheduler'/'agenda'/'pianificazione'/'appuntamenti' -> action:'scheduler'\n"
                "  - 'calendario'                                    -> action:'calendar'\n"
                "  - 'kanban'/'bacheca'/'colonne stato'             -> action:'kanban'\n"
                "  - 'albero'/'tree'/'gerarchia'                    -> action:'tree'\n"
                "  - 'carosello'/'carousel'/'galleria'              -> action:'carousel'\n"
                "  - 'foglio'/'spreadsheet'/'tipo excel'            -> action:'spreadsheet'\n"
                "  - 'pivot'/'tabella pivot'                        -> action:'pivot'\n"
                "  - 'scheda'/'dettaglio' (sola lettura)            -> action:'detail'\n"
                "  - 'form'/'maschera di modifica'/'edit'           -> action:'edit' (o 'dialog' per popup)\n"
                "(archetipi first-class del runtime DataRepeater: list, edit, dialog, "
                "detail, map, scheduler, spreadsheet, tree, chart, carousel, kanban; "
                "pivot/calendar via passthrough.) Esempio chart:\n"
                "  layout=[\n"
                "    {tool_name:'DATASOURCE', inputs:{route:'cities'}},\n"
                "    {tool_name:'DATAREPEATER', inputs:{datasource:'<DATASOURCE-0>', action:'chart'}}\n"
                "  ]\n\n"
                "CONFIG ARCHETIPO INLINE (`archetype_config` sul nodo DATAREPEATER): "
                "se l'utente specifica DETTAGLI di configurazione dell'archetipo (es. "
                "'grafico a TORTA della popolazione PER provincia', 'mappa con marker "
                "colorati per stato', 'kanban raggruppato per StateProvinceID'), aggiungi "
                "al nodo DATAREPEATER un campo `archetype_config` (oggetto) = il contenuto "
                "di `md_props_bag.archetypes.<action>`. Usa i NOMI REALI delle colonne. "
                "Viene scritto in-memory nel metaInfo del datasource bindato (nessun "
                "side-effect server) e serializzato al save della dashboard. Schemi per "
                "archetipo (campi principali):\n"
                "  - chart:    {type:'bar|line|pie|doughnut|radar', dataOptions:{dataProperty:'dato', datasets:[{label:'<titolo serie>', labelField:'<col asse X/etichette>', dataField:'<col valori numerici>', generateRandomColor:true}], cutOffCount:int}, options:{indexAxis:'x|y'}} -- `dataProperty:'dato'` OBBLIGATORIO (e' la chiave dell'array dati che parseData legge: senza, il chart resta VUOTO). AGGREGAZIONE (quando l'utente chiede 'MEDIA/TOTALE/CONTEGGIO/MIN/MAX di <valore> PER <categoria>', es. 'popolazione media per provincia'): aggiungi ALLO STESSO archetype_config `groupInfo:[{field:'<col categoria, es. StateProvinceID>'}]` + `aggregates:[{field:'<col valore, es. LatestRecordedPopulation>', aggregate:'avg|sum|count|min|max'}]` (media->avg, totale->sum, conteggio->count, minimo->min, massimo->max). Il datasource raggruppa LATO SERVER e ritorna un punto per gruppo; metti labelField = la colonna di groupInfo e dataField = la colonna di aggregates. Senza groupInfo/aggregates il chart plotta le righe grezze (nessuna aggregazione)\n"
                "  - map:      {zoom:int, center:{lat:num,lng:num}, titleField:'<col>', markerColorField:'<col>'}\n"
                "  - scheduler:{fromField:'<col data>', toField:'<col data>', titleField:'<col>'}\n"
                "  - kanban:   {statusField:'<col>', titleField:'<col>', colorField:'<col>', descriptionField:'<col>'}\n"
                "  - tree:     {parentField:'<col>', idField:'<col>', labelField:'<col>'}\n"
                "  - carousel: {imageField:'<col>', titleField:'<col>'}\n"
                "Esempio (grafico a torta popolazione per provincia):\n"
                "  layout=[\n"
                "    {tool_name:'DATASOURCE', inputs:{route:'cities'}},\n"
                "    {tool_name:'DATAREPEATER', inputs:{datasource:'<DATASOURCE-0>', action:'chart'}, archetype_config:{type:'pie', dataOptions:{dataProperty:'dato', datasets:[{label:'Popolazione', labelField:'StateProvinceID', dataField:'LatestRecordedPopulation', generateRandomColor:true}], cutOffCount:10}}}\n"
                "  ]\n"
                "Ometti `archetype_config` se l'utente chiede solo la vista senza dettagli "
                "(es. 'metti un grafico' senza specificare tipo/campi): l'archetipo usera' "
                "i default + la config gia' presente nel md_props_bag della route.\n\n"
                "ROUTE VALIDATION (DATASOURCE.inputs.route): quando il "
                "DESIGNER STATE include la sezione 'ROUTE METADATA "
                "DISPONIBILI', usa ESCLUSIVAMENTE i valori di md_route_name "
                "elencati. L'utente puo' menzionare termini fuzzy/storpiati "
                "('provincie' invece di 'stateprovinces', 'fornitori' invece "
                "di 'suppliers', 'fattura' invece di 'invoices'): in tal "
                "caso scegli il match semantico piu' probabile dalla "
                "whitelist REALE, NON inventare nomi.\n\n"
                "** REGOLE CRITICHE ANTI-HALLUCINATION **\n"
                "1. SE WHITELIST E' '<caricamento in corso>': NON INVENTARE "
                "nomi di route alternative (vietato dire 'forse intendi: "
                "provinces, states, regions'). Rispondi SOLO testuale: 'La "
                "lista delle route sta caricando, riprova tra 1 secondo.' "
                "L'utente puo' aspettare. Inventare nomi che il LLM non puo' "
                "verificare confonde l'utente e propaga errori.\n"
                "2. SINGLE-MATCH CONFIDENTE -> INIETTA DIRETTAMENTE, NIENTE "
                "FOLLOWUP, NIENTE 'PROCEDO?': se nella whitelist c'e' UN "
                "SOLO candidato chiaramente migliore (es. utente dice "
                "'provincie', whitelist contiene 'stateprovinces' come "
                "unico match semantico) -> **DEVI** emettere "
                "`propose_designer_inject` (tool_use) IMMEDIATAMENTE nella "
                "stessa risposta. **VIETATO TASSATIVAMENTE**:\n"
                "  - chiedere 'Procedo?' / 'Confermi?' / 'Vuoi che lo faccia?';\n"
                "  - rispondere solo testuale 'Ti propongo X' senza emettere tool_use;\n"
                "  - aspettare la conferma 'si' dell'utente per emettere il tool.\n"
                "Dichiara la mappatura ESPLICITAMENTE nel `rationale` "
                "del tool_use stesso. Esempio rationale: 'Match semantico: "
                "\"provincie\" (input utente) -> \"stateprovinces\" (route "
                "reale nella whitelist). Inietto DATASOURCE+DATAREPEATER "
                "bindati a stateprovinces.'\n"
                "Razionale del divieto: il chip 'Inietta nel designer' E' "
                "esso stesso la conferma utente (l'utente clicca Applica solo "
                "se vuole). Chiedere 'Procedo?' aggiunge un round-trip "
                "inutile che raddoppia il tempo di interazione. **Esempio "
                "NEGATIVO concreto (NON FARE QUESTO)**: utente dice 'aggiungi "
                "grid bindata a provincie', whitelist contiene SOLO "
                "'stateprovinces' come match -> NON rispondere 'Scusa, la "
                "route corretta e' stateprovinces. Ti propongo di aggiungere "
                "una grid bindata a stateprovinces. Procedo?'. Invece -> "
                "emetti SUBITO propose_designer_inject(layout=[DATASOURCE+"
                "DATAREPEATER], rationale='Match semantico provincie -> "
                "stateprovinces (unico candidato in whitelist). Inietto.').\n"
                "3. MULTI-MATCH AMBIGUO -> FOLLOWUP: se nella whitelist ci "
                "sono 2+ candidati semanticamente equivalenti (es. utente "
                "dice 'fatture' e whitelist contiene sia 'invoices' sia "
                "'invoices_archive' sia 'sales_invoices'): rispondi "
                "MESSAGGIO TESTUALE (zero tool_use) elencando i 2-3 "
                "candidati e chiedendo all'utente di scegliere.\n"
                "4. ZERO MATCH RAGIONEVOLE NELLA WHITELIST REALE: NON "
                "inventare. Rispondi MESSAGGIO TESTUALE (zero tool_use) "
                "dichiarando che la route non esiste + 2-3 nomi REALI dalla "
                "whitelist piu' vicini come suggerimenti. Esempio: 'Route "
                "\"foobar\" non trovata. Le route piu' simili sono: cities, "
                "customers. Quale intendi?'\n"
                "5. SE L'UTENTE RISPONDE CON UN NOME ESATTO della whitelist "
                "(es. 'cities', 'stateprovinces'): usa QUEL nome senza altre "
                "trasformazioni.\n\n"
                "** COLUMN VALIDATION (nomi colonna referenziati nello "
                "sql_snippet) **\n"
                "Lo snippet SQL spesso referenzia nomi colonna (es. "
                "'[price] * [quantity]' usa 'price' e 'quantity'). Il "
                "route_context include una sezione `Colonne:` con la lista "
                "delle colonne metadata reali della route target, con il "
                "loro `mc_nome_colonna` E (quando diverso) il "
                "`mc_real_column_name` (nome SQL fisico). REGOLE:\n"
                "1. Ogni colonna referenziata nello snippet DEVE esistere "
                "nella sezione `Colonne:`. Verifica PRIMA di proporre il "
                "tool.\n"
                "2. Usa SEMPRE `mc_real_column_name` nello snippet (e' quel "
                "che il framework concatena nella query). Se `mc_real_column_name` "
                "non e' mostrato accanto al nome, significa che e' uguale "
                "a `mc_nome_colonna`.\n"
                "3. SINGLE-MATCH CONFIDENTE: utente dice 'price', nelle "
                "colonne reali c'e' SOLO 'unit_price' come match semantico "
                "-> usa 'unit_price' nello snippet e dichiara la mappatura "
                "nel rationale. NIENTE followup.\n"
                "4. MULTI-MATCH AMBIGUO: utente dice 'prezzo', nelle "
                "colonne reali ci sono 'price', 'unit_price', 'list_price' "
                "-> NON proporre il tool. Rispondi testuale: 'Trovate "
                "piu' colonne candidate: `price`, `unit_price`, `list_price`. "
                "Quale intendi?'.\n"
                "5. ZERO MATCH: utente referenzia 'foobar' che NON esiste "
                "nelle colonne -> NON proporre. Rispondi testuale con "
                "2-3 colonne REALI piu' simili dal context.\n"
                "6. MIX (alcuni match singoli, altri ambigui): risolvi i "
                "match certi, segnala solo gli ambigui in followup. Esempio: "
                "'quantity' e' unico match per `quantity`, ma 'prezzo' "
                "matcha 3 colonne -> chiedi solo per 'prezzo'."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": ["inject", "set_property", "remove"],
                        "description": "Tipo di operazione richiesta sul canvas designer."
                    },
                    "layout": {
                        "type": "array",
                        "description": (
                            "Solo per action_type='inject'. Albero di tool da iniettare, "
                            "ordine sequenziale. Ogni nodo rappresenta un componente da "
                            "aggiungere al canvas designer. I figli (children) sono iniettati "
                            "DENTRO il parent. Per i tool con custom onDrop "
                            "(TABLE/SPLITTER/ACCORDION) i nodi figli auto-generati "
                            "(TR/TD/SPLITTER-AREA/ACCORDION-AREA) NON vanno inclusi qui: "
                            "vengono creati automaticamente."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "tool_name": {
                                    "type": "string",
                                    "description": "Nome esatto del tool dal catalogo (case-sensitive). Es: 'TABLE', 'DIV', 'DATASOURCE', 'KPI'. NON inventare."
                                },
                                "inputs": {
                                    "type": "object",
                                    "description": "Override dei valori di default per le proprieta' del tool. Es: {rows:3,cols:4} per TABLE, {route:'cities'} per DATASOURCE, {caption:'Vendite'} per KPI."
                                },
                                "parent_unique_name": {
                                    "type": "string",
                                    "description": "OPZIONALE: uniqueName del parent gia' presente nello state (es. 'TD__126'). Se omesso, va al ROOT. Placeholder semantici tipo '<TD-0>' sono accettati se il LLM non conosce il valore reale."
                                },
                                "children": {
                                    "type": "array",
                                    "description": "Nodi figli (ricorsivo). NB: NON aggiungere TR/TD per TABLE, SPLITTER-AREA per SPLITTER, ACCORDION-AREA per ACCORDION (auto-create). DEVI aggiungere TABPANEL per TABVIEW (non auto).",
                                    "items": {"type": "object"}
                                }
                            },
                            "required": ["tool_name"]
                        }
                    },
                    "target_unique_name": {
                        "type": "string",
                        "description": (
                            "Solo per action_type='set_property' o 'remove'. uniqueName del "
                            "componente target presente nel canvas (formato 'TOOLNAME__N', "
                            "es. 'TABLE__123', 'TD__126', 'KPI__301'). Trovato leggendo il "
                            "DESIGNER STATE CORRENTE iniettato nel system prompt."
                        )
                    },
                    "prop_name": {
                        "type": "string",
                        "description": (
                            "Solo per action_type='set_property'. Nome della proprieta' "
                            "in `inputs` del tool target. Es: 'backgroundColor', 'color', "
                            "'fontSize', 'width', 'height', 'rows', 'cols', 'innerText', "
                            "'caption', 'route', 'src', 'href', 'checked', 'disabled'. "
                            "Solo nomi documentati nel catalogo per il tool_name target."
                        )
                    },
                    "value": {
                        "description": (
                            "Solo per action_type='set_property'. Nuovo valore. Tipo "
                            "conforme alla proprieta': string per *Color/innerText/caption/"
                            "route/src/href/width/height, number per rows/cols/areas/items/"
                            "pageSize, bool per checked/disabled/autoload/readonly. Per "
                            "colori usa formato CSS: '#ff0000', 'rgb(255,0,0)', "
                            "'rgba(255,0,0,0.5)', 'red'."
                        )
                    },
                    "rationale": {
                        "type": "string",
                        "description": "1-2 frasi italiano che spiegano l'operazione proposta (mostrate all'utente prima dell'apply)."
                    }
                },
                "required": ["action_type", "rationale"]
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
        # ---------------- Metadata column create (workflow step 1) ----------------
        {
            "name": "propose_metadata_column_create",
            "description": (
                "USA QUESTO TOOL quando l'utente chiede di AGGIUNGERE una "
                "COLONNA METADATA NUOVA a una route esistente. NON per "
                "modificare una colonna esistente (per quella usa "
                "propose_simple_metadata_update o propose_sql_metadata_field).\n\n"
                "Casi d'uso e workflow (semantica `mc_is_computed` "
                "vs `mc_is_db_computed`):\n\n"
                "**CASO 1 — Mappare colonna FISICA gia' esistente sul DB**\n"
                "Prompt esempio: 'aggiungi al metadata la colonna SQL "
                "`email` di `customers`' (la colonna `email` esiste GIA' "
                "nella tabella SQL, manca solo il metadato che la mostra "
                "nella grid). Setta:\n"
                "  - `is_computed=false`\n"
                "  - `real_column_name=<nome_SQL>` (uguale a column_name "
                "se i nomi coincidono)\n"
                "  - `ui_column_type=string|number|date|...`\n"
                "  - `computed_formula=OMESSO`\n"
                "Il backend fa solo INSERT in `_metadati__colonne`. "
                "`mc_is_computed=false`, `mc_is_db_computed=false`. Nessun "
                "ALTER TABLE.\n\n"
                "**CASO 2 — Creare colonna CALCOLATA a livello metadato "
                "(NO modifica SQL schema)**\n"
                "Prompt esempio: 'crea colonna calcolata `totale` che fa "
                "`Quantity * UnitPrice`' / 'aggiungi colonna totale che "
                "moltiplica quantita per prezzo' / 'colonna fullname = "
                "first_name concatenato con last_name'. La formula vive "
                "SOLO nei metadati: il framework la appende come "
                "`<formula> AS [<nome>]` nella SELECT autogenerata. La "
                "tabella SQL sottostante NON viene modificata. Setta:\n"
                "  - `is_computed=true`\n"
                "  - `real_column_name=null` (NON e' una colonna fisica)\n"
                "  - `ui_column_type=number|decimal|string|...`\n"
                "  - **`computed_formula`** — VEDI SOTTO REGOLA CRITICA.\n\n"
                "** REGOLA CRITICA COMPUTED_FORMULA (NON OMETTERE) **\n"
                "Se l'utente ha espresso UN'OPERAZIONE su colonne (NON "
                "importa se in SQL letterale o in lingua naturale italiana/"
                "inglese), DEVI tradurla in SQL dialetto-target e passarla "
                "in `computed_formula`. Esempi che DEVONO produrre "
                "`computed_formula` valorizzato:\n"
                "** CRITICO: USA SEMPRE FULL QUALIFIER `[schema].[table].[col]` "
                "(mssql) o equivalente per provider. Senza qualifier il "
                "framework concatena la formula in una SELECT che JOINa "
                "multiple tabelle -> SQL 209 'colonna ambigua' al primo "
                "load grid. Il context route include la sezione "
                "'SQL identity: schema=<X>, table=<Y>' che ti da' i pezzi. **\n"
                "Esempi (su `Sales.OrderLines`):\n"
                "  - 'moltiplica Quantity per UnitPrice' -> "
                "`[Sales].[OrderLines].[Quantity] * [Sales].[OrderLines].[UnitPrice]` (mssql)\n"
                "  - 'fa quantita x prezzo' -> "
                "`[Sales].[OrderLines].[Quantity] * [Sales].[OrderLines].[UnitPrice]`\n"
                "  - 'somma price e tax' su `dbo.Orders` -> "
                "`[dbo].[Orders].[price] + [dbo].[Orders].[tax]`\n"
                "  - 'quantity diviso 10' su `Sales.OrderLines` -> "
                "`[Sales].[OrderLines].[Quantity] / 10`\n"
                "  - 'concatena first_name e last_name' su `dbo.Customers` -> mssql: "
                "`[dbo].[Customers].[first_name] + ' ' + [dbo].[Customers].[last_name]`\n"
                "  - 'totale meno sconto' su `dbo.Invoices` -> "
                "`[dbo].[Invoices].[totale] - [dbo].[Invoices].[sconto]`\n"
                "  - 'CASE WHEN status = ok THEN 1 ELSE 0 END' -> letterale, "
                "qualifier su `status`\n"
                "MAI generare formule senza schema/table prefix. Se nel "
                "context vedi 'SQL identity: schema=Sales, table=OrderLines' "
                "OGNI colonna referenziata DEVE essere "
                "`[Sales].[OrderLines].[<col>]`.\n"
                "OMETTI `computed_formula` SOLO se l'utente ha chiesto la "
                "creazione SENZA specificare alcuna logica (es. "
                "'aggiungi una colonna calcolata `xyz`' senza dire COSA "
                "calcola). In quel caso il backend crea la riga vuota e "
                "l'utente dovra' rilanciare il prompt con la formula -> "
                "STEP 2 separato (`propose_sql_metadata_field`).\n\n"
                "Il fatto che l'utente parli in lingua naturale "
                "('moltiplica', 'somma', 'meno') NON significa 'formula "
                "non fornita': il LLM ha il compito di tradurre NL -> SQL. "
                "Se vedi un'operazione chiara, riempi `computed_formula`. "
                "Sbagliare a omettere produce una colonna stub che rompe "
                "la grid al prossimo refresh (SQL error 207 'colonna non "
                "valida').\n"
                "Il backend setta `mc_is_computed=true`. Quando "
                "`computed_formula` valorizzato applica anche UPDATE "
                "`mccomputedformula` atomicamente (D3 super-admin gate).\n\n"
                "**CASO 3 — Creare colonna FISICA NUOVA (ALTER TABLE "
                "richiesto)**\n"
                "Prompt esempio: 'aggiungi colonna `phone_number` di "
                "tipo text a `customers` (max 50 caratteri)' (la tabella "
                "SQL `customers` NON ha la colonna, va creata via ALTER "
                "TABLE). Setta:\n"
                "  - `is_computed=false`\n"
                "  - `real_column_name=<nome>` (= column_name di solito)\n"
                "  - `ui_column_type=string|number|text|decimal|date|...`\n"
                "  - **`create_physical_column=true`** (FLAG ESSENZIALE)\n"
                "  - `nullable=true|false` (default true)\n"
                "  - `max_length`/`precision`/`scale`/`default_value` se "
                "rilevanti per il tipo (es. text=200 char -> max_length=200; "
                "decimal(10,2) -> precision=10 scale=2)\n"
                "Il backend esegue ALTER TABLE (cross-DBMS via "
                "`scaffolding.AddColumn`) + INSERT metadati in transaction "
                "atomica. Richiede privilegi admin (verifica al backend).\n"
                "Esempi di mapping `ui_column_type` -> SQL type:\n"
                "  - 'string' + max_length=N -> VARCHAR(N) (mssql/mysql/pg) "
                "o VARCHAR2(N) (oracle)\n"
                "  - 'text' + max_length=N -> NVARCHAR(N) o TEXT\n"
                "  - 'number' -> INT\n"
                "  - 'decimal' + precision/scale -> DECIMAL(p,s)\n"
                "  - 'date' -> DATE; 'datetime' -> DATETIME (mssql) o "
                "TIMESTAMP (pg/oracle)\n"
                "  - 'boolean' -> BIT (mssql/mysql) o BOOLEAN (pg) o "
                "NUMBER(1) (oracle) — il framework lo gestisce automaticamente.\n\n"
                "**DISAMBIGUAZIONE per il LLM** (se l'utente e' ambiguo):\n"
                "- 'aggiungi colonna calcolata' -> CASO 2 (mc_is_computed=true, "
                "formula livello metadato)\n"
                "- 'aggiungi colonna' senza qualificatore + l'utente parla "
                "di un dato che probabilmente NON e' gia' nel DB -> chiedi "
                "se vuole CASO 3 (creare anche al livello SQL) oppure "
                "CASO 2 (calcolata)\n"
                "- 'mappa colonna SQL X' / 'aggiungi al metadata la colonna "
                "X' -> CASO 1 (presupposto: la colonna SQL esiste gia')\n"
                "- L'utente cita esplicitamente una formula (`*`, `+`, "
                "`CASE WHEN`, `CAST`, ecc.) -> sempre CASO 2.\n\n"
                "Workflow completo documentato in "
                "`docs/pages/_internal/sql-metadata-fields-workflow.md`.\n\n"
                "**REGOLE**:\n"
                "- Per colonne calcolate, `is_computed=true` setta "
                "automaticamente `mc_hide_in_edit=true` (la colonna non "
                "compare nel form di edit perche' calcolata).\n"
                "- `mc_ordine` viene calcolato automaticamente come "
                "MAX(mc_ordine)+10 sulla route - non passarlo.\n"
                "- `column_name` deve essere un identifier valido "
                "(`^[A-Za-z_][A-Za-z0-9_]*$`), no spazi, no caratteri "
                "speciali.\n"
                "- Non richiede super-admin: e' simple_metadata_update "
                "extension, non SQL fragment. Il LLM puo' proporlo a tutti "
                "gli admin (verifica IS_SUPER_ADMIN solo per il STEP B).\n\n"
                "** COLUMN VALIDATION (per is_computed=false) **\n"
                "Per colonne fisiche (is_computed=false), `real_column_name` "
                "DEVE matchare una colonna SQL realmente esistente nella "
                "tabella business sottostante. Il route_context include la "
                "sezione `Colonne:` con i `mc_real_column_name` reali delle "
                "colonne metadata gia' mappate alla route. Logica:\n"
                "1. Se l'utente dice 'aggiungi colonna `email`' e tra le "
                "colonne reali esiste gia' una colonna metadata mappata a "
                "`email` -> ERRORE (duplicate), il backend rifiutera'.\n"
                "2. Se l'utente dice 'aggiungi colonna `phone_number`' e "
                "la tabella sottostante NON ha quella colonna SQL, il "
                "framework non sara' in grado di SELECT-la a runtime -> "
                "valori NULL. Il LLM dovrebbe avvertire l'utente nel "
                "rationale: 'NB: assicurati che la tabella SQL `<table>` "
                "abbia gia' la colonna `phone_number`, altrimenti i valori "
                "saranno NULL'.\n"
                "Per is_computed=true non c'e' validation colonna (la "
                "computed non legge da SQL fisica)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "route": {
                        "type": "string",
                        "description": "md_route_name della tabella metadata target. Deve esistere nella whitelist ROUTE METADATA DISPONIBILI."
                    },
                    "column_name": {
                        "type": "string",
                        "description": "mc_nome_colonna - identifier logico (es. 'total2', 'notes', 'full_name'). Match regex ^[A-Za-z_][A-Za-z0-9_]*$"
                    },
                    "display_string": {
                        "type": "string",
                        "description": "mc_display_string_in_view - label visibile nella grid/form (es. 'Total 2', 'Notes')"
                    },
                    "ui_column_type": {
                        "type": "string",
                        "enum": ["string", "number", "decimal", "date", "datetime", "boolean", "text", "lookupByID"],
                        "description": "mc_ui_column_type. Per colonne calcolate numeriche usa 'number' o 'decimal'."
                    },
                    "is_computed": {
                        "type": "boolean",
                        "description": "true se la colonna e' CALCOLATA (no fisica nel DB). Imposta automaticamente mc_real_column_name=null e mc_hide_in_edit=true. false se fisica (real_column_name DEVE essere fornito)."
                    },
                    "real_column_name": {
                        "type": "string",
                        "description": "mc_real_column_name - nome SQL fisico nella tabella sottostante. REQUIRED se is_computed=false, OMESSO se is_computed=true."
                    },
                    "computed_formula": {
                        "type": "string",
                        "description": "OPZIONALE. Snippet SQL inline (es. '[Quantity] * [UnitPrice]' per mssql) nel dialetto CURRENT_DBMS. Usato SOLO quando is_computed=true E l'utente ha specificato la formula nel prompt. Backend applica INSERT + UPDATE mccomputedformula atomicamente. Il D3 gate super-admin scatta SOLO se questo campo e' valorizzato. Omettere se l'utente non ha precisato la formula (la formula puo' essere applicata dopo via propose_sql_metadata_field)."
                    },
                    "create_physical_column": {
                        "type": "boolean",
                        "description": "OPZIONALE (default false). Se true, il backend esegue ALTER TABLE per creare anche la colonna SQL fisica nella tabella business (CASO 3). Richiede is_computed=false. Cross-DBMS via scaffolding.AddColumn (mssql/mysql/oracle/postgres). Auth: admin richiesto."
                    },
                    "nullable": {
                        "type": "boolean",
                        "description": "OPZIONALE (default true). Vincolo NOT NULL della colonna SQL. Usato solo con create_physical_column=true."
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "OPZIONALE. Lunghezza max per tipi string/text (es. VARCHAR(N)). Usato solo con create_physical_column=true e ui_column_type stringa."
                    },
                    "precision": {
                        "type": "integer",
                        "description": "OPZIONALE. Precision totale per tipi decimal (es. DECIMAL(precision,scale)). Usato solo con create_physical_column=true."
                    },
                    "scale": {
                        "type": "integer",
                        "description": "OPZIONALE. Scale (cifre decimali) per tipi decimal. Usato solo con create_physical_column=true."
                    },
                    "default_value": {
                        "type": "string",
                        "description": "OPZIONALE. Valore DEFAULT per la colonna SQL (es. '0', \"''\", 'GETDATE()'). Usato solo con create_physical_column=true."
                    },
                    "rationale": {
                        "type": "string",
                        "description": "1-2 frasi italiano che spiegano cosa fa la colonna e perche'."
                    }
                },
                "required": ["route", "column_name", "display_string", "ui_column_type", "is_computed", "rationale"]
            }
        },
        # ---------------- SQL snippet fields (D3 super-admin) ----------------
        {
            "name": "propose_sql_metadata_field",
            "description": (
                "USA QUESTO TOOL quando l'utente chiede di modificare un "
                "campo metadata che contiene uno SNIPPET SQL (custom JOIN, "
                "SELECT clause, formula colonna calcolata, espressione "
                "display lookup). Questi campi vivono in `_metadati__tabelle` "
                "o `_metadati__colonne` e vengono concatenati a runtime nel "
                "SQL emesso dal framework.\n\n"
                "** GATE OBBLIGATORI **\n"
                "1. SUPER-ADMIN ONLY (D3 RBAC): se nel route_context vedi "
                "`IS_SUPER_ADMIN=false` -> NON proporre questo tool. "
                "Rispondi SOLO testuale: 'Questo tipo di modifica richiede "
                "privilegi super-admin (modifica diretta di SQL nei "
                "metadata). Autenticati con un account super-admin o "
                "contatta l'amministratore.'\n"
                "2. DBMS-AWARE: nel route_context vedi "
                "`CURRENT_DBMS=mssql|mysql|postgres|oracle`. Genera SQL "
                "nel DIALETTO corretto:\n"
                "  - identifier quoting: mssql=[..], mysql=`..`, "
                "pg/oracle=\"..\";\n"
                "  - top-N: mssql=`TOP N`, mysql/pg=`LIMIT N`, "
                "oracle=`FETCH FIRST N ROWS ONLY`;\n"
                "  - concat: mssql=`+`, mysql=`CONCAT()`, pg=`||`, "
                "oracle=`||`;\n"
                "  - data odierna: mssql=`GETDATE()`, mysql=`NOW()`, "
                "pg=`CURRENT_TIMESTAMP`, oracle=`SYSDATE`.\n"
                "3. RATIONALE OBBLIGATORIA: 2-3 frasi che spiegano cosa fa "
                "lo snippet + un esempio output atteso (es. 'mostra "
                "Customer LASTNAME, NAME come singola colonna').\n\n"
                "Campi gestibili (field_name):\n"
                "  - `md_join_override` (target_table=_metadati__tabelle): "
                "FROM/JOIN clause override per la route corrente. Es: "
                "'aggiungi join a payments su invoice_id'.\n"
                "  - `mc_custom_select_clause` "
                "(target_table=_metadati__colonne): subquery scalare che "
                "rimpiazza la colonna in SELECT. Es: '(SELECT TOP 1 [name] "
                "FROM [customers] WHERE id = orders.customer_id)'.\n"
                "  - `mc_custom_join` (target_table=_metadati__colonne): "
                "LEFT JOIN aggiuntiva richiesta dalla colonna. Es: 'LEFT "
                "JOIN [customers] c ON c.id = orders.customer_id'.\n"
                "  - `mc_computed_formula` (target_table=_metadati__colonne): "
                "espressione SQL inline (CAST/concat/aritmetica) per "
                "colonna calcolata. Es: '[price] * [quantity]'.\n"
                "  - `mc_ui_lookup_computed_dataTextField` "
                "(target_table=_metadati__colonne): espressione per il "
                "display di un lookup (CAST/LOWER/concat). Es: "
                "'UPPER([code]) + \\' - \\' + [name]'.\n\n"
                "VINCOLI VALORI:\n"
                "- target_row_key.route: deve essere una route REALE della "
                "whitelist ROUTE METADATA DISPONIBILI; fuzzy match come "
                "per propose_designer_inject.\n"
                "- target_row_key.column_name: REQUIRED quando "
                "target_table=_metadati__colonne; OMESSO quando "
                "target_table=_metadati__tabelle (md_join_override e' "
                "table-level, non column-level).\n"
                "- sql_snippet: SOLO il fragment (nessun SELECT/FROM "
                "wrapper se field e' computed/select-clause; SI'  full "
                "JOIN clause se field e' custom_join/join_override).\n"
                "- NON eseguire query - solo proporre. Il backend applica "
                "previa conferma esplicita dell'utente sul chip."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "target_table": {
                        "type": "string",
                        "enum": ["_metadati__tabelle", "_metadati__colonne"],
                        "description": "Tabella metadata target. _tabelle per md_join_override (table-level), _colonne per tutti gli altri (column-level)."
                    },
                    "target_row_key": {
                        "type": "object",
                        "properties": {
                            "route": {
                                "type": "string",
                                "description": "md_route_name della tabella business target (es. 'orders', 'cities'). Deve esistere nella whitelist ROUTE METADATA DISPONIBILI."
                            },
                            "column_name": {
                                "type": "string",
                                "description": "mc_nome_colonna - REQUIRED se target_table=_metadati__colonne, omesso se _metadati__tabelle."
                            }
                        },
                        "required": ["route"]
                    },
                    "field_name": {
                        "type": "string",
                        "enum": [
                            "md_join_override",
                            "mc_custom_select_clause",
                            "mc_custom_join",
                            "mc_computed_formula",
                            "mc_ui_lookup_computed_dataTextField"
                        ],
                        "description": "Campo SQL-fragment da scrivere."
                    },
                    "sql_snippet": {
                        "type": "string",
                        "description": "Snippet SQL nel dialetto del CURRENT_DBMS attivo. Stringa vuota = clear del campo."
                    },
                    "dbms_target": {
                        "type": "string",
                        "enum": ["mssql", "mysql", "postgres", "oracle"],
                        "description": "Dialetto DBMS per cui lo snippet e' stato scritto. DEVE matchare CURRENT_DBMS nel route_context."
                    },
                    "rationale": {
                        "type": "string",
                        "description": "2-3 frasi italiano: cosa fa lo snippet + esempio output atteso. Mostrato all'utente nel chip preview prima del click Apply."
                    }
                },
                "required": ["target_table", "target_row_key", "field_name", "sql_snippet", "dbms_target", "rationale"]
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

            # Mapping tool_name -> kind. Solo UNA proposed_action_json per turn
            # (first wins) anche se l'LLM emette piu' tool_use d'azione.
            # Schema docs: docs/pages/callback-cookbook.md (sezioni 1-9).
            _ACTION_TOOL_TO_KIND = {
                "propose_toolbar_action":         "toolbar_action",
                "propose_row_action":             "row_action",
                "propose_table_style":            "table_style",
                "propose_column_style":           "column_style",
                "propose_display_formula":        "display_formula",
                "propose_form_title_formula":     "form_title_formula",
                "propose_default_value_callback": "default_value_callback",
                "propose_custom_validation":      "custom_validation",
                "propose_selection_changed":      "selection_changed",
                "propose_lifecycle_callback":     "lifecycle_callback",
                "propose_simple_metadata_update": "simple_metadata_update",
                "propose_designer_inject":        "designer_inject",
                "propose_sql_metadata_field":     "sql_metadata_field",
                "propose_metadata_column_create": "metadata_column_create",
            }
            if tool_name in _ACTION_TOOL_TO_KIND and proposed_action_json is None:
                action_kind = _ACTION_TOOL_TO_KIND[tool_name]
                # Post-processing difensivo: il framework salva i callback come
                # BODY-ONLY; se l'LLM produce comunque una function wrapper, lo
                # unwrappa qui prima di salvare. Vale per i campi che contengono
                # JS body: callback_js (toolbar/row/default/validation/selection/
                # lifecycle), condition_js (table_style/column_style).
                # NB: `template_html` (display_formula) NON va unwrappato — e'
                # markup Angular, non body JS.
                for js_field in ("callback_js", "condition_js"):
                    cbk = tool_input.get(js_field)
                    if isinstance(cbk, str) and cbk.strip():
                        tool_input[js_field] = _unwrap_callback_body(cbk)
                # Sanitize residui XML su campi natural-language (rationale,
                # label, description): Claude a volte leaka frammenti tipo
                # `</rationale>` / `</invoke>` dentro il valore stringa.
                for nl_field in _SANITIZE_TEXT_FIELDS:
                    raw_nl = tool_input.get(nl_field)
                    if isinstance(raw_nl, str) and raw_nl:
                        tool_input[nl_field] = _strip_xml_tag_residue(raw_nl)
                try:
                    proposed_action_json = json.dumps({"kind": action_kind, **tool_input}, ensure_ascii=False)
                    LOG.info("LLM tool_use: %s -> kind=%s", tool_name, action_kind)
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
