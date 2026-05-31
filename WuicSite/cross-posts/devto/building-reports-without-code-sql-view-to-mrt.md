---
title: "Building reports without code: SQL view to .mrt to printed PDF in one route"
published: false
description: "WUIC's report engine binds a Stimulsoft .mrt file to a metadata route. Write a SQL view, scaffold it, point the .mrt at the route, drop the route into a menu — the report runs in the embedded viewer with the right data, right filters, and right permissions. No per-report TypeScript, no per-report backend code, no separate auth layer."
tags: reports, sql, lowcode, pdf
canonical_url: https://wuic-framework.com/blog/building-reports-without-code-sql-view-to-mrt
---

The reporting story in most enterprise apps goes like this: build a stored procedure, expose it via a custom controller, write a TypeScript service to call it, embed a Stimulsoft (or Crystal, or Telerik) viewer, manually wire the parameters, manually handle the per-user filter, manually validate the permissions. Multiply by 40 reports. Each one is a tiny project.

The WUIC version: write a SQL view, scaffold it as a metadata route, drop a `.mrt` file in a folder, add a menu entry pointing at the route's report viewer. The framework picks it up. The same auth, filtering, pagination, and permissions that drive list pages apply to the report — for free, because it's the same route.

This post walks through the contract between the report, the route, and the viewer, and why naming discipline matters more here than anywhere else in the framework.

## The example

Say you want a "Sales by Region" report that aggregates `opportunities` joined with `accounts` and groups by region. The SQL is straightforward:

```sql
CREATE VIEW vw_sales_by_region AS
SELECT
    a.region_code,
    a.region_name,
    COUNT(o.id)                  AS opportunity_count,
    SUM(o.amount)                AS total_amount,
    AVG(o.amount)                AS avg_deal_size,
    SUM(CASE WHEN o.stage = 'Won' THEN o.amount ELSE 0 END) AS won_amount
FROM dbo.opportunities o
INNER JOIN dbo.accounts a ON a.id = o.account_id
WHERE COALESCE(o.deleted, 0) = 0
GROUP BY a.region_code, a.region_name;
```

That's the data. Now the report.

## Scaffold the view as a metadata route

The framework needs to know about the view in `_metadati__tabelle` so the runtime can resolve it, validate per-column permissions, and apply the user's filter context. One endpoint call:

```http
POST /api/Meta/AsmxProxy/scaffolding.scaffoldView
Cookie: k-user=...

{ "viewName": "vw_sales_by_region", "createMenu": false }
```

`createMenu: false` because we don't want this view to show up as a list page — it'll be reachable through the report's own menu entry. The scaffolder inserts a `_metadati__tabelle` row with `mdroutename = 'vw_sales_by_region'` (sanitized) and one `_metadati__colonne` row per column.

The columns are now metadata. The framework knows that `total_amount` is a decimal that should render with thousand separators, that `region_name` is a string used as the human-friendly group key, and that the view has 6 columns. None of that is in the report yet — it's in the metadata, and the report will read it.

## Bind the .mrt to the route

The Stimulsoft `.mrt` file is XML. The contract with WUIC is **the data source name inside the .mrt must equal the metadata route name**. So inside the .mrt:

```xml
<DataSources>
  <DataSource Ref="1" Type="DataTableSource" isKey="true">
    <Name>vw_sales_by_region</Name>
    <Alias>vw_sales_by_region</Alias>
    ...
  </DataSource>
</DataSources>
```

And every binding expression in the report references `{vw_sales_by_region.field_name}`:

```xml
<Text>{vw_sales_by_region.region_name}</Text>
<Text>{vw_sales_by_region.total_amount}</Text>
```

That's the entire integration. The framework's report viewer registers a data source named `vw_sales_by_region`, populates it by calling the auto-generated `vw_sales_by_region.crudRead` endpoint, applies the user's filter context, and hands the result to Stimulsoft.

You don't write a backend endpoint for the report. You don't write a TypeScript service. You don't wire parameters. The report is a `.mrt` file in a folder, and the framework finds it.

## Where the .mrt goes on disk

Convention:

```
<App>/Reports/<route>/<filename>.mrt
```

For our example:

```
CrmApp/Reports/vw_sales_by_region/vw_sales_by_region.mrt
```

The `<filename>` is arbitrary — `report.mrt`, `print.mrt`, `sales-by-region-v2.mrt` all work. What matters is the path includes the route name, because the viewer endpoint constructs the file path from the route:

```
/{route}/report-viewer?reportName={filename}.mrt
```

So for our view:

```
/vw_sales_by_region/report-viewer?reportName=vw_sales_by_region.mrt
```

Drop that URL into a menu entry under `_metadati__menu` and it shows up in the navigation. Click it, the viewer opens, the report renders with live data.

Multiple `.mrt` files per route are supported — say `summary.mrt` and `detailed.mrt` for the same view, with the menu offering both as options. Each menu entry passes its own `reportName=`.

## What's reused from the rest of the framework

This is where the metadata-driven story pays off:

