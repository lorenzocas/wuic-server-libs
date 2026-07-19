---
title: "Anatomy of a production app: how FatturazioneElettronica is built on WUIC"
slug: fatturazione-elettronica-case-study
date: 2026-10-13
author: Lorenzo Castrico
description: "A case study of a real e-invoicing app on WUIC: what was scaffolded from metadata, what needed C#, how invoice-to-SDI became a workflow graph, and what we'd redo."
tags: casestudy, dotnet, angular, fintech, workflow
---

Back in May we [announced FatturazioneElettronica](/blog/fatturazione-elettronica-free-italian-einvoicing) — a free, self-hosted Italian e-invoicing app with SDI integration. That post was the feature list. This one is the case study: how the app is actually put together, where the framework carried the weight, where it didn't, and what we would do differently if we started over.

If you're evaluating WUIC, this is the honest answer to the question every metadata-driven framework gets asked: *"fine, but what happens when the domain gets hard?"* E-invoicing in Italy is a genuinely hard domain — asynchronous state machines you don't control, qualified digital signatures, a 10-year legal retention requirement — so it's a fair stress test.

## The starting point: a cloned skeleton, not a blank folder

The app didn't start from `dotnet new`. It started from the framework's app-creation playbook: clone the host template, rename assemblies and namespaces with a script, point `appsettings.json` at two fresh SQL Server databases — one for application data, one for WUIC metadata (cloned from an empty metadata template). That's the standard WUIC topology: your tables live in the data DB, and everything the UI needs to render them — routes, grids, forms, permissions, actions — lives as rows in the metadata DB.

From there, the first working build had:

- **26 domain tables** applied in three schema scripts — 7 registry tables (clients, suppliers, products, banks, VAT codes...), 16 document tables (header + lines for issued/received invoices, quotes, orders, DDTs, proformas...), 3 movement tables (payment deadlines, journal, receipts). Today the schema is at **46 tables and ~24 views** after five months of iteration (warehouse, product variants, bank reconciliation, conservation).
- **CRUD UI for all of it, with zero Angular components written.** Every table got a route, list grid, and edit form from metadata scaffolding. The entire invoice editor — header, line items with VAT tiers and discounts, live-calculated totals, attachments — is metadata plus a handful of SQL triggers.
- **11 small C# hooks** (`ICrudRouteHandler` implementations in `ProjectData/Crud/`) for the things metadata deliberately doesn't do: audit fields, per-year invoice numbering defaults, initial `BOZZA` state on new invoices.

<!-- TODO(review): confermare i numeri (26 tabelle iniziali / 46 attuali / 11 hook) e, se lo ricordi, quanto tempo è passato dal bootstrap alla prima fattura emessa in dev — l'aneddoto "giorni non settimane" va validato da te -->

The division of labor that emerged is worth stating plainly: **metadata owns the shape of the UI, SQL owns the domain invariants, C# owns the integrations.** Invoice numbering is an `INSTEAD OF INSERT` trigger, not application code, so it's transaction-safe no matter which path writes the row. Totals recalculation is an `AFTER` trigger on the lines tables. Neither required touching the framework.

## Two state machines, deliberately kept apart

An issued invoice in this app carries two status columns, and keeping them separate was one of the better early decisions:

- **`stato`** — the *editorial* lifecycle you control: `BOZZA → EMESSA → INVIATA`. Transitions happen because a user clicked something.
- **`stato_sdi`** — the *transmission* lifecycle you don't control. SDI answers asynchronously, on its own schedule, with typed receipts: `RC` (delivered) → `CONSEGNATA`, `MC` → `MANCATA_CONSEGNA`, `NS` (rejected) → `SCARTATA`, `NE` with outcome `EC01`/`EC02` → `ACCETTATA`/`RIFIUTATA`, `DT` → `DECORRENZA_TERMINI`. The `AT` transmission receipt is stored for audit but deliberately maps to *no* state change.

Conflating these into one column is the classic e-invoicing mistake — you end up with a state machine where half the transitions come from users and half from a government mailbox, and neither side can reason about it. Keeping them apart means the grid can show both, filters stay honest, and a delivery failure never "un-emits" an invoice.

## The SDI pipeline: where C# earns its keep

The outbound path is a three-step pipeline (`SdiSubmissionPipeline`), each step failing with a typed stage and reason rather than a generic exception:

