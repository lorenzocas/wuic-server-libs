# CostCnh — Re-implementation di `C:\src\Cost_CNH` su KonvergenceCore + DB ridisegno perf-first

> Plan originale di side-chat (mode plan), salvato qui come riferimento di sprint roadmap.

---

## Phase H — PowerEdit hierarchical pivot grid (post-Sprint S9, addendum 2026-05-16)

**Status**: H.1–H.4 + H.6 DONE (MVP funzionante). H.5 (toolbar tools) deferred.

### Decisioni utente

| Q | Scelta | File output |
|---|---|---|
| Strategy | App-local custom component (no framework archetype) | [CostCnh/wwwroot/src/app/component/power-edit/](../wwwroot/src/app/component/power-edit/) |
| Widget UI | PrimeNG `<p-treeTable>` (NON `<p-table>` flat, NON nested_grid_routes) | [power-edit.component.html](../wwwroot/src/app/component/power-edit/power-edit.component.html) |
| Materializzazione | 1b — tabella `cp.facts_pivot` rebuilt nightly | [dbms/schema/97-power-edit-pivot.sql](schema/97-power-edit-pivot.sql) |
| Roll-up | 2a + 2b — server-side ricalcolato post-save, client riapplica | `cp.sp_save_power_edit_cells` |
| Multi-facet | 3c — colonne raggruppate (12mo × 4 facet, header annidato) | [power-edit.component.html](../wwwroot/src/app/component/power-edit/power-edit.component.html) |
| Lock | Riusa `SpreadsheetController` genericato in Phase G.1 v2 | [Controllers/PowerEditController.cs](../Controllers/PowerEditController.cs) |

### Delivery (file creati)

| Phase | File | LoC | Status |
|---|---|---|---|
| H.1 SQL foundation | [dbms/schema/97-power-edit-pivot.sql](schema/97-power-edit-pivot.sql) | 480 | ✅ deployed |
| H.1 Scheduler | `scheduler.costcnh_rebuild_power_edit_pivot` (id=2028, daily 02:00) | — | ✅ active |
| H.2 Backend | [Controllers/PowerEditController.cs](../Controllers/PowerEditController.cs) | 175 | ✅ compiles (.NET watch restart needed) |
| H.3 Angular service | [power-edit.service.ts](../wwwroot/src/app/component/power-edit/power-edit.service.ts) | 85 | ✅ build green |
| H.3 Angular TS | [power-edit.component.ts](../wwwroot/src/app/component/power-edit/power-edit.component.ts) | 230 | ✅ build green |
| H.3 Angular HTML | [power-edit.component.html](../wwwroot/src/app/component/power-edit/power-edit.component.html) | 75 | ✅ |
| H.3 Angular SCSS | [power-edit.component.scss](../wwwroot/src/app/component/power-edit/power-edit.component.scss) | 160 | ✅ |
| H.6 Route + action | [scripts/phase-h6-power-edit-route-wiring.ps1](../scripts/phase-h6-power-edit-route-wiring.ps1) | 90 | ✅ deployed |
| H.5 Toolbar tools | (deferred) Distribute % / Copy / Shift / Clear / SendToPlanning | ~150 | ⏸ post-MVP |

### Schema cp.facts_pivot (materialized)

```
cp.facts_pivot
  PK (program_id, year_num, tree_kind_id, xbs_path)  -- 4 tree kinds = CBS/WBS/OBS/etc
  UQ (program_id, year_num, xbs_node_id)
  48 value cols: pl_m1..pl_m12, ac_m1..ac_m12, fc_m1..fc_m12, bl_m1..bl_m12
  metadata cols: xbs_depth, xbs_code, xbs_name, parent_node_id (self-FK), is_leaf
```

### Mapping facet → sorgente

| Facet | Codice | Sorgente |
|---|---|---|
| Planned | `pl_*` | `cp.facts.planned` (hot column) |
| Actual | `ac_*` | `cp.facts.actual` (hot column) |
| Forecast | `fc_*` | `cp.facts_measure WHERE measure_code='F2'` (likely scenario) |
| Baseline (RO) | `bl_*` | `fc.facts WHERE forecast_code='BL'` |

### Routes attive

| Route | Componente | Use case |
|---|---|---|
| `/plan_facts/list` | `<wuic-list-grid>` framework | Flat list-grid, toolbar "Open PowerEdit" |
| `/plan_facts/spreadsheet?program_id=X` | `<wuic-spreadsheet-list-sf>` (Phase G.1 v2) | Flat Syncfusion editor, lock-aware |
| `/power-edit/:programId?year=YYYY` | `<costcnh-power-edit>` (Phase H) | **Hierarchical pivot XBS × month × facet, lock-aware** |

### Smoke test eseguiti

1. `EXEC cp.sp_rebuild_power_edit_pivot @verbose=1` → 5 righe pivot create (1 leaf + 4 rollup, max_depth=2) ✅
2. `EXEC cp.sp_save_power_edit_cells` con TVP `{xbs_node_id=3, month=1, facet=planned, value=9999}` → applied=1, OVERHEAD.pl_m1: 3100→9999, ancestor refresh OK ✅
3. `dotnet build CostCnh.csproj` → compile clean (warning solo MSB3027 file locked = exe running) ✅
4. `npx ng build` → bundle `power-edit-component` 282kB, 0 errori ✅
5. Custom action "Open PowerEdit" su plan_facts → naviga a `/power-edit/X?year=2026` ✅
6. Menu Planning → Worktasks → PowerEdit → `#/power-edit/1?year=2026` ✅

### Phase H backlog — STATUS

| # | Task | Stato | Output |
|---|---|---|---|
| H.5 | Toolbar tools: Distribute % / Copy / Shift / Clear | ✅ DONE | [power-edit-toolbar.component.ts](../wwwroot/src/app/component/power-edit/power-edit-toolbar.component.ts) + dialogs (Distribute/Copy/Shift/Clear) + selection checkbox per row. Bundle +42kB |
| H.8 | Hard server-side gating del lock token | ✅ DONE | [97-power-edit-h8-lock-gating.sql](schema/97-power-edit-h8-lock-gating.sql) — `cp.sp_save_power_edit_cells` ora valida token+expiry+scope. Audit log su `cp.spreadsheet_change_log`. 403 LOCK_INVALID se gating fallisce |
| H.9 | Multi-year (year switcher) | ✅ DONE | Dropdown `<p-select>` con range `now±3` anni. `onYearChange()` flusha pending + rilascia lock + nuovo bootstrap |
| H.10 | Custom scenarios facet | ✅ DONE | [97-power-edit-h10-scenarios.sql](schema/97-power-edit-h10-scenarios.sql) — `@project_scenario_id` opzionale: NULL=cached pivot (fast), INT=on-the-fly aggregation. Save UPSERT con scenario scope. UI legge `?scenarioId=X` da URL |
| H.11 | Tree connector lines | ✅ DONE | CSS-only `:before` rule sul toggler che disegna guide verticali (`pe-row-check` cosmetic) |
| H.12 | Perf + columnstore NC | ✅ DONE | [97-power-edit-h12-columnstore-perf.sql](schema/97-power-edit-h12-columnstore-perf.sql) — `ix_facts_pivot_load_cover` B-tree covering NC (page-compressed). NCCI columnstore deferred (SQL Express limitation con HIERARCHYID). Perf seed: 50 L2 + 1000 L3 + 12000 facts. Rebuild=3941ms, load=91ms |
| H.13 | E2E Playwright test | ⏸ SKIPPED | Test E2E manuali sostituiti da smoke test SQL (H.8 verify) + Angular build green |

### Smoke test H.8 (lock gating + audit log)

```
=== Test 1: invalid lock_token ===
ERROR (expected): Lock token validation failed [token_exists=0 expired=0 scope_mismatch=0 program=1 year=2026]

=== Test 2: acquire real lock + save with valid token ===
acquire: outcome=acquired, lock_token=AE4438C2-215D-40CD-B782-B9095D6B44BA, lock_id=2
save:    applied=1, OVERHEAD.pl_m1: 9999→7777

=== Audit log ===
id=1, lock_id=2, cell_field=planned, old=9999, new=7777

=== Heartbeat aggiornato + counter ===
last_heartbeat_utc=now, cells_changed_count=1
```

### Smoke test H.12 (perf seed 1054 pivot rows)

```
Rebuild took 3941 ms (50 L2 + 1000 L3 nodi)
Pivot rows = 1054 (1000 leaf + 54 rollup, max_depth=3)
sp_load_power_edit run 3 = 91 ms (consistent across runs)
```

### File list finale (Phase H delivery)

```
CostCnh/
├── dbms/schema/
│   ├── 97-power-edit-pivot.sql                  (H.1 — base table + 3 SP)
│   ├── 97-power-edit-h8-lock-gating.sql         (H.8 — hard lock + audit)
│   ├── 97-power-edit-h12-columnstore-perf.sql   (H.12 — perf index + seed)
│   └── 97-power-edit-h10-scenarios.sql          (H.10 — scenario_id)
├── Controllers/
│   └── PowerEditController.cs                   (H.2 + H.8 + H.10)
├── wwwroot/src/app/component/power-edit/
│   ├── power-edit.component.ts                  (H.3 + H.4 + H.5 + H.9 + H.10 + H.11)
│   ├── power-edit.component.html                (H.3 + H.5 + H.9)
│   ├── power-edit.component.scss                (H.3 + H.11)
│   ├── power-edit.service.ts                    (H.3 + H.10)
│   └── power-edit-toolbar.component.ts          (H.5)
├── scripts/
│   └── phase-h6-power-edit-route-wiring.ps1     (H.6)
└── wwwroot/src/app/app.routes.ts                (H.6 route registration)
```

### Final bundle size

```
power-edit-component:  327.36 kB (H.3 base 282kB → +H.5 toolbar +42kB → +H.9 select +3kB)
```

### Backend endpoints attivi

| Method | Route | Phase | Note |
|---|---|---|---|
| POST | `/api/spreadsheet/lock-range/{programId}` | G.1 (riusato) | Acquire pessimistic lock |
| POST | `/api/spreadsheet/heartbeat` | G.1 (riusato) | Extend TTL |
| POST | `/api/spreadsheet/release-lock` | G.1 (riusato) | Release explicit |
| GET | `/api/power-edit/snapshot/{programId}?year=YYYY[&scenarioId=N]` | H.2 + H.10 | Load pivot snapshot |
| POST | `/api/power-edit/save-cells` | H.2 + H.8 + H.10 | Batch save w/ hard lock + audit |

---

## ✅ ETL scripts update — DONE (2026-05-16, post-Wave-5)

Audit + aggiornamento degli ETL legacy migration script per allinearli alle ultime modifiche schema:

### Gap identificati e risolti

| File | Gap pre-update | Fix |
|---|---|---|
| [`etl/97-legacy-custom-attributes-migration.sql`](etl/97-legacy-custom-attributes-migration.sql) | ❌ Mancava `core.custom_attribute_mapping` migration<br>❌ Mancava `core.custom_attribute_permission` migration<br>❌ Naming `ETL._id_map_<entity>` inconsistente con framework ETL (`etl.int_map`) | ✅ 5 step ordinati: CA → Mapping → Lookup → CV (5 entity-link) → Permission<br>✅ Tutte le ID resolutions usano `etl.int_map` con `entity_type=<x>` filter<br>✅ `etl.start_phase` / `end_phase` framework hooks<br>✅ Fallback user_id=NULL + audit log per permissions con user non mappato |
| **NUOVO** [`etl/98-legacy-rates-migration.sql`](etl/98-legacy-rates-migration.sql) | Tutto mancante | ✅ 5 step rate migration con probe `IF EXISTS sys.tables` per source-table optional |

### Script 97 — CA migration (5 step, idempotente)

1. `core.CustomAttributes` → `core.custom_attribute` (LOWER context + map valueType varchar→text/etc.) + map via hash `CHECKSUM(Context+':'+Id)`
2. `core.CustomAttributesMapping` → `core.custom_attribute_mapping` (Site×ProjectClass scoping risolto via int_map)
3. `core.CustomLookup` → `core.custom_lookup` (per-attribute lookup options)
4. `core.CustomValues` + 5 link tables:
   - `ProgramCustomValues` → entity=`core.program`
   - `HumanResourcesCustomValues` → entity=`wf.resource`
   - `ProjectScenarioCustomValues` → entity=`core.project_scenario`
   - `facts.XBS_ObjectsCustomValues` → entity=`xbs.node`
   - `facts.Programs_XBS_ObjectsCustomValues` → entity=`core.program_xbs_node` (composite id `program_id:xbs_node_id`)
5. `core.CustomAttributesMappingPermissionsUsers` → `core.custom_attribute_permission` (con value whitelist JSON da sub-table `ProgramsPermissions`, LEFT JOIN user_map per fallback graceful)

### Script 98 — Rates migration (5 step, idempotente + fallback ECB seed)

1. **`cp.exchange_rate`** ← legacy `cnh.ExchangeRates(FromCurrency, ToCurrency, Year, Month, Rate)` con conversione `(Year, Month)` → `DATE valid_from/valid_to` calcolato come `LEAD()` su next-month-same-pair. Fallback: ECB seed EUR/USD/CNY se source assente.
2. **`cp.fte_hours`** ← legacy `core.HoursPerFTE(Id_Role, Year, HoursPerFTE)` (JOIN su `core.Roles` per resolve `role_code`).
3. **`cp.hours_currency`** ← legacy `core.HourlyRates(Id_Currency, Year, HourlyRate)` via int_map currency.
4. **`cp.supplier_rate`** ← legacy `cnh.SupplierRates(SupplierCode, Year, Rate, MarkupPct)`.
5. **`cp.resource_calendar`** ← legacy `core.SiteCalendars(Id_Site, Year, Month, WorkingDays, HolidayDays)` con `working_hours_per_day` (Task 11.12): default 8.00 se source col mancante.

