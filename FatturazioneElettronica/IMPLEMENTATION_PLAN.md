# FatturazioneElettronica — Implementation Plan

> Living plan delle feature applicative. Aggiornare quando si chiude o si aggiunge una feature. Numerazione coerente coi test e2e in [`playwright/tests/`](playwright/tests/).

Ultimo update: **2026-05-06**

---

## 🟢 Block 3 — UX / produttività (utili) — DONE

| # | Feature | Test | File chiave |
|---|---|---|---|
| **#12** | Search globale cross-route (FAB header + Ctrl+K palette) | [test 19](playwright/tests/19-global-search.mjs) ✅ | [global-search.component.ts](wwwroot/src/app/component/global-search/global-search.component.ts), [SearchController.cs](Controllers/SearchController.cs), [15_sp_global_search.sql](dbms/schema/15_sp_global_search.sql) |
| **#13** | Anteprima PDF fattura (row action "PDF" + FatturaPrintComponent) | [test 20](playwright/tests/20-anteprima-pdf-fattura.mjs) ✅ | [fattura-print.component.ts](wwwroot/src/app/component/fattura-print/fattura-print.component.ts) |
| **#14** | Bulk "Marca pagate" multi-select su scadenze (toolbar table action) | [test 21](playwright/tests/21-bulk-marca-pagate.mjs) ✅ | [ScadenzeController.cs](Controllers/ScadenzeController.cs), [16_sp_marca_scadenze_pagate.sql](dbms/schema/16_sp_marca_scadenze_pagate.sql) |
| **#15** | Dashboard widget configurabili per utente (`dom_board_user_pref`) | [test 22 API](playwright/tests/22-board-pref-user.mjs) ✅ + [test 23 UI](playwright/tests/23-board-pref-ui.mjs) ✅ | [board-pref.component.ts](wwwroot/src/app/component/board-pref/board-pref.component.ts), [BoardPrefController.cs](Controllers/BoardPrefController.cs), [17_dom_board_user_pref.sql](dbms/schema/17_dom_board_user_pref.sql) |
| **#16** | Quick-create modal (Alt+N + button "+") | [test 24](playwright/tests/24-quick-create.mjs) ✅ | [quick-create.component.ts](wwwroot/src/app/component/quick-create/quick-create.component.ts) |

> NB sul #14: implementata **solo** la parte "Marca pagate". La sotto-feature "Bulk invia SDI multi-fattura" è stata **separata e spostata in carryover come #29** (vedi sotto).

---

## ⭐ Bonus features — fuori-scope ma già consegnate

Queste tre feature sono nate da una mia errata interpretazione del block successivo. Sono comunque utili, testate e funzionanti, le teniamo in scope come "extra".