1. **XSD validation** against the official FatturaPA v1.2 schemas — catch the malformed XML locally instead of burning an SDI submission on an `NS` rejection.
2. **CADES-BES signature** (CMS/PKCS#7) with a PKCS#12 certificate, producing the `.xml.p7m` SDI expects. If no signer is configured, the pipeline refuses to proceed — unless the provider is the dev-only mock, in which case it ships unsigned XML with an explicit `.xml` extension so nobody mistakes it for a signed artifact.
3. **Transmission** through whichever `ISdiProvider` is configured — the free direct-PEC path or one of the commercial intermediaries. Provider selection happens at startup from configuration; the pipeline doesn't know or care which one it got.

The return path is a hosted background service: per-provider notification pollers (IMAP for the PEC path, REST cursors for the intermediaries) feed a single `SdiNotificationApplier` that persists every receipt to an audit table, matches it back to the invoice (by SDI identifier first, filename as fallback), applies the `stato_sdi` mapping above, and pushes a notification through the framework's notification bell to whoever created the invoice. The bell integration cost almost nothing — the framework already had user notifications with deep links; the applier just enqueues one with a `/route/edit/id` target. Unmatched or info-only receipts are persisted with an explicit `applied_error` note instead of being dropped, because in this domain "we couldn't match this receipt" is a fact the accountant needs to see, not a log line.

All of this — roughly **1,500 lines across the `Services/Sdi/` namespace**, plus a ~700-line `SdiController` — is plain .NET with no framework magic. That's the point: WUIC never pretended to have an "SDI connector". It gave us the app shell, the UI, the scheduler, and the notification plumbing, and got out of the way for the domain code.

## One interface, six transports

The [feature post](/blog/fatturazione-elettronica-free-italian-einvoicing) listed the SDI providers; here's the architectural reason there are six of them behind one interface. `ISdiProvider` has essentially one method — *submit these signed bytes, give me back an SDI identifier or a typed failure* — and each transport (direct PEC over SMTP/IMAP, three commercial REST APIs, one SOAP endpoint, one mock) implements it in 100–160 lines. Selection happens once, at startup, in a service-collection extension: whichever `Sdi:*` subsection of `appsettings.json` is populated wins, and if none is, you get the mock.

Three consequences we'd defend in any integration-heavy app:

- **The pipeline is provider-blind.** Validation and signing don't branch on transport. When a fourth commercial intermediary showed up, adding it touched zero existing files beyond DI registration.
- **The mock is a first-class citizen, not a test double.** `MockSdiProvider` echoes a synthetic acceptance receipt a couple of seconds after submission, which means the *entire* outbound flow — editor, pipeline, notification applier, status update, bell notification — is exercisable end-to-end on a laptop with no certificate and no PEC mailbox. The app's Playwright e2e suite runs against it; so does every demo install.
- **Config-as-selector keeps the free/commercial split honest.** Switching from the free PEC path to a paid intermediary is an `appsettings.json` edit, not a build. The one thing that *does* cross the license line — writing a brand-new provider — is exactly the thing that requires recompiling the host, which is consistent with how the free distribution is licensed.

The notification side mirrors the same shape: one `ISdiNotificationPoller` per transport feeding one shared applier, with a `NullNotificationPoller` for providers that push instead of poll.

## Supplier invoice approval as a workflow graph

The outbound flow is pipeline-shaped, but the *inbound* flow — supplier invoices that need internal approval before payment — is approval-shaped, and that's where the [workflow engine](/blog/workflow-engine-graph-source-of-truth) took over. The `wf_fatture_ap` graph implements a threshold approval chain:

```
REGISTRATA ──invia──▶ IN_APPROVAZIONE_L1 ──approva──▶ APPROVATA (+ payment deadline + email)
                            │                  └─[total ≥ L2 threshold]─▶ IN_APPROVAZIONE_L2 ──▶ APPROVATA / RIFIUTATA
                            └──rifiuta──▶ RIFIUTATA (+ reason + email) ──▶ back to the accountant's queue
```

Everything operational lives on the graph, not in code:

- **Transitions are edges.** Each connection carries an event name, a guard (a JS expression over the current record), and a role permission. The "send for approval" edge guards on *both* the state and `file_xml` being non-empty — so a batch send with a missing XML attachment is blocked with a toast listing the offending invoices, before anything moves.
- **The L2 threshold is data, not graph.** The escalation amount lives in an `ap_approval_levels` table with its own admin route. Finance can change the threshold without anyone opening the designer.
- **A timer node** on the L1 state becomes a scheduler entry on save: invoices sitting in first-level approval for 48 hours trigger a notification to the purchasing-manager role.
- **Approval side effects are integrations, not states**: an approved invoice inserts a payment deadline into `scadenze` (the same table the cash-flow views read) and queues a templated email through the framework's mail outbox.
- **Menu badges** ("L1 approvals (3)") come from the graph's route nodes for free.

The honest comparison: the *outbound* SDI flow predates our workflow engine and is hand-rolled pipeline code; the *inbound* AP flow was built after, as a graph, and took a fraction of the effort. <!-- TODO(review): confermare la cronologia (SDI prima del workflow engine?) e, se hai una stima, il rapporto di effort tra i due flussi -->

## The custom-action pattern: one endpoint, N stored procedures

Toolbar and row actions on grids (generate reminders, convert quote to order, mark deadlines paid, run the VAT summary) follow a pattern we'd now recommend for any WUIC app: the metadata rows define *which* buttons appear *where* (12 custom-action rows at last count), and they all POST to **one** generic controller endpoint that dispatches `action_key + route + selected records + logged user` to a single SQL stored procedure. Each action is then a `WHEN` branch — or a dedicated proc — on the SQL side.

The payoff is that adding an action is a metadata row plus a stored procedure: no controller, no deploy, no Angular. The cost is that your actions live in T-SQL, which is exactly where you want set-based document conversions and exactly where you don't want anything that talks to the network — those (email sending, SDI submission) stayed in dedicated controllers.

Printing is the same philosophy at the report layer: invoice print buttons are metadata rows pointing at **Stimulsoft `.mrt` templates** (four report folders: clients, revenue, issued invoices, bank movements), rendered by the framework's report viewer against route-aligned SQL views. The report *designs* took an afternoon each; no printing code exists in the app. <!-- TODO(review): "un pomeriggio ciascuno" è una stima narrativa — conferma o correggi -->

## What the framework didn't cover

Being specific, because this is the part vendors usually blur. Custom C# in this app, beyond the SDI namespace:

- **Fiscal XML generators** (`Services/FiscalReports/`) — LIPE, Esterometro, CU: government XML formats with their own schemas, nothing a UI framework should know about.
- **Digital conservation** (`Conservation/` providers) — quarterly archival packages in the format accredited conservators accept, plus a filesystem implementation.
- **Bank statement import and reconciliation** — CSV parsing and a matching engine (~750 lines across two controllers) with UI hooks.
- **Email templating/log**, **global search**, **document conversions**, **trash/restore** — around **19 custom controllers, ~5,900 lines of C# total**.

That number is the honest headline of this case study. A production fintech app on WUIC is not "zero code" — it's roughly **six thousand lines of domain C#, a few dozen stored procedures and views, and zero lines of UI plumbing**. Every line of custom code in this app does something domain-specific; none of it renders a grid, wires a form, checks a permission, or schedules a job.

## The whole app on one table

| Layer | What lives there | Rough size |
|---|---|---|
| Metadata DB | Routes, grids, forms, permissions, menu, 12 custom-action rows, workflow graph + projections, translations | scaffolded + iterated, no code |
| Data DB (SQL) | 46 tables, ~24 views, numbering/totals triggers, ~20 stored procedures behind actions and dashboards | ~50 migration scripts |
| C# hooks | 11 `ICrudRouteHandler` implementations (audit, defaults, initial states) | ~40 lines each |
| C# domain services | SDI pipeline + providers + pollers, conservation, fiscal XML generators | ~2,500 lines |
| C# controllers | SDI, email, reconciliation, bank movements, conversions, search, trash... (19 total) | ~3,400 lines |
| Angular | Custom components written for this app | **zero** <!-- TODO(review): confermare che non ci sono componenti Angular custom in wwwroot oltre alla lib — c'è una cartella e2e ma va verificato il tree dei sorgenti app --> |

<!-- TODO(review): le righe della tabella sono contate dai sorgenti al 2026-07; ricontare prima del publish se nel frattempo l'app è cresciuta -->

Reading the table top-down is reading the development timeline: the top two rows existed within days of the bootstrap; the bottom three accreted over months as the domain demanded them.

## What we'd do differently

1. **Start state machines on the workflow engine, even when they feel "too simple".** The outbound `stato` lifecycle is guarded by hand-written checks in the SDI controller. It works, but it's invisible — no designer graph, no timeline, no transition table to query. The AP flow, built as a graph, is self-documenting. If we rebuilt today, `BOZZA → EMESSA → INVIATA` would be a graph too, with the SDI pipeline hanging off a transition.
2. **Name tables like you'll live with them for a decade.** We have both `movimenti_bancari` and `movimenti_banca` in the schema — an early module and its later replacement coexisting because renaming a table with metadata, reports, and views hanging off it never made it to the top of the backlog. Metadata-driven scaffolding makes adding tables cheap; it doesn't make *renaming* them cheap. <!-- TODO(review): confermare la vera storia della coppia movimenti_bancari/movimenti_banca — deprecato uno dei due? va detto quale -->
3. **Put integration state in tables from day one.** The SDI provider cursor and notification audit tables arrived in later migrations (`44_sdi_provider_cursor.sql`), after an early poller re-processed receipts on restart. Idempotency keys are cheaper to design in than to retrofit. <!-- TODO(review): confermare l'aneddoto del re-processing — è ricostruito dall'ordine delle migration -->
4. **Typed pipeline results paid off; do it everywhere.** `SdiPipelineResult` carrying *which stage* failed (validation vs signing vs transmission) made the UI error messages actually actionable. The older controllers that just throw are the ones generating support questions.

## Try it

The exact distribution described here is free: grab `FatturazioneElettronica-iis-v1.0.0-with-dbs.zip` from the [Downloads page](/downloads), or poke at our own dogfood instance at [einvoice.wuic-framework.com](https://einvoice.wuic-framework.com/) first. The [feature-list post](/blog/fatturazione-elettronica-free-italian-einvoicing) covers installation and the license rule (free as shipped; rebuilding from source needs a [WUIC license](/pricing)). And if you want to see the metadata-driven scaffolding this whole story is built on, the [sandbox](/sandbox) runs in your browser.
