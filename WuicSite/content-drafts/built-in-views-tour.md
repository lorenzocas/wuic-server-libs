---
title: "One metadata route, six views: the built-in archetypes tour"
slug: built-in-views-tour
date: 2026-10-06
author: Lorenzo Castrico
description: "The same WUIC metadata route rendered as kanban, map, spreadsheet, tree, scheduler and carousel — switch archetype with a URL segment, no re-scaffolding."
tags: angular, ui, lowcode, components, datavis
---

Here's a question that quietly decides how expensive your internal apps are: when the team says *"can we see the tickets as a board instead of a table?"*, what does that cost? In most stacks the honest answer is "a sprint" — new component, new endpoint wiring, new deploy.

In WUIC the answer is a URL segment. A registered metadata route — one row in `_metadati__tabelle`, column metadata in `_metadati__colonne` — doesn't know or care how it will be drawn. The runtime component that draws it, `wuic-data-repeater`, receives the route's datasource plus an **action** string, and converts that action into an **archetype**: `list`, `spreadsheet`, `map`, `tree`, `scheduler`, `carousel`, `kanban`, `chart`. Same data, same permissions, same filters, same CRUD endpoint underneath. Navigate to `/customers/list` and you get the grid; navigate to `/customers/spreadsheet` and you get an editable sheet. No re-scaffolding, no compile.

Each archetype reads its own configuration from the route's props bag — a JSON node per archetype under `md_props_bag.archetypes.<name>` — so the kanban config and the map config for the same route coexist without fighting. This post is a tour of six of them.

## Kanban

![Kanban archetype — cards grouped by status column, drag-and-drop between columns](/assets/wuic-framework-docs/screenshots/kanban-list__kanban-base__desktop.gif)

Point `archetypes.kanban.statusField` at the column that holds each record's state and you have a board: one column per status, one draggable card per record, `titleField` / `descriptionField` / `cardSubtitleField` deciding what the card shows. Drop a card in another column and the status persists — immediately (`persistMode: "immediate"`) or accumulated locally and saved in one batch (`"batch"`), with events like `onKanbanCardDrop` and `onKanbanBatchSave` if the host wants to react.

```json
{
  "archetypes": {
    "kanban": {
      "statusField": "StatusId",
      "titleField": "Title",
      "descriptionField": "Description",
      "assignedUserIdField": "AssignedUserId",
      "clickAction": "detail",
      "persistMode": "immediate"
    }
  }
}
```

The part I like: you don't have to enumerate the columns. If `statusColumns` is omitted, the board generates them from the lookup route behind `statusField` — value, label and order come from the lookup, and optional lookup columns feed `colorField` (per-column color), `wipLimitField` and `wipLimitHardField`. That last pair gives you real WIP limits from data: a *hard* limit blocks further drops on a full column, a *soft* one just warns. Add a status row in the lookup table and the board grows a column without touching config.

## Map

![Map archetype — records as markers with clustering and per-record customization](/assets/wuic-framework-docs/screenshots/map-list__map-marker__desktop.gif)

If the route has a column of type `point`, every record becomes a marker (with optional clustering via `useClusterer`); if it has a `polygon` column, records render as polygons instead — the component detects this from column metadata, you don't pick a mode. `titleField` and `infoField` fill the info window, or you replace it entirely with an `itemTemplateString` that has the full `record` in scope.

Two newer tricks worth knowing. First, **per-record marker customization without callbacks**: set `markerColorField` to a record field holding a CSS color and each marker renders as a pin of that color; set `customMarkerImageSrcField` to a field holding an image URL *or an inline SVG string* and the marker becomes that image (format auto-detected, image wins over color). The user edits a vehicle's color in its master-data form; every map picks it up. Second, the **polyline overlay** for GPS tracking: with `polyline.enabled`, records are grouped by `groupByField` and ordered by `orderByField` into one line per group — one marker on the latest point, optional waypoint dots on the raw GPS fixes, and `snapToRoads` to align the path to real streets via the Routes API.

```json
{
  "archetypes": {
    "map": {
      "useClusterer": true,
      "titleField": "CityName",
      "markerColorField": "colore_marker",
      "customMarkerImageSrcField": "svg_marker",
      "polyline": {
        "enabled": true,
        "groupByField": "mezzo_id",
        "orderByField": "timestamp_pos",
        "colorField": "colore_marker",
        "snapToRoads": true,
        "travelMode": "WALKING"
      }
    }
  }
}
```

## Spreadsheet

![Spreadsheet archetype — Excel-style editing over the same route](/assets/wuic-framework-docs/screenshots/spreadsheet-list__spreadsheet-animation__desktop.gif)

Same route, now as a sheet — built for mass data entry and quick multi-record corrections, the workflows people otherwise export to Excel and re-import badly. The wrapper handles paging (`paginationSize`), row insert/delete, and batch save of pending changes, emitting `onSpreadsheetBatchSaved`, `onSpreadsheetRowInserted` and friends so the host can hook in.

Configuration is deliberately thin: a few explicit knobs (`rowHeaderWidth`, `minColumnWidth`, per-worksheet overrides) and everything else in `archetypes.spreadsheet` passes through to the underlying jspreadsheet engine. We didn't re-document a spreadsheet engine's option surface; we forwarded it.

