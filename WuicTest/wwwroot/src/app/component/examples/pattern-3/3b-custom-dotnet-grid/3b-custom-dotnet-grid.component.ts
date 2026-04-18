import { AfterViewInit, Component, ViewChild, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import {
  DataSourceComponent,
  ListGridComponent,
  MetaInfo,
  MetadatiColonna,
  MetadatiTabella,
  WtoolboxService
} from 'wuic-framework-lib-dev';

interface InventoryItem {
  id: number;
  name: string;
  stock: number;
  price: number;
  warehouse: string;
}

interface InventoryResponse {
  rows: InventoryItem[];
  total: number;
}

/**
 * Pattern 3 — Framework component + Custom data / esempio 3b.
 *
 * Variante "server-side": a differenza di 3a (tutti i dati caricati una volta
 * sola, paging/sort/filter client-side), 3b mostra il pattern per dataset
 * grandi: il backend custom (`/api/samples/inventory`) accetta offset/limit/
 * sort/filter come query params e la grid re-fetcha ad ogni cambio di stato
 * tramite gli @Output del componente list-grid.
 *
 * Frame della comunicazione:
 *   1. ngAfterViewInit -> fetch iniziale (page 1, no sort, no filter).
 *   2. Utente clicca header / paginatore / filtra -> list-grid emette
 *      onSorting / onPaging / onFiltering -> handler `reloadFromServer()`
 *      legge `ds.currentPage / pageSize / sortInfo / filterInfo` (gia'
 *      aggiornati dal list-grid handler PRIMA dell'emit) e re-fetcha.
 *   3. Backend ritorna { rows, total } -> publish su `ds.fetchInfo$`.
 *
 * tableMetadata: `md_server_side_operations: true` (default). NON forziamo a
 * `false` come in 3a: lasciamo a p-table modalita' lazy cosi' la grid NON fa
 * filter/sort interno sulle righe ricevute (quelle sono gia' la pagina
 * filtrata/sortata server-side).
 */
@Component({
  selector: 'app-3b-custom-dotnet-grid',
  standalone: true,
  imports: [CommonModule, DataSourceComponent, ListGridComponent],
  templateUrl: './3b-custom-dotnet-grid.component.html',
  styleUrl: './3b-custom-dotnet-grid.component.scss'
})
export class Pattern3bCustomDotnetGridComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ds') ds!: DataSourceComponent;
  private http = inject(HttpClient);

  // metaInfo + filterDescriptor riusati ad ogni publish (immutabili dopo init).
  private meta!: MetaInfo;
  private fd!: { [key: string]: BehaviorSubject<any> };

  ngAfterViewInit(): void {
    this.initMeta();
    this.reloadFromServer();
  }

  ngOnDestroy(): void {
    // Niente subscription manuali: gli @Output del template si dispongono
    // da soli quando la list-grid viene distrutta.
  }

  /**
   * Handler unificato: chiamato dagli @Output (onSorting/onPaging/onFiltering)
   * della list-grid. La list-grid aggiorna `ds.currentPage`, `ds.pageSize`,
   * `ds.sortInfo`, `ds.filterInfo` PRIMA di emettere l'evento, quindi qui
   * leggiamo lo stato corrente e lo passiamo al backend.
   */
  reloadFromServer(): void {
    const page = Number(this.ds?.currentPage || 1);
    const pageSize = Number(this.ds?.pageSize || 10);
    const sort = this.ds?.sortInfo?.[0];
    const filter = this.ds?.filterInfo?.filters?.[0];

    let params = new HttpParams()
      .set('offset', String((page - 1) * pageSize))
      .set('limit', String(pageSize));

    if (sort?.field) {
      params = params
        .set('sortField', String(sort.field))
        .set('sortDir', String(sort.dir || 'asc'));
    }

    if (filter?.field && filter?.value !== null && filter?.value !== undefined && filter?.value !== '') {
      params = params
        .set('filterField', String(filter.field))
        .set('filterValue', String(filter.value))
        .set('filterOp', String(filter.operatore || 'contains'));
    }

    // Base URL del backend .NET via `WtoolboxService.appSettings.api_url`
    // (env-driven, configurato in `src/app/environments/environment*.ts`):
    //   - dev:  'http://localhost:5000/api/'
    //   - prod: 'http://localhost/api/' (stessa origin via IIS reverse proxy)
    // Cosi' il componente non hardcoda l'host e funziona sia in dev (Angular
    // :4200 + .NET :5000 separati) sia in prod (stessa origin). NON usare URL
    // relative: il dev server Angular non ha proxy verso :5000 e ritornerebbe
    // index.html come SPA fallback (JSON.parse fallirebbe su "<!doctype...").
    const apiUrl = `${WtoolboxService.appSettings.api_url}samples/inventory`;
    this.http.get<InventoryResponse>(apiUrl, { params })
      .subscribe(res => this.publish(res.rows, res.total));
  }

  private initMeta(): void {
    const meta = new MetaInfo();
    // Server-side: lascia il default `md_server_side_operations: true`.
    // p-table sara' in [lazy]="true" e NON applichera' sort/filter/paging
    // interni — sara' nostro compito ricaricare il subset corretto via API
    // a ogni evento.
    const tableMeta = new MetadatiTabella('inventory');
    tableMeta.md_pageable = true;
    tableMeta.md_pagesize = 10;
    // Esempio read-only: l'endpoint custom /api/samples/inventory non espone
    // insert/edit/delete. Disabilitiamo i bottoni CRUD in toolbar altrimenti
    // cliccando "Aggiungi" parte `DataProviderService.insert` che cerca un
    // route metadata inesistente e crasha con "Cannot read properties of
    // undefined (reading 'endpoint')".
    tableMeta.md_insertable = false;
    tableMeta.md_editable = false;
    tableMeta.md_deletable = false;
    // Nasconde "Export XLS" — l'endpoint backend dedicato
    // (`MetaService.ExportFlatRecordDataSrv`) pretende la route in metadata
    // WUIC, che qui non esiste.
    tableMeta.md_hide_export_xls = true;
    // Nasconde "Gestione stato" — il saved-state feature persiste via
    // MetaService user_id+route e non ha senso su hardcoded ds.
    tableMeta.extraProps = {
      toolbar: { hideManageState: true }
    } as any;
    meta.tableMetadata = tableMeta;

    const col = (name: string, props: Partial<MetadatiColonna>) =>
      Object.assign(new MetadatiColonna(name), props);

    meta.columnMetadata = [
      col('id', {
        mc_id: 1, mc_real_column_name: 'id',
        mc_display_string_in_view: 'ID', mc_ui_column_type: 'number',
        mc_ordine: 1, mc_is_primary_key: true
      }),
      col('name', {
        mc_id: 2, mc_real_column_name: 'name',
        mc_display_string_in_view: 'Product', mc_ui_column_type: 'text',
        mc_ordine: 2,
        mc_show_in_filters: true
      }),
      col('warehouse', {
        mc_id: 3, mc_real_column_name: 'warehouse',
        mc_display_string_in_view: 'Warehouse', mc_ui_column_type: 'text',
        mc_ordine: 3,
        mc_show_in_filters: true
      }),
      col('stock', {
        mc_id: 4, mc_real_column_name: 'stock',
        mc_display_string_in_view: 'Stock', mc_ui_column_type: 'number',
        mc_ordine: 4
      }),
      col('price', {
        mc_id: 5, mc_real_column_name: 'price',
        mc_display_string_in_view: 'Unit price', mc_ui_column_type: 'number',
        mc_ordine: 5
      })
    ];

    this.meta = meta;
    this.ds.metaInfo = meta;

    // filterDescriptor + operators pre-popolati: in Pattern 3 hardcoded
    // `getSchemaAndData()` NON viene chiamato, quindi dobbiamo inizializzare
    // a mano sia i BehaviorSubject di filterDescriptor sia metaInfo.operators
    // con i default per tipo colonna (text -> 'contains', altri -> 'eq').
    // Senza operators il primo apply del filter su <wuic-field-filter> puo'
    // non propagare il valore al BehaviorSubject (apply vuoto al primo click,
    // filter funziona solo al secondo).
    const fd: { [key: string]: BehaviorSubject<any> } = {};
    meta.operators = {};
    meta.columnMetadata.forEach((c) => {
      fd[c.mc_nome_colonna] = new BehaviorSubject<any>(null);
      const type = String(c.mc_ui_column_type || '').toLowerCase();
      meta.operators[c.mc_nome_colonna] = (type === 'text' || type === 'txt_area') ? 'contains' : 'eq';
    });
    this.fd = fd;
    this.ds.filterDescriptor = fd;
  }

  private publish(rows: InventoryItem[], total: number): void {
    // Sincronizza `ds.resultInfo` con l'oggetto emesso da `fetchInfo$` per
    // mantenere coerenza con le operazioni framework che mutano
    // direttamente `this.resultInfo.current` (es. `addNewRecord`,
    // `setCurrent`). Senza questa riga "Aggiungi" crasha con
    // "Cannot set properties of undefined (setting 'current')".
    const resultInfo = { dato: rows, totalRowCount: total, current: {} } as any;
    this.ds.resultInfo = resultInfo;
    this.ds.fetchInfo$.next({
      resultInfo,
      metaInfo: this.meta,
      filterDescriptor: this.fd
    });
  }
}
