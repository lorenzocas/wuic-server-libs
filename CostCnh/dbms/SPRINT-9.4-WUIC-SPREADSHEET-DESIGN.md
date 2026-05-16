# Sprint 9.4 — `<wuic-spreadsheet>` archetype design doc

## Scope

Sostituisce il legacy `AddinController` (6684 LoC Excel addin) con un
componente Angular in-browser per editing batch di `cp.facts` con:
- Multi-cell selection + copy/paste
- Formula bar minima (`=A1+B1` style — solo aritmetica base + SUM/AVG)
- Virtualization per migliaia di righe
- Real-time lock awareness (lock UI badge + auto-release on tab close)
- Undo/redo (local, 50 step)
- Validation per-cell (range, required, type)

## Backend status (Sprint 9.4 implementato)

| Endpoint | Status | Note |
|---|---|---|
| `POST /api/spreadsheet/lock-range/{programId}` | ✅ | Pessimistic lock per program×scenario×year (TTL 30min, auto-release scaduti) |
| `GET /api/spreadsheet/snapshot/{programId}` | ✅ | Returns rows con planned/actual/committed/balance per mese |
| `POST /api/spreadsheet/heartbeat` | ✅ | Refresh TTL ogni 60s |
| `POST /api/spreadsheet/save-cells` | ✅ | Batch UPDATE + audit in cp.spreadsheet_change_log |
| `POST /api/spreadsheet/release-lock` | ✅ | Libera lock esplicito |
| `GET /api/spreadsheet/export-xlsx/{programId}` | ✅ | Download xlsx attuale view |
| (todo) `POST /api/spreadsheet/import-xlsx` | ⏳ | Upload xlsx → parse → save-cells server-side (riusa pattern md_action_type=10) |
| (todo) `POST /api/spreadsheet/validate` | ⏳ | Pre-save validation (range, type) |

## Frontend status

**Non implementato** — richiede commit framework `wuic-framework-lib` per:
- Nuovo archetype `<wuic-spreadsheet [route]="..." [editing]="..." (save)="...">`
- Router map per `/{route}/spreadsheet` mode (analogo a `/list`, `/edit/{id}`)
- Lifecycle hooks per integrazione con `metadata-driven` flow standard

### Component shape (proposed)

```ts
// wwwroot/my-workspace/projects/wuic-framework-lib/src/lib/component/spreadsheet/
//   spreadsheet.component.ts (~800 LoC)
//   spreadsheet.component.html (~80 LoC)
//   spreadsheet.component.css (~150 LoC)

@Component({ selector: 'wuic-spreadsheet', ... })
export class WuicSpreadsheetComponent implements OnInit, OnDestroy {
  @Input() programId!: number;
  @Input() scenarioId?: number;
  @Input() year?: number;

  @Input() route!: string;                    // 'plan_facts' per default
  @Input() editingFields: string[] = ['planned','actual','committed'];
  @Input() readonlyFields: string[] = ['xbs_code','project_code'];
  @Input() ttlMinutes = 30;
  @Input() heartbeatIntervalSec = 60;

  @Output() saved = new EventEmitter<{applied:number; failed:number}>();
  @Output() lockConflict = new EventEmitter<{conflictUserId:number}>();

  lockToken?: string;
  lockExpiresUtc?: Date;
  dirtyCells = new Map<string, {factsId:number; field:string; oldValue:any; newValue:any}>();
  heartbeatTimer?: any;

  async ngOnInit() {
    // 1. Acquire lock
    const lockResp = await this.spreadsheetApi.acquireLock(this.programId, this.scenarioId, this.year);
    if (lockResp.outcome === 'conflict') {
      this.lockConflict.emit({conflictUserId: lockResp.conflictUserId});
      return;
    }
    this.lockToken = lockResp.lockToken;
    this.lockExpiresUtc = new Date(lockResp.lockExpiresUtc);

    // 2. Load snapshot
    const snapshot = await this.spreadsheetApi.snapshot(this.programId, this.scenarioId, this.year);
    this.gridData = this.transformToPivot(snapshot.rows);

    // 3. Start heartbeat
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalSec * 1000);

    // 4. Mount underlying grid (revogrid recommended: MIT + virtualized + multi-cell select + copy/paste built-in)
    this.mountGrid();
  }

  async save() {
    const changes = Array.from(this.dirtyCells.values()).map(c => ({factsId:c.factsId, field:c.field, newValue:c.newValue}));
    const resp = await this.spreadsheetApi.saveCells(this.lockToken!, changes);
    this.dirtyCells.clear();
    this.saved.emit({applied: resp.applied, failed: resp.failed});
  }

  async ngOnDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.lockToken) await this.spreadsheetApi.releaseLock(this.lockToken);
  }

  private transformToPivot(rows: any[]) {
    // Pivot wide: row = xbs_node × project; cols = months ['202501','202502',...]
    // Each cell {planned, actual, committed} navigable
  }
}
```

