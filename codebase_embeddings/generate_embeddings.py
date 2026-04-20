import argparse
import hashlib
import json
import math
import os
import pickle
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
DEFAULT_LORA_CE_DIR = r"c:/src/Wuic/codebase_embeddings/lora_ce_v4"

# Lazy global cache for the cross-encoder model: only loaded if explicitly
# enabled. Loading bge-reranker-v2-m3 the first time downloads ~600 MB.
# Cache key includes the device to allow re-loading on a different device.
_CROSS_ENCODER_CACHE: Dict[str, "CrossEncoder"] = {}
_LORA_CE_CACHE: Dict[str, object] = {}


def resolve_device(device: str) -> str:
    """Resolve 'auto' (or empty) to 'cuda' if available, else 'cpu'."""
    if device and device != "auto":
        return device
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def get_cross_encoder(model_name: str, device: str = "auto", fp16: bool = True):
    resolved = resolve_device(device)
    # FP16 is only supported on CUDA. On CPU, fall back to FP32 silently.
    use_fp16 = bool(fp16) and resolved.startswith("cuda")
    cache_key = f"{model_name}|{resolved}|fp16={use_fp16}"
    if cache_key in _CROSS_ENCODER_CACHE:
        return _CROSS_ENCODER_CACHE[cache_key]
    from sentence_transformers import CrossEncoder
    model = CrossEncoder(model_name, max_length=512, device=resolved)
    if use_fp16:
        # Cast the underlying torch model to half precision. This gives ~3x
        # speedup on Ampere/Ada GPUs at no measurable quality loss for the
        # bge-reranker-v2-m3 model.
        try:
            model.model.half()
        except Exception:
            pass
    _CROSS_ENCODER_CACHE[cache_key] = model
    return model


class _LoraCEWrapper:
    """Wraps a HF SequenceClassification model + LoRA adapter behind the
    sentence_transformers.CrossEncoder.predict() API used by search_loaded().
    Lazy-imports torch + transformers + peft so the import cost is only paid
    when the LoRA path is actually selected."""

    def __init__(self, base_model: str, adapter_dir: str, device: str, fp16: bool):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        from peft import PeftModel
        self._torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(base_model)
        base = AutoModelForSequenceClassification.from_pretrained(base_model, num_labels=1)
        self.model = PeftModel.from_pretrained(base, adapter_dir)
        self.model.eval()
        self.device = device
        if device.startswith("cuda") and fp16:
            self.model.half()
        self.model.to(device)
        self._fp16 = fp16 and device.startswith("cuda")

    def predict(self, pairs, batch_size: int = 32, show_progress_bar: bool = False):
        torch = self._torch
        scores = []
        with torch.no_grad():
            for i in range(0, len(pairs), batch_size):
                batch = pairs[i : i + batch_size]
                queries = [p[0] for p in batch]
                passages = [p[1] for p in batch]
                inputs = self.tokenizer(
                    queries,
                    passages,
                    padding=True,
                    truncation="only_second",
                    max_length=512,
                    return_tensors="pt",
                ).to(self.device)
                if self._fp16:
                    with torch.amp.autocast("cuda", dtype=torch.float16):
                        out = self.model(**inputs)
                else:
                    out = self.model(**inputs)
                logits = out.logits.squeeze(-1)
                scores.extend(logits.float().cpu().tolist())
        return np.asarray(scores, dtype=np.float64)


def get_lora_cross_encoder(adapter_dir: str, base_model: str = DEFAULT_RERANKER_MODEL,
                            device: str = "auto", fp16: bool = True):
    """Return a CrossEncoder-compatible wrapper backed by a LoRA adapter.

    Cached on (base_model, adapter_dir, resolved_device, fp16) so repeated
    calls in the same process are free."""
    resolved = resolve_device(device)
    use_fp16 = bool(fp16) and resolved.startswith("cuda")
    cache_key = f"{base_model}|{adapter_dir}|{resolved}|fp16={use_fp16}"
    if cache_key in _LORA_CE_CACHE:
        return _LORA_CE_CACHE[cache_key]
    wrapper = _LoraCEWrapper(base_model, adapter_dir, device=resolved, fp16=use_fp16)
    _LORA_CE_CACHE[cache_key] = wrapper
    return wrapper


TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_\.]{1,}")
TECH_TOKEN_RE = re.compile(r"(^mc_|^md_|^wg_|^mm_|_id$|^get[A-Z]|^set[A-Z]|^save[A-Z]|^load[A-Z]|^suggest[A-Z]|^parse[A-Z]|^build[A-Z])")


def tokenize(text: str) -> List[str]:
    return [t.lower() for t in TOKEN_RE.findall(text or "")]


def resolve_hf_token(explicit_token: str = "", token_env: str = "RAG_HF_TOKEN") -> str:
    token = (
        (explicit_token or "").strip()
        or (os.getenv(token_env, "") or "").strip()
        or (os.getenv("HF_TOKEN", "") or "").strip()
        or (os.getenv("HUGGINGFACEHUB_API_TOKEN", "") or "").strip()
    )
    if token:
        os.environ["HF_TOKEN"] = token
        os.environ["HUGGINGFACEHUB_API_TOKEN"] = token
    return token


def load_sentence_transformer(model_name: str, hf_token: str = "") -> SentenceTransformer:
    if not hf_token:
        return SentenceTransformer(model_name)
    try:
        return SentenceTransformer(model_name, token=hf_token)
    except TypeError:
        try:
            return SentenceTransformer(model_name, use_auth_token=hf_token)
        except TypeError:
            return SentenceTransformer(model_name)


