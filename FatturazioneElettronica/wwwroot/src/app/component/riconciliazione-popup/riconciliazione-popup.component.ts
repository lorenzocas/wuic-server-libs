import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal, computed, inject, ChangeDetectionStrategy, OnInit, Optional } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../environments/environment';

interface Movimento {
  id: number;
  data_operazione: string;
  importo: number;
  causale: string;
  descrizione: string;
  nome_controparte: string;
  riferimento: string;
  import_batch_id: string;
}

interface Candidate {
  id: number;
  tipo: string;
  data_scadenza: string;
  importo: number;
  importo_pagato: number;
  cliente_id: number | null;
  fornitore_id: number | null;
  fattura_inviata_id: number | null;
  fattura_ricevuta_id: number | null;
  controparte: string;
  numero_fattura: string;
  delta_giorni: number;
  delta_importo: number;
}

interface SuggestionItem {
  movimento: Movimento;
  candidates: Candidate[];
  // UI state
  selectedScadenzaId?: number | null;  // null = skip
}

/**
 * Workflow #21C: Popup riconciliazione movimenti bancari ↔ scadenze.
 *
 * Si apre in 2 modalita':
 *   A) **Dialog modal sopra una list grid** (preferito) — invocato via
 *      `wtoolbox.dialogService.open(RiconciliazionePopupComponent, { data: { batch_id } })`
 *      dalla custom action post-upload su movimenti_bancari. Il dialog
 *      sovrappone la list, l'utente conferma o annulla, al close il
 *      datasource viene refresh-ato. NESSUN cambio route.
 *   B) **Route standalone** `#/riconciliazione/popup?batch=<id>` — fallback
 *      per accesso diretto / bookmark. Utile per riprendere una
 *      riconciliazione in pending.
 *
 * UI flow comune:
 *   1. POST /api/riconciliazione/suggestions { batch_id, tolGiorni, tolImporto }
 *   2. Mostra candidate ordinate per delta_importo + delta_giorni
 *   3. Auto-select primo candidato se Δ0gg/Δ<10c
 *   4. Conferma/skip per riga
 *   5. POST /api/riconciliazione/bulkApply { pairs[] }
 *   6. Modalita' A: dialog.close({ applied: N }); B: router.navigate(/movimenti_bancari/list)
 */
