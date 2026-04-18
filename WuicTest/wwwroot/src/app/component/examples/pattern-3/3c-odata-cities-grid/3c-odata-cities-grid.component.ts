import { AfterViewInit, Component, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Subscription } from 'rxjs';
import {
  DataProviderOdataService,
  DataSourceComponent,
  FilterInfo,
  ListGridComponent,
  MetaInfo,
  MetadatiColonna,
  MetadatiTabella,
  WtoolboxService
} from 'wuic-framework-lib-dev';

interface Cities {
  cityID: number;
  cityName: string | null;
  stateProvinceID: number | null;
  latestRecordedPopulation: number | null;
  deleted: boolean | null;
}

/**
 * Pattern 3 — Framework component + Custom data / esempio 3c.
 *
 * Variante **OData**: consuma l'endpoint OData generico del framework
 * (`GET /odata/Cities`), che risponde a `$top / $skip / $filter / $orderby`
 * con la sintassi OData v4 standard. Nessun controller custom da scrivere
 * lato server: tutto e' gia' esposto da WuicOData.
 *
 * Come 3b usiamo wiring esplicito server-side (`md_server_side_operations: true`)
 * sottoscrivendo gli @Output `(onPaging)/(onSorting)/(onFiltering)` della
 * list-grid. A differenza di 3b che traduce a mano i parametri, qui sfruttiamo
 * `DataProviderOdataService.filterInfoToOdata()` del framework che si occupa
 * di tutto il mapping operatori WUIC -> `$filter` OData (contains/startswith/
 * endswith/eq/ne/gt/ge/lt/le) con quoting corretto per string/numeric, supporto
 * nested filter groups (AND/OR ricorsivi) e isnull/isnotnull.
 *
 * **Inline count OData v4**: passiamo `$count=true` (standard OData v4) e
 * l'endpoint ritorna il wrapper `{ value: [...], "@odata.count": N }` in una
 * sola chiamata HTTP. Senza `$count=true` l'endpoint mantiene la shape legacy
 * (plain array `[...]`) per compatibilita' con i consumer esistenti del
 * framework (DataProviderOdataService.select, data-provider-webservice,
 * ecc.) che leggono `response as any[]` direttamente. L'opt-in e' gestito
 * lato server in `WuicOData/Controllers/EntitiesController.cs:Get()`.
 *
 * **CRUD (insert/update/delete)**: configurato `extraProps.endpoint.uri` cosi'
 * la toolbar "Aggiungi"/"Modifica"/"Elimina" instrada le mutazioni al metodo
 * `DataProviderOdataService.{insert,update,delete}` che fa POST/PATCH/DELETE
 * contro `/odata/Cities` e `/odata/Cities({id})`. Dopo il sync sottoscriviamo
 * `ds.afterSync$` per ri-fetchare la pagina corrente (su hardcoded datasource
 * `scope.fetchData()` e' no-op, quindi il reload lo facciamo noi). Il
 * backend richiede che la riga `cities` in `_metadati__tabelle` abbia i
 * flag `mdserviceenable{insert,edit,delete}=1` + `mdexposeinwebapi=1`.
 */
