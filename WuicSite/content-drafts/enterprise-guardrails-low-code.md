---
title: "Boring but vital: the four enterprise guardrails your low-code tool probably doesn't have"
slug: enterprise-guardrails-low-code
date: 2026-09-29
author: Lorenzo Castrico
description: "Row and column permissions, audit trails, optimistic concurrency, typed localized errors — the unglamorous features that decide if a tool survives production."
tags: security, audit, dotnet, angular, enterprise
---

When you evaluate an internal-tools framework, you look at the widgets. The grid, the form builder, the dashboard designer — that's what the demo shows, that's what the landing page screenshots. We do it too; [our gallery](/gallery) is full of widgets.

But after eighteen months of running WUIC apps in production for real customers, here's the honest ranking of what actually kept us out of trouble. None of it is a widget. All of it is the boring plumbing that most low-code platforms either don't have, or bolt on as an enterprise-tier afterthought: **who can see which rows and columns, who changed what and when, what happens when two people edit the same record, and what the user sees when something breaks**.

These four are what we'd call *enterprise guardrails*. They share three properties: nobody asks for them in the first sprint, everybody needs them by month six, and retrofitting them screen-by-screen is somewhere between painful and impossible. They're also, not coincidentally, the features that separate "internal tool platform" from "thing you can put in front of a customer and an auditor in the same quarter".

This post walks through how WUIC handles each of the four — as metadata, not as code you write per screen. Table and field names below are the real ones from the framework, because vague hand-waving is exactly what we're arguing against.

## 1. Permissions that go down to the row and the column

The anecdote every B2B team has: sales asks for a "customers" screen. Two weeks later, support wants the same screen — but they must not see the `discount_pct` column, and each account manager should only see *their own* customers. In most low-code tools this forks into two duplicated screens and a filter that lives in the frontend, which means it lives nowhere.

In WUIC this is three layers of metadata, all enforced server-side:

- **Table/route grants** live in `_Metadati_Utenti_Autorizzazioni_Tabelle`: per role, user, or tenant, four booleans — `muat_view`, `muat_edit`, `muat_insert`, `muat_delete`. A route with `md_grant_by_default = false` is invisible until a grant says otherwise.
- **Column grants** live in `_Metadati_Utenti_Autorizzazioni_Colonne`: `muac_view`, `muac_editable`, `muac_validation_required` per role or user. Hide `discount_pct` from the support role and it disappears from the grid, the edit form, *and the API response* — the column is stripped when the query is built, not styled away in the browser.
- **Row restrictions** come from the table metadata itself: `md_record_restriction_key_user_field_list` tells the query builder which field ties a record to the current user, role, or tenant, and the corresponding `WHERE` clause is appended server-side on every read. Ownership filtering via `md_user_id_field_name` works the same way. The account manager from the anecdote doesn't get a filtered grid — they get a filtered *dataset*, and the report designer, the export, and the API all see the same restricted rows.

One grant record, concretely:

```json
{
  "md_id": 42,
  "ruolo_id": "3",
  "muat_view": true,
  "muat_edit": true,
  "muat_insert": false,
  "muat_delete": false
}
```

Because grants can target a role, a specific user, or a tenant, the sales/support scenario above is two rows of metadata, not two screens. And because the enforcement happens where the query is built, there is no "the API still returns it, we just hide the column" gap — the class of bug where the permission model exists only in the DOM.

Framework-level mutations (editing metadata, saving dashboards, scaffolding) sit behind a separate, stricter gate: the `isSuperAdmin` flag, checked server-side on every metadata endpoint. WUIC actually distinguishes three admin notions with increasing scope:

| Flag | What it means | What it can do |
|---|---|---|
| `isSuperAdmin` | Project-level privilege | Modify project metadata; passes the server-side admin gate |
| `isRoleAdmin` | The role is nominally "admin" | Fallback grant on routes without explicit grants — nothing more |
| `isAdmin` (legacy) | Per-user historical flag | Same fallback grant; kept for backwards compatibility |

