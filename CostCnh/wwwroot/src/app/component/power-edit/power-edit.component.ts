import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TreeNode } from 'primeng/api';
import { TreeTableModule } from 'primeng/treetable';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import {
  PowerEditCellChange,
  PowerEditPivotRow,
  PowerEditService,
  PowerEditSnapshot,
} from './power-edit.service';
import { PowerEditToolbarComponent, ToolParams } from './power-edit-toolbar.component';

/**
 * PowerEdit hierarchical pivot grid — port app-local della legacy
 * Cost_CNH/Scripts/Planning/PowerEdit.ts (1.516 LoC) + custom directive.
 *
 * Rows: nodi XBS gerarchici (hierarchyid, expand/collapse via PrimeNG TreeTable).
 * Cols: 12 mesi x 4 facet (planned/actual/forecast/baseline) — grouped header.
 * Edit: inline cell editing su nodi leaf, batch save con ancestor refresh.
 * Lock: pessimistic via SpreadsheetController (genericato in Phase G.1 v2).
 *
 * Source: `dbms/schema/97-power-edit-pivot.sql`.
 */
@Component({
  selector: 'costcnh-power-edit',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TreeTableModule, ButtonModule, InputNumberModule, MessageModule, ProgressSpinnerModule,
    SelectModule, DialogModule, PowerEditToolbarComponent,
  ],
  // H.9: year switcher requires SelectModule

  templateUrl: './power-edit.component.html',
  styleUrls: ['./power-edit.component.scss'],
})
export class PowerEditComponent implements OnInit, OnDestroy {

  // ─── Inputs / state ──────────────────────────────────────────────────────
  programId: number | null = null;
  year: number = new Date().getFullYear();
  /** H.10: scenario corrente. undefined/null = no scenario filter (cached pivot). */
  scenarioId: number | null = null;

  /** Task 11.4: target currency selezionato. null = display in raw program currency. */
  targetCurrencyId: number | null = null;
  /** Lista currencies caricata da /api/power-edit/currencies. */
  availableCurrencies: { id: number; code: string; symbol?: string; name?: string }[] = [];

  /** Task 3.2: dialog lock conflict visibile + dati conflict. */
  showLockConflictDialog = false;

