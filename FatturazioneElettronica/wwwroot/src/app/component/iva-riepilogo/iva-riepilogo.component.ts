import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal, inject, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface IvaRow {
  aliquota: number;
  imponibile_vendite: number;
  iva_vendite: number;
  num_fatture_emesse: number;
  imponibile_acquisti: number;
  iva_acquisti: number;
  num_fatture_ricevute: number;
  saldo_iva: number;
}

interface IvaTotali {
  imponibile_vendite: number;
  iva_vendite: number;
  num_fatture_emesse: number;
  imponibile_acquisti: number;
  iva_acquisti: number;
  num_fatture_ricevute: number;
  saldo_iva: number;
  a_debito: boolean;
  a_credito: boolean;
}

/**
 * Workflow #17: Riepilogo IVA periodico (LIPE-style).
 *
 * Route: `#/iva/riepilogo`
 *
 * UI:
 *   - Filtri: anno (numerico) + periodo (YEAR / Q1..Q4 / 01..12)
 *   - Tabella per aliquota: imponibile / iva / num fatture (vendite + acquisti) + saldo
 *   - Riga totali in fondo + stato saldo (a debito / a credito)
 *
 * Backend: GET /api/iva/riepilogo?anno=&periodo=
 */
@Component({
  selector: 'wuic-iva-riepilogo',
  standalone: true,
  imports: [
    CommonModule, FormsModule, SelectModule, InputNumberModule, TableModule,
    ButtonModule, ProgressSpinnerModule
  ],
  providers: [CurrencyPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="iva-riepilogo-page" id="app_iva_riepilogo_page">
      <header class="iva-riepilogo__header">
        <h1>Riepilogo IVA periodico</h1>
        <p class="iva-riepilogo__subtitle">
          Aggregato per aliquota delle fatture emesse e ricevute nel periodo selezionato.
          Saldo IVA a debito (da versare) o a credito (da compensare).
        </p>
      </header>

      <div class="iva-riepilogo__filters">
        <div class="iva-riepilogo__field">
          <label for="iva_anno">Anno</label>
          <p-inputNumber [(ngModel)]="anno" [min]="2000" [max]="2099"
            [useGrouping]="false" inputId="iva_anno"
            [style]="{ width: '120px' }"></p-inputNumber>
        </div>
        <div class="iva-riepilogo__field">
          <label for="iva_periodo">Periodo</label>
          <p-select [options]="periodoOptions" optionLabel="label" optionValue="value"
            [(ngModel)]="periodo" inputId="iva_periodo"
            [style]="{ width: '180px' }"></p-select>
        </div>
        <p-button label="Calcola"
                  icon="pi pi-calculator"
                  [attr.id]="'iva_btn_calcola'"
                  id="iva_btn_calcola"
                  [loading]="loading()"
                  (onClick)="loadRiepilogo()"></p-button>
      </div>

      <div *ngIf="loading()" class="iva-riepilogo__loading">
        <p-progressSpinner [style]="{ width: '40px', height: '40px' }"></p-progressSpinner>
        <span>Calcolo aggregati in corso...</span>
      </div>

      <div *ngIf="!loading() && errorMsg()" class="iva-riepilogo__error" id="iva_error">
        {{ errorMsg() }}
      </div>

      <div *ngIf="!loading() && !errorMsg() && !rows().length && hasLoaded()"
           class="iva-riepilogo__empty" id="iva_empty">
        Nessun dato per il periodo selezionato.
      </div>

      <div *ngIf="!loading() && !errorMsg() && rows().length"
           class="iva-riepilogo__results"
           id="iva_results">
        <p-table [value]="rows()" styleClass="p-datatable-sm">
          <ng-template pTemplate="header">
            <tr>
              <th rowspan="2" class="iva-th-aliquota">Aliquota</th>
              <th colspan="3" class="iva-th-vendite">Vendite (a debito)</th>
              <th colspan="3" class="iva-th-acquisti">Acquisti (a credito)</th>
              <th rowspan="2" class="iva-th-saldo">Saldo IVA</th>
            </tr>
            <tr>
              <th>Imponibile</th><th>IVA</th><th>n. fatture</th>
              <th>Imponibile</th><th>IVA</th><th>n. fatture</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr [attr.data-aliquota]="row.aliquota">
              <td class="iva-cell-aliquota">{{ row.aliquota | number:'1.2-2' }}%</td>
              <td class="iva-cell-num">{{ row.imponibile_vendite | number:'1.2-2' }}</td>
              <td class="iva-cell-num">{{ row.iva_vendite | number:'1.2-2' }}</td>
              <td class="iva-cell-num">{{ row.num_fatture_emesse }}</td>
              <td class="iva-cell-num">{{ row.imponibile_acquisti | number:'1.2-2' }}</td>
              <td class="iva-cell-num">{{ row.iva_acquisti | number:'1.2-2' }}</td>
              <td class="iva-cell-num">{{ row.num_fatture_ricevute }}</td>
              <td class="iva-cell-num"
                  [class.iva-debito]="row.saldo_iva > 0"
                  [class.iva-credito]="row.saldo_iva < 0">
                {{ row.saldo_iva | number:'1.2-2' }}
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="footer" *ngIf="totali()">
            <tr class="iva-row-totali" [attr.id]="'iva_totali'">
              <td><strong>Totali</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.imponibile_vendite | number:'1.2-2' }}</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.iva_vendite | number:'1.2-2' }}</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.num_fatture_emesse }}</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.imponibile_acquisti | number:'1.2-2' }}</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.iva_acquisti | number:'1.2-2' }}</strong></td>
              <td class="iva-cell-num"><strong>{{ totali()!.num_fatture_ricevute }}</strong></td>
              <td class="iva-cell-num"
                  [class.iva-debito]="totali()!.a_debito"
                  [class.iva-credito]="totali()!.a_credito">
                <strong [attr.id]="'iva_saldo_finale'">{{ totali()!.saldo_iva | number:'1.2-2' }}</strong>
                <span class="iva-badge" *ngIf="totali()!.a_debito"
                      [attr.data-saldo]="'debito'">a debito</span>
                <span class="iva-badge" *ngIf="totali()!.a_credito"
                      [attr.data-saldo]="'credito'">a credito</span>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>
  `,
  styles: [`
    .iva-riepilogo-page { padding: 24px; max-width: 1280px; margin: 0 auto; }
    .iva-riepilogo__header h1 { margin: 0 0 4px 0; font-size: 26px; color: #0f172a; }
    .iva-riepilogo__subtitle { color: #6b7280; margin: 0 0 24px 0; max-width: 760px; }
    .iva-riepilogo__filters { display: flex; gap: 16px; align-items: end; margin-bottom: 24px; flex-wrap: wrap; }
    .iva-riepilogo__field { display: flex; flex-direction: column; gap: 4px; }
    .iva-riepilogo__field label { font-size: 12px; color: #475569; font-weight: 500; }
    .iva-riepilogo__loading { display: flex; gap: 12px; align-items: center; padding: 32px; }
    .iva-riepilogo__error { padding: 16px; background: #fee2e2; color: #991b1b; border-radius: 6px; }
    .iva-riepilogo__empty { padding: 32px; text-align: center; color: #6b7280; font-style: italic;
                            background: #f9fafb; border: 1px dashed #e5e7eb; border-radius: 6px; }
    .iva-th-aliquota { background: #f3f4f6 !important; vertical-align: middle !important; }
    .iva-th-vendite { background: #fef3c7 !important; text-align: center !important; }
    .iva-th-acquisti { background: #dcfce7 !important; text-align: center !important; }
    .iva-th-saldo { background: #dbeafe !important; vertical-align: middle !important; text-align: center !important; }
    .iva-cell-aliquota { font-weight: 600; }
    .iva-cell-num { text-align: right; font-variant-numeric: tabular-nums; }
    .iva-debito { color: #dc2626; font-weight: 600; }
    .iva-credito { color: #16a34a; font-weight: 600; }
    .iva-row-totali { background: #f8fafc !important; border-top: 2px solid #cbd5e1 !important; }
    .iva-badge {
      display: inline-block; margin-left: 6px;
      padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .iva-badge[data-saldo="debito"] { background: #fee2e2; color: #991b1b; }
    .iva-badge[data-saldo="credito"] { background: #dcfce7; color: #166534; }
  `]
})
export class IvaRiepilogoComponent implements OnInit {
  private http = inject(HttpClient);

  anno = new Date().getFullYear();
  periodo: string = 'YEAR';
  readonly periodoOptions = [
    { label: 'Anno intero', value: 'YEAR' },
    { label: 'Q1 (gen-mar)', value: 'Q1' },
    { label: 'Q2 (apr-giu)', value: 'Q2' },
    { label: 'Q3 (lug-set)', value: 'Q3' },
    { label: 'Q4 (ott-dic)', value: 'Q4' },
    { label: 'Gennaio', value: '01' }, { label: 'Febbraio', value: '02' },
    { label: 'Marzo', value: '03' },   { label: 'Aprile', value: '04' },
    { label: 'Maggio', value: '05' },  { label: 'Giugno', value: '06' },
    { label: 'Luglio', value: '07' },  { label: 'Agosto', value: '08' },
    { label: 'Settembre', value: '09' }, { label: 'Ottobre', value: '10' },
    { label: 'Novembre', value: '11' }, { label: 'Dicembre', value: '12' }
  ];

  rows = signal<IvaRow[]>([]);
  totali = signal<IvaTotali | null>(null);
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  hasLoaded = signal(false);

  ngOnInit() {
    // Auto-load del periodo corrente al boot
    this.loadRiepilogo();
  }

  async loadRiepilogo() {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const apiBase = environment.api_url || '/api/';
      const url = `${apiBase}iva/riepilogo?anno=${this.anno}&periodo=${this.periodo}`;
      const resp = await firstValueFrom(this.http.get<any>(url));
      if (resp?.ok) {
        this.rows.set(resp.results || []);
        this.totali.set(resp.totali || null);
      } else {
        this.errorMsg.set(resp?.error || 'Risposta inattesa dal server');
        this.rows.set([]); this.totali.set(null);
      }
      this.hasLoaded.set(true);
    } catch (e: any) {
      this.errorMsg.set(`Errore caricamento: ${e?.message || e}`);
      this.rows.set([]); this.totali.set(null);
      this.hasLoaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