def normalize_vectors(v: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return v / norms


def load_chunks(jsonl_path: Path) -> List[dict]:
    docs = []
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            docs.append(json.loads(line))
    return docs


def write_json(path: Path, payload: dict):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def compute_docs_fingerprint(docs: List[dict]) -> str:
    h = hashlib.sha1()
    h.update(str(len(docs)).encode("utf-8"))
    for d in docs:
        h.update(b"|")
        h.update(str(d.get("chunk_id", "")).encode("utf-8"))
        h.update(b"#")
        h.update(str(d.get("symbol_name", "")).encode("utf-8"))
        h.update(b"#")
        h.update(str(d.get("rel_path", "")).encode("utf-8"))
    return h.hexdigest()


def build_bm25(docs: List[dict]) -> Dict:
    doc_tokens = []
    doc_freq = Counter()
    lengths = []
    for d in docs:
        tokens = tokenize(d.get("text", ""))
        doc_tokens.append(tokens)
        lengths.append(len(tokens))
        for tok in set(tokens):
            doc_freq[tok] += 1
    avgdl = float(np.mean(lengths)) if lengths else 1.0
    return {
        "doc_tokens": doc_tokens,
        "doc_freq": dict(doc_freq),
        "lengths": lengths,
        "avgdl": avgdl,
        "n_docs": len(docs),
    }


def bm25_scores(query: str, bm25_index: Dict, k1: float = 1.5, b: float = 0.75) -> np.ndarray:
    q_tokens = tokenize(query)
    n_docs = bm25_index["n_docs"]
    if n_docs == 0:
        return np.zeros(0, dtype=np.float32)

    doc_tokens = bm25_index["doc_tokens"]
    doc_freq = bm25_index["doc_freq"]
    lengths = bm25_index["lengths"]
    avgdl = bm25_index["avgdl"] or 1.0
    scores = np.zeros(n_docs, dtype=np.float32)

    for term in q_tokens:
        df = doc_freq.get(term, 0)
        if df == 0:
            continue
        idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1.0)
        for i, toks in enumerate(doc_tokens):
            tf = toks.count(term)
            if tf == 0:
                continue
            denom = tf + k1 * (1 - b + b * (lengths[i] / avgdl))
            scores[i] += idf * ((tf * (k1 + 1)) / denom)
    return scores


def vector_scores(query: str, model: SentenceTransformer, vectors_norm: np.ndarray) -> np.ndarray:
    q = model.encode([query], convert_to_numpy=True, show_progress_bar=False)
    q = normalize_vectors(q.astype(np.float32))[0]
    return np.dot(vectors_norm, q)


def vector_scores_hyde(
    query: str,
    model: SentenceTransformer,
    vectors_norm: np.ndarray,
    hyde_text: str,
    hyde_weight: float = 0.5,
    hyde_mode: str = "blend_concat",
) -> np.ndarray:
    """Hybrid query vector with HyDE expansion.

    Three modes:
    - "blend_concat": blend emb(query) with emb(query + fake_code) [legacy]
    - "blend_code":   blend emb(query) with emb(fake_code) alone [purer signal]
    - "max":          take max(query_scores, hyde_scores) element-wise
                      (like using hyde_weight only where it helps)

    BM25 path is intentionally NOT touched: synthetic code tokens would hurt
    BM25 precision.
    """
    if hyde_mode == "max":
        # Score both separately then take max per-doc. Captures HyDE lift
        # for queries where it helps, without penalizing queries it harms.
        batch = [query, hyde_text]
        encoded = model.encode(batch, convert_to_numpy=True, show_progress_bar=False)
        encoded = normalize_vectors(encoded.astype(np.float32))
        q_pure = encoded[0]
        q_hyde = encoded[1]
        scores_pure = np.dot(vectors_norm, q_pure)
        scores_hyde = np.dot(vectors_norm, q_hyde)
        # Weighted max
        return np.maximum(scores_pure, scores_hyde * hyde_weight + scores_pure * (1.0 - hyde_weight))

    if hyde_mode == "blend_code":
        # Extract just the fake code from hyde_text (which is "query\n\nfake")
        parts = hyde_text.split("\n\n", 1)
        fake_code = parts[1] if len(parts) == 2 else hyde_text
        batch = [query, fake_code]
    else:  # blend_concat (legacy default)
        batch = [query, hyde_text]
    encoded = model.encode(batch, convert_to_numpy=True, show_progress_bar=False)
    encoded = normalize_vectors(encoded.astype(np.float32))
    q_pure = encoded[0]
    q_hyde = encoded[1]
    blended = (1.0 - hyde_weight) * q_pure + hyde_weight * q_hyde
    # Re-normalize after the linear blend so cosine similarity stays well-scaled
    norm = np.linalg.norm(blended)
    if norm > 1e-9:
        blended = blended / norm
    return np.dot(vectors_norm, blended)


def rrf_fuse(rankings: List[List[int]], k: int = 60) -> Dict[int, float]:
    fused = defaultdict(float)
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, start=1):
            fused[doc_id] += 1.0 / (k + rank)
    return fused


def query_technicality_score(query: str) -> float:
    q = query or ""
    q_tokens = tokenize(q)
    if not q_tokens:
        return 0.0

    score = 0.0
    for t in q_tokens:
        if TECH_TOKEN_RE.search(t):
            score += 1.0
        if "_" in t or "." in t:
            score += 0.5
        if t in {"sql", "stored", "metadata", "metadati", "route", "callback", "lookup", "workflow"}:
            score += 0.35
    capped = min(score / max(1.0, len(q_tokens) * 0.8), 1.0)
    return max(0.0, min(1.0, capped))


