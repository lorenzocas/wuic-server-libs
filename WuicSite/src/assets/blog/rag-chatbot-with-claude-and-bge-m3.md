---
title: "Building an in-product RAG chatbot with Claude + BAAI/bge-m3"
slug: rag-chatbot-with-claude-and-bge-m3
date: 2026-05-01
author: Lorenzo Castrico
description: "How we built a closed-source codebase chatbot that cites real source files, using a hybrid BM25 + bge-m3 retrieval, a LoRA-fine-tuned cross-encoder, and Claude for synthesis. The boring engineering numbers, not the hype."
tags: rag, claude, bge-m3, ai, angular, llm
---

The pitch we kept hearing was: *"just embed ChatGPT into your product"*. A week of work, an OpenAI key, you're done. That works for a marketing copilot or a generic FAQ bot. It does **not** work for the kind of question our users actually ask:

- *Where in the codebase is the multi-tenant authorization handled?*
- *What does the "savemetadata" endpoint do under the hood?*
- *How is the demo data restored at 04:00 UTC?*

For these questions, the answer that matters is the file path. A confident-sounding paragraph that hallucinates `MetaService.cs:123` when the file is actually `MetaController.cs:847` is *worse* than no answer — it makes the user lose trust faster than a 404 would.

So we built a real RAG. This post is the engineering story: the architecture, the numbers, what worked, what didn't.

## What "in-product RAG" means here

The chatbot lives inside the framework as `<wuic-rag-chatbot>`, an Angular standalone component. A user opens any WUIC-built application (or our docs), clicks the floating button bottom-right, asks a natural-language question. The answer comes back with **citations**: real file paths in the codebase that the user can click to open the matching markdown chunk.

```
User: "where is logout handled?"

Bot: "Server-side logout is in `KonvergenceCore/Controllers/AuthController.cs:Logout`
     (line 84). It clears the `k-user` cookie via
     `Response.Cookies.Delete` and invalidates the session token.

     The Angular client side is in
     `wuic-framework-lib/src/lib/services/auth.service.ts:logout`
     and calls `/api/Meta/AuthService.logout`."
```

The key feature is that those file paths are not made up. They are the top-ranked chunks the retriever returned. Click them, get the actual snippet.

## The shape of the index

We chunk the entire codebase by symbol — one chunk per class, one per top-level method. Around 9,200 source chunks, plus 6,500 documentation chunks (one per docs page section). Each chunk knows:

- Its file path
- The symbol type (class / method / property / page section)
- The symbol name
- A 4096-dim embedding from [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3)
- Its TF-IDF / BM25 sparse vector

The choice of bge-m3 was deliberate. We tried OpenAI's `text-embedding-3-large` (smaller, cheaper) and bge-m3 (heavier, public weights, no API call needed). For our specific corpus — code with a lot of camelCase identifiers and Italian/English mix — bge-m3 won by ~6 percentage points on hit@8. More importantly: the model is public, the weights are local, the retrieval has zero API surface to a third party. A user's question never leaves the box for retrieval; only the synthesis step talks to Claude.

## Hybrid retrieval, not pure vector

The first version was pure cosine similarity over the bge-m3 embeddings. It worked well for "concept" questions (*"how does multi-tenant authorization work?"*) but missed precise lookups (*"AsmxProxy/MetaService.invalidateMetadataRuntime"*) — the embedding for a verbatim symbol name was less useful than a literal text match.

We added BM25 in parallel and combined with reciprocal rank fusion. The hit@8 jumped, but more interestingly the *failure mode* changed: BM25 catches the queries that look like grep, vector catches the queries that look like sentences. They cover different mistakes.

## The LoRA-fine-tuned cross-encoder

The retrieval pipeline returns top-40 candidates. The next step is a cross-encoder reranker — a `BAAI/bge-reranker-v2-m3` model that scores each (query, chunk) pair end-to-end. This is significantly slower than the dual-encoder retrieval (300ms instead of 30ms for top-40) but much more accurate.

The base reranker was good. Fine-tuning it with LoRA was *much* better.

We mined hard negatives — chunks the dual-encoder retriever returned but a human reviewer marked as wrong — and fine-tuned a small adapter (rank=16, alpha=32, ~3.4M trainable parameters out of the 568M base). Two iterations:

