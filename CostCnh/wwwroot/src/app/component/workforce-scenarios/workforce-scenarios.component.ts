import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

/**
 * Task 8.3 frontend — Workforce scenario manager UI.
 *
 * Funzionalità:
 *   - List scenarios per program (draft/active/promoted/archived)
 *   - Branch: dialog per creare nuovo scenario da current state OR da parent
 *   - Promote: bottone "Promote as active" con confirmation
 *   - Diff viewer: select 2 scenari + tabella change_type (added/removed/modified/unchanged)
 */
@Component({
  selector: 'costcnh-workforce-scenarios',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, DialogModule, InputTextModule, MessageModule, SelectModule, TableModule, TagModule,
  ],
  template: `
    <div class="wsc-host">
      <h2><i class="pi pi-share-alt"></i> Workforce Scenarios — Program {{programId}}</h2>

      <p-message *ngIf="error" severity="error" [text]="error"></p-message>

      <div class="wsc-toolbar">
        <button pButton label="Branch new scenario" icon="pi pi-plus" (click)="openBranchDialog()"></button>
        <button pButton label="Diff" icon="pi pi-arrows-h" severity="secondary"
                (click)="openDiffDialog()" [disabled]="scenarios.length < 2"></button>
      </div>

      <p-table [value]="scenarios" [paginator]="true" [rows]="20" styleClass="wsc-table">
        <ng-template pTemplate="header">
          <tr>
            <th>Status</th><th>Code</th><th>Name</th><th>Parent</th>
            <th>Allocations</th><th>Captured</th><th>Promoted</th><th>Actions</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-s>
          <tr>
            <td>
              <p-tag [severity]="statusSeverity(s.status)" [value]="s.status"></p-tag>
              <p-tag *ngIf="s.is_baseline" severity="info" value="baseline"></p-tag>
            </td>
            <td><code>{{s.scenario_code}}</code></td>
            <td>{{s.scenario_name}}</td>
            <td>{{s.parent_code || '—'}}</td>
            <td>{{s.allocation_count}}</td>
            <td>{{s.captured_at_utc | date:'short'}}</td>
            <td>{{s.promoted_at_utc | date:'short'}}</td>
            <td>
              <button pButton icon="pi pi-check" pTooltip="Promote as active"
                      severity="success" size="small"
                      (click)="promote(s)" [disabled]="s.status === 'promoted'"></button>
            </td>
          </tr>
        </ng-template>
      </p-table>

      <!-- Branch dialog -->
      <p-dialog [(visible)]="showBranchDialog" [modal]="true" header="Branch new scenario"
                [style]="{width: '480px'}">
        <div class="wsc-form">
          <label>Scenario code</label>
          <input pInputText [(ngModel)]="newScenario.scenarioCode" placeholder="e.g. BASELINE_2027" />
          <label>Scenario name</label>
          <input pInputText [(ngModel)]="newScenario.scenarioName" />
          <label>Parent scenario (optional)</label>
          <p-select [(ngModel)]="newScenario.parentScenarioId"
                    [options]="parentOptions"
                    optionLabel="label" optionValue="value"
                    placeholder="None (snapshot current state)"></p-select>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Annulla" severity="secondary" (click)="showBranchDialog=false"></button>
          <button pButton label="Branch" icon="pi pi-check"
                  (click)="submitBranch()"
                  [disabled]="!newScenario.scenarioCode || !newScenario.scenarioName"></button>
        </ng-template>
      </p-dialog>

      <!-- Diff dialog -->
      <p-dialog [(visible)]="showDiffDialog" [modal]="true" header="Scenarios diff"
                [style]="{width: '900px'}">
        <div class="wsc-diff-toolbar">
          <p-select [(ngModel)]="diffScenarioA" [options]="parentOptions"
                    optionLabel="label" optionValue="value" placeholder="Scenario A"></p-select>
          <span class="pi pi-arrow-right"></span>
          <p-select [(ngModel)]="diffScenarioB" [options]="parentOptions"
                    optionLabel="label" optionValue="value" placeholder="Scenario B"></p-select>
          <button pButton label="Compute diff" icon="pi pi-search"
                  (click)="loadDiff()"
                  [disabled]="!diffScenarioA || !diffScenarioB"></button>
        </div>

        <p-table *ngIf="diffRows.length > 0" [value]="diffRows" [paginator]="true" [rows]="20"
                 styleClass="wsc-diff-table">
          <ng-template pTemplate="header">
            <tr>
              <th>Type</th><th>Resource</th><th>Month</th>
              <th>FTE A</th><th>FTE B</th><th>ΔFTE</th>
              <th>Cost A</th><th>Cost B</th><th>ΔCost</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-d>
            <tr [class.wsc-added]="d.change_type === 'added'"
                [class.wsc-removed]="d.change_type === 'removed'"
                [class.wsc-modified]="d.change_type === 'modified'">
              <td>
                <p-tag [severity]="changeSeverity(d.change_type)" [value]="d.change_type"></p-tag>
              </td>
              <td>{{d.resource_id}}</td>
              <td>{{d.time_month_id}}</td>
              <td>{{d.fte_a}}</td>
              <td>{{d.fte_b}}</td>
              <td [style.color]="d.fte_delta > 0 ? 'var(--green-700)' : (d.fte_delta < 0 ? 'var(--red-700)' : '')">{{d.fte_delta}}</td>
              <td>{{d.cost_a}}</td>
              <td>{{d.cost_b}}</td>
              <td [style.color]="d.cost_delta > 0 ? 'var(--green-700)' : (d.cost_delta < 0 ? 'var(--red-700)' : '')">{{d.cost_delta}}</td>
            </tr>
          </ng-template>
        </p-table>
      </p-dialog>
    </div>
  `,
  styles: [`
    .wsc-host { padding: 24px; }
    .wsc-toolbar { display: flex; gap: 12px; margin: 16px 0; }
    .wsc-form { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: center; }
    .wsc-diff-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px;
      .pi-arrow-right { color: var(--text-color-secondary); }
    }
    :host ::ng-deep {
      .wsc-table td, .wsc-diff-table td { padding: 4px 8px; font-size: 12px; }
      .wsc-added { background: var(--green-50, #ecfdf3); }
      .wsc-removed { background: var(--red-50, #fff5f5); }
      .wsc-modified { background: var(--orange-50, #fff7e6); }
    }
  `],
})
export class WorkforceScenariosComponent implements OnInit {
  programId: number | null = null;
  scenarios: any[] = [];
  error: string | null = null;