A role being *named* "Admin" is not enough to touch metadata — we learned to distinguish nominal admins from metadata admins the hard way, and the permissive fallback cascade exists precisely so tightening the model didn't break fifteen-year-old installs.

## 2. An audit trail you configure, not code

An auditor asks: "who set this invoice to approved, and when?" If the answer involves grepping application logs, you've already lost the afternoon.

WUIC's audit is table metadata. You flip `md_logging_enable` on a route and map which physical columns receive the trail:

```text
md_logging_enable                    = true
md_logging_insert_user_field_name    = created_by
md_logging_insert_date_field_name    = created_at
md_logging_last_mod_user_field_name  = updated_by
md_logging_last_mod_date_field_name  = updated_at
md_logging_delete_user_field_name    = deleted_by
md_loggingdelete_date_field_name     = deleted_at
```

(Yes, that last metadata key is really spelled without the second underscore. It's been there since before we were born as a product, and renaming a metadata column across every customer install is its own blog post about schema migration discipline.)

From then on, every insert/update/delete that goes through the pipeline stamps those fields — whether it came from the UI, the REST API, or an import. `md_service_enable_logging` extends the same stamping to service/API exposures, and `md_logging_azienda_field_name` scopes the trail per tenant in multi-tenant installs.

Two things we like about this design, having lived with the alternatives:

- **The trail lives in your tables, in your schema, queryable with your data.** No proprietary audit store, no "export the activity log as CSV from the vendor dashboard". `SELECT updated_by, updated_at FROM orders WHERE id = 4711` answers the auditor's question in one line.
- **It can't be forgotten.** The stamping is part of the persistence pipeline, so screen number forty gets the same audit behavior as screen number one. Audit code copy-pasted per screen has a way of drifting; metadata doesn't.

The companion feature is **logic delete**: set `md_has_logic_delete = true` on the table and mark the flag column with `mc_is_logic_delete_key`, and "delete" becomes an update. Records disappear from the app but stay in the database with a full who/when trail — the framework uses the flag column to keep active and logically-deleted records apart everywhere, from grids to lookups. For anything an auditor might one day care about, physical delete is a feature you want to opt *into*, not out of.

## 3. Optimistic concurrency: the lost update you never noticed

Here's the failure mode: two back-office operators open the same order. One fixes the shipping address, the other changes the quantity, both hit save. Without a concurrency check, whoever saves last silently erases the other's work. Nobody gets an error. You find out three weeks later from an angry customer, and by then the audit trail just shows two legitimate edits.

This is the guardrail with the worst discovery profile of the four. Missing permissions show up in a demo. A missing audit trail shows up at the first audit. A missing concurrency check shows up *never* — the data just quietly gets worse. Which is exactly why it has to be a platform default rather than a per-screen decision.

WUIC ships this check framework-wide behind one setting:

```json
"AppSettings": {
  "optimisticCheckEnabled": "true"
}
```

The mechanics: every edit form carries an `__original` snapshot of the record as it was loaded. On `updateRecord`, the server compares `__original` against the current database state:

1. Values match → the update proceeds.
2. Values don't match → someone else changed the record since you loaded it, and the save is rejected with a concurrency error instead of a silent overwrite. The user re-loads, sees the other person's change, and re-applies theirs consciously.

With delta payloads the comparison narrows to the fields you actually changed, so two people editing *different* fields of the same record don't block each other — the address fix and the quantity change from the anecdote above would both land. Many-to-many fields get their own treatment: the current ID set is compared against the original set, because "did this collection change?" is a different question from "did this scalar change?".

The enabled/disabled state is also propagated to the client at login (as the `optimistic_concurrency_check` runtime flag), so the frontend and backend never disagree about whether the check is on.

The point isn't the algorithm — it's that it applies to every route in the app, including inline grid edits and batch saves, without a line of per-screen code. Concurrency handling written per-screen is concurrency handling that's missing from half your screens.

## 4. Errors that are typed for machines and localized for humans

Last one, and the most underrated. When something fails in production, a low-code tool typically shows the user a raw exception string — in English, with a stack trace, sometimes with the SQL query in it. That's simultaneously a terrible user experience and an information leak.

Every server exception in WUIC passes through a central filter (`JsonExceptionFilter`) that produces one stable envelope:

```json
{
  "ok": false,
  "errorCode": "errors.auth.operation_disabled",
  "args": { "operation": "delete", "route": "orders" },
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "fallbackMessage": "..."
}
```

A translator layer (`MetaExceptionTranslator`) maps known exception families to stable codes — malformed metadata to `errors.metadata.props_bag.malformed`, auth failures to 401/403 envelopes, unknown ones to `errors.server.unhandled`. SQL errors are the one deliberate exception to localization: the database engine's message is already the precise diagnostic a developer needs, so it's passed through to a dedicated dialog with expandable stack/query/parameters sections instead of being paraphrased.

On the Angular side, a global error handler (`GlobalHandler`, wired as Angular's `ErrorHandler`) looks up the `errorCode` in the `_wuic_translations` table, interpolates the `{argName}` placeholders from `args`, and shows the message in the user's language. Your app code can throw its own typed errors and they ride the same pipeline — `WuicException` server-side, `WuicClientException` client-side:

```ts
throw new WuicClientException(
  'errors.myapp.feature_disabled',
  { feature: 'export-pdf' }
);
```

Add the translation keys for `errors.myapp.feature_disabled`, and the dialog is localized with zero extra wiring. Same envelope, same lookup, same dialog as the framework's own errors.

Two production-grade details we sweated over: the `traceId` correlates what the user screenshots with what's in your server logs, and the verbose parts of the envelope — stack traces, SQL text, internal type names — are only emitted to super-admins or in development. Everyone else gets the code, the localized message, and the trace ID. Error responses are a fingerprinting surface; treat them like one.

## What we deliberately keep manual

Being honest about the boundary matters, so: none of this designs your security model for you. There's a version of this post that ends with "and it's all automatic!" — that version would be lying, and the lie would bite you at exactly the moment the guardrail was supposed to hold.

- **Role design is yours.** WUIC enforces grants; deciding that support shouldn't see discounts is still a human conversation with the business.
- **Audit column naming is yours.** The framework stamps `created_by` if you tell it which column that is — we don't invent shadow tables behind your schema's back.
- **Error translations for your own codes are yours.** Throw `errors.myapp.license.missing` and the framework will localize it — but you seed the five languages. An untranslated key shows up raw, on purpose, so you notice before your users do.
- **Route guards in the host app are yours.** Role-to-route rules (which roles can open the dashboard designer, the report designer, and so on) are plain Angular code in your project, code-reviewed like everything else. Metadata decides what the data layer allows; your routing code decides what the navigation offers.
- **Turning the concurrency check on is yours.** `optimisticCheckEnabled` is an explicit appsetting, not a hidden default — legacy installs migrating onto WUIC get to choose when their users start seeing conflict errors instead of silent overwrites.

The pattern: the framework owns *enforcement*, you own *policy*. Every time we've seen a tool try to own both, the policy ended up being whatever the defaults were.

## The evaluation checklist

Next time you're demoed a shiny internal-tools platform, let them finish the widget tour, then ask four questions:

1. Can a role hide a *column* — and restrict *rows* — without forking the screen, and is it enforced server-side?
2. Where does "who changed this record, and when?" live, and can I query it with SQL?
3. What happens when two users save the same record within the same minute?
4. What exactly does an end user in Munich see when the database throws — and what does the same error leak to an anonymous caller?

If the answers involve "you can build that", you'll be building it forever — once per screen, with drift. If the answers involve an enterprise tier you haven't priced yet, price it now, because you *will* need all four.

And if you'd rather it came in the box: [see how WUIC compares](/comparison) to the tools we evaluated, browse the [feature gallery](/gallery), or [skip the talking and try it](/sandbox). The widgets are nice too — but they're not why you'll still be running it in year three.
