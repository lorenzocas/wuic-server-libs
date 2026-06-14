---
title: "The chatbot's toolbox: the actions an LLM can apply to your app"
published: false
description: "Our in-product chatbot doesn't just answer questions — it proposes concrete changes to a running app through a typed toolbox, the same function-calling idea behind MCP. Toolbar buttons, validations, computed columns, conditional styles, even SQL fragments. Every proposal is a chip with an Apply button. This post walks the catalogue, one tool at a time, with the prompt that triggers each."
tags: ai, llm, tooluse, mcp
canonical_url: https://wuic-framework.com/blog/rag-chatbot-tool-use-framework-integration
---

A chatbot that only answers questions is a search box with manners. Ours does more: it can **propose concrete changes** to the app you're looking at. You describe what you want in plain language, the model picks the right tool, and you get a proposal — a chip with an **Apply** button, the generated code, the target route, and the model's rationale, all visible before anything happens.

If you know MCP (the Model Context Protocol), the mental model is the same: hand the model a catalogue of typed tools and let it call them. We define the tools inline against the Anthropic tool-use API rather than behind an MCP server, but the shape is identical — a name, a description that tells the model *when* to use it, and a typed argument list. The model never touches a database; it produces a structured intent and the framework owns the execution.

One rule sits above all of them: **nothing is applied without a click.** The model proposes, you dispose.

> ▶ **Media** — overview clip: asking the chatbot for an action and the resulting "Apply" chip appearing under the answer.

Below is the catalogue, one tool at a time, each with the kind of prompt that triggers it.

## Grid actions

### `propose_toolbar_action`

Adds a custom button to a list grid's toolbar, operating on the current selection, with a generated JavaScript callback.

```
You:  "on the orders grid add a button that exports the selected rows to CSV"

Bot:  toolbar action  ▸ Apply
      route:    orders
      callback: const rows = datasource.getSelectedRows();
                const csv = toCsv(rows); download('orders.csv', csv);
```

<details class="rag-demo">
  <summary><img class="rag-demo-poster" src="/assets/wuic-framework-docs/screenshots/rag-table-action.thumb.jpg" alt="Demo propose_toolbar_action — bulk archive on cities (poster)" /><span class="rag-demo-label"><i class="pi pi-play-circle"></i> <strong>Play demo</strong> — propose_toolbar_action: bulk archive button</span></summary>
  <img class="rag-demo-anim" src="/assets/wuic-framework-docs/screenshots/rag-table-action.gif" alt="Demo propose_toolbar_action — bulk archive on cities" loading="lazy" />
</details>

### `propose_row_action`

