---
title: "A 3D product carousel from a SQL table: the Mesh Repeater"
slug: scene3d-mesh-repeater-data-driven-3d
date: 2026-09-22
author: Lorenzo Castrico
description: "WUIC's Scene3D designer has a Mesh Repeater: point it at a metadata route, it builds one mesh per record — carousel, grid or ring — with per-record GLB models and JS click callbacks."
tags: threejs, webgl, angular, 3d, lowcode
---

You have a `products` table. Rows, columns, an upload column with a GLB file per product. This is what the Mesh Repeater does with it:

![Scene3D designer — Mesh Repeater rendering a carousel of real product models from a metadata route](/assets/wuic-framework-docs/screenshots/mesh_repeater.png)

One object dropped from the palette, one route name typed into a property panel. No three.js code, no loader boilerplate, no per-product scene editing. The models on the disc are the rows of the table.

This post explains how it works and where it stops.

## The Scene3D designer, in one paragraph

WUIC ships a visual 3D designer on the route `#/scene3d_designer` — the same palette / canvas / property-panel layout as the [dashboard designer](/blog/dashboard-designer-drag-and-drop-metadata), except the canvas is a three.js viewport. You compose primitives, lights, cameras and imported assets (glTF/GLB, OBJ, FBX, STL, DAE), tweak PBR materials, and save. The scene serializes to a JSON column in `_wuic_scene3d` and reopens read-only in a viewer (`#/scene3d_viewer/:scene_key`). Renderer is WebGL by default with WebGPU as an opt-in toolbar toggle — the choice is saved with the scene, and browsers without WebGPU support fall back to WebGL automatically. Both designer and viewer are lazy-loaded, so three.js stays out of the initial bundle.

Any object in the scene can be bound to a WUIC metadata route — the same routes that drive list grids and edit forms elsewhere in the framework. Bound objects pull visual properties from data, and double-clicking one in the viewer opens the record's CRUD dialog.

That's the static story. The Mesh Repeater is the data-driven one.

## One mesh per record

The Mesh Repeater is a palette object that doesn't represent a single mesh. It represents a query. You give it:

- a **route** (a registered WUIC metadata route — a table or view the framework already knows how to fetch) and a **max record count** (`maxRecords`, first page);
- a **mesh source** — where each instance's geometry comes from;
- a **layout** — how the instances are arranged in space.

It fetches the records and builds one `Object3D` per row. It's the 3D equivalent of a list grid: the grid doesn't store its rows, and the repeater doesn't store its meshes. More on that below.

The repeater itself behaves like a group — you move and rotate the whole arrangement with the standard gizmos (`g` / `r` / `s` shortcuts). A **Regenerate** button re-fetches and rebuilds; an **Auto-regenerate** toggle does it on every property change, debounced.

## Mesh source: fixed, column, or a real model per record

The mesh source has three modes (`MeshSourceMode` in the source: `'fixed' | 'column' | 'asset'`):

- **Fixed** — every record gets the same primitive or asset. Fine for "200 warehouse locations as boxes".
- **Column** — a column of the route decides the primitive type per record.
- **Asset (column)** — the interesting one. The route has an upload column containing a `GLB`/`OBJ`/`STL` file per record; the repeater resolves each file through the app's normal upload storage and loads the actual model. Your product catalog renders as your products, not as colored cubes. Identical URLs are loaded once and cloned.

Two details make the asset mode usable with real-world files instead of a demo dataset:

- **Size normalization.** Uploaded models come at wildly different native scales — a chair scanned in millimeters next to a bottle modeled in meters. Each asset is normalized to unit size, then the layout applies its own scale, so everything on the carousel reads as one coherent set.
- **Base anchoring.** Models are anchored at their bounding-box bottom, so scaling grows them upward instead of sinking them through the carousel disc.

Beyond the geometry, a **field map** (`fieldMap`) binds per-instance properties to columns: position (`posX`/`posY`/`posZ`), rotation, scale, color, texture, visibility, label text. A `price` column can drive height; a `status` column can drive color.

## Layout: carousel, grid, ring

The layout mode places the instances. The simple geometric ones are `grid`, `line`, `circle`, `cube`. The carousel is an archetype with its own config: disc radius, disc color, visible-item count, and navigation arrows (size and material configurable) that scroll the set — the screenshot above is the default look. There are further archetypes in the same enum (chart, surface, gauge, node graph, kanban and others) that deserve their own post.

