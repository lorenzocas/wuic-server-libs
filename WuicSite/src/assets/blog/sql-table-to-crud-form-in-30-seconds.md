---
title: "From SQL table to working CRUD form in 30 seconds: a metadata-driven scaffolding approach"
slug: sql-table-to-crud-form-in-30-seconds
date: 2026-05-01
author: Lorenzo Castrico
description: "How WUIC turns a CREATE TABLE statement into a complete CRUD UI — list, edit form, validation, lookup widgets — without writing a single TypeScript file. The actual scaffolding endpoint, what it inspects, and what it skips."
tags: scaffolding, crud, angular, sql-server, metadata-driven
---

The cleanest demo of WUIC is also the boring one: write a SQL `CREATE TABLE`, hit one endpoint, refresh the browser. There's a working list page, an edit form, validation rules, lookup widgets, sortable columns, mobile responsiveness — and you wrote no Angular. No controller. No service. No DTOs.

This post walks through what's actually happening when you do that, and what it's *not* doing (because over-promising is how low-code platforms lose trust).

## The 30 seconds, end-to-end

Suppose you want to add a "vendors" entity to your CRM. You'd typically do this:

```sql
CREATE TABLE vendors (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    name            NVARCHAR(200) NOT NULL,
    vat_number      NVARCHAR(20)  NOT NULL UNIQUE,
    country_code    CHAR(2)       NOT NULL,
    contact_email   NVARCHAR(255) NULL,
    contact_phone   NVARCHAR(50)  NULL,
    notes           NVARCHAR(MAX) NULL,
    created_at      DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    is_active       BIT           NOT NULL DEFAULT 1
);
```

Then call the scaffolding endpoint:

```http
POST /api/Meta/AsmxProxy/MetaService.scaffoldTable
Cookie: k-user=...

{ "tableName": "vendors" }
```

Refresh the app. There's a new menu entry "Vendors" with:

- A **list page** at `/vendors/list` showing all rows with sort, filter, group, paginate.
- An **edit form** at `/vendors/edit/:id` with one field per column, validation rules from the schema.
- An **API** at `/api/Meta/AsmxProxy/vendors.crudRead` etc., ready to call.
- A **mobile layout** that collapses the table into a card stack below 768px.

That's the headline. Now the substance.

## What the scaffolder actually inspects

The endpoint handler reads three things from the database:

**1. `INFORMATION_SCHEMA.COLUMNS`.** Column name, data type, nullable, default value, max length. This drives the field widget choice (text vs. textarea vs. number vs. date vs. checkbox), the validation (required from `IS_NULLABLE`, max length from the type), and the formatting (decimal places, date format).

**2. `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` + `REFERENTIAL_CONSTRAINTS`.** Foreign keys turn into **lookup widgets** automatically. If `vendors.country_code` references `countries.code`, the form shows a dropdown populated from the `countries` route.

**3. Identity / unique constraints.** `id` columns get hidden in the edit form. Unique columns get a "value already taken" validation message wired to the API's duplicate-key error response.

That's it. No annotations, no decorators, no `[Required]` attributes scattered across DTOs. The information already lives in the schema; we just read it.

## What ends up in metadata

The scaffolder inserts two rows into the WUIC metadata tables:

```
_metadati__tabelle: { md_id: 142, md_nome_tabella: 'vendors', mdroutename: 'vendors' }

_metadati__colonne (one row per column):
  { mc_id: 1781, md_id: 142, mc_nome_colonna: 'name',          mc_ui_column_type: 'string',  mc_validation_required: 1, ... }
  { mc_id: 1782, md_id: 142, mc_nome_colonna: 'vat_number',    mc_ui_column_type: 'string',  mc_validation_required: 1, ... }
  { mc_id: 1783, md_id: 142, mc_nome_colonna: 'country_code',  mc_ui_column_type: 'lookupByID', mc_ui_lookup_entity_name: 'countries', ... }
  …
```

Once these rows exist, the runtime takes over. There is no codegen step, no file written to disk, no Angular `ng generate`. The Angular components (`<wuic-list-grid>`, `<wuic-parametric-dialog>`, `<wuic-field-editor>`) read the metadata at runtime and self-configure.

