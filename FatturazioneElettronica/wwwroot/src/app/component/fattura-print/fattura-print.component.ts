import { CommonModule, CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Custom component livello 2 (decision-ladder skill app-creation).
 *
 * Renderizza in HTML stampabile una fattura inviata, leggendo i dati
 * dalla stored `dbo.sp_sdi_get_fattura_payload` esposta da
 * `SdiController` via endpoint `POST /api/sdi/generateXml` (che
 * intanto produce anche l'XML SDI).
 *
 * Usato come complemento della pipeline SDI: l'XML va al SDI, l'HTML
 * a stampa/email.
 *
 * Route: `#/fatture_inviate/print/:id`
 *
 * NB: questo e' un esempio di custom component dell'app — non un
 * componente del framework. Va in
 * `wwwroot/src/app/component/fattura-print/`, non in
 * `wuic-framework-lib/src/lib/component/`.
 */
@Component({
  selector: 'wuic-fattura-print',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    ProgressSpinnerModule
  ],
  providers: [CurrencyPipe, DatePipe, DecimalPipe],
  templateUrl: './fattura-print.component.html',
  styleUrl: './fattura-print.component.scss'
})
export class FatturaPrintComponent implements OnInit {
  loading = signal(true);
  errorMsg = signal<string | null>(null);
  header = signal<Record<string, unknown> | null>(null);
  righe = signal<Array<Record<string, unknown>>>([]);
  riepilogoIva = signal<Array<Record<string, unknown>>>([]);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    const idStr = this.route.snapshot.paramMap.get('id');
    const id = idStr ? Number(idStr) : NaN;
    if (!id || Number.isNaN(id)) {
      this.errorMsg.set('ID fattura non valido nella URL.');
      this.loading.set(false);
      return;
    }
    this.loadPayload(id);
  }

  private async loadPayload(fatturaId: number): Promise<void> {
    try {
      // generateXml ritorna metadata su file XML salvato; per il
      // payload renderizzabile usiamo una API dedicata. Qui semplifico
      // chiamando un endpoint di lettura tramite il framework
      // (getFlatRecordData su route fatture_inviate) + un secondo
      // chiamata su fatture_inviate_righe filtrato per fattura_id.
      // Pattern alternativo: aggiungere un endpoint
      // `/api/sdi/preview/{id}` che ritorna lo stesso JSON di
      // sp_sdi_get_fattura_payload.
      const baseUrl = environment.api_url + 'Meta/AsmxProxy';

      // Header via getFlatRecordData (canonical method del framework).
      // Signature documentata in backend-api-client.mjs#crudRead.
      const headerResp = await firstValueFrom(
        this.http.post<any>(
          `${baseUrl}/MetaService.getFlatRecordData`,
          {
            user_id: '',
            route: 'fatture_inviate',
            lookup_table_id: 0,
            SortInfo: null,
            GroupInfo: null,
            PageInfo: { page: 1, pageSize: 1 },
            filterInfo: { filters: [{ field: 'id', operator: 'eq', value: fatturaId }] },
            logicOperator: 'and',
            has_server_operation: false,
            aggregates: null,
            columnRestrictionList: null
          }
        )
      );
      const headerParsed = typeof headerResp === 'string' ? JSON.parse(headerResp) : headerResp;
      const headerRows = (headerParsed?.results ?? headerParsed?.data ?? []) as Array<Record<string, unknown>>;
      if (!headerRows.length) {
        this.errorMsg.set(`Fattura ${fatturaId} non trovata.`);
        this.loading.set(false);
        return;
      }
      this.header.set(headerRows[0]);

      const righeResp = await firstValueFrom(
        this.http.post<any>(
          `${baseUrl}/MetaService.getFlatRecordData`,
          {
            user_id: '',
            route: 'fatture_inviate_righe',
            lookup_table_id: 0,
            SortInfo: [{ field: 'riga', direction: 'asc' }],
            GroupInfo: null,
            PageInfo: { page: 1, pageSize: 100 },
            filterInfo: { filters: [{ field: 'fattura_id', operator: 'eq', value: fatturaId }] },
            logicOperator: 'and',
            has_server_operation: false,
            aggregates: null,
            columnRestrictionList: null
          }
        )
      );
      const righeParsed = typeof righeResp === 'string' ? JSON.parse(righeResp) : righeResp;
      this.righe.set((righeParsed?.results ?? righeParsed?.data ?? []) as Array<Record<string, unknown>>);

      // Riepilogo IVA aggregato dalle righe (lato client per semplicita')
      this.computeRiepilogoIva();

      this.loading.set(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMsg.set(`Errore caricamento fattura: ${msg}`);
      this.loading.set(false);
    }
  }

  private computeRiepilogoIva(): void {
    const map = new Map<string, { aliquota: number; imponibile: number; iva: number }>();
    for (const r of this.righe()) {
      const aliquota = Number(r['aliquota'] ?? 0);
      const imp = Number(r['imponibile_riga'] ?? 0);
      const iva = Number(r['iva_riga'] ?? 0);
      const key = aliquota.toFixed(2);
      const cur = map.get(key) ?? { aliquota, imponibile: 0, iva: 0 };
      cur.imponibile += imp;
      cur.iva += iva;
      map.set(key, cur);
    }
    this.riepilogoIva.set(Array.from(map.values()).sort((a, b) => a.aliquota - b.aliquota));
  }

  print(): void {
    window.print();
  }

  back(): void {
    this.router.navigate(['/fatture_inviate', 'list']);
  }
}
