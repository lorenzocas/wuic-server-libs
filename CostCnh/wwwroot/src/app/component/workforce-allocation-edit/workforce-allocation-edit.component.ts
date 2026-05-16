import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { AllocCellChange, WorkforceAllocationEditService, WorkforceAllocRow } from './workforce-allocation-edit.service';

/**
 * Task 8.1 — Workforce Allocation 2D matrix grid (clone PowerEdit pattern, flat).
 *
 * Rows: risorse (cost_center → role → resource).
 * Cols: 12 mesi × 3 measures (FTE / Hours / Cost).
 * Edit: inline cells, debounce flush, optimistic concurrency.
 *
 * Backend:
 *   - GET /api/workforce-alloc/snapshot/{programId}?year=YYYY
 *   - POST /api/workforce-alloc/save-cells
 *
 * Auto-fill cost: trigger SQL `wf.tr_allocation_compute_cost` deriva
 * cost_amount = fte_to_cost(fte_percent, role, year, currency, site) se NULL.
 */
@Component({
  selector: 'costcnh-workforce-allocation-edit',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, SelectModule, MessageModule, ProgressSpinnerModule, TooltipModule,
  ],
  templateUrl: './workforce-allocation-edit.component.html',
  styleUrls: ['./workforce-allocation-edit.component.scss'],
})
export class WorkforceAllocationEditComponent implements OnInit, OnDestroy {
  programId: number | null = null;
  year: number = new Date().getFullYear();
  loading = false;
  error: string | null = null;
  saveInFlight = false;

  rows: WorkforceAllocRow[] = [];
  private rowIndex = new Map<number, WorkforceAllocRow>();

  // Available years dropdown
  get availableYears(): number[] {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now - 3; y <= now + 3; y++) out.push(y);
    return out;
  }

  readonly MEASURE_ORDER = ['fte', 'hours', 'cost'] as const;
  readonly MEASURE_PREFIX: Record<string, string> = { fte: 'fte', hours: 'hrs', cost: 'cost' };
  readonly MEASURE_LABEL: Record<string, string> = { fte: 'FTE%', hours: 'Hrs', cost: 'Cost' };
  readonly MONTH_LABELS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  private pendingChanges: AllocCellChange[] = [];
  private saveDebounceTimer: any = null;

  constructor(
    private route: ActivatedRoute,
    private svc: WorkforceAllocationEditService,
  ) {}

  ngOnInit(): void {
    const pid = Number(this.route.snapshot.paramMap.get('programId'));
    if (Number.isFinite(pid) && pid > 0) this.programId = pid;
    const yr = Number(this.route.snapshot.queryParamMap.get('year'));
    if (Number.isFinite(yr) && yr >= 2000 && yr <= 2200) this.year = yr;

    if (this.programId != null) void this.bootstrap();
    else this.error = 'Missing programId';
  }

  ngOnDestroy(): void {
    if (this.saveDebounceTimer) clearTimeout(this.saveDebounceTimer);
  }

  async bootstrap(): Promise<void> {
    if (this.programId == null) return;
    this.loading = true;
    this.error = null;
    try {
      const snap = await this.svc.loadSnapshot(this.programId, this.year);
      this.rows = snap.rows ?? [];
      this.rowIndex.clear();
      for (const r of this.rows) this.rowIndex.set(r.resource_id, r);
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  async onYearChange(newYear: number): Promise<void> {
    if (newYear === this.year) return;
    if (this.pendingChanges.length > 0) await this.flushChanges();
    this.year = newYear;
    await this.bootstrap();
  }

  getCellValue(row: WorkforceAllocRow, measure: string, monthNum: number): number | null {
    const prefix = this.MEASURE_PREFIX[measure];
    return row[`${prefix}_m${monthNum}`] ?? null;
  }

  /**
   * Task 11.6 — euristica per indicare se il cost cell è auto-derived dal trigger
   * `wf.tr_allocation_compute_cost` (fte_to_cost). Se la row ha fte_percent
   * impostato e cost_amount valorizzato, assumiamo che il trigger lo abbia
   * derivato. Display badge "calculator" icon per l'utente.
   */
  hasAutoFillRate(row: WorkforceAllocRow): boolean {
    // Se almeno 1 fte_mN > 0 e 1 cost_mN > 0 in stessa row → probabilmente derived
    let hasFte = false, hasCost = false;
    for (let m = 1; m <= 12; m++) {
      if ((row[`fte_m${m}`] ?? 0) > 0) hasFte = true;
      if ((row[`cost_m${m}`] ?? 0) > 0) hasCost = true;
      if (hasFte && hasCost) return true;
    }
    return false;
  }

  onCellEdit(row: WorkforceAllocRow, measure: string, monthNum: number, newValue: any): void {
    const prefix = this.MEASURE_PREFIX[measure];
    const colKey = `${prefix}_m${monthNum}`;
    const parsed = newValue === '' || newValue == null ? null : Number(newValue);
    if (parsed != null && !Number.isFinite(parsed)) return;

    row[colKey] = parsed;

    const existingIdx = this.pendingChanges.findIndex(
      (c) => c.resourceId === row.resource_id && c.monthNum === monthNum && c.measureCode === measure
    );
    const change: AllocCellChange = {
      resourceId: row.resource_id,
      monthNum: monthNum as any,
      measureCode: measure as any,
      newValue: parsed,
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
      const resp = await this.svc.saveCells(this.programId, this.year, batch);
      for (const updated of resp.updatedRows || []) {
        const existing = this.rowIndex.get(updated.resource_id);
        if (existing) Object.assign(existing, updated);
      }
    } catch (e: any) {
      console.error('[WorkforceAlloc] save failed', e);
      this.error = `Save error: ${e?.message ?? e}`;
      this.pendingChanges.unshift(...batch);
    } finally {
      this.saveInFlight = false;
    }
  }
}
