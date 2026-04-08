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
    alpha_vector: float = 0.55,
    alpha_bm25: float = 0.45,
    adaptive_alpha: bool = True,
    alpha_vector_technical: float = 0.10,
    alpha_vector_descriptive: float = 0.90,
    rerank_symbol_weight: float = 1.35,
    rerank_path_weight: float = 0.70,
    rerank_text_overlap_weight: float = 0.60,
    use_cross_encoder: bool = False,
    cross_encoder_top_n: int = 20,
    cross_encoder_blend: float = 0.65,
    cross_encoder_device: str = "auto",
    cross_encoder_batch_size: int = 32,
    cross_encoder_fp16: bool = True,
    cross_encoder_intent_weight: float = 0.00,
    use_hyde: bool = False,
    hyde_weight: float = 0.40,
    hyde_device: str = "auto",
    hyde_fp16: bool = True,
    hyde_max_new_tokens: int = 96,
    hyde_mode: str = "blend_concat",
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
            use_cross_encoder=use_cross_encoder,
            cross_encoder_top_n=cross_encoder_top_n,
            cross_encoder_blend=cross_encoder_blend,
            cross_encoder_device=cross_encoder_device,
            cross_encoder_batch_size=cross_encoder_batch_size,
            cross_encoder_fp16=cross_encoder_fp16,
            cross_encoder_intent_weight=cross_encoder_intent_weight,
            use_hyde=use_hyde,
            hyde_weight=hyde_weight,
            hyde_device=hyde_device,
            hyde_fp16=hyde_fp16,
            hyde_max_new_tokens=hyde_max_new_tokens,
            hyde_mode=hyde_mode,
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
    parser.add_argument("--alpha-vector", type=float, default=0.55)
    parser.add_argument("--alpha-bm25", type=float, default=0.45)
    parser.add_argument(
        "--adaptive-alpha",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Adapt alpha_vector per query based on technicality score. Use --no-adaptive-alpha to disable.",
    )
    parser.add_argument("--alpha-vector-technical", type=float, default=0.10)
    parser.add_argument("--alpha-vector-descriptive", type=float, default=0.90)
    parser.add_argument("--rerank-symbol-weight", type=float, default=1.35)
    parser.add_argument("--rerank-path-weight", type=float, default=0.70)
    parser.add_argument("--rerank-text-overlap-weight", type=float, default=0.60)
    parser.add_argument("--use-cross-encoder", action="store_true",
                        help="Enable BAAI/bge-reranker-v2-m3 second-stage rerank (~600MB download first time)")
    parser.add_argument("--cross-encoder-top-n", type=int, default=20)
    parser.add_argument("--cross-encoder-blend", type=float, default=0.65)
    parser.add_argument("--cross-encoder-intent-weight", type=float, default=0.00,
                        help="Post-CE architectural intent path boost weight (0.0 to disable)")
    parser.add_argument("--use-hyde", action="store_true",
                        help="EXPERIMENTAL: HyDE query expansion (did not improve metrics in our tests)")
    parser.add_argument("--hyde-weight", type=float, default=0.35)
    parser.add_argument("--hyde-mode", default="blend_code",
                        choices=["blend_concat", "blend_code", "max"])
    parser.add_argument("--hyde-device", default="auto")
    parser.add_argument("--hyde-no-fp16", action="store_true")
    parser.add_argument("--cross-encoder-device", default="auto",
                        help="Device for cross-encoder: 'auto' (cuda if available), 'cuda', 'cpu'")
    parser.add_argument("--cross-encoder-batch-size", type=int, default=32)
    parser.add_argument("--cross-encoder-no-fp16", action="store_true",
                        help="Disable FP16 for cross-encoder (FP16 is on by default on cuda, ~3x speedup)")
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
        use_cross_encoder=args.use_cross_encoder,
        cross_encoder_top_n=args.cross_encoder_top_n,
        cross_encoder_blend=args.cross_encoder_blend,
        cross_encoder_device=args.cross_encoder_device,
        cross_encoder_batch_size=args.cross_encoder_batch_size,
        cross_encoder_fp16=not args.cross_encoder_no_fp16,
        cross_encoder_intent_weight=args.cross_encoder_intent_weight,
        use_hyde=args.use_hyde,
        hyde_weight=args.hyde_weight,
        hyde_mode=args.hyde_mode,
        hyde_device=args.hyde_device,
        hyde_fp16=not args.hyde_no_fp16,
    )
    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({k: v for k, v in metrics.items() if k != "details"}, indent=2, ensure_ascii=False))
    print(f"[eval] details written to: {output_path}")


if __name__ == "__main__":
    main()
