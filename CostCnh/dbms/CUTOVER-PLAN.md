# CostCnh — Cutover Plan (Sprint 9)

## Overview

Migrazione da `Cost_Offhighway_Test` (Azure SQL legacy schema) a
`CostCnh_Data` (nuovo schema perf-first). Cutover **greenfield** con sample
data al go-live + ETL completo eseguito in Sprint 9 post-cutover. Fallback
su legacy 30 giorni (Cost_Offhighway_Test rimane read-only).

## Stato pre-cutover (Sprint 1-8 already done)

| Area | Stato |
|---|---|
| Schema CostCnh_Data | ✅ 5 schemi (core/xbs/cp/fc/audit) + 3 supporting (integrations/wf/uploads/rep/mac) — 60+ tabelle |
| Metadata CostCnh_Metadata | ✅ ~50 route registrate + ~50 menu entries + custom actions + lookup + cascading |
| Scheduler | ✅ 6 task in dbo.scheduler (outbox_dispatch 30s, partition_maintenance daily, 4 integration pollers) |
| Outbox + Notifications | ✅ atomic claim/complete/fail, INotificationRepository.EnqueueAsync, exponential backoff |
| Background reports | ✅ 7 report (PROGRAM_PIVOT, SUMMARY_COST, MONTHLY_STATUS, SITE_PLANNING, OVERALL_STATUS, WORST_PLANNING_PROJECTS, FTE_REPORT) con params via parametric-dialog |
| Temporal viewer | ✅ history views per programs/projects/xbs.node |
| Integrations | ✅ Provider Symmetry (SAP/BPM/Timesheet/MAC) Stub+Http keyed DI |
| Upload pipeline | ✅ md_action_type=10 framework + 3 SP staging→target |

## Cutover checklist (Sprint 9)

### Pre-cutover (T-7 giorni)

- [ ] Backup completo `Cost_Offhighway_Test` (full + log)
- [ ] Snapshot dimensione DB legacy: tabelle, row counts, indici, size_mb
- [ ] Smoke test top-20 query reporting su CostCnh_Data con sample seeded
- [ ] Disabilita `costcnh_poll_*` integration scheduler tasks (`enabled=0`) per evitare polling SAP/BPM/Timesheet/MAC durante cutover
- [ ] Comunica freeze: nessun INSERT/UPDATE su Cost_Offhighway_Test durante cutover

### Migration execution (T-0)

Eseguire script `scripts/sprint9-etl.ps1` (vedi sotto) che fa:

1. **Anagrafica master** (in dependency order):
   - `core.site` ← `core.Sites` (legacy)
   - `core.currency` ← `core.Currencies`
   - `core.program_status` ← `core.ProgramStatuses`
   - `core.project_class` ← `core.ProjectClasses`
   - `core.project_scenario` ← `core.ProjectScenarios`
   - `core.program` ← `core.Programs` (con remap di Id_XBS_Objects_* → xbs_node_id via lookup)
   - `core.project` ← `core.Projects`
   - `core.initiative` ← `core.Initiatives`
   - `core.dim_time` ← `facts.Dim_Time`

2. **XBS hierarchy** (1 sola tabella xbs.node sostituisce 5+5 colonne legacy):
   - Per ogni `core.XBS_Objects` legacy:
     - Calcola `node_path` (HIERARCHYID) come `/Id_XBS_Objects_1/Id_XBS_Objects_2/.../`
     - INSERT in `xbs.node` con `tree_kind_id` derivato da business_unit + scopo

3. **Cost planning facts** (BIGGEST — può essere miliardi righe):
   - Partition-by-partition (1 mese alla volta) per non saturare log
   - BULK INSERT con `TABLOCK` + `WITH (DATA_COMPRESSION = PAGE)`
   - Resolve 5 colonne XBS legacy → 1 sola `xbs_node_id` via lookup
   - Vertical split: hot table cp.facts (14 col), sparse measures → cp.facts_measure
   - Parallel insert per programma (8 threads suggeriti)

4. **Forecast** (`facts.ForecastCutoffs`, `facts.Forecast*` → `fc.facts` + `fc.forecast_cutoff`)

5. **Workforce** (`workforce.Resources`, `workforce.Allocations` → `wf.resource`, `wf.allocation`)

6. **Reports catalog**: `core.Report` + `core.ReportFilter` → `rep.report_definition` + `rep.params_*` rows
   (mantieni codes invariati per UI continuity)

