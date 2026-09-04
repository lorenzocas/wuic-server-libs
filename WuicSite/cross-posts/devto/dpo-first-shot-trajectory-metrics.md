---
title: "The metric was wrong, and so was the training signal: rebuilding DPO around the first move"
published: false
description: "Our last DPO post ended with a fine-tune that failed its own gate on the metric it was trained for. A reader replied with two criticisms: the preference pairs were teaching recovery instead of first-shot correctness, and pass/fail was hiding everything that matters about a trajectory. Both were right. Here is the rebuilt dataset, the four metrics that replaced pass/fail, an honest result that is smaller and stranger than we hoped — and the measurement of our own noise floor that invalidated a conclusion we had already published."
tags: dpo, finetuning, llm, evaluation
canonical_url: https://wuic-framework.com/blog/dpo-first-shot-trajectory-metrics
---

The [previous post](https://wuic-framework.com/blog/teaching-a-coding-agent-with-dpo) ended on an uncomfortable note. We ran DPO on our local coding agent to cut **churn** — the pattern where the model reaches for the wrong tool, gets bounced by a guard, and only then does the right thing. The capability numbers improved. The churn metric, the entire reason for the exercise, moved **the wrong way**: +25% redirects. The pre-registered gate said no automatic adoption, so we didn't adopt it for the plugin.

Then a reader replied with two criticisms. Both landed, and this post is what happened when we acted on them.

## The two criticisms

**One: our preference pairs were teaching the wrong lesson.** We had built them from the assistant's own trajectories by taking `error → correction` sequences: the rejected sample was the wrong action, the chosen sample was the fix that followed. Read that back slowly. The prompt in those pairs *already contains the error*. What the model learns is: *given that I have just messed up, produce a good repair.* That is recovery training. We wanted first-shot correctness and had built a dataset that rewarded being good at second shots.

Which, in hindsight, explains the result we published. Redirects went **up** because we had trained a model that is comfortable in the recovery regime.

**Two: pass/fail was hiding the thing we cared about.** A binary outcome per task cannot distinguish a model that walks straight to the answer from one that flails for twenty steps and stumbles into it. Both are `PASS`. If the goal is less churn, the eval has to look at the *shape of the trajectory*, not just its endpoint.

## Rebuilding the pairs: cut the prompt before the error

The fix is small to describe and was the whole job. Take the same trajectories, find the same `error → correction` moments — then recompose the pair with the prompt cut **before** the error ever happened. The chosen sample stays the correct action. The rejected sample is no longer a failed repair; it is **the first wrong move**, offered at the exact decision point where the model still had a clean slate.

Same source data. Completely different lesson.

Guards, because this is the kind of thing that quietly poisons a dataset:

- Runs already represented in the recovery set are **excluded** — 398 of them — so the two sets never describe the same episode from two angles.
- Runs that fail the grading rubric are excluded (89 more): a trajectory that never reached a correct action has no trustworthy "chosen" sample.
- The prompts are trimmed with the same head/tail thresholds as the original builder. This is not cosmetic. First-shot prompts turned out to be **seven times longer** than recovery prompts — up to 85k characters — because they carry the full system prompt and task context with none of it consumed yet. I had written in a comment that they would be *shorter*. Untrimmed, they would have taken the training run straight into OOM.

Result: **471 first-shot pairs**, zero overlap with recovery, across 56 tasks. Mixed 70/30 with the original recovery pairs — recovery is still a skill worth having — for **673 pairs** total.

One more decision, easy to get wrong: the new adapter is trained **from the SFT checkpoint**, not stacked on top of the previous DPO. Stacking would have compounded the very recovery bias we were removing.

## Four metrics instead of one

Replacing pass/fail took a small harness that reads the archived transcripts and computes, per run:

- **first-action validity** — was the very first tool call a legal, correct move?
- **recovery success** — when it did go wrong, did it get back on track?
- **transitions per success** — how many steps did a completed task actually cost?
- **wasted steps** — the share of the trajectory that achieved nothing.

Writing this immediately caught a bug in my own work. The first version graded runs by their reported `outcome` field, which inflated the pass rate from 58.3% to 91.7% and understated waste from 40% to 14%. A transcript's self-reported outcome is more generous than the rubric. Grading through the same rubric the test suite uses fixed it. If you build something like this, check your grader against a number you already know before you trust a single chart.

## Training

QLoRA 4-bit, LoRA r=16 / α=32, attention-only, on a rented A100. Four hours, about **$8.40** all-in. `rewards/accuracies` 0.788, `rewards/margins` 1.19, `train_loss` 0.489 — healthy numbers; the model clearly learned to separate the pairs.

The only real fight was disk. Merging the adapter and converting to GGUF peaks at roughly **120 GB** of intermediate files, and the network volume was 80 GB. Network volumes cannot be resized on the fly; container disk can. Doing the merge on container disk instead of the volume was a one-line change that unblocked a run I had otherwise been about to re-plan around.

## The result, and the part that is not a result

Twelve held-out agentic tasks, three rounds per model, both models back to back on the same GPU. Seventy-two runs.

| | previous DPO | first-shot DPO |
|---|---|---|
| pass rate | 50.0% | 52.8% |
| first-action validity | 69.4% | 77.8% |
| recovery success | 50.0% | 52.8% |
| **steps per run** | **21.3** | **17.7** |
| wasted steps | 378 (49.3%) | 277 (43.5%) |

Every column moves the right way, and the first-action gain of **+8.4 points** is exactly what we set out to buy. It is also, unfortunately, not real.

Because the tasks are paired — same twelve, same three rounds — you can compare them task by task instead of comparing averages. Do that and the picture collapses:

- **pass rate**: better on 2 tasks, worse on 2, tied on 8. Sign test `p = 1.00`.
- **first-action validity**: better on 2, worse on 1, tied on 9. Sign test `p = 1.00`.

The aggregate movement is two or three tasks wobbling. There is no capability signal here, in either direction.

What survives is the fourth row. **Steps per run fell 17%** — and unlike the others it is consistent: the new model is leaner on **11 of 12 tasks, with zero regressions**, `p ≈ 0.001`. Q07 went from 14.0 steps to 8.7, Q02 from 17.0 to 10.7, Q10 from 19.0 to 13.0.

So the honest verdict: **first-shot DPO did not make the model smarter. It made it markedly less wasteful reaching the same answer.** Which, sitting with it, is exactly what you would expect from training on *what is the right first move* rather than *how do I dig out of this*. We asked for accuracy and got efficiency, and only the trajectory metrics could see it. The second criticism paid for the first one.

## The noise floor, and a conclusion we had to withdraw

Here is the finding I would keep if I could keep only one.

Along the way we measured **the same model, unchanged, three separate times**:

| | run 1 | run 2 | run 3 |
|---|---|---|---|
| pass rate | 58.3% | 58.3% | 50.0% |
| first-action validity | 66.7% | 75.0% | 69.4% |

Roughly **eight points of run-to-run noise** on both headline metrics. The first two pass rates agreeing was luck, and we had been reading that agreement as stability.

Two consequences, neither comfortable. First, a conclusion from the previous round — a −14.3% first-action difference we had attributed to the fine-tune — sits **inside the noise**, and we withdraw it. Second, with twelve tasks this bench cannot resolve anything smaller than about fifteen points on those metrics, no matter how many rounds we run. Only the paired per-task test says anything trustworthy, and only the step-count result clears it.

The previous post argued that a redirect metric which punishes engaging with hard tasks is a metric with a blind spot. This one adds the sequel: a metric can be perfectly well-defined and still tell you nothing, because the quantity you are measuring moves more between identical runs than between the models you are comparing. Measure your own noise floor before you believe your deltas. We hadn't, for months.

## The gate we had not run before

One gap remained. The same weights serve two products — the VS Code assistant *and* the in-app RAG chatbot — but everything above measures only the agentic side. A model trained to act decisively could plausibly become trigger-happy in a conversation, reaching for tools where it should simply answer.

So we ran the framework's own end-to-end chatbot suite as a non-regression gate: 18 scenarios, **145 assertions**, real browser, real database.

**130 → 139 passing.** But three of those nine came from assertions that had failed on the *baseline* with `llm_unavailable` — failed LLM calls, not wrong answers, all three on the largest prompts. That is load variance, not model behaviour, so we discard them: the honest figure is **+6**.

The gains cluster exactly where the training aimed. The canvas-designer scenario went from 6/13 to 10/13 — chart types matching the request, map zoom and colour fields populated, aggregations applied — and chart-config from 0/3 to 2/3. All parameter-fidelity failures; all first-move problems. The one regression is a single tool-routing variant out of 102.

Not more capable. More precise on the first attempt, and much less wasteful getting there. The gate cleared, and the model is now the default for both products.

## Run it yourself

`qwen3-coder-wuic:30b-dpo` on [Hugging Face](https://huggingface.co/castricolorenzo/qwen3-coder-wuic-30b-dpo) now serves this revision — same tag, same filename, so an `ollama pull` picks it up. GGUF q4_K_M, 18.6 GB, fits a 24 GB card at 48k context. Full setup — Ollama tuning, backend wiring, the VS Code extension — is on the [Run the WUIC coding model locally](https://wuic-framework.com/model) page.

---

*This post exists because someone read the last one and told us, precisely and without hedging, what was wrong with it. Two paragraphs of good criticism were worth more than the four hours of GPU time they triggered. If you have run something similar and measured your own noise floor, I would like to hear what you found.*
