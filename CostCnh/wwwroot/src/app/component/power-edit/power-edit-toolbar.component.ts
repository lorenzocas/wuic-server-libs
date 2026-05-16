import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';

/**
 * Toolbar tools del legacy PowerEdit (Phase H.5):
 *   - Distribute % : prendi un valore totale e distribuiscilo su N mesi con %
 *   - Copy        : copia valore di una cella su altre celle (row/col/range)
 *   - Shift       : sposta valori avanti/indietro N mesi
 *   - Clear       : azzera celle selezionate
 *
 * Le operazioni sono CLIENT-SIDE: producono un array di `PowerEditCellChange[]`
 * che il parent (PowerEditComponent) accumula in pendingChanges e flusha via
 * il save-cells endpoint normale. Nessun nuovo backend richiesto.
 *
 * UI: dropdown "tool" + parametri specifici per tool + bottone "Apply selection".
 */
export type ToolKind = 'distribute' | 'copy' | 'shift' | 'clear' | 'sendToPlanning';

export interface ToolParams {
  kind: ToolKind;
  // distribute
  totalValue?: number;
  // distribute / copy / shift / clear: target month range (1..12)
  fromMonth?: number;
  toMonth?: number;
  // copy
  sourceMonth?: number;
  // shift
  shiftBy?: number;     // months, can be negative
  // common
  facet?: 'planned' | 'actual' | 'forecast';
}

