import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Custom component livello 2 — Comunicazioni finanziarie (LIPE + esterometro).
 *
 * Sostituisce il pattern CRUD-list standard con un **form parametrico**:
 * gli endpoint `ComunicazioniController` non sono CRUD su una tabella ma
 * aggregati calcolati on-the-fly per (anno, trimestre) o (anno, mese).
 * Una list-grid scaffoldata non puo' rappresentarli — serve UI custom.
 *
 * Endpoint chiamati (gia' esistenti, livello 5 decision-ladder):
 *   GET  /api/comunicazioni/lipe?anno&trimestre        -> aggregato IVA debito/credito
 *   GET  /api/comunicazioni/lipeXml?anno&trimestre     -> XML LIPE (download)
 *   GET  /api/comunicazioni/esterometro?anno&mese      -> operazioni controparti estere
 *
 * Route: `#/comunicazioni-finanziarie/lipe` e `#/comunicazioni-finanziarie/esterometro`
 * (letta da snapshot.url, condiziona quale form mostrare).
 */
@Component({
  selector: 'wuic-comunicazioni-finanziarie',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputNumberModule, SelectButtonModule,
    TableModule, MessageModule, ProgressSpinnerModule
  ],
  templateUrl: './comunicazioni-finanziarie.component.html',
  styleUrl: './comunicazioni-finanziarie.component.scss'
})
export class ComunicazioniFinanziarieComponent {
  // mode: 'lipe' | 'esterometro' (impostato dalla route)
  mode = signal<'lipe' | 'esterometro'>('lipe');

  // form params
  anno = signal<number>(new Date().getFullYear());
  trimestre = signal<number>(Math.floor((new Date().getMonth()) / 3) + 1);
  mese = signal<number>(new Date().getMonth() + 1);

  trimestreOptions = [
    { label: 'Q1 (gen-mar)', value: 1 },
    { label: 'Q2 (apr-giu)', value: 2 },
    { label: 'Q3 (lug-set)', value: 3 },
    { label: 'Q4 (ott-dic)', value: 4 }
  ];

  // result state
  loading = signal(false);
  errorMsg = signal<string | null>(null);
  lipeData = signal<any | null>(null);
  esteroRows = signal<any[]>([]);

  constructor(private http: HttpClient) {
    const path = window.location.hash;
    if (path.includes('esterometro')) this.mode.set('esterometro');
    else this.mode.set('lipe');
  }

  async runLipe(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.lipeData.set(null);
    try {
      const url = `${environment.api_url}comunicazioni/lipe?anno=${this.anno()}&trimestre=${this.trimestre()}`;
      const resp = await firstValueFrom(this.http.get<any>(url));
      if (resp?.ok && resp.data) this.lipeData.set(resp.data);
      else this.errorMsg.set('Nessun dato per il periodo selezionato.');
    } catch (e: any) {
      this.errorMsg.set(`Errore: ${e?.message ?? e}`);
    } finally {
      this.loading.set(false);
    }
  }

  downloadLipeXml(): void {
    const url = `${environment.api_url}comunicazioni/lipeXml?anno=${this.anno()}&trimestre=${this.trimestre()}`;
    window.open(url, '_blank');
  }

  async runEsterometro(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    this.esteroRows.set([]);
    try {
      const url = `${environment.api_url}comunicazioni/esterometro?anno=${this.anno()}&mese=${this.mese()}`;
      const resp = await firstValueFrom(this.http.get<any>(url));
      if (resp?.ok) this.esteroRows.set(resp.rows ?? []);
      else this.errorMsg.set('Errore nella richiesta.');
    } catch (e: any) {
      this.errorMsg.set(`Errore: ${e?.message ?? e}`);
    } finally {
      this.loading.set(false);
    }
  }

  fmtEuro(v: any): string {
    const n = Number(v ?? 0);
    return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }
}
