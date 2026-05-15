# Release Notes — WUIC Framework v1.1.0

**Date**: 13 May 2026
**Previously published version**: 1.0.20 (12 May 2026)
**Backend**: .NET 10 + IIS / Linux nginx
**Frontend**: Angular 21

---

Minor bump: this release introduces two structural capabilities that change the framework's deployment model.

- **Multi-tenant**: a single KonvergenceCore instance routes data and metadata for N companies across N different DB connections. Per-tenant configuration via columns `Aziende.Connessione_DB_Dati` / `Aziende.CONNESSIONE_DB_Meta`; transparent application-level routing via `TenantContext` (AsyncLocal, survives Task/scheduler boundaries).
- **Per-language menu localization**: menu entries (`mm_display_string_menu`) no longer contain hard-coded Italian labels but stable namespaced keys `menu.<scope>.<slug>`, resolved at runtime by Angular's `translate` pipe against `_wuic_translations`. Switching language from the user selector updates all entries without F5.

---

## 🌐 Multi-tenant management

A single framework installation can now serve multiple companies ("tenants") with data and metadata physically isolated on different DBs, with no need to replicate the application nor partition reverse-proxies per host.

**Data model.** The tenant→connections routing is defined on two columns of the primary metadata DB:

- `Aziende.Connessione_DB_Dati` — name of an entry in `ConnectionStrings` for the tenant's application DB
- `Aziende.CONNESSIONE_DB_Meta` — name of an entry in `ConnectionStrings` for the tenant's metadata DB

The columns contain the entry **name**, not the literal string. Credential rotation happens by editing `appsettings.<env>.json`, without touching the DB.

**Activation.** Flag in `appsettings.json` (`AppSettings` section):

```json
"multiConnectionEnabled": "true"
```

With the flag `false` (default), behavior remains single-tenant, identical to previous releases. With the flag `true`, every authenticated HTTP request resolves the `AziendaId` from the logged-in user and routes `GetOpenConnection` to that tenant's connection strings.

**Transparent routing.** All framework DB access points (`MetaService.*`, scheduler, scaffolding, AsmxProxy CRUD, custom callbacks) consult `TenantScope.CurrentAziendaId` via `AsyncLocal`, propagated by the HTTP middleware post-authenticate. Background jobs and custom callbacks declare the tenant explicitly with `using (TenantScope.Push(aziendaId)) { ... }` when running outside the request context.

**Tenant-aware cache.** Server-side `Application[]` keys and local metadata caches are automatically suffixed by `AziendaId` when the flag is active, preventing metadata bleed between tenants.

**Login routing.** Table `_login_index(username_hash, id_azienda)` on the primary DB maps username → tenant for the `MetaService.login` fallback: after authentication, the `k-user` cookie carries `azienda_id` as part of the payload and the middleware creates the correct `TenantScope` on every subsequent request.

**Scaffold propagation.** The "Scaffold table" action idempotently propagates table metadata to all tenants listed in `Aziende`. The propagation runs with an explicit `TenantScope` on each target and is idempotent: re-runnable, applies only missing changes.

**Files shipped in the package:**

- `appsettings.multi-tenant.mssql.json` / `appsettings.multi-tenant.mysql.json` — self-contained environment with 6 sample connection strings (1 primary + 5 tenants) and `multiConnectionEnabled=true`. Activate with `ASPNETCORE_ENVIRONMENT=multi-tenant.mssql`.
- `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` / `_mysql.sql` — DDL to add the two columns to `Aziende` on existing DBs.

---

## 🗺️ Per-language menu localization

Menu entries are now translated dynamically according to user language, without needing to duplicate `_metadati__menu` records per locale.

**Architecture.** The `mm_display_string_menu` field of `_metadati__menu` holds a **stable namespaced key** (`menu.admin.roles`, `menu.crm.opportunities`, `menu.fleet.vehicles`, ...). The Angular menu component template applies the `translate` pipe on `item.label`, and the key is resolved at runtime from the `_wuic_translations` dictionary filtered by current language.

**Key schema.**

```
menu.<scope>.<slug>
   │       └── snake_case slug (e.g. column_styles, opportunities)
   └── scope = root | admin | demo | crm | fleet | invoice
```

- `menu.root.*` — top-level parents (Administration, Application, Home, ...)
- `menu.admin.*` — 36 shared system entries (Roles, Designer, Column Styles, Workflow Designer, ...)
- `menu.demo.*` — WideWorldImporters demo content
- `menu.crm.*` / `menu.fleet.*` / `menu.invoice.*` — tenant-domain-specific entries