@Component({
  selector: 'wuic-riconciliazione-popup',
  standalone: true,
  imports: [
    CommonModule, FormsModule, SelectModule, TableModule,
    ButtonModule, ProgressSpinnerModule, TagModule
  ],
  providers: [CurrencyPipe, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ric-popup">
      <header class="ric-popup__header">
        <h1>Riconciliazione movimenti bancari</h1>
        <p class="ric-popup__subtitle">
          {{ batchId() ? 'Batch import: ' + batchId() : 'Tutti i movimenti UNMATCHED' }}
          — Auto-match per importo (±0.50€) + data (±7gg).
        </p>
      </header>

      @if (loading()) {
        <div class="ric-popup__loading">
          <p-progressSpinner></p-progressSpinner>
          <p>Caricamento suggerimenti…</p>
        </div>
      } @else if (items().length === 0) {
        <div class="ric-popup__empty">
          <i class="pi pi-check-circle" style="font-size: 3rem; color: #16a34a;"></i>
          <h2>Nessun movimento da riconciliare</h2>
          <p>Tutti i movimenti del batch sono gia stati abbinati o non hanno scadenze candidate.</p>
          <p-button label="Torna a movimenti" icon="pi pi-arrow-left" (onClick)="goBack()"></p-button>
        </div>
      } @else {
        <div class="ric-popup__summary">
          <span class="ric-popup__counter">
            {{ pendingCount() }} / {{ items().length }} pending
          </span>
          <span class="ric-popup__counter ric-popup__counter--match">
            {{ matchedCount() }} pronti per applicazione
          </span>
        </div>

        <p-table [value]="items()" styleClass="p-datatable-sm" [rowHover]="true">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 110px">Data</th>
              <th style="width: 130px; text-align: right">Importo</th>
              <th>Descrizione movimento</th>
              <th style="width: 360px">Scadenza candidata</th>
              <th style="width: 90px">Match</th>
              <th style="width: 80px">Azione</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr [ngClass]="{
              'ric-row--matched': item.selectedScadenzaId,
              'ric-row--skipped': item.selectedScadenzaId === null
            }">
              <td>{{ item.movimento.data_operazione | date:'dd/MM/yyyy' }}</td>
              <td style="text-align: right">
                <span [ngClass]="{
                  'ric-amt--in': item.movimento.importo >= 0,
                  'ric-amt--out': item.movimento.importo < 0
                }">{{ item.movimento.importo | currency:'EUR':'symbol':'1.2-2':'it-IT' }}</span>
              </td>
              <td>
                <div class="ric-desc">
                  <strong>{{ item.movimento.causale }}</strong>
                  @if (item.movimento.nome_controparte) {
                    — {{ item.movimento.nome_controparte }}
                  }
                </div>
                <div class="ric-desc-sub">{{ item.movimento.descrizione }}</div>
              </td>
              <td>
                @if (item.candidates.length > 0) {
                  <p-select
                    [options]="candidateOptions(item)"
                    optionLabel="label"
                    optionValue="value"
                    [(ngModel)]="item.selectedScadenzaId"
                    placeholder="Seleziona scadenza"
                    [style]="{ width: '100%' }">
                  </p-select>
                } @else {
                  <em>Nessuna scadenza candidata trovata</em>
                }
              </td>
              <td>
                @if (item.selectedScadenzaId && item.selectedScadenzaId > 0) {
                  <p-tag value="OK" severity="success"></p-tag>
                } @else if (item.selectedScadenzaId === null) {
                  <p-tag value="SKIP" severity="warn"></p-tag>
                } @else {
                  <p-tag value="?" severity="info"></p-tag>
                }
              </td>
              <td>
                <p-button
                  icon="pi pi-times"
                  severity="secondary"
                  size="small"
                  [text]="true"
                  (onClick)="setSkip(item)"
                  pTooltip="Salta questo movimento">
                </p-button>
              </td>
            </tr>
          </ng-template>
        </p-table>

        <footer class="ric-popup__footer">
          <p-button label="Annulla" icon="pi pi-times" severity="secondary"
            (onClick)="goBack()"></p-button>
          <p-button label="Auto-match suggeriti" icon="pi pi-bolt"
            severity="info" [text]="true"
            (onClick)="autoMatchAll()"></p-button>
          <p-button [label]="'Applica ' + matchedCount() + ' match'"
            icon="pi pi-check" severity="success"
            [disabled]="matchedCount() === 0 || saving()"
            [loading]="saving()"
            (onClick)="applyMatches()">
          </p-button>
        </footer>
      }
    </div>
  `,
  styles: [`
    :host { display: block; padding: 16px; }
    .ric-popup { max-width: 1400px; margin: 0 auto; }
    .ric-popup__header { margin-bottom: 16px; }
    .ric-popup__header h1 { margin: 0; font-size: 1.4rem; }
    .ric-popup__subtitle { color: #6b7280; margin: 4px 0 0; font-size: 0.9rem; }
    .ric-popup__loading {
      text-align: center; padding: 80px 20px; color: #6b7280;
    }
    .ric-popup__empty {
      text-align: center; padding: 40px 20px;
    }
    .ric-popup__summary {
      display: flex; gap: 16px; margin-bottom: 12px;
    }
    .ric-popup__counter {
      padding: 4px 12px; border-radius: 12px; background: #f3f4f6;
      font-size: 0.85rem; font-weight: 500;
    }
    .ric-popup__counter--match { background: #dcfce7; color: #166534; }
    .ric-amt--in { color: #16a34a; font-weight: 600; }
    .ric-amt--out { color: #dc2626; font-weight: 600; }
    .ric-desc { font-size: 0.9rem; }
    .ric-desc-sub { font-size: 0.8rem; color: #6b7280; }
    .ric-row--matched { background: rgba(22, 163, 74, 0.04); }
    .ric-row--skipped { background: rgba(245, 158, 11, 0.04); opacity: 0.7; }
    .ric-popup__footer {
      display: flex; gap: 8px; justify-content: flex-end;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;
    }
  `]
})
export class RiconciliazionePopupComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  // Optional: presenti SOLO quando aperto come DynamicDialog (modalita' A)
  private dialogConfig = inject(DynamicDialogConfig, { optional: true });
  private dialogRef = inject(DynamicDialogRef, { optional: true });

  loading = signal(true);
  saving = signal(false);
  batchId = signal<string | null>(null);
  items = signal<SuggestionItem[]>([]);

  matchedCount = computed(() =>
    this.items().filter(i => i.selectedScadenzaId && i.selectedScadenzaId > 0).length
  );
  pendingCount = computed(() =>
    this.items().filter(i => i.selectedScadenzaId === undefined).length
  );

  /** True quando il componente e' embedded in un DynamicDialog. */
  get isDialog(): boolean { return !!this.dialogRef; }

  ngOnInit(): void {
    // Modalita' A (dialog): batch_id da DynamicDialogConfig.data.batch_id
    // Modalita' B (route): batch_id da queryParam ?batch=
    const batch = this.dialogConfig?.data?.batch_id
      ?? this.route.snapshot.queryParamMap.get('batch');
    this.batchId.set(batch);
    this.fetchSuggestions();
  }

  async fetchSuggestions(): Promise<void> {
    this.loading.set(true);
    try {
      const url = `${environment.api_url}riconciliazione/suggestions`;
      const body: any = { tolGiorni: 7, tolImporto: 0.50 };
      if (this.batchId()) body.batch_id = this.batchId();
      const res: any = await firstValueFrom(this.http.post(url, body, { withCredentials: true }));
      const items: SuggestionItem[] = (res?.items || []).map((it: any) => ({
        movimento: it.movimento,
        candidates: it.candidates || [],
        // Auto-select primo candidato se delta_importo < 0.10€ E delta_giorni < 3
        selectedScadenzaId: this.shouldAutoSelect(it.candidates) ? it.candidates[0].id : undefined
      }));
      this.items.set(items);
    } finally {
      this.loading.set(false);
    }
  }

  private shouldAutoSelect(candidates: Candidate[]): boolean {
    if (!candidates || candidates.length === 0) return false;
    const c = candidates[0];
    return Number(c.delta_importo) < 0.10 && Number(c.delta_giorni) < 3;
  }

  candidateOptions(item: SuggestionItem) {
    const opts = item.candidates.map(c => ({
      value: c.id,
      label: `${this.formatDate(c.data_scadenza)} | €${Number(c.importo).toFixed(2)} | ${c.controparte}${c.numero_fattura ? ' (' + c.numero_fattura + ')' : ''} [Δ${Math.round(c.delta_giorni)}gg / Δ${Number(c.delta_importo).toFixed(2)}€]`
    }));
    opts.push({ value: null as any, label: '— Salta (no match) —' });
    return opts;
  }

  private formatDate(s: string): string {
    if (!s) return '';
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  setSkip(item: SuggestionItem): void {
    const next = this.items().map(i => i.movimento.id === item.movimento.id ? { ...i, selectedScadenzaId: null } : i);
    this.items.set(next);
  }

  autoMatchAll(): void {
    const next = this.items().map(i => {
      if (i.selectedScadenzaId !== undefined) return i;  // gia' deciso
      if (i.candidates.length === 0) return { ...i, selectedScadenzaId: null };
      return { ...i, selectedScadenzaId: i.candidates[0].id };
    });
    this.items.set(next);
  }

  async applyMatches(): Promise<void> {
    const pairs = this.items()
      .filter(i => i.selectedScadenzaId && i.selectedScadenzaId > 0)
      .map(i => ({ movimento_id: i.movimento.id, scadenza_id: i.selectedScadenzaId! }));

    if (pairs.length === 0) return;

    this.saving.set(true);
    try {
      const url = `${environment.api_url}riconciliazione/bulkApply`;
      const res: any = await firstValueFrom(this.http.post(url, { pairs }, { withCredentials: true }));
      if (res?.ok) {
        if (this.isDialog) {
          // Modalita' A: chiudi dialog, ritorna applied count → host fa refresh
          this.dialogRef!.close({ applied: res.applied || pairs.length });
        } else {
          // Modalita' B: redirect a movimenti list
          this.router.navigateByUrl('/movimenti_bancari/list');
        }
      }
    } finally {
      this.saving.set(false);
    }
  }

  goBack(): void {
    if (this.isDialog) {
      this.dialogRef!.close({ applied: 0 });
    } else {
      this.router.navigateByUrl('/movimenti_bancari/list');
    }
  }
}