7. **Audit log archive**: i `*_Log` legacy (CostPlanning_Facts_Log, ForecastCutoffLogs, ConversionConsolidateLog, AddinBulkOperationLog, MACRequestsLogs) NON migrati: archiviati in `Cost_Offhighway_Test` read-only per 6 mesi compliance.

8. **MAC requests**: `core.MAC_Requests` → `mac.request` + `mac.response` (split per direction)

### Validation (T+0 a T+24h)

- [ ] Row counts cross-check: ogni source.table → target.table conta righe ±0.1%
- [ ] Top-10 query reporting eseguite su legacy + su CostCnh_Data → output deve matchare
- [ ] Spot-check 100 random `cp.facts` rows: legacy 5-col XBS vs nuovo `xbs_node_id`
- [ ] Smoke test E2E Playwright (10 scenari critici): login, planning grid, report generation, MAC submit
- [ ] Verifica framework scheduler ticks: `costcnh_outbox_dispatch`, `costcnh_partition_maintenance` runnano OK
- [ ] Re-enable `costcnh_poll_*` solo dopo che integrazioni SAP/BPM hanno confermato bridge funzionante

### Rollback plan

Se T+24h validation fail su >5% di row count o smoke E2E rosso:

1. Disable `costcnh_outbox_dispatch` scheduler (no piu' write su CostCnh_Data)
2. DNS/routing back a legacy app `Cost_Offhighway` (lasciata online read-only durante cutover)
3. Drop & recreate CostCnh_Data partition by partition
4. Plan re-cutover dopo fix root cause
5. Cost_Offhighway_Test rimane operativo 30 giorni come canonical source

## Performance benchmark (post-cutover)

Eseguire `scripts/sprint9-perf-benchmark.ps1`:

| Query | Legacy elapsed | CostCnh elapsed | Speedup target |
|---|---|---|---|
| Time-range scan 1 anno (cp.facts) | ? ms | ? ms | ≥10× (columnstore + partition elim.) |
| Hierarchy rollup (XBS) | ? ms | ? ms | ≥5× (hierarchyid vs 5-FK join) |
| Baseline vs current (Temporal) | ? ms | ? ms | ≥3× (AS OF vs mirror table join) |
| Forecast recalc | ? ms | ? ms | ≥2× (partitioned NC indexes) |
| Top-50 dashboard load | ? ms | ? ms | ≥2× (boardcontent pre-rendered + cached) |

Output: `cutover-results/benchmark-<date>.md` con before/after.

## Outstanding tasks per Sprint 9

| # | Task | Owner | Notes |
|---|---|---|---|
| 1 | ETL completo Cost_Offhighway_Test → CostCnh_Data (idempotent, restartable) | DBA | scripts/sprint9-etl.ps1 |
| 2 | Porting 62 SP legacy report → rep.sp_run_* nuove (full body, non solo skeleton) | dev | report/Stored Procedures/*.sql |
| 3 | Benchmark perf BEFORE/AFTER su top-5 query | dev | scripts/sprint9-perf-benchmark.ps1 |
| 4 | `<wuic-spreadsheet>` Angular archetype (full Excel-like) | framework dev | Richiede commit framework wuic-framework-lib |
| 5 | Audit consolidation: rimozione `*_Log` legacy dopo verifica 24h | DBA | post-cutover |
| 6 | Switch integration scheduler `enabled=1` per SAP/BPM/Timesheet/MAC dopo verifica bridges | ops | T+48h |
| 7 | Documentazione utente: cambio terminologia "Revision" → "Versione (Temporal)" | tech writer | tabella legacy/nuovo concept mapping |

## Note operative

- **`<wuic-spreadsheet>` full**: scope esteso fuori Sprint 8. La spreadsheet-light attuale (mdinlineedit=1 su /plan_facts) copre 70% degli use case PowerEdit. Per copy/paste multi-cell, formule, virtualization → archetype Angular dedicato (handsontable o revogrid).
- **Integration providers** in produzione: switch da `Stub` a `Http` in `appsettings.json` per ogni `Integrations:<Sys>:Provider`. Verificare baseUrl + auth-strategy specifica.
- **Hangfire elimination**: il legacy aveva `hangfirejob.HangFireJobQueue`. CostCnh usa SOLO `dbo.scheduler` framework. Decommissionare il pool Hangfire post-cutover.