**Advantage over the previous model.**

- The old model used the Italian text of the label as the translation key (`Aziende`, `Customers`, `Ruoli`). This caused silent case-mismatches (`Ruoli` vs `ruoli`, `Stili Tabella` vs `Stili tabella`) because the `translate` pipe is case-sensitive while `_wuic_translations` has case-insensitive collation: the first MERGE that landed fixed the casing forever, and subsequent case-divergent INSERTs became silent no-ops.
- The new stable-key model is case-determinate (lowercase by convention), namespaced by scope, and no longer collides with other resources that might use the same Italian text (e.g. a button label "Ruoli" in a dropdown is a different key from `menu.admin.roles`).

**5 supported languages.** `it-IT`, `en-US`, `fr-FR`, `es-ES`, `de-DE`. Translations live in `_wuic_translations` (standard format: `language`, `resource`, `translation`). Switching language from the user dropdown in the top right re-reads the dictionary for the new language and re-paints the menu without F5.

**Runtime fallback.** Current language → en-US → it-IT → raw key. If you see `menu.admin.roles` literal on screen, it means the key has not been seeded in any of the 5 languages.

**Old Italian keys in `_wuic_translations` are not touched** by the upgrade: they may be consumed by other points in the app (`instant('Aziende')` in code-behind, list-grid headers, page titles) and remain valid.

---

## 🐛 Notable bug fixes

- **DLL lockers kill task — `dotnet watch` hot reload**: the process cleanup task before backend restart (`backend: kill dll lockers`) did not detect `WuicCore.exe` (the native executable emitted by .NET 8+) and lost the DLL lock at the next rebuild (`MSB3026: file is being used by another process`). Detection rewritten with the Restart Manager API (`rstrtmgr.dll`) as authoritative source, fallback CommandLine extended to `<Assembly>.exe` beyond `dotnet.exe`, recursive kill of the process tree. The `backend: stop running` / `backend crmapp: stop running` / `backend wuictest: stop running` tasks now also use the shared helper `scripts/stop-dotnet-app-processes.ps1` which handles both Debug and Release.

---

## 📦 Updated packages

| Package | From | To |
|---|---|---|
| WuicCore | 1.0.20 | 1.1.0 |
| Wuic.Webcore | 1.0.20 | 1.1.0 |
| WuicOData | 1.0.20 | 1.1.0 |
| RuntimeEfCore | 1.0.20 | 1.1.0 |
| wuic-framework-lib (NPM) | 1.0.20 | 1.1.0 |

---

## 🔧 Recommended operational updates for those upgrading

1. **For those wanting to enable multi-tenant** (opt-in): apply the DDL script `dbms/scripts/multi_tenant_aziende_connessioni_mssql.sql` (or `_mysql.sql`) to add the `Connessione_DB_Dati` and `CONNESSIONE_DB_Meta` columns to `Aziende`. Populate `Aziende` rows with the names of ConnectionStrings entries from `appsettings.json`. Set `AppSettings.multiConnectionEnabled = "true"`. Restart the backend.
2. **For those staying single-tenant**: no action required. Without `multiConnectionEnabled=true`, tenant routing is disabled and behavior is bit-identical to 1.0.20.
3. **Menu localization — metadata refresh**: after upgrade, run once `POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime` to reload the menu dictionary on the client side. Alternatively, log out and back in.
4. **Menu localization — migrating an existing project**: for projects coming from a previous version with Italian labels in `_metadati__menu.mm_display_string_menu`, apply two idempotent SQL steps: (a) `UPDATE _metadati__menu SET mm_display_string_menu = '<menu.scope.slug>' WHERE mm_display_string_menu = '<old label>'` for each entry, following the `menu.<scope>.<slug>` schema documented above; (b) `INSERT/MERGE INTO _wuic_translations (language, resource, translation)` 5 rows per new key (one per language). The old rows in `_wuic_translations` with resource = Italian text remain in the DB and can still be consumed by other callers (`instant()`, list-grid headers).
5. **Backend hot reload in dev**: if you develop with `dotnet watch` or with the `Backend: KonvergenceCore (Hot Reload Watch)` launcher, the `backend: kill dll lockers` task now requires `pwsh` 7+ (no longer Windows PowerShell 5.x). The inline C# script for Restart Manager uses `Dictionary<,>` syntax that is correctly parsed only in PS 7+.
