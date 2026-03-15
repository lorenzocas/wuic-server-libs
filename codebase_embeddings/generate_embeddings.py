import argparse
import json
import math
import os
import pickle
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_MODEL = "all-MiniLM-L6-v2"
TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_\.]{1,}")


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


def rrf_fuse(rankings: List[List[int]], k: int = 60) -> Dict[int, float]:
    fused = defaultdict(float)
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, start=1):
            fused[doc_id] += 1.0 / (k + rank)
    return fused


def build_index(
    input_jsonl: Path,
    output_dir: Path,
    model_name: str,
    batch_size: int = 64,
    hf_token: str = "",
    hf_token_env: str = "RAG_HF_TOKEN",
):
    docs = load_chunks(input_jsonl)
    if not docs:
        raise RuntimeError(f"No chunks found in {input_jsonl}")

    token = resolve_hf_token(hf_token, hf_token_env)
    model = load_sentence_transformer(model_name, token)
    texts = [d.get("text", "") for d in docs]
    vectors = model.encode(texts, batch_size=batch_size, show_progress_bar=True, convert_to_numpy=True).astype(np.float32)
    vectors_norm = normalize_vectors(vectors)

    bm25 = build_bm25(docs)

    output_dir.mkdir(parents=True, exist_ok=True)
    np.save(output_dir / "vectors.npy", vectors_norm)
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
            },
            f,
            indent=2,
        )
    print(f"[build] docs={len(docs)} dim={vectors_norm.shape[1]} output={output_dir}")


def load_index(index_dir: Path):
    vectors = np.load(index_dir / "vectors.npy")
    docs = load_chunks(index_dir / "metadata.jsonl")
    with (index_dir / "bm25.pkl").open("rb") as f:
        bm25 = pickle.load(f)
    with (index_dir / "index_config.json").open("r", encoding="utf-8") as f:
        cfg = json.load(f)
    token = resolve_hf_token()
    model = load_sentence_transformer(cfg["model_name"], token)
    return model, vectors, docs, bm25


def rerank_light(query: str, docs: List[dict], candidate_ids: List[int]) -> List[int]:
    q_tokens = set(tokenize(query))
    if not q_tokens:
        return candidate_ids
    scored = []
    for i in candidate_ids:
        text = docs[i].get("text", "")
        toks = tokenize(text)
        overlap = len(q_tokens.intersection(toks))
        symbol_bonus = 0
        sname = (docs[i].get("symbol_name") or "").lower()
        for t in q_tokens:
            if t in sname:
                symbol_bonus += 1
        scored.append((i, overlap + symbol_bonus * 0.75))
    scored.sort(key=lambda x: x[1], reverse=True)
    return [i for i, _ in scored]


def search(
    index_dir: Path,
    query: str,
    top_k: int = 8,
    alpha_vector: float = 0.65,
    alpha_bm25: float = 0.35,
    hf_token: str = "",
    hf_token_env: str = "RAG_HF_TOKEN",
):
    token = resolve_hf_token(hf_token, hf_token_env)
    if token:
        os.environ["HF_TOKEN"] = token
    model, vectors, docs, bm25 = load_index(index_dir)
    vec = vector_scores(query, model, vectors)
    lex = bm25_scores(query, bm25)

    vec_rank = np.argsort(-vec).tolist()
    lex_rank = np.argsort(-lex).tolist() if len(lex) else []
    fused = rrf_fuse([vec_rank[:200], lex_rank[:200]])

    blended = []
    for doc_id, rrf_score in fused.items():
        s = alpha_vector * float(vec[doc_id]) + alpha_bm25 * float(lex[doc_id]) + rrf_score
        blended.append((doc_id, s))
    blended.sort(key=lambda x: x[1], reverse=True)

    candidates = [doc_id for doc_id, _ in blended[: max(30, top_k * 4)]]
    reranked = rerank_light(query, docs, candidates)[:top_k]

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


def cmd_build(args):
    build_index(
        input_jsonl=Path(args.input_jsonl),
        output_dir=Path(args.output_dir),
        model_name=args.model,
        batch_size=args.batch_size,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
    )


def cmd_query(args):
    results = search(
        Path(args.index_dir),
        args.query,
        top_k=args.top_k,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Build/query hybrid RAG index for Wuic codebase chunks.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_build = sub.add_parser("build", help="Build vector+BM25 index.")
    p_build.add_argument("--input-jsonl", default=r"c:/src/Wuic/codebase_docs/code_chunks.jsonl")
    p_build.add_argument("--output-dir", default=r"c:/src/Wuic/codebase_embeddings/index")
    p_build.add_argument("--model", default=os.getenv("RAG_EMBED_MODEL", DEFAULT_MODEL))
    p_build.add_argument("--batch-size", type=int, default=64)
    p_build.add_argument("--hf-token", default="")
    p_build.add_argument("--hf-token-env", default="RAG_HF_TOKEN")
    p_build.set_defaults(func=cmd_build)

    p_query = sub.add_parser("query", help="Query hybrid index.")
    p_query.add_argument("--index-dir", default=r"c:/src/Wuic/codebase_embeddings/index")
    p_query.add_argument("--query", required=True)
    p_query.add_argument("--top-k", type=int, default=8)
    p_query.add_argument("--hf-token", default="")
    p_query.add_argument("--hf-token-env", default="RAG_HF_TOKEN")
    p_query.set_defaults(func=cmd_query)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