@Component({
  selector: 'app-3c-odata-cities-grid',
  standalone: true,
  imports: [CommonModule, DataSourceComponent, ListGridComponent],
  templateUrl: './3c-odata-cities-grid.component.html',
  styleUrl: './3c-odata-cities-grid.component.scss'
})
export class Pattern3cODataCitiesGridComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ds') ds!: DataSourceComponent;
  private http = inject(HttpClient);
  private odataSrv = inject(DataProviderOdataService);

  private meta!: MetaInfo;
  private fd!: { [key: string]: BehaviorSubject<any> };
  private afterSyncSub?: Subscription;

  ngAfterViewInit(): void {
    this.initMeta();
    // Post insert/update/delete il framework chiama `scope.fetchData()` che
    // sulla hardcoded datasource e' no-op (niente route). Qui forziamo il
    // reload della pagina corrente cosi' la grid riflette subito la mutazione
    // (riga nuova, riga modificata, riga eliminata + total aggiornato).
    this.afterSyncSub = this.ds.afterSync$.subscribe(() => this.reloadFromServer());
    this.reloadFromServer();
  }

  ngOnDestroy(): void {
    this.afterSyncSub?.unsubscribe();
  }

  reloadFromServer(): void {
    const page = Number(this.ds?.currentPage || 1);
    const pageSize = Number(this.ds?.pageSize || 10);
    const sort = this.ds?.sortInfo?.[0];

    // Base URL del backend dalla config env (WtoolboxService.appSettings.file_path,
    // es. dev='http://localhost:5000/'). `filterInfoToOdata` ritorna una URL
    // RELATIVA tipo '/odata/Cities?$filter=...' che concateniamo alla base.
    const base = String(WtoolboxService.appSettings.file_path || '').replace(/\/$/, '');
    const filterInfo = (this.ds?.filterInfo || new FilterInfo('AND', [])) as FilterInfo;

    // 1) URL base con $filter gia' encoded dal service del framework
    //    (supporta contains/startswith/endswith/eq/ne/gt/ge/lt/le, quoting
    //    automatico string vs numeric, nested AND/OR, isnull/isnotnull).
    const baseRelUrl = this.odataSrv.filterInfoToOdata(filterInfo, 'Cities');
    const sep = baseRelUrl.includes('?') ? '&' : '?';

    // 2) Aggiungi $top, $skip, $orderby, $count=true e $expand.
    //    - $count=true -> wrapper OData v4 { value, @odata.count } in 1 call.
    //    - $expand=stateProvince -> include nav property StateProvince su
    //      ogni Cities row (il metadata EF model ora la genera dal lookup
    //      column `stateProvinceID`, vedi MetadataModelGenerator). Il
    //      controller applica `.Include("StateProvince")` e il risultato
    //      JSON include `{..., stateProvinceID: 1, stateProvince: {
    //      stateProvinceID: 1, stateProvinceName: "Alabama", ... } }`.
    //      Il grid template sulla colonna usa `row.stateProvince?.stateProvinceName`
    //      per mostrare il nome invece del numero.
    const pageExtras: string[] = [
      `$top=${pageSize}`,
      `$skip=${(page - 1) * pageSize}`,
      `$count=true`,
      `$expand=stateProvince`
    ];
    if (sort?.field) {
      pageExtras.push(`$orderby=${encodeURIComponent(`${sort.field} ${sort.dir || 'asc'}`)}`);
    }
    const pageUrl = `${base}${baseRelUrl}${sep}${pageExtras.join('&')}`;

    // 3) Singola chiamata: leggiamo `value` (la pagina) e `@odata.count` (il
    //    totale filtrato, pre-paging) dal wrapper OData v4.
    this.http.get<{ value: Cities[]; '@odata.count': number }>(pageUrl)
      .subscribe(res => this.publish(res.value || [], Number(res['@odata.count'] || 0)));
  }

  private initMeta(): void {
    const meta = new MetaInfo();
    const tableMeta = new MetadatiTabella('cities');
    tableMeta.md_pageable = true;
    tableMeta.md_pagesize = 10;
    // PK type SEQUENCE: dichiara che `cityID` e' popolata da
    // `DEFAULT NEXT VALUE FOR <sequence>` lato DB. Il parametric-dialog
    // usa questo valore in `isFieldHiddenInEdit()` per auto-nascondere
    // il campo PK nel form di edit (come fa gia' per IDENTITY/GUID) —
    // cosi' l'utente non vede una colonna che il server popolera'
    // automaticamente, e non deve ricordare di settare
    // `mc_hide_in_edit=true` a mano sulla colonna cityID.
    tableMeta.md_primary_key_type = 'SEQUENCE';
    // CRUD completo via `DataProviderOdataService.{insert,update,delete}`:
    // la toolbar rende Aggiungi/Modifica/Elimina e i click instradano al
    // provider OData che fa POST/PATCH/DELETE contro `/odata/Cities`.
    tableMeta.md_insertable = true;
    tableMeta.md_editable = true;
    tableMeta.md_deletable = true;

    tableMeta.md_edit_popup = true;
    tableMeta.md_hide_export_xls = true;

    // extraProps.endpoint: il dispatcher di `DataProviderService.insert`
    // legge `extraProps.endpoint.type === 'odata'` per decidere quale
    // sub-service chiamare. Senza questo config il framework fallback-a a
    // `DataProviderMetaService` (flusso metadata WUIC standard) che non e'
    // compatibile col nostro endpoint OData generico.
    //
    // `uri` e' la base dell'entity-set usata SIA per read (non qui: read lo
    // facciamo noi in `reloadFromServer`) SIA per costruire le URL CRUD:
    //   POST    {uri}
    //   PATCH   {uri}({pk})
    //   DELETE  {uri}({pk})
    const base = String(WtoolboxService.appSettings.file_path || '').replace(/\/$/, '');
    tableMeta.extraProps = {
      endpoint: {
        type: 'odata',
        method: 'get',
        uri: `${base}/odata/Cities`
      },
      // Nasconde "Gestione stato" (icona bookmark) + select stati salvati.
      // Il saved-state feature persiste user_id + route via MetaService sul
      // metadata WUIC — non ha senso su hardcoded ds che non passa da li.
      toolbar: {
        hideManageState: true
      }
    } as any;
    meta.tableMetadata = tableMeta;

    const col = (name: string, props: Partial<MetadatiColonna>) =>
      Object.assign(new MetadatiColonna(name), props);

    meta.columnMetadata = [
      col('cityID', {
        mc_id: 1, mc_real_column_name: 'cityID',
        mc_display_string_in_view: 'ID', mc_ui_column_type: 'number',
        mc_ordine: 1, mc_is_primary_key: true
        // Cities.CityID e' PK int NOT NULL SEQUENCE-backed: la tableMetadata
        // sopra dichiara `md_primary_key_type = 'SEQUENCE'`, quindi il
        // parametric-dialog auto-nasconde questo campo in edit via
        // `isFieldHiddenInEdit` (stessa regola che applica a IDENTITY/GUID).
        // A runtime la shape e':
        //   - INSERT: campo NON renderizzato, payload invia `cityID: null`,
        //     il backend `InsertEntityWithSqlAsync` skippa la colonna null,
        //     SQL applica il DEFAULT NEXT VALUE FOR <sequence>.
        //   - UPDATE: campo NON renderizzato, il PATCH URL
        //     `/odata/Cities({cityID})` identifica la riga via path param
        //     (letto da `entity.cityID` in-memoria, non dal form).
      }),
      col('cityName', {
        mc_id: 2, mc_real_column_name: 'cityName',
        mc_display_string_in_view: 'City', mc_ui_column_type: 'text',
        mc_ordine: 2,
        mc_show_in_filters: true,
        mc_validation_required: true
      }),
      col('stateProvinceID', {
        mc_id: 3, mc_real_column_name: 'stateProvinceID',
        mc_display_string_in_view: 'State/Province', mc_ui_column_type: 'lookupByID',
        mc_ordine: 3,
        mc_show_in_filters: true,
        mc_validation_required: true,
        // Lookup puro-OData con rendering del nome in grid.
        //
        // Wiring:
        //  - `mc_ui_lookup_entity_name = 'stateprovinces'` serve al lookup-editor
        //    come `hardcodedRoute` per caricare lo SCHEMA (`getSchemaAndData`);
        //    il FETCH dei dati combo invece va via OData grazie all'override
        //    `extras.lookup.endpoint`.
        //  - Entity set OData e' `Stateprovinces` (PascalCase, maiuscola solo
        //    iniziale — vedi `$metadata`), NON `StateProvinces`.
        //  - Proprieta' serializzate in camelCase (`modelBuilder.EnableLowerCamelCase`):
        //    `stateProvinceID`, `stateProvinceName`.
        //  - `mc_ui_grid_column_data_template` renderizza il nome in grid
        //    leggendo dalla nav property `stateProvince` popolata server-side
        //    via `$expand=stateProvince`. Fallback al numero se la nav e' null.
        mc_ui_lookup_entity_name: 'stateprovinces',
        mc_ui_lookup_dataValueField: 'stateProvinceID',
        mc_ui_lookup_dataTextField: 'stateProvinceName',
        mc_serverside_operations: true,
        mc_ui_grid_column_data_template: `row.stateProvince && row.stateProvince.stateProvinceName ? row.stateProvince.stateProvinceName : value`,
        extras: {
          lookup: {
            endpoint: {
              type: 'odata',
              uri: `${String(WtoolboxService.appSettings.file_path || '').replace(/\/$/, '')}/odata/Stateprovinces`
            }
          }
        } as any,
        // Default 1 = Alabama.
        mc_default_value_callback__fn: (rec: any) => { rec['stateProvinceID'] = 1; },
      }),
      col('latestRecordedPopulation', {
        mc_id: 4, mc_real_column_name: 'latestRecordedPopulation',
        mc_display_string_in_view: 'Population', mc_ui_column_type: 'number',
        mc_ordine: 4,
        mc_show_in_filters: true
      }),
      col('lastEditedBy', {
        mc_id: 5, mc_real_column_name: 'lastEditedBy',
        mc_display_string_in_view: 'Last Edited By', mc_ui_column_type: 'number',
        mc_ordine: 5,
        // Colonna audit NOT NULL richiesta da WWI (FK verso Application.People).
        // La nascondiamo in list ed edit — l'utente non la vede — e la
        // popoliamo automaticamente con PersonID=1 ("Data Conversion Only",
        // account di sistema in WWI). Senza questa riga in columnMetadata la
        // colonna NON finirebbe nel payload POST/PATCH e il backend
        // risponderebbe 400 con "Cannot insert NULL into 'LastEditedBy'".
        mc_hide_in_list: true,
        mc_hide_in_edit: true,
        mc_default_value_callback__fn: (rec: any) => { rec['lastEditedBy'] = 1; }
      })
    ];

    this.meta = meta;
    this.ds.metaInfo = meta;

    const fd: { [key: string]: BehaviorSubject<any> } = {};
    // operators: inizializza default per tipo colonna (text -> 'contains',
    // number/altri -> 'eq'). In Pattern 3 hardcoded `getSchemaAndData()` NON
    // viene chiamato, quindi metaInfo.operators resta vuoto e il primo apply
    // del filter sulla <wuic-field-filter> puo' non propagare correttamente il
    // valore al BehaviorSubject di filterDescriptor (apply vuoto al primo
    // tentativo, filter funziona solo al secondo).
    meta.operators = {};
    meta.columnMetadata.forEach((c) => {
      fd[c.mc_nome_colonna] = new BehaviorSubject<any>(null);
      const type = String(c.mc_ui_column_type || '').toLowerCase();
      meta.operators[c.mc_nome_colonna] = (type === 'text' || type === 'txt_area') ? 'contains' : 'eq';
    });
    this.fd = fd;
    this.ds.filterDescriptor = fd;
  }

  private publish(rows: Cities[], total: number): void {
    // In Pattern 3 hardcoded il framework non inizializza `ds.resultInfo`
    // (non c'e' route, `dataSrv.select` non gira). Operazioni come
    // `addNewRecord` / `setCurrent` leggono/scrivono direttamente
    // `this.ds.resultInfo.current`, quindi dobbiamo sincronizzare l'instance
    // prop con lo stesso oggetto pubblicato in `fetchInfo$` (altrimenti
    // "Aggiungi" crasha con `Cannot set properties of undefined`).
    const resultInfo = { dato: rows, totalRowCount: total, current: {} } as any;
    this.ds.resultInfo = resultInfo;
    this.ds.fetchInfo$.next({
      resultInfo,
      metaInfo: this.meta,
      filterDescriptor: this.fd
    });
  }
}
