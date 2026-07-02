# Release Notes — WUIC Framework v1.3.3

**Date**: 21 June 2026
**Previously published version**: 1.3.2 (18 June 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

A release focused on the **RAG chatbot**: the LLM model configuration has been simplified and unified, running a free local model (Qwen via Ollama) is now a first-class option, and the engine was hardened against the quirks of local models — so the actions proposed on the designer and on metadata work reliably even without a commercial provider. The package also includes a new **Visual Studio Code** plugin, **WUIC Assistant**, bringing the same agentic approach into the editor.

---

## 🤖 RAG Chatbot — unified LLM configuration

The chatbot LLM provider configuration has been consolidated around **a single key** and an explicit provider list.

- `rag-llm-provider` — `anthropic` / `openai` / `openrouter` / `ollama`, **set it explicitly** (no default provider: if empty, the chatbot stays in retrieval-only and invokes no LLM). `ollama` is now a first-class value: it points to a local runtime via `rag-llm-base-url`, with an OpenAI-compatible format.
- `rag-llm-api-key` — the **single** source of the key, regardless of the chosen provider. It replaces the previous `llm-api-key` / `anthropic-api-key` pair (still accepted only as a migration fallback). The special value `agent-sdk` uses the Agent SDK (`claude` CLI) via subscription instead of the metered API, if installed.
- `rag-llm-base-url` — endpoint override; required for `ollama` (e.g. `http://HOST:11434/v1`), optional for the other providers.
- `rag-llm-default-chat-model` — model id for the chosen provider.

All keys remain **hot-reloaded** from `appsettings.json`: switching provider or model requires no restart.

## 🧠 Free local LLM (Qwen via Ollama), zero API key

The chatbot can now run entirely on a **free open local model** — for example **Qwen** (`qwen2.5-coder:32b`) served by **Ollama** on your own machine or on the LAN — with no API key and no per-token cost. Typical configuration in `appsettings.json` -> `AppSettings`:

```
rag-llm-provider           = ollama
rag-llm-base-url           = http://HOST:11434/v1
rag-llm-api-key            = ollama
rag-llm-default-chat-model = qwen2.5-coder:32b
```

A complete guide to set up the Ollama server (Windows/Linux, LAN exposure, context tuning, persistent startup) is included in the package.

## ⚙️ Reliable chatbot actions even with local models

The engine was made tolerant of the quirks of local models, which — unlike commercial models — sometimes do not strictly follow the tool-call format. The chatbot now correctly recovers the proposed action even when the model emits it as text or with non-standard JSON escapes. In practice, the actions on the designer and on metadata — table (bulk) buttons, row buttons, conditional styles, callbacks, component injection in the designer — are proposed and applied reliably even with a local LLM.

## 🧩 Agentic assistant in VS Code — WUIC Assistant

The package now includes a plugin for **Visual Studio Code**, **WUIC Assistant** (`llm-workspace/plugin/wuic-assistant.vsix`): an assistant that already knows the framework conventions and works directly on the open project. It generates Angular components (cards, dashboards with KPI tiles, list-grids with navigation to the edit form), components fed by a custom .NET endpoint, and proposes metadata changes (conditional styles, table and row actions, lookups). Every write goes through a preview before confirmation.

It uses the same local WUIC RAG via the `wuic-rag` MCP server (started automatically) and the grounding already present in the project, so no manual MCP server setup is required. The LLM model is your choice — **local via Ollama** (Qwen, zero API key) or Anthropic.

Install from the ZIP:

```
code --install-extension llm-workspace/plugin/wuic-assistant.vsix
```

Alternatively, `install-llm-workspace.ps1` installs it. Then `Ctrl+Shift+P` -> **WUIC Assistant: Apri Chat**; choose the provider in settings (`wuicAssistant.provider` = `ollama` or `anthropic`).

## 🐛 Notable bug fixes

- **Designer — multi-column layout**: injecting a multi-column/multi-area layout (e.g. "3 columns, each with a grid") proposed by the chatbot now populates all areas correctly. Previously, after the first cell, the following ones were not resolved and the components stayed empty.
- **Chatbot — route whitelist**: when asking to bind a component to a route with an inexact name (e.g. "provincie" for "stateprovinces"), the chatbot now performs the semantic match and proposes the action, instead of wrongly replying that the route list is still loading.

## 🔧 Recommended operational updates for upgraders

1. To use a free local LLM, set in `appsettings.json` -> `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (placeholder value, e.g. `ollama`) and `rag-llm-default-chat-model`.
2. Migrate the chatbot key to `rag-llm-api-key`: the previous `llm-api-key` and `anthropic-api-key` keep working as fallback, but the recommended configuration uses only `rag-llm-api-key`.
3. To use the Agent SDK via subscription instead of the metered API, set `rag-llm-api-key=agent-sdk` (requires the `claude` CLI installed).
4. For the VS Code assistant, install the plugin from the ZIP: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (or let `install-llm-workspace.ps1` install it).
