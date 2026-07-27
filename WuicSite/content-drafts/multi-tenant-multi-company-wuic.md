---
title: "One install, many companies: how WUIC does multi-tenant without a rewrite"
slug: multi-tenant-multi-company-wuic
date: 2026-09-15
author: Lorenzo Castrico
description: "How WUIC serves multiple companies from one backend: per-tenant databases, metadata isolation, shared-data row filtering, and cross-tenant scaffolding."
tags: multi-tenant, saas, angular, dotnet, metadata-driven
---

The most common question we get from teams running WUIC for one company is some variant of: *"we just signed a second customer — do we deploy a second copy of everything?"*

You don't. One backend, one Angular bundle, N companies — each with its own metadata database and its own data database (or a shared one, filtered by row). This post walks through how the multi-tenant mode actually works, what a tenant *is* in WUIC terms, and — because we've learned that over-promising is how platforms lose trust — what it deliberately does not do.

## What a tenant is here

In WUIC, a tenant is a **company** (`azienda` — the framework grew up in Italy, the table names show it). Every logged-in user belongs to one, and the framework resolves the right pair of databases for that company at runtime:

- a **metadata DB** — routes, columns, permissions, menu, dashboards. This is what makes the UI look and behave the way it does.
- a **data DB** — the actual business tables.

Because the entire UI is a function of metadata, per-tenant metadata databases give you something most row-filtering multi-tenant setups can't: **each company can have a genuinely different application**. Tenant 1 hides a column in a grid, tenant 2 doesn't — same backend, same Angular code, different metadata rows. Our e2e suite verifies exactly this: set `mc_hide_in_list=1` on different columns of the same route in two tenant metadata DBs, log in as each tenant's user, and assert the projections don't leak into each other.

## Turning it on

Multi-tenant mode is one flag plus connection strings. In `appsettings.json`:

```json
{
  "AppSettings": {
    "multiConnectionEnabled": "true",
    "enableCookieAuthentication": "true"
  },
  "ConnectionStrings": {
    "MetaDataSQLConnection": "Host=127.0.0.1;...;Database=metadatadb",
    "DataSQLConnection":     "Host=127.0.0.1;...;Database=WideWorldImporters",
    "Tenant1_Meta": "Host=127.0.0.1;...;Database=metadatadb_T1",
    "Tenant1_Data": "Host=127.0.0.1;...;Database=WideWorldImporters_T1",
    "Tenant2_Meta": "Host=127.0.0.1;...;Database=metadatadb_T2",
    "Tenant2_Data": "Host=127.0.0.1;...;Database=WideWorldImporters_T2"
  }
}
```

(That's the real shape of our `appsettings.multi-tenant.postgres.json` template — there's an MSSQL and a MySQL twin with the same six entries.)

The mapping from company to connection lives in two columns of the `Aziende` table on the primary metadata DB: `Connessione_DB_Dati` and `CONNESSIONE_DB_Meta`. Crucially, these hold the **name of a connection string entry**, not the connection string itself. No passwords in the database, credentials stay portable per environment, and the same indirection is used by route metadata (`md_conn_name`).

When the flag is `false`, the tenant plumbing returns the base behaviour untouched — same cache keys, same connections, zero overhead. Existing single-tenant installs upgrade without noticing.

## How isolation actually happens

Every request carries a `k-user` cookie with the user's `azienda_id`. The authentication layer populates a per-request tenant scope, and from there every query, cache lookup, and background job resolves against the right databases:

- **Server caches** get a per-tenant suffix (`storedMeta__a1`, `userList__a2`, ...). Flag off → suffix gone.
- **Client caches** too: the Angular lib names its IndexedDB stores `MetaDB__a<id>` and segregates localStorage keys per tenant, with orphan cleanup at startup.
- **The scheduler** enumerates companies every poll cycle and runs each job inside the right tenant scope — including per-tenant SMTP overrides via a naming convention (`email-host__a1`).

There's an anti-hijack check on every request: for non-superadmin users, the cookie's active `azienda_id` must match the `azienda_id_user` snapshotted at login. A tampered cookie doesn't get a different tenant's data — it gets a forced re-login and a security log entry. We have an e2e test whose whole job is to tamper with that cookie and assert the rejection.

Superadmins are the exception by design: the `<wuic-azienda-switcher>` dropdown re-issues their cookie for another company. Non-superadmins get a 401.

## Separate data DBs — or one shared, filtered by row