### Library scelta: **revogrid** (MIT)

- ~30KB gzipped
- Virtualized (handles 100k+ rows)
- Multi-cell selection + copy/paste built-in
- Per-cell template + editor customization
- TypeScript native
- Anche se Handsontable è leader, è CLA/commercial per prod use → revogrid è no-strings-attached

Install: `npm i @revolist/revogrid` in `wwwroot/my-workspace/projects/wuic-framework-lib/`

### Routing integration

```ts
// metadata-driven router (wuic-framework-lib/router/metadata-route.guard.ts)
const archetypeRoutes = {
  list:        ListGridComponent,
  edit:        ParametricDialogComponent,
  dashboard:   BoardContentComponent,
  spreadsheet: WuicSpreadsheetComponent,   // NEW
};
```

URL pattern: `/{route}/spreadsheet/{programId}?scenarioId=N&year=YYYY`

### Custom action per accesso

Su `plan_facts` route (Sprint 8 mdinlineedit), aggiungere toolbar action:

```js
// Sprint 9.4: open full PowerEdit spreadsheet
const programId = prompt('Program ID?');   // o lookup parametric-dialog
wtoolbox.navigate(`/plan_facts/spreadsheet/${programId}?year=${new Date().getFullYear()}`);
```

## Use cases supportati

| Use case | Sprint 8 (mdinlineedit) | Sprint 9.4 backend | Sprint 9.4+ frontend |
|---|---|---|---|
| Edit singola cella | ✅ | ✅ via save-cells | ✅ |
| Edit batch 100+ celle | ⚠️ slow (1 PUT per cell) | ✅ save-cells batch | ✅ |
| Copy/paste range (Excel-like) | ❌ | ✅ save-cells multi | ✅ revogrid built-in |
| Formula `=A1+B1` | ❌ | n/a (client-side eval) | ✅ HyperFormula lib |
| Multi-user concurrent edit | ⚠️ last-write-wins | ✅ pessimistic lock | ✅ visual lock badge |
| Undo/redo | ❌ | n/a | ✅ revogrid built-in |
| Xlsx import/export | ⚠️ via upload pipeline | ✅ export-xlsx | ✅ download trigger |
| Virtualization 10k+ rows | ⚠️ paginate | ✅ snapshot streaming | ✅ revogrid virtualized |

## Pre-check checklist per implementazione frontend

- [ ] Aggiungi `@revolist/revogrid` come dipendenza wuic-framework-lib
- [ ] Crea `spreadsheet/` folder con component + html + css
- [ ] Crea `services/spreadsheet-api.service.ts` con methods wrapping i 6 endpoint
- [ ] Modifica `metadata-route.guard.ts` per riconoscere "spreadsheet" come archetype
- [ ] Aggiungi `<wuic-spreadsheet>` ai `declarations` di `wuic-framework-lib.module.ts`
- [ ] Test e2e: open spreadsheet → edit 50 cells → save → reload → verify
- [ ] Test lock conflict: 2 user contemporanei → 2° user vede badge "locked by Marco"
- [ ] Test heartbeat: keep tab open 35 min → no auto-release durante interazione
- [ ] Test xlsx export → download apre Excel
- [ ] Documenta in `docs/pages/wuic-spreadsheet.md` (multi-lingua per docs-localization-parity skill)

## Stima effort frontend

- Component skeleton (mount revogrid + 6 API calls): 1 giorno
- Pivot transform (server flat → wide grid): 0.5 giorno
- Multi-cell select + copy/paste integration: 0.5 giorno (revogrid built-in, solo wiring)
- Formula bar (HyperFormula integration): 1 giorno
- Lock badge UI + conflict modal: 0.5 giorno
- Xlsx import/export flow: 0.5 giorno
- Testing e2e (Playwright 5 scenari): 1 giorno
- Docs multi-lingua (5 lingue via docs-localization-parity): 0.5 giorno
- **Totale**: ~5 giorni dev singolo

## Decisione cutover

**Opzione A**: Frontend implementation **dentro CostCnh app** (NON `wuic-framework-lib`)
- Pro: nessun commit framework richiesto
- Contro: archetype non riusabile da altre app WUIC

**Opzione B**: Framework archetype + ask esplicito a framework owner
- Pro: feature riusabile, completa
- Contro: dipende da review/merge framework

Raccomandazione: **B**, ma con prep su `CostCnh/wwwroot/spreadsheet-prototype/` per
sviluppare e testare l'integrazione prima di proporla come archetype framework.
