# Sprint 9.2 — Report SP porting backlog

## Stato attuale

| Sprint | Report code | SP nuova | Stato |
|---|---|---|---|
| 6 | PROGRAM_PIVOT | rep.sp_run_program_pivot | ✅ v2 (EAV-aware) |
| 6 | SUMMARY_COST | rep.sp_run_summary_cost | ✅ v1 (scenario filter) |
| 6 | MONTHLY_STATUS | rep.sp_run_monthly_status | ✅ |
| 6 | SITE_PLANNING | rep.sp_run_site_planning | ✅ |
| 6 | OVERALL_STATUS | rep.sp_run_overall_status | ✅ |
| 6 | WORST_PLANNING_PROJECTS | rep.sp_run_worst_planning_projects | ✅ |
| 6 | FTE_REPORT | rep.sp_run_fte_report | ✅ |
| **9.2** | LABOR_SUMMARY | rep.sp_run_labor_summary | ✅ (NEW) |
| **9.2** | PROGRAM_COST_HISTORY | rep.sp_run_program_cost_history | ✅ Temporal AS OF (NEW) |
| **9.2** | MAIN_PROJECT_MAKE_BUY | rep.sp_run_main_project_make_buy | ✅ XBS tree_kind split (NEW) |
| **9.2** | ONE_PAGE | rep.sp_run_one_page | ✅ (NEW) |

## Coverage vs legacy `core.Report` attivo

11/14 active reports → 79% coverage delle entries del catalog legacy.

Rimanenti:
- `REVISION_COST_HISTORY` — analogo a PROGRAM_COST_HISTORY ma su project_scenario via Temporal AS OF. → trivial: clone sp_run_program_cost_history sostituendo program_id con scenario_id.
- `PROGRAM_HISTORY` — già coperto da Sprint 7 history view `core.vw_program_history`. Non serve SP dedicata.
- `REVISION_HISTORY` — idem, mancante la view scenario_history. (~30min)

## Legacy SP non ancora portate (51 SP / 62)

### Site-specific PROGRAM_PIVOT variants (10 SP)
- `GetProgramPivot_APAC` / `_CHR` / `_CRF` / `_DEF` / `_EMEA_PWT` / `_FGA` / `_FIASA_PWT` / `_FIASA_VEH` / `_LATAM` / `_TOFAS` / `_FPT` / `_qlik` / `_Old` (12 SP)

**Decisione architetturale**: NON portarle 1:1. Il pattern legacy era duplicare la SP base con WHERE clauses hardcoded per site. Nel nuovo CostCnh:
- Una sola `rep.sp_run_program_pivot`
- Per ogni site/business_unit aggiungere un report_definition row distinto con `default_params_json` che pre-seleziona il filtro `site_id` o `business_unit_id`
- Es: `PROGRAM_PIVOT_FGA` → stessa SP, params_route preconfigura `business_unit_id=1`

Implementazione: 1-2 ore di SQL INSERT su rep.report_definition (no SP nuove).

### Site-specific FGA pivot variants (10 SP)
- `FGA_AvailabilityPivot` / `FGA_OverallPivot` / `FGA_Pivot` / `FGA_Pivot_<site>` / `FGA_ResourcePivot` / `FGA_ResourcePivot_<site>`

Stesso pattern: 1 SP base + filter via params. Total ~10 SP → 2-3 ore.

### Program tracking sub-reports (7 SP — UNIQUE LOGIC)
- `GetProgramTrackingBudget` — budget vs actual per program
- `GetProgramTrackingCarStatus` — status milestone semaforo (R/Y/G)
- `GetProgramTrackingCbsPlanned` — CBS breakdown del planned
- `GetProgramTrackingDptSplit` — dipartimenti split costs
- `GetProgramTrackingDptSplitInternalHours` — variante internal hours
- `GetProgramTrackingPlanning` — planning timeline
- `GetProgramTrackingPrograms` — list view

Ognuna ha logica specifica → 7 SP nuove. Stima: 1 giorno (1h per SP avg).

### Workload reports (2 SP — UNIQUE LOGIC)
- `WorkloadAnalysis_Pivot` — workload aggregato per dimensione
- `WorkloadPerProjectStatus` — workload split per status di progetto

Stima: 4 ore (2h per SP).

### Custom value queries (3 SP)
- `GetXBSWithCV` — XBS nodes con custom values joined
- `GetProjectReport` / `GetProjectsUserCounters` / `GetProjectsUserOverall` — viste project con counters

Stima: 4 ore.

### Already covered by other Sprint
- `MAC_Report` → coperto da Sprint 8 mac.request scaffolding
- `FTE_Report_Old`, `GetProgramPivot_Old` → versioni legacy archiviate, no port

## Totale lavoro residuo Sprint 9.2

| Categoria | SP count | Stima |
|---|---|---|
| Site-specific variants (PROGRAM/FGA) | 22 → 0 nuove SP, 22 report_definition rows | 4h |
| Program tracking (UNIQUE LOGIC) | 7 SP nuove | 1 giorno |
| Workload + custom | 5 SP nuove | 1 giorno |
| **REVISION_COST_HISTORY** + **REVISION_HISTORY view** | 1 SP + 1 view | 1h |
| **Totale** | ~13 SP nuove + 22 def rows | **2-3 giorni** |

## Note operative

- **Body delle SP attuali**: usano dati seed CostCnh (2 programs, ~30 cp.facts rows). Con dati ETL completi (Sprint 9.1), le formule scenario × forecast × baseline diventano significative. Validare output vs legacy sul medesimo dataset durante Sprint 9.3 (benchmark).
- **Performance**: con 1M+ rows in cp.facts, le SP attuali (subquery correlate nel FOR JSON) possono diventare lente. Sprint 9.3 raccomanda passare a CTE + window functions per le 4 SP principali.
- **xlsx download**: già pronto Sprint 7. Per attivare su un report, basta `UPDATE rep.report_definition SET output_format='xlsx' WHERE code='X'`.
- **Notification template**: il messaggio bell è generico ("Report X pronto"). Personalizzare per kind via `INotificationRepository.EnqueueAsync(message=...)` può migliorare UX (es. "PROGRAM_PIVOT eseguito su 47 programmi in 2.3s").