  showBranchDialog = false;
  newScenario: any = { scenarioCode: '', scenarioName: '', parentScenarioId: null };

  showDiffDialog = false;
  diffScenarioA: number | null = null;
  diffScenarioB: number | null = null;
  diffRows: any[] = [];

  get parentOptions(): { label: string; value: number | null }[] {
    return this.scenarios.map((s) => ({ label: `${s.scenario_code} (${s.status})`, value: s.id }));
  }

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const pid = Number(this.route.snapshot.paramMap.get('programId'));
    if (Number.isFinite(pid) && pid > 0) this.programId = pid;
    if (this.programId != null) void this.loadScenarios();
  }

  async loadScenarios(): Promise<void> {
    try {
      const resp: any = await fetch(`/api/workforce-scenario/list/${this.programId}`, { credentials: 'include' }).then((r) => r.json());
      this.scenarios = resp?.scenarios ?? [];
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    }
  }

  openBranchDialog(): void {
    this.newScenario = { scenarioCode: '', scenarioName: '', parentScenarioId: null };
    this.showBranchDialog = true;
  }

  async submitBranch(): Promise<void> {
    if (!this.programId) return;
    try {
      const resp: any = await fetch('/api/workforce-scenario/branch', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: this.programId,
          scenarioCode: this.newScenario.scenarioCode,
          scenarioName: this.newScenario.scenarioName,
          parentScenarioId: this.newScenario.parentScenarioId,
        }),
      }).then((r) => r.json());
      if (resp?.ok) {
        this.showBranchDialog = false;
        await this.loadScenarios();
      }
    } catch (e: any) { this.error = e?.message ?? String(e); }
  }

  async promote(s: any): Promise<void> {
    if (!confirm(`Promote "${s.scenario_code}" come active? (auto-backup verrà creato per safety)`)) return;
    try {
      await fetch(`/api/workforce-scenario/promote/${s.id}`, {
        method: 'POST', credentials: 'include',
      });
      await this.loadScenarios();
    } catch (e: any) { this.error = e?.message ?? String(e); }
  }

  openDiffDialog(): void {
    this.diffScenarioA = this.scenarios[0]?.id ?? null;
    this.diffScenarioB = this.scenarios[1]?.id ?? null;
    this.diffRows = [];
    this.showDiffDialog = true;
  }

  async loadDiff(): Promise<void> {
    if (!this.diffScenarioA || !this.diffScenarioB) return;
    try {
      const resp: any = await fetch(`/api/workforce-scenario/diff?a=${this.diffScenarioA}&b=${this.diffScenarioB}`, {
        credentials: 'include',
      }).then((r) => r.json());
      this.diffRows = resp?.diff ?? [];
    } catch (e: any) { this.error = e?.message ?? String(e); }
  }

  statusSeverity(status: string): any {
    switch (status) {
      case 'promoted': return 'success';
      case 'active': return 'info';
      case 'draft': return 'warn';
      case 'archived': return 'secondary';
      default: return 'secondary';
    }
  }
  changeSeverity(t: string): any {
    switch (t) {
      case 'added': return 'success';
      case 'removed': return 'danger';
      case 'modified': return 'warn';
      default: return 'secondary';
    }
  }
}
