---
title: "The architecture of an in-product RAG chatbot: from your prompt to the answer"
published: false
description: "A closed-source codebase chatbot that cites real source files: hybrid BM25 + bge-m3 retrieval, a LoRA-fine-tuned cross-encoder, Claude for synthesis — and a serving stack that moved off Python onto native .NET/ONNX. This post follows a single prompt end-to-end, from the moment you hit send to the cited answer, and explains the architectural choices behind each step."
tags: ai, onnx, dotnet, architecture
canonical_url: https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3
---

The pitch we kept hearing was: *"just embed ChatGPT into your product"*. A week of work, an OpenAI key, you're done. That works for a marketing copilot or a generic FAQ bot. It does **not** work for the kind of question our users actually ask:

- *Where in the codebase is the multi-tenant authorization handled?*
- *What does the "savemetadata" endpoint do under the hood?*
- *How is the demo data restored at 04:00 UTC?*

For these questions, the answer that matters is the file path. A confident-sounding paragraph that hallucinates `MetaService.cs:123` when the file is actually `MetaController.cs:847` is *worse* than no answer — it makes the user lose trust faster than a 404 would.

So we built a real RAG. This post is the architecture: it follows one prompt from the moment you hit send all the way to the cited answer, and explains the choices behind each step.

![&lt;wuic-rag-chatbot&gt; in action — natural-language question about the codebase, streamed answer with clickable file-path citations](https://wuic-framework.com/assets/wuic-framework-docs/screenshots/rag-chatbot__rag-chatbot-conversation__desktop.gif)

## What "in-product RAG" means here

The chatbot lives inside the framework as `<wuic-rag-chatbot>`, an Angular standalone component. A user opens any WUIC-built application (or our docs), clicks the floating button bottom-right, asks a natural-language question. The answer comes back with **citations**: real file paths in the codebase that the user can click to open the matching chunk. The component owns nothing but the conversation — the floating button, the streamed answer, the session list. Everything stateful lives server-side.

## The journey of a single prompt

Here is what actually happens between *hit send* and *read answer*. Four boxes, in order:

```
<wuic-rag-chatbot>   →   RagController   →   RAG engine   →   Claude
   (Angular)             (.NET)              (retrieval)       (synthesis)
```

**1 — The component posts the question.** `<wuic-rag-chatbot>` sends `POST /api/Rag/Ask` with three things: the question, the current session id, and the *route context* — which page you're on, e.g. `cities/list`. That context is deliberately minimal: just the current route, not a dump of every column. It's enough for the bot to know *which* grid you mean when you say *"add a validation to this column"*; the real column names it needs to act are fetched separately, on demand (see *A leaner prompt: schema on demand*, below).

**2 — The controller authenticates and persists.** `RagController` checks the session cookie, loads or creates the chat session, and writes your message to `_rag_chat_messages` before doing anything expensive. If the conversation is getting long, this is also where a background summary may already have been folded into the system prompt (more on that below).

**3 — The engine retrieves.** The query goes into the retrieval pipeline, which is the heart of the thing. In order:

1. **Tokenize** the query with an XLM-RoBERTa SentencePiece tokenizer.
2. **Detect language**; if it's Italian, translate to English first (cached) — the retriever was tuned on English.
3. **Embed** the query with `bge-m3` into a dense vector, and compute its **BM25** sparse scores in parallel.
4. **Fuse** the dense and sparse rankings with reciprocal-rank fusion → a top-40 candidate set.
5. **Blend and rerank**: a min-max blend with an adaptive alpha, then a cross-encoder rerank (the fine-tuned one — see below) over those 40, with small boosts for source type and title match → the **top 8**.

**4 — The engine assembles the prompt.** The top-8 chunks become the context, joined by the route context, any pinned *memory facts*, and the rolling conversation summary. That bundle, plus a short system prompt and a catalogue of tools, is what goes to the model.

**5 — Claude answers — or acts.** Most of the time the model writes prose with the file paths preserved as citations, and it streams back token by token. But the same call also exposes a **toolbox**: if your question was actually a request to *change* something, the model emits a tool call instead of prose, and you get an "Apply" chip rather than a paragraph. (That action layer is a [post of its own](https://wuic-framework.com/blog/rag-chatbot-tool-use-framework-integration) — here it's enough to know the retrieval-and-synthesis path and the tool path are the same request, branching only at the model's choice.)

**6 — The controller closes the loop.** The assistant message is persisted, the context-window cue in the header is updated from the tokens the API actually reported, and — if history crossed a threshold — an auto-compact is queued so the *next* turn starts leaner.

The rest of this post zooms into the choices behind the interesting steps.

## A leaner prompt: schema on demand

The bot needs *real* names to act — the actual column names of a grid, the SQL schema and table, the join alias behind a lookup. The first version shipped all of that inside the route context: every request carried a full column dump whether the prompt needed it or not. It saturated the window and spent tokens on every turn, prompt or not.

So we inverted it. The route context is now just the current route. When the model needs schema it doesn't have, it *asks* for it: a non-chip tool, `request_metadata_detail`, that the engine resolves against the metadata (the model never touches the database) and feeds back as a tool result before the model continues. The retrieval-and-synthesis loop above gains one optional inner hop — *ask for the columns, then act* — and the prompt only ever carries what the question actually needs. The same mechanism extends to any metadata dimension — lookups, related routes, enum values — without re-bloating the context. The action layer that consumes those names is a [post of its own](https://wuic-framework.com/blog/rag-chatbot-tool-use-framework-integration).

## The shape of the index

We chunk the entire codebase by symbol — one chunk per class, one per top-level method — plus one chunk per documentation page section. Around 8,800 source chunks and several thousand doc chunks. Each chunk knows its file path, its symbol type and name, a dense embedding from [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3), and its BM25 sparse vector.

The choice of bge-m3 was deliberate. We tried OpenAI's `text-embedding-3-large` and bge-m3 (heavier, public weights, no API call needed). For our corpus — code with a lot of camelCase identifiers and an Italian/English mix — bge-m3 won by ~6 points on hit@8. More importantly the weights are local, so the retrieval has **zero API surface** to a third party. A user's question never leaves the box for retrieval; only the synthesis step talks to Claude.

## Hybrid retrieval, not pure vector

The first version was pure cosine similarity over the embeddings. It worked for "concept" questions (*"how does multi-tenant authorization work?"*) but missed precise lookups (*"AsmxProxy/MetaService.invalidateMetadataRuntime"*) — the embedding for a verbatim symbol name was less useful than a literal text match.

Adding BM25 in parallel and fusing with reciprocal rank fixed it, and the *failure mode* is the interesting part: BM25 catches the queries that look like grep, vector catches the queries that look like sentences. They cover different mistakes. That's the architectural reason both are in the pipeline rather than one or the other.

## Fine-tuning the cross-encoder

The fusion step returns top-40 candidates. The next step is a cross-encoder reranker — a `BAAI/bge-reranker-v2-m3` that scores each (query, chunk) pair end-to-end. Slower than the dual-encoder retrieval (≈300 ms vs 30 ms for top-40), much more accurate.

The base reranker was good. Fine-tuning it with **LoRA** was *much* better, and this is where most of our quality gains came from.

We mined hard negatives — chunks the dual-encoder returned but a human marked as wrong — and trained a small adapter (rank=16, alpha=32, ~3.4M trainable parameters out of a 568M base). Two iterations:

- **First adapter**, trained on 11k mined examples, blend 0.85 → hit@8 went from 0.61 (base) to 0.87 on our 603-case eval set. Dramatic.
- **Second adapter**, retrained on 8k examples remined against the rebuilt index → held the in-distribution number (0.81) but jumped on the holdout test (0.74 → 0.78). Less Goodhart, better generalization. That's the one in production.

```
                                   hit@8  MRR
base CE, top_n=20, blend=0.65      0.74   0.58
LoRA v2 (11k-mined), top_n=40      0.87   0.76
LoRA v2 (8k-mined, current)        0.81   0.66   ← production default
```

The architectural decision here was *where* to spend the fine-tuning budget. We tried fine-tuning the bge-m3 retriever itself: marginal gains, big training-infra footprint. An adapter on the reranker, with the dual-encoder left frozen, gives most of the win for a fraction of the cost — and the adapter is 3.4M parameters you can swap without touching the index.

## Translating Italian queries

Half our users type in Italian. bge-m3 is multilingual, but the cross-encoder was trained mostly on English. Translating Italian queries to English *before* the reranker bought ~2 points on hit@8. We use NLLB-200-distilled-600M locally (no API call), with a translation cache that persists across runs — ~80 ms cold-start once, ~12 ms per query after.

## Why Claude for synthesis

Once retrieval has the top 8 chunks, they go to Claude with the question. Two reasons specific to our use case drove that choice over GPT-4o:

1. **Long context without the latency cliff.** Our top-8 can hit 4–6k tokens combined; Claude handles that without the slowdown we measured on the same payload elsewhere.
2. **Better at *not* answering.** Our biggest failure mode is the model confidently inventing an answer when retrieval came back empty. With the same "if you don't know, say so" instruction, Claude said so markedly more often when retrieval was bad. We'll take that.

## Serving it natively on .NET

The retrieval models are PyTorch-shaped, so the obvious way to serve them is Python. Our v1 was exactly that: a FastAPI process, `rag_server.py`, that the .NET controller proxied to. It worked, but it meant a *second runtime* on every customer box — a venv, an NSSM-wrapped service on Windows or a systemd unit on Linux — and every *"the chatbot returns 502"* support thread ended at the same place: the Python service had died or drifted. Retrieval quality was never the problem; the operational surface was.

So we ported the whole inference path to **native .NET on ONNX Runtime**. Training stays in Python — you don't retrain a cross-encoder in C#. Inference moved:

- Every model exports cleanly to ONNX; `Microsoft.ML.OnnxRuntime.Gpu` runs the graphs in-process with a CUDA provider and a transparent CPU fallback.
- `Microsoft.ML.Tokenizers` gives the same XLM-RoBERTa tokenizer. We gated it against the Python tokenizer on 200 queries: 198 identical, 2 off by a one-token tie-break worth <0.04 of a logit.
- The 8-stage pipeline above was re-implemented stage for stage and diffed against the Python twin: cosine 1.0 on embeddings, 99.4% ranking agreement.

The architectural trick that keeps this clean: the engine lives in its **own** assembly with **zero** compile-time reference from the main app. Only when the feature is enabled does a custom `AssemblyLoadContext` load `WuicRagEngine.dll` and its native ONNX dependencies, invoked across a deliberately dumb seam — JSON in, JSON out, by reflection. A build that never touches the chatbot never links a single native binary. The DLL ships next to the app; the ~2.3 GB of weights and index download on first launch into a local folder.

The payoff isn't speed — GPU numbers are within noise of the Python build. It's the deploy story: *"install .NET, unzip, run"* instead of a Python install guide that reads like a support ticket.

## What didn't work

A short list of approaches we dropped, so the next person can save the time:

- **Vector-only retrieval, no BM25.** Catastrophic on `<symbol>` lookups.
- **Pure cross-encoder on top-100 candidates.** 8× slower than top-40, only +1pp hit@8.
- **Re-ranking with GPT-4 directly.** Worked, but 2.5 s/query and 30× the cost of the LoRA reranker.
- **Fine-tuning the bge-m3 retriever instead of the cross-encoder.** Marginal gains, big training footprint. Adapter on the reranker, leave the dual-encoder alone.
- **Including diff history as context.** The bot learned to answer *"what changed last week"* by hallucinating diffs. Pulled it.

## What's the chatbot actually for?

Answering questions is half of it. The half we use more is the chatbot *doing* things on the app you're looking at — proposing a button on a grid, a row colour rule, a computed column, a metadata patch — through a typed catalogue of tools the model can call. Every proposal is a chip with an **Apply** button, the generated code, and the target route, all visible before anything runs.

The headline example: the **dashboard designer**. With the designer open, ask:

> *"add a grid bound to provincie"*

The model fuzzy-matches "provincie" to the real `stateprovinces` route, generates the DATASOURCE + DATAREPEATER components configured for it, and drops them on the canvas as a single proposal. Nothing persists until you click "Save dashboard"; designer undo/redo covers the model's edits exactly like a human's. The bot just saved you the drag, the binding panel, and the route lookup.

The full toolbox — toolbar actions, row actions, conditional styling, custom validations, lifecycle callbacks, metadata patches, even raw SQL fragments in the active dialect — is the subject of the [follow-up post](https://wuic-framework.com/blog/rag-chatbot-tool-use-framework-integration).

## Try it

The chatbot is part of every [WUIC install](https://wuic-framework.com/downloads) and runs on our [public demo](https://wuic-framework.com/sandbox) — open it, click the floating button, ask anything. The retrieval index is the WUIC framework itself, so *"how does the dashboard designer save state?"* returns a real answer. And when you want it to *do* something rather than explain it, that's the [tool layer](https://wuic-framework.com/blog/rag-chatbot-tool-use-framework-integration).