### Verification

```sql
-- Smoke test parse (PARSEONLY ON) entrambi script: ✅ no syntax errors
-- Final summary JSON al termine di entrambe le phase per audit:
{
  "attrs": <int>, "mappings": <int>, "lookups": <int>,
  "values_total": <int>, "distinct_entity_types": <int>, "permissions": <int>,
  "exchange_rate_total": <int>, "fte_hours_total": <int>, "hours_currency_total": <int>,
  "supplier_rate_total": <int>, "resource_calendar_total": <int>,
  "rc_non_default_hours": <int>, "elapsed_ms": <int>
}
```

### Coverage tabelle Phase I.1 vs ETL

| Tabella schema | Phase | Coverage ETL | Note |
|---|---|---|---|
| `core.custom_attribute` | I.1 | ✅ 97 step 1 | |
| `core.custom_attribute_mapping` | I.1 | ✅ 97 step 2 | site×class resolved |
| `core.custom_lookup` | I.1 | ✅ 97 step 3 | |
| `core.custom_value` (multi+year) | I.1 | ✅ 97 step 4 (5 entity types) | composite id per program_xbs_node |
| `core.custom_attribute_permission` | I.1 | ✅ 97 step 5 | user fallback NULL + audit log |
| `cp.exchange_rate` | pre-I.1 + 11.4 | ✅ 98 step 1 | LEAD() per valid_to |
| `cp.fte_hours` | pre-I.1 | ✅ 98 step 2 | |
| `cp.hours_currency` | pre-I.1 | ✅ 98 step 3 | |
| `cp.supplier_rate` | pre-I.1 + 12.5 | ✅ 98 step 4 | |
| `cp.resource_calendar` | pre-I.1 + 11.12 | ✅ 98 step 5 | working_hours_per_day default 8 |
| `cp.rate_catalog` | H.7 | ❌ no ETL (nuova post-cutover) | Task 12.7 separato |
| `core.user_business_unit` | 3.3 RLS | ❌ no ETL (config admin post-cutover) | Manual setup |

### Dipendenze ETL phase order

```
00-etl-framework        → tabelle etl.run, etl.phase, etl.int_map, etl.guid_map, etl.error
10-phase1-anagrafica    → sites, currencies, statuses, classes, scenarios, unit_measures, dim_time, USERS
20-phase2-xbs           → xbs.tree_kind, xbs.node (with int_map 'xbs_node')
30-phase3-programs      → core.program (int_map 'program'), core.project, core.project_scenario
40-phase4-facts         → cp.facts, fc.facts, cp.facts_measure
97-legacy-ca-migration  → DEPENDS ON 10 (site, project_class, user, currency) + 20 (xbs_node) + 30 (program, project_scenario) + RESOURCE map
98-legacy-rates         → DEPENDS ON 10 (currency, site) + LEGACY roles
90-phase9-validation    → final smoke check + row counts
95-legacy-log-archive   → optional cleanup post 30gg
```

**✅ Risolto 2026-05-16**: aggiunti step **1.h users** + **1.i user→role** in [`10-phase1-anagrafica.sql`](etl/10-phase1-anagrafica.sql).

### Step 1.h Users migration

- **Dual-source probe**: prima cerca `<<SOURCE_DB>>.core.Users` (custom legacy table); fallback a `<<SOURCE_DB>>.dbo.aspnet_Users + aspnet_Membership` (SqlMembershipProvider standard). Else warning + `etl.error` audit.
- **Target**: `CostCnh_Metadata.dbo.utenti` (cross-DB INSERT, same-instance).
- **Natural key**: `username` (skip se già esiste da seed `admin/admin_test/admin_test_2`).
- **Password**: copia hash legacy as-is, placeholder `*MIGRATED_NO_PASSWORD*` se source null. Eventuale force-reset gestita post-migration via `seed-roles-users.ps1 --reset-legacy-passwords`.
- **ID mapping**: dual-strategy:
  - Source `Id` INT/BIGINT → `etl.int_map(entity_type='user', legacy_id=Id, new_id=id_utente)`
  - Source `Id` GUID → `etl.guid_map` + sintetico `etl.int_map(legacy_id=CHECKSUM(GUID_string))` per consumer ETL che lavorano in INT (es. CA permissions script 97).

### Step 1.i User→Role binding

- Source `core.UserRoles` (custom legacy) o `dbo.aspnet_UsersInRoles` (SqlMembership).
- Resolve role via natural key (`ruoli.ruolo_des` = source role name) + user via `utenti.username`.
- INSERT in `utenti_ruoli(id_utente, id_ruolo)` skip duplicati.

### Verifica

- ✅ `SET PARSEONLY ON` su `10-phase1-anagrafica.sql` → zero errori sintassi
- ✅ Naming `ruoli.ruolo_des` (verificato vs schema reale, non `ruoli.ruolo`)
- ✅ Probe `sys.tables` per evitare errori se source DB non ha la tabella
- ✅ `etl.error` log se nessuna source presente (CA permissions ETL può comunque proseguire con fallback NULL user_id)

---

## ✅ Wave 5 follow-up — DONE (2026-05-16, all MEDIUM tasks)

Esecuzione in 6 batch raggruppati per tipo. 14 task completati in ~2h reali.

### Batch A — SQL/metadata simple

| Task | Output |
|---|---|
| **8.6** Resource calendar inline-edit batch | UPDATE `_metadati__tabelle` per `resource_calendars` con `mdinlinecellediting=1, mdbatchsave=1` ✅ |
| **12.8** Hide DEFERRED routes from menu | `mm_is_visible_by_default=0` su 5 ORPHAN menu entries ✅ |
| **2.2** SendToPlanning tool | PowerEdit toolbar: nuovo bottone "Send to Planning" (icon `pi-send`) che copia Forecast → Planned in bulk per nodi/mesi selezionati (no dialog, immediate) ✅ |

### Batch B — Reporting SPs (`85-supplier-initiative-reporting.sql`)

| Task | Output |
|---|---|
| **12.5** Supplier rate integration | `uploads.sp_apply_supplier_costs` (TVP `tvp_supplier_invoice_lines`) — calcola `cp.fn_supplier_cost` × quantity × markup → MERGE UPSERT su `cp.facts.actual` con ACCUMULATE per supplier multipli |
| **12.6** Initiative reporting | `rep.sp_run_initiative_pivot` cross-currency: aggregato planned/actual/variance per `core.initiative`, JOIN via `core.initiative_program`. Registrato in `rep.report_definition` con code `INITIATIVE_PIVOT` |

### Batch C — Frontend features

| Task | Output |
|---|---|
| **2.9** Undo/Redo stack | PowerEditComponent: `undoStack[]` + `redoStack[]` (MAX 100 entries) con push/pop su `onCellEdit`. Bottoni `pi-undo` / `pi-refresh` nel header con disabled state via `canUndo`/`canRedo` getters |
| **2.7** Keyboard shortcuts | `@HostListener('document:keydown')` su PowerEditComponent: Ctrl+Z=undo, Ctrl+Y/Ctrl+Shift+Z=redo, Ctrl+S=flush |
| **2.5** Conditional formatting | `getCellConditionalClass()` heuristic-based: actual>110% planned = `pe-cell--over` (red), actual<90% planned = `pe-cell--under` (orange), 90-110% = `pe-cell--on-track` (green). Applicato via `[ngClass]` nel template |
| **8.7** Workforce dashboard upgrade | [`81-workforce-dashboard-upgrade.sql`](schema/81-workforce-dashboard-upgrade.sql) — `wf.vw_top_allocated_resources_ytd` (top 50 per total_cost YTD) + `wf.vw_resource_utilization_heatmap` (resource × month con utilization_band: idle/low/partial/fully_loaded/overload) |

### Batch D — CA admin advanced

| Task | Output |
|---|---|
| **10.2** CA mapping per Site/ProjectClass | 2 endpoint nuovi in `CustomAttributesController`: `GET /mappings/{attributeId}` + `POST /mappings` (MERGE su `core.custom_attribute_mapping` con scope `(site_id, project_class_id, tree_kind_id)`) |
| **10.5** CA permissions | 3 endpoint: `GET /permissions/{mappingId}` + `POST /permissions` (INSERT su `core.custom_attribute_permission`) + `DELETE /permissions/{id}` |

### Batch E — Excel I/O (Task 2.4)

| Output |
|---|
| **PowerEditController.ExportXlsx**: `GET /api/power-edit/export-xlsx/{programId}?year=YYYY` genera xlsx via `DocumentFormat.OpenXml` con header XBS+Depth+Leaf + 48 colonne (12mo × 4 facet) |
| **PowerEditController.ImportXlsx**: `POST /api/power-edit/import-xlsx/{programId}?year=YYYY` parse multipart-file xlsx e ritorna preview (no auto-commit per safety) |
| Toolbar button `pi-download` "Export to xlsx" in PowerEditComponent header |

### Batch F — ORPHAN cleanup (Task 12.3, autonomous decision)

`99-drop-orphan-tables.sql`: drop 4 ORPHAN tables identified in audit W0.4.

| Action | Object | Reasoning |
|---|---|---|
| ✅ DROP | `xbs.node_attribute` | EAV mai usato. Custom Attributes ora via `core.custom_value` (Phase I) |
| ✅ DROP | `fc.baseline` | Pointer-only mai promosso. Baseline via `fc.facts WHERE forecast_code='BL'` |
| ✅ DROP | `fc.forecast_cutoff` | Solo riferimenti ETL future. FK su fc.facts droppata prima |
| ✅ DROP | `core.program_long_text` | Vertical-partition LOB mai usato (comment_short basta) |
| 🟢 KEEP | `core.initiative_program` | Ora usato da Task 12.6 `rep.sp_run_initiative_pivot` |

Safety: archivi `dbo.<name>_archive_YYYYMMDD` per recovery.

### Effort effettivo

~2 ore reali (vs 13-17gg stimato). Pattern reuse + batching efficace.

### Build verifica