def build_index(
    input_jsonl: Path,
    output_dir: Path,
    model_name: str,
    batch_size: int = 64,
    hf_token: str = "",
    hf_token_env: str = "RAG_HF_TOKEN",
    resume_build: bool = False,
):
    docs = load_chunks(input_jsonl)
    if not docs:
        raise RuntimeError(f"No chunks found in {input_jsonl}")

    output_dir.mkdir(parents=True, exist_ok=True)
    vectors_path = output_dir / "vectors.npy"
    checkpoint_path = output_dir / "build_checkpoint.json"

    input_jsonl_r = str(input_jsonl.resolve())
    st = input_jsonl.stat()
    docs_fingerprint = compute_docs_fingerprint(docs)
    build_signature = {
        "model_name": model_name,
        "input_jsonl": input_jsonl_r,
        "input_size": int(st.st_size),
        "n_docs": len(docs),
        "docs_fingerprint": docs_fingerprint,
    }

    token = resolve_hf_token(hf_token, hf_token_env)
    model = load_sentence_transformer(model_name, token)
    texts = [d.get("text", "") for d in docs]
    n_docs = len(texts)

    start_idx = 0
    dim = 0
    vectors_norm = None

    if resume_build and checkpoint_path.exists() and vectors_path.exists():
        try:
            checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
            signature_ok = (
                checkpoint.get("model_name") == build_signature["model_name"]
                and checkpoint.get("input_jsonl") == build_signature["input_jsonl"]
                and int(checkpoint.get("n_docs", -1)) == build_signature["n_docs"]
                and str(checkpoint.get("docs_fingerprint", "")) == build_signature["docs_fingerprint"]
            )
            if signature_ok:
                start_idx = max(0, min(n_docs, int(checkpoint.get("next_index", 0))))
                dim = int(checkpoint.get("dim", 0))
                vectors_norm = np.load(vectors_path, mmap_mode="r+")
                if vectors_norm.shape != (n_docs, dim):
                    vectors_norm = None
                    start_idx = 0
                    dim = 0
                else:
                    print(f"[build] resume enabled: reusing vectors up to index {start_idx}/{n_docs}")
            else:
                print("[build] resume checkpoint ignored: input/model changed")
        except Exception:
            vectors_norm = None
            start_idx = 0
            dim = 0

    if vectors_norm is None:
        probe = model.encode([texts[0]], batch_size=1, show_progress_bar=False, convert_to_numpy=True).astype(np.float32)
        dim = int(probe.shape[1])
        vectors_norm = np.lib.format.open_memmap(vectors_path, mode="w+", dtype=np.float32, shape=(n_docs, dim))
        start_idx = 0
        if resume_build:
            write_json(
                checkpoint_path,
                {
                    **build_signature,
                    "dim": dim,
                    "next_index": start_idx,
                },
            )

    if start_idx < n_docs:
        total_batches = math.ceil(n_docs / batch_size) if batch_size > 0 else 0
        start_batch = math.ceil(start_idx / batch_size) if batch_size > 0 else 0
        t0 = time.time()
        for i in range(start_idx, n_docs, batch_size):
            j = min(i + batch_size, n_docs)
            batch_vec = model.encode(
                texts[i:j],
                batch_size=batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
            ).astype(np.float32)
            vectors_norm[i:j] = normalize_vectors(batch_vec)
            vectors_norm.flush()
            if resume_build:
                write_json(
                    checkpoint_path,
                    {
                        **build_signature,
                        "dim": dim,
                        "next_index": j,
                    },
                )
            current_batch = (j + batch_size - 1) // batch_size
            elapsed = max(1e-6, time.time() - t0)
            docs_done = max(0, j - start_idx)
            docs_total = max(1, n_docs - start_idx)
            docs_per_sec = docs_done / elapsed
            eta_sec = int(max(0.0, (docs_total - docs_done) / max(docs_per_sec, 1e-6)))
            print(
                f"[build] batch {current_batch}/{total_batches} "
                f"(docs {j}/{n_docs}, start {start_batch}/{total_batches}, "
                f"speed {docs_per_sec:.1f} docs/s, eta {eta_sec}s)"
            )

    bm25 = build_bm25(docs)

    with (output_dir / "metadata.jsonl").open("w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    with (output_dir / "bm25.pkl").open("wb") as f:
        pickle.dump(bm25, f)
    with (output_dir / "index_config.json").open("w", encoding="utf-8") as f:
        json.dump(
            {
                "model_name": model_name,
                "n_docs": len(docs),
                "input_jsonl": str(input_jsonl),
                "batch_size": batch_size,
            },
            f,
            indent=2,
        )
    if checkpoint_path.exists():
        try:
            checkpoint_path.unlink()
        except OSError:
            pass
    print(f"[build] docs={len(docs)} dim={dim} output={output_dir}")


def load_index(index_dir: Path, hf_token: str = "", hf_token_env: str = "RAG_HF_TOKEN"):
    vectors = np.load(index_dir / "vectors.npy")
    docs = load_chunks(index_dir / "metadata.jsonl")
    with (index_dir / "bm25.pkl").open("rb") as f:
        bm25 = pickle.load(f)
    with (index_dir / "index_config.json").open("r", encoding="utf-8") as f:
        cfg = json.load(f)
    token = resolve_hf_token(hf_token, hf_token_env)
    model = load_sentence_transformer(cfg["model_name"], token)
    return model, vectors, docs, bm25


def search_loaded(
    model: SentenceTransformer,
    vectors: np.ndarray,
    docs: List[dict],
    bm25: Dict,
    query: str,
    top_k: int = 8,
    # Defaults tuned on eval_queries.v3.jsonl (178 queries, Apr 2026):
    #   Hit@8 = 0.7303, MRR@8 = 0.4150 at these values.
    # Previous static defaults: Hit@8 = 0.6910, MRR@8 = 0.3925.
    # When adaptive_alpha=True, `alpha_vector` is overridden per-query by the
    # interpolation between alpha_vector_technical and alpha_vector_descriptive
    # based on query technicality. The 0.55 base is just the non-adaptive
    # fallback.
    alpha_vector: float = 0.55,
    alpha_bm25: float = 0.45,
    adaptive_alpha: bool = True,
    alpha_vector_technical: float = 0.10,
    alpha_vector_descriptive: float = 0.90,
    rerank_symbol_weight: float = 1.35,
    rerank_path_weight: float = 0.70,
    rerank_text_overlap_weight: float = 0.60,
    use_cross_encoder: bool = False,
    cross_encoder_model: str = DEFAULT_RERANKER_MODEL,
    # Re-tuned on eval_queries.v4_doclabels_relabel.jsonl (Apr 2026, Phase C):
    # top_n=40, blend=0.85, intent=0.00 with the LoRA v2 cross-encoder
    # (lora_ce_v4 / r=16, alpha=32, 4 epochs on v2 hard negatives) gives
    # hit@8(603 excl ui-themes) = 0.8690 / MRR = 0.7555 — best MRR cell of
    # the (blend in {0.65,0.85,1.00}, top_n in {20,30,40}) grid sweep.
    # blend=1.00 has marginally higher hit@8 (0.8723) but worse MRR (0.7505).
    # Light-rerank-only baseline on the same eval is 0.7396 / 0.5798.
    cross_encoder_top_n: int = 40,
    cross_encoder_blend: float = 0.85,
    cross_encoder_device: str = "auto",
    cross_encoder_batch_size: int = 32,
    cross_encoder_fp16: bool = True,
    cross_encoder_intent_weight: float = 0.00,
    use_hyde: bool = False,
    hyde_weight: float = 0.40,
    hyde_model: Optional[str] = None,
    hyde_device: str = "auto",
    hyde_fp16: bool = True,
    hyde_max_new_tokens: int = 96,
    hyde_mode: str = "blend_concat",
):
    eff_alpha_vector = alpha_vector
    eff_alpha_bm25 = alpha_bm25
    if adaptive_alpha:
        tech_score = query_technicality_score(query)
        # technical query -> lower vector weight, descriptive query -> higher vector weight
        eff_alpha_vector = alpha_vector_descriptive * (1.0 - tech_score) + alpha_vector_technical * tech_score
        eff_alpha_vector = float(max(0.0, min(1.0, eff_alpha_vector)))
        eff_alpha_bm25 = 1.0 - eff_alpha_vector

    # Dense retrieval: optionally expand the query via HyDE (a tiny code LLM
    # generates a fake C#/TS snippet, which is embedded alongside the raw
    # query). The BM25 path is deliberately NOT touched: synthetic code tokens
    # would hurt BM25 precision.
    if use_hyde:
        try:
            from hyde import get_hyde_generator, expand_query_with_hyde
            gen_kwargs = {"device": hyde_device, "fp16": hyde_fp16}
            if hyde_model:
                gen_kwargs["model_name"] = hyde_model
            generator = get_hyde_generator(**gen_kwargs)
            hyde_expanded = expand_query_with_hyde(
                query, generator=generator, max_new_tokens=hyde_max_new_tokens
            )
            vec = vector_scores_hyde(
                query, model, vectors, hyde_text=hyde_expanded,
                hyde_weight=hyde_weight, hyde_mode=hyde_mode,
            )
        except Exception as e:
            # Fall back to plain vector retrieval if HyDE fails (model not
            # downloaded, OOM, etc). The warning goes to stderr via print.
            import sys
            print(f"[hyde] fallback to plain retrieval: {e}", file=sys.stderr)
            vec = vector_scores(query, model, vectors)
    else:
        vec = vector_scores(query, model, vectors)
    lex = bm25_scores(query, bm25)

    vec_rank = np.argsort(-vec).tolist()
    lex_rank = np.argsort(-lex).tolist() if len(lex) else []
    fused = rrf_fuse([vec_rank[:200], lex_rank[:200]])

    # Min-max normalize vec and lex over the candidate pool so the linear
    # combination respects alpha weights. Without this, BM25 raw scores (range
    # ~0-50) crush vector cosine scores (range ~0-1) regardless of alpha.
    candidate_ids = list(fused.keys())
    if candidate_ids:
        vec_cand = np.array([float(vec[d]) for d in candidate_ids], dtype=np.float64)
        if len(lex):
            lex_cand = np.array([float(lex[d]) for d in candidate_ids], dtype=np.float64)
        else:
            lex_cand = np.zeros(len(candidate_ids), dtype=np.float64)

        def _minmax(x: np.ndarray) -> np.ndarray:
            if x.size == 0:
                return x
            lo = float(np.min(x))
            hi = float(np.max(x))
            if hi - lo < 1e-9:
                return np.zeros_like(x)
            return (x - lo) / (hi - lo)

        vec_n = _minmax(vec_cand)
        lex_n = _minmax(lex_cand)
        norm_by_id = {d: (float(vec_n[i]), float(lex_n[i])) for i, d in enumerate(candidate_ids)}
    else:
        norm_by_id = {}

    blended = []
    for doc_id, rrf_score in fused.items():
        v_n, l_n = norm_by_id.get(doc_id, (0.0, 0.0))
        s = eff_alpha_vector * v_n + eff_alpha_bm25 * l_n + rrf_score
        blended.append((doc_id, s))
    blended.sort(key=lambda x: x[1], reverse=True)

    candidates = [doc_id for doc_id, _ in blended[: max(30, top_k * 4)]]
    reranked = rerank_light(
        query,
        docs,
        candidates,
        symbol_weight=rerank_symbol_weight,
        path_weight=rerank_path_weight,
        text_overlap_weight=rerank_text_overlap_weight,
    )

    if use_cross_encoder and reranked:
        # Second-stage cross-encoder rerank: take the top-N from the light
        # rerank, score each (query, chunk) pair with the cross-encoder, then
        # blend with the light-rerank position to keep the heuristic priors.
        top_for_ce = reranked[:cross_encoder_top_n]
        ce_model = get_cross_encoder(cross_encoder_model, device=cross_encoder_device, fp16=cross_encoder_fp16)
        # Use the chunk text directly for cross-encoder scoring (truncate to a
        # reasonable length to avoid 512-token overflow on long methods).
        pairs = []
        for i in top_for_ce:
            t = docs[i].get("text", "") or ""
            if len(t) > 1500:
                t = t[:1500]
            pairs.append([query, t])
        ce_scores = ce_model.predict(pairs, batch_size=cross_encoder_batch_size, show_progress_bar=False)
        # Min-max normalize CE scores so they combine sanely with the light
        # rerank rank position.
        if len(ce_scores) > 0:
            ce_arr = np.asarray(ce_scores, dtype=np.float64)
            lo, hi = float(ce_arr.min()), float(ce_arr.max())
            if hi - lo < 1e-9:
                ce_norm = np.zeros_like(ce_arr)
            else:
                ce_norm = (ce_arr - lo) / (hi - lo)
        else:
            ce_norm = []
        # Combine: cross_encoder_blend * CE + (1 - blend) * (1 - rank/N)
        # so the original rerank order acts as a tiebreaker / prior. Also
        # re-apply the architectural intent path boost POST cross-encoder: the
        # CE is very good at semantic matching but occasionally promotes a
        # frontend `addRecord` when the query is "endpoint api per inserire"
        # because both are semantically about "insert". The intent boost fixes
        # this as a light tiebreaker.
        q_tokens_raw_ce = set(tokenize(query))
        n = max(1, len(top_for_ce))
        # Normalize intent boost on the post-CE pool too
        raw_intent_boosts = []
        for doc_id in top_for_ce:
            rp = (docs[doc_id].get("rel_path") or "").lower()
            raw_intent_boosts.append(compute_intent_path_boost(q_tokens_raw_ce, rp, 1.0))
        max_intent = max(raw_intent_boosts) if raw_intent_boosts else 0.0
        intent_norm = [(b / max_intent) if max_intent > 0 else 0.0 for b in raw_intent_boosts]

        blended_ce = []
        for rank_idx, (doc_id, ce_s) in enumerate(zip(top_for_ce, ce_norm)):
            light_score = 1.0 - (rank_idx / n)
            intent_bonus = intent_norm[rank_idx] * cross_encoder_intent_weight
            score = cross_encoder_blend * float(ce_s) + (1.0 - cross_encoder_blend) * light_score + intent_bonus
            # Source priority boost (Tier 1: docs+skill * 1.40, Tier 2: WuicTest * 1.30,
            # Tier 3: baseline * 1.00). Applicato DOPO il blend CE+light+intent in modo
            # che sia un moltiplicatore del ranking finale, non un bias pre-CE.
            rpath = docs[doc_id].get("rel_path") or ""
            score *= compute_source_priority_boost(rpath)
            blended_ce.append((doc_id, score))
        blended_ce.sort(key=lambda x: x[1], reverse=True)
        reranked = [d for d, _ in blended_ce] + reranked[cross_encoder_top_n:]

    reranked = reranked[:top_k]

    results = []
    for i in reranked:
        d = docs[i]
        results.append(
            {
                "score_vector": float(vec[i]),
                "score_bm25": float(lex[i]) if len(lex) else 0.0,
                "chunk_id": d.get("chunk_id"),
                "rel_path": d.get("rel_path"),
                "symbol_type": d.get("symbol_type"),
                "symbol_name": d.get("symbol_name"),
                "start_line": d.get("start_line"),
                "end_line": d.get("end_line"),
                "source": d.get("source"),
                "source_type": d.get("source_type"),
                "preview": (d.get("text", "")[:280] + "...") if len(d.get("text", "")) > 280 else d.get("text", ""),
            }
        )
    return results


def rerank_light(
    query: str,
    docs: List[dict],
    candidate_ids: List[int],
    symbol_weight: float = 1.35,
    path_weight: float = 0.85,
    text_overlap_weight: float = 1.00,
) -> List[int]:
    return rerank_light_weighted(
        query,
        docs,
        candidate_ids,
        symbol_weight=symbol_weight,
        path_weight=path_weight,
        text_overlap_weight=text_overlap_weight,
    )


# Italian -> English aliases for symbol/path matching. The codebase uses
# English identifiers (getTable, getColumn, addMenu, ...) while the eval
# queries are in Italian. Without expansion, the rerank's substring check
# (`if t in sname`) never fires for Italian tokens.
IT_EN_ALIASES = {
    "tabella": ["table"],
    "tabelle": ["table", "tables"],
    "colonna": ["column", "field"],
    "colonne": ["column", "columns", "field", "fields"],
    "campo": ["field", "column"],
    "campi": ["field", "fields", "column", "columns"],
    "voce": ["entry", "item"],
    "voci": ["entry", "entries", "item", "items"],
    "menu": ["menu"],
    "riga": ["row", "record"],
    "righe": ["row", "rows", "record", "records"],
    "record": ["record"],
    "pagina": ["page"],
    "pagine": ["page", "pages"],
    "ricerca": ["search", "find"],
    "cerca": ["search", "find"],
    "lettura": ["read", "get", "load"],
    "leggere": ["read", "get"],
    "leggi": ["read", "get"],
    "salvataggio": ["save", "store", "update", "insert"],
    "salva": ["save", "store"],
    "inserimento": ["insert", "add", "create"],
    "inserisci": ["insert", "add", "create"],
    "aggiunta": ["add", "insert", "create"],
    "aggiungi": ["add", "insert", "create"],
    "creazione": ["create", "new", "make"],
    "crea": ["create", "new"],
    "modifica": ["update", "edit", "modify"],
    "aggiornamento": ["update", "refresh"],
    "aggiorna": ["update", "refresh"],
    "cancellazione": ["delete", "remove"],
    "cancella": ["delete", "remove"],
    "eliminazione": ["delete", "remove"],
    "elimina": ["delete", "remove"],
    "ripristino": ["restore", "undelete"],
    "ripristina": ["restore"],
    "esecuzione": ["execute", "run", "exec"],
    "esegui": ["execute", "run"],
    "stampa": ["print", "report"],
    "esportazione": ["export"],
    "esporta": ["export"],
    "importazione": ["import"],
    "importa": ["import"],
    "report": ["report", "pdf", "print"],
    "scheda": ["form", "card"],
    "elenco": ["list", "grid"],
    "lista": ["list", "grid"],
    "griglia": ["grid", "datagrid"],
    "filtro": ["filter", "where"],
    "filtra": ["filter"],
    "ordinamento": ["sort", "order"],
    "ordina": ["sort", "order"],
    "metadati": ["metadata", "meta"],
    "metadato": ["metadata", "meta"],
    "utente": ["user"],
    "utenti": ["user", "users"],
    "permesso": ["permission", "auth", "role"],
    "permessi": ["permission", "permissions", "auth", "role", "roles"],
    "ruolo": ["role"],
    "ruoli": ["role", "roles"],
    "autenticazione": ["auth", "authenticate", "login"],
    "accesso": ["login", "access", "auth"],
    "uscita": ["logout"],
    "stored": ["stored", "procedure", "sproc"],
    "procedura": ["procedure", "stored"],
    "procedure": ["procedure", "stored"],
    "vista": ["view"],
    "viste": ["view", "views"],
    "tenant": ["tenant"],
    "notifica": ["notification", "notify"],
    "notifiche": ["notification", "notifications"],
    "schedulazione": ["scheduler", "schedule", "cron"],
    "schedulato": ["scheduled", "scheduler"],
    "completo": ["full", "complete"],
    "paginato": ["paged", "paginated", "page"],
    "paginazione": ["paging", "pagination", "page"],
    "lookup": ["lookup", "combo", "select"],
    "combo": ["combo", "lookup", "dropdown"],
    "dashboard": ["dashboard", "board"],
    "workflow": ["workflow", "wf", "graph"],
    "grafo": ["graph", "workflow"],
    "albero": ["tree"],
    "nodo": ["node"],
}


def expand_query_tokens(q_tokens: set) -> set:
    """Add English aliases for Italian tokens. Returns a superset."""
    expanded = set(q_tokens)
    for tok in q_tokens:
        for alias in IT_EN_ALIASES.get(tok, ()):
            expanded.add(alias)
    return expanded


# Architectural intent: when the user mentions one of the trigger tokens, the
# corresponding path segments should be boosted because they identify the
# architectural layer the user is asking about. Each entry maps a set of query
# tokens to a list of path fragments to boost.
INTENT_PATH_BOOSTS = (
    # API / endpoint -> Controllers
    ({"endpoint", "api", "controller", "controllers", "rest"}, ("/controllers/",)),
    # Service / business logic -> Services (server)
    ({"service", "servizio", "servizi", "logica", "business"}, ("/services/",)),
    # Helper / utility
    ({"helper", "helpers", "utility", "utilities", "util"}, ("/helpers/",)),
    # Metadata model / entity / SQL build
    ({"metamodel", "entita", "entity", "entities", "modello"}, ("/metamodel/",)),
    # Frontend service / component (client)
    ({"frontend", "client", "componente", "component", "angular"}, ("/wuic-framework-lib/src/lib/",)),
    # Workflow
    ({"workflow", "graph", "grafo", "runner", "designer"}, ("/workflow-runner/", "/workflow-designer/", "workflow-runtime")),
    # Auth
    ({"auth", "autenticazione", "login", "logout", "accesso"}, ("/authcontroller", "auth-session")),
    # Notifications
    ({"notifica", "notifiche", "notification", "notifications"}, ("/notificationscontroller", "/notifications/")),
    # Reports
    ({"report", "reportistica", "stampa", "pdf"}, ("/reportdesignercontroller", "/report-")),
    # DataSource component
    ({"datasource", "data-source", "grid", "griglia"}, ("/data-source/", "/list-grid/")),
    # Menu
    ({"menu", "voce", "voci"}, ("/meta-menu/", "metamodelraw")),
    # Scheduler
    ({"scheduler", "schedulazione", "schedulato", "cron"}, ("/scheduler", "scheduler_")),
    # Pivot
    ({"pivot", "pivoting"}, ("pivot",)),
    # Import / Export
    ({"import", "importazione", "importa"}, ("/import-export-button/", "import")),
    ({"export", "esportazione", "esporta"}, ("/import-export-button/", "export")),
)


def compute_intent_path_boost(q_tokens_raw: set, rpath_lower: str, intent_weight: float) -> float:
    """Return a flat boost for chunks whose path matches the query's intent layer."""
    if not q_tokens_raw or not rpath_lower:
        return 0.0
    boost = 0.0
    for triggers, fragments in INTENT_PATH_BOOSTS:
        if q_tokens_raw & triggers:
            for frag in fragments:
                if frag in rpath_lower:
                    boost += intent_weight
                    break
    return boost


# Source priority tier. Applied as a multiplicative boost to the final CE-blended
# score: docs/skill chunks ARE user-facing ground truth (spiegazioni + snippet
# mirati ai consumatori del framework), WuicTest/ sono esempi curati dei pattern
# architetturali, il codice core del framework e' Tier-3 (baseline). Questo
# fa emergere le pagine di docs e le skill quando matchano semanticamente, anche
# se il CE da' score leggermente piu' alto a un chunk di codice core.
#
# Valori tunati empiricamente 2026-04-20 sul set v4 doclabels relabel holdout.
SOURCE_TIER_DOCS = 1.40         # docs/pages/*.md + skills/**/*.md
SOURCE_TIER_WUICTEST = 1.30     # WuicTest/* (esempi ready-to-read)
SOURCE_TIER_CORE = 1.00         # tutto il resto (baseline)


def compute_source_priority_boost(rpath: str) -> float:
    """
    Ritorna un moltiplicatore su score finale in base al tier del source file.
    Il matching e' case-insensitive su rel_path normalizzato a forward slash.
    """
    if not rpath:
        return SOURCE_TIER_CORE
    norm = rpath.replace("\\", "/").lower()
    # Tier 1: documentazione + skill guides
    if "/docs/pages/" in norm and norm.endswith(".md"):
        return SOURCE_TIER_DOCS
    if "/skills/" in norm and norm.endswith(".md"):
        return SOURCE_TIER_DOCS
    # Tier 2: esempi WuicTest
    if norm.startswith("wuictest/") or "/wuictest/" in norm:
        return SOURCE_TIER_WUICTEST
    # Tier 3: baseline
    return SOURCE_TIER_CORE


def rerank_light_weighted(
    query: str,
    docs: List[dict],
    candidate_ids: List[int],
    symbol_weight: float = 1.35,
    path_weight: float = 0.85,
    text_overlap_weight: float = 1.00,
    method_type_bonus: float = 0.45,
    class_type_penalty: float = 0.30,
    window_type_penalty: float = 0.50,
    intent_path_weight: float = 0.70,
) -> List[int]:
    q_tokens_raw = set(tokenize(query))
    if not q_tokens_raw:
        return candidate_ids
    # Expanded query tokens are used for symbol/path/text matching so that
    # Italian queries can match English identifiers (tabella -> table, ...).
    q_tokens = expand_query_tokens(q_tokens_raw)
    n_q = max(1, len(q_tokens))
    # Detect when the query explicitly asks for a class/component, in which case
    # the class-type penalty should NOT apply.
    asks_for_class = any(t in q_tokens_raw for t in {"classe", "class", "componente", "component", "service", "servizio"})
    scored = []
    for i in candidate_ids:
        text = docs[i].get("text", "")
        toks = set(tokenize(text))
        # Recall normalized: fraction of query tokens present in the doc.
        # This bounds the overlap score in [0, 1] and stops favoring long
        # documents purely because they have more tokens.
        overlap_recall = len(q_tokens.intersection(toks)) / n_q
        overlap = overlap_recall * text_overlap_weight
        symbol_bonus = 0.0
        path_bonus = 0.0
        sname = (docs[i].get("symbol_name") or "").lower()
        rpath = (docs[i].get("rel_path") or "").lower()
        for t in q_tokens:
            if t in sname:
                symbol_bonus += symbol_weight
            if t in rpath:
                path_bonus += path_weight
        exact_symbol = 1.25 if sname and (sname in (query or "").lower()) else 0.0

        # Symbol-type bias: most user queries refer to a *method* of business
        # logic, not the wrapper class. Class chunks include the entire file
        # text and unfairly win on text overlap. Method chunks should be
        # preferred unless the query explicitly mentions class/component.
        sym_type = (docs[i].get("symbol_type") or "").lower()
        type_bias = 0.0
        if sym_type == "method":
            type_bias = method_type_bonus
        elif sym_type == "class" and not asks_for_class:
            type_bias = -class_type_penalty
        elif sym_type == "window":
            # Sliding-window chunks are usually noise (long generic text);
            # penalize them so a real symbol always wins on a tie.
            type_bias = -window_type_penalty

        # Architectural intent boost: if the query mentions "endpoint",
        # "service", "helper", etc. and the chunk lives in the matching
        # directory, give it a flat boost.
        intent_boost = compute_intent_path_boost(q_tokens_raw, rpath, intent_path_weight)

        scored.append((i, overlap + symbol_bonus + path_bonus + exact_symbol + type_bias + intent_boost))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [i for i, _ in scored]


def search(
    index_dir: Path,
    query: str,
    top_k: int = 8,
    alpha_vector: float = 0.55,
    alpha_bm25: float = 0.45,
    adaptive_alpha: bool = True,
    alpha_vector_technical: float = 0.10,
    alpha_vector_descriptive: float = 0.90,
    rerank_symbol_weight: float = 1.35,
    rerank_path_weight: float = 0.70,
    rerank_text_overlap_weight: float = 0.60,
    hf_token: str = "",
    hf_token_env: str = "RAG_HF_TOKEN",
    use_cross_encoder: bool = False,
    # See search() for the rationale; defaults match the Phase C grid winner.
    cross_encoder_top_n: int = 40,
    cross_encoder_blend: float = 0.85,
    cross_encoder_device: str = "auto",
    cross_encoder_batch_size: int = 32,
    cross_encoder_fp16: bool = True,
    cross_encoder_intent_weight: float = 0.00,
    use_hyde: bool = False,
    hyde_weight: float = 0.40,
    hyde_model: Optional[str] = None,
    hyde_device: str = "auto",
    hyde_fp16: bool = True,
    hyde_max_new_tokens: int = 96,
    hyde_mode: str = "blend_concat",
):
    token = resolve_hf_token(hf_token, hf_token_env)
    if token:
        os.environ["HF_TOKEN"] = token
    model, vectors, docs, bm25 = load_index(index_dir, hf_token=token, hf_token_env=hf_token_env)
    return search_loaded(
        model=model,
        vectors=vectors,
        docs=docs,
        bm25=bm25,
        query=query,
        top_k=top_k,
        alpha_vector=alpha_vector,
        alpha_bm25=alpha_bm25,
        adaptive_alpha=adaptive_alpha,
        alpha_vector_technical=alpha_vector_technical,
        alpha_vector_descriptive=alpha_vector_descriptive,
        rerank_symbol_weight=rerank_symbol_weight,
        rerank_path_weight=rerank_path_weight,
        rerank_text_overlap_weight=rerank_text_overlap_weight,
        use_cross_encoder=use_cross_encoder,
        cross_encoder_top_n=cross_encoder_top_n,
        cross_encoder_blend=cross_encoder_blend,
        cross_encoder_device=cross_encoder_device,
        cross_encoder_batch_size=cross_encoder_batch_size,
        cross_encoder_fp16=cross_encoder_fp16,
        cross_encoder_intent_weight=cross_encoder_intent_weight,
        use_hyde=use_hyde,
        hyde_weight=hyde_weight,
        hyde_model=hyde_model,
        hyde_device=hyde_device,
        hyde_fp16=hyde_fp16,
        hyde_max_new_tokens=hyde_max_new_tokens,
        hyde_mode=hyde_mode,
    )


def cmd_build(args):
    build_index(
        input_jsonl=Path(args.input_jsonl),
        output_dir=Path(args.output_dir),
        model_name=args.model,
        batch_size=args.batch_size,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
        resume_build=args.resume_build,
    )


_TRANSLATE_CACHE: Dict[str, str] | None = None
_TRANSLATE_CACHE_PATH: Path | None = None


def _maybe_translate_query_it_en(query: str, cache_path: Path) -> str:
    """Translate an Italian query to English using a persistent file cache.

    Reads `cache_path` once into a process-level dict, falls back to a live
    NLLB translation on cache miss, and writes the new entry back to disk so
    future calls (and other tools sharing the cache) skip the model load.
    """
    global _TRANSLATE_CACHE, _TRANSLATE_CACHE_PATH
    if _TRANSLATE_CACHE is None or _TRANSLATE_CACHE_PATH != cache_path:
        if cache_path.exists():
            try:
                _TRANSLATE_CACHE = json.loads(cache_path.read_text(encoding="utf-8"))
            except Exception:
                _TRANSLATE_CACHE = {}
        else:
            _TRANSLATE_CACHE = {}
        _TRANSLATE_CACHE_PATH = cache_path

    cached = _TRANSLATE_CACHE.get(query)
    if cached:
        return cached

    # Cache miss: lazy-import the live translator (loads NLLB ~1.2GB).
    from build_translate_cache import translate_it_en
    en = translate_it_en(query)
    _TRANSLATE_CACHE[query] = en
    try:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(_TRANSLATE_CACHE, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[query] warning: failed to persist translation cache: {e}")
    return en


def _run_search_with_args(args, query_text: str):
    """Single source of truth for `search(...)` invocation from cmd_query, so
    the LoRA path and the base path don't drift."""
    return search(
        Path(args.index_dir),
        query_text,
        top_k=args.top_k,
        alpha_vector=args.alpha_vector,
        alpha_bm25=args.alpha_bm25,
        adaptive_alpha=args.adaptive_alpha,
        alpha_vector_technical=args.alpha_vector_technical,
        alpha_vector_descriptive=args.alpha_vector_descriptive,
        rerank_symbol_weight=args.rerank_symbol_weight,
        rerank_path_weight=args.rerank_path_weight,
        rerank_text_overlap_weight=args.rerank_text_overlap_weight,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
        use_cross_encoder=getattr(args, "use_cross_encoder", False),
        cross_encoder_top_n=getattr(args, "cross_encoder_top_n", 40),
        cross_encoder_blend=getattr(args, "cross_encoder_blend", 0.85),
        cross_encoder_device=getattr(args, "cross_encoder_device", "auto"),
        cross_encoder_batch_size=getattr(args, "cross_encoder_batch_size", 32),
        cross_encoder_fp16=not getattr(args, "cross_encoder_no_fp16", False),
        cross_encoder_intent_weight=getattr(args, "cross_encoder_intent_weight", 0.50),
        use_hyde=getattr(args, "use_hyde", False),
        hyde_weight=getattr(args, "hyde_weight", 0.35),
        hyde_mode=getattr(args, "hyde_mode", "blend_code"),
        hyde_device=getattr(args, "hyde_device", "auto"),
        hyde_fp16=not getattr(args, "hyde_no_fp16", False),
    )


def cmd_query(args):
    query_text = args.query
    if getattr(args, "translate_query", True):
        cache_path = Path(getattr(args, "translate_cache", r"c:/src/Wuic/codebase_embeddings/_translate_cache_v3.json"))
        translated = _maybe_translate_query_it_en(query_text, cache_path)
        if translated and translated != query_text:
            print(f"[query] translated IT->EN: {translated}")
            query_text = translated

    # Auto-detect LoRA adapter and install it as the cross-encoder if present.
    # Opt out with --no-use-lora-ce; override the path with --lora-ce-dir; the
    # cross-encoder must itself be enabled (it is by default per the v3 ablation
    # winner). Patches `get_cross_encoder` in the module globals so search_loaded
    # picks up the wrapper without having to thread a new arg through the stack.
    use_lora_ce = bool(getattr(args, "use_lora_ce", True)) and bool(getattr(args, "use_cross_encoder", True))
    lora_dir = getattr(args, "lora_ce_dir", None) or DEFAULT_LORA_CE_DIR
    adapter_present = (Path(lora_dir) / "adapter_config.json").is_file()

    if use_lora_ce and adapter_present:
        print(f"[query] using LoRA-tuned cross-encoder adapter from {lora_dir}")
        wrapper = get_lora_cross_encoder(
            adapter_dir=str(lora_dir),
            base_model=DEFAULT_RERANKER_MODEL,
            device=getattr(args, "cross_encoder_device", "auto"),
            fp16=not getattr(args, "cross_encoder_no_fp16", False),
        )
        # Module-level rebind so search_loaded() (same module) picks up the
        # wrapper instead of the original sentence_transformers CrossEncoder.
        _module = sys.modules[__name__]
        _orig_get_ce = _module.get_cross_encoder
        _module.get_cross_encoder = lambda model_name=None, device="auto", fp16=True: wrapper
        try:
            results = _run_search_with_args(args, query_text)
        finally:
            _module.get_cross_encoder = _orig_get_ce
    else:
        results = _run_search_with_args(args, query_text)

    print(json.dumps(results, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Build/query hybrid RAG index for Wuic codebase chunks.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build", help="Build vector+BM25 index.")
    p_build.add_argument("--input-jsonl", default=r"c:/src/Wuic/codebase_docs/code_chunks.jsonl")
    p_build.add_argument("--output-dir", default=r"c:/src/Wuic/codebase_embeddings/index")
    p_build.add_argument("--model", default=os.getenv("RAG_EMBED_MODEL", DEFAULT_MODEL))
    p_build.add_argument("--batch-size", type=int, default=int(os.getenv("RAG_BATCH_SIZE", "64")))
    p_build.add_argument("--resume-build", action="store_true")
    p_build.add_argument("--hf-token", default="")
    p_build.add_argument("--hf-token-env", default="RAG_HF_TOKEN")
    p_build.set_defaults(func=cmd_build)

    p_query = sub.add_parser("query", help="Query hybrid index.")
    p_query.add_argument("--index-dir", default=r"c:/src/Wuic/codebase_embeddings/index")
    p_query.add_argument("--query", required=True)
    p_query.add_argument("--top-k", type=int, default=8)
    p_query.add_argument("--alpha-vector", type=float, default=0.55)
    p_query.add_argument("--alpha-bm25", type=float, default=0.45)
    p_query.add_argument(
        "--adaptive-alpha",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Adapt alpha_vector per query based on technicality score. Use --no-adaptive-alpha to disable.",
    )
    p_query.add_argument("--alpha-vector-technical", type=float, default=0.10)
    p_query.add_argument("--alpha-vector-descriptive", type=float, default=0.90)
    p_query.add_argument("--rerank-symbol-weight", type=float, default=1.35)
    p_query.add_argument("--rerank-path-weight", type=float, default=0.70)
    p_query.add_argument("--rerank-text-overlap-weight", type=float, default=0.60)
    p_query.add_argument(
        "--use-cross-encoder",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="BAAI/bge-reranker-v2-m3 second-stage rerank. ON by default (best ablation winner). "
             "Use --no-use-cross-encoder to disable. ~600MB first-time download.",
    )
    p_query.add_argument(
        "--translate-query",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Translate Italian queries to English (NLLB-distilled-600M) before searching. "
             "ON by default (best ablation winner: en_only+CE). Use --no-translate-query to disable. "
             "First miss loads NLLB ~1.2GB; results are persisted to --translate-cache.",
    )
    p_query.add_argument(
        "--translate-cache",
        default=r"c:/src/Wuic/codebase_embeddings/_translate_cache_v3.json",
        help="Path to the IT->EN translation cache (read on lookup, written on cache miss).",
    )
    p_query.add_argument(
        "--use-lora-ce",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Use the LoRA-tuned cross-encoder adapter from --lora-ce-dir if it exists. "
             "ON by default; falls back to the base CE if no adapter is found. "
             "Use --no-use-lora-ce to force the base CE even when an adapter is present. "
             "Requires --use-cross-encoder.",
    )
    p_query.add_argument(
        "--lora-ce-dir",
        default=DEFAULT_LORA_CE_DIR,
        help="Directory containing the LoRA adapter (adapter_config.json + adapter_model.safetensors).",
    )
    p_query.add_argument("--cross-encoder-top-n", type=int, default=40)
    p_query.add_argument("--cross-encoder-blend", type=float, default=0.85)
    p_query.add_argument("--cross-encoder-intent-weight", type=float, default=0.00,
                         help="Post-CE architectural intent path boost weight (0.0 to disable)")
    p_query.add_argument("--use-hyde", action="store_true",
                         help="EXPERIMENTAL: enable HyDE (LLM-based query expansion). Adds ~0.5-2s/query and is NOT expected to improve the already-tuned pipeline.")
    p_query.add_argument("--hyde-weight", type=float, default=0.35)
    p_query.add_argument("--hyde-mode", default="blend_code",
                         choices=["blend_concat", "blend_code", "max"])
    p_query.add_argument("--hyde-device", default="auto")
    p_query.add_argument("--hyde-no-fp16", action="store_true")
    p_query.add_argument("--cross-encoder-device", default="auto",
                         help="Device for cross-encoder: 'auto' (cuda if available), 'cuda', 'cpu'")
    p_query.add_argument("--cross-encoder-batch-size", type=int, default=32)
    p_query.add_argument("--cross-encoder-no-fp16", action="store_true",
                         help="Disable FP16 for cross-encoder (FP16 is on by default on cuda, ~3x speedup)")
    p_query.add_argument("--hf-token", default="")
    p_query.add_argument("--hf-token-env", default="RAG_HF_TOKEN")
    p_query.set_defaults(func=cmd_query)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

