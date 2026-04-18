import { AfterViewInit, Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import {
  DataSourceComponent,
  ListGridComponent,
  MetaInfo,
  MetadatiColonna,
  MetadatiTabella
} from 'wuic-framework-lib-dev';

interface JsonPlaceholderPost {
  userId: number;
  id: number;
  title: string;
  body: string;
}

/**
 * Pattern 3 — Framework component + Custom data / esempio 3a.
 *
 * I dati arrivano da un'API esterna pubblica (jsonplaceholder.typicode.com,
 * niente backend WUIC, niente metadata). Vengono "wrappati" in una
 * DataSourceComponent in-memory e passati a <wuic-list-grid> che renderizza
 * con tutta la UX standard (filter, sort, paging client-side, export).
 *
 * Punto chiave: NON registriamo nessuna route metadata. La list-grid riceve
 * `metaInfo.columnMetadata` definito a mano e dati via `publishFetchInfo`.
 *
 * Fallback: se l'API esterna non e' raggiungibile (firewall aziendale, no
 * connectivity), usiamo un dataset inline con titoli/corpi variati per
 * mostrare comunque il pattern. Cosi' l'esempio rimane funzionante anche
 * offline.
 */
@Component({
  selector: 'app-3a-external-rest-grid',
  standalone: true,
  imports: [CommonModule, DataSourceComponent, ListGridComponent],
  templateUrl: './3a-external-rest-grid.component.html',
  styleUrl: './3a-external-rest-grid.component.scss'
})
export class Pattern3aExternalRestGridComponent implements AfterViewInit {
  @ViewChild('ds') ds!: DataSourceComponent;
  private http = inject(HttpClient);

  ngAfterViewInit(): void {
    this.http
      .get<JsonPlaceholderPost[]>('https://jsonplaceholder.typicode.com/posts')
      .subscribe({
        next: rows => this.fillDataSource(rows.slice(0, 50)),
        error: () => this.fillDataSource(this.buildOfflineFallback())
      });
  }

  /**
   * Genera 50 post fittizi con titoli/corpi variati e userId distribuiti su
   * 5 utenti, per dimostrare sort/filter/paging anche senza connettivita'.
   */
  private buildOfflineFallback(): JsonPlaceholderPost[] {
    const titles = [
      'Introduzione ad Angular standalone components',
      'Pattern reattivi con RxJS BehaviorSubject',
      'Strategie di change detection in Angular',
      'Server-side rendering con Angular Universal',
      'Form reattivi: best practices 2026',
      'Lazy loading dei moduli e dei componenti',
      'Internationalizzazione con @angular/localize',
      'Testing con Karma e Jasmine',
      'PrimeNG p-table avanzato',
      'Migrazione da NgModule a standalone'
    ];
    const bodies = [
      'Una panoramica completa con esempi pratici e considerazioni su performance.',
      'Vediamo come strutturare lo stato applicativo evitando memory leak.',
      'OnPush vs Default: trade-off, casi d\'uso e impatto sul rendering.',
      'Setup, hydration e gestione delle route con SSR moderno.',
      'Validazione asincrona, dynamic forms e accessibility.',
      'Riduzione del bundle iniziale e route lazy con loadComponent.',
      'Estrazione testi, traduzioni runtime, fallback per locale.',
      'Mock dei servizi, fixture e best practice per test stabili.',
      'Filter, sort, paging client-side e server-side a confronto.',
      'Vantaggi della nuova architettura senza moduli e migrazione step-by-step.'
    ];
    const rows: JsonPlaceholderPost[] = [];
    for (let i = 1; i <= 50; i++) {
      rows.push({
        id: i,
        userId: ((i - 1) % 5) + 1,
        title: titles[(i - 1) % titles.length] + ` (#${i})`,
        body: bodies[(i - 1) % bodies.length]
      });
    }
    return rows;
  }

  /**
   * Costruisce on-the-fly il contratto richiesto da <wuic-list-grid>:
   *   1. metaInfo.columnMetadata: array di MetadatiColonna (constructor accetta
   *      il nome SQL della colonna; il resto si setta via Object.assign).
   *   2. fetchInfo$.next({resultInfo, metaInfo, filterDescriptor}): publish
   *      diretto sul BehaviorSubject pubblico (publishFetchInfo() interno e' private).
   *      Il payload deve avere solo i 3 campi del tipo dichiarato in DataSourceComponent.
   */
  private fillDataSource(rows: JsonPlaceholderPost[]): void {
    const meta = new MetaInfo();
    // CRITICAL per il Pattern 3 con dataset hardcoded:
    // md_server_side_operations default e' `true` (vedi MetadatiTabella ctor),
    // significa "delega paging/sort/filter al backend tramite l'endpoint CRUD
    // standard del framework". Qui non c'e' nessun endpoint CRUD framework
    // dietro: i dati arrivano gia' interi da una REST esterna. Se lasciamo
    // true, la list-grid invia eventi paging/sort/filter "nel vuoto" e l'UX
    // sembra rotta (cliccare la pagina 2 non fa niente). Forzando false la
    // grid esegue tutte le operazioni in-memory sull'array gia' caricato.
    // IMPORTANTE: usare `new MetadatiTabella()` per ottenere TUTTI i default
    // sensati (md_sortable, md_pageable, ecc.). Un object literal `{...} as any`
    // lascia md_sortable=undefined -> isColumnSortable() ritorna false ->
    // p-table non riconosce le colonne come ordinabili e click sull'header
    // non emette il `field` nel suo evento onSort -> orderColumn resta vuoto
    // e il sort non funziona.
    const tableMeta = new MetadatiTabella('posts');
    tableMeta.md_server_side_operations = false;  // forza client-side
    tableMeta.md_pageable = true;
    tableMeta.md_pagesize = 10;
    // Esempio read-only: consumiamo JSONPlaceholder (endpoint pubblico di
    // sola lettura, niente CRUD lato nostro). Disabilitiamo i bottoni
    // insert/edit/delete in toolbar altrimenti parte il flusso framework
    // standard (`DataProviderService.insert`) che cerca un route metadata
    // inesistente e crasha con "Cannot read properties of undefined
    // (reading 'endpoint')".
    tableMeta.md_insertable = false;
    tableMeta.md_editable = false;
    tableMeta.md_deletable = false;
    meta.tableMetadata = tableMeta;
    // Helper: vincola `props` a `Partial<MetadatiColonna>` cosi' VS Code da'
    // autocomplete su ogni `mc_...` (Object.assign nudo lascia il secondo
    // argomento come `{}` non tipato e non suggerisce nulla).
    const col = (name: string, props: Partial<MetadatiColonna>) =>
      Object.assign(new MetadatiColonna(name), props);

    meta.columnMetadata = [
      col('id', {
        mc_id: 1, mc_real_column_name: 'id',
        mc_display_string_in_view: 'ID', mc_ui_column_type: 'number',
        mc_ordine: 1, mc_is_primary_key: true
      }),
      col('userId', {
        mc_id: 2, mc_real_column_name: 'userId',
        mc_display_string_in_view: 'User', mc_ui_column_type: 'number',
        mc_ordine: 2
      }),
      // mc_show_in_filters: true abilita la riga filter sotto l'header colonna.
      // Senza questo flag, p-table mostra l'icona sort ma NON la box di filtro
      // -> l'utente puo' ordinare ma non filtrare per quella colonna.
      col('title', {
        mc_id: 3, mc_real_column_name: 'title',
        mc_display_string_in_view: 'Title', mc_ui_column_type: 'text',
        mc_ordine: 3,
        mc_show_in_filters: true
      }),
      col('body', {
        mc_id: 4, mc_real_column_name: 'body',
        mc_display_string_in_view: 'Body', mc_ui_column_type: 'text',
        mc_ordine: 4,
        mc_show_in_filters: true
      })
    ];

    this.ds.metaInfo = meta;

    // filterDescriptor: in flusso standard `getSchemaAndData()` lo popola con
    // un BehaviorSubject(null) per ogni colonna. In Pattern 3 (hardcoded)
    // dobbiamo farlo a mano, altrimenti `wuic-field-filter` non ha nulla a
    // cui legarsi e cliccando "Applica filtro" il valore digitato non viene
    // catturato (la grid resta inalterata).
    const fd: { [key: string]: BehaviorSubject<any> } = {};
    meta.columnMetadata.forEach((c) => {
      fd[c.mc_nome_colonna] = new BehaviorSubject<any>(null);
    });
    this.ds.filterDescriptor = fd;

    // Sincronizza `ds.resultInfo` con l'oggetto emesso da `fetchInfo$` per
    // mantenere coerenza con le operazioni framework che mutano
    // direttamente `this.resultInfo.current` (es. `addNewRecord`,
    // `setCurrent`). Senza questa riga "Aggiungi" crasha con
    // "Cannot set properties of undefined (setting 'current')".
    const resultInfo = { dato: rows, totalRowCount: rows.length, current: {} } as any;
    this.ds.resultInfo = resultInfo;
    this.ds.fetchInfo$.next({
      resultInfo,
      metaInfo: meta,
      filterDescriptor: fd
    });
  }
}