@Component({
  selector: 'costcnh-power-edit-toolbar',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputNumberModule, SelectModule, DialogModule, TooltipModule,
  ],
  template: `
    <div class="pet-bar">
      <button pButton type="button" icon="pi pi-percentage" label="Distribute %"
              (click)="openDistribute()"
              pTooltip="Distribuisci un totale su N mesi (es. 12000 → 1000/mese)"
              tooltipPosition="bottom"
              [disabled]="!hasSelection">
      </button>
      <button pButton type="button" icon="pi pi-copy" label="Copy"
              (click)="openCopy()"
              pTooltip="Copia il valore di un mese sui mesi target"
              tooltipPosition="bottom"
              [disabled]="!hasSelection">
      </button>
      <button pButton type="button" icon="pi pi-arrow-right" label="Shift"
              (click)="openShift()"
              pTooltip="Sposta i valori avanti/indietro nel tempo"
              tooltipPosition="bottom"
              [disabled]="!hasSelection">
      </button>
      <button pButton type="button" icon="pi pi-eraser" label="Clear" severity="danger"
              (click)="openClear()"
              pTooltip="Azzera i valori dei mesi target"
              tooltipPosition="bottom"
              [disabled]="!hasSelection">
      </button>

      <!-- Task 2.2 SendToPlanning: copia Forecast → Planned in bulk -->
      <button pButton type="button" icon="pi pi-send" label="Send to Planning"
              (click)="openSendToPlanning()"
              pTooltip="Copia Forecast → Planned per i mesi selezionati (legacy SendToPlanning)"
              tooltipPosition="bottom"
              [disabled]="!hasSelection">
      </button>

      <span class="pet-divider"></span>

      <span class="pet-selection" *ngIf="hasSelection">
        <i class="pi pi-check-circle"></i>
        {{ selectionCount }} nodo/i selezionato/i
      </span>
      <span class="pet-selection pet-selection--empty" *ngIf="!hasSelection">
        <i class="pi pi-info-circle"></i>
        Seleziona almeno un nodo leaf
      </span>
    </div>

    <!-- ─── Distribute dialog ─────────────────────────────────────────────── -->
    <p-dialog [(visible)]="showDistribute" [modal]="true" [closable]="true"
              header="Distribute % — distribuzione lineare su mesi"
              [style]="{width: '420px'}">
      <div class="pet-form">
        <label>Facet</label>
        <p-select [(ngModel)]="form.facet" [options]="facetOptions" optionLabel="label" optionValue="value"></p-select>

        <label>Total value</label>
        <p-inputNumber [(ngModel)]="form.totalValue" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="4"></p-inputNumber>

        <label>From month (1..12)</label>
        <p-inputNumber [(ngModel)]="form.fromMonth" [min]="1" [max]="12"></p-inputNumber>

        <label>To month (1..12)</label>
        <p-inputNumber [(ngModel)]="form.toMonth" [min]="1" [max]="12"></p-inputNumber>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Annulla" severity="secondary" (click)="showDistribute=false"></button>
        <button pButton label="Apply" icon="pi pi-check" (click)="applyDistribute()"
                [disabled]="!isValidDistribute()"></button>
      </ng-template>
    </p-dialog>

    <!-- ─── Copy dialog ───────────────────────────────────────────────────── -->
    <p-dialog [(visible)]="showCopy" [modal]="true" [closable]="true"
              header="Copy — copia valore mese-sorgente sui mesi target"
              [style]="{width: '420px'}">
      <div class="pet-form">
        <label>Facet</label>
        <p-select [(ngModel)]="form.facet" [options]="facetOptions" optionLabel="label" optionValue="value"></p-select>

        <label>Source month (1..12)</label>
        <p-inputNumber [(ngModel)]="form.sourceMonth" [min]="1" [max]="12"></p-inputNumber>

        <label>Target from month</label>
        <p-inputNumber [(ngModel)]="form.fromMonth" [min]="1" [max]="12"></p-inputNumber>

        <label>Target to month</label>
        <p-inputNumber [(ngModel)]="form.toMonth" [min]="1" [max]="12"></p-inputNumber>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Annulla" severity="secondary" (click)="showCopy=false"></button>
        <button pButton label="Apply" icon="pi pi-check" (click)="applyCopy()"
                [disabled]="!isValidCopy()"></button>
      </ng-template>
    </p-dialog>

    <!-- ─── Shift dialog ──────────────────────────────────────────────────── -->
    <p-dialog [(visible)]="showShift" [modal]="true" [closable]="true"
              header="Shift — sposta valori avanti/indietro"
              [style]="{width: '420px'}">
      <div class="pet-form">
        <label>Facet</label>
        <p-select [(ngModel)]="form.facet" [options]="facetOptions" optionLabel="label" optionValue="value"></p-select>

        <label>Shift by (mesi, negativo = indietro)</label>
        <p-inputNumber [(ngModel)]="form.shiftBy" [min]="-12" [max]="12"></p-inputNumber>

        <label>From month</label>
        <p-inputNumber [(ngModel)]="form.fromMonth" [min]="1" [max]="12"></p-inputNumber>

        <label>To month</label>
        <p-inputNumber [(ngModel)]="form.toMonth" [min]="1" [max]="12"></p-inputNumber>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Annulla" severity="secondary" (click)="showShift=false"></button>
        <button pButton label="Apply" icon="pi pi-check" (click)="applyShift()"
                [disabled]="!isValidShift()"></button>
      </ng-template>
    </p-dialog>

    <!-- ─── Clear dialog ──────────────────────────────────────────────────── -->
    <p-dialog [(visible)]="showClear" [modal]="true" [closable]="true"
              header="Clear — azzera valori"
              [style]="{width: '420px'}">
      <div class="pet-form">
        <label>Facet</label>
        <p-select [(ngModel)]="form.facet" [options]="facetOptions" optionLabel="label" optionValue="value"></p-select>

        <label>From month</label>
        <p-inputNumber [(ngModel)]="form.fromMonth" [min]="1" [max]="12"></p-inputNumber>

        <label>To month</label>
        <p-inputNumber [(ngModel)]="form.toMonth" [min]="1" [max]="12"></p-inputNumber>
      </div>
      <ng-template pTemplate="footer">
        <button pButton label="Annulla" severity="secondary" (click)="showClear=false"></button>
        <button pButton label="Apply" icon="pi pi-eraser" severity="danger" (click)="applyClear()"
                [disabled]="!isValidClear()"></button>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    .pet-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 12px;
      background: var(--surface-card, #fff);
      border-bottom: 1px solid var(--surface-border, #dee2e6);
    }
    .pet-divider { width: 1px; height: 24px; background: var(--surface-border, #dee2e6); margin: 0 8px; }
    .pet-selection {
      font-size: 12px; color: var(--green-700, #1e7e34);
      display: inline-flex; align-items: center; gap: 4px;
      &--empty { color: var(--text-color-secondary, #6c757d); }
    }
    .pet-form {
      display: grid; grid-template-columns: 140px 1fr; gap: 10px 12px;
      align-items: center; padding: 8px 0;
      label { font-weight: 500; font-size: 13px; }
      p-select, p-inputNumber { width: 100%; }
    }
  `],
})
export class PowerEditToolbarComponent {
  @Input() hasSelection = false;
  @Input() selectionCount = 0;
  /** Default facet abilitati nel select (override-abile dal parent via editableFacets). */
  @Input() facetOptions: { label: string; value: string }[] = [
    { label: 'Planned',  value: 'planned'  },
    { label: 'Actual',   value: 'actual'   },
    { label: 'Forecast', value: 'forecast' },
  ];

