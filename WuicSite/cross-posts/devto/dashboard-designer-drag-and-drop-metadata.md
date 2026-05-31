---
title: "The dashboard designer: drag-and-drop that writes JSON metadata, not Angular code"
published: false
description: "Most low-code dashboards are exported to a proprietary binary or compiled to a per-tenant Angular bundle. WUIC ships an in-browser designer (palette + canvas + property panel) that writes a single JSON column (dom_board.boardcontent) plus per-board CSS sheets (dom_board_sheet) and the runtime renders it without recompile. This post explains the designer UX, the palette of components, the CSS attachment story, and the one trade-off we made about Angular markup inside the JSON."
tags: dashboard, designer, lowcode, angular
canonical_url: https://wuic-framework.com/blog/dashboard-designer-drag-and-drop-metadata
---

A common pattern in low-code platforms: the visual designer is a beautiful UI, but it compiles your dashboard into something opaque — a binary export, a per-tenant Angular bundle, an XML the runtime can't pretty-print. Whatever the format, you can't open it in `cat`, you can't `grep` it, and a "small fix" requires re-opening the designer.

WUIC ships a visual designer that runs in the browser and writes plain JSON. One row in `dom_board`, one JSON column called `boardcontent`. Plus optional CSS attached per board in `dom_board_sheet`. Pretty-printable. Diff-able. The runtime reads the JSON at load time, pulls in the linked stylesheets, and builds the component tree with no per-tenant build.

This is the trade-off we made and the parts of it I'd defend.

## The designer

