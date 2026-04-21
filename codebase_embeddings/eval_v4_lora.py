"""Evaluate the LoRA-adapted cross-encoder on eval_queries.v4_test.jsonl.

Loads BAAI/bge-reranker-v2-m3 + the trained LoRA adapter from lora_ce_v4/,
wraps it in a class compatible with sentence_transformers.CrossEncoder.predict(),
then monkey-patches generate_embeddings.get_cross_encoder() to return that
wrapper. The rest of the retrieval pipeline (vector + BM25 + light rerank +
CE blend) is reused unchanged.

Compares apples-to-apples against the same 121-case test set with the base CE.

Output:
  - eval_v4_test_lora.json: full per-query details for the LoRA run
  - eval_v4_test_base.json: same but with the base CE
  - prints a side-by-side per-section + global delta table
"""
import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from peft import PeftModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

import generate_embeddings
from generate_embeddings import load_index, search_loaded
from evaluate_rag import evaluate_case

TRANSLATE_CACHE = Path("_translate_cache_v3.json")
TEST_PATH = Path("eval_queries.v4_doclabels_relabel_test.jsonl")
LORA_DIR = Path("lora_ce_v4")
INDEX_DIR = Path("index")
BASE_MODEL = "BAAI/bge-reranker-v2-m3"


class LoraCEWrapper:
    """Wraps a HF SequenceClassification model + LoRA adapter behind the
    sentence_transformers.CrossEncoder.predict() API used by search_loaded()."""

    def __init__(self, base_model: str, adapter_dir: Path, device: str = "cuda", fp16: bool = True):
        self.tokenizer = AutoTokenizer.from_pretrained(base_model)
        base = AutoModelForSequenceClassification.from_pretrained(base_model, num_labels=1)
        self.model = PeftModel.from_pretrained(base, str(adapter_dir))
        self.model.eval()
        self.device = device
        if device.startswith("cuda") and fp16:
            self.model.half()
        self.model.to(device)
        self._fp16 = fp16 and device.startswith("cuda")

    @torch.no_grad()
    def predict(self, pairs, batch_size: int = 32, show_progress_bar: bool = False):
        scores = []
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


