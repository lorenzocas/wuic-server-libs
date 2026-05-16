import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface WorkforceAllocRow {
  id: number;
  program_id: number;
  year_num: number;
  resource_id: number;
  resource_code: string;
  resource_name: string;
  role_code: string;
  cost_center_code: string;
  [key: string]: any;  // fte_m1..12, hrs_m1..12, cost_m1..12
}

export interface WorkforceAllocSnapshot {
  ok: boolean;
  programId: number;
  year: number;
  measures: string[];
  editableMeasures: string[];
  rowCount: number;
  rows: WorkforceAllocRow[];
}

export interface AllocCellChange {
  resourceId: number;
  monthNum: number;
  measureCode: 'fte' | 'hours' | 'cost';
  newValue: number | null;
  lastSeenUtc?: string;
}

export interface AllocSaveResponse {
  ok: boolean;
  applied: number;
  updatedRows: WorkforceAllocRow[];
}

@Injectable({ providedIn: 'root' })
export class WorkforceAllocationEditService {
  constructor(private http: HttpClient) {}

  loadSnapshot(programId: number, year: number): Promise<WorkforceAllocSnapshot> {
    return firstValueFrom(this.http.get<WorkforceAllocSnapshot>(
      `/api/workforce-alloc/snapshot/${programId}?year=${year}`,
      { withCredentials: true }
    ));
  }

  saveCells(programId: number, year: number, changes: AllocCellChange[], projectId?: number): Promise<AllocSaveResponse> {
    return firstValueFrom(this.http.post<AllocSaveResponse>(
      '/api/workforce-alloc/save-cells',
      { programId, year, projectId, changes },
      { withCredentials: true }
    ));
  }
}