  /** Tool eventi emessi al parent (PowerEditComponent.onToolApply). */
  @Output() toolApply = new EventEmitter<ToolParams>();

  // Dialog visibility
  showDistribute = false;
  showCopy = false;
  showShift = false;
  showClear = false;

  // Shared form model
  form: ToolParams = { kind: 'distribute', facet: 'planned' };

  openDistribute(): void {
    this.form = { kind: 'distribute', facet: 'planned', totalValue: 0, fromMonth: 1, toMonth: 12 };
    this.showDistribute = true;
  }
  openCopy(): void {
    this.form = { kind: 'copy', facet: 'planned', sourceMonth: 1, fromMonth: 2, toMonth: 12 };
    this.showCopy = true;
  }
  openShift(): void {
    this.form = { kind: 'shift', facet: 'planned', shiftBy: 1, fromMonth: 1, toMonth: 12 };
    this.showShift = true;
  }
  openClear(): void {
    this.form = { kind: 'clear', facet: 'planned', fromMonth: 1, toMonth: 12 };
    this.showClear = true;
  }

  // Task 2.2 — SendToPlanning: triggera immediato (no dialog, è un copy forecast→planned)
  openSendToPlanning(): void {
    this.toolApply.emit({ kind: 'sendToPlanning', facet: 'planned', fromMonth: 1, toMonth: 12 });
  }

  isValidDistribute(): boolean {
    return this.form.totalValue != null && this.form.totalValue !== 0
        && this.form.fromMonth! >= 1 && this.form.toMonth! <= 12
        && this.form.fromMonth! <= this.form.toMonth!;
  }
  isValidCopy(): boolean {
    return this.form.sourceMonth! >= 1 && this.form.sourceMonth! <= 12
        && this.form.fromMonth! >= 1 && this.form.toMonth! <= 12
        && this.form.fromMonth! <= this.form.toMonth!;
  }
  isValidShift(): boolean {
    return this.form.shiftBy != null && this.form.shiftBy !== 0
        && this.form.fromMonth! >= 1 && this.form.toMonth! <= 12
        && this.form.fromMonth! <= this.form.toMonth!;
  }
  isValidClear(): boolean {
    return this.form.fromMonth! >= 1 && this.form.toMonth! <= 12
        && this.form.fromMonth! <= this.form.toMonth!;
  }

  applyDistribute(): void {
    this.toolApply.emit({ ...this.form, kind: 'distribute' });
    this.showDistribute = false;
  }
  applyCopy(): void {
    this.toolApply.emit({ ...this.form, kind: 'copy' });
    this.showCopy = false;
  }
  applyShift(): void {
    this.toolApply.emit({ ...this.form, kind: 'shift' });
    this.showShift = false;
  }
  applyClear(): void {
    this.toolApply.emit({ ...this.form, kind: 'clear' });
    this.showClear = false;
  }
}