```json
{
  "archetypes": {
    "spreadsheet": {
      "paginationSize": 50,
      "rowHeaderWidth": 50,
      "minColumnWidth": 60
    }
  }
}
```

## Tree

![Tree archetype — parent/child hierarchy with expandable nodes](/assets/wuic-framework-docs/screenshots/tree-demo.gif)

For self-referencing data — categories, org charts, BOM structures — the tree archetype needs exactly one thing: `parentField`, the column that points at the parent record. `labelField`, `iconField` and `leafField` dress the nodes; children load lazily on expand (`onTreeNodeExpand` fires before the fetch, `onTreeNodeExpanded` after), so a ten-thousand-node classification doesn't load up front.

```json
{
  "archetypes": {
    "tree": {
      "parentField": "parent_id",
      "labelField": "name",
      "iconField": "icon",
      "leafField": "is_leaf"
    }
  }
}
```

When a label isn't enough, `labelFunction` computes it in JS, or `itemTemplateString` replaces the node body with a template that receives `record`, `metaInfo` and the `datasource` — the same template contract every other archetype uses.

## Scheduler

![Scheduler archetype — records as calendar events with drag, drop and resize](/assets/wuic-framework-docs/screenshots/scheduler-list__scheduler-animation__desktop.gif)

Anything with a start and an end becomes a calendar: `fromField`, `toField`, `titleField`, done.

```json
{
  "archetypes": {
    "scheduler": {
      "fromField": "start_at",
      "toField": "end_at",
      "titleField": "title"
    }
  }
}
```

Shifts, maintenance windows, bookings — the records render as events on a FullCalendar-backed view, and the interactions are already wired: drag an event to another day or resize it and the date fields sync back through the route's normal update pipeline, with `onSchedulerEventSync` confirming the write.

For richer event blocks there's the usual pair of escape hatches: `titleFunction` for a computed title, `itemTemplateString` for a fully custom event body. The host also gets the raw calendar relays (`onSchedulerDateClick`, `onSchedulerEventClick`, `onSchedulerDatesSet`) when a page needs to do something on top — say, opening the standard edit dialog on click.

## Carousel

![Carousel archetype — records as scrollable image cards](/assets/wuic-framework-docs/screenshots/carousel-list__carousel-animation__desktop.gif)

The presentation-layer sibling: product catalogs, photo evidence, anything where the record's most important column is an image. `imageFieldName` and `descriptionFieldName` map the card, `numVisible` / `numScroll` control the strip, and `usePreview` adds click-to-zoom. Responsiveness is declared as data — `responsiveOptions` is an array of `{ breakpoint, numVisible, numScroll }` rules, so the same route shows three cards on desktop and two on tablet without a media query in sight.

```json
{
  "archetypes": {
    "carousel": {
      "imageFieldName": "image",
      "descriptionFieldName": "description",
      "numVisible": 3,
      "numScroll": 1,
      "usePreview": true,
      "responsiveOptions": [
        { "breakpoint": "1024px", "numVisible": 3, "numScroll": 1 },
        { "breakpoint": "768px", "numVisible": 2, "numScroll": 1 }
      ]
    }
  }
}
```

And because it's the same contract as everywhere else, `itemTemplateString` swaps the whole card for your own template when the default image-plus-caption layout runs out.

## How to switch archetype

Three moving parts, all metadata:

1. **The action segment in the URL.** `/cities/list` and `/customers/spreadsheet` are the same routing pattern — route slug plus archetype action. A menu entry is just a pointer to one of these, so "give managers the board and operators the sheet" is two menu rows over one route.
2. **Per-archetype config in the props bag.** Each archetype reads only its own node under `md_props_bag.archetypes.<name>`. Configuring the kanban doesn't disturb the map. Edit the props bag, invalidate the metadata runtime, reload — no build.
3. **The repeater in custom pages.** In hand-written pages, `<wuic-data-repeater>` takes the archetype as an `action` input — an observable, so a runtime archetype switcher (list → chart → spreadsheet → map on the same datasource) is a dropdown bound to a `BehaviorSubject`, which is exactly what the "Cities data-repeater events" demo does.

The important non-feature: none of these components accept view-specific HTML inputs. There is no `[groupField]` on the kanban tag, no `[fromField]` on the scheduler tag — the tags take a datasource and little else, and the configuration lives in metadata where it can be changed per install, per tenant, at runtime. That's the whole trick. The view is a rendering decision, and rendering decisions shouldn't require a deploy.

## Try it

The [public demo](/sandbox) ships routes with several archetypes pre-configured — open one, then change the action segment in the URL and watch the same data re-render. The full option reference for each view lives in the framework docs (kanban-list, map-list, spreadsheet-list, tree-list, scheduler-list, carousel-list), and the codebase chatbot from the [RAG post](/blog/rag-chatbot-with-claude-and-bge-m3) answers "which field do I set for X" faster than scrolling.

Next in this series: the **chart archetype** and how it pairs with the [dashboard designer](/blog/dashboard-designer-drag-and-drop-metadata) to put six of these views on one board.
