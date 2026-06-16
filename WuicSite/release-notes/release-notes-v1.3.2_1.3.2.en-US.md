# Release Notes — WUIC Framework v1.3.2

**Date**: 14 June 2026
**Previous published version**: 1.3.0 (11 June 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

A consolidation release on the **RAG chatbot** introduced in 1.3.0: the conversational model is no longer tied to Anthropic — any OpenAI-compatible endpoint, including local runtimes such as Ollama with open models (Qwen), is now configurable and runs without an API key. Alongside this, a set of fixes to the first-run installer, the source package and metadata scaffolding that surfaced on fresh installations, plus a workspace ready for AI coding assistants.

---

## 🤖 RAG Chatbot — flexible LLM provider (including local and free)

The chatbot's conversational model is now provider-agnostic. In addition to Anthropic, **OpenAI-compatible** endpoints are supported, which includes local runtimes (e.g. Ollama): you can run open, free models such as **Qwen** on your own machine, **without an API key and with no per-token cost**.

- `rag-llm-provider` — `anthropic` (default) / `openai` / `openrouter`. Selects the provider's wire dialect.
- `rag-llm-base-url` — endpoint override; pointing it at a local server URL (e.g. `http://localhost:11434/v1` for Ollama) makes the chatbot talk to the model locally.
- `rag-llm-default-chat-model` — model id for the chosen provider (e.g. a Qwen model on Ollama).
- `llm-api-key` — key for the active provider; for local runtimes that don't validate it, a placeholder value (e.g. `ollama`) is enough. The legacy `anthropic-api-key` remains valid when `rag-llm-provider=anthropic` (zero migration).

All keys are **hot-reloaded** from `appsettings.json`: switching provider or model requires no restart.

**More accurate retrieval** — result re-ranking has been refined: the chatbot cites more relevant sources on natural-language queries.

**Setup notifications** — on first use the .NET engine downloads the ONNX models on demand. The administrator now receives **started / ready / error** notifications for the download in the bell, across all four DB providers, even when initialization is triggered by a request with no logged-in user.

**Automatic GPU acceleration** — on a machine with an NVIDIA GPU the engine uses the GPU without installing CUDA: on first launch, besides the ONNX models, it also downloads the required CUDA 12 + cuDNN 9 runtime on demand (~1.8 GB, one time, only if a GPU is present) and wires it up itself. Without a GPU → CPU, no extra download. Manual override with `rag-engine-cuda-path`.

---

## 🧩 Workspace ready for AI coding assistants

Applications generated with the framework now include a **set of markdown context files** (project description, conventions, operating rules) at the workspace root. These files make agentic AI assistants — **Continue**, **Cline**, Cursor and similar — immediately aware of the WUIC structure and conventions, with no proprietary extension to install. Any client that reads the workspace context behaves as a "WUIC-native" assistant.

---

## 🐛 Notable bug fixes

- **First-run installer — SQL script path (non-BAK)**: when provisioning the metadata DB via the incremental SQL script (the alternative to restoring from a `.bak`), the parser for `GO`-separated batches mishandled some separators, causing schema creation to fail on fresh installations. The splitter has been fixed and script-based installs now complete cleanly.

- **Source package — .NET RAG engine not found at runtime**: in the source package (`-src-`) the `WuicRagEngine.dll` engine was placed at the package root, while the executable, started from `bin/`, looked for it next to itself — the RAG chatbot would not start ("WuicRagEngine.dll not found"). The loader now searches the `rag-engine/` folder in several locations (build output, content root, working directory) and finds the engine in both deploy layouts.

- **First-run — chatbot API key persistence**: the LLM key entered in the first-install wizard is now written to the canonical `appsettings.json` actually read by the runtime. Previously, in some layouts, it could land in a copy the process never reads, leaving the chatbot without a key right after install.

- **Metadata scaffolding — diagnostics and robustness**: scaffolding the metadata for certain tables could fail with a generic message ("Unable to scaffold metadata table") that masked the real cause. The actual SQL error now propagates to the caller, and the case that triggered it is fixed.

- **Source package — realtime notifications in dev**: in the `-src-` package the dev-server (`ng serve`) proxy did not forward WebSocket connections to the backend; the notification channel (`/ws`) timed out and updates only appeared after a manual page reload. The proxy now forwards WebSockets too: notifications arrive in real time.

---

## 📦 Updated packages

| Package | From | To |
|---|---|---|
| WuicCore | 1.3.0 | 1.3.2 |
| Wuic.Webcore | 1.3.0 | 1.3.2 |
| WuicOData | 1.3.0 | 1.3.2 |
| RuntimeEfCore | 1.3.0 | 1.3.2 |
| Wuic.MySqlProvider | 1.3.0 | 1.3.2 |
| Wuic.PostgresProvider | 1.3.0 | 1.3.2 |
| Wuic.OracleProvider | 1.3.0 | 1.3.2 |
| wuic-framework-lib (NPM) | 1.3.0 | 1.3.2 |

---

## 🔧 Recommended operational updates for upgraders

1. To run the chatbot with a **local, free model** (e.g. Qwen via Ollama): set `rag-llm-provider=openai`, `rag-llm-base-url` to the local endpoint (e.g. `http://localhost:11434/v1`) and `rag-llm-default-chat-model` to the model id; set `llm-api-key` to a placeholder (e.g. `ollama`) if the runtime doesn't validate it. No restart: the keys are hot-reloaded.
2. To stay on Anthropic, no action is needed: `anthropic-api-key` keeps working with `rag-llm-provider=anthropic` (default).
3. The **source (`-src-`) package is lighter**: it no longer includes the redundant framework DLLs at the root, which are recreated by `dotnet build` from the NuGet packages. Downloading the new `-src-` requires no action.
4. On **first chatbot use** with the .NET engine, the administrator will see the ONNX model download progress in the bell. Wait for the "ready" notification before the first `Ask`.
5. **New apps** generated by the framework automatically include the AI-assistant context files at the workspace root; for existing apps they can be regenerated.
