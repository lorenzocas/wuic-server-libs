import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Shape ritornata da `cp.sp_load_power_edit` / `cp.sp_save_power_edit_cells`.
 * Tutte le 48 value columns sono number | null.
 */
export interface PowerEditPivotRow {
  id: number;
  program_id: number;
  year_num: number;
  tree_kind_id: number;
  xbs_node_id: number;
  xbs_path_str: string;          // HIERARCHYID serialized "/1/2/"
  xbs_depth: number;
  xbs_code: string | null;
  xbs_name: string | null;
  parent_node_id: number | null;
  is_leaf: 0 | 1;
  // 4 facet * 12 months — names match SQL columns exactly
  [key: string]: any;            // pl_m1..pl_m12, ac_m1..ac_m12, fc_m1..fc_m12, bl_m1..bl_m12
}

export interface PowerEditSnapshot {
  ok: boolean;
  programId: number;
  year: number;
  scenarioId?: number | null;    // H.10: NULL = cached pivot, INT = on-the-fly
  mode?: string;                 // 'all-scenarios (cached)' | 'scenario-scoped (on-the-fly)'
  facets: string[];              // ["planned","actual","forecast","baseline"]
  editableFacets: string[];      // ["planned","actual","forecast"]
  rowCount: number;
  rows: PowerEditPivotRow[];
}

export interface PowerEditCellChange {
  xbsNodeId: number;
  monthNum: number;              // 1..12
  facetCode: 'planned' | 'actual' | 'forecast';   // baseline RO
  newValue: number | null;
}

export interface PowerEditSaveResponse {
  ok: boolean;
  applied: number;
  failed: number;
  updatedRows: PowerEditPivotRow[];  // ancestor rows ricalcolate server-side
}

/** Lock outcome from SpreadsheetController.lock-range. */
export interface PowerEditLockResponse {
  ok: boolean;
  outcome: 'acquired' | 'refreshed' | 'conflict' | string;
  lockToken?: string;
  lockId?: number;
  lockExpiresUtc?: string;
  conflictUserId?: number | null;
}

@Injectable({ providedIn: 'root' })
export class PowerEditService {
  constructor(private http: HttpClient) {}

  /** Load full pivot snapshot per (program, year, scenario?, target currency?). H.10 + I.11.4. */
  loadSnapshot(programId: number, year: number, scenarioId?: number, targetCurrencyId?: number): Promise<PowerEditSnapshot> {
    let url = `/api/power-edit/snapshot/${programId}?year=${year}`;
    if (scenarioId != null) url += `&scenarioId=${scenarioId}`;
    if (targetCurrencyId != null) url += `&targetCurrencyId=${targetCurrencyId}`;
    return firstValueFrom(this.http.get<PowerEditSnapshot>(url, { withCredentials: true }));
  }

  /** Batch save changes. H.10: passa scenarioId nello scope. */
  saveCells(programId: number, year: number, changes: PowerEditCellChange[],
            lockToken?: string, scenarioId?: number): Promise<PowerEditSaveResponse> {
    return firstValueFrom(this.http.post<PowerEditSaveResponse>(
      '/api/power-edit/save-cells',
      { programId, year, scenarioId, changes, lockToken },
      { withCredentials: true }
    ));
  }

  /** Acquire pessimistic lock per (program, scenario?, year?). */
  acquireLock(programId: number, scenarioId?: number, year?: number): Promise<PowerEditLockResponse> {
    return firstValueFrom(this.http.post<PowerEditLockResponse>(
      `/api/spreadsheet/lock-range/${programId}`,
      { scenarioId, yearNum: year },
      { withCredentials: true }
    ));
  }

  /** Heartbeat: extends TTL. */
  heartbeat(lockToken: string): Promise<{ ok: boolean; lockExpiresUtc?: string }> {
    return firstValueFrom(this.http.post<any>('/api/spreadsheet/heartbeat',
      { lockToken }, { withCredentials: true }));
  }

  /** Release lock (best-effort, fire-and-forget). */
  releaseLock(lockToken: string): Promise<{ ok: boolean; released?: number }> {
    return firstValueFrom(this.http.post<any>('/api/spreadsheet/release-lock',
      { lockToken }, { withCredentials: true }));
  }
}
