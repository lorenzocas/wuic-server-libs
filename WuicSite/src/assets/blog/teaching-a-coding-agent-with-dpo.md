---
title: "Teaching a local coding agent from its own mistakes: DPO on a 30B model"
slug: teaching-a-coding-agent-with-dpo
date: 2026-07-05
author: Lorenzo Castrico
description: "Our VS Code assistant was passing every test on its curriculum — which meant the curriculum had stopped measuring anything. Here's how we built honest eval sets, found two silent contaminations in our test bench, and used Direct Preference Optimization to teach a 30B model to pick the right tool on the first try instead of getting bounced by a guard and correcting afterwards. Five OutOfMemory crashes, one counterintuitive fix, and a clean 4-hour training run included."
tags: dpo, qlora, fine-tuning, llm, local-inference, ollama, vscode, agentic
---

The **WUIC Assistant** is our agentic VS Code plugin: it scaffolds Angular components, dashboards, reports, workflows, and metadata patches for apps built on the WUIC framework. Under the hood it runs **qwen3-coder:30b** — a Mixture-of-Experts model with ~3B active parameters — served locally through Ollama on a single RTX 4090. No API calls, no data leaving the machine.

For weeks the plugin had been sitting at **100% on its curriculum**: 32 tasks, five green runs each, a 96/96 regression suite. Beautiful numbers, and a problem. A curriculum that always passes has stopped measuring anything. It could no longer tell us whether the model *generalized* to the prompts a real developer types, nor how often it took a wrong turn before correcting itself.

We wanted two things:

1. **Measure real generalization**, with prompts the model had never seen.
2. **Cut the churn** — those moments where the model tries the wrong tool, gets bounced by a guard (`STOP: use scaffold, not ng generate`), and only *then* does the right thing. It works, but it's slow and brittle. We wanted it right on the **first** try.

This post is the story of how we got there. It involves five OutOfMemory crashes, a saturated benchmark, two hidden contaminations, and a 30-billion-parameter model that eventually learned to make fewer mistakes.

## Chapter 1 — Measuring what matters: holdout sets

A model that evaluates itself on the data it was aligned to is lying to itself. So we built **eval-only** sets, with one iron rule: *never in training, never curricularized*. If you stabilize a task by adding a dedicated mechanism, that task loses its value as a measurement — and it gets replaced.

The latest of these, the fourth **"HARD"** set (Q01–Q12), deliberately raises the bar on the levers where the base model actually struggles:

- **Multi-deliverable** ("do X *and* Y") — the model tends to stop after the first.
- **Ambiguous phrasing** — no keyword the detectors latch onto; the model has to *reason*.
- **Combinations** of two mechanisms in a single task.
- **Rare capabilities** — multi-range conditions, lifecycle callbacks, 3-step workflows.

Measured on a clean bench, the base model lands at **25/36 (69%)**, failing Q02, Q04, Q05, Q07 systematically. But the most interesting data point was elsewhere: **Q01 passed 3 times out of 3 — with 9 redirects**. It got there, but by bouncing off the guards the whole way. That's the churn we wanted gone.

## Chapter 2 — Two hidden contaminations (the part that stings)

Before touching the model, a deceptively innocent question — *"is the test environment actually clean and in sync?"* — opened a can of worms.

**Contamination #1: the metadata reset.** Our between-runs reset ran `DELETE WHERE id > baseline` — it deleted the rows that had been *added*, but never reverted the **UPDATEs** (like `hide_in_list`) applied to pre-existing rows. Run after run, columns on the `customers` table were progressively hidden, until `route_columns` started answering "no columns found." Worse: some of our test prompts had been reworded over time to *compensate* for this degradation — meaning we'd been fixing the symptoms of an environment bug and mistaking it for backend behavior. The fix: restore the full column set from the clean baseline (`metadataTutorial`) on every reset. The general lesson we kept: **a reset has to cover what you *mutate*, not just what you *add*.**

**Contamination #2: the report generator.** A shared file (`gen-report-from-template.mjs`) had been overwritten by a model run, shrinking from 246 lines to 60 — and our reset didn't cover that directory. Restored, added to the reset scope, and write-guarded.

The moral: **before you trust the numbers, trust the environment.** A test bench that drifts slowly produces phantom regressions that look exactly like model bugs.

## Chapter 3 — Fixing the mechanisms, not the cases

