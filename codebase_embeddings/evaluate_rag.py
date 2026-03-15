import argparse
import json
from pathlib import Path
from typing import Dict, List, Tuple

from generate_embeddings import search


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


def run_eval(index_dir: Path, eval_file: Path, top_k: int, hf_token: str = "", hf_token_env: str = "RAG_HF_TOKEN") -> Dict:
    cases = load_eval_cases(eval_file)
    if not cases:
        raise RuntimeError(f"No eval cases found in {eval_file}")

    hit_count = 0
    reciprocal_sum = 0.0
    details = []

    for case in cases:
        query = case["query"]
        expected = case.get("expected", [])
        if not expected:
            raise ValueError(f"Case without expected rules: {case}")

        results = search(
            index_dir=index_dir,
            query=query,
            top_k=top_k,
            hf_token=hf_token,
            hf_token_env=hf_token_env,
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
    args = parser.parse_args()

    metrics = run_eval(
        Path(args.index_dir),
        Path(args.eval_file),
        args.top_k,
        hf_token=args.hf_token,
        hf_token_env=args.hf_token_env,
    )
    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({k: v for k, v in metrics.items() if k != "details"}, indent=2, ensure_ascii=False))
    print(f"[eval] details written to: {output_path}")


if __name__ == "__main__":
    main()