The default topology is a data DB per tenant. But sometimes tenants must share physical data — a common product catalog, a shared registry. WUIC supports that with two metadata fields on the route:

```sql
UPDATE _metadati__tabelle
   SET mdloggingaziendafieldname       = N'id_azienda',
       mdrcrdrstrctonkeyuserfieldlist  = N'id_azienda'
 WHERE mdroutename = 'shared_registry';
```

With those set, the framework appends `WHERE <table>.id_azienda = <user's company id>` to every read on that route, server-side. Same physical table, each tenant sees only its rows. Our shared-data e2e test seeds 3 rows for tenant 1 and 2 for tenant 2 in one table, then asserts each tenant's user gets exactly their count — and zero rows with the other tenant's `id_azienda`.

One honest note: this is a metadata-driven filter applied by the query builder, not database-level row security. Superadmins can be exempted from it, which is a feature for support scenarios and something to be aware of in your threat model.

## Scaffolding once, propagating everywhere

The part we use daily. WUIC's scaffolder turns a SQL table into a working CRUD UI ([covered here](/blog/sql-table-to-crud-form-in-30-seconds)) — but with per-tenant metadata DBs, scaffolding on tenant 1 does nothing for tenant 2. Repeating it N times by hand is exactly the kind of toil this framework exists to remove, so the Scaffolding page grew a **Propagate to all tenants** checkbox (superadmin-only, multi-tenant mode on; the same operation is exposed on the metadata API for scripted provisioning).

With it ticked, after scaffolding the current tenant the backend iterates over every other active company with a valid connection mapping and replicates the scaffolding into each one's metadata DB — reading the schema from each tenant's **own** data DB, so column differences are respected. The result reports per-tenant outcomes:

```json
{ "tenant_2": "OK", "tenant_3": "SKIPPED:not-found" }
```

`SKIPPED:not-found` means that tenant doesn't have the physical table — the operation is best-effort, not a cross-tenant transaction. It's gated to superadmins with the multi-tenant flag on; for anyone else it's silently ignored, and in single-tenant installs the "Propagate to all tenants" checkbox never even renders in the scaffolding dialog.

## Users across tenants

When a login doesn't match on the primary metadata DB, the backend falls back through an index table mapping a hash of the lowercased username to candidate company ids — and retries the login on each candidate tenant's DB. First match wins, and the cookie is issued for that tenant.

Which leads to a deliberate convention: if the same person needs standard (non-superadmin) access to two tenants, give them **two accounts with distinct usernames** (`mario.rossi.t1`, `mario.rossi.t2`). Reusing one username across tenants means the fallback always lands on the lowest company id and the other tenant becomes unreachable. Superadmins don't need this — one account plus the switcher covers everything.

## What it does NOT do

- **Mixed DBMS across tenants.** All tenants must run the same DBMS as the primary. The routing switches *which database*, not *which provider*. Startup runs a fail-soft validation that logs a warning on a suspected mismatch, but a MySQL tenant behind an MSSQL backend will simply fail at first access.
- **Self-service tenant onboarding.** Adding a tenant means a new connection string entry in `appsettings` plus a config reload. Deliberate: connection strings stay out of the database, so provisioning stays an ops step, not a UI button.
- **Runtime tenant switching for regular users.** Only superadmins switch companies live. For everyone else the tenant is fixed at login by design — that's the anti-hijack property, not a missing feature.
- **Database-enforced row security.** The shared-data filter is applied by the framework's query builder from route metadata. If someone connects to the shared DB with raw SQL credentials, metadata won't save them. Separate data DBs per tenant remain the stronger isolation default.
- **Transactional cross-tenant scaffolding.** Propagation is best-effort per tenant; a failure on tenant 3 doesn't roll back tenant 2. The per-tenant result keys exist precisely so you can see and retry what failed.

## Try it

The multi-tenant behaviours in this post aren't aspirational — each one is pinned by an e2e test in our docs-driven suite (metadata isolation, data isolation, shared-data filtering, scaffold propagation, cookie anti-hijack, login fallback, superadmin switch). The template configs ship with the framework for MSSQL, MySQL, and PostgreSQL.

If you want to see the single-tenant experience first, the [live demo](/sandbox) resets nightly — scaffold a table, break things, come back tomorrow. For a multi-tenant pilot on your own schema, [download WUIC](/download) or write us: the two-tenant template setup is the exact one our test suite runs against, so it works on day one.