- **Auth.** The viewer endpoint runs the same `RawHelpers.authenticate()` the rest of the API uses. No separate report login.
- **Filter context.** The framework's user-scoped filters (e.g. `country_code IN (user's territory)`) apply to the report's data source automatically, because the data source IS the route's `crudRead` endpoint, which already applies those filters.
- **Per-column permissions.** If the user can't see `total_amount` (it's flagged admin-only in `_mtdt__tnt__trzzzioni__colonne`), the column doesn't ship to the report. The report renders an empty band for that field instead of leaking data.
- **i18n.** Column labels in the report come from `_metadati__colonne.mc_display_string_in_view`, which the translation layer resolves at render time. Same translations as the list page.
- **Caching.** The metadata snapshot is in memory; the report fires one SQL query against the view; the user sees the report in under a second on the demo dataset.

What you'd have rolled by hand in a custom controller — auth, filter context, per-column gate, i18n, caching — is the framework's default for every route.

## Designer integration

![Report designer — embedded Stimulsoft designer in the browser, drag fields onto the canvas, preview on real data](https://wuic-framework.com/assets/wuic-framework-docs/screenshots/report-designer__report-designer-animation__desktop.gif)


Reports are typically built in the Stimulsoft Designer (we ship the embedded one, but you can use the standalone if you prefer). The contract is the same: when the designer connects to the data source, point it at the WUIC API endpoint for the route. The designer fetches the column schema, generates the field tree, and you drag fields onto the canvas.

Saving the `.mrt` to the right folder publishes it. There's no separate "register report" step — the folder structure IS the registration.

## Naming discipline (a real warning)

We mentioned in the [scaffolding post](https://wuic-framework.com/blog/sql-table-to-crud-form-in-30-seconds) that naming discipline is the hardest thing about a metadata-driven framework, and reports are where it hurts the most.

Specifically:

- **View names are stable contracts.** A `.mrt` file references `vw_sales_by_region.total_amount`. Rename the view (or the column) and every report referencing it breaks. The framework can't auto-rewrite the .mrt for you; the file is opaque XML from your perspective.
- **Filename is part of the URL.** A menu entry at `?reportName=sales-summary.mrt` is bound to that filename. Rename `sales-summary.mrt` to `summary.mrt` and the menu entry 404s until you update it.

We've made the conventions strict to make these problems visible:

- A migration that renames a view automatically flags `.mrt` files that reference it.
- The validator `validate-reports.ps1` scans the `Reports/` tree on every CI build and warns about reports that reference unknown routes or unknown columns.
- The runtime returns a structured error (`report.field_not_found`) when a binding doesn't resolve, with the report name and field path in the error envelope. The viewer shows it as a per-band warning instead of a generic crash.

None of this is glamorous. All of it has saved us from a real incident.

## What the report engine does NOT do

In the same spirit as our other posts on this framework — here's what's deliberately out:

- **Cross-route reports.** A report is bound to one metadata route, but that doesn't mean it can only see one table. When you create the report against a route, the auto-generated query embedded in the `.mrt` already includes the joins to every lookup the route declares: if `opportunities` has `account_id` as a lookup on `accounts`, the report query joins `accounts` automatically and exposes `account_name`, `account_region`, etc. as fields you can drag onto the canvas straight from the designer. You can also edit the query in the designer to add extra joins by hand (e.g. pulling `regions` for an additional lookup that the metadata doesn't capture). So a SQL view is one way to compose multiple tables — it's still the cleanest for heavy aggregations — but for "report on opportunities + show the account name and region" you don't need one; the lookup-driven join is already there.
- **Parametrized stored procedures.** Reports run against routes (tables/views), not stored procedures. If your report logic absolutely requires a procedure, you can scaffold it via `scaffolding.scaffoldStoredProcedure` and bind the report to that route, but we discourage it because parameters bypass the filter/permission layer and you're now doing custom auth.
- **Designer customization at runtime.** The end-user can't edit the .mrt in the browser. Editing is in the designer (embedded or standalone), and saves go to the same `.mrt` file on disk. If you need user-customizable reports, the right answer is the dashboard designer (which writes JSON metadata, not .mrt), not the report engine.

## Try it

The public [demo](https://wuic-framework.com/sandbox) has the "Reports" menu under the top bar. The seeded reports include a sales-by-region (the one this post describes) and a couple of others built on tutorial data. Open one — it renders directly in the embedded viewer with print, export-to-PDF, and export-to-Excel out of the box.

To build your own on the demo: scaffold a view, drop a .mrt in the right folder via SFTP (the demo SSH credentials aren't published, so this is read-only for visitors — but the workflow is the same on a self-hosted install).

The source files involved: `MetaController.cs` (`report-viewer` action), `ReportRenderingService.cs` (data source binding + Stimulsoft hand-off), and the report-viewer Angular component. The codebase chatbot ([RAG post](https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3)) can locate each one if you don't want to grep.

This wraps up the second batch of three posts. Next batch starts with the **wizard architecture** — multi-step forms with conditional branches, all driven by metadata. Subscribe via RSS to catch them as they land.