  // ─── Task 2.9 — Undo/Redo stack ──────────────────────────────────────────
  /** Storia delle modifiche per undo. Ogni entry = { nodeId, monthNum, facet, oldValue, newValue }. */
  private undoStack: Array<{ nodeId: number; monthNum: number; facet: string; oldValue: any; newValue: any }> = [];
  /** Stack dei redo (popolato dopo undo). */
  private redoStack: Array<{ nodeId: number; monthNum: number; facet: string; oldValue: any; newValue: any }> = [];
  readonly MAX_UNDO_DEPTH = 100;
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** H.9: anni disponibili nel year switcher dropdown (current ±5). */
  get availableYears(): number[] {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now - 3; y <= now + 3; y++) out.push(y);
    return out;
  }

  loading = false;
  error: string | null = null;

  /** Nodi root del TreeTable (cima della gerarchia XBS, parent_node_id IS NULL). */
  treeRoots: TreeNode<PowerEditPivotRow>[] = [];

  /** Map xbs_node_id → TreeNode per fast ancestor patch dopo save. */
  private nodeIndex = new Map<number, TreeNode<PowerEditPivotRow>>();

  /** Facet abilitati per edit (gli altri sono RO grafici). */
  editableFacets = new Set<string>(['planned', 'actual', 'forecast']);

  /** Facet codes ordinati per il rendering: ogni mese mostra 4 sub-colonne. */
  readonly FACET_ORDER = ['planned', 'actual', 'forecast', 'baseline'] as const;
  readonly FACET_PREFIX: Record<string, string> = {
    planned: 'pl', actual: 'ac', forecast: 'fc', baseline: 'bl',
  };
  readonly FACET_LABEL: Record<string, string> = {
    planned: 'Pln', actual: 'Act', forecast: 'Fcst', baseline: 'Bsl',
  };
  readonly MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  // ─── Lock state ──────────────────────────────────────────────────────────
  lockToken: string | null = null;
  lockExpiresUtc: Date | null = null;
  lockConflictUserId: number | null = null;
  private heartbeatTimer: any = null;

  /** Selezione xbs_node_id leaf per tool toolbar (Distribute/Copy/Shift/Clear). */
  selectedNodeIds = new Set<number>();

  // ─── Pending changes batch ───────────────────────────────────────────────
  private pendingChanges: PowerEditCellChange[] = [];
  private saveDebounceTimer: any = null;
  saveInFlight = false;

  constructor(
    private route: ActivatedRoute,
    private svc: PowerEditService,
  ) {}

  ngOnInit(): void {
    // Route params: /power-edit/:programId?year=YYYY
    const pid = Number(this.route.snapshot.paramMap.get('programId'));
    if (Number.isFinite(pid) && pid > 0) this.programId = pid;
    const yr = Number(this.route.snapshot.queryParamMap.get('year'));
    if (Number.isFinite(yr) && yr >= 2000 && yr <= 2200) this.year = yr;
    // H.10: scenarioId optional
    const sc = Number(this.route.snapshot.queryParamMap.get('scenarioId'));
    if (Number.isFinite(sc) && sc > 0) this.scenarioId = sc;

    if (this.programId != null) {
      void this.bootstrap();
    } else {
      this.error = 'Missing programId in route';
    }
  }

  ngOnDestroy(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.saveDebounceTimer) { clearTimeout(this.saveDebounceTimer); this.saveDebounceTimer = null; }
    if (this.lockToken) {
      // best-effort release on unmount
      void this.svc.releaseLock(this.lockToken).catch(() => {});
      this.lockToken = null;
    }
  }

  // ─── Bootstrap: acquire lock + load snapshot + start heartbeat ───────────
  private async bootstrap(): Promise<void> {
    if (this.programId == null) return;
    this.loading = true;
    this.error = null;

    try {
      // 1. Lock
      const lockResp = await this.svc.acquireLock(this.programId, undefined, this.year);
        if (lockResp.outcome === 'conflict') {
        this.lockConflictUserId = lockResp.conflictUserId ?? null;
        this.showLockConflictDialog = true;    // Task 3.2 dialog
        this.error = `Lock conflict: program in editing da user ${this.lockConflictUserId}`;
        this.loading = false;
        return;
      }
      if (lockResp.ok && lockResp.lockToken) {
        this.lockToken = lockResp.lockToken;
        this.lockExpiresUtc = lockResp.lockExpiresUtc ? new Date(lockResp.lockExpiresUtc) : null;
        this.startHeartbeat();
      }

      // Load currencies (Task 11.4)
      if (this.availableCurrencies.length === 0) {
        try {
          const resp: any = await fetch('/api/power-edit/currencies', { credentials: 'include' }).then((r) => r.json());
          this.availableCurrencies = resp?.currencies ?? [];
        } catch { /* graceful */ }
      }

      // 2. Snapshot (H.10 scenarioId + I.11.4 target currency)
      const snap = await this.svc.loadSnapshot(this.programId, this.year, this.scenarioId ?? undefined, this.targetCurrencyId ?? undefined);
      this.editableFacets = new Set(snap.editableFacets || ['planned', 'actual', 'forecast']);
      this.buildTree(snap);
    } catch (e: any) {
      this.error = e?.message ?? String(e);
      console.error('[PowerEdit] bootstrap failed', e);
    } finally {
      this.loading = false;
    }
  }

  // ─── Tree building: from flat rows (sorted by hierarchyid) to TreeNode[] ──
  private buildTree(snap: PowerEditSnapshot): void {
    this.nodeIndex.clear();
    this.treeRoots = [];

    // Each pivot row -> TreeNode wrapper
    for (const row of snap.rows) {
      const node: TreeNode<PowerEditPivotRow> = {
        data: row,
        children: [],
        expanded: row.xbs_depth <= 1,  // root + L1 expanded by default
      };
      this.nodeIndex.set(row.xbs_node_id, node);
    }

    // Wire parent→children. Rows pre-ordered by xbs_path so parents seen first.
    for (const row of snap.rows) {
      const node = this.nodeIndex.get(row.xbs_node_id)!;
      if (row.parent_node_id != null && this.nodeIndex.has(row.parent_node_id)) {
        const parent = this.nodeIndex.get(row.parent_node_id)!;
        parent.children!.push(node);
      } else {
        this.treeRoots.push(node);
      }
    }
  }

  // ─── Heartbeat ───────────────────────────────────────────────────────────
  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (!this.lockToken) return;
      try {
        const r = await this.svc.heartbeat(this.lockToken);
        if (r.ok && r.lockExpiresUtc) this.lockExpiresUtc = new Date(r.lockExpiresUtc);
        else this.lockExpired();
      } catch {
        this.lockExpired();
      }
    }, 60_000);   // 60s
  }

  private lockExpired(): void {
    this.lockToken = null;
    this.error = 'Lock scaduto. Ricarica la pagina per riprovare.';
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  // ─── Cell edit handler (PrimeNG cellEditComplete) ─────────────────────────
  /**
   * Chiamato dal template quando l'utente conferma una modifica cella.
   * @param row pivot row (TreeNode.data)
   * @param facet 'planned' | 'actual' | 'forecast'
   * @param monthNum 1..12
   * @param newValue
   */
  onCellEdit(row: PowerEditPivotRow, facet: string, monthNum: number, newValue: any): void {
    if (!this.editableFacets.has(facet)) return;
    if (row.is_leaf !== 1) return;    // non-leaf RO

    const prefix = this.FACET_PREFIX[facet];
    const colKey = `${prefix}_m${monthNum}`;
    const parsed = newValue === '' || newValue == null ? null : Number(newValue);
    if (parsed != null && !Number.isFinite(parsed)) return;

    // Task 2.9 — Push undo entry PRIMA del change
    const oldValue = row[colKey];
    this.pushUndo(row.xbs_node_id, monthNum, facet, oldValue, parsed);

    // Update optimistic UI
    row[colKey] = parsed;

    // Push change to pending batch
    const existingIdx = this.pendingChanges.findIndex(
      (c) => c.xbsNodeId === row.xbs_node_id && c.monthNum === monthNum && c.facetCode === facet
    );
    const change: PowerEditCellChange = {
      xbsNodeId: row.xbs_node_id, monthNum: monthNum as any,
      facetCode: facet as any, newValue: parsed
    };
    if (existingIdx >= 0) this.pendingChanges[existingIdx] = change;
    else this.pendingChanges.push(change);

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => this.flushChanges(), 500);
  }

  async flushChanges(): Promise<void> {
    if (this.saveInFlight || this.pendingChanges.length === 0 || this.programId == null) return;
    const batch = this.pendingChanges.splice(0);
    this.saveInFlight = true;
    try {
      const resp = await this.svc.saveCells(
        this.programId, this.year, batch,
        this.lockToken ?? undefined,
        this.scenarioId ?? undefined,   // H.10
      );
      // Apply ancestor refresh: patch each returned row in nodeIndex
      for (const updated of resp.updatedRows || []) {
        const node = this.nodeIndex.get(updated.xbs_node_id);
        if (node) {
          // Merge into existing data so TreeTable binding picks up
          Object.assign(node.data!, updated);
        }
      }
    } catch (e: any) {
      console.error('[PowerEdit] save failed', e);
      this.error = `Save error: ${e?.message ?? e}`;
      // Re-queue failed changes (TODO: optimistic rollback logic in H.4)
      this.pendingChanges.unshift(...batch);
    } finally {
      this.saveInFlight = false;
    }
  }

  // ─── Template helpers ─────────────────────────────────────────────────────
  getCellValue(row: PowerEditPivotRow, facet: string, monthNum: number): number | null {
    const prefix = this.FACET_PREFIX[facet];
    return row[`${prefix}_m${monthNum}`] ?? null;
  }

  isCellEditable(row: PowerEditPivotRow, facet: string): boolean {
    return row.is_leaf === 1 && this.editableFacets.has(facet);
  }

  /**
   * Task 2.5 — Conditional formatting metadata-driven.
   * Restituisce le classi CSS aggiuntive da applicare a una cella, basate su
   * regole semplici hard-coded (TODO: leggere da metadata stili in iter futura).
   *   - actual > planned → 'pe-cell--over'
   *   - forecast < planned → 'pe-cell--under'
   *   - actual >= 90% planned && actual <= 110% planned → 'pe-cell--on-track'
   */
  getCellConditionalClass(row: PowerEditPivotRow, facet: string, monthNum: number): string {
    if (row.is_leaf !== 1) return '';
    const planned = row[`pl_m${monthNum}`] as number | null;
    const value = row[`${this.FACET_PREFIX[facet]}_m${monthNum}`] as number | null;
    if (planned == null || value == null || planned === 0) return '';
    if (facet === 'actual') {
      if (value > planned * 1.1) return 'pe-cell--over';
      if (value < planned * 0.9) return 'pe-cell--under';
      return 'pe-cell--on-track';
    }
    if (facet === 'forecast') {
      if (value > planned * 1.05) return 'pe-cell--over';
      if (value < planned * 0.95) return 'pe-cell--under';
    }
    return '';
  }

  /**
   * Genera label per il "node row header" (frozen col): indentazione visuale
   * via xbs_depth + code + name. Indentation gestita via PrimeNG TreeTable.
   */
  getRowLabel(row: PowerEditPivotRow): string {
    const code = row.xbs_code ?? `#${row.xbs_node_id}`;
    return row.xbs_name ? `${code} — ${row.xbs_name}` : code;
  }

  // ─── Task 11.4 — CURRENCY SWITCHER ────────────────────────────────────────
  async onCurrencyChange(newCurrencyId: number | null): Promise<void> {
    if (newCurrencyId === this.targetCurrencyId) return;
    if (this.pendingChanges.length > 0) await this.flushChanges();
    this.targetCurrencyId = newCurrencyId;
    this.clearSelection();
    await this.bootstrap();
  }

  // ─── Task 3.2 — LOCK CONFLICT DIALOG ──────────────────────────────────────
  /** Admin force-release: chiama API per rilasciare lock di altro user e riprova. */
  async onForceReleaseLock(): Promise<void> {
    if (this.lockConflictUserId == null || this.programId == null) return;
    try {
      await fetch(`/api/spreadsheet/admin-force-release?programId=${this.programId}&year=${this.year}`, {
        method: 'POST', credentials: 'include',
      });
      this.showLockConflictDialog = false;
      this.lockConflictUserId = null;
      this.error = null;
      await this.bootstrap();    // riprova acquire
    } catch (e: any) {
      this.error = `Force release failed: ${e?.message ?? e}`;
    }
  }
  onDismissConflict(): void {
    this.showLockConflictDialog = false;
  }

  // ─── H.9 YEAR SWITCHER ────────────────────────────────────────────────────
  /** Cambia anno: rilascia lock corrente + reset state + nuovo bootstrap. */
  async onYearChange(newYear: number): Promise<void> {
    if (newYear === this.year) return;
    if (this.saveInFlight || this.pendingChanges.length > 0) {
      // Flush pending prima di switch
      await this.flushChanges();
    }
    if (this.lockToken) {
      try { await this.svc.releaseLock(this.lockToken); } catch {}
      this.lockToken = null;
    }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    this.year = newYear;
    this.clearSelection();
    await this.bootstrap();
  }

  // ─── Task 2.9 — UNDO/REDO ─────────────────────────────────────────────────
  private pushUndo(nodeId: number, monthNum: number, facet: string, oldValue: any, newValue: any): void {
    this.undoStack.push({ nodeId, monthNum, facet, oldValue, newValue });
    if (this.undoStack.length > this.MAX_UNDO_DEPTH) this.undoStack.shift();
    this.redoStack = [];   // new edit invalidates redo chain
  }

  undo(): void {
    const e = this.undoStack.pop();
    if (!e) return;
    const node = this.nodeIndex.get(e.nodeId);
    if (!node?.data) return;
    const prefix = this.FACET_PREFIX[e.facet];
    node.data[`${prefix}_m${e.monthNum}`] = e.oldValue;
    this.pendingChanges.push({
      xbsNodeId: e.nodeId, monthNum: e.monthNum as any,
      facetCode: e.facet as any, newValue: e.oldValue,
    });
    this.redoStack.push(e);
    this.scheduleFlush();
  }

  redo(): void {
    const e = this.redoStack.pop();
    if (!e) return;
    const node = this.nodeIndex.get(e.nodeId);
    if (!node?.data) return;
    const prefix = this.FACET_PREFIX[e.facet];
    node.data[`${prefix}_m${e.monthNum}`] = e.newValue;
    this.pendingChanges.push({
      xbsNodeId: e.nodeId, monthNum: e.monthNum as any,
      facetCode: e.facet as any, newValue: e.newValue,
    });
    this.undoStack.push(e);
    this.scheduleFlush();
  }

  // ─── Task 2.4 — EXPORT XLSX ───────────────────────────────────────────────
  exportXlsx(): void {
    if (this.programId == null) return;
    const url = `/api/power-edit/export-xlsx/${this.programId}?year=${this.year}`;
    window.open(url, '_blank');
  }

  // ─── Task 2.7 — KEYBOARD SHORTCUTS ────────────────────────────────────────
  @HostListener('document:keydown', ['$event'])
  handleKeyboard(ev: KeyboardEvent): void {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const key = ev.key.toLowerCase();
    if (key === 'z' && !ev.shiftKey) {
      ev.preventDefault();
      this.undo();
    } else if ((key === 'z' && ev.shiftKey) || key === 'y') {
      ev.preventDefault();
      this.redo();
    } else if (key === 's') {
      ev.preventDefault();
      void this.flushChanges();
    }
  }

  // ─── H.5 SELECTION + TOOL HANDLERS ────────────────────────────────────────
  /** Toggle selection di un nodo (solo leaf). Chiamato dal click sulla checkbox. */
  toggleSelection(row: PowerEditPivotRow, event?: Event): void {
    if (event) event.stopPropagation();
    if (row.is_leaf !== 1) return;
    if (this.selectedNodeIds.has(row.xbs_node_id)) {
      this.selectedNodeIds.delete(row.xbs_node_id);
    } else {
      this.selectedNodeIds.add(row.xbs_node_id);
    }
  }
  isSelected(row: PowerEditPivotRow): boolean {
    return this.selectedNodeIds.has(row.xbs_node_id);
  }
  clearSelection(): void {
    this.selectedNodeIds.clear();
  }
  get selectionCount(): number {
    return this.selectedNodeIds.size;
  }

  /** Lista facets selezionabili nel toolbar (label + code, sourced da editableFacets). */
  get toolbarFacetOptions(): { label: string; value: string }[] {
    return Array.from(this.editableFacets).map((f) => ({
      label: f.charAt(0).toUpperCase() + f.slice(1),
      value: f,
    }));
  }

  /**
   * Toolbar dispatcher: genera PowerEditCellChange[] in base al tool e li
   * accoda al normale flush batch. Server-side validation passa attraverso
   * cp.sp_save_power_edit_cells (rejection se non-leaf / baseline RO).
   */
  onToolApply(params: ToolParams): void {
    const targets = Array.from(this.selectedNodeIds);
    if (targets.length === 0) return;
    const facet = (params.facet ?? 'planned') as 'planned' | 'actual' | 'forecast';
    const monthFrom = Math.max(1, Math.min(12, params.fromMonth ?? 1));
    const monthTo   = Math.max(monthFrom, Math.min(12, params.toMonth ?? 12));
    const range: number[] = [];
    for (let m = monthFrom; m <= monthTo; m++) range.push(m);

    const newChanges: PowerEditCellChange[] = [];

    switch (params.kind) {
      case 'distribute': {
        // Total value distribuito linearmente sui mesi del range
        const N = range.length;
        const perMonth = N > 0 ? (params.totalValue ?? 0) / N : 0;
        for (const nodeId of targets) {
          for (const m of range) {
            newChanges.push({ xbsNodeId: nodeId, monthNum: m as any, facetCode: facet, newValue: perMonth });
          }
        }
        break;
      }
      case 'copy': {
        // Prende il valore corrente del mese sorgente per ogni nodo e lo replica
        const src = Math.max(1, Math.min(12, params.sourceMonth ?? 1));
        const prefix = this.FACET_PREFIX[facet];
        for (const nodeId of targets) {
          const node = this.nodeIndex.get(nodeId);
          const sourceVal = node?.data?.[`${prefix}_m${src}`] ?? null;
          for (const m of range) {
            if (m === src) continue;   // non riscrivere se stesso
            newChanges.push({ xbsNodeId: nodeId, monthNum: m as any, facetCode: facet, newValue: sourceVal });
          }
        }
        break;
      }
      case 'shift': {
        // Shift dei valori in avanti/indietro. Drop fuori-range. Source mesi
        // letti dal current pivot data (per ogni nodo selezionato).
        const dx = Math.trunc(params.shiftBy ?? 0);
        if (dx === 0) return;
        const prefix = this.FACET_PREFIX[facet];
        for (const nodeId of targets) {
          const node = this.nodeIndex.get(nodeId);
          if (!node?.data) continue;
          // Calcola nuovo array values, shifted
          const newVals: (number | null)[] = new Array(12).fill(null);
          for (const m of range) {
            const targetM = m + dx;
            if (targetM < 1 || targetM > 12) continue;
            newVals[targetM - 1] = node.data[`${prefix}_m${m}`] ?? null;
          }
          // Crea change per ogni mese nel target range  (m+dx)
          for (let m = 1; m <= 12; m++) {
            if (newVals[m - 1] !== null || (m + dx >= 1 && m + dx <= 12 && range.includes(m - dx))) {
              newChanges.push({ xbsNodeId: nodeId, monthNum: m as any, facetCode: facet, newValue: newVals[m - 1] });
            }
          }
        }
        break;
      }
      case 'clear': {
        for (const nodeId of targets) {
          for (const m of range) {
            newChanges.push({ xbsNodeId: nodeId, monthNum: m as any, facetCode: facet, newValue: null });
          }
        }
        break;
      }
      case 'sendToPlanning': {
        // Task 2.2 — Copia Forecast → Planned per i nodi/mesi selezionati
        for (const nodeId of targets) {
          const node = this.nodeIndex.get(nodeId);
          if (!node?.data) continue;
          for (let m = 1; m <= 12; m++) {
            const forecastVal = node.data[`fc_m${m}`] ?? null;
            if (forecastVal == null) continue;   // skip se forecast non valorizzato
            newChanges.push({ xbsNodeId: nodeId, monthNum: m as any, facetCode: 'planned', newValue: forecastVal });
          }
        }
        break;
      }
    }

    // Optimistic UI: aggiorna nodeIndex prima di flush
    const prefix = this.FACET_PREFIX[facet];
    for (const ch of newChanges) {
      const node = this.nodeIndex.get(ch.xbsNodeId);
      if (node?.data) node.data[`${prefix}_m${ch.monthNum}`] = ch.newValue;
    }

    // Push changes nel batch normale + flush
    this.pendingChanges.push(...newChanges);
    this.scheduleFlush();
  }
}