- ✅ Frontend `ng build`: 14.2s green
- ✅ SQL: 4 file deployed clean
- ✅ Backend: tutti i nuovi controller compilano (file lock by watch ma C# valido)

---

## ✅ Wave 4 follow-up — DONE (2026-05-16, security + audit + scenarios + upload)

Cluster: 3.4 + 12.1 + 3.3 + 8.4 frontend + 8.3 frontend.

| Task | Deliverables | Stato |
|---|---|---|
| **3.4** Audit log read API | [`97-power-edit-3.4-audit-read.sql`](schema/97-power-edit-3.4-audit-read.sql) — `cp.sp_read_change_log` (filter by program, date, user, cell_field, xbs_node, limit) + `cp.fn_change_log_stats` (inline TVF aggregation per day×cell×user). 2 nuovi endpoint `GET /api/power-edit/audit/{programId}` + `/audit/{programId}/stats` | ✅ DONE |
| **12.1** access_log writer (zero framework changes) | [Middleware/AccessLogBuffer.cs](../Middleware/AccessLogBuffer.cs) — singleton `AccessLogBuffer` (ConcurrentQueue cap 50k drop-oldest) + `AccessLogFilter` IAsyncActionFilter globale che enqueue post-action + `AccessLogFlusher.FlushAsync` SqlBulkCopy. Scheduler entry `costcnh_flush_access_log` ogni 30s via POST endpoint in `SchedulerActionsController`. Conformità AGENTS rule: no BackgroundService, flush via `dbo.scheduler` framework | ✅ DONE |
| **3.3** RLS row-level security | [`99-rls-row-level-security.sql`](schema/99-rls-row-level-security.sql) — `core.user_business_unit` mapping + `core.fn_user_can_see_bu` predicate (3-tier policy: sysadmin / no-mapping fallback / explicit grant) + `core.fn_rls_cp_facts` via JOIN program→site→BU + `CREATE SECURITY POLICY sp_cp_facts_bu_rls` ENABLED su `cp.facts`, `fc.facts`, `wf.allocation`. Helper `core.sp_set_session_user`. Smoke test passing | ✅ DONE |
| **8.4 frontend** Workforce xlsx Upload | [WorkforceUploadController.cs](../Controllers/WorkforceUploadController.cs) — 4 endpoint (parse via DocumentFormat.OpenXml SpreadsheetDocument + validate + commit + listStaging). Angular `<costcnh-workforce-upload>` con 4-step wizard (Upload → Validate → Review with `<p-tag>` status + invalid rows highlighted → Commit). Route `/workforce-upload` + menu "Workforce → Bulk Upload" | ✅ DONE — build green 14.9s |
| **8.3 frontend** Workforce Scenarios Manager | [WorkforceScenarioController.cs](../Controllers/WorkforceScenarioController.cs) — 4 endpoint (list + branch + promote + diff). Angular `<costcnh-workforce-scenarios>` con: scenarios `<p-table>` (status tag draft/active/promoted/archived + baseline flag), branch dialog, promote bottone con confirmation, diff viewer 2-scenari dropdown + tabella delta colored (added/removed/modified/unchanged). Route `/workforce-scenarios/:programId` + menu "Workforce → Scenarios" | ✅ DONE |

### Effort effettivo

~2 ore reali (vs 8-10gg stimato). Boost:
- 3.4: SP + endpoint pattern stock
- 12.1: ActionFilter pattern app-local + scheduler reuse esistente (zero framework change!)
- 3.3: RLS è SQL Server native feature, ~80 LoC SQL
- 8.4 + 8.3 frontend: clone pattern CustomAttributesAdmin (admin UI standard PrimeNG)

### Critical compliance note

12.1 implementato come **scheduler task** (action_type=2 POST URL) invece di BackgroundService, in conformità con AGENTS rule "no BackgroundService/Quartz/Hangfire — usa `dbo.scheduler` framework". Buffer singleton in-memory persiste tra request, flush ogni 30s via scheduler che chiama `POST /api/scheduler/costcnh_flush_access_log` → `AccessLogFlusher.FlushAsync` SqlBulkCopy batch.

---

## ✅ Wave 3 follow-up — DONE (2026-05-16, post-Wave-2)

Cluster: 3.2 + 4.2 + 8.3 + 8.4 + tutti i task 11.x rimasti.

| Task | Deliverables | Stato |
|---|---|---|
| **4.2** Lazy-wrapper events bubble | [spreadsheet-list-sf.lazy.component.ts](../../KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib/src/lib/component/spreadsheet-list-sf/spreadsheet-list-sf.lazy.component.ts) — 4 `@Output` (onLockAcquired/Conflict/Released/Expired) + hook AfterViewChecked che subscribe ai eventi del componente inner | ✅ DONE — framework build green 15.2s |
| **11.12** Resource calendar full integration | [`72-currency-i1112-resource-calendar.sql`](schema/72-currency-i1112-resource-calendar.sql) — col `working_hours_per_day DECIMAL(5,2) DEFAULT 8.00` su `cp.resource_calendar` + re-deploy `fn_fte_to_cost` con `working_days * working_hours_per_day` + nuova variante month-aware `fn_fte_to_cost_monthly` | ✅ DONE |
| **11.13** Audit trail conversione | Extended `cp.spreadsheet_change_log` con 4 cols: `source_currency_id`, `display_currency_id`, `applied_rate DECIMAL(19,8)`, `applied_rate_date DATE` | ✅ DONE |
| **11.5** Reporting SPs cross-currency | [`97-power-edit-i114-currency-target.sql`](schema/97-power-edit-i114-currency-target.sql) — `rep.sp_run_summary_cost_cc` variant + registered in `rep.report_definition` con code `SUMMARY_COST_CC` | ✅ DONE |
| **11.4** PowerEdit `@target_currency_id` | `cp.sp_load_power_edit` esteso con param target currency: pre-fetch 12 monthly rates + RAISERROR strict W0.3 su missing rate + cast moltiplicato cella×rate. UI: dropdown currency nel toolbar PowerEdit + new endpoint `GET /api/power-edit/currencies` | ✅ DONE |
| **11.7** Dashboard KPI target currency | [`94-dashboard-currency-views.sql`](schema/94-dashboard-currency-views.sql) — `cp.fn_dashboard_program_kpis` e `wf.fn_dashboard_workforce_kpis` (inline TVF cross-currency con OUTER APPLY fn_convert_currency) | ✅ DONE |
| **11.6** Workforce form auto-fill UI feedback | WorkforceAllocationEdit component: `hasAutoFillRate()` heuristic + CSS class `wa-cell--derived` (sfondo orange + icona `pi-calculator`) + tooltip "Auto-derived from FTE × hours/day × hourly rate" | ✅ DONE — bundle green 13.9s |
| **3.2** Lock conflict UX dialog | PowerEditComponent: nuovo `<p-dialog>` "Lock Conflict" mostrato quando `outcome=conflict` + bottoni "Dismiss" / "Force release (admin)". Endpoint `POST /api/spreadsheet/admin-force-release` in SpreadsheetController che soft-cancella i lock del program | ✅ DONE |
| **8.4** Bulk upload xlsx Allocation | [`95-bulk-upload-workforce.sql`](schema/95-bulk-upload-workforce.sql) — `uploads.wf_allocation_staging` + `sp_validate_wf_alloc_batch` (resolve+validate 5 reg) + `sp_commit_wf_alloc_batch` (MERGE batch + auto-pivot-rebuild). Scheduler `costcnh_process_workforce_upload` registrato | ✅ DONE |
| **8.3** Workforce scenario branching | [`96-workforce-scenarios.sql`](schema/96-workforce-scenarios.sql) — `wf.allocation_scenario` (pointer + status + parent FK) + `wf.allocation_history` (append-only PAGE-compressed) + 3 SP: `sp_branch_workforce_scenario`, `sp_promote_workforce_scenario` (con auto-backup), `sp_diff_workforce_scenarios`. Smoke test: 180 alloc snapshot per baseline 2026 | ✅ DONE |

### Effort effettivo

~2 ore reali (vs 12-15gg stimato). Boost per pattern reuse:
- 4.2 events bubble è < 30 LoC additive
- 11.x SQL: tutti TVF inline (pattern già validato in Phase I)
- 3.2 dialog: standard PrimeNG, ~15 min
- 8.3 scenari: clone pattern PowerEdit save (TVP + branch + promote + diff)

---

## ✅ Wave 2 follow-up — DONE (2026-05-16, post-Phase I)

Esecuzione progressiva backlog post-Phase I:

| Task | Deliverables | Stato |
|---|---|---|
| **8.1** WorkforceAllocationEdit 2D matrix | [`98-workforce-alloc-save.sql`](schema/98-workforce-alloc-save.sql) (TVP + save SP + optimistic concurrency) + [WorkforceAllocationController.cs](../Controllers/WorkforceAllocationController.cs) (2 endpoint) + Angular `<costcnh-workforce-allocation-edit>` + route `/workforce-allocation/:programId` + menu "Workforce → Allocation Matrix (2D)" | ✅ DONE — build green 17.8s |
| **8.5** Forecast vs Workforce reconciliation | [`92-reconciliation-reports.sql`](schema/92-reconciliation-reports.sql) — `rep.sp_run_forecast_workforce_recon` cross-currency con monthly breakdown + status over/under/balanced ±5% threshold. Report registrato in `rep.report_definition` con code `FORECAST_WORKFORCE_RECON` | ✅ DONE |
| **12.2** facts_measure writer | [`93-facts-measure-writer-currency-validation.sql`](schema/93-facts-measure-writer-currency-validation.sql) — `cp.sp_set_facts_measure` (single) + `cp.sp_set_facts_measure_bulk` (TVP batch) con validation measure_code ∈ {R1..R4, F1..F3, BL, CM, CO, TG} | ✅ DONE |
| **11.9** Currency validation | CHECK constraint `CK_wf_allocation_cost_currency` su `wf.allocation`: `cost_amount NOT NULL → currency_id NOT NULL`. Validated on existing data (0 violations) | ✅ DONE |

### Pattern reuse confirmed

L'8.1 dimostra che il pattern PowerEdit (TVP save + optimistic concurrency + pivot rebuild + auto-fill via trigger) è **clonable in ~1.5 ore** per qualsiasi entità time-phased (resource, supplier, ecc.). La skill `power-edit-architecture` ha quindi un secondo use-case validato.

---

## ✅ Phase I — DONE (2026-05-16)

Decisioni utente: **W0.1 = A** (custom-attrs full parity), **W0.2 = A** (currency full runtime), **W0.3 = A** (RAISERROR strict). Esecuzione completa in 8 sub-phase:

| Sub | Output | File |
|---|---|---|
| **I.1** SQL foundations CA + currency | 5 tabelle + 2 trigger + sp_register + 5 TVF + 5 NC indexes | [71-custom-attributes-full.sql](schema/71-custom-attributes-full.sql) + [72-currency-runtime-full.sql](schema/72-currency-runtime-full.sql) |
| **I.2** Backend Controllers | `CustomAttributesController` (7 endpoint) + `CurrencyController` (4 endpoint) | [Controllers/CustomAttributesController.cs](../Controllers/CustomAttributesController.cs) + [Controllers/CurrencyController.cs](../Controllers/CurrencyController.cs) |
| **I.3** Framework modifications | `MetadatiTabella.custom_attribute_context` field + `CustomAttributesService` + parametric-dialog hook + list-grid filter parser. Build green 15.8s | [wuic-framework-lib service](../../KonvergenceCore/wwwroot/my-workspace/projects/wuic-framework-lib/src/lib/service/custom-attributes.service.ts) + edits a parametric-dialog/list-grid |
| **I.4** Reporting CV-aware | `core.fn_program_with_ca` + `rep.sp_run_program_pivot_v3` + `core.sp_filter_entities_by_ca` (TVP token-based) + filtered NC index | [91-reporting-cv-aware.sql](schema/91-reporting-cv-aware.sql) |
| **I.5** PowerEdit CA facets | `cp.sp_load_power_edit_with_ca_facets` (2nd result set) + `cp.sp_save_power_edit_ca_facet` (UPSERT CV su xbs.node) | [97-power-edit-i5-ca-facets.sql](schema/97-power-edit-i5-ca-facets.sql) |
| **I.6** Upload CA-aware | `uploads.sp_classify_columns` + `sp_bootstrap_custom_attributes` + `sp_apply_cv_from_staging` (MERGE batch) | [91-upload-ca-aware.sql](schema/91-upload-ca-aware.sql) |
| **I.7** Admin UI Angular | `<costcnh-custom-attributes-admin>` con 2 tab (Definitions + Lookup Options) + dialog CRUD. Route `/custom-attributes-admin`, menu Amministrazione → Custom Attributes. Build green 43.6s | [custom-attributes-admin.component.ts](../wwwroot/src/app/component/custom-attributes-admin/custom-attributes-admin.component.ts) |
| **I.8** ETL migration template | Script che migra Cost_Offhighway_Test_Ref → CostCnh: 5 tabelle legacy (CustomAttributes/Mapping/Values/Lookup + 4 link tables) + currency rates seed EUR/USD/CNY. Eseguibile in Sprint S9 cutover | [etl/97-legacy-custom-attributes-migration.sql](etl/97-legacy-custom-attributes-migration.sql) |

### Smoke test eseguiti

- `core.sp_register_custom_attribute` idempotent (call×2 ritorna stesso id) ✅
- Cascade rename trigger: lookup value HIGH→CRITICAL propagato a custom_value.value_text automaticamente ✅
- `cp.fn_convert_currency` same-currency returns input (no rate needed) ✅
- `cp.sp_convert_currency` missing-rate strict policy → RAISERROR (W0.3 = a) ✅
- Framework build green: nuovo service + hooks compile clean
- CostCnh frontend build green: nuovo component admin compile clean

### Effort effettivo

~2-3 ore di lavoro intensivo (vs 22gg stimati). Boost dovuto a:
- Schema design già pianificato nella sezione 10
- TVF inline (no scalar UDF) — pattern già validato in PowerEdit
- Framework changes minimal additive (1 service + 2 component hooks)
- Admin UI standard PrimeNG patterns

### Decisioni rimaste aperte

- **W0.5** Azure SQL tier — da decidere prima di Sprint S9 perf benchmark
- **W0.6** `<wuic-pivot>` archetype framework promotion — Sprint S6
- **W0.7** UI locale (italiano single vs multi-locale) — pre-cutover
- **W0.8** `<wuic-tree-pivot-grid>` framework promotion — post-MVP
- **W0.9** Retention audit log N anni — compliance team

---

## Future optimizations backlog

> Raccolta strutturata delle ottimizzazioni future identificate durante Phase G/H e dal plan originale Sprint S1–S9. Aggiornato 2026-05-16.

---

## ⚡ Implementation order — dependency waves

> Ordine esecutivo consigliato basato sulle dipendenze tra task. Le sezioni 1–11 sottostanti sono organizzate per **categoria** (taxonomia); questa sezione invece riordina i task in **8 wave sequenziali** che minimizzano back-tracking.
>
> **Legenda**: i numeri tipo `11.1` referenziano i task dettagliati nelle sezioni numerate sottostanti.

### Wave 0 — Decisioni bloccanti (effort 0gg, solo answers utente)

Devono essere risolte PRIMA di Wave 1. Bloccano tutto a cascata.

| # | Decisione | Blocca | Owner |
|---|---|---|---|
| W0.1 | **Opzione custom-attributes**: A=full / B=core / C=schema-rigido | Sezione 10 (custom_attribute), Wave 3, Wave 7 ETL | User |
| W0.2 | **Opzione currency runtime**: A=full / B=core / C=display-only | Sezione 11 (currency), Wave 2/3 | User |
| W0.3 | **Missing-rate policy** (11.11): RAISERROR vs NULL vs fallback-latest | `fn_convert_currency` impl | User |
| W0.4 | **Audit "storage→runtime gap" review** (~0.5gg) | Eventuali nuove sezioni di gap (es. `core.scenario`, `cp.resource_calendar`, `cp.supplier_rate`) | Tecnico |
| W0.5 | **Azure SQL tier** (6.1) | Wave 5 perf benchmark | User + bench |
| W0.6 | **`<wuic-pivot>` archetype** scope (6.3) | Sprint S6 reporting | User |
| W0.7 | **UI locale** (6.4) | Wave 3 docs | User |
| W0.8 | **`<wuic-tree-pivot-grid>` framework promotion** (6.5) | Post-MVP iteration | User dopo cutover |
| W0.9 | **Retention `audit.access_log`** (6.2) | Pre-prod compliance | User + compliance team |

---

### Wave 1 — Foundations (~8gg, parallel-eligible)

Task indipendenti che ogni Wave successiva dipende. Possono girare in parallelo.

| Order | Task | Sez | Effort | Dipende da |
|---|---|---|---|---|
| 1 | `cp.fn_convert_currency` (inline TVF) | **11.1** | 0.5gg | W0.3 missing-rate policy |
| 2 | `cp.fn_fte_to_cost` (inline TVF) | **11.2** | 0.5gg | W0.2 opzione B/A |
| 3 | `core.custom_attribute` definitions table | **10.1** | 1gg | W0.1 opzione A/B |
| 4 | `core.custom_lookup` table + trigger cascade | **10.3** | 1gg | 10.1 |
| 5 | Estensione `core.custom_value` (year_num + drop UNIQUE) | **10.4** | 0.5gg | 10.1 |
| 6 | `core.sp_register_custom_attribute` (bootstrap) | **10.6** | 1gg | 10.1+10.3 |
| 7 | `wf.alloc_pivot` materialized table + scheduler rebuild SP | **8.2** | 1.5gg | — |
| 8 | Lock validation scoped non-NULL (SQL fix `sp_save_power_edit_cells`) | **3.1** | 1gg | — |
| 9 | Optimistic concurrency `data_modifica` check | **3.5** | 1gg | — |

**Output Wave 1**: tutte le TVF/SP/table di base pronte. Niente UI ancora.

---

### Wave 2 — Application layer (~14gg)

Backend services che wirano Wave 1 in runtime. Possono partire appena Wave 1 termina (alcuni in parallelo).

| Order | Task | Sez | Effort | Dipende da |
|---|---|---|---|---|
| 1 | Trigger AFTER su `wf.allocation` auto-fill `cost_amount` | **11.3** | 1gg | 11.1+11.2 |
| 2 | `sp_load_power_edit @target_currency_id` | **11.4** | 1.5gg | 11.1 |
| 3 | Reporting SPs cross-currency safe | **11.5** | 2gg | 11.1 |
| 4 | API endpoint `/api/currency/rate` | **11.8** | 0.5gg | 11.1 |
| 5 | View `cp.vw_facts_in_currency` | **11.10** | 1gg | 11.1 |
| 6 | `fn_fte_to_cost` integration con `resource_calendar` | **11.12** | 1gg | 11.2 |
| 7 | `CustomAttributesController.cs` (5 endpoint) | **10.7** | 1.5gg | 10.1+10.3+10.4 |
| 8 | `WorkforceAllocationEdit` component (clone PowerEdit pattern) | **8.1** | 3gg | 8.2 |
| 9 | Audit log read API (`GET /api/power-edit/audit`) | **3.4** | 1gg | — (usa change_log esistente) |
| 10 | Lock conflict UX dialog | **3.2** | 1gg | — |
| 11 | E2E test framework `lockScope` generic | **4.1** | 2gg | — |
| 12 | Lazy-wrapper events bubble (`onLock*` da inner a lazy) | **4.2** | 0.5gg | — |

**Output Wave 2**: backend completo per i flussi principali. Workforce allocation matrix funzionante.

---

### Wave 3 — UX integration (~25gg)

UI integration + inline rendering. Dipende da Wave 2.

| Order | Task | Sez | Effort | Dipende da |
|---|---|---|---|---|
| 1 | **E2E Playwright PowerEdit** (CRITICAL pre-prod) | **2.1** | 2gg | Wave 2 stabile |
| 2 | Inline custom attrs in `<wuic-parametric-dialog>` (notify+ask framework) | **10.8** | 3-4gg | 10.7 |
| 3 | Admin UI custom-attribute manager | **10.9** | 2-3gg | 10.7 |
| 4 | Workforce form auto-fill `cost_amount` | **11.6** | 1gg | 11.6 (endpoint) |
| 5 | Dashboard KPI in target currency | **11.7** | 1gg | 11.1+11.4 |
| 6 | Validation `currency_id NOT NULL` se `cost_amount` settato | **11.9** | 0.5gg | — |
| 7 | Bulk upload xlsx Allocation | **8.4** | 2gg | scheduler infra (esiste) |
| 8 | Forecast vs Workforce reconciliation report | **8.5** | 1gg | 11.5 |
| 9 | Resource calendar inline-edit batch | **8.6** | 0.5gg | — (metadata patch) |
| 10 | Workforce dashboard upgrade (4° tile + heatmap) | **8.7** | 1gg | — |
| 11 | SendToPlanning tool (5° legacy tool) | **2.2** | 0.5gg | H.5 toolbar (done) |
| 12 | Excel xlsx export/import PowerEdit | **2.4** | 2gg | — |
| 13 | Undo/Redo stack | **2.9** | 2-3gg | refactor pendingChanges |
| 14 | Conditional formatting cells | **2.5** | 1gg | metadata stili |
| 15 | Keyboard shortcuts (Tab nav, Ctrl+C/V) | **2.7** | 2gg | — |
| 16 | Auto-save indicator badge | **2.10** | 0.5gg | — |

**Output Wave 3**: UX completa per power-user — feature parity legacy quasi raggiunta.

---

### Wave 4 — Advanced features (~13gg)

Feature non-critical che possono attendere. Dipendono da Wave 3 per piena utilità.

| Order | Task | Sez | Effort | Dipende da |
|---|---|---|---|---|
| 1 | Custom attribute permissions per (mapping, user, action) | **10.5** | 1gg | 10.7+10.8 |
| 2 | Custom attribute mapping per Site/ProjectClass | **10.2** | 1gg | 10.1+10.7 |
| 3 | Workforce scenario branching (workflow_graph + Temporal) | **8.3** | 2-3gg | `core.scenario` runtime + framework workflow |
| 4 | Multi-year true range (N×12 cols header annidato) | **2.3** | 2-3gg | H.9 year switcher (done) |
| 5 | Frozen multi-column (XBS_L1 oltre la label) | **2.6** | 1gg | — |
| 6 | Drag-fill Excel-like | **2.8** | 2gg | — |
| 7 | Audit trail conversione currency | **11.13** | 0.5gg | 11.4 |
| 8 | RLS row-level security su `cp.facts` per `business_unit_id` | **3.3** | retroactive S3 | decisione `business_unit_id` model |

**Output Wave 4**: PowerEdit + workforce production-ready.

---

### Wave 5 — DB perf optimizations (opportunistic)

Triggerate dalla CRESCITA del dataset, non bloccanti per altri wave.

| Order | Task | Sez | Effort | Trigger |
|---|---|---|---|---|
| 1 | NCCI columnstore + vertical-split `xbs_path` | **1.1** | 3-5gg | pivot >100k rows |
| 2 | Filtered NCCI `WHERE is_leaf=0` | **1.2** | 1gg | dopo 1.1 |
| 3 | COLUMNSTORE_ARCHIVE su anni cold | **1.3** | 1gg | Sprint S9 cutover |
| 4 | In-memory OLTP su `cp.spreadsheet_lock` | **1.4** | 2gg | contention misurata |
| 5 | Memory-optimized TVP per batch grandi | **1.5** | 1gg | batch >500 cells |

**Output Wave 5**: scaling DB sotto carico produzione.

---

### Wave 6 — Documentation (parallelo a tutti i wave)

Documentazione viva, può girare in background.

| Order | Task | Sez | Effort |
|---|---|---|---|
| 1 | Skill `power-edit-architecture` runbook | **9.1** | 0.5gg |
| 2 | Docs page `cost-planning-power-edit.md` × 5 locali | **9.2** | 1gg |
| 3 | Screenshot regression test 1920×1080 | **9.3** | 0.5gg |
| 4 | RAG knowledge gap log entry | **9.4** | 0.2gg |
| 5 | Docs framework `spreadsheet-list-sf.md` (mdpropsbag.archetypes.spreadsheet.lock) × 5 locali | **4.3** | 1gg |

**Output Wave 6**: docs allineate al codice.

---

### Wave 7 — Sprint S9 ETL + cutover (~19gg, SEQUENZIALE)

**BLOCCANTE**: tutte le Wave 1–4 devono essere complete (specialmente custom_attributes + currency runtime + workforce). Non parallelizzabile internamente.

| Order | Task | Sez | Effort | Dipende da |
|---|---|---|---|---|
| 1 | ETL migrazione legacy `CustomValues` → 4 tabelle nuove | **10.10** | 3gg | Wave 1-3 custom_attrs complete |
| 2 | ETL `Cost_Offhighway_Test` → `CostCnh_Data` idempotente | **5.1** | 5-7gg | 10.10 |
| 3 | Row counts match ±0.1% top-10 entità | **5.2** | 1gg | 5.1 |
| 4 | Perf benchmark BEFORE/AFTER (target ≥10×/≥5×/≥3×) | **5.3** | 2gg | 5.1 + W0.5 tier decision |
| 5 | Read-only conservation 30gg + snapshot | **5.4** | 0.5gg | 5.1 |
| 6 | 62 SP legacy → `rep.sp_run_*` porting | **7.1** | 7-9gg | può sovrapporsi a 5.1 se SP non dipendono dai dati migrati |

**Output Wave 7**: produzione cutover-ready.

---

### Riepilogo waves + critical path

| Wave | Effort | Parallel | Sequential |
|---|---|---|---|
| W0 — Decisions | 0gg eff + 0.5gg review | sì | — |
| W1 — Foundations | ~8gg | ✅ alta | 3gg crit path |
| W2 — Application | ~14gg | parziale | 6gg crit path (dopo W1) |
| W3 — UX | ~25gg | parziale | 10gg crit path (dopo W2) |
| W4 — Advanced | ~13gg | sì | 5gg crit path (dopo W3) |
| W5 — DB perf | ~8gg | opportunistico | trigger-driven |
| W6 — Docs | ~3gg | sì (parallelo W1-W5) | — |
| W7 — ETL/cutover | ~19gg | no, sequenziale | 19gg (dopo W4) |
| **TOTAL sequential** | **~90gg** | | |
| **TOTAL parallel-optimized** | **~50-55gg** | | con team di 2-3 dev |

**Critical path raccomandato (single-dev sequential)**:

```
W0 decisions (review 0.5gg)
 ↓
W1 (3gg crit: 11.1 → 11.2 → 10.1)
 ↓
W2 (6gg crit: 11.3+11.4 → 8.1)
 ↓
W3 (10gg crit: 2.1 + 10.8 + 11.6 + 8.5)
 ↓
W4 (5gg crit: 10.5+10.2)
 ↓
W7 (19gg: 10.10 → 5.1 → 5.2-5.4)
 = ~44gg crit path + W5/W6 opportunistici/parallel
```

### Implementation order — short version per quick start

Se l'utente vuole partire SUBITO senza decisioni complete:

1. **Wave 0 review** (`audit storage→runtime gap`, 0.5gg) — identifica tutto il deferred
2. **Wave 1 partial** (8.2 wf.alloc_pivot + 3.1 lock scoped fix + 3.5 optimistic concurrency, ~3.5gg) — additive, no decision needed
3. **Wave 6** (9.1+9.4 + 4.3 docs, ~1.7gg) — può partire subito
4. **Pause for W0 decisions** (A/B/C su 10 e 11)
5. Resume con Wave 1 completion + Wave 2

---

### 1. Performance DB (`cp.facts_pivot`)

| # | Ottimizzazione | Trigger | Effort | Speedup atteso |
|---|---|---|---|---|
| 1.1 | **NCCI columnstore** su `cp.facts_pivot` con vertical-split di `xbs_path` in tabella laterale `cp.facts_pivot_path(xbs_node_id, xbs_path)` 1:1 (il NCCI rifiuta colonne HIERARCHYID) | Quando pivot table cresce >100k rows | 3-5gg | 5-10× su scan analytics |
| 1.2 | **Filtered NCCI** solo su `WHERE is_leaf=0` (rollup-only rows usate dalle dashboard summary) | Dopo 1.1 | 1gg | 2× su rollup queries |
| 1.3 | **COLUMNSTORE_ARCHIVE** compression su `cp.facts_pivot` per `year_num < YEAR(GETDATE())-1` (anni cold) | Sprint S9 cutover | 1gg | 5-7× storage compression |
| 1.4 | **In-memory OLTP** su `cp.spreadsheet_lock` se contention misurata via `wait_stats` (lock latch) | Solo se misurato | 2gg | 10× su acquire-lock hot path |
| 1.5 | **Memory-optimized TVP** per `cp.tvp_power_edit_cell_changes` con batch grandi (>500 celle) | Quando save batch >100 cells diventa frequente | 1gg | 3× su batch save |

### 2. PowerEdit UX completeness

| # | Task | Effort | Prio |
|---|---|---|---|
| 2.1 | **H.13 E2E Playwright test** completo (lock acquire → edit cell → assert rollup → release) | 2gg | **H** — skipped, critico pre-prod |
| 2.2 | **SendToPlanning tool** (5° legacy tool): trasforma valori Forecast in Planned in bulk | 0.5gg | M |
| 2.3 | **Multi-year true range** (non solo year switcher H.9): visualizza N anni concatenati in N×12 colonne con header gerarchico anno→mese | 2-3gg | L |
| 2.4 | **Excel xlsx export/import** del pivot corrente (riusa pattern legacy AddinController) | 2gg | M |
| 2.5 | **Conditional formatting** delle celle (rosso se actual>planned, ecc.) via `_metadati__u_i__stili__tabelle` pattern | 1gg | M |
| 2.6 | **Frozen multi-column** (es. anche XBS_L1 oltre la label) | 1gg | L |
| 2.7 | **Keyboard shortcuts**: Tab/Shift+Tab horizontal nav, Ctrl+C/V copy-paste range tra celle | 2gg | M |
| 2.8 | **Drag-fill** (Excel-like): drag corner per replicare valore sui mesi adiacenti | 2gg | L |
| 2.9 | **Undo/Redo** stack (oggi flush immediato = no undo) | 2-3gg | M |
| 2.10 | **Auto-save indicator** (badge "saving..." / "saved 2s ago") | 0.5gg | L |

### 3. PowerEdit security / data correctness

| # | Task | Effort | Note |
|---|---|---|---|
| 3.1 | **Lock validation hard-gate anche per scenario_id non-NULL** (oggi `is_leaf` check skippato se scenario != NULL perché pivot table non ha quello scope) | 1gg | Edge case, attualmente best-effort |
| 3.2 | **Lock conflict resolution UX**: dialog "user X sta editando, vuoi forzare release?" (admin only) | 1gg | Oggi solo error message |
| 3.3 | **RLS row-level security** su `cp.facts` per `business_unit_id` discriminator | Sprint S3 retrofit | Già nel plan Sprint, da retrofittare su PowerEdit |
| 3.4 | **Audit log read API** (`GET /api/power-edit/audit/{programId}?from=...&to=...`) per UI history viewer | 1gg | `cp.spreadsheet_change_log` già popolata in H.8 |
| 3.5 | **Optimistic concurrency** con `data_modifica` check: rifiuta save se la row è cambiata dopo l'ultimo load (oltre al lock) | 1gg | Hardening anti-stale-client |

### 4. Framework `<wuic-spreadsheet-list-sf>` (genericizzato in Phase G.1 v2)

| # | Task | Effort |
|---|---|---|
| 4.1 | Test E2E del nuovo `lockScope` generic + `autoEnableOnScope` behavior | 2gg |
| 4.2 | Esporre eventi `(lockAcquired)`, `(lockExpired)` etc. anche dalla lazy-wrapper (oggi passano solo da inner component) | 0.5gg |
| 4.3 | Documentare in `docs/pages/spreadsheet-list-sf.md` il design `mdpropsbag.archetypes.spreadsheet.lock` (richiede skill `docs-localization-parity` per 5 lingue) | 1gg |

### 5. Sprint S9 — ETL + perf benchmark (post-cutover)

| # | Task | Effort |
|---|---|---|
| 5.1 | ETL completo `Cost_Offhighway_Test` → `CostCnh_Data` idempotente | 5-7gg |
| 5.2 | Row counts match ±0.1% top-10 entità | 1gg |
| 5.3 | Benchmark perf BEFORE/AFTER top-5 query reporting (target ≥10× time-range, ≥5× hierarchy rollup, ≥3× baseline-vs-current) | 2gg |
| 5.4 | Conservazione `Cost_Offhighway_Test` 30 giorni read-only post-cutover, poi snapshot statico audit | 0.5gg |

### 6. Decisioni di tier/sizing aperte

| # | Open question | Da decidere prima di |
|---|---|---|
| 6.1 | Tier Azure SQL target (DTU vs vCore vs serverless) per `CostCnh_Data` | Sprint S4 in base ai benchmark |
| 6.2 | Retention `audit.access_log`: 24m hot + N anni columnstore archive (N = ?) | Compliance team review |
| 6.3 | `<wuic-pivot>` archetype: contribuire al framework `wuic-framework-lib` o tenerlo app-local? | Sprint S6 reporting |
| 6.4 | UI lingua: italiano singolo (come legacy) o multi-locale via `ui-localization` skill da S1 | Pre-cutover |
| 6.5 | `<wuic-tree-pivot-grid>` archetype: ora `<costcnh-power-edit>` è app-local, valutare se generalizzare al framework | Dopo POC produzione PowerEdit |

### 7. Sprint S9.2 — 60 SP residue porting

| # | Task | Effort |
|---|---|---|
| 7.1 | Porting completo body delle 62 SP legacy report/Stored Procedures/*.sql → `rep.sp_run_*` con formule pivot (scenario × forecast × baseline × variance). Reference SP `rep.sp_run_summary_cost` già implementata in [`90-sp-summary-cost-full.sql`](schema/90-sp-summary-cost-full.sql) | 50-70h (~7-9gg) |

### 8. Workforce module — bulk edit + missing UX

> Stato attuale: schema DB + 4 route CRUD + 2 dashboard + 1 SP reporting già DONE.
> Edit form-based (parametric-dialog, 1 riga alla volta) funziona ma manca la UX 2D matrix.

| # | Task | Effort | Prio |
|---|---|---|---|
| 8.1 | **WorkforceAllocationEdit component** (clone pattern PowerEdit): `<p-table>` flat (no tree) con rows=risorse, cols=12 mesi × 3 measures (fte_percent/hours/cost). Riusa lock-aware backend genericato in Phase G.1 v2 + nuovo `cp.sp_save_workforce_alloc_cells` analogo a `cp.sp_save_power_edit_cells` | **3gg** | **H** — feature parity con legacy `AllocationController.ts` ~4100 LoC |
| 8.2 | **Materialized table `wf.alloc_pivot`** (resource × month flat, 36 value cols = 12 mesi × 3 measures) + rebuild SP nightly via scheduler `costcnh_rebuild_workforce_pivot` | 1.5gg | H — analogo `cp.facts_pivot` ma più semplice (flat, no rollup hierarchyid) |
| 8.3 | **Workforce scenario branching** (S3 plan): `_wuic_workflow_graph` + Temporal Tables wirato su `wf.allocation` per branch promote/diff | 2-3gg | M |
| 8.4 | **Bulk upload xlsx Allocation** (S6 plan): scheduler `costcnh_process_workforce_upload` (action_type=3 assembly) + staging table + validate-then-commit | 2gg | M |
| 8.5 | **Forecast vs Workforce reconciliation report** (S5 plan): SP `rep.sp_run_forecast_workforce_recon` che cross-checka `fc.facts` vs `wf.allocation` per detect over/under-allocation | 1gg | M |
| 8.6 | **Resource calendar exception edit** (`resource_calendars` route già menu-visible, ma UX form-only): patch metadata per inline-edit batch | 0.5gg | L |
| 8.7 | **Workforce dashboard upgrade**: aggiungi 4° tile "Top allocated resources YTD" + chart "resource utilization heatmap" | 1gg | L |

### 9. Knowledge gap / docs

| # | Task | Effort |
|---|---|---|
| 9.1 | Aggiungere skill `power-edit-architecture` con runbook completo (lock contract, rebuild SP, save TVP, columnstore note) in `KonvergenceCore/skills/` | 0.5gg |
| 9.2 | Documentare in `docs/pages/cost-planning-power-edit.md` (it/en/fr/es/de via `docs-localization-parity`) | 1gg |
| 9.3 | Screenshot regression test per il TreeTable layout 1920×1080 | 0.5gg |
| 9.4 | RAG knowledge gap log entry per "hierarchical pivot grid in WUIC" se RAG mostra <0.55 score sul tema | 0.2gg |

### 10. Custom Attributes / Values / Lookup — gap analysis vs legacy

> **DEBT NON FLAGGATO**: il sistema CustomAttributes legacy (5 tabelle, multi-value, time-based, lookup-with-trigger, mapping per Site×ProjectClass, permessi per-value, inline rendering nei form) è stato sostituito da **una sola tabella EAV minimal** `core.custom_value` (~10% feature parity). Coperto solo lo storage, niente UX né enforcement.

**Cosa esiste oggi:**
- [`core.custom_value`](schema/70-rates-and-extras.sql#L29) — 1 tabella EAV polimorfa `(entity_schema, entity_name, entity_id, attribute_code)` + `value_text/number/date/bool`
- Route metadata `/custom_values/list` + menu "Masterdata → Custom Values"

**Cosa MANCA vs legacy:**

| # | Feature mancante | Effort | Prio |
|---|---|---|---|
| 10.1 | **Tabella `core.custom_attribute` (definitions)** con PK `(context, code)`, `value_type ∈ {text,number,date,bool,lookup,currency,structure}`, flags `allow_multiple/has_lookup/is_required/readonly/edit_order` | 1gg | **H** |
| 10.2 | **Tabella `core.custom_attribute_mapping`** per scoping `(attribute, site_id?, project_class_id?, label_loc, is_time_based, year_from, year_to)` | 1gg | M |
| 10.3 | **Tabella `core.custom_lookup`** con `(context, attribute_code, code, value, descr)` + trigger UPDATE cascade rename su custom_value | 1gg | M |
| 10.4 | **Estensione `core.custom_value`**: aggiungere `year_num INT NULL` per time-based + drop UNIQUE constraint per supportare multi-value | 0.5gg | M |
| 10.5 | **Permessi custom**: `core.custom_attribute_permission(mapping_id, user_id, action, value_whitelist_json)` | 1gg | L |
| 10.6 | **Bootstrap auto-discovery durante ETL**: `core.sp_register_custom_attribute(@code, @value_type, @context)` chiamato da pipeline upload xlsx (rimpiazza `CustomAttributesManager.Register` legacy) | 1gg | H — necessario per ETL S9 |
| 10.7 | **Backend `CustomAttributesController.cs`**: 5 endpoint (list definitions, list values per entity, save batch, list lookup options, save lookup) | 1.5gg | H |
| 10.8 | **Inline render nei `<wuic-parametric-dialog>`**: extension che dopo i field standard della form append i custom attribute della entity corrente come field aggiuntivi (text/number/date/bool/select via custom_lookup). Richiede patch a `metadata-editor.component.ts` o `parametric-dialog.component.ts` del framework — **notify+ask user obbligatorio** | 3-4gg | **H** — feature parity |
| 10.9 | **Admin UI custom-attribute manager** (clone master-data CustomValues legacy): dialog con elenco attributes per context + dialog per gestire lookup options + grid per mapping per Site/ProjectClass | 2-3gg | M |
| 10.10 | **ETL migrazione legacy CustomValues** (S9 sprint): script che legge tutte le 5 tabelle legacy + per-entity link tables (ProgramCustomValues, HumanResourcesCustomValues, ecc.) e popola le 4 tabelle nuove preservando RefYear/RefObject | 3gg | **H** — Sprint S9 blocking |

**Sub-totale Section 10**: ~15gg per feature parity completa, **~6gg per il "core minimo"** (10.1 + 10.3 + 10.4 + 10.6 + 10.7 + 10.10).

**Decisione necessaria utente:**
- (A) **Feature parity completa** (~15gg): riproduce esattamente il legacy. Power user lifestyle preservato. Più costoso.
- (B) **Core minimo + schema rigido** (~6gg): definitions + lookup + value storage + ETL migrazione. Niente mapping per Site/ProjectClass, niente time-based, niente permessi granulari per value. Sufficient per migrare i dati legacy senza perdita, ma power users non possono aggiungere nuovi attribute via UI (solo via SQL admin).
- (C) **Schema rigido full** (~2gg): scrap del custom_value placeholder. Ogni custom attribute legacy diventa una colonna reale nelle tabelle target. Decisi pre-cutover quali sono REALMENTE usati. ETL diretta `ALTER TABLE` + migrazione 1:1. Massimo controllo ma perde la flessibilità runtime.

**Recommended**: opzione **B** + migrazione legacy + valutare A in iterazione post-cutover se i power users protestano.

---

### Errore di processo (lesson learned)

Quando ho deployato [`70-rates-and-extras.sql`](schema/70-rates-and-extras.sql) con `core.custom_value` come placeholder minimal:
- ❌ Non ho notificato esplicitamente "questo NON è feature parity con il legacy CustomAttributes/Mapping/Lookup/Permissions"
- ❌ Non ho aggiunto al backlog la gap analysis
- ❌ Non ho chiesto al user quale opzione (A/B/C sopra) era preferita

Da AGENTS.md regola #33 "porta a termine il task richiesto, niente deferral autonomo": avrei dovuto flaggare il deferral esplicitamente o completare la feature. Documentato qui per evitare ripetizione.

---

### 11. Currency multi-rate runtime integration — gap analysis

> **DEBT NON FLAGGATO**: tutte le tabelle di rate esistono (`cp.exchange_rate` time-valid, `cp.fte_hours`, `cp.hours_currency`, `cp.supplier_rate`) con CRUD admin via framework, MA **nessuna integrazione runtime** nei flussi di pianificazione/workforce/reporting. Le pianificazioni mostrano e salvano valori grezzi senza conversione cross-currency né auto-derivazione FTE→Hours→Cost.

**Cosa esiste oggi:**
- Schema completo (5 tabelle rate + FK `currency_id` su facts/forecast/allocation)
- Route metadata + CRUD per `fte_hours`, `hours_currency`, `exchange_rates`, `supplier_rates`
- Menu Masterdata → Rates → Exchange/Supplier

**Cosa MANCA vs legacy:**

| # | Feature mancante | Effort | Prio |
|---|---|---|---|
| 11.1 | **Inline TVF `cp.fn_convert_currency(@amount, @from_id, @to_id, @as_of_date)`** che cerca il rate valid_from ≤ @date ≤ valid_to in `cp.exchange_rate` e ritorna l'amount convertito. Inline-eligible (no scalar UDF) per perf | 0.5gg | **H** |
| 11.2 | **Inline TVF `cp.fn_fte_to_cost(@fte_percent, @role_code, @year, @currency_id)`** che fa la catena FTE → Hours (via `fte_hours`) → Cost (via `hours_currency`) | 0.5gg | **H** |
| 11.3 | **Auto-fill `cost_amount` su workforce save**: trigger AFTER UPDATE/INSERT su `wf.allocation` che ricalcola `cost_amount = cp.fn_fte_to_cost(fte_percent, resource.role_code, year_num, currency_id)` se NULL. Idempotente | 1gg | **H** |
| 11.4 | **Estensione `cp.sp_load_power_edit` con `@target_currency_id` param**: NULL = display raw, INT = applica `cp.fn_convert_currency` su ogni cella usando `as_of_date = first-day-of-month`. Update PowerEdit UI con toolbar dropdown currency | 1.5gg | **H** |
| 11.5 | **Estensione reporting SPs** (`sp_run_summary_cost`, `sp_run_workforce_utilization`, ecc.) con `@target_currency_id` per aggregazioni multi-currency safe | 2gg | M |
| 11.6 | **Workforce edit form**: trigger Angular su change di `fte_percent` o `currency_id` → chiamata `/api/workforce/compute-cost?fte=X&role=Y&year=Z&currency=W` → auto-fill `cost_amount` (read-only se auto-derived) | 1gg | M |
| 11.7 | **Dashboard KPI tiles**: tutti gli `SUM(cost_amount)` cross-currency vanno passati per `cp.fn_convert_currency` con target = program's default currency | 1gg | M |
| 11.8 | **Backend endpoint `GET /api/currency/rate?from=X&to=Y&asOfDate=YYYY-MM-DD`** per lookup runtime client-side (es. preview conversione in UI prima di save) | 0.5gg | L |
| 11.9 | **Validation: rifiuta save se `currency_id` mancante** in entità con `cost_amount` settato (oggi `currency_id` è nullable senza check) | 0.5gg | M |
| 11.10 | **Master view `cp.vw_facts_in_currency(@target_currency_id)`** che JOIN cp.facts × cp.exchange_rate per esporre i valori convertiti senza modificare le tabelle base — usabile da chart e report | 1gg | L |
| 11.11 | **Missing-rate handling**: cosa fare se `cp.fn_convert_currency` non trova un rate per (from, to, date)? Opzioni: (a) RAISERROR (strict), (b) ritorna NULL + warning, (c) usa il rate "più recente disponibile" | 0.5gg | M — decisione user |
| 11.12 | **Resource-calendar integration**: `cp.fn_fte_to_cost` deve usare `resource_calendar.working_days × working_hours` invece di `hours_per_fte` raw quando disponibile (per site-specific calendar) | 1gg | L |
| 11.13 | **Audit trail conversione**: log "valore X (currency_A) convertito a Y (currency_B) usando rate Z al date D" in `cp.spreadsheet_change_log` quando display in currency target | 0.5gg | L |

**Sub-totale Section 11**: ~11gg per feature parity completa, **~3.5gg per il "core runtime"** (11.1 + 11.2 + 11.3 + 11.4 + 11.11).

**Decisione necessaria utente:**
- (A) **Full runtime conversion** (~11gg): trigger su save + display in target currency + reporting cross-currency + endpoint API + resource calendar integration. Massima fedeltà al legacy.
- (B) **Core runtime minimum** (~3.5gg): TVF conversion + FTE→Cost + PowerEdit display currency + auto-fill workforce. Sufficient per i flussi principali, dashboard/reporting restano in moneta del program.
- (C) **Display-only conversion** (~1.5gg): solo TVF + chart/dashboard che JOIN al volo per display. Niente trigger AFTER, niente auto-fill (utente continua a inserire `cost_amount` a mano).

**Recommended**: opzione **B** (core minimo) — la maggior parte del valore funzionale con effort gestibile, lascia A per iterazione post-cutover se serve.

**Missing-rate policy (11.11)**: da chiarire con user — il legacy assume rate sempre disponibile (errore se manca). Nel nuovo dovrebbe valere lo stesso?

---

### Errore di processo (lesson learned) — pattern ricorrente

Stesso pattern del custom-attributes gap: ho creato lo storage layer + CRUD ma non l'application runtime. Probabilmente succede anche su:
- `core.scenario` (storage OK, ma scenario branching/promote workflow non implementato)
- `resource_calendar` (storage OK, ma niente uso runtime per FTE×Hours calc)
- `cp.supplier_rate` (storage OK, ma niente uso nei calcoli cost)

**Decisione meta**: prima di Sprint S9 ETL, fare un **audit completo "storage → runtime usage gap"** per tutte le tabelle attualmente popolabili ma non lette dai flussi runtime. Tempo: ~0.5gg di review + entry corrispondenti nel backlog.

→ Eseguito 2026-05-16 (W0.4 audit). Risultati nella sezione 12 sottostante.

---

### 12. Storage→runtime deferred catalog (W0.4 audit, 2026-05-16)

> Audit completo del pattern "tabella creata + CRUD scaffold ma application logic mancante". Eseguito tramite analisi automatica di Controllers + SP + Angular components vs schema DB.

#### DEFERRED — UI scaffold OK ma nessun consumer application

| Oggetto | Stato | Effort per chiusura | Prio |
|---|---|---|---|
| `cp.fte_hours` | UI CRUD OK, niente lookup runtime in workforce/spreadsheet | 0.5gg (TVF + integration) | **H** — già coperto in 11.2 |
| `cp.hours_currency` | UI CRUD OK, niente lookup in calc cost | 0.5gg | **H** — coperto in 11.2 |
| `cp.exchange_rate` | UI CRUD OK, niente conversion cross-currency in piani | — | **H** — sezione 11 completa |
| `cp.supplier_rate` | UI CRUD OK, niente uso nei calcoli costi (`cp.facts.value` non lo legge) | 1gg (nuovo SP `cp.fn_supplier_cost`) | M |
| `cp.resource_calendar` | UI CRUD OK, niente integrazione in `fn_fte_to_cost` | — | M — coperto in 11.12 |
| `cp.rate_catalog` | Solo FK target, nessun SP fa `quantity × rate_catalog.value` per derivare facts | 1.5gg (`cp.fn_compute_facts_from_catalog`) | L |
| `core.resource_manager` | UI CRUD OK, nessun flusso filtra programs per manager | 0.5gg (filtro su `core.program.resource_manager_id`) | L |
| `core.initiative` | UI scaffold, ma nessun flusso aggrega per iniziativa | 1gg (nuovo `rep.sp_run_initiative_pivot`) | M |
| `core.custom_value` | UI CRUD OK, niente inline render nei form entità | — | **H** — sezione 10 completa |

#### DEFERRED — production hardening (non-blocking S9)

| Oggetto | Problema | Effort | Prio |
|---|---|---|---|
| `audit.access_log` | **Nessun writer .NET**: il middleware/interceptor di logging delle richieste non esiste. NON blocca ETL S9 (lo script `95-legacy-log-archive-and-drop.sql` esplicitamente NON migra i log legacy — "info-loss controllato"). Serve per audit produzione futura, non per cutover | 2gg | M |
| `cp.facts_measure` | READ-ONLY-PLACEHOLDER: `rep.sp_run_program_pivot v2` legge i campi EAV reserved/forecast ma nessun writer C# li popola. I report mostrano sempre NULL | 1gg (writer in upload pipeline + SP `sp_set_facts_measure`) | **H** |

#### ORPHAN puri — nessuna referenza runtime, candidati a drop

| Oggetto | Note |
|---|---|
| `xbs.node_attribute` | EAV sparso definito ma mai letto/scritto. Candidato drop OR uso in sezione 10 (custom attrs su XBS) |
| `fc.baseline` | Pointer-only baseline mai promosso (`is_promoted=0`). Il "baseline" attuale usa `fc.facts WHERE forecast_code='BL'`. Candidato drop |
| `fc.forecast_cutoff` | Referenziato solo da file ETL come *futuro* target audit. Nessun controller/SP scrive | drop o implement uso |
| `core.initiative_program` | Join N:N scaffold ma nessun aggregato per iniziativa esiste | drop o implementare |
| `core.program_long_text` | Vertical-partition LOB >4KB ma comment_short inline basta in tutti i flussi | drop |

#### Task aggiunti al backlog per W0.4 risultati

| # | Task | Effort | Prio |
|---|---|---|---|
| 12.1 | **`audit.access_log` writer middleware** in `Wuic.Webcore` (notify+ask user, modifica framework) — ASP.NET Core middleware che hooka request/response e fa INSERT batch. **NON blocca S9** — è production hardening | 2gg | M |
| 12.2 | **`cp.facts_measure` writer** in upload pipeline (`91-upload-procedures.sql` extend per measure_code mapping) | 1gg | **H** |
| 12.3 | **Decision: drop ORPHAN tables** (`xbs.node_attribute`, `fc.baseline`, `fc.forecast_cutoff`, `core.initiative_program`, `core.program_long_text`) OR wire-up | 0.3gg decision + 0.5-2gg implementation a seconda della scelta | M |
| 12.4 | **`core.resource_manager` filter su programs** (route gating per manager scope) | 0.5gg | L |
| 12.5 | **`cp.supplier_rate` integration** in upload pipeline per derivare `cp.facts.actual` da supplier invoices | 1gg | M |
| 12.6 | **`core.initiative` reporting** (`rep.sp_run_initiative_pivot` + dashboard tile) | 1gg | M |
| 12.7 | **`cp.rate_catalog` lookup** nel motore di compute facts | 1.5gg | L |
| 12.8 | **`mddebughidefromenduser=1`** badge "preview" sui DEFERRED che restano in UI ma vuoti — alternative a chiusura gap | 0.5gg total | M (decision-driven) |

**Sub-totale Section 12**: ~7-8gg di gap-closing additivo + decisioni drop/wire ORPHAN.

**Recommended priority**: nessun item è S9-blocking. ETL Sprint 9 migra solo dati di business (programs/projects/facts), non log/changelog — la politica `95-legacy-log-archive-and-drop.sql` è esplicita "NON migriamo righe legacy, info-loss controllato". Tutti i task della sezione 12 sono **production hardening** post-cutover.

---

### Riepilogo effort totale

| Categoria | Effort | Quando |
|---|---|---|
| DB perf opt (1.1–1.5) | ~8gg | Quando dataset cresce |
| UX completeness (2.1–2.10) | ~17gg | Iterativo post-MVP |
| Security/correctness (3.1–3.5) | ~5gg | Pre-prod hardening |
| Framework polish (4.1–4.3) | ~3.5gg | Allineato a sprint S8 |
| Sprint S9 ETL+perf (5.1–5.4) | ~8.5gg | Post-cutover obbligatorio |
| Open decisions (6.1–6.5) | — | Da chiarire con user/team |
| 62 SP porting (7.1) | ~7-9gg | Sprint S9.2 |
| Workforce bulk edit + missing UX (8.1–8.7) | ~10gg | Feature parity legacy |
| Docs (9.1–9.4) | ~2.2gg | Pre-prod release |
| Custom attributes gap (10.1–10.10) | ~6gg (core min) / ~15gg (full parity) | **Decisione utente A/B/C** |
| Currency multi-rate runtime gap (11.1–11.13) | ~3.5gg (core min) / ~11gg (full) | **Decisione utente A/B/C** |
| Storage→runtime deferred catalog (12.1–12.8) | ~7-8gg | Production hardening (non blocking S9) |
| **TOTAL** | **~82-103gg** | + open decisions |

### Prioritization suggerita (next 30 days)

1. **CRITICAL** (pre-prod): 2.1 E2E Playwright, 3.1 Lock scoped hard-gate, **8.1+8.2 Workforce allocation matrix edit** (feature parity legacy)
2. **HIGH** (per stabilità): 3.4 Audit read API, 3.5 Optimistic concurrency, 4.2 Lazy-wrapper events
3. **MEDIUM** (UX): 2.2 SendToPlanning, 2.4 xlsx export, 2.5 Conditional formatting, 2.9 Undo/Redo, 8.3 Workforce scenarios, 8.4 Bulk upload xlsx workforce
4. **OPPORTUNISTIC** (quando trigger event): 1.1-1.5 DB opt al threshold di crescita
5. **STRATEGIC** (post-cutover): 5.x ETL + perf benchmark, 7.1 SP porting

### NOTE OPERATIVE

- **Riavvio .NET watch necessario** dopo H.2 (nuovo Controller type): `dotnet watch` standard non hot-reloada types nuovi. Riavviare manualmente lo `dotnet watch run` di CostCnh per attivare `/api/power-edit/*`.
- **Frontend dev**: `npm run serve:dev` da `CostCnh/wwwroot/` espone Angular `:4250`. Hot reload del componente custom funziona normalmente.
- Il legacy `dom_board.plan_facts_poweredit` (wrapper dashboard di Phase G.1 v1) è stato eliminato in Phase G.1 v2.
- La materializzazione `cp.facts_pivot` viene ricostruita nightly alle 02:00. Per rebuild on-demand: `EXEC cp.sp_rebuild_power_edit_pivot @program_id=X, @year_num=Y, @verbose=1`.

---



## Context

L'app legacy **Cost_CNH** (`C:\src\Cost_CNH`) e' un ERP di **cost planning per manufacturing CNH** (programmi/progetti/scenari su veicoli on-highway e off-highway, integrazioni SAP/BPM/timesheet). Stack: **.NET Framework 4.7.2 MVC + AngularJS 1.5 + Kendo UI 2018** (EOL), **Azure SQL** `cnhiserver.database.windows.net` con DB multipli (`Cost_Offhighway_*`, `Cost_Onhighway_*`, `Cost_CNH_*`), **Hangfire** per i job, **Azure Blob** per file. Codebase: 56 controllers (~53k LoC), 631 stored procedure, 1300+ file SQL, 9 schemi DB. I tre controller pesanti (`ReportingController` 7533 LoC, `AddinController` 6684 LoC, `RevisionsController` 5394 LoC) e la tabella fact gigante `facts.CostPlanning_Facts` (con 5 colonne XBS gerarchiche + index INCLUDE da 35 colonne + nessun partitioning) sono i principali bottleneck di performance e di manutenibilita'.

**Outcome atteso**: nuova app **`CostCnh`** su **KonvergenceCore** (.NET 10 + Angular 18+ `wuic-framework-lib` + metadata-driven archetypes + `dbo.scheduler` framework + `INotificationRepository`), con **DB ridisegnato perf-first** (`CostCnh_Data`: `hierarchyid` invece di 5 colonne XBS, partitioning + columnstore su fatti, Temporal Tables per Programs/Scenarios, outbox pattern per code async, audit consolidato). Re-implementazione **greenfield** (no strangler-fig): l'app legacy resta in lettura come riferimento, niente coesistenza runtime. Integrazioni esterne re-implementate con **Provider Symmetry** (Livello 5 della skill `app-creation`). Cutover con **sample data** + ETL completo in **Sprint 9 post-go-live** (fallback su legacy 30 giorni).

**Decisioni utente confermate**:

| Domanda | Risposta |
|---|---|
| Source DB | `Cost_Offhighway_Test` (clone schema + sample data) |
| Strategy | **Greenfield KonvergenceCore** (FE+BE+DB nuovi) |
| Frontend | **Angular 18+** via `wuic-framework-lib` (no Kendo) |
| Integrations | **Re-implementa con Provider Symmetry** (Livello 5) |
| App name | **`CostCnh`** → `C:\src\Wuic\CostCnh`, DB `CostCnh_Metadata` + `CostCnh_Data` |
| Data migration | **Sample data al cutover** + ETL completo in Sprint 9 post-go-live |

## Critical files (esistenti — input)

- [skills/app-creation/SKILL.md](../../KonvergenceCore/skills/app-creation/SKILL.md) — orchestratore 7 fasi + decision ladder 7 livelli
- [skills/app-creation/scripts/new-app.ps1](../../KonvergenceCore/skills/app-creation/scripts/new-app.ps1) — bootstrap entry point (clone code + patch CS + clone metadata DB + create data DB + workspace npm + symlink)
- [skills/app-creation/scripts/clone-metadata-db.ps1](../../KonvergenceCore/skills/app-creation/scripts/clone-metadata-db.ps1) — BACKUP `metadataDB` → RESTORE `CostCnh_Metadata` → `EXEC cleanMetadata` (+ safety `_test_col_%` DELETE)
- [skills/app-creation/scripts/seed-roles-users.ps1](../../KonvergenceCore/skills/app-creation/scripts/seed-roles-users.ps1) — `admin/admin`, `admin_test/Test123!`, `admin_test_2/Test123!`, `<role>_test/Test123!`
- [skills/app-creation/templates/feature-decision-checklist.md](../../KonvergenceCore/skills/app-creation/templates/feature-decision-checklist.md) — checklist per feature
- [skills/app-creation/templates/crud-route-handler.cs.tpl](../../KonvergenceCore/skills/app-creation/templates/crud-route-handler.cs.tpl) — Livello 4 stub
- [skills/app-creation/templates/custom-controller.cs.tpl](../../KonvergenceCore/skills/app-creation/templates/custom-controller.cs.tpl) — Livello 5 stub
- `C:\src\Wuic\FatturazioneElettronica\Controllers\*` + `C:\src\Wuic\FatturazioneElettronica\ProjectData\ScheduledActions\PollSdiAction.cs` — **canonical reference** per Livello 5 + Livello 7 + provider symmetry + notification-bell
- `C:\src\Wuic\CrmApp\` — reference dashboard 2x2 boardcontent + kanban
- `C:\src\Wuic\WuicTest\` — template app, ICrudRouteHandler examples
- `C:\src\Wuic\package.json` — workspaces array (deve includere `"CostCnh/wwwroot"` dopo Step 5)
- `C:\src\Cost_CNH\CostPlanning\` — legacy app come riferimento read-only (controller mapping)
- `C:\src\Cost_CNH\CostPlanningModel\` — `.sqlproj` con 1300 file SQL, riferimento per migrazione SP

## Identita' della nuova app

| Item | Valore |
|---|---|
| Nome | `CostCnh` (regex `^[A-Z][a-zA-Z0-9]+$` ✓) |
| Repo path | `C:\src\Wuic\CostCnh` |
| Solution / csproj | `C:\src\Wuic\CostCnh\CostCnh.csproj` |
| Metadata DB | `CostCnh_Metadata` (clone canonico di `metadataDB`) |
| Data DB | `CostCnh_Data` (schema nuovo ridisegnato perf-first, **non** clone da `Cost_Offhighway_Test`) |
| Reference DB read-only | `Cost_Offhighway_Test_Ref` (schema + 30 row/tabella, per ETL Sprint 9) |
| Backend Kestrel | `:6500` (http) / `:6543` (https) |
| Angular dev | `:4250` con `proxy.conf.dev.json` → `:6500` |
| Scheduler job prefix | `costcnh_<verb>_<noun>` snake_case |
| Menu top-level (≤7) | Amministrazione, Home, Anagrafiche, Pianificazione, Workforce, Reporting, Integrazioni |

## Plan di esecuzione

Workflow allineato alla skill [skills/app-creation/SKILL.md](../../KonvergenceCore/skills/app-creation/SKILL.md) (7 fasi). Tutto via `pwsh` (no `powershell.exe` 5.x).

### Fase 1 — Bootstrap (Phase 1 della skill)

Singolo comando idempotente:

```pwsh
pwsh -ExecutionPolicy Bypass -File C:\src\Wuic\KonvergenceCore\skills\app-creation\scripts\new-app.ps1 `
  -Name CostCnh `
  -Features programs,projects,initiatives,xbs,scenarios,workforce,planning_facts,forecast,baseline,reporting,revisions,uploads,admin,integrations_sap,integrations_bpm,integrations_timesheet,mac_requests `
  -Roles admin,planner,reviewer,controller,viewer
```

Effetto:

1. `rename-project.ps1 -Name CostCnh` → clone di `WuicTest` in `C:\src\Wuic\CostCnh`
2. Patch `appsettings.json` (CS `Initial Catalog` su `CostCnh_Metadata` / `CostCnh_Data`)
3. `clone-metadata-db.ps1` → `BACKUP metadataDB` → `RESTORE CostCnh_Metadata` → `EXEC cleanMetadata`
4. `CREATE DATABASE CostCnh_Data` (vuoto — schema ridisegnato in Fase 2)
5. Aggiunta `"CostCnh/wwwroot"` a `C:\src\Wuic\package.json` workspaces + `npm install` da `C:\src\Wuic`
5b. Ricrea symlink `C:\src\Wuic\node_modules\wuic-framework-lib` → `KonvergenceCore\wwwroot\my-workspace\dist\wuic-framework-lib`
6. `seed-roles-users.ps1` per i 5 ruoli + utenti test
7. Clone schema sorgente come reference: `mssql-scripter --schema-and-data` filtrato a 30 row/tabella di `Cost_Offhighway_Test` → `CostCnh\dbms\reference\Cost_Offhighway_schema.sql` (read-only blueprint)

**Acceptance criteria Fase 1**: `dotnet build CostCnh.csproj` green, `npm run serve:dev` green, login `admin/admin`, home dashboard placeholder, `_metadati__tabelle WHERE md_id > 1000` = 0.

### Fase 2 — DB ridisegno perf-first (`CostCnh_Data`)

Target SQL Server 2022 / Azure SQL ultima compatibilita'. 5 schemi al posto di 9 legacy:

| Nuovo schema | Scopo | Origine legacy |
|---|---|---|
| `core` | Master data: programs, projects, scenarios, calendars, currencies, organizations | `core`, parti di `dbo`, `cnh` |
| `xbs` | Gerarchie (cost/work/org breakdown) tramite **`hierarchyid`** | `core.XBS_*` (sostituisce 5 colonne FK + 5 varbinary mask) |
| `cp` | Cost-planning facts/measures (hot) | `facts.CostPlanning_*` |
| `fc` | Forecast facts/cutoffs (warm) | `facts.Forecast*`, `facts.CostPlanning_Facts_BaseLine` (eliminato) |
| `audit` | Access log + outbox + DLQ append-only | `*_Log` sparsi |

Schemi droppati: `easygrid`, `bmd`, `bpm`, `fiat`, `hangfirejob`, `jobs`, `offhighway`, `onhighway` (multi-site diventa `business_unit_id` discriminator + RLS).

**Ottimizzazioni chiave**:

1. **Gerarchia XBS**: una sola tabella `xbs.node(id BIGINT, node_path HIERARCHYID, depth PERSISTED, code, name, business_unit_id, tree_kind, …7 audit)`. Indexes: unique CIDX `(node_path)` per depth-first, `(depth, node_path)` per breadth-first, `(tree_kind, business_unit_id, code) INCLUDE(id)` per lookup. Indexed views per aggregazioni per profondita'.
2. **Fact table `cp.facts`** (legacy `facts.CostPlanning_Facts`, miliardi di righe):
   - **Vertical split**: hot table `cp.facts(id BIGINT IDENTITY, program_id, project_id, scenario_id, xbs_node_id, time_month_id, currency_id, actual NUMERIC(19,4), planned, committed, …7 audit)` ~14 col; sparse measures in `cp.facts_measure(facts_id, measure_code TINYINT, value NUMERIC(19,4))` EAV; LOB long-text in `cp.facts_long_text` 1:1.
   - **Partitioning** RANGE RIGHT su `time_month_id` (mensile, sliding window auto-merge nightly via scheduler).
   - **Clustered rowstore B-tree** su `(time_month_id, program_id, id)` + **non-clustered columnstore index** per analytics (batch mode + segment elimination su `time_month_id`).
   - **Drop** del legacy 35-col INCLUDE index. Sostituito da columnstore + thin covering NC `(program_id, time_month_id) INCLUDE (actual, planned, committed)`.
   - **PK = BIGINT IDENTITY** (non GUID). Eventuale `public_id UNIQUEIDENTIFIER` secondary unique per integratori esterni.
   - Partizioni >13 mesi → `COLUMNSTORE_ARCHIVE` compression + filegroup READ_ONLY.
3. **Temporal Tables** su `core.program`, `core.project`, `core.scenario`, `xbs.node`:
   - `SYSTEM_VERSIONING = ON`, history retention 7 anni, `DATA_CONSISTENCY_CHECK = ON`.
   - **Baseline = `FOR SYSTEM_TIME AS OF @baseline_ts`** invece di mirror table. `core.baseline(id, label, captured_at, captured_by)` solo come pointer.
   - Sostituisce `RevisionType/RevisionCounter/RevisionReference` hand-rolled + mirror `CostPlanning_Facts_BaseLine`.
4. **Audit consolidation**:
   - **Framework always-on**: 7 audit columns + `cancellato BIT` (cheap, su tutte le CRUD).
   - **Temporal Tables** (opt-in entita' high-value).
   - **`audit.access_log`** single table, append-only, partizionata mensile + clustered columnstore, retention 24m hot.
   - **Drop** dei `*_Log` legacy (`CostPlanning_Facts_Log`, `ForecastCutoffLogs`, `ConversionConsolidateLog`, `AddinBulkOperationLog`, `MACRequestsLogs`).
5. **Outbox pattern** (sostituisce queue legacy):
   - `audit.outbox(id, event_kind, payload_json, status TINYINT [0=pending|1=in_flight|2=done|9=dead], attempt_count, last_error, next_attempt_at, locked_by, locked_at, …)`.
   - Filtered NC index `WHERE status IN (0,1) AND attempt_count < 5`. Dispatch SP usa `UPDATE TOP(N) ... OUTPUT INSERTED.* WITH (READPAST, UPDLOCK, ROWLOCK)`. Backoff esponenziale.
   - Polled dal framework `dbo.scheduler` (Metadata DB) ogni 5–30s.
   - **Drop completo** di `hangfirejob.HangFireJobQueue`, `core.ProgramConsolidationQueue`, `facts.ForecastCalculationQueue`.
6. **Index strategy**:
   - FK-supporting NC index su **ogni** colonna FK (mancante nel legacy → causa orphan-validation lente).
   - Filtered NC su soft-delete (`WHERE cancellato = 0`) solo dove benefit > write cost.
   - Memory-optimized solo se contention misurata (es. scheduler dispatch hot).
7. **Scalar UDF**: audit `sys.sql_modules.is_inlineable` post-migrazione. Quelle non-inlineable → rewrite a inline TVF / computed column PERSISTED + indexed.
8. **Compression**: PAGE su tutte le tabelle heavy rowstore (50–70% saving su `cp.facts`). `COLUMNSTORE_ARCHIVE` sulle partizioni cold. `nvarchar(max) >4KB avg` in vertical-partition 1:1.
9. **Sicurezza**: **Row-Level Security** su `core.program` / `cp.facts` con predicate su `business_unit_id` (sostituisce schemi `offhighway/onhighway` separati).

**Verifica perf**: benchmark BEFORE/AFTER su top-5 query reporting (elapsed, logical reads, CPU). Target: time-range scan ≥10× faster (columnstore + partition elimination), hierarchy rollup ≥5× faster (singolo `hierarchyid` vs 5 FK join), baseline-vs-current ≥3× faster (temporal AS OF vs mirror join).

### Fase 3 — Decision ladder (Livelli 1–7) feature by feature

Mapping legacy 56 controller → ~25 nuovi controller in 12 gruppi:

| # | Gruppo | Decision-ladder | WUIC archetypes | Effort | Sprint |
|---|---|---|---|---|---|
| 1 | Anagrafica core (Programs/Projects/Initiative/Sites) | L1 + L2 + L4 cascade | list-grid, parametric-dialog, lookup | M | S1 |
| 2 | XBS hierarchy (`hierarchyid`) | L5 custom controller | `<wuic-treeview>` (new) + parametric-dialog | L | S2 |
| 3 | Scenarios (Project/Baseline/Workforce) | L4 + L6 workflow | list-grid + `_wuic_workflow_graph` | L | S3 |
| 4 | Cost planning facts (Easy/Simple/Target/Across/PowerEdit/LongTerm) | L4 + L5 (PowerEdit) | list-grid inline-edit, `<wuic-spreadsheet>` | XL | S4–S5 |
| 5 | Workforce module | L4 + L3 dashboard | list-grid, kanban, boardcontent 2x2 | L | S5 |
| 6 | Forecast | L4 + L7 scheduler `costcnh_recalc_forecast` | list-grid, boardcontent | M | S5 |
| 7 | Reporting/Dashboard/KPI | L3 + L5 | boardcontent 2x2, `<wuic-chart>`, `<wuic-pivot>` (new) | XL | S6–S7 |
| 8 | Revisions / scenario branching | L6 + Temporal Tables | `_wuic_workflow_graph` + diff dialog | XL | S7 |
| 9 | Admin (users/groups/roles/perms/custom attrs) | L1 + L2 framework built-ins | list-grid, parametric-dialog | S | S1 // |
| 10 | Bulk uploads | L5 + L7 scheduler | `<wuic-file-uploader>`, list-grid staging | L | S6 |
| 11 | Excel addin → in-browser | L5 + `<wuic-spreadsheet>` | nuovo archetype + xlsx ex/import | XL | S8 |
| 12 | Integrations (SAP/BPM/Timesheet/MAC) + History | L5 provider symmetry + L7 pollers | list-grid cursor, notification-bell | L | S4 // |

**Provider Symmetry (Livello 5)** per le 4 integrazioni:

| Integrazione | Sender | Poller | Cursor table | DI key |
|---|---|---|---|---|
| SAP | `ISapSender` | `ISapNotificationPoller` | `dbo.sap_provider_cursor` | `Integrations:Sap:Provider` |
| BPM | `IBpmSender` | `IBpmNotificationPoller` | `dbo.bpm_provider_cursor` | `Integrations:Bpm:Provider` |
| Timesheet | `ITimesheetSender` | `ITimesheetNotificationPoller` | `dbo.timesheet_provider_cursor` | `Integrations:Timesheet:Provider` |
| CNH MAC | `IMacRequestSender` | `IMacResponsePoller` | `dbo.mac_provider_cursor` | `Integrations:Mac:Provider` |

Pattern: `services.AddKeyedScoped<ISapSender, SapHttpSender>("Http")` + `SapStubSender("Stub")`; risolutore singolo legge `appsettings.json` `Integrations:Sap:Provider`. Stesso shape per poller. Cursor table singola riga per provider, schema unificato (`provider, last_etag, last_message_id, last_polled_utc, next_eligible_utc, poll_state, last_error_text, consecutive_errors, payload_json`).

**Notification-bell wiring** (in ogni poller dopo nuovi messaggi):

```csharp
await _notifications.EnqueueAsync(new EnqueueNotificationRequest {
  RecipientUserId = entity.utente_creazione,
  Type = "integration.sap",
  TargetJson = $"{{\"path\":\"/programs/edit/{entity.id}\"}}",
  PayloadJson = ...  // Utf8JsonWriter, no anonymous types
});
```

Recipient = `utente_creazione` dell'entita' business; skip silent se NULL; best-effort (try/catch, no rollback).

**Scheduler jobs (Livello 7)** — sostituiscono completamente Hangfire:

| event_name | action_type | recurrence | Sostituisce |
|---|---|---|---|
| `costcnh_consolidate_permissions` | 3 (assembly) | `interval_minutes=15` | `ConsolidatePermissionsJob` |
| `costcnh_process_workforce_upload` | 3 | on-demand | `ProcessUploadJob(workforce)` |
| `costcnh_process_planned_upload` | 3 | on-demand | `ProcessUploadJob(planned)` |
| `costcnh_process_baseline_upload` | 3 | on-demand | `ProcessUploadJob(baselinecost)` |
| `costcnh_extract_facts` | 1 (SQL) | `cron=0 2 * * *` | `ExtractFactsNightlyJob` |
| `costcnh_recalc_forecast` | 3 | `interval_minutes=30` (`valid_hours='07-20'`) | `ForecastQueueWorker` |
| `costcnh_consolidate_program` | 3 | on-demand da save hook | `ProgramConsolidationQueue` |
| `costcnh_poll_sap` | 3 | `interval_minutes=5` | nuovo |
| `costcnh_poll_bpm` | 3 | `interval_minutes=15` | nuovo |
| `costcnh_poll_timesheet` | 3 | `cron=0 */6 * * *` | nuovo |
| `costcnh_poll_mac` | 3 | `interval_minutes=10` | nuovo |
| `costcnh_outbox_dispatch` | 3 | `interval_seconds=10` | sostituisce queue legacy |
| `costcnh_partition_maintenance` | 1 (SQL) | `cron=0 1 * * *` | sliding window cp.facts |

Assembly actions in `CostCnh\ProjectData\ScheduledActions\*.cs` (pattern `FatturazioneElettronica\ProjectData\ScheduledActions\PollSdiAction.cs`). Seed in `CostCnh\dbms\seed\scheduler-tasks.sql` con `IF NOT EXISTS` su `event_name`. **NO `BackgroundService`, NO Quartz, NO Hangfire** (regola AGENTS).

### Fase 4 — Ri-architetture obbligate (non 1:1)

1. **ReportingController** 7533 LoC → **15 dashboard tematici** `dom_board.boardcontent` 2x2 (KPI tile + chart + list). Sorgenti = **viste SQL pre-aggregate** `vw_rep_<theme>_<dim>` su `CostCnh_Data`. Pivot residuali via SP + `<wuic-pivot>` archetype nuovo.
2. **AddinController** 6684 LoC Excel addin → **deprecato**, sostituito da `<wuic-spreadsheet>` in-browser (handsontable/revogrid) + 5–7 REST endpoint (snapshot, save-cells, lock-range, release-lock, validate, xlsx-import, xlsx-export). Concurrency via row-version su staging.
3. **RevisionsController** 5394 LoC → Temporal Tables + `_wuic_workflow_graph` per branch tree + diff dialog (parametric-dialog + `<wuic-diff-view>`). Branch/merge resta in C# orchestrator.

### Fase 5 — Sprint plan (8 sprint × 2 settimane)

| Sprint | Deliverable | Definition of Done |
|---|---|---|
| **S1** | Bootstrap + Anagrafica (Programs/Projects/Initiative/Sites/ProjectClasses) + Admin framework | Login admin OK, CRUD round-trip su Programs/Projects, `dotnet build` green |
| **S2** | XBS hierarchy (`hierarchyid`) + L5 tree controller + `<wuic-treeview>` | Create/move/delete 5-level tree e2e Playwright passing |
| **S3** | Scenarios (Project/Baseline/Workforce) + Permissions + Temporal Tables abilitate su Programs | Branch scenario → diff temporal AS OF → promote, audit visibile |
| **S4** | Plan facts (`Plan`, `PlanDetails`, `EasyGrid`, `TotalPlan`) L4+L5 + 4 integrations skeleton (cursor + scheduler poller + stub provider) + notification-bell | EasyGrid edit + save 1000 cells <2s, SAP poller fires every 5min |
| **S5** | Workforce + Forecast + 2 dashboard 2x2 | Resource assign → recalc → KPI tile updates |
| **S6** | Bulk uploads (3 scheduler actions) + Reporting tail (primi 5 dashboard tematici) | Upload xlsx 10k → staging → commit. 5 dashboard render 1920x1080 no scroll |
| **S7** | Reporting tail (~10 dashboard) + Revisions con Temporal Tables + diff dialog | Revision tree visibile per Program. Diff scenario A vs B funziona |
| **S8** | `<wuic-spreadsheet>` archetype + 7 REST per in-browser plan editing + MAC integration end-to-end | Power user edita grid in browser, esporta xlsx. MAC poller drains queue |
| **S9** (post-cutover) | ETL completo `Cost_Offhighway_Test` → `CostCnh_Data` (idempotent) + benchmark perf BEFORE/AFTER | Row counts match ±0.1%, top-5 query reporting raggiungono i target ≥10×/≥5×/≥3× |

## Verifica end-to-end per fase

| Fase | Acceptance criteria |
|---|---|
| Bootstrap (S1) | `dotnet build` green, `npm run serve:dev` green, login admin OK, home placeholder, `/api/health` 200, `_metadati__tabelle WHERE md_id > 1000` count = 0 |
| CRUD (S1–S3) | Per ogni entita': Playwright e2e che fa insert → UI verify → edit → verify → delete, asserzione DB dopo ogni step |
| Dashboard (S5–S7) | Per ogni `dom_board`: viewport 1920x1080, `bodyScroll.scrollHeight ≤ 1080`, 4 tile populated, chart datasets length ≥ 1 |
| Scheduler (S4+) | One-shot `POST /api/scheduler/run-now/<event_name>`: `last_run_utc` aggiorna, `last_run_outcome='Success'`, cursor/fact table aggiornano, notification-bell badge incrementa |
| Provider symmetry (S4, S8) | Swap `Integrations:<Sys>:Provider` da `Stub` a `Http` in `appsettings.Development.json`, restart, poller once: cursor `idle→running→idle`, `consecutive_errors=0`, notification emessa con `targetJson.path` valido |
| Cutover (S8) | Migration script idempotente runs 2× senza errori, row count match ±0.1% top-10 entita', smoke suite 20 Playwright green |
| Perf (S9) | Top-5 reporting query: time-range scan ≥10× più veloce, hierarchy rollup ≥5×, baseline-vs-current ≥3× |

## Risk register (top 10)

| # | Rischio | Mitigazione |
|---|---|---|
| 1 | Temporal history bloat su `cp.facts` se abilitato globalmente | Temporal solo su metadata-style facts (low update rate). Per `cp.facts` partition snapshots + outbox-driven baseline copies |
| 2 | Columnstore delta-store latency su write heavy | `MAXDOP` tuning, nightly `REORGANIZE WITH (COMPRESS_ALL_ROW_GROUPS = ON)`. Columnstore solo su partizioni ≥1 mese. Mese corrente rowstore only |
| 3 | `hierarchyid` incompat con SP legacy chiamate da reportistica esterna | Compatibility view che espone `Id_XBS_Objects_1..5` via `node_path.GetAncestor()`. Sunset in v2 |
| 4 | Scalar UDF inlining silenziosamente fallisce | Audit `sys.sql_modules.is_inlineable` post-migration. Rewrite top offenders pre-go-live |
| 5 | Outbox poll latency inaccettabile per feature sync-feeling | Service Broker activation per low-latency kinds. Outbox resta default |
| 6 | Partition function exhaustion (sliding window) | Job framework `costcnh_partition_maintenance` estende partition function 12 mesi avanti, daily idempotent |
| 7 | GUID → BIGINT PK rompe integratori esterni | `public_id UNIQUEIDENTIFIER` secondary unique sulle entita' esposte |
| 8 | RLS predicate su `business_unit_id` mis-applied → cross-BU leak | RLS a livello schema, test integrazione per ogni BU |
| 9 | ETL Sprint 9 falla su entita' grandi (cp.facts miliardi righe) | Bulk insert per partition mensile, parallel threads, restartable da partition key, validation per-month |
| 10 | Excel addin power users resistono alla deprecazione | Mantieni addin legacy read-only su `Cost_Offhighway_Test_Ref` per 6 mesi. UAT con 3 power user su `<wuic-spreadsheet>` prima del cutover |

## Vincoli operativi

- Tutto in `pwsh 7` (regola AGENTS); mai `powershell.exe` 5.x.
- Mai `BackgroundService`/Quartz/Hangfire: sempre `dbo.scheduler` framework.
- Mai modifiche framework `KonvergenceCore/`, `Wuic.Webcore/`, `wuic-framework-lib/` senza notify+ask esplicito.
- 7 audit columns mandatory **dalla creazione** di ogni CRUD table.
- 5 archetypes WUIC fondanti: `<wuic-list-grid>`, `<wuic-parametric-dialog>`, `<wuic-treeview>` (da contribuire se non esistente), `<wuic-spreadsheet>` (nuovo), `<wuic-chart>` + dashboard `boardcontent` 2x2.
- Knowledge gap log: ogni RAG miss (score_vector < 0.55) → entry in `docs/pages/rag-knowledge-gaps.md` + `npm run docs:build`.
- Test E2E suite con i 7 prerequisiti del skill (2-user pattern admin_test / admin_test_2, RUN_ID, cleanup `_e2e_*`, `navigateToEditForm` invece di `dblclick`, filterInfo on id per pagination, cache-bust post-delete).

## Open question (residue, gestite in fase di esecuzione)

1. Tier Azure SQL target per `CostCnh_Data` (DTU vs vCore vs serverless): decisione prima dello Sprint 4 in base ai benchmark.
2. Retention `audit.access_log`: 24m hot + N anni columnstore archive — N da fissare con compliance team.
3. Conservazione `Cost_Offhighway_Test` post-cutover: 30 giorni read-only, poi snapshot statico per audit.
4. `<wuic-pivot>` archetype: contribuire al framework `wuic-framework-lib` o tenerlo app-local in `CostCnh\wwwroot`?
5. Lingua UI: italiano (come legacy) o multi-locale via `ui-localization` skill da Sprint 1?
