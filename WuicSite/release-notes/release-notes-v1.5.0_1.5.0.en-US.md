# Release Notes — WUIC Framework v1.5.0

**Date**: 11 July 2026
**Previously published version**: 1.3.2 (18 June 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

A broad release gathering work on several fronts. The **RAG chatbot** has a simplified, unified LLM configuration, with running a free local model (Qwen via Ollama) now a first-class option and an engine hardened against the quirks of local models; a new **Visual Studio Code** plugin, **WUIC Assistant**, brings the same agentic approach into the editor. The new **Scene3D Designer** brings 3D scene authoring into the app — PBR materials, shader effects, lights with baking, physics, and a viewer that ties objects to data — and rendering is now selectable between WebGL and **WebGPU**. The **Workflow Designer** gains an assisted-authoring pack (templates, graph validation, guided dialogs, inline help), and the **Dashboard Designer** a set of editing improvements.

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

Alternatively, `install-llm-workspace.ps1` installs it. Then `Ctrl+Shift+P` -> **WUIC Assistant: Open Chat**; choose the provider in settings (`wuicAssistant.provider` = `ollama` or `anthropic`).

## 🧊 Scene3D Designer (new)

A new visual 3D designer on route `#/scene3d_designer`, published read-only through the Scene3D Viewer (`#/scene3d_viewer/:scene_key`). It lets you compose a three-dimensional scene and bind its objects to app data.

- **Palette and import**: primitives (cube, sphere, plane, cylinder, cone, torus), groups, lights, camera, 3D text, and Mesh Repeater (instances generated from data). Import of external models in glTF/GLB, OBJ, FBX, STL, and DAE. The palette is extensible from metadata with custom types.
- **PBR materials**: metalness, roughness, emissive, opacity, wireframe, flat shading, and face sides; for the physical material also transmission, IOR, thickness, and volumetric attenuation (colored glass).
- **Shader effects**: an effect described in JSON (schema-backed, with completion and a "structure" view) is compiled for the active renderer; alternatively, hand-written GLSL shaders on the WebGL renderer.
- **Lighting**: scene lights with soft shadows, baking of static lighting into vertex colors (unlit), and — on the WebGL renderer — a photorealistic preview path tracer.
- **Animation and physics**: transport controls for imported-asset clips; optional per-object physics with Play/Stop simulation in the designer and autoplay in the viewer.
- **Data binding**: each object binds to a WUIC route (with optional record) and maps visual properties (label, color, visibility) to columns; double-clicking a bound object in the viewer opens the record's CRUD.
- **Automatic thumbnails**: on save the scene is captured from the canvas and shown as a preview in the "Load scene" list, with no configuration or external process.

The designer and viewer routes require the `scene3d-designer` feature. The supporting tables are created and updated automatically on first use, across all supported databases.

## 🖥️ WebGPU renderer (opt-in)

Scene and viewer rendering is now selectable between **WebGL** (default) and **WebGPU** (toggled from the toolbar). When WebGPU is unavailable in the browser, the designer stays on WebGL automatically. The chosen mode is saved with the scene and restored on open. With the WebGPU renderer active, light baking runs on the GPU (shadows included), much faster on dense scenes; hand-written GLSL shaders and path tracing remain available on the WebGL renderer.

## 🔀 Workflow Designer — assisted authoring

The workflow designer (`#/workflow-designer`) now guides building a process from scratch.

- **Starter templates**: "New from template" generates a ready-made graph for common patterns (simple approval, claim/release queue, threshold chain, parallel tasks): you pick the main route and — where needed — the status field, and the graph, actions, and transitions are created already wired.
- **Graph validation**: "Validate graph" flags problems before saving (start with no outlets, unreachable nodes, action without target, empty condition, dead branch, incomplete timer or split, permission with a missing role). Clicking a finding frames the node on the canvas. Saving is never blocked: with open issues a summary appears with "Save anyway".
- **Guided configuration**: the timer and parallel-task dialogs use dropdowns and route autocompletion instead of free-text fields typed from memory.
- **Onboarding and help**: a first-steps checklist on an empty canvas, descriptive palette tooltips, and a "Quick guide" with a legend of shapes and a glossary of concepts (transition, guard, permission, internal action).

## 🎨 Dashboard Designer — faster editing

- **Snap to grid**: toggled from the designer actions menu, it shows the grid on the canvas and automatically aligns dragging, resizing and palette drops. When enabled, the elements already on the canvas are aligned to the grid as well.
- **Normal / absolute flow**: a new flag in the actions menu (default: normal flow, no change for existing dashboards). In absolute mode, dropped elements are positioned at the drop coordinates, outside the flow: resizing one does not move the others. Dropping into a container uses the container as the position reference, and the runtime automatically recognizes dashboards saved in this mode.
- **Keyboard shortcuts**: `Del`/`Backspace` deletes the selected element, arrow keys move it, `Ctrl+Z`/`Ctrl+Y` undo/redo. Dragging a selection rectangle from an empty canvas area selects multiple elements: arrows and `Del` act on the whole selection.
- **JSON and preset import/export**: the current dashboard can be exported as a re-importable JSON file (identical to the persisted content), useful to move layouts between environments. Presets save reusable layouts under a name and re-apply in one click.
- **Move between tabs**: from the context menu of an element inside a tab, *Move to new Tab* creates a new tab and migrates the element there (bindings and state preserved); *Move to another tab* — available when the tabview has multiple tabs — moves it to an existing tab of your choice. The target tab is activated automatically, as is a freshly dropped tab.
- **Import dashboard/preset into an element**: from the context menu of a container, a saved dashboard or a preset can be imported directly inside the element; the identifiers of the imported elements are regenerated and internal references (datasources included) remapped, with no collisions with the existing content.

## 🐛 Notable bug fixes

- **Designer — multi-column layout**: injecting a multi-column/multi-area layout (e.g. "3 columns, each with a grid") proposed by the chatbot now populates all areas correctly. Previously, after the first cell, the following ones were not resolved and the components stayed empty.
- **Chatbot — route whitelist**: when asking to bind a component to a route with an inexact name (e.g. "provincie" for "stateprovinces"), the chatbot now performs the semantic match and proposes the action, instead of wrongly replying that the route list is still loading.
- **3D viewer — navigating between scenes**: opening different scenes in sequence from the same viewer now loads each scene correctly. Previously the viewer could keep showing the first opened scene.
- **Schema-backed JSON editor**: the code editor in JSON mode now offers a "structure" view (toggled with a switch) to add and remove typed properties driven by the schema, without writing JSON by hand.

## 🔧 Recommended operational updates for upgraders

1. To use a free local LLM, set in `appsettings.json` -> `AppSettings`: `rag-llm-provider=ollama`, `rag-llm-base-url`, `rag-llm-api-key` (placeholder value, e.g. `ollama`) and `rag-llm-default-chat-model`.
2. Migrate the chatbot key to `rag-llm-api-key`: the previous `llm-api-key` and `anthropic-api-key` keep working as fallback, but the recommended configuration uses only `rag-llm-api-key`.
3. For the VS Code assistant, install the plugin from the ZIP: `code --install-extension llm-workspace/plugin/wuic-assistant.vsix` (or let `install-llm-workspace.ps1` install it).
4. To use the Scene3D Designer, enable the `scene3d-designer` feature in the active license. Support tables are created and migrated automatically on first use; the WebGPU renderer is opt-in from the toolbar, with automatic fallback to WebGL.
