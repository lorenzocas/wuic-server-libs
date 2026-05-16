import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

/**
 * Task 8.4 frontend — Workforce xlsx bulk upload UI.
 *
 * Flow:
 *   1. User seleziona file xlsx → upload (POST /parse)
 *   2. Backend parsing → staging rows + batchId
 *   3. User clicca "Validate" → POST /validate/{batch}
 *   4. UI mostra valid/invalid + error per row invalid
 *   5. User clicca "Commit" → POST /commit/{batch} → MERGE su wf.allocation + auto-pivot-rebuild
 */
@Component({
  selector: 'costcnh-workforce-upload',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, MessageModule, ProgressSpinnerModule, TableModule, TagModule,
  ],
  template: `
    <div class="wfu-host">
      <h2><i class="pi pi-upload"></i> Workforce Allocation — Bulk Upload</h2>

      <div class="wfu-help" *ngIf="!batchId">
        <p>Carica un file Excel con il seguente schema (header riga 1, una row per cella mese):</p>
        <pre>program_id | project_id | year_num | month_num | resource_code | fte_percent | hours | cost_amount | currency_code</pre>
      </div>

      <div class="wfu-step" *ngIf="!batchId">
        <h3>Step 1 — Carica file</h3>
        <input type="file" accept=".xlsx" (change)="onFileSelected($event)" [disabled]="loading" />
        <button pButton label="Upload" icon="pi pi-cloud-upload" (click)="upload()"
                [disabled]="!selectedFile || loading"></button>
        <p-progressSpinner *ngIf="loading" [style]="{width:'20px',height:'20px'}" strokeWidth="3"></p-progressSpinner>
      </div>

      <p-message *ngIf="error" severity="error" [text]="error"></p-message>

      <div class="wfu-step" *ngIf="batchId && !validateResult">
        <h3>Step 2 — Validate</h3>
        <p>Batch <code>{{batchId}}</code> con <strong>{{parsedCount}}</strong> rows caricate.</p>
        <button pButton label="Run validation" icon="pi pi-check-circle" (click)="validate()" [disabled]="loading"></button>
      </div>

      <div class="wfu-step" *ngIf="validateResult">
        <h3>Step 3 — Review</h3>
        <p>
          <p-tag severity="success" [value]="'Valid: ' + validateResult.valid"></p-tag>
          <p-tag severity="danger" [value]="'Invalid: ' + validateResult.invalid"></p-tag>
        </p>

        <button pButton label="Show invalid rows" icon="pi pi-list"
                (click)="loadStaging('invalid')"
                *ngIf="validateResult.invalid > 0"></button>
        <button pButton label="Show all rows" icon="pi pi-table" (click)="loadStaging()"></button>

        <p-table *ngIf="stagingRows.length > 0" [value]="stagingRows" [paginator]="true" [rows]="20"
                 styleClass="wfu-staging-table">
          <ng-template pTemplate="header">
            <tr>
              <th>Status</th><th>Program</th><th>Project</th><th>Year</th><th>Month</th>
              <th>Resource</th><th>FTE%</th><th>Hours</th><th>Cost</th><th>Currency</th>
              <th>Validation Error</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr [class.wfu-invalid]="r.validation_status === 'invalid'">
              <td>
                <p-tag [severity]="r.validation_status === 'valid' ? 'success' : r.validation_status === 'invalid' ? 'danger' : 'info'"
                       [value]="r.validation_status"></p-tag>
              </td>
              <td>{{r.program_id}}</td>
              <td>{{r.project_id}}</td>
              <td>{{r.year_num}}</td>
              <td>{{r.month_num}}</td>
              <td>{{r.resource_code}}</td>
              <td>{{r.fte_percent}}</td>
              <td>{{r.hours}}</td>
              <td>{{r.cost_amount}}</td>
              <td>{{r.currency_code}}</td>
              <td class="wfu-error-text">{{r.validation_error}}</td>
            </tr>
          </ng-template>
        </p-table>

        <div class="wfu-commit" *ngIf="validateResult.valid > 0">
          <h3>Step 4 — Commit</h3>
          <button pButton label="Commit valid rows" icon="pi pi-check" severity="success"
                  (click)="commit()" [disabled]="loading || committed"></button>
          <p-message *ngIf="committed" severity="success" [text]="'Committed ' + committedCount + ' allocations. Pivot rebuilt.'"></p-message>
        </div>
      </div>

      <button pButton label="Start new batch" icon="pi pi-refresh" severity="secondary"
              *ngIf="batchId" (click)="reset()" style="margin-top:16px"></button>
    </div>
  `,
  styles: [`
    .wfu-host { padding: 24px; max-width: 1400px; }
    .wfu-host h2 { display: flex; gap: 8px; align-items: center; }
    .wfu-step { background: var(--surface-card, #fff); padding: 16px; border-radius: 8px;
                margin: 16px 0; border: 1px solid var(--surface-border, #dee2e6);
                display: flex; flex-direction: column; gap: 12px; }
    .wfu-step h3 { margin: 0; font-size: 16px; }
    .wfu-help pre { background: var(--surface-100, #e9ecef); padding: 12px; border-radius: 4px;
                    font-size: 12px; overflow-x: auto; }
    :host ::ng-deep .wfu-staging-table {
      .wfu-invalid { background: var(--red-50, #fff5f5); }
      .wfu-error-text { color: var(--red-700, #b02a37); font-size: 11px; }
      td, th { padding: 4px 8px; font-size: 12px; }
    }
    .wfu-commit { border-top: 1px solid var(--surface-border, #dee2e6); padding-top: 16px; }
  `],
})
export class WorkforceUploadComponent {
  selectedFile: File | null = null;
  loading = false;
  error: string | null = null;

  batchId: string | null = null;
  parsedCount = 0;
  validateResult: { valid: number; invalid: number } | null = null;
  stagingRows: any[] = [];
  committed = false;
  committedCount = 0;

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.error = null;
    }
  }

  async upload(): Promise<void> {
    if (!this.selectedFile) return;
    this.loading = true;
    this.error = null;
    try {
      const form = new FormData();
      form.append('file', this.selectedFile);
      const resp = await fetch('/api/workforce-upload/parse', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error ?? 'Upload failed');
      this.batchId = data.batchId;
      this.parsedCount = data.parsedCount;
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  async validate(): Promise<void> {
    if (!this.batchId) return;
    this.loading = true;
    try {
      const resp = await fetch(`/api/workforce-upload/validate/${this.batchId}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await resp.json();
      this.validateResult = { valid: data.valid, invalid: data.invalid };
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  async loadStaging(status?: 'valid' | 'invalid'): Promise<void> {
    if (!this.batchId) return;
    const url = `/api/workforce-upload/${this.batchId}${status ? `?status=${status}` : ''}`;
    const resp = await fetch(url, { credentials: 'include' });
    const data = await resp.json();
    this.stagingRows = data.rows ?? [];
  }

  async commit(): Promise<void> {
    if (!this.batchId) return;
    this.loading = true;
    try {
      const resp = await fetch(`/api/workforce-upload/commit/${this.batchId}`, {
        method: 'POST', credentials: 'include',
      });
      const data = await resp.json();
      this.committed = true;
      this.committedCount = data.committed ?? 0;
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    } finally {
      this.loading = false;
    }
  }

  reset(): void {
    this.batchId = null;
    this.parsedCount = 0;
    this.validateResult = null;
    this.stagingRows = [];
    this.committed = false;
    this.committedCount = 0;
    this.selectedFile = null;
    this.error = null;
  }
}