![Dashboard designer — drag a chart from the palette, drop on canvas, edit properties, save](https://wuic-framework.com/assets/wuic-framework-docs/screenshots/designer__designer-advanced__desktop.gif)

The designer is an Angular component (`<wuic-designer>`) that the framework opens when you click "Edit" on any dashboard route. It has three panels:

- **Palette** on the left. A scrollable list of every component the runtime knows how to render — layout primitives (`TABLE`, `TR`, `TD`, `DIV`, `SPAN`), data primitives (`DATASOURCE`, `DATAREPEATER`, `CHART`, `MAP`, `KANBAN`, `SCHEDULER`, `CAROUSEL`, `SPREADSHEET`, `TREE`), and form/interaction primitives (buttons, links, dynamic templates). Each entry is a draggable card.
- **Canvas** in the middle. The live preview of the dashboard you're editing. You drop palette items into containers, drag existing nodes to reposition them, and the canvas re-renders the same component tree the runtime would render.
- **Property panel** on the right. When a node is selected, this panel exposes its `inputs` — every `@Input()` the underlying Angular component declares. Edit a property, the canvas updates in place.

There's no compile step between "drag" and "see". The designer renders with the same components the runtime uses, so what you see in design mode is what your users see in view mode.

A few of the affordances that took the most iteration:

- **Double-click on a palette item** drops it at the canvas root. Useful when you're starting from scratch and don't want to hunt for the right drop target.
- **Right-click on a canvas node** opens a context menu with copy/paste/delete/wrap-in-container. Copy-paste serializes the subtree to clipboard JSON; pasting deserializes it back, useful for moving a whole tile across boards.
- **Undo/redo** with a per-edit history stack. Each property change, drop, or delete is one history entry.
- **Save** does two writes: the canvas state goes to `dom_board.boardcontent` as JSON, and any CSS edits go to `dom_board_sheet` rows (more on that below).

There's no "design mode JSON" you can edit by hand from inside the designer — but you can open the JSON via a different route and edit it externally if you want. The designer is the recommended tool because the JSON is large.

## The palette

Components are registered in the palette by registry, not hard-coded. Each component declares:

- a `componentType` string (`CHART`, `LIST`, etc.)
- a default `inputs` object (so a dropped component shows sensible defaults)
- an icon (PrimeIcons class) for the palette card
- a category (`Layout`, `Data`, `Form`, `Custom`)
- an optional drop-target predicate (e.g. a `TR` only accepts `TD` children)

So when you `npm install` a host that registers a custom Angular widget — say, a colour picker or a map-with-clusters — it shows up in the palette automatically. The dashboards built on top can include it the same way they include the built-in `CHART`.

We didn't ship a fixed palette and a separate "extension point". The palette IS the extension point: register a component, it's there for the designer.

## What's in `dom_board`

The schema is intentionally small:

```sql
CREATE TABLE dom_board (
    id1            INT IDENTITY(1,1) PRIMARY KEY,
    boardroute     NVARCHAR(200) NOT NULL,   -- the route the runtime opens
    boarddes       NVARCHAR(500) NULL,       -- friendly label
    boardcontent   NVARCHAR(MAX) NOT NULL    -- the JSON the designer writes
);
```

`boardroute` matches a registered Angular route (e.g. `crm_home`, `sasa/dashboard`). When the user navigates there, the runtime fetches the row, parses `boardcontent`, and builds the component tree.

`boarddes` is a label that shows up in the dashboard picker. Inconsequential.

`boardcontent` is the entire dashboard, serialized.

## The JSON shape

The serialized component tree mirrors the canvas. Each node has:

- a `componentType` (`TABLE`, `TR`, `TD`, `DIV`, `SPAN`, `DATASOURCE`, `DATAREPEATER`, `CHART`, etc.)
- `inputs` (the @Input bindings — anything the property panel could edit)
- `components` (children, for layout containers)
- `componentRows` / `componentCells` (specifically for `TABLE`/`TR`)
- `cssClass` and `cssStyle` if you applied per-node styling

That's deliberately HTML-ish. The runtime doesn't try to invent its own grid system; it leans on familiar containers because browsers already know how to render them at 60fps, and the JSON maps 1:1 to the DOM the designer shows.

The actual `inputs` set per component type can be large — a `CHART` has dozens of options (axis labels, palette, legend position, tooltip format, click handler, animation). The designer's property panel filters to the meaningful ones; the JSON keeps everything you customised and omits defaults.

## The DATASOURCE → consumer convention

The thing that makes a dashboard JSON different from a "static page" JSON is the **datasource pairing**. Each chart, list, map, or kanban comes in two pieces:

```json
{
  "componentType": "DATASOURCE",
  "inputs": {
    "route": "crm_opportunities_by_stage",
    "autoload": true,
    "uniqueName": "ds_opportunities_by_stage_1"
  },
  "metaInfo": {
    "tableMetadata": { "md_props_bag": "{...}" },
    "columnMetadata": [ /* per-column metadata for the route */ ]
  }
},
{
  "componentType": "CHART",
  "inputs": {
    "datasourceUniqueName": "ds_opportunities_by_stage_1",
    "chartType": "bar",
    "labelField": "stage_name",
    "valueField": "deal_count"
  }
}
```

The first emits data, the second consumes it. They're paired by `uniqueName` ↔ `datasourceUniqueName`. This is the same convention used in the rest of WUIC — list pages, edit forms, chart pages — so the designer didn't invent a new contract.

What's important here: the `route` on the datasource points to a **registered metadata route**. The runtime resolves that route against `_metadati__tabelle.mdroutename`, loads the table/column metadata, calls the auto-generated CRUD endpoint, and feeds the result to the consumer. The chart didn't have to know SQL. The route is the abstraction.

In the designer UI, dropping a `DATASOURCE` opens a route picker (autocomplete over all registered routes), and dropping a `CHART` or `LIST` after one auto-binds via `uniqueName`. You can also paste an already-bound pair as a unit.

## CSS support: `dom_board_sheet`

![Designer CSS panel — attach a stylesheet to the current board, edit in-browser, see the canvas re-render live](https://wuic-framework.com/assets/wuic-framework-docs/screenshots/designer__designer-css__desktop.gif)


Out of the box, dashboards inherit the global app theme. Often that's enough. When it's not — a "KPI tile that flips red when negative", a "card that uses the customer's brand colour", a per-board print stylesheet — we need a place to put CSS that's scoped to the board and survives runtime upgrades.

The schema:

```sql
CREATE TABLE dom_board_sheet (
    id1            INT IDENTITY(1,1) PRIMARY KEY,
    dom_boardid    INT NOT NULL,        -- FK to dom_board.id1
    sheet_path1    NVARCHAR(500) NULL   -- path to a .css file shipped with the app
);
```

One row per stylesheet attached to a board. A board can have many sheets (a base one + a print one + a customer-brand one, say). At dashboard load, the runtime resolves each `sheet_path1` against the app's static asset folder, injects `<link rel="stylesheet">` tags into the head with a board-scope marker, and unmounts them when the user leaves the route.

In the designer, the stylesheet panel lets you:

- **Attach** an existing `.css` file from the app's assets to the current board (creates a `dom_board_sheet` row pointing at it).
- **Edit** an attached file in an in-designer text editor. Save writes to disk + invalidates the runtime cache so the canvas re-renders with the new styles immediately.
- **Apply** classes to nodes via the property panel — type a class name in `cssClass`, the canvas reflects it, and the JSON records it on the node.

This is intentionally file-based, not embedded in JSON. CSS is text. It belongs in `.css` files in source control. The DB just tells the runtime which files to load for which board.

The per-board scope is a CSS class wrapper — every component the designer emits gets a `data-board-id="<id>"` attribute, and the linked stylesheet authors are expected to scope selectors with `[data-board-id="42"] .my-class`. We didn't build runtime CSS-in-JS or shadow DOM scoping; the convention is plain CSS authoring discipline. For most internal apps that's been enough.

## The trade-off: Angular template strings inside JSON

There's one ugly part. Some component nodes — specifically the ones that need a binding expression that the designer didn't have a UI for — carry a `tag` field with an **Angular template string** inside the JSON:

```json
{
  "componentType": "SPAN",
  "tag": "<span [innerText]=\"computeKpi(record.amount, record.tax)\" [style.color]=\"record.amount > 0 ? '#10b981' : '#ef4444'\"></span>",
  "inputs": { ... }
}
```

The runtime compiles that `tag` string into a real Angular component (via `ɵcompileComponent`) at dashboard-load time and slots it in. This is how the designer lets a power-user write a KPI tile with custom formatting without writing TypeScript.

Trade-off:

- **Pro:** any binding expression Angular supports works inside the dashboard, without us having to invent a domain-specific binding language.
- **Con:** the JSON is no longer just data. A typo in a binding string fails at dashboard-load, not at save-time. We can't fully validate `boardcontent` with a JSON schema.

We mitigated this with a designer-side parser that catches the most common errors (unclosed braces, unknown variable names) before save, and a runtime fallback that logs the broken binding and renders the rest of the dashboard rather than crashing. But it's a real downside — if you want JSON purity, this isn't it.

For us the alternative was worse: invent our own expression language, document it, debug it, version it. Reusing Angular's binding syntax meant the designer's mental model is the same as the framework's mental model, and we didn't add a new layer of indirection.

## What stays metadata-driven

Even with the template-string escape hatch, the data flowing into the dashboard is metadata-driven all the way down:

- **Data source route** → resolves to `_metadati__tabelle.mdroutename`.
- **Column metadata** → comes from `_metadati__colonne`, includes formatting, lookup resolution, validation.
- **Permissions** → checked against `_mtdt__tnt__trzzzioni__tabelle` per requesting user/role.
- **Translations** → labels resolved via the `_wuic_translations` table on render.

What you wrote into the dashboard is *what to show* (which datasources, what archetype, what styling). What you didn't write is *how to fetch it* — the framework figures that out from the route's metadata. Change the underlying SQL view, invalidate the metadata cache, the dashboard picks up the new shape without re-saving.

## When the designer is the wrong tool

If your "dashboard" is really an app page with bespoke layout, custom interaction patterns, and three integrated forms — write it in Angular. The designer is for **data presentation**: a board of charts, KPI tiles, lists, maps, calendars, with light interactivity. It's not a page builder for arbitrary UI.

## Try it

The [public demo](https://wuic-framework.com/sandbox) ships with a few dashboards under the "Home" menu. Open one, then click "Edit" in the top-right of any board — the designer opens read-write. Drag a chart from the palette, change its `chartType` in the property panel, attach a CSS sheet. Save. The change persists for 24 hours, then the nightly reset wipes it back to the seed.

If you want to read the source: the designer is `designer.component.ts`, the runtime renderer is `boardcontent-runtime.component.ts`, the palette registry is `designer-palette-registry.ts`, and the stylesheet injection lives in `dom-board-sheet-loader.service.ts`. The codebase chatbot ([RAG post](https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3)) can locate each one faster than the file tree can.

Next in this series: **report generation** — how a SQL view becomes a `.mrt` report with no per-route code, and how the report designer integrates with the same metadata schema the dashboards use. Subscribe via the RSS feed.