This is the core trick: there is one set of generic UI components in the framework, and they specialise themselves based on metadata. We don't generate code per entity. We generate metadata, and the generic code reads it.

## The 80/20

The 80% of the form is right out of the box. The 20% you tweak by hand falls into a few buckets:

- **Field labels.** The scaffolder uses the SQL column name (`vat_number` → "Vat number"). For customer-facing UI you want "VAT number" or "P.IVA". You edit one row in `_metadati__colonne` (`mc_display_string_in_view`) and reload the metadata. Took 10 seconds.
- **Field grouping.** By default every column goes in one section. To split "Identity" / "Contact" / "Notes" tabs you set `mc_edit_associated_tab` per column. Two SQL `UPDATE`s.
- **Custom validation.** Things SQL can't express — *"contact_email must end in @customer's allowed domain"* — go into `mc_validation_callback`, a JS one-liner stored in metadata. Runs both client-side and server-side.
- **Custom widget.** A specific column needs a custom Angular component (e.g. a colour picker). You write the component once, register it as a custom widget, and any column with `mc_ui_column_type: 'colorPicker'` gets it. Wrote it for one entity, reusable everywhere after.

Each tweak is a SQL `UPDATE` away from being live. No rebuild, no Angular recompile.

## What scaffolding *does not* do

We've seen low-code platforms over-promise here. Here's what scaffolding deliberately won't try:

- **Business logic.** Workflow transitions, conditional approvals, computed fields — these are *not* in the schema, so the scaffolder doesn't invent them. You configure them afterwards (workflow engine has its own metadata; computed fields have callbacks).
- **Layout decisions.** The scaffolder lays out fields in column order. For complex forms that's wrong; you edit a few `mc_ordine` values and `mc_edit_associated_tab` to fix it.
- **Permissions.** Brand-new tables get default "all admin" permissions. Granular per-role / per-row rules live in the `_mtdt__tnt__trzzzioni__*` tables and have to be configured deliberately.
- **Cascade deletes & soft-delete columns.** If your schema has a `deleted` flag, the scaffolder doesn't auto-filter it; we make this explicit per-route to avoid surprises (one of our oldest bugs was *"why are deleted records still showing in this one screen"*).

## How it scales

The team that uses this most internally has scaffolded ~140 routes. Each one is a SQL DDL change + an `UPDATE _metadati__*` for tweaks. The runtime metadata cache is a single in-memory snapshot, refreshed via `MetaService.invalidateMetadataRuntime` when a row changes. The whole thing is fast: a 100-column table with three FK lookups scaffolds in around 600ms server-side.

The interesting bottleneck isn't performance — it's *naming discipline*. When the metadata table has 140 routes and 1,800 columns, "what does `mc_extra_2` mean?" becomes an actual question. We've ended up with an internal style guide for column naming. Boring, important.

## When NOT to scaffold

A short list, because honest documentation matters:

- **Tables that already have a heavily customised hand-written UI.** Re-scaffolding overwrites your tweaks. Use the dedicated update endpoint that preserves manual edits, not the full scaffold.
- **Tables you don't actually want users to see.** Auto-generating a UI for `_audit_log` is a footgun. Scaffolding is opt-in per table; we keep it that way.
- **Polymorphic / EAV schemas.** If your "products" table has a JSON `attributes` column with arbitrary keys, scaffolding will give you a textarea for that column. Fine, but obviously not the UX you'd hand-craft.

## Try it

The scaffolding endpoint runs on the [public demo](/sandbox). The demo data is reset every 24 hours, so you can `CREATE TABLE foo (id int identity, name nvarchar(100))`, scaffold it, see the auto-generated CRUD, then leave — by tomorrow the schema is clean again.

If you want to read the source: the scaffolder is `MetaController.AsmxProxy.scaffoldTable` and the runtime metadata loader is `MetadataService.loadFromDb`. The codebase chatbot ([previous post](/blog/rag-chatbot-with-claude-and-bge-m3)) can find the exact files for you faster than I can paste links.

These three posts are the first batch — the next two we're writing dig into the **mobile auto-layout** (how a desktop table becomes a card stack with zero per-screen config) and the **workflow engine** (multi-step business processes from a graph metadata table). Subscribe via the RSS feed, or just check back here.