- **First adapter** trained on 11k mined examples, blend weight 0.85 → hit@8 went from 0.61 (base) to 0.87 on our 603-case eval set. Dramatic.
- **Second adapter** retrained on 8k examples remined against the new index — held the gain on the in-distribution eval (0.81) but jumped on the holdout test (0.74 → 0.78). Less Goodhart, better generalization.

```
                                   hit@8  MRR
base CE, top_n=20, blend=0.65      0.74   0.58
LoRA v2 (11k-mined), top_n=40      0.87   0.76
LoRA v2 (8k-mined, current)        0.81   0.66   ← production default
```

The full eval table is in our [internal docs](https://demo.wuic-framework.com/) — click the chatbot and ask *"what's the current LoRA reranker performance?"*. It will cite the file. That's the meta-test.

## Translating Italian queries

Half our users type questions in Italian. The base bge-m3 handles multilingual decently, but the cross-encoder was trained mostly on English. The boost we got from translating Italian queries to English *before* feeding them to the reranker was ~2pp on hit@8. We use NLLB-200-distilled-600M locally (no API call), with a translation cache that persists across runs.

```python
# Pseudo-code from generate_embeddings.py
def query(q):
    if detect_lang(q) == 'it':
        q_en = nllb_translate(q, src='ita_Latn', tgt='eng_Latn')
    else:
        q_en = q
    candidates = hybrid_retrieve(q_en, top_n=40)
    return cross_encode_with_lora(q_en, candidates, blend=0.65)
```

The translation step adds 80ms cold-start (the NLLB model needs to be loaded once) and ~12ms per query after that. Worth it.

## Why Claude for synthesis, not OpenAI

Once retrieval has the top 8 chunks, we send them to Claude (current default: `claude-sonnet-4-6` for cost, `claude-opus-4-7` for hard questions). The system prompt is short, the user prompt is the chunks + the question, the answer comes back with the file paths preserved.

We chose Claude over GPT-4o for two reasons specific to our use case:

1. **Long context for free.** Our chunks are typically 200-500 tokens but our top-8 can hit 4-6k tokens combined. Claude handles that without the latency cliff GPT-4o has on the same payload.
2. **Better at *not* answering.** Our biggest failure mode is the model confidently inventing an answer when retrieval came back empty. Claude is markedly less likely to do this without explicit prompting. We tested both with the same "if you don't know, say so" instruction; Claude said so 38% more often when retrieval was bad. We'll take that.

## What didn't work

A short list of approaches we tried and dropped, so the next person can save the time:

- **Vector-only retrieval, no BM25.** Tried it for two weeks. Catastrophic on `<symbol>` lookups.
- **Pure cross-encoder on top-100 candidates.** 8x slower than top-40, only +1pp hit@8.
- **Re-ranking with GPT-4 directly.** Worked, but the latency was 2.5s per query and the cost was 30x our current LoRA reranker.
- **Fine-tuning the bge-m3 retriever instead of the cross-encoder.** Marginal gains, big training infra footprint. Stick with adapters on the reranker, leave the dual-encoder alone.
- **Including diff history as context.** The chatbot learned to answer *"what changed last week"* by hallucinating diffs. Pulled it.

## What's the chatbot actually for?

The most interesting use we didn't predict: **onboarding new developers**. We have new hires asking the bot questions like *"how is the wizard architecture wired?"* or *"what's the difference between AsmxProxy and the legacy endpoints?"*. The bot cites the relevant file, the new dev opens it, reads the code, learns. It compresses the time-to-first-PR from weeks to days.

Second-most-interesting: **support triage**. A user reports a bug. We ask the bot *"where is the input validation for `crm_account.email`?"* — it cites the metadata column row + the C# attribute. The triage has its starting line in 30 seconds, not 30 minutes.

Less interesting (but expected): generic Q&A, doc lookup, "what does this method do" walks. The bot does these too. They were the easy 80%, not the surprising 20%.

## Want to try it?

The chatbot is part of every [WUIC install](/downloads). It also runs on our [public demo](/sandbox) — open it, click the floating button bottom-right, ask anything. The retrieval index is the WUIC framework itself, so questions like *"how does the dashboard designer save state?"* return real answers.

The next post in this series is about [scaffolding](/blog/sql-table-to-crud-form-in-30-seconds) — how a single SQL CREATE TABLE turns into a working CRUD UI in 30 seconds. Less AI, more boring engineering. But arguably more useful.