def install_lora_cross_encoder(adapter_dir: Path):
    """Replace generate_embeddings.get_cross_encoder with one that returns the
    LoRA wrapper for ANY requested model name. The wrapper is cached."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    wrapper = LoraCEWrapper(BASE_MODEL, adapter_dir, device=device, fp16=True)

    def _get(model_name=None, device="auto", fp16=True):
        return wrapper

    generate_embeddings.get_cross_encoder = _get
    print(f"[lora] installed LoRA wrapper as cross-encoder ({BASE_MODEL} + {adapter_dir})")


def load_jsonl(path: Path) -> list[dict]:
    out = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def run_eval(label: str, cases: list[dict], cache: dict, model, vectors, docs, bm25, top_k: int) -> dict:
    print(f"[eval] {label}: scoring {len(cases)} test queries")
    hits = 0
    mrr_sum = 0.0
    details = []
    by_section: dict[str, dict] = defaultdict(lambda: {"n": 0, "hits": 0, "mrr_sum": 0.0})
    for c in cases:
        q_it = c["query"]
        q_en = cache.get(q_it, q_it)
        results = search_loaded(
            model=model,
            vectors=vectors,
            docs=docs,
            bm25=bm25,
            query=q_en,
            top_k=top_k,
            use_cross_encoder=True,
            cross_encoder_top_n=40,
            cross_encoder_blend=0.65,
            cross_encoder_intent_weight=0.0,
            use_hyde=False,
        )
        hit, rr, rank = evaluate_case(results, c.get("expected", []))
        if hit:
            hits += 1
            mrr_sum += rr
        details.append({"query": q_it, "query_en": q_en, "docs_section": c.get("docs_section"), "hit": hit, "first_hit_rank": rank})
        s = by_section[c.get("docs_section", "_unknown")]
        s["n"] += 1
        if hit:
            s["hits"] += 1
            s["mrr_sum"] += rr
    n = len(cases)
    summary = {
        "label": label,
        "total_cases": n,
        f"hit@{top_k}": hits / n,
        "mrr": mrr_sum / n,
        "by_section": {
            sec: {
                "n": s["n"],
                "hit@8": s["hits"] / s["n"],
                "mrr": s["mrr_sum"] / s["n"],
            }
            for sec, s in sorted(by_section.items())
        },
        "details": details,
    }
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top-k", type=int, default=8)
    ap.add_argument("--lora-dir", default=str(LORA_DIR))
    ap.add_argument("--also-base", action="store_true", default=True,
                    help="Also re-run the base CE on the same test set for direct comparison")
    args = ap.parse_args()

    cache = json.loads(TRANSLATE_CACHE.read_text(encoding="utf-8"))
    test_cases = load_jsonl(TEST_PATH)
    print(f"[eval] {len(test_cases)} test cases; {len(cache)} cached translations")

    print(f"[eval] loading index")
    t0 = time.time()
    model, vectors, docs, bm25 = load_index(INDEX_DIR)
    print(f"[eval] index loaded in {time.time()-t0:.1f}s; {len(docs)} docs")

    # First: run BASE cross-encoder on the test set (no monkey-patch yet).
    if args.also_base:
        # Make sure we use a fresh CE (sentence_transformers default).
        # generate_embeddings.get_cross_encoder is still the original here.
        base_summary = run_eval("base_ce", test_cases, cache, model, vectors, docs, bm25, args.top_k)
        Path("eval_v4_test_base.json").write_text(
            json.dumps(base_summary, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # Now install LoRA wrapper (replaces get_cross_encoder + clears the
    # built-in cache so the wrapper actually takes over).
    generate_embeddings._CROSS_ENCODER_CACHE.clear()
    install_lora_cross_encoder(Path(args.lora_dir))

    lora_summary = run_eval("lora_ce", test_cases, cache, model, vectors, docs, bm25, args.top_k)
    Path("eval_v4_test_lora.json").write_text(
        json.dumps(lora_summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Side-by-side print
    print()
    print("=" * 88)
    print(f"v4 holdout test set ({len(test_cases)} cases) — base CE vs LoRA-tuned CE")
    print("=" * 88)
    if args.also_base:
        print(f"{'section':38s} {'N':>4s} {'base hit@8':>11s} {'lora hit@8':>11s} {'delta':>7s} {'base MRR':>9s} {'lora MRR':>9s}")
        print("-" * 88)
        for section in sorted(set(list(base_summary["by_section"].keys()) + list(lora_summary["by_section"].keys()))):
            b = base_summary["by_section"].get(section, {"n": 0, "hit@8": 0, "mrr": 0})
            l = lora_summary["by_section"].get(section, {"n": 0, "hit@8": 0, "mrr": 0})
            delta = l["hit@8"] - b["hit@8"]
            print(f"{section:38s} {b['n']:4d} {b['hit@8']:11.4f} {l['hit@8']:11.4f} {delta:+7.4f} {b['mrr']:9.4f} {l['mrr']:9.4f}")
        print("-" * 88)
        b_total = base_summary[f"hit@{args.top_k}"]
        l_total = lora_summary[f"hit@{args.top_k}"]
        print(f"{'TOTAL':38s} {len(test_cases):4d} {b_total:11.4f} {l_total:11.4f} {l_total - b_total:+7.4f} {base_summary['mrr']:9.4f} {lora_summary['mrr']:9.4f}")
    else:
        print(f"LoRA hit@{args.top_k}: {lora_summary[f'hit@{args.top_k}']:.4f}")
        print(f"LoRA MRR:    {lora_summary['mrr']:.4f}")


if __name__ == "__main__":
    main()