Pose fine-tuning lives in the carousel config too: `meshYOffset` raises or lowers the models relative to the disc, `meshRotX`/`meshRotY`/`meshRotZ` adjust their resting orientation — useful when a vendor's GLB comes in lying on its side.

## Click callbacks with the record in hand

Each instance knows which record produced it. The repeater panel has a collapsible section where you write JavaScript callbacks (Monaco editor) for **click**, **double-click** and **right-click** on an instance — stored as `onClickJs` / `onDoubleClickJs` / `onRightClickJs` in the scene config, executed in both the designer and the viewer.

The callback context gives you `record` (the hit instance's row, resolved via raycast, fields already unwrapped), `mesh` (the clicked `Object3D`), plus `event`, `scene`, `camera` and `THREE`. And a helper for the most common case — "show me this item":

```js
// "click" callback: popup with the model preview + a few record fields.
wuic.showItemPopup({
  mode: 1,
  title: record.StockItemName,
  fields: ['StockItemName', 'UnitPrice', 'Brand'],
  maximizable: true,
  autorotateMesh: false // inspect the model by dragging with the mouse
});
```

Which produces this — a live 3D preview of the clicked model next to the fields you asked for:

![Click callback — wuic.showItemPopup opens a panel with record fields and a live, rotatable 3D preview of the clicked mesh](/assets/wuic-framework-docs/screenshots/mesh_repeater_panel_click.png)

`showItemPopup` takes: `mode` (`1`/`'overlay'` = HTML overlay with a live 3D preview, `2`/`'panel3d'` = a 3D panel inside the scene that billboards toward the camera), `fields`, `title`, `width`/`height` (px or `'50%'`, overlay only), `panelBg`, `swap` (flip the mesh/fields sides), `maximizable`, `verticalPosition`/`horizontalPosition`, and `autorotateMesh` (`false` = drag-to-rotate instead of auto-spin; the wheel zooms in the overlay preview). `wuic.closePopup()` dismisses it.

The callbacks are authored by the app admin building the scene — the same trust model as the dashboard designer's template strings, and the same trade-off: maximum flexibility, no sandbox pretense.

## Not serialized, regenerated

The instances are **not** written into the scene JSON. What's persisted is the repeater's config — route, mesh source, field map, layout, callbacks. The viewer re-fetches the route at load time and rebuilds the meshes. Add a product row with a new GLB, reload the viewer: it's on the carousel. Nobody re-opens the designer.

This mirrors how the rest of WUIC treats data: the dashboard JSON stores *which* datasource, not the rows. Permissions come along for free — the route fetch goes through the standard authorization check, and the designer/viewer routes themselves sit behind the `scene3d-designer` feature flag.

## What it does NOT do

- **It's not a game engine.** There's optional per-object physics and asset animation playback, but no scripting lifecycle, no NPCs, no game loop API. It renders data.
- **Instances aren't editable individually.** You can't grab one carousel item and hand-tweak it — it would be overwritten at the next regeneration. Per-instance variation comes from the field map, i.e. from your data. If you need a hand-placed object, that's a regular scene object with a record binding, not a repeater.
- **Only the first page.** `maxRecords` caps the fetch (default 200). It won't paginate through a 100k-row table, and it shouldn't — WebGL will render a few hundred loaded GLBs happily, not tens of thousands.
- **Custom GLSL shaders are WebGL-only.** Switch the scene to WebGPU and hand-written shaders fall back to a placeholder material (the JSON-schema shader effects compile for both renderers; GLSL doesn't).
- **Callbacks are app-admin code.** They run with the page's privileges. If your threat model includes untrusted scene authors, don't give them the designer feature.

## Try it

The designer is at `#/scene3d_designer` in any WUIC app with the `scene3d-designer` feature enabled. Drop a **Mesh Repeater** from the palette, pick a route with an upload column full of GLB files, set the mesh source to *Asset (column)* and the layout to *carousel*. Hit Regenerate. Then write the four-line `showItemPopup` callback above and click a product.

If you want to read the source: the repeater logic is `scene3d-mesh-repeater.ts`, the carousel archetype is `scene3d-carousel.ts`, the popup helper is `scene3d-item-popup.ts` — all under the `scene3d-designer` folder of `wuic-framework-lib`.

Next in this series: the other repeater archetypes — bar charts, gauges and node graphs you can walk around.