| # | Feature | Test | File chiave |
|---|---|---|---|
| **B1** | Riepilogo IVA periodico (LIPE-style) — anno + periodo (YEAR/Q1-Q4/01-12) | [test 25](playwright/tests/25-iva-riepilogo.mjs) ✅ | [iva-riepilogo.component.ts](wwwroot/src/app/component/iva-riepilogo/iva-riepilogo.component.ts), [IvaController.cs](Controllers/IvaController.cs), [18_sp_riepilogo_iva_periodo.sql](dbms/schema/18_sp_riepilogo_iva_periodo.sql) |
| **B2** | Validazione formale P.IVA + Codice Fiscale (offline, no VIES) | [test 26](playwright/tests/26-validate-piva-cf.mjs) ✅ | [ValidateController.cs](Controllers/ValidateController.cs) |
| **B3** | Saved Searches per utente per route | [test 27](playwright/tests/27-saved-searches.mjs) ✅ | [SavedSearchController.cs](Controllers/SavedSearchController.cs), [19_user_saved_searches.sql](dbms/schema/19_user_saved_searches.sql) |
| **B4** | Global search v3 full-text-like — 10 entita' (clienti/fornitori/inviate/ricevute/preventivi/prodotti/pagamenti/banche/codici_iva/unita_misura) con scoring pesato 100/80/70/55/40 | [test 19](playwright/tests/19-global-search.mjs) ✅ (rev) | [23_sp_global_search_v2.sql](dbms/schema/23_sp_global_search_v2.sql) |
| **B5** | Seed demo realistici: 12 clienti + 8 fornitori + 19 prodotti/servizi (no piu' "Cliente E2E Test xxx") | manual seed | [01_seed_demo_anagrafiche.sql](dbms/seed/01_seed_demo_anagrafiche.sql), [02_seed_demo_prodotti.sql](dbms/seed/02_seed_demo_prodotti.sql) |
| **B6** | Test data factory `newClienteRealistico()` / `newFornitoreRealistico()` con pool di 24 nomi italiani fantasy + suffisso ` (e2e)` per cleanup dual-channel | usato da test 21/25/28/29/30/31 | [test-data.mjs](playwright/_shared/test-data.mjs) |

---

## 🟢 Block 4 — Analytics / Charts aggiuntivi — DONE (refactor framework-first 2026-05-06)

**Pattern**: SQL views (no-params) + scaffolding + `mdpropsbag.archetypes.chart` + `dom_board.boardcontent` con 4 KPI tile bindati via `SPAN.bindingFunction`. **Zero Angular custom**.

Vedi skill: [dashboard-replicate-custom-ui](../KonvergenceCore/skills/dashboard-replicate-custom-ui/SKILL.md)

| # | Feature | Dashboard URL | Test | Viste SQL | Build script |
|---|---|---|---|---|---|
| **#17** | Cash-flow forecast 90gg | `#/cashflow_forecast/dashboard` | [test 28](playwright/tests/28-cashflow-forecast.mjs) ✅ | [28_vw_cashflow_set.sql](dbms/schema/28_vw_cashflow_set.sql) | [build-board-cashflow.mjs](scripts/build-board-cashflow.mjs) |
| **#18** | Top clienti per fatturato | `#/top_clienti/dashboard` | [test 29](playwright/tests/29-top-clienti.mjs) ✅ | [29_vw_top_clienti_set.sql](dbms/schema/29_vw_top_clienti_set.sql) | [scaffold-and-build-top-clienti.mjs](scripts/scaffold-and-build-top-clienti.mjs) |
| **#19** | Aging crediti (5 buckets) | `#/aging_crediti/dashboard` | [test 30](playwright/tests/30-aging-crediti.mjs) ✅ | [27_vw_aging_crediti_set.sql](dbms/schema/27_vw_aging_crediti_set.sql) | [build-board-aging-crediti-v2.mjs](scripts/build-board-aging-crediti-v2.mjs) |
| **#20** | Aging debiti fornitori | `#/aging_debiti/dashboard` | [test 31](playwright/tests/31-aging-debiti.mjs) ✅ | [30_vw_aging_debiti_set.sql](dbms/schema/30_vw_aging_debiti_set.sql) | [scaffold-and-build-aging-debiti.mjs](scripts/scaffold-and-build-aging-debiti.mjs) |

**Refactor 2026-05-06 — droppato custom Angular**:
- ❌ ~~`Controllers/CashflowController.cs`~~ (sostituito da viste scaffoldate via getFlatRecordData)
- ❌ ~~`Controllers/DashboardController.cs`~~ (3 endpoint top-clienti/aging-crediti/aging-debiti idem)
- ❌ ~~`component/cashflow-forecast/`~~, ~~`top-clienti/`~~, ~~`aging-crediti/`~~, ~~`aging-debiti/`~~
- ❌ Route entries Angular `cashflow/forecast`, `dashboard/aging-debiti`, `dashboard/aging-crediti`, `dashboard/top-clienti`

**Framework fix necessario per supportare il refactor** (in `wuic-framework-lib/.../chart-list.component.ts`):
- `dataOptions.stacked` → seed `this.ui.stacked` in `subscribeToDS()`
- `dataOptions.indexAxis` → seed `this.ui.indexAxis`
- Static `ds.backgroundColor` per dataset preservato in `_parseDataInternal()`

**Note Block 4:**
- Tutti i 4 chart usano dati REALI da `dbo.scadenze` / `dbo.fatture_inviate`, calcolati on-the-fly dalle SP — verifica numerica fatta in test 28 (cashflow 11.548 € incassi - 1.537 € pagamenti = 10.011 € saldo finale, coerente con DB).
- Stacked bar chart usano colori semantici uniformi tra #19 e #20 (verde non scaduto / giallo 0-30 / arancio 31-60 / rosso 61-90 / bordeaux >90).
- Race condition `p-inputNumber` ngModel → null al primo render mitigata con guard `Number(this.x) >= MIN ? Number(this.x) : default` in `loadData()`.
- SP `sp_aging_crediti`/`sp_aging_debiti`: CTE non riusabili su 2 SELECT successivi → uso table variable `@scad_b` materializzata (post-mortem #19).

---

## 🟡 Block 5 — Integrazioni esterne — TO DO

| # | Feature | Test | Status |
|---|---|---|---|
| **#21** | **Import CSV/Excel movimenti banca** + stub connettore PSD2 (UniCredit/Intesa) — match automatico con scadenze | test 32 | ⏳ |
| **#22** | **Export contabilità .txt** (formati Profis / Bluenext / TeamSystem / Zucchetti) | test 33 | ⏳ |
| **#23** | **Notifica email automatica invio fattura** (XML+PDF allegati, integrazione `email_log`) | test 34 | ⏳ |
| **#24** | **Anagrafica unificata cliente↔fornitore** (`vw_anagrafica_unificata` + flag dual-role) | test 35 | ⏳ |

---

## 🟡 Block 6 — Tecnico / qualità — TO DO

| # | Feature | Test | Status |
|---|---|---|---|
| **#25** | **Soft-delete recovery UI ("Cestino")** — schermata `cancellato=1` con Ripristina | test 36 | ⏳ |
| **#26** | **Audit trail** — `audit_log` + trigger AFTER UPDATE per fatture/scadenze + UI viewer | test 37 | ⏳ |
| **#27** | **API REST pubblica + Swagger UI** — sotto-set CRUD documentato per integrazioni esterne | test 38 | ⏳ |
| **#28** | **Test E2E coverage chart routes** — verifica VALORI (non solo render) per #17-#20 | suite tests | ⏳ |

---

## 🔵 Carryover

| # | Feature | Test | Status | Note |
|---|---|---|---|---|
| **#29** | **Bulk "Invia SDI" multi-fattura** | test 39 | ⏳ | Era nel #14 originale ma implementato solo "marca pagate". Spostato qui come carryover. |
| **#15** | **Dashboard widget configurabili per utente (BoardPref)** | — | 🚧 deferred | Backend `/api/board-pref` (POST/GET/DELETE) ✅ implementato + IDOR-defense. Client `BoardPrefComponent` ❌ stub: il `WIDGET_CATALOG` è hardcoded con 5 voci CRM-like fittizie (`kpi_clienti`/`kpi_fatture`/`kpi_scadenze`/`chart_vendite`/`list_recenti`) → mostra la stessa lista su qualsiasi route, e i toggle non hanno effetto sui widget reali (sono in `dom_board.boardcontent`). FAB nascosto in [`app.component.html:127`](wwwroot/src/app/app.component.html#L127) e import commentato in [`app.component.ts:42`](wwwroot/src/app/app.component.ts#L42) il 2026-05-08. **Da fare per riattivare:** (a) discovery dinamico del catalog dal `boardcontent` della route corrente (titolo + uniqueName per ogni widget top-level), (b) listener `board-pref:changed` nei dashboard renderer che applichi `display:none` ai widget nascosti via `uniqueName`, (c) re-aggiungere `<app-board-pref>` + import. |

---

## Convenzioni operative

1. **Numerazione test e2e:** test in `playwright/tests/NN-<slug>.mjs`. Nomi e id meta `id: 'NN'`.
2. **SP/Schema SQL:** `dbms/schema/NN_<slug>.sql`. Numero progressivo coerente coi test, applicato manualmente con `sqlcmd`.
3. **Controllers:** un controller per ambito, un endpoint per metodo, parametri sempre via `SqlCommand.AddWithValue` (mai concat). Newtonsoft.Json (NON System.Text.Json) per i body — il framework usa `AddNewtonsoftJson` (regola post-mortem #15).
4. **UI components custom:** in `wwwroot/src/app/component/<slug>/<slug>.component.ts`, registrazione in `app.component.ts:imports[]` se top-level, route in `app.routes.ts` se ha pagina propria.
5. **Cookie auth e2e:** sempre via `createBackendApiClient` da [`backend-api-client.mjs`](../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs) (regola 26 AGENTS.md).
6. **Cleanup test:** ogni test che apre dialog DEVE chiuderli prima del return (mask `p-dialog-mask` blocca i click successivi). Cleanup DB rows via `try/catch` finale.
7. **Dialog signal pattern:** se ChangeDetectionStrategy.OnPush, `dialogOpen` DEVE essere `signal()` con `[visible]+(visibleChange)` binding (NON `[(visible)]` su plain field).
8. **Refresh datasource dopo bulk action:** `await datasource.fetchData()` (NON `refresh()`, non esiste). Vedi [skill table-actions](../KonvergenceCore/skills/table-actions/SKILL.md).
9. **Visual proof obbligatoria a ogni test UI:** ogni test con `needsUi: true` deve salvare uno screenshot `PASS_<nn>_<slug>_<ts>.png` in `playwright/screenshots/` PRIMA del return. Quando l'agente comunica un test passato, deve **sempre includere lo screenshot via `Read`** seguito da una sintesi 3-5 bullet di cosa si vede. Il `pass=1` testuale non garantisce il rendering corretto — lo screenshot e' l'unica prova oggettiva contro regressioni grafiche / dati zero / dialog clipped. Vedi [skill docs-driven-mjs-tests](../KonvergenceCore/skills/docs-driven-mjs-tests/SKILL.md).
10. **Framework-first per nuove pagine (post-mortem #24):** prima di creare un componente Angular custom, valutare sempre l'opzione metadata-driven:
    - **List page semplice** (filtro + visualizza): SQL view + `scaffolding.scaffoldView` + update `mm_display_string` / `mc_display_string_in_view` → la route renderizza automaticamente con list-grid framework standard. Zero Angular code.
    - **Dashboard con chart KPI**: usa il template designer-saved [`skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json`](../KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json) + `build-board-from-template.mjs` + view aggregata + `mdpropsbag.archetypes.chart`. Vedi [skill dashboard-boardcontent](../KonvergenceCore/skills/dashboard-boardcontent/SKILL.md).
    - **Action button su list**: aggiungi a `_mtdt__cstom__actions__tabelle` con `actioncallback` JS body. Vedi [skill table-actions](../KonvergenceCore/skills/table-actions/SKILL.md).
    - Componente Angular custom giustificato SOLO per: rendering totalmente non-tabellare (es. stampa fattura HTML) o widget custom con logica non scriptable.
11. **Mapping SQL ↔ csProperty per metadata (regola 25 AGENTS):** quando aggiorni in SQL diretto le metadata table, **leggi sempre prima** [`skills/metadata-tables-columns/metadata-mappings.json`](../KonvergenceCore/skills/metadata-tables-columns/metadata-mappings.json). Trappole verificate post-#24:
    - `md_display_string` (cs prop) → SQL column reale e' **`mm_display_string`** (legacy DB)
    - `md_long_description` (cs prop) → SQL column reale e' **`mm_long_description`**
    - `mc_hide_in_list` (cs prop) → SQL column reale e' **`mchideinlist`** (vocali rimosse)
    - usare il nome cs in una `UPDATE` SQL fa fallire silenziosamente (`Il nome di colonna 'X' non e' valido`).

---

## Stato porte / processi

- **Backend** `:5100` — `dotnet bin/Debug/net10.0/FatturazioneElettronica.exe --urls=http://localhost:5100` con `ASPNETCORE_ENVIRONMENT=Development` (altrimenti UseHttpsRedirection rompe i test E2E)
- **Frontend** `:4202` — `cd wwwroot && npm run serve:dev -- --port 4202` (porta 4200 spesso occupata da WuicTest dell'utente, usare 4202 per non interferire)
- **DB Dati**: `localhost\sqlexpress` / `FatturazioneElettronica_Data`
- **DB Metadati**: `localhost\sqlexpress` / `FatturazioneElettronica_Metadata`