With a clean bench, the third holdout set went from 22/36 to **36/36**. The fixes were **generic** — synonyms in the detectors, correct precedence between task "kinds", scaffold guards for reports — never a patch for an individual prompt. That distinction is the whole game: you generalize the *root condition*, you don't enumerate the cases.

But the churn remained. And churn isn't solved by adding one more guard — it's solved by teaching the model not to fumble the first move. That meant touching the model itself.

## Chapter 4 — Learning from the pair (DPO)

The right technique here isn't more supervised fine-tuning. The SFT we'd already tried **masked** the rejected turns — the model never got the signal "*this* move is wrong." Redirects dropped only from 43 to 39.

**DPO** (Direct Preference Optimization) learns from the **pair** instead: for the exact same context, *prefer* the accepted action over the rejected one. It's a perfect fit for our problem, because every redirect in the historical transcripts is already a ready-made pair:

- the turn the guard **rejected** (`ng generate component…` → STOP) = *rejected*;
- the first **accepted correction** (`scaffold widget=map` → Saved) = *chosen*;
- the **context before the decision** = the prompt.

An extractor pulled **559 pairs** from hundreds of runs (including the red ones — a pair is valuable if it contains a valid rejected→corrected transition), deduplicated and balanced so no single task dominates.

## Chapter 5 — The gauntlet: five OutOfMemory crashes

Here's where theory meets 80 GB of VRAM. DPO does **four forward passes** per step (policy and reference, over chosen and rejected). And our system prompt — the `.clinerules` that give the model all the WUIC context — is **enormous**: ~20,000 tokens. Multiplied by four passes, the 30B model went OOM *before step 0*, five times in a row, first on a 4090 under WSL2 and then even on an **80 GB A100**.

The debug path, condensed:

1. LoRA under one training toolkit expanded the target modules to the MoE's 128 experts → it materialized everything. Dropped it for plain `peft`.
2. Reference-precompute did a standard forward that materialized the logits `[seq × vocab≈150k]` → OOM.
3. The **liger fused loss** (which fuses `lm_head` + loss without ever materializing the full logits) promised to solve it… but on a 4-bit quantized `PeftModel` it was **unstable**: `SMOKE_FAIL` with no clear traceback.

The breakthrough was a counterintuitive one: **the real problem wasn't DPO, it was the system prompt.** We **trimmed the system block in the dataset** (head + tail, the parts that matter), bringing sequences from ~24k down to **3–5k tokens**. At that point the fp32 logits take ~6 GB — they fit comfortably in 80 GB — and the liger fused loss was no longer needed. In fact it was the very cause of the last failure: **disabled**, standard DPO ran clean.

The final smoke test: 8 steps, loss trending down, positive `rewards/margins`, `accuracies` 0.75–0.88. The model preferred the *chosen*. Green light.

## Chapter 6 — The payoff: 4 hours, zero OOM

The full run trained in the background on the A100 (detached, to survive SSH drops), monitored step by step:

| Step | Loss | rewards/accuracies | rewards/margins |
|---|---|---|---|
| 5  | 0.62 | 0.63 | +0.30 |
| 20 | —    | 0.73 | +0.59 |
| 46 | 0.47 | 0.78 | +0.74 |
| 56 | **0.41** | **0.88** | **+1.02** |

**70 steps, 1 epoch over 559 pairs, 4h11m, zero OutOfMemory** from start to finish — even when VRAM read 96% (a false alarm: that was PyTorch's stable *reserved pool*, not a live allocation at the edge; the paged 8-bit optimizer spills to system RAM as a relief valve). Margins above 1.0 and accuracies at 88% say the preference signal was learned cleanly.

## What happens next

As of this writing, the DPO adapter is being merged and converted to GGUF q4_K_M to be served by Ollama as `qwen3-coder-wuic:30b-dpo`. Then comes the **eval gate**, with criteria fixed *before* looking at the results:

- **PASS ≥ 25/36** on the HARD set (no regression);
- **redirects < 0.47/run** (−30% from the base's 0.67/run) — the primary "first-shot correctness" metric;
- **curriculum 96/96** intact (no forgetting);
- critical guards (report scaffolding) still working.

If it clears the gate, it becomes the default, with trivial rollback (the base stays installed). If it doesn't, it remains a clean, reproducible experiment — and we know exactly why.

Because that's the real point of this whole story. Not "we fine-tuned a model," but: **we built a ruler that doesn't lie, we cleaned the test bench, and we let the numbers decide.** The verdict lands shortly.

*— to be continued.*
