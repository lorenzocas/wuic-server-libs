import argparse
import json
from pathlib import Path
from typing import Dict, List, Tuple

from generate_embeddings import load_index, search_loaded


def load_eval_cases(path: Path) -> List[Dict]:
    cases = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cases.append(json.loads(line))
    return cases


def matches_rule(result: Dict, rule: Dict) -> bool:
    rel_path = (result.get("rel_path") or "").lower()
    symbol_name = (result.get("symbol_name") or "").lower()
    symbol_type = (result.get("symbol_type") or "").lower()
    source = (result.get("source") or "").lower()
    source_type = (result.get("source_type") or "").lower()

    path_contains = (rule.get("rel_path_contains") or "").lower()
    exact_path = (rule.get("rel_path") or "").lower()
    expected_symbol = (rule.get("symbol_name") or "").lower()
    expected_symbol_type = (rule.get("symbol_type") or "").lower()
    expected_source = (rule.get("source") or "").lower()
    expected_source_type = (rule.get("source_type") or "").lower()

    if path_contains and path_contains not in rel_path:
        return False
    if exact_path and exact_path != rel_path:
        return False
    if expected_symbol and expected_symbol not in symbol_name:
        return False
    if expected_symbol_type and expected_symbol_type != symbol_type:
        return False
    if expected_source and expected_source != source:
        return False
    if expected_source_type and expected_source_type != source_type:
        return False
    return True


def evaluate_case(results: List[Dict], expected_rules: List[Dict]) -> Tuple[bool, float, int]:
    first_hit_rank = -1
    for idx, res in enumerate(results, start=1):
        if any(matches_rule(res, rule) for rule in expected_rules):
            first_hit_rank = idx
            break

    if first_hit_rank == -1:
        return False, 0.0, -1
    return True, 1.0 / first_hit_rank, first_hit_rank


def run_eval(
    index_dir: Path,
    eval_file: Path,
    top_k: int,
    hf_token: str = "",
    hf_token_env: str = "RAG_HF_TOKEN",
    alpha_vector: float = 0.65,
    alpha_bm25: float = 0.35,
    adaptive_alpha: bool = False,
    alpha_vector_technical: float = 0.20,
    alpha_vector_descriptive: float = 0.80,
    rerank_symbol_weight: float = 1.35,
    rerank_path_weight: float = 0.85,
    rerank_text_overlap_weight: float = 1.00,
) -> Dict:
    cases = load_eval_cases(eval_file)
    if not cases:
        raise RuntimeError(f"No eval cases found in {eval_file}")

    model, vectors, docs, bm25 = load_index(index_dir, hf_token=hf_token, hf_token_env=hf_token_env)

    hit_count = 0
    reciprocal_sum = 0.0
    details = []

    for case in cases:
        query = case["query"]
        expected = case.get("expected", [])
        if not expected:
            raise ValueError(f"Case without expected rules: {case}")

        results = search_loaded(
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
        )
        hit, rr, rank = evaluate_case(results, expected)

        if hit:
            hit_count += 1
            reciprocal_sum += rr

        details.append(
            {
                "query": query,
                "hit": hit,
                "first_hit_rank": rank,
                "top_result": results[0] if results else None,
            }
        )

    total = len(cases)
    metrics = {
        "total_cases": total,
        f"hit@{top_k}": hit_count / total,
        "mrr": reciprocal_sum / total,
        "alpha_vector": alpha_vector,
        "alpha_bm25": alpha_bm25,
        "adaptive_alpha": adaptive_alpha,
        "alpha_vector_technical": alpha_vector_technical,
        "alpha_vector_descriptive": alpha_vector_descriptive,
        "rerank_symbol_weight": rerank_symbol_weight,
        "rerank_path_weight": rerank_path_weight,
        "rerank_text_overlap_weight": rerank_text_overlap_weight,
        "details": details,
    }
    return metrics


def main():
    parser = argparse.ArgumentParser(description="Evaluate RAG index quality (Hit@K, MRR) on query goldset.")
    parser.add_argument("--index-dir", default=r"c:/src/Wuic/codebase_embeddings/index")
    parser.add_argument("--eval-file", default=r"c:/src/Wuic/codebase_embeddings/eval_queries.jsonl")
    parser.add_argument("--top-k", type=int, default=8)
    parser.add_argument("--output-json", default=r"c:/src/Wuic/codebase_embeddings/eval_results.json")
    parser.add_argument("--hf-token", default="")
    parser.add_argument("--hf-token-env", default="RAG_HF_TOKEN")
    parser.add_argument("--alpha-vector", type=float, default=0.65)
    parser.add_argument("--alpha-bm25", type=float, default=0.35)
    parser.add_argument("--adaptive-alpha", action="store_true")
    parser.add_argument("--alpha-vector-technical", type=float, default=0.20)
    parser.add_argument("--alpha-vector-descriptive", type=float, default=0.80)
    parser.add_argument("--rerank-symbol-weight", type=float, default=1.35)
    parser.add_argument("--rerank-path-weight", type=float, default=0.85)
    parser.add_argument("--rerank-text-overlap-weight", type=float, default=1.00)
    args = parser.parse_args()

    metrics = run_eval(
        Path(args.index_dir),
        Path(args.eval_file),
        args.top_k,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
        alpha_vector=args.alpha_vector,
        alpha_bm25=args.alpha_bm25,
        adaptive_alpha=args.adaptive_alpha,
        alpha_vector_technical=args.alpha_vector_technical,
        alpha_vector_descriptive=args.alpha_vector_descriptive,
        rerank_symbol_weight=args.rerank_symbol_weight,
        rerank_path_weight=args.rerank_path_weight,
        rerank_text_overlap_weight=args.rerank_text_overlap_weight,
    )
    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({k: v for k, v in metrics.items() if k != "details"}, indent=2, ensure_ascii=False))
    print(f"[eval] details written to: {output_path}")


if __name__ == "__main__":
    main()