Adds a button to a single row (in the row's action dropdown), with a callback that receives that record.

```
You:  "put an Approve button on each row of the requests grid"

Bot:  row action  ▸ Apply
      route:    requests
      callback: await fetch('/api/requests/approve', {... id ...});
                await datasource.fetchData();
```

<details class="rag-demo">
  <summary><img class="rag-demo-poster" src="/assets/wuic-framework-docs/screenshots/rag-row-action.thumb.jpg" alt="Demo propose_row_action — per-row PDF generation (poster)" /><span class="rag-demo-label"><i class="pi pi-play-circle"></i> <strong>Play demo</strong> — propose_row_action: per-row "Generate PDF" button</span></summary>
  <img class="rag-demo-anim" src="/assets/wuic-framework-docs/screenshots/rag-row-action.gif" alt="Demo propose_row_action — per-row PDF generation" loading="lazy" />
</details>

## Conditional styling

### `propose_table_style`

Applies a CSS class to a whole row when a JS condition is true (a row-level highlight).

```
You:  "highlight in red the rows whose due date is in the past"

Bot:  table style  ▸ Apply
      class:     row-danger
      condition: new Date(record.due_date) < new Date()
```

<details class="rag-demo">
  <summary><img class="rag-demo-poster" src="/assets/wuic-framework-docs/screenshots/rag-row-style.thumb.jpg" alt="Demo propose_table_style — conditional row coloring (poster)" /><span class="rag-demo-label"><i class="pi pi-play-circle"></i> <strong>Play demo</strong> — propose_table_style: conditional row coloring</span></summary>
  <img class="rag-demo-anim" src="/assets/wuic-framework-docs/screenshots/rag-row-style.gif" alt="Demo propose_table_style — conditional row coloring" loading="lazy" />
</details>

### `propose_column_style`

Same idea, scoped to a single cell instead of the whole row.

```
You:  "give the status cell a green background when it's 'OK'"

Bot:  column style  ▸ Apply
      column:    status
      class:     cell-success
      condition: record.status === 'OK'
```

<details class="rag-demo">
  <summary><img class="rag-demo-poster" src="/assets/wuic-framework-docs/screenshots/rag-cell-style.thumb.jpg" alt="Demo propose_column_style — single-cell conditional coloring (poster)" /><span class="rag-demo-label"><i class="pi pi-play-circle"></i> <strong>Play demo</strong> — propose_column_style: single-cell conditional coloring</span></summary>
  <img class="rag-demo-anim" src="/assets/wuic-framework-docs/screenshots/rag-cell-style.gif" alt="Demo propose_column_style — single-cell conditional coloring" loading="lazy" />
</details>

## Cell rendering and form titles

### `propose_display_formula`

Replaces a column's rendered value in the list with a custom HTML/Angular template — a badge, an icon, a coloured number.

```
You:  "show priority as a coloured badge: green/yellow/red"

Bot:  display formula  ▸ Apply
      column:  priority
      template: <span class="badge" [class.high]="...">{{ priority }}</span>
```

> ▶ **Media** — screenshot: the priority column rendered as coloured badges.

### `propose_form_title_formula`

Computes the edit-form's title dynamically from the record being edited.

```
You:  "the edit form title should read 'Customer {company_name}'"

Bot:  form title formula  ▸ Apply
      route:  customers
      formula: `Customer ${record.company_name.value}`
```

> ▶ **Media** — clip: opening a record and seeing the dynamic title in the dialog header.

## Form callbacks

### `propose_default_value_callback`

Generates the callback that prefills a field when a new record is opened.

```
You:  "default created_date to today on new records"

Bot:  default value  ▸ Apply
      column:   created_date
      callback: record[field.mc_nome_colonna] = new Date().toISOString().slice(0,10);
```

> ▶ **Media** — screenshot: the insert form opening with the date prefilled.

### `propose_custom_validation`

Generates a validation that blocks the save when a rule — possibly cross-field — isn't met, with a message.

```
You:  "validate that population can't be negative, block the save with a message"

Bot:  custom validation  ▸ Apply
      column:   population
      callback: if (record[field.mc_nome_colonna].value < 0) {
                  vr.message = 'Population cannot be negative'; return false;
                } return true;
```

> ▶ **Media** — clip: typing a negative value, hitting Save, and the validation blocking it.

### `propose_selection_changed`

Hooks the change of a lookup/select field to recompute or prefill other fields.

```
You:  "when the customer lookup changes, copy its VAT number into the record"

Bot:  selection changed  ▸ Apply
      column:   customer
      callback: record.vat_number.next(record.customer__lookup_obj.value?.vat ?? '');
```

> ▶ **Media** — clip: picking a customer and watching the VAT field auto-fill.

### `propose_lifecycle_callback`

Hooks a record lifecycle event — before/after save, after load — for a side effect.

```
You:  "before save, uppercase the city name"

Bot:  lifecycle callback  ▸ Apply
      event:    before_save
      callback: record.CityName.next(record.CityName.value.toUpperCase());
```

> ▶ **Media** — clip: saving a lowercase name and seeing it stored uppercase.

## Metadata

### `propose_simple_metadata_update`

Patches a simple metadata field — page size, a caption, hide-in-list/edit, a basic flag — without opening the metadata editor.

```
You:  "set the cities grid page size to 50"

Bot:  metadata update  ▸ Apply
      route:  cities
      field:  page size → 50
```

> ▶ **Media** — screenshot: the grid paging at 50 rows after Apply.

### `propose_metadata_column_create`

Creates a new column on a route — including a computed (non-physical) one.

```
You:  "add a computed column total_chars = LEN(city_name)"

Bot:  create column  ▸ Apply
      route:    cities
      column:   total_chars (number, computed)
      formula:  LEN([Application].[Cities].[CityName])
```

> ▶ **Media** — screenshot: the new computed column showing in the grid.

## SQL (super-admin)

### `propose_sql_metadata_field`

Writes a raw SQL fragment into a metadata field — a custom JOIN, a computed expression, a custom SELECT clause — concatenated at runtime into the auto-generated queries. The model generates the fragment in the **active provider's dialect** (MSSQL / MySQL / PostgreSQL / Oracle quoting and syntax).

```
You:  "on the orders total column, compute price × quantity"

Bot:  SQL metadata field  ▸ Apply   (super-admin)
      target:  orders.total (computed expression)
      sql:     [price] * [quantity]
```

This is the only tool gated harder than a click: it requires super-admin privileges server-side and writes an audit log row on every application.

> ▶ **Media** — screenshot: the computed total column + the audit log entry.

## Designer canvas

### `propose_designer_inject`

The one tool that does **not** write metadata. On the dashboard designer page it injects or edits components on the canvas — the same in-memory tree the drag-and-drop UI manipulates. Nothing persists until you click "Save dashboard", and the designer's undo/redo covers the model's edits exactly like a human's.

```
You:  "add a grid bound to cities"   (on the designer page)

Bot:  designer inject  ▸ Apply
      injects: DATASOURCE + DATAREPEATER, bound and configured for route 'cities'
```

It knows the full catalogue of canvas tools and their editable properties, and it fuzzy-matches sloppy route names (*"provincie"* → `stateprovinces`) before committing to an argument.

<details class="rag-demo">
  <summary><img class="rag-demo-poster" src="/assets/wuic-framework-docs/screenshots/rag-designer.thumb.jpg" alt="Demo propose_designer_inject — master-detail injection in designer canvas (poster)" /><span class="rag-demo-label"><i class="pi pi-play-circle"></i> <strong>Play demo</strong> — propose_designer_inject: master-detail injection on designer canvas</span></summary>
  <img class="rag-demo-anim" src="/assets/wuic-framework-docs/screenshots/rag-designer.gif" alt="Demo propose_designer_inject — master-detail injection in designer canvas" loading="lazy" />
</details>

## Before it acts: asking for the schema

Every tool above needs *real* names — the actual column name on the route, the SQL schema and table, the join alias behind a lookup. Early versions handed all of that to the model upfront: the page context was a full dump of every column on the current grid. It bloated every request, action or not.

So we flipped it. The page context is now minimal — just the route you're on, e.g. `cities/list`. When a prompt needs schema the model doesn't already have, it calls one more tool *first*:

`request_metadata_detail` — a non-chip, behind-the-scenes tool. `{detail: 'columns', route}` returns the real column list and the SQL identity (schema, table, the full qualifier to use in a formula); `{detail: 'lookup_columns', route, column}` returns a lookup's join alias and its related columns. The framework resolves it — the model still never touches the database — hands the result back, and *then* the model emits the `propose_*` with names it looked up instead of names it guessed.

```
You:  "show the province lookup as 'id - name'"

Bot:  (calls request_metadata_detail → learns the join alias
       is StateProvinceID_stateprovinces) then:
      SQL metadata field  ▸ Apply
      sql:  CAST([StateProvinceID_stateprovinces].[StateProvinceID] AS VARCHAR(10))
            + ' - ' + [StateProvinceID_stateprovinces].[StateProvinceName]
```

It's the same trust property as everywhere else, one level deeper: the model can't reference a column or an alias that doesn't exist, because it asks before it acts — and the prompt stays lean, fetching only what the question needs.

## The quiet tools

Three tools never produce a chip — they shape the conversation instead:

- `remember_fact` / `forget_fact` — the model pins high-priority facts it shouldn't lose ("this project uses snake_case columns"). They survive summarisation.
- `suggest_followups` — the clickable chips under each answer that propose the next question.

> ▶ **Media** — screenshot: a memory fact pinned in the header + follow-up chips under an answer.

## Why a fixed toolbox

A typed catalogue over a metadata-driven framework is a good fit precisely because the framework already has a small, safe, well-defined surface of "things you can configure". The model never writes arbitrary code that runs unsandboxed; it fills in the blanks of operations the framework was already designed to perform — and you approve each one with your eyes on the preview.

The chatbot, and this whole action layer, ships with every [WUIC install](https://wuic-framework.com/downloads) and runs on the [public demo](https://wuic-framework.com/sandbox). Open it on a list grid and ask it to colour the overdue rows red. Read the chip. Then click Apply. For how the engine behind it is built and served, see the [architecture post](https://wuic-framework.com/blog/rag-chatbot-with-claude-and-bge-m3).
