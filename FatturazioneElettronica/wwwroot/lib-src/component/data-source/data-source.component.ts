import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, combineLatest, Subject, Subscription } from 'rxjs';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DataProviderService } from '../../service/data-provider.service';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { ResultInfo } from '../../class/resultInfo';
import { MetaInfo } from '../../class/metaInfo';

import { FilterInfo } from '../../class/filterInfo';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { WuicClientException } from '../../exception/WuicClientException';
import { WuicErrorCodes } from '../../exception/WuicErrorCodes';
import { GlobalHandler } from '../../handler/GlobalHandler';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { ValidationRule } from '../../class/validationRule';
import { AsyncPipe } from '@angular/common';
import { MetadatiConditionGroup, MetadatiConditionGroupAction } from '../../class/metadati_condition_group';
import { IFieldEditor, ValueChangedPayload } from '../../class/IFieldEditor';
import { SortInfo } from '../../class/sortInfo';
import { GroupInfo } from '../../class/groupInfo';
import { AggregationInfo } from '../../class/aggregationInfo';
import { ChangeT, TrackedChange } from '../../class/trackedChanges';
import { UpdateInfo } from '../../class/updateInfo';
import { WorkflowRuntimeMetadataService } from '../../service/workflow-runtime-metadata.service';
import { MetadatiCustomActionTabella } from '../../class/metadati_custom_actions_tabelle';
import { UserInfoService } from '../../service/user-info.service';

export type DataSourceSyncOperation = 'insert' | 'update' | 'delete' | 'clone' | 'batch';

export interface DataSourceBeforeSyncEvent {
  operation: DataSourceSyncOperation | DataSourceSyncOperation[];
  entity: any;
  original: any;
  datasource: DataSourceComponent;
  cancel: boolean;
  cancelReason?: string;
  cancelSync: (reason?: string) => void;
}

export interface DataSourceAfterSyncEvent {
  operation: DataSourceSyncOperation | DataSourceSyncOperation[];
  entity: any;
  original: any;
  syncedData: any;
  datasource: DataSourceComponent;
}

@Component({
  selector: 'wuic-data-source',
  imports: [AsyncPipe],
  templateUrl: './data-source.component.html',
  styleUrl: './data-source.component.scss',
})
export class DataSourceComponent implements OnInit, OnDestroy {
  private static readonly liveInstances = new Set<DataSourceComponent>();

  public static getLiveInstances(): DataSourceComponent[] {
    return Array.from(DataSourceComponent.liveInstances);
  }

  /**
   * Input dal componente padre per route; usata nella configurazione e nel rendering del componente.
   */
  @Input() route: BehaviorSubject<string>;
  /**
   * Input dal componente padre per route from routing; usata nella configurazione e nel rendering del componente.
   */
  @Input() routeFromRouting: boolean = false;
  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;

  /**
   * Input dal componente padre per autoload; usata nella configurazione e nel rendering del componente.
   */
  @Input() autoload?: boolean;
  /**
   * Input dal componente padre per loading; usata nella configurazione e nel rendering del componente.
   */
  @Input() loading: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  /**
   * Input dal componente padre per change tracking; usata nella configurazione e nel rendering del componente.
   */
  @Input() changeTracking?: boolean;

  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;
  /**
   * Input dal componente padre per parent datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentDatasource: DataSourceComponent;
  /**
   * Se true forza l'uso dell'endpoint combo metadata per i fetch dati di questo datasource.
   * Usato dal lookup-editor annidato, senza impattare gli altri datasource.
   */
  @Input() useComboEndpoint: boolean = false;
  /**
   * Formula lookup opzionale da inoltrare all'endpoint combo.
   */
  @Input() comboFormulaLookup?: string;
  /**
   * mc_id colonna lookup opzionale da inoltrare all'endpoint combo.
   */
  @Input() comboMcId?: number;
  /**
   * Colonna lookup che ha originato questo datasource combo.
   * Usato per slim combo restriction (mc_props_bag.slimCombo).
   */
  @Input() comboField?: any;
  /**
   * Extra fields opzionali per lookup/combo.
   */
  @Input() comboExtraFields?: string;
  /**
   * Record corrente parent usato dal backend per formula lookup/combo context-aware.
   */
  @Input() comboCurrentRecord?: any;

  /**
   * Input dal componente padre per component ref; usata nella configurazione e nel rendering del componente.
   */
  @Input() componentRef: BehaviorSubject<{ component: DataSourceComponent, id: number, name: string, uniqueName: string }>;

  /**
   * Collezione dati per sort info, consumata dal rendering e dalle operazioni del componente.
   */
  sortInfo: SortInfo[];
  /**
   * Collezione dati per group info, consumata dal rendering e dalle operazioni del componente.
   */
  groupInfo: GroupInfo[];
  /**
   * Collezione dati per aggregation info, consumata dal rendering e dalle operazioni del componente.
   */
  aggregationInfo: AggregationInfo[];
  /**
   * Struttura filtri corrente applicata alle query o al filtraggio client-side.
   */
  filterInfo?: FilterInfo;
  /**
   * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
   */
  pageSize: number;
  /**
   * Valore corrente selezionato per current page, usato dai flussi interattivi del componente.
   */
  currentPage: number;
  /**
   * Cursor corrente usato in modalita paging token-based.
   */
  pageCursor?: string | null;
  /**
   * Direzione richiesta per il prossimo fetch in modalita cursor.
   */
  pageDirection: 'next' | 'prev' = 'next';
  /**
   * Cursor restituito dal server per andare alla pagina successiva.
   */
  nextPageCursor?: string | null;
  /**
   * Cursor restituito dal server per andare alla pagina precedente.
   */
  prevPageCursor?: string | null;
  /**
   * Stack dei cursor visitati in avanti per supportare la navigazione indietro.
   */
  prevCursors: string[] = [];
  /**
   * Flag runtime: true quando la route usa paging cursor.
   */
  cursorMode: boolean = false;

  /**
   * Proprieta di stato del componente per filter param, usata dalla logica interna e dal template.
   */
  filterParam: string;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a is current insert.
   */
  isCurrentInsert: boolean;

  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo;
  /**
   * Stato risultato corrente del datasource (record, paginazione, contesto di navigazione).
   */
  resultInfo: ResultInfo;
  /**
   * Proprieta di stato del componente per filter descriptor, usata dalla logica interna e dal template.
   */
  filterDescriptor: { [key: string]: BehaviorSubject<any> };
  /**
   * Collezione dati per changes, consumata dal rendering e dalle operazioni del componente.
   */
  changes: TrackedChange[] = [];
  /**
   * Proprieta di stato del componente per interval, usata dalla logica interna e dal template.
   */
  interval: any;
  /**
   * Proprieta di stato del componente per last filter info query raw, usata dalla logica interna e dal template.
   */
  private lastFilterInfoQueryRaw?: string | null;
  /**
   * Proprieta di stato del componente per last page info query raw, usata dalla logica interna e dal template.
   */
  private lastPageInfoQueryRaw?: string | null;
  /**
   * Proprieta di stato del componente per last sort info query raw, usata dalla logica interna e dal template.
   */
  private lastSortInfoQueryRaw?: string | null;
  /**
   * Riferimento all'ultimo oggetto `filterInfo` processato da `fetchData()`,
   * usato per rilevare riassegnazioni esterne e riallineare i descriptor UI.
   */
  private lastProcessedFilterInfoRef?: FilterInfo;
  /**
   * Firma dell'ultimo contenuto `filterInfo` processato da `fetchData()`,
   * usata per rilevare modifiche ai singoli filterItem senza riassegnazione.
   */
  private lastProcessedFilterInfoSignature?: string;
  /**
   * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
   */
  private routerEventsSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per route input subscription, usata dalla logica interna e dal template.
   */
  private routeInputSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per action state subscription, usata dalla logica interna e dal template.
   */
  private actionStateSubscription?: Subscription;
  /**
   * Collezione dati per condition subscriptions, consumata dal rendering e dalle operazioni del componente.
   */
  private conditionSubscriptions: Subscription[] = [];
  /**
   * Collezione dati per tracked record subscriptions, consumata dal rendering e dalle operazioni del componente.
   */
  private trackedRecordSubscriptions: Subscription[] = [];
  /**
   * Valore corrente selezionato per selected rows, usato dai flussi interattivi del componente.
   */
  private selectedRows: any[] = [];

  /**
   * Proprieta di stato del componente per fetch info, usata dalla logica interna e dal template.
   */
  public fetchInfo$: BehaviorSubject<{ resultInfo: ResultInfo; metaInfo: MetaInfo, filterDescriptor: { [key: string]: BehaviorSubject<any> } }>;
  public get fetchInfo(): BehaviorSubject<{ resultInfo: ResultInfo; metaInfo: MetaInfo, filterDescriptor: { [key: string]: BehaviorSubject<any> } }> {
    return this.fetchInfo$;
  }
  public set fetchInfo(value: BehaviorSubject<{ resultInfo: ResultInfo; metaInfo: MetaInfo, filterDescriptor: { [key: string]: BehaviorSubject<any> } }>) {
    this.fetchInfo$ = value;
  }
  /**
   * Evento runtime emesso quando il datasource e pronto per essere consumato da componenti host.
   */
  public datasourceReady$: BehaviorSubject<DataSourceComponent | null>;
  /**
   * Evento runtime emesso una sola volta al primo payload non nullo pubblicato su `fetchInfo$`.
   */
  public afterFirstLoad$: BehaviorSubject<any>;
  /**
   * Evento runtime emesso prima della sync; il consumer puo annullare impostando `cancel=true` o chiamando `cancelSync()`.
   */
  public beforeSync$: Subject<DataSourceBeforeSyncEvent>;
  /**
   * Evento runtime emesso dopo una sync completata con successo.
   */
  public afterSync$: Subject<DataSourceAfterSyncEvent>;
  // user: UserInfo;
  /**
   * Proprieta di stato del componente per pristine, usata dalla logica interna e dal template.
   */
  pristine: any;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a client side crud active.
   */
  clientSideCrudActive: boolean = false;
  /**
   * Proprieta di stato del componente per last client side crud sync result, usata dalla logica interna e dal template.
   */
  lastClientSideCrudSyncResult?: { inserted: number; updated: number; deleted: number };

  /**
   * Proprieta di stato del componente per last action, usata dalla logica interna e dal template.
   */
  private lastAction: string | null = null;
  /**
   * Contatore richieste in-flight per gestire il busy in modo concorrente-safe.
   */
  private loadingInFlight = 0;
  /**
   * Flag interno per garantire emissione "after first load" una sola volta per ciclo init.
   */
  private firstFetchInfoPublished = false;

  /**
* Inizializza il datasource con i servizi iniettati e avvia la configurazione base tramite `init()`.
* @param metaSrv Servizio metadati usato per caricare schema route/colonne e invalidare cache correlate.
* @param dataSrv Servizio dati usato per select/sync/export e gestione CRUD client-side.
* @param trnsl Servizio traduzione/localizzazione usato per caption e notifiche.
* @param workflowRuntimeMetadata Servizio che fornisce/consuma patch metadati runtime per flussi workflow.
* @param router Router Angular usato per intercettare navigazione e sincronizzare stato datasource.
* @param aRoute ActivatedRoute usata per leggere parametri route/query (`route`, `action`, `filterInfo`, ...).
* @returns function Object() { [native code] }
*/
  constructor(
    private metaSrv: MetadataProviderService,
    private dataSrv: DataProviderService,
    private trnsl: TranslationManagerService,
    private workflowRuntimeMetadata: WorkflowRuntimeMetadataService,
    private router: Router,
    private aRoute: ActivatedRoute,
    private userInfo: UserInfoService,
  ) {
    this.fetchInfo$ = new BehaviorSubject<any>(null);
    this.datasourceReady$ = new BehaviorSubject<DataSourceComponent | null>(null);
    this.afterFirstLoad$ = new BehaviorSubject<any>(null);
    this.beforeSync$ = new Subject<DataSourceBeforeSyncEvent>();
    this.afterSync$ = new Subject<DataSourceAfterSyncEvent>();

    this.init();

    // this.user = this.userInfo.getuserInfo();
  }

  /**
* Reimposta lo stato interno (paging, filtri, metadati, descriptor e flag CRUD client-side) a valori iniziali.
*/
  private init() {
    this.sortInfo = [];
    this.groupInfo = [];
    this.aggregationInfo = [];
    this.pageSize = 10;
    this.currentPage = 1;
    this.pageCursor = null;
    this.pageDirection = 'next';
    this.nextPageCursor = null;
    this.prevPageCursor = null;
    this.prevCursors = [];
    this.cursorMode = false;
    this.filterInfo = undefined;

    this.filterDescriptor = {};
    this.lastProcessedFilterInfoRef = undefined;
    this.lastProcessedFilterInfoSignature = undefined;

    this.metaInfo = new MetaInfo();
    this.clientSideCrudActive = false;
    this.lastClientSideCrudSyncResult = undefined;
    this.loadingInFlight = 0;
    this.firstFetchInfoPublished = false;
    this.afterFirstLoad$.next(null);

    // Clear the last `fetchInfo$` emission BEFORE the new route starts
    // fetching. `fetchInfo$` is a BehaviorSubject that replays the last
    // payload to any new subscriber — without this reset, when the user
    // navigates (e.g. `countries/list` -> `schedules/scheduler`) the
    // bounded-repeater instance is reused, its DataSource runs `init()`
    // and starts a new fetch, but the archetype component (scheduler,
    // list-grid, map-list, ...) subscribes and IMMEDIATELY receives the
    // previous route's payload (countries rows) before the new data
    // arrives. Each archetype then renders that stale content for a
    // split-second (country names plastered on a calendar, rows of
    // schedules in a list-grid, etc.). The archetype handlers already
    // guard against a `null` payload (scheduler at line 326:
    // `if (info) { ... }`, list-grid and friends do the same), so
    // pushing `null` here makes them wait for the real new-route
    // emission without ever showing stale data.
    this.fetchInfo$?.next(null);

    this.route = new BehaviorSubject<string>(null);
  }

  /**
* Incrementa il contatore loading e notifica busy=true solo sulla transizione 0->1.
*/
  private beginLoading(): void {
    this.loadingInFlight = Math.max(0, this.loadingInFlight) + 1;
    if (this.loadingInFlight === 1) {
      this.loading?.next?.(true);
    }
  }

  /**
* Decrementa il contatore loading e notifica busy=false solo sulla transizione 1->0.
*/
  private endLoading(): void {
    this.loadingInFlight = Math.max(0, this.loadingInFlight - 1);
    if (this.loadingInFlight === 0) {
      this.loading?.next?.(false);
    }
  }

  /**
* Ripristina forzatamente lo stato loading in caso di recovery da errori inattesi.
*/
  public resetLoadingState(): void {
    this.loadingInFlight = 0;
    this.loading?.next?.(false);
  }

  /**
* Legge `filterInfo` dalla querystring, aggiorna `filterInfo.filters` (anche querystring-fixed) e sincronizza i valori nel `filterDescriptor`.
*/
  private applyFilterInfoFromQueryString() {
    const raw = this.aRoute.snapshot.queryParamMap.get('filterInfo') ?? this.aRoute.snapshot.queryParamMap.get('filterinfo');
    this.lastFilterInfoQueryRaw = raw;
    if (!raw) {
      if (this.filterInfo?.filters?.length) {
        const removedFields = this.collectQuerystringFilterFields(this.filterInfo);

        if (removedFields.length) {
          this.filterInfo.filters = this.removeQuerystringFilters(this.filterInfo.filters);

          if (this.filterDescriptor) {
            removedFields.forEach((field) => {
              this.resetFilterDescriptorValue(field);
              this.resetFilterDescriptorValue(field + '__lookup_obj');

              const col = this.metaInfo?.columnMetadata?.find(x => x.mc_nome_colonna === field);
              if (col && this.metaInfo?.operators) {
                this.metaInfo.operators[field] = this.getDefaultFilterOperatorForColumn(col);
              }
            });
          }
        }
      }
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      this.filterInfo = this.normalizeFilterInfoWithQuerystringFlag(parsed);

      this.applyFilterInfoToFilterDescriptor();
    } catch (err) {
      console.warn('Invalid filterInfo querystring JSON', err);
    }
  }

  /**
* Legge `pageInfo` dalla querystring e riallinea `currentPage`/`pageSize` rispettando i limiti definiti in `tableMetadata`.
*/
  private applyPageInfoFromQueryString() {
    const raw = this.aRoute.snapshot.queryParamMap.get('pageInfo') ?? this.aRoute.snapshot.queryParamMap.get('pageinfo');
    this.lastPageInfoQueryRaw = raw;
    if (!raw) {
      let changed = false;

      // If pageInfo is removed from the URL (browser back), restore default paging state.
      if (this.currentPage !== 1) {
        this.currentPage = 1;
        changed = true;
      }

      if (this.metaInfo?.tableMetadata) {
        const defaultPageSize = this.metaInfo.tableMetadata.md_pageable
          ? this.metaInfo.tableMetadata.md_pagesize
          : 0;

        if (Number.isFinite(Number(defaultPageSize))) {
          const nextPageSize = Math.trunc(Number(defaultPageSize));
          if (this.pageSize !== nextPageSize) {
            this.pageSize = nextPageSize;
            changed = true;
          }
        }
      }

      return changed;
    }

    try {
      const parsed = JSON.parse(raw);
      const pageSizeRaw = parsed?.pageSize ?? parsed?.pagesize ?? parsed?.size ?? parsed?.take;
      const currentPageRaw = parsed?.currentPage ?? parsed?.currentpage ?? parsed?.page ?? parsed?.pageNumber ?? parsed?.pagenumber;

      const pageSize = Number(pageSizeRaw);
      const currentPage = Number(currentPageRaw);
      let changed = false;

      if (Number.isFinite(pageSize) && pageSize >= 0) {
        const nextPageSize = Math.trunc(pageSize);
        if (this.pageSize !== nextPageSize) {
          this.pageSize = nextPageSize;
          changed = true;
        }
      }

      if (Number.isFinite(currentPage) && currentPage > 0) {
        const nextCurrentPage = Math.trunc(currentPage);
        if (this.currentPage !== nextCurrentPage) {
          this.currentPage = nextCurrentPage;
          changed = true;
        }
      }

      return changed;
    } catch (err) {
      console.warn('Invalid pageInfo querystring JSON', err);
      return false;
    }
  }

  /**
* Legge `sortInfo` dalla querystring e ricostruisce `sortInfo` locale in formato usato dalle query dati.
*/
  private applySortInfoFromQueryString() {
    const raw = this.aRoute.snapshot.queryParamMap.get('sortInfo') ?? this.aRoute.snapshot.queryParamMap.get('sortinfo');
    this.lastSortInfoQueryRaw = raw;
    if (!raw) {
      this.sortInfo = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      this.sortInfo = items
        .filter((s: any) => s && typeof s.field === 'string')
        .map((s: any, i: number) => ({
          field: s.field,
          dir: (String(s.dir || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
          mc_id: Number.isFinite(Number(s.mc_id)) ? Number(s.mc_id) : i
        }));
    } catch (err) {
      console.warn('Invalid sortInfo querystring JSON', err);
    }
  }

  /**
* Propaga i filtri strutturati (`filterInfo`) nei BehaviorSubject del `filterDescriptor`, inclusi i campi lookup associati.
*/
  private applyFilterInfoToFilterDescriptor() {
    if (!this.filterInfo || !this.filterDescriptor || !this.metaInfo?.columnMetadata?.length) {
      return;
    }

    // Clear current UI filter controls first, then project querystring filters.
    Object.keys(this.filterDescriptor).forEach((key) => {
      // Keep lookup object state stable during filterInfo reconciliation.
      // Explicit clear flows reset __lookup_obj when required.
      if (key.endsWith('__lookup_obj')) {
        return;
      }
      this.resetFilterDescriptorValue(key);
    });

    this.getDescriptorCompatibleFilters(this.filterInfo).forEach((filter) => {
      const col = this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna === filter.field);
      if (!col) {
        return;
      }

      if (this.filterDescriptor[filter.field]) {
        this.filterDescriptor[filter.field].next(filter.value);
      }

      if (filter.operatore) {
        this.metaInfo.operators[filter.field] = filter.operatore;
      }
    });
  }

  /**
   * Normalizza il payload filterInfo (anche annidato) preservando struttura `nestedFilters`.
   */
  private normalizeFilterInfoWithQuerystringFlag(raw: any): FilterInfo {
    const rootLogic = String(raw?.logic ?? raw?.logicOperator ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const rawFilters = Array.isArray(raw?.filters) ? raw.filters : (Array.isArray(raw) ? raw : []);

    const normalizeNode = (node: any): any | null => {
      if (!node) {
        return null;
      }

      if (node?.nestedFilters && Array.isArray(node.nestedFilters.filters)) {
        const nested = this.normalizeFilterInfoWithQuerystringFlag(node.nestedFilters);
        return {
          field: typeof node.field === 'string' ? node.field : '',
          operatore: node.operatore ?? node.operator ?? '=',
          value: node.value ?? null,
          fixed: node.fixed === undefined ? true : !!node.fixed,
          __extra: !!node.__extra,
          __querystring: true,
          nestedFilters: {
            logic: nested.logic,
            filters: nested.filters
          }
        };
      }

      if (typeof node?.field !== 'string') {
        return null;
      }

      return {
        field: node.field,
        operatore: node.operatore ?? node.operator ?? '=',
        value: node.value,
        fixed: node.fixed === undefined ? true : !!node.fixed,
        __extra: !!node.__extra,
        __querystring: true
      };
    };

    const filters = rawFilters
      .map((f: any) => normalizeNode(f))
      .filter((f: any) => !!f);

    return new FilterInfo(rootLogic as any, filters as any);
  }

  /**
   * Ritorna solo filtri "flat" compatibili con i controlli descriptor.
   */
  private getDescriptorCompatibleFilters(filterInfo?: any): any[] {
    if (!filterInfo || !Array.isArray(filterInfo.filters)) {
      return [];
    }

    return filterInfo.filters.filter((f: any) =>
      !!f
      && typeof f.field === 'string'
      && !f?.nestedFilters
    );
  }

  private collectQuerystringFilterFields(filterInfo?: any): string[] {
    const fields = new Set<string>();

    const visit = (group: any) => {
      const filters = Array.isArray(group?.filters) ? group.filters : [];
      filters.forEach((f: any) => {
        if (!f) {
          return;
        }
        if (f?.nestedFilters) {
          visit(f.nestedFilters);
        } else if (f?.__querystring && typeof f.field === 'string' && f.field) {
          fields.add(f.field);
        }
      });
    };

    visit(filterInfo);
    return [...fields];
  }

  private removeQuerystringFilters(filters: any[]): any[] {
    if (!Array.isArray(filters)) {
      return [];
    }

    const cleaned = filters
      .map((f: any) => {
        if (!f) {
          return null;
        }
        if (f?.nestedFilters && Array.isArray(f.nestedFilters.filters)) {
          const nested = this.removeQuerystringFilters(f.nestedFilters.filters);
          if (!nested.length && f?.__querystring) {
            return null;
          }
          return {
            ...f,
            nestedFilters: {
              logic: f?.nestedFilters?.logic ?? 'AND',
              filters: nested
            }
          };
        }
        return f?.__querystring ? null : f;
      })
      .filter((f: any) => !!f);

    return cleaned;
  }

  /**
* Indica se l'action corrente richiede caricamento dati oltre allo schema.
* @param action Azione route (es. list, detail, kanban).
* @returns `true` se va eseguito anche fetch dati.
*/
  private actionRequiresDataFetch(action: string | null | undefined): boolean {
    const normalized = String(action || '').trim().toLowerCase();
    if (!normalized) {
      return !!this.autoload;
    }

    const dataActions = new Set([
      'list',
      'edit',
      'detail',
      'kanban'
    ]);

    return dataActions.has(normalized);
  }

  // ngOnChanges(changes: SimpleChanges): void {
  //   console.log(changes);
  // }

  /**
* Configura route/query subscriptions, applica stato URL (filter/page/sort) e avvia il caricamento schema/dati iniziale.
*/
  ngOnInit() {
    DataSourceComponent.liveInstances.add(this);
    this.lastAction = this.aRoute.snapshot.paramMap.get('action');

    if (this.routeFromRouting) {
      this.routerEventsSubscription?.unsubscribe();
      this.routerEventsSubscription = this.router.events.subscribe((val) => {
        if (val instanceof NavigationEnd) {

          if (this.interval) {
            clearInterval(this.interval);
          }

          const newroute = this.aRoute.snapshot.paramMap.get('route');
          const newaction = this.aRoute.snapshot.paramMap.get('action');
          const currentFilterInfoQueryRaw = this.aRoute.snapshot.queryParamMap.get('filterInfo') ?? this.aRoute.snapshot.queryParamMap.get('filterinfo');
          const currentPageInfoQueryRaw = this.aRoute.snapshot.queryParamMap.get('pageInfo') ?? this.aRoute.snapshot.queryParamMap.get('pageinfo');
          const currentSortInfoQueryRaw = this.aRoute.snapshot.queryParamMap.get('sortInfo') ?? this.aRoute.snapshot.queryParamMap.get('sortinfo');
          const filterInfoChanged = currentFilterInfoQueryRaw !== this.lastFilterInfoQueryRaw;
          const pageInfoChanged = currentPageInfoQueryRaw !== this.lastPageInfoQueryRaw;
          const sortInfoChanged = currentSortInfoQueryRaw !== this.lastSortInfoQueryRaw;

          const actionChanged = this.lastAction !== newaction;
          if (this.route.value && (newroute !== this.route.value || actionChanged)) {
            this.init();
            this.applyFilterInfoFromQueryString();
            this.applyPageInfoFromQueryString();
            this.applySortInfoFromQueryString();

            this.route.next(newroute || '');

            const shouldFetchData = this.actionRequiresDataFetch(newaction);
            this.getSchemaAndData(!shouldFetchData);
          } else if (filterInfoChanged || pageInfoChanged || sortInfoChanged) {
            this.applyFilterInfoFromQueryString();
            const pageInfoAppliedChange = this.applyPageInfoFromQueryString();
            this.applySortInfoFromQueryString();

            if (this.metaInfo?.columnMetadata?.length) {
              // Avoid duplicate fetch when pageInfo in URL was just synced from the grid
              // and matches the already-applied datasource paging values.
              if (filterInfoChanged || sortInfoChanged || pageInfoAppliedChange) {
                this.fetchData();
              }
            }
          }

          this.lastAction = newaction;
        }
      });

      this.applyFilterInfoFromQueryString();
      this.applyPageInfoFromQueryString();
      this.applySortInfoFromQueryString();
      this.route.next(this.aRoute.snapshot.paramMap.get('route') || '');
      const initialAction = this.aRoute.snapshot.paramMap.get('action');
      const shouldFetchDataOnInit = this.actionRequiresDataFetch(initialAction);
      this.getSchemaAndData(!shouldFetchDataOnInit);

    } else {
      this.applyFilterInfoFromQueryString();
      this.applyPageInfoFromQueryString();
      this.applySortInfoFromQueryString();

      if (this.route) {
        this.routeInputSubscription?.unsubscribe();
        this.routeInputSubscription = this.route.subscribe(async (route) => {
          if (route) {
            if ((this as any)._suppressNextRouteFetch === true) {
              (this as any)._suppressNextRouteFetch = false;
              return;
            }
            this.getSchemaAndData(!this.autoload);
          }
        });
      }

      if (this.hardcodedRoute) {
        this.route.next(this.hardcodedRoute);
      }
    }

    if (this.componentRef) {
      this.componentRef.next({ component: this, id: this.componentRef.value.id, name: this.componentRef.value.name, uniqueName: this.componentRef.value.uniqueName });
    }

    this.datasourceReady$.next(this);
  }

  /**
* Esegue cleanup completo del datasource: timer, subscription, selezione e stato transitorio.
*/
  ngOnDestroy(): void {
    DataSourceComponent.liveInstances.delete(this);

    if (this.interval) {
      clearInterval(this.interval);
    }
    this.routerEventsSubscription?.unsubscribe();
    this.routeInputSubscription?.unsubscribe();
    this.actionStateSubscription?.unsubscribe();
    this.clearConditionSubscriptions();
    this.clearTrackedRecordSubscriptions();
    this.selectedRows = [];

    delete this.metaInfo;
    delete this.resultInfo;
    delete this.pristine;
    // delete this.user;
    delete this.sortInfo;
    delete this.groupInfo;
    delete this.filterInfo;
    this.pageSize = 10;
    this.currentPage = 1;
    this.filterDescriptor = {};
    this.datasourceReady$.next(null);
    this.afterFirstLoad$.next(null);
    this.beforeSync$.complete();
    this.afterSync$.complete();
  }

  /**
* Pubblica il payload su `fetchInfo$` e notifica `afterFirstLoad$` alla prima emissione utile del ciclo corrente.
 * @param payload Payload stato datasource da pubblicare ai consumer.
 */
  private publishFetchInfo(payload: any): void {
    this.fetchInfo$.next(payload);

    if (!this.firstFetchInfoPublished && payload) {
      this.firstFetchInfoPublished = true;
      this.afterFirstLoad$.next(payload);
    }
  }

  private emitBeforeSync(
    operation: DataSourceSyncOperation | DataSourceSyncOperation[],
    entity: any,
    original: any
  ): DataSourceBeforeSyncEvent {
    const beforeSyncEvent: DataSourceBeforeSyncEvent = {
      operation,
      entity,
      original,
      datasource: this,
      cancel: false,
      cancelReason: undefined,
      cancelSync: (reason?: string) => {
        beforeSyncEvent.cancel = true;
        if (reason) {
          beforeSyncEvent.cancelReason = reason;
        }
      }
    };

    this.beforeSync$.next(beforeSyncEvent);
    return beforeSyncEvent;
  }

  private emitAfterSync(
    operation: DataSourceSyncOperation | DataSourceSyncOperation[],
    entity: any,
    original: any,
    syncedData: any
  ): void {
    this.afterSync$.next({
      operation,
      entity,
      original,
      syncedData,
      datasource: this
    });
  }

  /**
* Aggiorna la selezione corrente mantenendo solo righe valide (non null/undefined).
* @param rows Record/elemento su cui applicare la logica del metodo.
*/
  public setSelectedRows(rows: any[] | null | undefined): void {
    this.selectedRows = Array.isArray(rows) ? rows.filter((r) => r !== null && r !== undefined) : [];
  }

  /**
* Svuota la selezione locale delle righe.
*/
  public clearSelectedRows(): void {
    this.selectedRows = [];
  }

  public getSelectedRows(): any[] {
    return this.selectedRows;
  }

  /**
* Estrae dalla selezione i valori della chiave primaria; per PK composta restituisce un oggetto per riga.
* @returns Elenco chiavi primarie dei record selezionati (singola PK o oggetto PK composta).
*/
  public getSelectedKeys(): any[] {
    const rows = Array.isArray(this.selectedRows) ? this.selectedRows : [];
    if (!rows.length) {
      return [];
    }

    const pKeys = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || []);
    if (!pKeys?.length) {
      return [];
    }

    const normalizeRow = (row: any) => {
      try {
        return WtoolboxService.unwrapEntity ? WtoolboxService.unwrapEntity(row) : row;
      } catch {
        return row;
      }
    };

    if (pKeys.length === 1) {
      const keyName = pKeys[0].mc_nome_colonna;
      return rows
        .map((r) => normalizeRow(r)?.[keyName])
        .filter((v) => v !== null && v !== undefined);
    }

    return rows.map((r) => {
      const record = normalizeRow(r);
      const obj: any = {};
      pKeys.forEach((pk) => {
        obj[pk.mc_nome_colonna] = record?.[pk.mc_nome_colonna];
      });
      return obj;
    });
  }

  /**
* Annulla tutte le subscription del motore condizioni per evitare listener duplicati e memory leak.
*/
  private clearConditionSubscriptions(): void {
    this.conditionSubscriptions.forEach((sub) => sub.unsubscribe());
    this.conditionSubscriptions = [];
  }

  /**
* Annulla le subscription usate dal change tracking del record corrente.
*/
  private clearTrackedRecordSubscriptions(): void {
    this.trackedRecordSubscriptions.forEach((sub) => sub.unsubscribe());
    this.trackedRecordSubscriptions = [];
  }

  /**
* Crea un record reattivo con un `BehaviorSubject` per campo metadato e supporto campi lookup (`__lookup_obj`).
* @param dato Record sorgente (plain o parzialmente reattivo) da convertire in struttura osservabile.
* @param metaInfo Metadati colonna usati per creare i subject per ciascun campo, inclusi lookup.
* @returns Record osservabile pronto per binding/editing, con subject per ogni campo metadato.
*/
  public static getObservable(dato: any, metaInfo: MetaInfo): { [key: string]: BehaviorSubject<any> } {
    let obj = {
      __new: dato?.__new ? dato.__new : new BehaviorSubject<any>(dato == null ? true : false),
      __guid: dato?.__guid ? dato.__guid : new BehaviorSubject<any>(dato == null ? WtoolboxService.uuidv4() : null),
    };

    if (metaInfo) {
      metaInfo.columnMetadata.forEach(column => {
        obj[column.mc_nome_colonna] = new BehaviorSubject<any>(dato ? dato[column.mc_nome_colonna] : null);

        if (column.mc_ui_column_type == "lookupByID") {
          // Guard upstream: a lookupByID column without a target route, or
          // pointing to a route that the metadata cache cannot resolve, is
          // a metadata-config bug — surface it as a typed exception
          // (errors.client.metadata.lookup_orphan) instead of letting a
          // null-deref bubble up to errors.client.unknown.
          const lookupRoute = column.mc_ui_lookup_entity_name;
          if (lookupRoute === null || lookupRoute === undefined || String(lookupRoute).trim() === '') {
            GlobalHandler.emitClientException(new WuicClientException(
              WuicErrorCodes.ClientMetadataLookupOrphan,
              { column: column.mc_nome_colonna, lookupRoute: '(empty)' },
              { surface: 'component', targetName: 'DataSourceComponent.getObservable' }
            ));
            return; // skip this column instead of crashing the whole forEach
          }
          let metadataKnowsLookupRoute = true;
          try {
            const cache: any = (MetadataProviderService as any)?.metaInfoCache;
            if (cache && typeof cache === 'object' && Object.keys(cache).length > 0
                && !(lookupRoute in cache) && !(String(lookupRoute) in cache)) {
              metadataKnowsLookupRoute = false;
            }
          } catch { /* metadata cache not yet initialized — accept route */ }
          if (!metadataKnowsLookupRoute) {
            GlobalHandler.emitClientException(new WuicClientException(
              WuicErrorCodes.ClientMetadataLookupOrphan,
              { column: column.mc_nome_colonna, lookupRoute: String(lookupRoute) },
              { surface: 'component', targetName: 'DataSourceComponent.getObservable' }
            ));
            return;
          }

          const lookupObjKey = column.mc_nome_colonna + "__lookup_obj";
          const lookupAliasKey = String(lookupRoute).replaceAll(' ', '_') + '___' + column.mc_ui_lookup_dataTextField + '__' + column.mc_nome_colonna;
          const valueField = String(column.mc_ui_lookup_dataValueField || column.mc_nome_colonna || '').trim();
          const textField = String(column.mc_ui_lookup_dataTextField || column.mc_ui_grid_display_field || '').trim();
          const rawLookupObj = dato ? dato[lookupObjKey] : null;
          const rawValue = dato ? dato[column.mc_nome_colonna] : null;
          const rawText = dato ? (dato[lookupAliasKey] ?? dato[column.mc_ui_grid_display_field] ?? dato[column.mc_ui_lookup_dataTextField]) : null;

          let hydratedLookupObj: any = null;
          if (rawLookupObj) {
            hydratedLookupObj = rawLookupObj;
          } else if (rawValue !== null && rawValue !== undefined) {
            const fallbackObj: any = {};
            if (valueField) {
              fallbackObj[valueField] = rawValue;
            } else {
              fallbackObj[column.mc_nome_colonna] = rawValue;
            }
            if (textField && rawText !== null && rawText !== undefined) {
              fallbackObj[textField] = rawText;
            }
            hydratedLookupObj = fallbackObj;
          }

          obj[lookupObjKey] = new BehaviorSubject<any>(hydratedLookupObj);

          if (dato) {
            obj[lookupAliasKey] = new BehaviorSubject<any>(dato[lookupAliasKey]);
          }
        }

        if (column.mc_ui_column_type == "multiple_check") {
          let selection = [];
          const mmLookupObjKey = column.mc_nome_colonna + "__lookup_obj";

          // Prefer the rich `<col>__lookup_obj` array of joined objects when
          // present. The first pass through getObservable builds this key from
          // the backend payload (`dato[col]` is an array of objects with
          // related id + display fields). A subsequent pass via
          // getData() -> getModelFromObservable() -> setCurrent() -> getObservable()
          // sees `dato[col]` already flattened into raw IDs, so we must
          // fall back to `dato[<col>__lookup_obj]` to keep the chip labels.
          let sourceArr: any[] = null;
          if (dato && Array.isArray(dato[mmLookupObjKey])) {
            sourceArr = dato[mmLookupObjKey];
          } else if (dato && Array.isArray(dato[column.mc_nome_colonna])) {
            sourceArr = dato[column.mc_nome_colonna];
          }

          if (sourceArr) {
            sourceArr.forEach((selectionElement) => {
              if (selectionElement && typeof selectionElement === 'object') {
                selection.push(selectionElement[column.mc_ui_grid_related_id_field]);
              } else {
                // Legacy fallback: array of plain related-ids.
                selection.push(selectionElement);
              }
            });
            obj[mmLookupObjKey] = new BehaviorSubject<any>(sourceArr);
          } else {
            obj[mmLookupObjKey] = new BehaviorSubject<any>([]);
          }

          obj[column.mc_nome_colonna] = new BehaviorSubject<any>(selection);
        }
      });
    }

    return obj;
  }

  /**
* Crea un record reattivo con un `BehaviorSubject` per campo metadato e supporto campi lookup (`__lookup_obj`).
* @param dato Record sorgente (plain o parzialmente reattivo) da convertire in struttura osservabile.
* @returns Record osservabile pronto per binding/editing, con subject per ogni campo metadato.
*/
  public getObservable(dato?: any) {
    return DataSourceComponent.getObservable(dato, this.metaInfo);
  }

  /**
* Converte un record reattivo in oggetto plain estraendo i valori correnti dai BehaviorSubject.
* @param dato Record osservabile da convertire in oggetto plain.
* @param metaInfo Metadati colonna usati per leggere i campi previsti dal modello.
* @returns Oggetto plain con i valori correnti estratti dai subject del record.
*/
  public static getModelFromObservable(dato: any, metaInfo: MetaInfo) {
    let obj = {};

    if (!dato || !metaInfo?.columnMetadata?.length) {
      return obj;
    }

    metaInfo.columnMetadata.forEach(element => {
      if (!element?.mc_nome_colonna) {
        return;
      }

      const valueObs = dato[element.mc_nome_colonna];
      const isValueObservable = !!valueObs && typeof valueObs === 'object' && 'value' in valueObs;
      obj[element.mc_nome_colonna] = isValueObservable ? valueObs.value : valueObs;

      if (element.mc_ui_column_type == "lookupByID" || element.mc_ui_column_type == "multiple_check") {
        const lookupObjKey = element.mc_nome_colonna + "__lookup_obj";
        const lookupAliasKey = element.mc_ui_lookup_entity_name?.toString?.().replaceAll(' ', '_') + '___' + element.mc_ui_lookup_dataTextField + '__' + element.mc_nome_colonna;

        const lookupObjObs = dato[lookupObjKey];
        if (lookupObjObs !== undefined) {
          const isLookupObjObservable = !!lookupObjObs && typeof lookupObjObs === 'object' && 'value' in lookupObjObs;
          obj[lookupObjKey] = isLookupObjObservable ? lookupObjObs.value : lookupObjObs;
        }

        if (lookupAliasKey && !lookupAliasKey.startsWith('undefined')) {
          const lookupAliasObs = dato[lookupAliasKey];
          if (lookupAliasObs !== undefined) {
            const isLookupAliasObservable = !!lookupAliasObs && typeof lookupAliasObs === 'object' && 'value' in lookupAliasObs;
            obj[lookupAliasKey] = isLookupAliasObservable ? lookupAliasObs.value : lookupAliasObs;
          }
        }
      }
    });

    return obj;
  }

  /**
* Converte un record reattivo in oggetto plain estraendo i valori correnti dai BehaviorSubject.
* @param dato Record osservabile da convertire in oggetto plain.
* @returns Oggetto plain con i valori correnti estratti dai subject del record.
*/
  public getModelFromObservable(dato: any) {
    return DataSourceComponent.getModelFromObservable(dato, this.metaInfo);
  }

  /**
* Restituisce il valore della proprietà richiesta con ricerca case-insensitive sulla chiave oggetto.
* @param obj Oggetto sorgente su cui cercare la proprietà.
* @param propName Nome proprietà da risolvere ignorando maiuscole/minuscole.
* @returns Valore proprietà risolta con ricerca case-insensitive.
*/
  public static getValueCaseInsensitive<T extends Record<string, any>>(
    obj: T,
    propName: string
  ) {
    const key = Object.keys(obj).find(
      k => k.toLowerCase() === propName.toLowerCase()
    );
    return key !== undefined ? obj[key as keyof T] : undefined;
  }

  /**
* Filtra i record in memoria (`resultInfo.dato`) confrontando i campi indicati nel filtro.
* @param filter Mappa `campo -> valore` usata per filtrare i record già caricati lato client.
* @param caseInsensitive Se true, i confronti stringa ignorano differenze maiuscole/minuscole.
* @returns Sottoinsieme di `resultInfo.dato` che soddisfa i criteri di filtro richiesti.
*/
  public getClientRecordsByFilter(filter: { [key: string]: any }, caseInsensitive: boolean = false): any[] {
    let records = this.resultInfo.dato.filter((record) => {
      return Object.keys(filter).every((key) => {
        const value = filter[key];
        if (caseInsensitive && typeof value === 'string') {
          const recordValue = DataSourceComponent.getValueCaseInsensitive(record, key);
          return typeof recordValue === 'string' && recordValue.toLowerCase() === value.toLowerCase();
        } else {
          return value == DataSourceComponent.getValueCaseInsensitive(record, key);
        }
      });
    });
    return records.map(record => this.getObservable(record));
  }

  /**
* Trova il record locale che corrisponde al valore della chiave primaria passato in input.
* @param pkeyValue Identificativo tecnico usato per lookup e matching.
* @returns Record locale corrispondente alla PK richiesta, se presente.
*/
  public getClientRecordByPKey(pkeyValue: any): any {
    if (!this.metaInfo?.pKey) {
      throw new Error('Primary key is not defined in metadata.');
    }
    return this.getObservable(this.resultInfo.dato.find((record) => record[this.metaInfo.pKey.mc_nome_colonna] == pkeyValue));
  }

  /**
* Applica un payload di aggiornamento su un record reattivo propagando i nuovi valori sui rispettivi BehaviorSubject.
* @param record Record osservabile da aggiornare.
* @param payload Oggetto con campi/valori da applicare al record.
* @returns True se almeno un campo è stato aggiornato nel record osservabile.
*/
  public setClientRecordValue(record: { [key: string]: BehaviorSubject<any> }, payload: any): boolean {
    if (!record || !payload || typeof payload !== 'object') {
      return false;
    }

    let match = true;
    let foundTC = true;

    let tc = this.changes.find(x => x.pkey == record[this.metaInfo.pKey.mc_nome_colonna]?.value);

    if (!tc) {
      tc = new TrackedChange(record[this.metaInfo.pKey.mc_nome_colonna]?.value, null);
      foundTC = false;
    }

    Object.keys(payload).forEach((key) => {
      const realKey = Object.keys(record).find(
        k => k.toLowerCase() === key.toLowerCase()
      );

      if (realKey && record[realKey]) {
        let oldValue = record[realKey].value;

        record[realKey].next(payload[key]);

        if (this.changeTracking) {
          let cT = tc.changes.find(x => x.field == realKey);
          const hasRealDiff = !this.areTrackedFieldValuesEqual(realKey, oldValue, payload[key]);

          if (!cT && hasRealDiff) {
            cT = new ChangeT(realKey, this.cloneJson(oldValue), this.cloneJson(payload[key]));
            tc.changes.push(cT);
          } else if (cT && hasRealDiff) {
            cT.newValue = this.cloneJson(payload[key]);
            cT.timestamp = new Date();
          } else if (cT && !hasRealDiff) {
            tc.changes = tc.changes.filter((x) => x !== cT);
          }
        }

        const originalRecord = this.resultInfo.dato.find((r) => {
          const recordValue = r[this.metaInfo.pKey.mc_nome_colonna];
          return recordValue === record[this.metaInfo.pKey.mc_nome_colonna].value;
        });

        if (originalRecord) {
          originalRecord[realKey] = payload[key];
          // Replace row reference in-memory so pure pipes and table rendering
          // can detect the updated row without requiring persistence/fetch.
          const rowIndex = this.resultInfo.dato.indexOf(originalRecord);
          if (rowIndex >= 0) {
            this.resultInfo.dato[rowIndex] = { ...originalRecord };
          }
        } else {
          match = false;
        }
      } else {
        match = false;
      }
    });

    if (match && this.changeTracking && !foundTC) {
      this.changes.push(tc);
    }

    return match;
  }

  /**
 * Confronta due valori tracciati tenendo conto di casi speciali metadata-driven (es. many-to-many).
 */
  private areTrackedFieldValuesEqual(fieldName: string, left: any, right: any): boolean {
    const column = (this.metaInfo?.columnMetadata || []).find((c) => c?.mc_nome_colonna === fieldName);
    if (column?.mc_ui_column_type === "multiple_check") {
      return this.areManyToManySelectionsEqual(left, right);
    }

    return this.areDeepValuesEqual(left, right);
  }

  /**
* Resetta in modo tipizzato un campo del filter descriptor.
* I lookup multi-select richiedono `[]` (non `null`) per evitare stato UI incoerente.
*/
  private resetFilterDescriptorValue(fieldName: string): void {
    if (!fieldName || !this.filterDescriptor?.[fieldName]) {
      return;
    }

    if (fieldName.endsWith('__lookup_obj')) {
      const baseField = fieldName.substring(0, fieldName.length - '__lookup_obj'.length);
      const col = this.metaInfo?.columnMetadata?.find((x) => x.mc_nome_colonna === baseField);
      const operator = String(this.metaInfo?.operators?.[baseField] || '').toLowerCase();
      const useArray =
        col?.mc_ui_column_type === 'multiple_check' ||
        (col?.mc_ui_column_type === 'lookupByID' && operator === 'eqor');

      this.filterDescriptor[fieldName].next(useArray ? [] : null);
      return;
    }

    this.filterDescriptor[fieldName].next(null);
  }

  /**
 * Restituisce l'operatore filtro di default per colonna, con supporto lookup multicheck (`eqor`).
 */
  private getDefaultFilterOperatorForColumn(col: any): string {
    if (!col) {
      return 'eq';
    }

    if (!!col.mc_is_range_filter) {
      return 'between';
    }

    if (col.mc_ui_column_type == 'text' || col.mc_ui_column_type == 'txt_area') {
      return 'contains';
    }

    if (col.mc_ui_column_type == 'multiple_check') {
      return 'eqor';
    }

    if (col.mc_ui_column_type == 'lookupByID' && !!col.mc_is_multicheck_filter) {
      return 'eqor';
    }

    return 'eq';
  }

  /**
  * Confronta due selezioni many-to-many ignorando differenze di ordine/reference.
  */
  private areManyToManySelectionsEqual(left: any, right: any): boolean {
    const normalize = (value: any): string[] => {
      if (value === null || value === undefined) {
        return [];
      }

      const items = Array.isArray(value) ? value : [value];
      return items
        .map((item) => this.normalizeComparableScalar(item))
        .filter((item) => item !== '')
        .sort();
    };

    const leftNorm = normalize(left);
    const rightNorm = normalize(right);
    if (leftNorm.length !== rightNorm.length) {
      return false;
    }

    return leftNorm.every((item, idx) => item === rightNorm[idx]);
  }

  /**
 * Confronto deep generico con supporto a array/oggetti/date.
 */
  private areDeepValuesEqual(left: any, right: any): boolean {
    if (left === right) {
      return true;
    }

    if (left === null || left === undefined || right === null || right === undefined) {
      return left === right;
    }

    if (left instanceof Date || right instanceof Date) {
      const leftDate = left instanceof Date ? left : new Date(left);
      const rightDate = right instanceof Date ? right : new Date(right);
      if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
        return false;
      }
      return leftDate.getTime() === rightDate.getTime();
    }

    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
      }
      return left.every((value, idx) => this.areDeepValuesEqual(value, right[idx]));
    }

    if (typeof left === 'object' && typeof right === 'object') {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      if (leftKeys.length !== rightKeys.length) {
        return false;
      }

      for (let i = 0; i < leftKeys.length; i++) {
        if (leftKeys[i] !== rightKeys[i]) {
          return false;
        }
        if (!this.areDeepValuesEqual(left[leftKeys[i]], right[rightKeys[i]])) {
          return false;
        }
      }
      return true;
    }

    return String(left) === String(right);
  }

  /**
 * Normalizza valori scalari per confronti set-based (many-to-many).
 */
  private normalizeComparableScalar(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '' : value.getTime().toString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
* Carica i metadati della route corrente tramite `MetadataProviderService`.
*/
  private async getMetadata() {
    return await this.metaSrv.getMetadati(this.route.value as string);
  }

  /**
* Esegue la select dati tramite `DataProviderService` e aggiorna `resultInfo`.
*/
  public async getData() {
    this.resultInfo = await this.dataSrv.select(this, true);
    // Ensure current record always goes through setCurrent so pristine + change tracking
    // subscriptions are bound also on edit/detail routes populated by provider select().
    const currentModel = this.getModelFromObservable(this.resultInfo?.current);
    if (currentModel && Object.keys(currentModel).length) {
      this.setCurrent(currentModel);
    }
    // this.pristine = JSON.parse(JSON.stringify(this.resultInfo));
  }



  /**
* Applica patch runtime workflow su tabella/colonne (azioni, permessi, stili) fondendo i bundle con i metadati correnti.
* @param route Route corrente usata per recuperare il bundle metadati runtime workflow.
*/
  private applyWorkflowRuntimeRouteMetadata(route: string): void {
    if (!this.metaInfo?.tableMetadata || !Array.isArray(this.metaInfo?.columnMetadata)) {
      return;
    }

    const action = String(this.aRoute?.snapshot?.paramMap?.get('action') || '').trim();
    const pendingBundle = this.cloneJson(this.workflowRuntimeMetadata.consumePendingRouteMetadata(route, action));
    const bundle = pendingBundle ?? this.cloneJson(this.workflowRuntimeMetadata.getRouteMetadata(route, action));
    if (!bundle || typeof bundle !== 'object') {
      return;
    }

    const tablePatch = this.cloneJson(bundle.tableMetadata || {});
    if (tablePatch && typeof tablePatch === 'object') {
      Object.keys(tablePatch).forEach((key) => {
        this.metaInfo.tableMetadata[key] = tablePatch[key];
      });
    }

    this.metaInfo.tableMetadata._Metadati_Custom_Actions_Tabelles = this.cloneJson(bundle.tableActions || []);
    this.metaInfo.tableMetadata._Metadati_Utenti_Autorizzazioni_Tabelles = this.cloneJson(bundle.tablePermissions || []);
    this.metaInfo.tableMetadata._Metadati_UI_Stili_Tabelles = this.cloneJson(bundle.tableStyles || []);
    this.rehydrateRuntimeTableActionCallbacks(this.metaInfo.tableMetadata._Metadati_Custom_Actions_Tabelles, route);

    const sourceColumns = Array.isArray(this.metaInfo.columnMetadata) ? this.metaInfo.columnMetadata : [];
    const bundleColumns = Array.isArray(bundle.columnMetadata) ? bundle.columnMetadata : [];
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();

    bundleColumns.forEach((col: any) => {
      const id = String(col?.mc_id || '').trim();
      const name = String(col?.mc_nome_colonna || '').trim().toLowerCase();
      if (id) {
        byId.set(id, col);
      }
      if (name) {
        byName.set(name, col);
      }
    });

    sourceColumns.forEach((col: any) => {
      const id = String(col?.mc_id || '').trim();
      const name = String(col?.mc_nome_colonna || '').trim().toLowerCase();
      const patch = (id && byId.get(id)) || (name && byName.get(name));
      if (!patch) {
        return;
      }
      Object.keys(patch).forEach((key) => {
        col[key] = patch[key];
      });
    });

    const columnPermissions = Array.isArray(bundle.columnPermissions) ? bundle.columnPermissions : [];
    const columnStyles = Array.isArray(bundle.columnStyles) ? bundle.columnStyles : [];
    const permissionByColId = new Map<string, any[]>();
    const permissionByColName = new Map<string, any[]>();
    const styleByColId = new Map<string, any[]>();
    const styleByColName = new Map<string, any[]>();

    const pushMap = (map: Map<string, any[]>, key: any, value: any) => {
      const normalized = String(key || '').trim().toLowerCase();
      if (!normalized) {
        return;
      }
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      map.get(normalized)!.push(value);
    };

    columnPermissions.forEach((row: any) => {
      pushMap(permissionByColId, this.pickFirstDefined(row, ['mc_id', 'mcid']), row);
      pushMap(permissionByColName, this.pickFirstDefined(row, ['__column_name', 'mc_nome_colonna']), row);
    });
    columnStyles.forEach((row: any) => {
      pushMap(styleByColId, this.pickFirstDefined(row, ['mc_id', 'mcid']), row);
      pushMap(styleByColName, this.pickFirstDefined(row, ['__column_name', 'mc_nome_colonna']), row);
    });

    sourceColumns.forEach((col: any) => {
      const idKey = String(col?.mc_id || '').trim().toLowerCase();
      const nameKey = String(col?.mc_nome_colonna || '').trim().toLowerCase();
      const permissions = [
        ...(permissionByColId.get(idKey) || []),
        ...(permissionByColName.get(nameKey) || [])
      ];
      const styles = [
        ...(styleByColId.get(idKey) || []),
        ...(styleByColName.get(nameKey) || [])
      ];

      col._Metadati_Utenti_Autorizzazioni_Colonnes = this.cloneJson(permissions);
      col._Metadati_UI_Stili_Colonnes = this.cloneJson(styles);
    });
  }

  /**
* Ricostruisce le callback delle custom action tabella (`action_callback__fn`, `disable_callback__fn`) e aggancia il linking di navigazione workflow.
* @param actions Lista custom action tabella da rendere eseguibile (callback function ricostruite).
* @param currentRoute Route sorgente usata per il linking automatico delle azioni di navigazione.
*/
  private rehydrateRuntimeTableActionCallbacks(actions: MetadatiCustomActionTabella[], currentRoute?: string): void {
    const list = Array.isArray(actions) ? actions : [];
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;

    list.forEach((action: any) => {
      if (!action || typeof action !== 'object') {
        return;
      }

      if (typeof action.action_callback__fn !== 'function') {
        action.action_callback__fn = action.action_callback
          ? (new AsyncFunction('datasource, metaInfo, record, event, wtoolbox', `
              return new Promise(async (resolve) => {
                try {
                  ${String(action.action_callback || '')}
                } catch (_err) {
                  wtoolbox.isBusy.next(false);
                  wtoolbox.errorHandler.handleError(_err);
                  resolve();
                }
              });`) as any)
          : (async () => { });
      }

      if (typeof action.disable_callback__fn !== 'function') {
        // FUNZIONA SOLO COME SINCRONA !!!!!!!!!!!!!!!!!!!!!!!!!!

        action.disable_callback__fn = action.disable_callback
          ? (new Function('datasource, metaInfo, record, wtoolbox', `
              // return new Promise(async (resolve) => {
                try {
                  ${String(action.disable_callback || '')}
                } catch (_err) {
                  wtoolbox.isBusy.next(false);
                  wtoolbox.errorHandler.handleError(_err);
                  return false;
                  // resolve(false);
                }
              //});`) as any)
          : (() => false);
      }

      const alreadyWrapped = !!(action as any).__workflowLinkedNavWrapped;
      const actionId = Number(action?.Id || action?.id || 0);
      const actionType = Number(action?.md_action_type);
      const isNavigation = actionType === 0;
      if (!alreadyWrapped && isNavigation && Number.isFinite(actionId) && actionId > 0) {
        const originalFn = action.action_callback__fn;
        const sourceRoute = String(currentRoute || this.route?.value || this.metaInfo?.tableMetadata?.md_route_name || '').trim();
        action.action_callback__fn = async (datasource: any, metaInfo: any, record: any, event: any, wtoolbox: any) => {
          this.workflowRuntimeMetadata.activateLinkedNavigationMetadata(sourceRoute, actionId);
          return await originalFn(datasource, metaInfo, record, event, wtoolbox);
        };
        (action as any).__workflowLinkedNavWrapped = true;
      }
    });
  }

  /**
* Restituisce il primo valore definito tra più chiavi candidate, con fallback case-insensitive.
* @param obj Oggetto su cui cercare i valori.
* @param keys Lista ordinata di chiavi candidate da testare.
* @returns Valore di tipo `any` restituito dal metodo.
*/
  private pickFirstDefined(obj: any, keys: string[]): any {
    if (!obj || !keys?.length) {
      return undefined;
    }

    const map = new Map<string, string>();
    Object.keys(obj).forEach((k) => map.set(String(k || '').toLowerCase(), k));

    for (const key of keys) {
      const direct = obj[key];
      if (direct !== undefined) {
        return direct;
      }

      const mapped = map.get(String(key || '').toLowerCase());
      if (mapped && obj[mapped] !== undefined) {
        return obj[mapped];
      }
    }

    return undefined;
  }

  /**
* Esegue deep clone JSON; in fallback normalizza prima eventuali wrapper osservabili.
* @param input Valore in ingresso elaborato dal metodo.
* @returns Valore di tipo `T` restituito dal metodo.
*/
  private cloneJson<T>(input: T): T {
    if (input === null || input === undefined) {
      return input;
    }
    try {
      return JSON.parse(JSON.stringify(input));
    } catch {
      return JSON.parse(JSON.stringify(this.getModelFromObservable(input)));
    }
  }

  /**
   * Ricostruisce `tableMetadata.extraProps` usando `tableMetadata.md_props_bag`
   * (fonte canonica persistita nei metadata).
   */
  private rehydrateTableExtraPropsFromPropsBag(): void {
    const tableMetadata: any = this.metaInfo?.tableMetadata;
    if (!tableMetadata || typeof tableMetadata !== 'object') {
      return;
    }

    let propsFromBag: any = {};
    const rawBag = tableMetadata.md_props_bag;
    try {
      if (typeof rawBag === 'string') {
        propsFromBag = JSON.parse(rawBag || '{}') || {};
      } else if (rawBag && typeof rawBag === 'object') {
        propsFromBag = rawBag;
        tableMetadata.md_props_bag = JSON.stringify(rawBag);
      }
    } catch {
      propsFromBag = {};
    }

    const current: any = tableMetadata.extraProps || {};
    const merged: any = Object.assign({}, propsFromBag, current);
    merged.archetypes = Object.assign({}, propsFromBag?.archetypes || {}, current?.archetypes || {});
    tableMetadata.extraProps = merged;
  }

  /**
* Verifica se la modalità client-side CRUD è abilitata in `tableMetadata.extraProps.client_side_crud`.
* @returns True se `tableMetadata.extraProps.client_side_crud` abilita il CRUD client-side.
*/
  public canUseClientSideCrud(): boolean {
    return !!this.metaInfo?.tableMetadata?.extraProps?.client_side_crud;
  }

  /**
* Attiva il CRUD client-side, inizializza lo stato dedicato e ricarica i dati.
*/
  public async enableClientSideCrud(): Promise<void> {
    if (!this.canUseClientSideCrud() || this.clientSideCrudActive) {
      return;
    }

    await this.dataSrv.enableClientSideCrud(this);
    this.clientSideCrudActive = true;
    this.lastClientSideCrudSyncResult = undefined;
    await this.fetchData();
  }

  /**
* Disattiva il CRUD client-side sincronizzando prima le modifiche locali e restituendo i conteggi insert/update/delete.
* @returns Riepilogo sincronizzazione con conteggi `inserted`, `updated`, `deleted`.
*/
  public async disableClientSideCrud(): Promise<{ inserted: number; updated: number; deleted: number }> {
    if (!this.clientSideCrudActive) {
      return { inserted: 0, updated: 0, deleted: 0 };
    }

    const syncResult = await this.dataSrv.disableClientSideCrud(this);
    this.clientSideCrudActive = false;
    this.lastClientSideCrudSyncResult = syncResult;
    await this.fetchData();

    return syncResult;
  }

  /**
* Disattiva il CRUD client-side senza sync e forza il refresh dati dal backend.
*/
  public async disableClientSideCrudWithoutSync(): Promise<void> {
    if (!this.clientSideCrudActive) {
      return;
    }

    await this.dataSrv.disableClientSideCrudWithoutSync(this);
    this.clientSideCrudActive = false;
    this.lastClientSideCrudSyncResult = undefined;
    await this.fetchData();
  }

  /**
* Carica schema metadati e stato runtime (tabs, validazioni, condizioni, filtri, nested routes) e opzionalmente carica i dati.
* @param schemaOnly Se true, inizializza solo schema/stato e pubblica `fetchInfo$` senza eseguire fetch dati.
*/
  public async getSchemaAndData(schemaOnly?: boolean) {

    this.loading.next(true);

    let metas = await this.getMetadata();
    if (!metas?.length || !metas[0] || !metas[0]._Metadati_Tabelle) {
      this.loading.next(false);
      throw new WuicClientException(
        WuicErrorCodes.MetadataRouteNotFound,
        { route: String(this.route?.value || '') },
        { surface: 'component', targetName: 'DataSourceComponent.getData' }
      );
    }

    if (!this.metaInfo?.frozen) {
      this.metaInfo = {
        tableMetadata: metas[0]._Metadati_Tabelle,
        columnMetadata: metas,
        editMode: false,
        dataTabs: [],
        schedulerInfo: Array.isArray((metas as any)?.schedulerInfo) ? (metas as any).schedulerInfo : [],
        operators: {},
        pKey: MetadataProviderService.getPKeys(metas)[0]
      };
    }
    else {
      this.metaInfo.schedulerInfo = Array.isArray((metas as any)?.schedulerInfo) ? (metas as any).schedulerInfo : [];
    }

    // Bug fix dashboard row expansion: quando il datasource e' istanziato dal
    // designer/bounded-repeater di una dashboard, `metaInfo` arriva via
    // `WtoolboxService.deepMerge(metaInfo, element.inputs['metaInfo'])` dal
    // boardcontent serializzato (designer.component.ts:6496) e `frozen` viene
    // settato a `true` (linea 6499). Il boardcontent serializza `columnMetadata`
    // e `tableMetadata` ma NON `pKey` (proprieta' derivata, prima colonna con
    // `mc_is_primary_key=true`): la deserializzazione lo lascia esplicitamente
    // `null`. Senza questo recupero il list-grid bind `[dataKey]="metaInfo.pKey?.mc_nome_colonna"`
    // a null → PrimeNG p-table.toggleRow throws "dataKey or groupRowsBy must be
    // defined to use row expansion" al click sull'expander button. Ricalcoliamo
    // pKey dai columnMetadata (che invece e' sempre serializzato), uniformando
    // il comportamento delle dashboard a quello delle route /list standard.
    if (this.metaInfo && !this.metaInfo.pKey && this.metaInfo.columnMetadata?.length) {
      this.metaInfo.pKey = MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)[0];
    }

    this.applyWorkflowRuntimeRouteMetadata(String(this.route?.value || ''));
    this.rehydrateTableExtraPropsFromPropsBag();

    this.loading.next(false);

    if (this.metaInfo.tableMetadata.md_pageable) {
      this.pageSize = this.metaInfo.tableMetadata.md_pagesize;
    } else {
      this.pageSize = 0;
    }

    // Metadata defaults must not override explicit grid state in querystring on full refresh.
    // Re-apply page/sort after metadata initialization so URL state wins.
    this.applyPageInfoFromQueryString();
    this.applySortInfoFromQueryString();

    if (this.metaInfo.tableMetadata.extraProps?.groupInfo) {
      this.groupInfo = this.metaInfo.tableMetadata.extraProps.groupInfo.map((group) => new GroupInfo(group.field));
    }

    if (this.metaInfo.tableMetadata.extraProps?.aggregates) {
      this.aggregationInfo = this.metaInfo.tableMetadata.extraProps.aggregates.map((agg) => new AggregationInfo(agg.field, agg.aggregate));
    }

    //changeTracking is enabled by default, unless explicitly set to false in metadata extraProps
    if (this.metaInfo.tableMetadata.extraProps?.changeTracking !== undefined && this.metaInfo.tableMetadata.extraProps?.changeTracking !== null) {
      this.changeTracking = this.metaInfo.tableMetadata.extraProps.changeTracking;
    } else {
      this.changeTracking = true;
    }

    this.resultInfo = new ResultInfo(this.getObservable());

    let obs = this.metaInfo.columnMetadata.map((col) => this.resultInfo.current[col.mc_nome_colonna] as BehaviorSubject<any>);

    this.actionStateSubscription?.unsubscribe();
    this.actionStateSubscription = combineLatest(obs.filter(x => x != null)).subscribe((values) => {
      this.metaInfo.tableMetadata._Metadati_Custom_Actions_Tabelles.forEach(async (action) => {
        if (typeof action?.disable_callback__fn !== 'function') {
          action._disabled = false;
          return;
        }
        try {
          action._disabled = await Promise.resolve(action.disable_callback__fn(this, this.metaInfo, this.resultInfo.current, WtoolboxService));
        } catch {
          action._disabled = false;
        }
      });
    });

    if (this.metaInfo.tableMetadata.md_page_size_choice) {
      const parsedChoices = String(this.metaInfo.tableMetadata.md_page_size_choice || '')
        .split(',')
        .map((x) => Number.parseInt(String(x || '').trim(), 10))
        .filter((x) => Number.isFinite(x) && x > 0);

      const normalizedChoices = Array.from(new Set(parsedChoices)).sort((a, b) => a - b);
      const configuredPageSize = Number(this.metaInfo.tableMetadata.md_pagesize || 0);

      if (Number.isFinite(configuredPageSize) && configuredPageSize > 0) {
        const maxChoice = normalizedChoices.length ? Math.max(...normalizedChoices) : 0;
        if (configuredPageSize > maxChoice) {
          normalizedChoices.push(Math.trunc(configuredPageSize));
          normalizedChoices.sort((a, b) => a - b);
        }
      }

      this.metaInfo.rowsPerPageOptions = normalizedChoices;
      this.metaInfo.tableMetadata.md_page_size_choice = normalizedChoices.join(',');
    }

    if (this.metaInfo.tableMetadata.md_ui_grid_conditional_template_condition) {
      // skills/typed-localized-exceptions: cached compiled fn invocata per ogni
      // row → wrap il call-site cosi' un throw runtime (es. record property
      // mancante) emette typed envelope invece di propagare uncaught.
      const compiledRowTplCond = new Function('metaInfo, record, wtoolbox', this.metaInfo.tableMetadata.md_ui_grid_conditional_template_condition);
      const route = this.metaInfo?.tableMetadata?.md_route_name;
      this.metaInfo.gridRowTemplateCondition = (metaInfo: any, record: any, wtoolbox: any) =>
        WtoolboxService.runUserCallbackSync(
          'md_ui_grid_conditional_template_condition',
          () => compiledRowTplCond(metaInfo, record, wtoolbox),
          [],
          { route },
          { fallback: false }
        );
    }

    this.metaInfo.hasFooter = this.metaInfo.columnMetadata.filter(x => x.mc_aggregation).length > 0;

    this.parseNestedRoutes();

    this.parseTabs();

    this.parseValidations();

    // this.parseConditions();

    if (this.parentRecord && this.parentMetaInfo && this.parentMetaInfo.nestedRoutes) {
      const currentRouteValue = String(this.route?.value || '');
      const currentRouteMetadata = currentRouteValue.includes('/')
        ? currentRouteValue.split('/')[0]
        : currentRouteValue;

      const nestedRoute = this.parentMetaInfo.nestedRoutes.find((x) => {
        const configuredRoute = String(x?.route || '');
        return configuredRoute === currentRouteValue || configuredRoute === currentRouteMetadata;
      });

      if (nestedRoute) {
        if (!this.filterInfo) {
          this.filterInfo = new FilterInfo('AND', []);
        }

        nestedRoute.fKeys.forEach((key, index) => {
          const parentField = String(nestedRoute.pKeys?.[index] || '');
          const parentValue = this.getConditionOperandValue(this.parentRecord, parentField);
          const match = this.filterInfo.filters.find((x) => x.field == key);

          if (!match) {
            this.filterInfo.filters.push({
              field: key,
              operatore: 'eq',
              value: parentValue,
              fixed: true,
              __nestedroute: true
            });
          } else {
            match.value = parentValue;
            match.operatore = 'eq';
            match.fixed = true;
            match.__nestedroute = true;
          }
        });
      }
    }

    this.filterDescriptor = {};
    this.metaInfo.columnMetadata.forEach((col) => {
      this.filterDescriptor[col.mc_nome_colonna] = new BehaviorSubject<any>(null);
      if (col.mc_ui_column_type == "lookupByID" || col.mc_ui_column_type == "multiple_check") {
        this.filterDescriptor[col.mc_nome_colonna + "__lookup_obj"] = new BehaviorSubject<any>(null);
      }
      this.metaInfo.operators[col.mc_nome_colonna] = this.getDefaultFilterOperatorForColumn(col);
    });

    this.applyFilterInfoToFilterDescriptor();
    this.applyRouteParamFilterFromSnapshot();
    this.clientSideCrudActive = await this.dataSrv.restoreClientSideCrudState(this);

    if (schemaOnly) {
      let payload = {
        resultInfo: this.resultInfo,
        metaInfo: this.metaInfo,
        filterDescriptor: this.filterDescriptor
      }

      this.publishFetchInfo(payload);

      return;
    }

    if (this.metaInfo && this.metaInfo.tableMetadata.md_auto_refresh_seconds) {
      this.interval = setInterval(() => {
        this.fetchData();
      }, this.metaInfo.tableMetadata.md_auto_refresh_seconds * 1000);
    }

    // Bug fix duplicate fetches on saved-state-restore: il consumer (list-grid)
    // segnala via `_suppressInitialFetchForSavedState` che ci sara' un
    // `applySelectedGridState` subito dopo che porra' la sua propria fetchData
    // con pageSize/sort/filter del saved state. Skippiamo qui la auto-fetch con
    // pageSize default per evitare 2 chiamate parallele a `getFlatRecordData`
    // (una con pageSize default, una con pageSize del saved state) che si
    // contendono il binding del list-grid. Pubblichiamo comunque `fetchInfo$`
    // con `dato=[]` cosi' la subscribe del list-grid (linea 885) puo' triggerare
    // `tryAutoApplyPreferredStateForCurrentRoute` (linea 966), che chiama
    // `applySelectedGridState` -> singola fetchData definitiva.
    if ((this as any)._suppressInitialFetchForSavedState === true) {
      (this as any)._suppressInitialFetchForSavedState = false;
      this.resultInfo.dato = [];
      this.resultInfo.totalRowCount = 0;
      this.resultInfo.totalGroups = 0;
      this.resultInfo.Agg = null;
      this.resultInfo.route = String(this.route?.value || '');
      this.publishFetchInfo({
        resultInfo: this.resultInfo,
        metaInfo: this.metaInfo,
        filterDescriptor: this.filterDescriptor,
        groupInfo: this.groupInfo,
        sortInfo: this.sortInfo,
        aggregationInfo: this.aggregationInfo
      });
      return;
    }

    await this.fetchData();
  }

  /**
* Compone i filtri effettivi da `filterDescriptor`/`filterInfo`, esegue il fetch e pubblica il payload aggiornato su `fetchInfo$`.
* @returns Payload pubblicato su `fetchInfo$` con `resultInfo`, `metaInfo`, filtri, sort, group e aggregation correnti.
*/
  public async fetchData() {
    const proceed = await this.confirmProceedWithPendingChanges('fetch');
    if (!proceed) {
      return {
        resultInfo: this.resultInfo,
        metaInfo: this.metaInfo,
        filterDescriptor: this.filterDescriptor,
        groupInfo: this.groupInfo,
        sortInfo: this.sortInfo,
        aggregationInfo: this.aggregationInfo
      };
    }

    this.beginLoading();
    try {
      const filterInfoWasNull = !this.filterInfo;
      if (!this.filterInfo) {
        this.filterInfo = new FilterInfo('AND', []);
      }

      // Se filterInfo e stato riassegnato dall'esterno (nuovo riferimento),
      // sincronizza i descriptor per evitare che valori UI stantii lo sovrascrivano.
      //
      // Eccezione: quando `filterInfo` e' stato appena creato vuoto in queste
      // stesse righe (era null), NON chiamare `applyFilterInfoToFilterDescriptor`
      // perche' resetterebbe TUTTI i descriptor a null. Questo rompe il primo
      // apply di un filter: l'utente digita un valore, il BehaviorSubject del
      // descriptor lo riceve, l'apply chiama fetchData, qui filterInfo e' null
      // perche' nessuno l'aveva ancora costruito -> viene creato vuoto -> ref
      // cambia -> applyFilterInfoToFilterDescriptor azzera i descriptor PRIMA
      // che il loop sotto possa leggerli e costruire filterInfo -> filterInfo
      // resta vuoto -> query backend senza $filter.
      //
      // Al secondo apply filterInfo esiste gia', ref e signature stabili, il
      // reconcile viene skippato normalmente e l'apply funziona. Classic
      // "primo apply a vuoto, secondo apply funziona" bug.
      //
      // Questo fix e' safe per il flusso autogenerato (Pattern 1/2): al primo
      // fetchData post-init, filterInfo e' null, viene creato vuoto, skippiamo
      // il reconcile (che comunque non avrebbe nulla da proiettare perche'
      // filterInfo.filters e' []) e il loop sotto popola filterInfo dai
      // descriptor (anch'essi vuoti all'init). Zero regressione.
      const currentFilterInfoSignature = this.buildFilterInfoSyncSignature(this.filterInfo);
      if (filterInfoWasNull) {
        this.lastProcessedFilterInfoRef = this.filterInfo;
        this.lastProcessedFilterInfoSignature = currentFilterInfoSignature;
      } else if (
        this.lastProcessedFilterInfoRef !== this.filterInfo ||
        this.lastProcessedFilterInfoSignature !== currentFilterInfoSignature
      ) {
        this.applyFilterInfoToFilterDescriptor();
        this.lastProcessedFilterInfoRef = this.filterInfo;
        this.lastProcessedFilterInfoSignature = currentFilterInfoSignature;
      }

      if (!Array.isArray((this.filterInfo as any).filters)) {
        (this.filterInfo as any).filters = [];
      }

      if (!this.metaInfo?.operators) {
        this.metaInfo.operators = {};
      }

      Object.keys(this.filterDescriptor).forEach((key) => {
        if (key.endsWith("__lookup_obj")) return;

        let col = this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == key);
        if (!col) return;

        if (this.filterDescriptor[key]) {
          let value = this.filterDescriptor[key].value;
          const currentOperator = String(this.metaInfo.operators[key] || '').toLowerCase();

          if (currentOperator === 'between') {
            const toRangePayload = (raw: any): { from: any, to: any } | null => {
              if (raw === null || raw === undefined || raw === '') {
                return null;
              }

              if (typeof raw === 'object') {
                const fromObj = raw?.from ?? null;
                const toObj = raw?.to ?? null;
                if (fromObj === null || fromObj === '' || toObj === null || toObj === '') {
                  return null;
                }
                return { from: fromObj, to: toObj };
              }

              const asString = String(raw).trim();
              if (!asString) {
                return null;
              }

              try {
                const parsed = JSON.parse(asString);
                const fromJson = parsed?.from ?? null;
                const toJson = parsed?.to ?? null;
                if (fromJson === null || fromJson === '' || toJson === null || toJson === '') {
                  return null;
                }
                return { from: fromJson, to: toJson };
              } catch {
                return null;
              }
            };

            const rangePayload = toRangePayload(value);
            value = rangePayload ? JSON.stringify(rangePayload) : null;
          }

          if (value && ((col.mc_ui_column_type == "lookupByID" && this.metaInfo.operators[key] == 'eqor') || col.mc_ui_column_type == "multiple_check")) {

            if (col.mc_ui_column_type == "multiple_check") {
              value = this.filterDescriptor[key + '__lookup_obj'].value;

              if (value) {
                if (!Array.isArray(value)) {
                  value = [value];
                }
                value = value
                  .map(x => x?.[col.mc_ui_grid_related_id_field] ?? x)
                  .filter(x => x !== null && x !== undefined && x !== '')
                  .join(',');
              }
            } else {
              if (!Array.isArray(value)) {
                value = [value];
              }
              value = value
                .map(x => x?.[col.mc_ui_lookup_dataValueField] ?? x)
                .filter(x => x !== null && x !== undefined && x !== '')
                .join(',');
            }
          }

          let match = this.filterInfo.filters.find(x => x.field == key);
          if (match) {
            if (value !== null && value !== undefined) {
              match.value = value;
              match.operatore = this.metaInfo.operators[key];
              match.__descriptorManaged = true;
            } else if (!match.__extra && !match.fixed && !!match.__descriptorManaged) {
              this.filterInfo.filters.splice(this.filterInfo.filters.indexOf(match), 1);
            }
          } else if (value !== null && value !== undefined) {
            this.filterInfo.filters.push({
              field: key,
              operatore: this.metaInfo.operators[key],
              value: value,
              __descriptorManaged: true
            });
          }
        }
      });

      // SHORT-CIRCUIT: hardcoded datasource (nessuna route reale).
      //
      // Pattern di uso: il componente host crea un <wuic-data-source> SENZA
      // [hardcodedRoute] / [route], imposta `metaInfo` a mano e popola
      // `fetchInfo$.next(...)` con i dati di un endpoint custom (es. una
      // REST 3rd-party o un Controller .NET non integrato col CRUD framework).
      // Vedi pattern "Framework component + Custom data" nella documentazione.
      //
      // Senza questo guard, ogni cambio di pagina/sort/filtro fatto dalla
      // <wuic-list-grid> chiamerebbe `dataSrv.select(this)` -> backend
      // `MetaService.getFlatRecordData` con `route: null` -> NullReferenceException
      // lato server (Metadati_methods.cs `route.Split('|')`). L'utente vede
      // semplicemente il pager bloccato + un 500 silenzioso in console.
      //
      // Niente da fare lato server: tutte le righe sono gia' in memoria.
      //
      // Strategia: NO-OP. La <wuic-list-grid> in modalita'
      // `md_server_side_operations: false` monta p-table con `[lazy]="false"`,
      // quindi p-table gestisce internamente sort/page/filter leggendo
      // `[sortField]`, `[sortOrder]`, `[first]`, `[rows]` (gia' aggiornati dal
      // list-grid handler PRIMA della chiamata a fetchData).
      //
      // NON ri-pubblichiamo nulla su `fetchInfo$`: una re-emissione
      // triggererebbe la subscription della list-grid che ri-renderizzerebbe
      // p-table con un nuovo `[value]`, p-table potrebbe re-emit `onSort`
      // con stato stale, il list-grid handler ri-chiamerebbe fetchData ->
      // loop infinito (la pagina si freeza).
      //
      // Prerequisito perche' p-table funzioni correttamente: il
      // `tableMetadata` deve avere `md_sortable: true` (default in
      // `new MetadatiTabella(name)`). Un object literal `{...} as any`
      // lascia md_sortable undefined -> isColumnSortable() ritorna false ->
      // p-table non riconosce le colonne come ordinabili. Sempre usare
      // `new MetadatiTabella(name)` per il tableMetadata custom.
      if (!this.route?.value) {
        return this.fetchInfo$?.value;
      }

      // Bug fix race-condition state-restore: anche con `this.route.value`
      // truthy, il `select()` invocato da `getData()` legge la route da
      // `scope.metaInfo.tableMetadata.md_route_name` (data-provider-meta.service
      // linea 192), che durante una transizione SPA puo' essere temporaneamente
      // vuota mentre `this.route` BehaviorSubject e' gia' aggiornato. Senza
      // questo guard parte un POST a `MetaService.getFlatRecordData` con
      // `route=""` → backend ritorna 50 record da una tabella "random" (la
      // prima di metadata) → la response, vincendo il timing dell'arrivo,
      // sovrascrive il binding del list-grid: i 50 <tr> renderizzano celle
      // vuote perche' i nomi colonna non corrispondono al record stale di
      // tabella diversa. Repro: SPA nav /people/list -> /cities/list con
      // saved state default (frozen + pageSize 50) → 3 fetchData paralleli
      // (uno con route="" pageSize=50, uno con route="cities" pageSize=10,
      // uno con route="cities" pageSize=50); il primo vince → celle vuote.
      if (!this.metaInfo?.tableMetadata?.md_route_name) {
        return this.fetchInfo$?.value;
      }

      await this.getData();

      if (this.metaInfo?.tableMetadata?.md_after_load_fn) {
        // No rethrow: data is already loaded; we just lost the post-process
        // step. Typed dialog appears, user sees the grid populated normally.
        await WtoolboxService.runUserCallback(
          'md_after_load',
          this.metaInfo.tableMetadata.md_after_load_fn,
          [this, null, this.resultInfo, this.resultInfo?.dato || [], false, WtoolboxService],
          {
            route: String(this.metaInfo?.tableMetadata?.md_route_name || ''),
            phase: 'after-load',
          },
          { targetName: 'DataSourceComponent.fetchData.afterLoad' }
        );
      }

      let payload = {
        resultInfo: this.resultInfo,
        metaInfo: this.metaInfo,
        filterDescriptor: this.filterDescriptor,
        groupInfo: this.groupInfo,
        sortInfo: this.sortInfo,
        aggregationInfo: this.aggregationInfo
      }

      this.publishFetchInfo(payload);

      return payload;
    } finally {
      this.endLoading();
    }
  }

  /**
   * Costruisce una firma stabile del contenuto utile di `filterInfo` per
   * rilevare modifiche ai filtri anche senza cambio di riferimento oggetto.
   */
  private buildFilterInfoSyncSignature(filterInfo?: FilterInfo): string {
    if (!filterInfo) {
      return '';
    }

    const normalizeGroup = (group: any): any => {
      const logic = String(group?.logic ?? group?.logicOperator ?? 'AND');
      const filters = Array.isArray(group?.filters) ? group.filters : [];

      const normalized = filters.map((f: any) => {
        const base: any = {
          field: String(f?.field ?? ''),
          operatore: String(f?.operatore ?? f?.operator ?? ''),
          value: f?.value ?? null,
          fixed: !!f?.fixed,
          __extra: !!f?.__extra,
          __querystring: !!f?.__querystring
        };

        if (f?.nestedFilters && Array.isArray(f.nestedFilters.filters)) {
          base.nestedFilters = normalizeGroup(f.nestedFilters);
        }

        return base;
      });

      return { logic, filters: normalized };
    };

    return JSON.stringify(normalizeGroup(filterInfo));
  }

  /**
* Costruisce `metaInfo.dataTabs` dalle colonne editabili e applica eventuale ordinamento tab da archetype.
*/
  parseTabs() {
    if (this.metaInfo && this.metaInfo.tableMetadata.md_tab_edit && !this.metaInfo.dataTabs?.length) {
      this.metaInfo.dataTabs = [];

      this.metaInfo.columnMetadata.forEach((col: MetadatiColonna) => {
        if (!col.mc_hide_in_edit) {
          let tab = col.mc_edit_associated_tab ? col.mc_edit_associated_tab : "non_associati_a_tab";
          let found = this.metaInfo.dataTabs.filter(x => x.tabName == tab);
          if (!found.length) {
            this.metaInfo.dataTabs.push({ tabName: tab, tabHeader: this.trnsl.instant(tab), selected: false, rendered: false, hidden: false });
          }
        }
      });

      let props = this.metaInfo.tableMetadata.extraProps || {};
      if (props?.["archetypes"]?.form?.orderedTabs?.length) {

        let tabsOrder = props["archetypes"].form.orderedTabs.map(function (item: any) { return item.toLowerCase(); });

        this.metaInfo.dataTabs.sort(function (a, b) {
          let aIndx = tabsOrder.indexOf(a.tabName.toLowerCase());
          let bIndx = tabsOrder.indexOf(b.tabName.toLowerCase());

          if (aIndx < 0) aIndx = 99999;
          if (bIndx < 0) bIndx = 99999;

          if (aIndx == -1 && bIndx == -1)
            return 0;
          else if (bIndx == -1)
            return -1;
          else
            return aIndx - bIndx;
        });
      }

      // Keep selection coherent with visual order:
      // first visible tab (index 0 in current order) is always selected.
      const visibleTabs = this.metaInfo.dataTabs.filter((tab: any) => !tab?.hidden);
      const selectedTab = visibleTabs.length ? visibleTabs[0] : null;
      this.metaInfo.dataTabs.forEach((tab: any) => {
        tab.selected = !!selectedTab && tab === selectedTab;
      });
    }
  }

  /**
   * Permette di nascondere/mostrare un tab specifico per indice, aggiornando lo stato `hidden` del tab target in `metaInfo.dataTabs`.
   **/
  toggleTabByIndex(index: number, hidden?: boolean) {
    if (this.metaInfo?.dataTabs && this.metaInfo.dataTabs[index]) {
      this.metaInfo.dataTabs[index].hidden = hidden || false;
    }
  }

  /**
  * Permette di nascondere/mostrare un tab specifico per nome, aggiornando lo stato `hidden` del tab target in `metaInfo.dataTabs`.
  **/
  toggleTabByName(tabName: string, hidden?: boolean) {
    if (this.metaInfo?.dataTabs) {
      const tab = this.metaInfo.dataTabs.find(x => x.tabName === tabName);
      if (tab) {
        tab.hidden = hidden || false;
      }
    }
  }

  /**
* Indica se esiste un tab visibile successivo rispetto al tab visibile correntemente selezionato.
*/
  get hasNextVisibleTab(): boolean {
    const visibleTabs = (this.metaInfo?.dataTabs || []).filter((tab: any) => !tab?.hidden);
    if (!visibleTabs.length) {
      return false;
    }

    const currentIndex = visibleTabs.findIndex((tab: any) => !!tab?.selected);
    return currentIndex >= 0 && currentIndex < (visibleTabs.length - 1);
  }

  /**
* Indica se esiste un tab visibile precedente rispetto al tab visibile correntemente selezionato.
*/
  get hasPreviousVisibleTab(): boolean {
    const visibleTabs = (this.metaInfo?.dataTabs || []).filter((tab: any) => !tab?.hidden);
    if (!visibleTabs.length) {
      return false;
    }

    const currentIndex = visibleTabs.findIndex((tab: any) => !!tab?.selected);
    return currentIndex > 0;
  }

  /**
   * Seleziona un tab specifico per nome o indice, con opzione di forzare la selezione anche se il tab è nascosto.
   * Blocca la selezione se nelle colonne del tab corrente sono presenti validazioni non superate, mostrando notifica di warning.
   * Restituisce `true` se la selezione è avvenuta con successo, `false` altrimenti (es. tab non trovato o tab nascosto quando `allowHidden` è `false`).
   * @param target Nome tab (`tabName`) oppure indice in `metaInfo.dataTabs` da selezionare.
   * @param allowHidden Se `true`, consente di selezionare un tab anche se è nascosto; se `false` (default), impedisce la selezione di tab nascosti.
   * @returns `true` se la selezione è avvenuta con successo, `false` altrimenti.
*/
  setSelectedTab(target: string | number, allowHidden: boolean = false, skipValidation: boolean = false): boolean {
    const tabs = this.metaInfo?.dataTabs;
    if (!Array.isArray(tabs) || !tabs.length) {
      return false;
    }

    let targetTab: any = null;
    if (typeof target === 'number') {
      targetTab = tabs[target] ?? null;
    } else {
      targetTab = tabs.find((tab: any) => String(tab?.tabName ?? '') === String(target)) ?? null;
    }

    if (!targetTab) {
      return false;
    }

    if (!allowHidden && !!targetTab.hidden) {
      return false;
    }

    if (!skipValidation) {
      const currentIndex = tabs.findIndex((tab: any) => !!tab?.selected);
      const tabCols = this.getColumnsMetadataByTab(currentIndex);
      const currentRecord = this.resultInfo?.current;
      if (tabCols.length && currentRecord) {
        tabCols.forEach((col: MetadatiColonna) => {
          const value = currentRecord?.[col.mc_nome_colonna]?.value;
          if (col.validationsRules && col.validationsRules.length) {
            col.validationsRules.forEach(async (vr: ValidationRule) => {
              await MetadatiColonna.validateField(value, vr, currentRecord, col);
            });
          }
        });

        const hasInvalid = tabCols.some((x) => (x.validationsRules || []).some((y) => !y.isValid));
        if (hasInvalid) {
          WtoolboxService.messageNotificationService.add({
            // PrimeNG canonical severity: 'warn' (NOT 'warning'). Senza la
            // classe modifier `p-toast-message-warn` Aura preset non applica
            // background/bordo → toast renderizzato trasparente in basso a
            // destra.
            severity: 'warn',
            summary: this.trnsl.instant('validation.errors.found'),
            detail: ''
          });
          return false;
        }
      }
    }

    tabs.forEach((tab: any) => {
      tab.selected = tab === targetTab;
    });

    this.fetchInfo$?.next?.({
      resultInfo: this.resultInfo,
      metaInfo: this.metaInfo,
      filterDescriptor: this.filterDescriptor,
      groupInfo: this.groupInfo,
      sortInfo: this.sortInfo,
      aggregationInfo: this.aggregationInfo
    } as any);

    return true;
  }

  /**
* Seleziona il prossimo tab visibile rispetto al corrente, se disponibile.
* Riusa `setSelectedTab` per garantire logica/side-effect uniformi.
*/
  selectNextVisibleTab(): boolean {
    const visibleTabs = (this.metaInfo?.dataTabs || []).filter((tab: any) => !tab?.hidden);
    if (!visibleTabs.length) {
      return false;
    }

    const currentIndex = visibleTabs.findIndex((tab: any) => !!tab?.selected);
    if (currentIndex < 0 || currentIndex >= (visibleTabs.length - 1)) {
      return false;
    }

    const nextTab = visibleTabs[currentIndex + 1];
    return this.setSelectedTab(String(nextTab?.tabName || ''));
  }

  /**
   * Seleziona il precedente tab visibile rispetto al corrente, se disponibile.
   * Riusa `setSelectedTab` per garantire logica/side-effect uniformi.
   */
  selectPreviousVisibleTab(): boolean {
    const visibleTabs = (this.metaInfo?.dataTabs || []).filter((tab: any) => !tab?.hidden);
    if (!visibleTabs.length) {
      return false;
    }
    const currentIndex = visibleTabs.findIndex((tab: any) => !!tab?.selected);
    if (currentIndex <= 0) {
      return false;
    }
    const previousTab = visibleTabs[currentIndex - 1];
    return this.setSelectedTab(String(previousTab?.tabName || ''), false, true);
  }

  /**
* Restituisce le colonne metadata associate al tab richiesto (per indice o nome),
* confrontando `mc_edit_associated_tab` con fallback al tab di default `non_associati_a_tab`.
* @param target Nome tab (`tabName`) oppure indice in `metaInfo.dataTabs`.
* @returns Collezione di `MetadatiColonna` appartenenti al tab richiesto.
*/
  getColumnsMetadataByTab(target: string | number): MetadatiColonna[] {
    const columns = Array.isArray(this.metaInfo?.columnMetadata) ? this.metaInfo.columnMetadata : [];
    if (!columns.length) {
      return [];
    }

    const tabs = Array.isArray(this.metaInfo?.dataTabs) ? this.metaInfo.dataTabs : [];
    const defaultTabName = 'non_associati_a_tab';

    let tabName = '';
    if (typeof target === 'number') {
      tabName = String(tabs[target]?.tabName || '').trim();
    } else {
      tabName = String(target || '').trim();
    }

    if (!tabName) {
      return [];
    }

    return columns.filter((col: any) => {
      const colTabName = String(col?.mc_edit_associated_tab || '').trim() || defaultTabName;
      return colTabName === tabName;
    });
  }

  /**
   * Valida tutte le colonne dei tab visibili (o di tutti i tab, se `strictLevel` è `allTabs`) e restituisce `true` se tutte le validazioni sono superate.
   * @param strictLevel Se 'visibleTabOnly' (default), valida solo le colonne dei tab visibili; se 'allTabs', valida tutte le colonne indipendentemente dalla visibilità dei tab.
   * @returns `true` se tutte le validazioni sono superate, altrimenti `false`.
*/
  canCompleteWizard(strictLevel: 'visibleTabOnly' | 'allTabs' = 'visibleTabOnly'): boolean {
    const columns = Array.isArray(this.metaInfo?.columnMetadata) ? this.metaInfo.columnMetadata : [];
    if (!columns.length) {
      return true;
    }
    const tabs = Array.isArray(this.metaInfo?.dataTabs) ? this.metaInfo.dataTabs : [];

    const relevantCols = columns.filter((col: any) => {
      if (strictLevel === 'visibleTabOnly') {
        const colTabName = String(col?.mc_edit_associated_tab || '').trim() || '';
        const tab = tabs.find((t: any) => String(t?.tabName || '').trim() === colTabName);
        return !tab?.hidden;
      }
      return true;
    });

    return !relevantCols.some((col: any) => {
      const value = this.resultInfo?.current?.[col.mc_nome_colonna]?.value;
      return (col.validationsRules || []).some((vr: ValidationRule) => {
        return vr.isValid === false;
      });
    });
  }

  /**
* Interpreta `md_nested_grid_routes` (JSON o formato legacy) e costruisce la struttura normalizzata delle route annidate.
*/
  parseNestedRoutes() {
    const rawValue = this.metaInfo?.tableMetadata?.md_nested_grid_routes;
    const raw = String(rawValue || '').trim();
    if (!raw) {
      this.metaInfo.nestedRoutes = [];
      return;
    }

    let routeEntries: string[] = [];
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          routeEntries = parsed
            .map((x: any) => typeof x === 'string' ? x : String(x || ''))
            .map((x: string) => x.trim())
            .filter((x: string) => !!x);
        }
      } catch {
        // Fall back to legacy comma-separated format below.
      }
    }

    if (!routeEntries.length) {
      routeEntries = raw.split(',').map(x => String(x || '').trim()).filter(x => !!x);
    }

    this.metaInfo.nestedRoutes = routeEntries
      .map((entry) => {
        const parts = entry.split('||').map(x => String(x || '').trim());
        if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
          return null;
        }

        return {
          route: parts[0],
          pKeys: parts[1].split(';').map(x => x.trim()).filter(x => !!x),
          fKeys: parts[2].split(';').map(x => x.trim()).filter(x => !!x),
          nestedTabCaption: parts.length > 3 && parts[3] ? parts[3] : parts[0],
          nestedGridCaption: parts.length > 4 && parts[4] ? parts[4] : parts[0],
          nestedGridContainerClass: parts.length > 5 && parts[5] ? parts[5] : undefined,
          action: parts.length > 6 && parts[6] ? parts[6] : 'list'
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }

  /**
* Genera le regole di validazione per colonna (`required`, `type`, `pattern`, `custom`) usando metadati e extras.
*/
  parseValidations() {
    this.metaInfo.columnMetadata.forEach((col: MetadatiColonna) => {
      col.validationsRules = [];

      if (col.mc_validation_has && col.mc_logic_editable) {
        if (col.mc_validation_required && col.mc_ui_column_type != "boolean" && col.mc_ui_column_type != "number_boolean") { //enforce boolean false value!!!
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "required",
            message: (col.mc_validation_message ? this.trnsl.instant(col.mc_validation_message) : 'mandatory_field') + ' - ' + col.mc_display_string_in_edit
          });
        }
        if (col.mc_validation_type) {
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "type",
            message: (col.mc_validation_type_message ? this.trnsl.instant(col.mc_validation_type_message) : "invalid_type") + ' - ' + col.mc_display_string_in_edit
          });
        }
        if (col.mc_validation_pattern) {
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "pattern",
            message: (col.mc_validation_pattern_message ? this.trnsl.instant(col.mc_validation_pattern_message) : "invalid_format") + ' - ' + col.mc_display_string_in_edit
          });
        }
        if (col.mc_validation_max_length) {
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "max_length",
            message: (col.mc_validation_max_length_message ? this.trnsl.instant(col.mc_validation_max_length_message) : "max_length") + ' - ' + col.mc_display_string_in_edit + + '(' + col.mc_validation_max_length.toString() + ')'
          });
        }
        if (col.mc_validation_min_length) {
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "min_length",
            message: (col.mc_validation_min_length_message ? this.trnsl.instant(col.mc_validation_min_length_message) : "max_length") + ' - ' + col.mc_display_string_in_edit + + '(' + col.mc_validation_min_length.toString() + ')'
          });
        }
        if (col.mc_validation_custom_callback__fn) {
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "custom",
            message: "",
            validationCallback: col.mc_validation_custom_callback__fn
          });
        }
      }

      if (col.extras) {
        let checkUniqueValue = col.extras.checkUniqueValue;
        if (checkUniqueValue) {
          col.mc_validation_has = true;
          // skills/typed-localized-exceptions: cached compiled fn → wrap il
          // call-site cosi' validate runtime emette typed envelope su throw.
          const compiledCheckUnique = new Function("value, wtoolbox", checkUniqueValue);
          const colName = col.mc_nome_colonna;
          const route = this.metaInfo?.tableMetadata?.md_route_name;
          col.validationsRules.push({
            isValid: true,
            column: col,
            field: col.mc_nome_colonna,
            type: "custom",
            message: "",
            validationCallback: (value: any, wtoolbox: any) => WtoolboxService.runUserCallbackSync(
              'mc_props_bag.checkUniqueValue',
              () => compiledCheckUnique(value, wtoolbox),
              [],
              { column: colName, route },
              { fallback: true }
            )
          });
        }
      }

      let customValidations = col.validationsRules
        .filter(function (vr) { return vr.type == "custom" })
        .map(function (vr) {
          return {
            column: vr.column,
            field: vr.column.mc_nome_colonna,
            validating: false
          }
        });

      // if (customValidations) {
      //   angular.forEach(customValidations, function (cv) {
      //     col.formCtrl.validationInProgress.push(cv);
      //   });
      // }
    });
  }

  /**
* Esegue le validazioni delle colonne sul record corrente invocando `MetadatiColonna.validateField`.
* @param record Record osservabile da validare.
*/
  async validateData(record: { [key: string]: BehaviorSubject<any> }): Promise<void> {
    const validations: Promise<any>[] = [];

    (this.metaInfo?.columnMetadata || []).forEach((col: MetadatiColonna) => {
      const fieldObs = record?.[col.mc_nome_colonna];
      const value = fieldObs?.value;

      if (col.validationsRules && col.validationsRules.length) {
        col.validationsRules.forEach((vr: ValidationRule) => {
          validations.push(Promise.resolve(MetadatiColonna.validateField(value, vr, record, col)));
        });
      }
    });

    if (validations.length) {
      await Promise.all(validations);
    }

  }

  /**
* Raggruppa una collezione per chiave e restituisce una mappa `key -> array elementi`.
* @param xs Collezione da raggruppare.
* @param key Nome proprietà usata come chiave di grouping.
* @returns Mappa `chiave -> elenco elementi` risultante dal raggruppamento.
*/
  groupBy(xs: any[], key: string) {
    return xs.reduce(function (rv, x) {
      (rv[x[key]] = rv[x[key]] || []).push(x);
      return rv;
    }, {});
  };

  /**
* Determina se un valore è un campo osservabile compatibile (`next` + `value`).
* @param value Valore da verificare come campo osservabile.
* @returns True se il valore espone contratto osservabile (`next` + `value`).
*/
  private isObservableField(value: any): boolean {
    return !!value && typeof value === 'object' && typeof value.next === 'function' && 'value' in value;
  }

  /**
* Legge il valore di un operando condizione gestendo sia campi plain sia campi osservabili.
* @param record Record corrente.
* @param fieldName Nome campo operando da leggere.
* @returns Valore dell'operando condizione già normalizzato (plain o subject.value).
*/
  private getConditionOperandValue(record: any, fieldName: string): any {
    const raw = record?.[fieldName];
    if (this.isObservableField(raw)) {
      return raw.value;
    }
    return raw;
  }

  /**
* Scrive il valore di un operando condizione su campo osservabile (next) o campo plain.
* @param record Record corrente.
* @param fieldName Nome campo operando da aggiornare.
* @param value Nuovo valore da assegnare.
*/
  private setConditionOperandValue(record: any, fieldName: string, value: any): void {
    const raw = record?.[fieldName];
    if (this.isObservableField(raw)) {
      raw.next(value);
      return;
    }

    if (record) {
      record[fieldName] = value;
    }
  }

  /**
* Normalizza operatori confronto/formula in un set canonico (`eq`, `ne`, `gt`, `ge`, `lt`, `le`, `contains`).
* @param rawOperator Operatore raw da normalizzare.
* @returns Operatore normalizzato nel set supportato dal valutatore condizioni.
*/
  private normalizeConditionOperator(rawOperator: string): string {
    const op = String(rawOperator || '').trim().toLowerCase();

    if (op === '=' || op === '==' || op === '===' || op === 'eq') return 'eq';
    if (op === '!=' || op === '!==' || op === '<>' || op === 'neq' || op === 'ne') return 'ne';
    if (op === '>' || op === 'gt') return 'gt';
    if (op === '>=' || op === 'gte' || op === 'ge') return 'ge';
    if (op === '<' || op === 'lt') return 'lt';
    if (op === '<=' || op === 'lte' || op === 'le') return 'le';
    if (op === 'contains') return 'contains';

    // Safe default: never allow assignment semantics.
    return 'eq';
  }

  /**
* Rileva se il datasource sta girando in contesto designer/workflow-designer.
* In questo contesto la logica condizioni runtime deve rimanere disabilitata.
*/
  private isDesignerLikeContext(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const hash = String(window?.location?.hash || '').toLowerCase();
    return hash === '#/designer'
      || hash.includes('/designer?')
      || hash.includes('/designer/')
      || hash === '#/workflow-designer'
      || hash.includes('/workflow-designer?')
      || hash.includes('/workflow-designer/');
  }

  /**
* Configura listener e trigger dei gruppi condizione (`_Metadati_Condition_Groups`) sottoscrivendo i campi necessari.
*/
  public parseConditions() {
    this.clearConditionSubscriptions();
    if (this.isDesignerLikeContext()) {
      return;
    }

    let listeners: { id: string, fields: string[] }[] = [];
    let listenAll = false;

    if (this.metaInfo.tableMetadata._Metadati_Condition_Groups && this.metaInfo.tableMetadata._Metadati_Condition_Groups.length) {

      let groupedConditions: { [CG_Id: number]: { ConditionItems: MetadatiConditionGroup[], ConditionActions: MetadatiConditionGroupAction[] } } = this.groupBy(this.metaInfo.tableMetadata._Metadati_Condition_Groups, 'CG_Id');

      let conds = {};
      Object.keys(groupedConditions).forEach((key) => {
        const groupedRows = Array.isArray(groupedConditions[key]) ? groupedConditions[key] : [];
        const firstActions =
          groupedRows
            .map((row: any) => row?.ConditionActions)
            .find((actions: any) => Array.isArray(actions))
          || [];
        conds[key] = { ConditionItems: groupedRows, ConditionActions: firstActions };
      });

      Object.keys(conds).forEach((key) => {
        let conditionGroup: { ConditionItems: MetadatiConditionGroup[], ConditionActions: MetadatiConditionGroupAction[] } = conds[key];

        if (conditionGroup.ConditionItems) {
          if (conditionGroup.ConditionItems.find(x => x.CI_Enabled && x.CI_Evaluation_Trigger == 0)) {
            listenAll = true;
          } else {
            if (listenAll === false) {
              for (let condition of conditionGroup.ConditionItems.filter(x => x.CI_Enabled)) {
                if (condition.CI_Evaluation_Trigger == 1 && condition.CI_Comparison_Left_Field) {

                  if (listeners.find(x => x.id.indexOf(key) >= 0) == null) {
                    listeners.push({ id: key, fields: [condition.CI_Comparison_Left_Field] });
                  }

                  if (listeners.find(x => x.id == key && x.fields.indexOf(condition.CI_Comparison_Left_Field) >= 0) == null) {
                    let match = listeners.find(x => x.id == key);
                    if (match) {
                      match.fields.push(condition.CI_Comparison_Left_Field);
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (listenAll) {
        // this.metaInfo.columnMetadata.forEach(f => {
        // f.editor.subscribe(editor => {
        //   if (editor) {
        //     // editor.valueChange.subscribe(payload => {
        //     //   debugger;
        //     //   // this.evaluateConditions(action, formStep, false, val);
        //     // });
        //   }
        // });

        Object.keys(this.resultInfo.current).forEach(key => {
          const sub = this.resultInfo.current[key].subscribe(payload => {
            let metaField = this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == key);
            this.evaluateConditions(conds, {
              field: metaField,
              // editor: metaField.editor.value,
              newValue: payload,
              // newLookupValue?: any;
              oldValue: metaField.editor?.value?.valore,
              // oldLookupValue?: any;
              record: metaField.editor?.value?.record || this.resultInfo.current
            }, false);
          });
          this.conditionSubscriptions.push(sub);
        });

        // });
      } else {
        listeners.forEach(listener => {
          listener.fields.forEach(field => {
            const sub = this.resultInfo.current[field].subscribe(payload => {
              // if (payload) {
              let metaField = this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == field);
              this.evaluateConditions(conds, {
                field: metaField,
                // editor: metaField.editor.value,
                newValue: payload,
                // newLookupValue?: any;
                oldValue: metaField.editor?.value?.valore,
                // oldLookupValue?: any;
                record: metaField.editor?.value?.record || this.resultInfo.current
              }, false);
              // }
            });
            this.conditionSubscriptions.push(sub);
          });
        });
      }
    }
  }

  /**
* Valuta ogni gruppo condizioni sul payload corrente (left/right/operator/formula) e invoca `executeConditionalActions` con l'esito.
* @param groupedConditions Mappa gruppi condizione con relative condition items e action items.
* @param payload Payload variazione campo (nuovo/vecchio valore + metadato campo trigger).
* @param all Se true valuta tutti i gruppi; se false solo quelli collegati al campo trigger.
*/
  evaluateConditions(groupedConditions: { [CG_Id: number]: { ConditionItems: MetadatiConditionGroup[], ConditionActions: MetadatiConditionGroupAction[] } }, payload: ValueChangedPayload, all: boolean) {
    if (this.isDesignerLikeContext()) {
      return;
    }

    Object.keys(groupedConditions).forEach((key) => {
      let conditionGroup: { ConditionItems: MetadatiConditionGroup[], ConditionActions: MetadatiConditionGroupAction[] } = groupedConditions[key];

      if (all == false && !conditionGroup.ConditionItems.find(x => x.CI_Comparison_Left_Field == payload.field.mc_nome_colonna)) {
        return;
      }

      let evaluationResult = null;

      if (conditionGroup.ConditionItems) {
        for (let condition of conditionGroup.ConditionItems.filter(x => x.CI_Enabled && (all || x.CI_Comparison_Left_Field == payload.field.mc_nome_colonna))) {
          if (!all && payload.field) {

            if (condition.CI_Comparison_Operator) {
              let leftField = this.metaInfo.columnMetadata.find(c => c.mc_nome_colonna == condition.CI_Comparison_Left_Field); // payload.field;
              const leftValue = this.getConditionOperandValue(this.resultInfo.current, condition.CI_Comparison_Left_Field);
              // skills/typed-localized-exceptions: condition's rightField viene evaluato come
              // espressione JS — wrap per evitare uncaught syntax/reference error
              const rightValue = WtoolboxService.runUserCallbackSync(
                'CI_Comparison_Right_Field',
                () => new Function(`return ${this.getCodeRepresentation(leftField, condition.CI_Comparison_Right_Field)};`)(),
                [],
                { route: this.metaInfo?.tableMetadata?.md_route_name, conditionField: condition.CI_Comparison_Left_Field }
              );
              const op = this.normalizeConditionOperator(condition.CI_Comparison_Operator);

              switch (op) {
                case 'eq':
                  evaluationResult = leftValue == rightValue;
                  break;
                case 'ne':
                  evaluationResult = leftValue != rightValue;
                  break;
                case 'gt':
                  evaluationResult = leftValue > rightValue;
                  break;
                case 'ge':
                  evaluationResult = leftValue >= rightValue;
                  break;
                case 'lt':
                  evaluationResult = leftValue < rightValue;
                  break;
                case 'le':
                  evaluationResult = leftValue <= rightValue;
                  break;
                case 'contains':
                  evaluationResult = String(leftValue ?? '').toLowerCase().includes(String(rightValue ?? '').toLowerCase());
                  break;
                default:
                  evaluationResult = leftValue == rightValue;
                  break;
              }
            } else if (condition.CI_Formula) {
              evaluationResult = WtoolboxService.runUserCallbackSync(
                'CI_Formula',
                () => new Function("field, fieldNewValue, fieldOldValue, record, datasource, wtoolbox", `
                  // debugger;
                  ${condition.CI_Formula};
                `)(payload.field, payload.newValue, payload.oldValue, payload.record || this.resultInfo.current, this, WtoolboxService),
                [],
                { route: this.metaInfo?.tableMetadata?.md_route_name, conditionField: payload.field?.mc_nome_colonna }
              );
            } else {
              // cascade
            }
          } else if (all) {
            // ...
            debugger;
          }

          if (evaluationResult == false) {
            break;
          }

        }

        this.executeConditionalActions(payload, conditionGroup, evaluationResult);
      }

    });
  }

  /**
* Converte un valore in rappresentazione codice coerente con `mc_ui_column_type` per formule/actions dinamiche.
* @param field Metadato colonna usato per scegliere la serializzazione del valore.
* @param value Valore da convertire in rappresentazione codice.
* @returns Rappresentazione stringa/espressione usata per comporre formule e action code dinamico.
*/
  public getCodeRepresentation(field: MetadatiColonna, value: any) {
    if (value === undefined || value === null || value === "null") {
      return "null";
    }
    switch (field.mc_ui_column_type) {
      case "text":
      case "textarea":
        return `"${value}"`;
      case "number":
        return `${value}`;
      case "boolean":
        return `${value}`;
      case "date":
        return `new Date("${value}")`;
      default:
        return `"${value}"`;
    }
  }

  /**
* Esegue le azioni condizionali abilitate (`CAI_Target_Action`) modificando metadati/valori record o attivando la logica cascade.
* @param payload ValueChangedPayload.
* @param conditionGroup Gruppo condizioni e azioni da eseguire.
* @param evaluationResult Esito valutazione del gruppo.
* @param record Record corrente su cui applicare le azioni.
*/
  private executeConditionalActions(payload: ValueChangedPayload, conditionGroup: { ConditionItems: MetadatiConditionGroup[], ConditionActions: MetadatiConditionGroupAction[] }, evaluationResult: boolean) {
    if (this.isDesignerLikeContext()) {
      return;
    }

    const field = payload.field;
    const newValueObj = payload.newValue;
    const oldValueObj = payload.oldValue;

    const conditionActions = Array.isArray(conditionGroup?.ConditionActions) ? conditionGroup.ConditionActions : [];
    conditionActions.filter(x => x.CAI_Enabled).forEach(conditionalActionItem => {
      if (evaluationResult !== (conditionalActionItem.CAG_Execute_If_False || false)) {
        // conditionalActionGroup.forEach(conditionalActionItem => {

        let actionCode = "";

        if (conditionalActionItem.CAI_Formula) {
          actionCode = conditionalActionItem.CAI_Formula;
        } else {

          switch (conditionalActionItem.CAI_Target_Action) {
            case '0': // show / hide field
              actionCode = `targetField.mc_hide_in_edit = ${conditionalActionItem.CAI_Target_Action_Param_Value};`;
              break;
            case '1': // set label
              actionCode = `targetField.mc_display_string_in_edit = "${conditionalActionItem.CAI_Target_Action_Param_Value}";`;
              break;
            case '2': // set value
              actionCode = `if (record["${conditionalActionItem.CAI_Target_Field}"] && typeof record["${conditionalActionItem.CAI_Target_Field}"].next === "function") {
                  record["${conditionalActionItem.CAI_Target_Field}"].next(${this.getCodeRepresentation(this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == conditionalActionItem.CAI_Target_Field), conditionalActionItem.CAI_Target_Action_Param_Value)});
                } else {
                  record["${conditionalActionItem.CAI_Target_Field}"] = ${this.getCodeRepresentation(this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == conditionalActionItem.CAI_Target_Field), conditionalActionItem.CAI_Target_Action_Param_Value)};
                }`;
              break;
            case '3': // set validation required
              if (conditionalActionItem.CAI_Target_Action_Param_Value == "true") {
                actionCode = `targetField.mc_validation_required = true;`;
              } else {
                actionCode = `targetField.mc_validation_required = false;`;
              }
              break;
            case '4': //Cascade
              let parentField = field;
              let parentEditor: IFieldEditor = field.editor.value;
              let parentDs = parentEditor?.nestedSource;

              let childField = this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == conditionalActionItem.CAI_Target_Field);
              let childEditor: IFieldEditor = childField.editor.value;

              let parentValue = this.getConditionOperandValue(payload.record, parentField.mc_nome_colonna);
              childField.extras.form = Object.assign(childField.extras.form || {}, { disabled: parentValue == null });

              if (childEditor) {
                let oldValue = this.getConditionOperandValue(payload.record, childField.mc_nome_colonna);
                let oldValueObj = this.getConditionOperandValue(payload.record, childField.mc_nome_colonna + '__lookup_obj');

                if (oldValue != null) {
                  this.setConditionOperandValue(payload.record, childField.mc_nome_colonna, null);
                  this.setConditionOperandValue(payload.record, childField.mc_nome_colonna + '__lookup_obj', null);
                }

                childEditor.valore = null;
                childEditor.lookupValue = null;
              }

              let nestedRoutes = parentDs?.metaInfo?.nestedRoutes;
              if (childEditor) {
                let childDs = childEditor.nestedSource;

                let mappings = childDs?.metaInfo?.tableMetadata?.extraProps?.endpoint?.parameterMapping;

                if (!mappings) {
                  mappings = (conditionalActionItem.CAI_Target_Action_Param_Value ? JSON.parse(conditionalActionItem.CAI_Target_Action_Param_Value) : null);
                }

                if (mappings) {

                  childDs.filterInfo = new FilterInfo('AND', []);

                  mappings.forEach(mapping => {
                    let parentValue_obj = this.getConditionOperandValue(payload.record, (mapping.source.path ? mapping.source.path : parentField.mc_nome_colonna) + '__lookup_obj');

                    if (parentValue_obj && childField) {
                      childDs.filterInfo.filters.push({
                        field: mapping.target.name,
                        operatore: '=',
                        value: parentValue_obj[mapping.source.name]
                      });
                    }
                  });

                  childDs.fetchData();

                  return;
                } else {
                  throw new Error("missing childDs?.metaInfo?.tableMetadata?.extraProps?.endpoint?.parameterMapping for cascade action");
                }
              } else if (nestedRoutes) {
                //use nested route
                throw new Error("parentDs?.metaInfo?.nestedRoutes is not supported yet in conditional actions");
              }

              break;
            case '5':
              actionCode = `datasource.toggleTabByIndex(${conditionalActionItem.CAI_Target_Action_Param_Value});`;

              break;
          }
        }

        // skills/typed-localized-exceptions: actionCode e' eval-from-metadata
        // (CAI_Target_Action_Param_Value); wrap per evitare uncaught propagation.
        WtoolboxService.runUserCallbackSync(
          'CAI_actionCode',
          () => new Function("field, targetField, record, fieldNewValue, fieldOldValue, evaluationResult, datasource, wtoolbox", `
                  // debugger;
                  ${actionCode}
                `)(field, this.metaInfo.columnMetadata.find(x => x.mc_nome_colonna == conditionalActionItem.CAI_Target_Field), payload.record || this.resultInfo.current, newValueObj, oldValueObj, evaluationResult, this, WtoolboxService),
          [],
          { route: this.metaInfo?.tableMetadata?.md_route_name, targetField: conditionalActionItem?.CAI_Target_Field }
        );

      }
    });
  }

  unwrapFieldValue(field: any) {
    if (field === null || field === undefined) {
      return field;
    }

    // Supports both BehaviorSubject-backed fields and plain values.
    if (typeof field === 'object' && 'value' in field) {
      return field.value;
    }

    return field;
  };

  resolveServerRecordId(payload: any, primaryKeyField: any): any {
    if (!payload || !primaryKeyField) {
      return '';
    }

    const hasValue = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';

    const direct = payload?.[primaryKeyField];
    if (hasValue(direct)) {
      return direct;
    }

    const entityFromServer = payload?.__entity;
    const fromEntity = entityFromServer?.[primaryKeyField];
    if (hasValue(fromEntity)) {
      return fromEntity;
    }

    const result = payload?.result;
    if (result && typeof result === 'object') {
      const fromResult = result?.[primaryKeyField] ?? result?.mc_id ?? result?.id;
      if (hasValue(fromResult)) {
        return fromResult;
      }
    } else if (hasValue(result)) {
      return result;
    }

    return '';
  };


  /**
* Sincronizza insert/update/delete/clone del record corrente: valida, invoca callback before/after save, aggiorna notifiche e tracker locale.
* @param entita Entità corrente da sincronizzare.
* @param original Snapshot originale usato per update/comparison.
* @param deleting Se true esegue il flusso delete.
* @param cloning Se true esegue il flusso clone.
* @returns Risultato della sync (insert/update/delete/clone) o null se validazione/callback blocca l'operazione.
*/
  async syncData(entita: any, original: any, deleting?: boolean, cloning?: boolean): Promise<UpdateInfo> {

    const primaryKeyField = MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)?.[0]?.mc_nome_colonna || '';

    let entity: any = { __new: this.unwrapFieldValue(entita?.__new), __guid: this.unwrapFieldValue(entita?.__guid) };
    let pristine = original;
    const syncOperation: DataSourceSyncOperation = deleting
      ? 'delete'
      : (entity.__new ? 'insert' : (cloning ? 'clone' : 'update'));

    let synchedData: UpdateInfo;

    return new Promise<UpdateInfo>(async (resolve, reject) => {
      const beforeSyncEvent = this.emitBeforeSync(syncOperation, entita, original);
      if (beforeSyncEvent.cancel) {
        resolve(null);
        return;
      }

      const canSync = await this.canProceedBeforeSync(entita);
      if (!canSync) {
        resolve(null);
        return;
      }

      if (deleting) {
        synchedData = await this.dataSrv.delete(entita, this);
        await this.executeAfterSyncCallback(entita, synchedData, false, false, true);
        const serverRecordId = this.resolveServerRecordId(synchedData, primaryKeyField);

        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: this.trnsl.instant('deleted'), detail: this.trnsl.format(this.trnsl.instant('deleted_route_{0}_id_{1}'), this.metaInfo.tableMetadata.md_long_description, serverRecordId) });

        this.notifyMenuMetadataChanged();
        this.removeTrackedChangesForEntity(entita, entita);
        this.publishLocalStateUpdate();
        this.emitAfterSync(syncOperation, entita, original, synchedData);

        resolve(synchedData);
      } else {

        this.metaInfo.columnMetadata.forEach((col) => {
          entity[col.mc_nome_colonna] = this.normalizeFieldValueForSync(
            col.mc_nome_colonna,
            entita[col.mc_nome_colonna].value
          );

          if (col.mc_ui_column_type == "multiple_check" && entita[col.mc_nome_colonna].value) {
            entity[col.mc_nome_colonna] = entita[col.mc_nome_colonna + '__lookup_obj'].value;
          }
        });

        await this.validateData(this.resultInfo.current);
        if (!this.metaInfo.columnMetadata.filter(x => x.validationsRules?.filter(y => !y.isValid).length).length) {

          if (entity.__new) {
            synchedData = await this.dataSrv.insert(entity, this);
            await this.executeAfterSyncCallback(entita, synchedData, true, false, false);
            const serverRecordId = this.resolveServerRecordId(synchedData, primaryKeyField);

            WtoolboxService.messageNotificationService.add({ severity: 'info', summary: this.trnsl.instant('inserted'), detail: this.trnsl.format(this.trnsl.instant('inserted_route_{0}_id_{1}'), this.metaInfo.tableMetadata.md_long_description, serverRecordId) });

          } else if (cloning) {

            synchedData = await this.dataSrv.clone(entity, this, this.metaInfo.tableMetadata.extraProps.cloneDefinition?.relatedRoutes || []);
            await this.executeAfterSyncCallback(entita, synchedData, false, true, false);
            const serverRecordId = this.resolveServerRecordId(synchedData, primaryKeyField);

            WtoolboxService.messageNotificationService.add({ severity: 'info', summary: this.trnsl.instant('cloned'), detail: this.trnsl.format(this.trnsl.instant('cloned_route_{0}_id_{1}'), this.metaInfo.tableMetadata.md_long_description, serverRecordId) });
          } else {

            let payloadToSync = entity;
            const pkeyName = MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)?.[0]?.mc_nome_colonna || '';
            let sanitized: ChangeT[] = [];
            if (this.changeTracking && this.changes.length) {
              const tracked = this.changes.find(x => x.pkey == entity[pkeyName])?.changes;
              sanitized = this.sanitizeChangesForSync(tracked);
            }

            if (!sanitized.length) {
              // Fallback: derive delta from entity vs pristine (covers flows like Kanban DnD where tracker may miss).
              sanitized = this.buildFallbackChangesForSync(entity, pristine);
            }

            if (sanitized.length) {
              const changedFieldSet = new Set<string>(
                sanitized
                  .map((c: any) => String(c?.field || '').trim())
                  .filter((f: string) => !!f)
              );

              const deltaEntity: any = {
                __new: entity.__new,
                __guid: entity.__guid,
                __changes: sanitized
              };

              if (pkeyName) {
                deltaEntity[pkeyName] = entity[pkeyName];
              }

              this.metaInfo.columnMetadata.forEach((col) => {
                const fieldName = col?.mc_nome_colonna;
                if (!fieldName || !changedFieldSet.has(fieldName)) {
                  return;
                }

                if (col.mc_ui_column_type == 'multiple_check' && entita[fieldName]?.value) {
                  deltaEntity[fieldName] = entita[fieldName + '__lookup_obj']?.value ?? [];
                } else {
                  const currentValue = entita[fieldName]?.value;
                  deltaEntity[fieldName] = this.normalizeFieldValueForSync(fieldName, currentValue);
                }
              });

              deltaEntity.__original = this.userInfo?.getStoredUserInfo().optimisticCheckEnabled ? pristine : null;
              payloadToSync = deltaEntity;
            }

            synchedData = await this.dataSrv.update(payloadToSync, pristine, this);
            await this.executeAfterSyncCallback(entita, synchedData, false, false, false);
            const serverRecordId = this.resolveServerRecordId(synchedData, primaryKeyField);

            WtoolboxService.messageNotificationService.add({ severity: 'info', summary: this.trnsl.instant('updated'), detail: this.trnsl.format(this.trnsl.instant('updated_route_{0}_id_{1}'), this.metaInfo.tableMetadata.md_long_description, serverRecordId) });
          }

          this.notifyMenuMetadataChanged();
          this.removeTrackedChangesForEntity(entity, entita);
          this.refreshPristineFromCurrent();
          this.publishLocalStateUpdate();
          this.emitAfterSync(syncOperation, entita, original, synchedData);

          resolve(synchedData);
        } else {
          this.metaInfo.columnMetadata.forEach((col: MetadatiColonna) => {
            col.validationsRules.forEach((validationResult) => {
              if (!validationResult.isValid) {
                WtoolboxService.messageNotificationService.add({ severity: 'error', summary: this.trnsl.instant('validation_error'), detail: validationResult.message });
              }
            });
          });

          resolve(null);
        }
      }
    });
  }

  /**
  * Sincronizza insert/update/delete/clone di un set di records: valida, invoca callback before/after save, aggiorna notifiche e tracker locale.
* @param entita Entità da sincronizzare.
* @returns Risultato della sync (insert/update/delete/clone) o null se validazione/callback blocca l'operazione.
*/
  async syncDataBatch(entitiesObj: any[], originals: any[]): Promise<any> {

    const entities = [];
    const syncOperation: DataSourceSyncOperation = 'batch';

    entitiesObj.forEach(e => {
      entities.push(DataSourceComponent.getObservable(e, this.metaInfo));
    });

    const primaryKeyField = MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)?.[0]?.mc_nome_colonna || '';

    // var entity: any = { __new: this.unwrapFieldValue(entita?.__new), __guid: this.unwrapFieldValue(entita?.__guid) };
    // var pristine = original;

    let synchedData: any[];

    return new Promise<any>(async (resolve, reject) => {
      const beforeSyncEvent = this.emitBeforeSync(syncOperation, entities, originals);
      if (beforeSyncEvent.cancel) {
        resolve(null);
        return;
      }

      const canSync = await this.canProceedBeforeSync(entities);
      if (!canSync) {
        resolve(null);
        return;
      }

      // Determina quali entity sono delete (`_destroy: true`): per loro skippiamo
      // sia `validateData` (richiede i field non presenti nel payload minimal)
      // sia il check globale di validità sulle colonne (che potrebbe essere
      // sporco da validation precedenti su altre entity). NOTA: il check va
      // fatto su `entitiesObj` (raw) perché `getObservable` non preserva i
      // campi non in columnMetadata (come `_destroy`).
      const isDeleteEntity = (e: any): boolean => {
        const v = e?._destroy;
        return v === true || (v && typeof v === 'object' && (v as any).value === true);
      };
      const onlyDeletes = entitiesObj.every(isDeleteEntity);
      const deleteFlags = entitiesObj.map(isDeleteEntity);

      entities.forEach(async (entity, idx) => {
        this.metaInfo.columnMetadata.forEach((col) => {
          // entity[col.mc_nome_colonna] = this.normalizeFieldValueForSync(
          //   col.mc_nome_colonna,
          //   entity[col.mc_nome_colonna].value
          // );

          // if (col.mc_ui_column_type == "multiple_check" && entity[col.mc_nome_colonna].value) {
          //   entity[col.mc_nome_colonna] = entity[col.mc_nome_colonna + '__lookup_obj'].value;
          // }
        });

        if (!deleteFlags[idx]) {
          await this.validateData(entity);
        }
      });

      // Bypass del check globale validation se SOLO delete: lo stato
      // `validationsRules` delle colonne può essere sporco da validation
      // precedenti su altri record, e per le delete non interessa comunque.
      const invalid = onlyDeletes
        ? 0
        : this.metaInfo.columnMetadata.filter(x => x.validationsRules?.filter(y => !y.isValid).length).length;
      if (!invalid) {

        synchedData = await this.dataSrv.batchSave(entitiesObj, this);
        await this.executeAfterSyncCallback(entities, synchedData, true, false, false);
        let summary = '';

        synchedData.forEach((element, idx) => {
          // Il backend `deleteRecord` non include `__entity` nella risposta
          // (solo `result`/`operation`/`sqlQuery`). Fallback sull'entity originale
          // passata nel batch per estrarre la PK.
          const returnedEntity = element.__entity ?? entitiesObj?.[idx] ?? {};
          const pk = returnedEntity?.[primaryKeyField];
          const desc = this.metaInfo.tableMetadata.md_long_description;
          if (element.operation == 'insert') {
            summary += (summary ? ', ' : '') + this.trnsl.format(this.trnsl.instant('inserted_route_{0}_id_{1}'), desc, pk);
          } else if (element.operation == 'update') {
            summary += (summary ? ', ' : '') + this.trnsl.format(this.trnsl.instant('updated_route_{0}_id_{1}'), desc, pk);
          } else {
            summary += (summary ? ', ' : '') + this.trnsl.format(this.trnsl.instant('deleted_route_{0}_id_{1}'), desc, pk);
          }
        });

        this.notifyMenuMetadataChanged();

        entities.forEach(entity => {
          this.removeTrackedChangesForEntity(entity, entity);
        });

        // this.refreshPristineFromCurrent();
        // this.publishLocalStateUpdate();

        this.emitAfterSync(syncOperation, entities, originals, synchedData);

        WtoolboxService.messageNotificationService.add({ severity: 'info', summary: summary });

        resolve(synchedData);

      } else {
        this.metaInfo.columnMetadata.forEach((col: MetadatiColonna) => {
          col.validationsRules.forEach((validationResult) => {
            if (!validationResult.isValid) {
              WtoolboxService.messageNotificationService.add({ severity: 'error', summary: this.trnsl.instant('validation_error'), detail: validationResult.message });
            }
          });
        });

        resolve(null);
      }

    });
    // }
  }

  /**
* Restituisce i tracked change con almeno una modifica effettivamente pendente.
* @returns Elenco pending changes con almeno una variazione registrata.
*/
  public getPendingChanges(): TrackedChange[] {
    return (this.changes || []).filter((x) => Array.isArray(x?.changes) && x.changes.length > 0);
  }

  /**
* Restituisce l'azione route corrente (`action`) in formato lowercase trim.
* @returns Azione route corrente (`action`) in lowercase.
*/
  private getCurrentRouteAction(): string {
    return String(this.aRoute?.snapshot?.paramMap?.get('action') || '').trim().toLowerCase();
  }

  /**
* Restituisce il nome campo PK risolto da `metaInfo.pKey`.
* @returns Nome campo chiave primaria risolto da `metaInfo.pKey`.
*/
  private getPrimaryKeyFieldName(): string {
    const pkey = this.metaInfo?.pKey as any;
    if (pkey?.mc_nome_colonna) {
      return String(pkey.mc_nome_colonna);
    }
    if (pkey?.ang_name) {
      return String(pkey.ang_name);
    }

    const fromColumns = this.metaInfo?.columnMetadata?.find((c: any) => !!c?.mc_is_primary_key)?.mc_nome_colonna;
    return String(fromColumns || '').trim();
  }

  /**
* Applica/aggiorna filtri derivati dai parametri route sul `filterInfo` corrente.
*/
  private applyRouteParamFilterFromSnapshot(): void {
    if (!this.routeFromRouting) {
      return;
    }

    const rawFilters = String(this.aRoute?.snapshot?.paramMap?.get('filters') || '').trim();
    this.filterParam = rawFilters || '';
    if (!rawFilters) {
      return;
    }

    let field = '';
    let operatore = 'eq';
    let value: any = '';
    const parts = rawFilters.split('||');

    if (parts.length >= 3) {
      field = String(parts[0] || '').trim();
      operatore = String(parts[1] || 'eq').trim() || 'eq';
      value = parts.slice(2).join('||');
    } else if (this.getCurrentRouteAction() === 'edit') {
      field = this.getPrimaryKeyFieldName();
      value = rawFilters;
    } else {
      return;
    }

    if (!field) {
      return;
    }

    if (!this.filterInfo) {
      this.filterInfo = new FilterInfo('AND', []);
    }

    const existing = this.filterInfo.filters.find((x: any) => x?.field === field);
    if (existing) {
      existing.operatore = operatore;
      existing.value = value;
      existing.fixed = true;
      (existing as any).__routefilter = true;
    } else {
      this.filterInfo.filters.push({
        field,
        operatore,
        value,
        fixed: true,
        __routefilter: true
      } as any);
    }

    const descriptor = this.filterDescriptor?.[field];
    if (descriptor) {
      descriptor.next(value);
    }
    this.metaInfo.operators[field] = operatore;
  }

  /**
* Indica se esistono modifiche locali non ancora sincronizzate.
* @returns True se esiste almeno un change pendente nel tracker.
*/
  public hasPendingChanges(): boolean {
    return this.getPendingChanges().length > 0;
  }

  /**
* Gestisce la conferma utente quando ci sono pending changes prima di fetch/navigate.
* @param operation Operazione in corso (`fetch` o `navigate`) usata nel prompt di conferma.
* @returns True se l'operazione può proseguire; false se l'utente annulla.
*/
  public async confirmProceedWithPendingChanges(operation: 'fetch' | 'navigate'): Promise<boolean> {
    if (!this.hasPendingChanges()) {
      return true;
    }

    const confirmed = await WtoolboxService.confirm({
      header: this.trnsl.instant('confirm'),
      message: operation === 'navigate'
        ? 'Ci sono modifiche non salvate. Uscendo dalla pagina verranno annullate. Continuare?'
        : 'Ci sono modifiche non salvate. Ricaricando i dati verranno annullate. Continuare?'
    });

    if (!confirmed) {
      return false;
    }

    this.rollbackChanges(this.getPendingChanges());
    return true;
  }

  /**
* Converte i pending changes in payload batch, invia la sync e aggiorna tracker/snapshot locale.
* @param targetChanges Set opzionale di changes da sincronizzare; se omesso usa i pending correnti.
* @returns Risposta backend della batch sync oppure null se non ci sono changes sincronizzabili.
*/
  public async batchSave(targetChanges?: TrackedChange[]): Promise<any> {
    const pending = Array.isArray(targetChanges) && targetChanges.length
      ? targetChanges.filter((x) => Array.isArray(x?.changes) && x.changes.length > 0)
      : this.getPendingChanges();

    if (!pending.length) {
      return null;
    }

    const entities = pending
      .map((change) => this.buildBatchEntityFromTrackedChange(change))
      .filter((x) => !!x);

    if (!entities.length) {
      return null;
    }

    const beforeSyncEvent = this.emitBeforeSync('batch', entities, null);
    if (beforeSyncEvent.cancel) {
      return null;
    }

    const response = await this.dataSrv.batchSave(entities, this);
    this.removeTrackedChanges(pending);
    this.refreshPristineFromCurrent();
    this.publishLocalStateUpdate();
    this.emitAfterSync('batch', entities, null, response);

    return response;
  }

  /**
* Ripristina i valori originali dei pending changes sui record e aggiorna tracker/snapshot locale.
* @param targetChanges Set opzionale di changes da rollback; se omesso usa i pending correnti.
* @returns Numero record sui quali è stato applicato il rollback locale.
*/
  public rollbackChanges(targetChanges?: TrackedChange[]): number {
    const pending = Array.isArray(targetChanges) && targetChanges.length
      ? targetChanges.filter((x) => Array.isArray(x?.changes) && x.changes.length > 0)
      : this.getPendingChanges();

    if (!pending.length) {
      return 0;
    }

    const pkey = this.getPrimaryKeyName();
    let rolledBack = 0;

    pending.forEach((tracked) => {
      const row = this.findRecordByTrackedChange(tracked, pkey);
      if (!row) {
        return;
      }

      const current = this.resultInfo?.current;
      const currentMatches = !!current && this.matchesTrackedChange(current, tracked, pkey);

      tracked.changes.forEach((fieldChange) => {
        row[fieldChange.field] = this.cloneJson(fieldChange.oldValue);
        if (currentMatches && current[fieldChange.field] && typeof current[fieldChange.field].next === 'function') {
          current[fieldChange.field].next(this.cloneJson(fieldChange.oldValue));
        }
      });

      rolledBack += 1;
    });

    this.removeTrackedChanges(pending);
    this.refreshPristineFromCurrent();
    this.publishLocalStateUpdate();

    return rolledBack;
  }

  /**
* Costruisce un'entità batch dal tracked change includendo `__original` per confronto lato server.
* @param tracked Tracked change da convertire in payload batch.
* @returns Entità batch con valori correnti + snapshot `__original`.
*/
  private buildBatchEntityFromTrackedChange(tracked: TrackedChange): any {
    if (!tracked || !Array.isArray(tracked.changes) || !tracked.changes.length) {
      return null;
    }

    const row = this.findRecordByTrackedChange(tracked);
    if (!row) {
      return null;
    }

    const entity = this.cloneJson(row);
    const original = this.cloneJson(row);
    tracked.changes.forEach((change) => {
      entity[change.field] = change.newValue;
    });

    entity.__original = original;

    return entity;
  }

  /**
* Risolve il nome PK dalla lista `columnMetadata`.
* @returns Nome campo PK risolto da `columnMetadata`.
*/
  private getPrimaryKeyName(): string | null {
    return MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0]?.mc_nome_colonna || null;
  }

  /**
* Cerca il record locale corrispondente a un tracked change usando PK/GUID.
* @param tracked Tracked change da risolvere.
* @param pkeyName Nome PK opzionale usato nel matching.
* @returns Record locale associato al tracked change, se trovato.
*/
  private findRecordByTrackedChange(tracked: TrackedChange, pkeyName?: string | null): any {
    const pk = pkeyName ?? this.getPrimaryKeyName();
    const rows = Array.isArray(this.resultInfo?.dato) ? this.resultInfo.dato : [];
    return rows.find((row: any) => this.matchesTrackedChange(row, tracked, pk));
  }

  /**
* Verifica se record e tracked change identificano la stessa entità confrontando PK o GUID.
* @param record Record candidato al match.
* @param tracked Tracked change da confrontare.
* @param pkeyName Nome PK opzionale usato nel confronto.
* @returns True se record e tracked change rappresentano la stessa entità (PK/GUID).
*/
  private matchesTrackedChange(record: any, tracked: TrackedChange, pkeyName?: string | null): boolean {
    if (!record || !tracked) {
      return false;
    }

    const unwrap = (value: any) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return value.value;
      }
      return value;
    };

    const recordPKey = pkeyName ? unwrap(record?.[pkeyName]) : undefined;
    if (tracked?.pkey !== undefined && tracked?.pkey !== null && recordPKey !== undefined && recordPKey !== null) {
      return String(tracked.pkey) === String(recordPKey);
    }

    const recordGuid = unwrap(record?.__guid);
    if (tracked?.guid !== undefined && tracked?.guid !== null && recordGuid !== undefined && recordGuid !== null) {
      return String(tracked.guid) === String(recordGuid);
    }

    return false;
  }

  /**
* Rimuove dal tracker locale i change specificati.
* @param toRemove Changes da rimuovere dal tracker.
*/
  private removeTrackedChanges(toRemove: TrackedChange[]): void {
    if (!Array.isArray(toRemove) || !toRemove.length) {
      return;
    }

    const trackedIds = new Set(
      toRemove.map((x) => `${String(x?.pkey ?? '')}::${String(x?.guid ?? '')}`)
    );

    this.changes = (this.changes || []).filter((x) => {
      const id = `${String(x?.pkey ?? '')}::${String(x?.guid ?? '')}`;
      return !trackedIds.has(id);
    });
  }

  /**
* Rigenera lo snapshot `pristine` a partire dal record corrente normalizzato.
*/
  private refreshPristineFromCurrent(): void {
    if (!this.resultInfo?.current) {
      return;
    }

    this.pristine = JSON.parse(JSON.stringify(this.getModelFromObservable(this.resultInfo.current)));
  }

  /**
* Pubblica uno stato locale aggiornato su `fetchInfo$` per riallineare i consumer del datasource.
*/
  private publishLocalStateUpdate(): void {
    if (!Array.isArray(this.resultInfo?.dato)) {
      return;
    }

    this.resultInfo.dato = [...this.resultInfo.dato];
    this.publishFetchInfo({
      resultInfo: this.resultInfo,
      metaInfo: this.metaInfo,
      filterDescriptor: this.filterDescriptor
    });
  }

  /**
* Invoca la callback `md_after_save_fn` e centralizza la gestione errori post-sync.
* @param savingData Payload inviato in sync.
* @param syncedData Risposta restituita dal backend.
* @param isInsert True se la sync è insert.
* @param isClone True se la sync è clone.
* @param isDelete True se la sync è delete.
*/
  private async executeAfterSyncCallback(
    savingData: any,
    syncedData: any,
    isInsert: boolean,
    isClone: boolean,
    isDelete: boolean
  ): Promise<void> {
    const afterSaveCallback = this.metaInfo?.tableMetadata?.md_after_save_fn;
    if (!afterSaveCallback) {
      return;
    }

    // After-save failures must HALT the upstream save flow (otherwise
    // the form closes and navigates away, destroying the typed dialog
    // before it can render). Pass `rethrow:true` to runUserCallback —
    // the helper still emits the typed dialog for the user.
    WtoolboxService.isBusy.next(false);
    await WtoolboxService.runUserCallback(
      'md_after_save',
      afterSaveCallback,
      [this, savingData, syncedData, isInsert, isClone, isDelete, null, WtoolboxService],
      {
        route: String(this.metaInfo?.tableMetadata?.md_route_name || ''),
        phase: isDelete ? 'delete' : (isInsert ? 'insert' : (isClone ? 'clone' : 'update')),
      },
      { targetName: 'DataSourceComponent.executeAfterSyncCallback', rethrow: true }
    );
  }

  /**
* Invoca `md_before_save_fn` e risolve se procedere o bloccare la sincronizzazione.
* @param savingData Payload passato alla callback before-save.
* @returns True se la callback before-save consente la sync, false altrimenti.
*/
  private async canProceedBeforeSync(savingData: any): Promise<boolean> {
    if (!this.metaInfo?.tableMetadata?.md_before_save_fn) {
      return true;
    }

    let settled = false;
    let resolveOuter!: (v: boolean) => void;
    const outer = new Promise<boolean>((resolve) => { resolveOuter = resolve; });
    const beforeSync = (shouldSync: boolean) => {
      if (settled) { return; }
      settled = true;
      resolveOuter(shouldSync === true);
    };
    // The user-supplied md_before_save callback may signal go/halt either
    // via the explicit `beforeSync(bool)` callback OR via a returned
    // boolean. runUserCallback handles its throw → typed dialog (no
    // rethrow needed because resolveOuter(false) is enough to halt the
    // save flow).
    const result = await WtoolboxService.runUserCallback(
      'md_before_save',
      this.metaInfo.tableMetadata.md_before_save_fn,
      [this, savingData, beforeSync, null, WtoolboxService],
      {
        route: String(this.metaInfo?.tableMetadata?.md_route_name || ''),
        phase: 'before-save',
      },
      { targetName: 'DataSourceComponent.canProceedBeforeSync' }
    );
    if (!settled) {
      if (typeof result === 'boolean') {
        beforeSync(result);
      } else if (result === undefined) {
        // runUserCallback returns undefined on failure → halt the save
        beforeSync(false);
      } else {
        // No explicit signal and no error → proceed by default (legacy)
        beforeSync(true);
      }
    }
    return outer;
  }

  /**
* Invalida cache menu e notifica aggiornamento quando la route corrente è il meta-menu.
*/
  private notifyMenuMetadataChanged(): void {
    if (this.metaInfo?.tableMetadata?.md_route_name != MetadataProviderService.metaMenuRoute) {
      return;
    }

    this.metaSrv.invalidateMenuByUserIdCache();
    WtoolboxService.menuUpdated.next(true);
  }

  /**
* Richiede export XLS della route corrente applicando il filtro attivo.
* @returns Esito export XLS restituito da `DataProviderService`.
*/
  async exportXls(progressGuid: string = "") {
    return await this.dataSrv.exportXls(this.metaInfo.tableMetadata.md_route_name, this.filterInfo, progressGuid);
  }

  /**
  * Imposta il record corrente, aggiorna `pristine` e (se attivo) avvia il tracking modifiche campo per campo.
  * @param data Record da impostare come corrente.
  */
  setCurrent(data) {
    let record = this.getObservable(data);

    this.resultInfo.current = record;
    // Build pristine from normalized model to avoid circular runtime references
    // (e.g. editor subscriptions) when caller passes rich metadata objects.
    this.pristine = this.cloneJson(this.getModelFromObservable(record));

    if (this.changeTracking) {
      this.clearTrackedRecordSubscriptions();
      const pkeyMeta = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0];
      const pkey = String(pkeyMeta?.mc_nome_colonna || '').trim();
      const currentPkeyValue = pkey ? record?.[pkey]?.value : undefined;
      const currentGuidValue = record?.['__guid']?.value;
      if (!this.changes.find(x =>
        (pkey && currentPkeyValue !== undefined && currentPkeyValue !== null)
          ? x.pkey == currentPkeyValue
          : x.guid == currentGuidValue
      )) {
        let tc = new TrackedChange(currentPkeyValue, currentGuidValue);

        this.trackRecordChange(record, pkey);

        // this.changes.push(tc);
      }
    }

    // this.parseConditions();
  }

  /**
* Sottoscrive i campi del record e aggiorna `changes` con delta old/new per ogni modifica.
* @param record Record osservabile da tracciare.
* @param pkey Nome campo chiave primaria.
* @param specificKey Campo specifico da tracciare (opzionale).
*/
  private trackRecordChange(record: { [key: string]: BehaviorSubject<any>; }, pkey: string, specificKey: string = null) {
    Object.keys(record).filter(key => !specificKey || specificKey == key).forEach(key => {
      if (!this.isTrackableChangeField(key)) {
        return;
      }

      const sub = record[key].subscribe(value => {
        const currentPkeyValue = pkey ? this.resultInfo?.current?.[pkey]?.value : undefined;
        const currentGuidValue = this.resultInfo?.current?.['__guid']?.value;
        let matchTrack = this.changes.find(x =>
          (pkey && currentPkeyValue !== undefined && currentPkeyValue !== null)
            ? x.pkey == currentPkeyValue
            : x.guid == currentGuidValue
        );
        if (matchTrack) {
          let match = matchTrack.changes.find(x => x.field == key);
          if (match) {
            if (this.areTrackedFieldValuesEqual(key, match.oldValue, value)) {
              matchTrack.changes.splice(matchTrack.changes.indexOf(match), 1);
            } else {
              match.newValue = this.cloneJson(value);
              match.timestamp = new Date();
            }
          } else {
            if (!this.areTrackedFieldValuesEqual(key, this.pristine?.[key], value)) {
              let cT = new ChangeT(key, this.cloneJson(this.pristine?.[key]), this.cloneJson(value));
              matchTrack.changes.push(cT);
            }
          }
        } else {
          if (!this.areTrackedFieldValuesEqual(key, this.pristine?.[key], value)) {
            let tc = new TrackedChange(currentPkeyValue, currentGuidValue);
            let cT = new ChangeT(key, this.cloneJson(this.pristine?.[key]), this.cloneJson(value));
            tc.changes.push(cT);
            this.changes.push(tc);
          }
        }
      });
      this.trackedRecordSubscriptions.push(sub);
    });
  }

  /**
   * Verifica se un campo puo essere tracciato/sincronizzato come change persistente.
   * Esclude campi tecnici e lookup object non persistiti su DB.
   */
  private isTrackableChangeField(fieldName: string): boolean {
    if (!fieldName || fieldName === '__new' || fieldName.indexOf('__lookup_obj') >= 0) {
      return false;
    }

    const metadataFields = new Set((this.metaInfo?.columnMetadata || []).map((c) => c?.mc_nome_colonna).filter((x) => !!x));
    return metadataFields.has(fieldName);
  }

  /**
   * Recupera i metadati colonna per nome campo.
   */
  private getColumnMetadataByName(fieldName: string): MetadatiColonna | null {
    if (!fieldName) {
      return null;
    }

    return (this.metaInfo?.columnMetadata || []).find((c) => c?.mc_nome_colonna === fieldName) || null;
  }

  /**
   * Serializza Date in formato locale compatibile con persistenza metadata (senza conversione UTC `Z`).
   */
  private formatDateForSync(value: Date, uiColumnType: string): string {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return value as any;
    }

    const pad = (v: number) => String(v).padStart(2, '0');
    const yyyy = value.getFullYear();
    const mm = pad(value.getMonth() + 1);
    const dd = pad(value.getDate());
    const hh = pad(value.getHours());
    const mi = pad(value.getMinutes());
    const ss = pad(value.getSeconds());
    const type = String(uiColumnType || '').toLowerCase();

    if (type === 'date') {
      return `${yyyy}-${mm}-${dd}T00:00:00`;
    }

    if (type === 'datetime') {
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }

    if (type === 'time') {
      return `${hh}:${mi}:${ss}`;
    }

    return value as any;
  }

  /**
   * Normalizza il valore campo prima della sync evitando serializzazione Date->UTC (`toISOString`) sui tipi data/ora.
   */
  private normalizeFieldValueForSync(fieldName: string, value: any): any {
    const col = this.getColumnMetadataByName(fieldName);
    const colType = String(col?.mc_ui_column_type || '').toLowerCase();
    const isDateLikeColumn = colType === 'date' || colType === 'datetime' || colType === 'time';
    if (!isDateLikeColumn) {
      return value;
    }

    if (value instanceof Date) {
      return this.formatDateForSync(value, colType);
    }

    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) {
        return value;
      }

      // Preserve already-local normalized values.
      if (colType === 'time' && /^\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
        return raw.length === 5 ? `${raw}:00` : raw;
      }

      if ((colType === 'date' || colType === 'datetime') && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
        return raw;
      }

      // Convert UTC/offset ISO strings (e.g. 2026-04-15T22:00:00.000Z) to local database-safe format.
      const hasUtcOrOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
      if (hasUtcOrOffset) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
          return this.formatDateForSync(parsed, colType);
        }
      }
    }

    return value;
  }

  /**
   * Pulisce il payload changes per sync rimuovendo campi lookup/non persistenti
   * e change privi della struttura minima richiesta lato server.
   */
  private sanitizeChangesForSync(changes: ChangeT[] | undefined | null): ChangeT[] {
    if (!Array.isArray(changes) || !changes.length) {
      return [];
    }

    return changes
      .filter((c: any) => !!c && this.isTrackableChangeField(String(c.field || '')) && Object.prototype.hasOwnProperty.call(c, 'oldValue'))
      .map((c: any) => ({
        field: c.field,
        oldValue: this.normalizeFieldValueForSync(String(c.field || ''), c.oldValue),
        newValue: this.normalizeFieldValueForSync(String(c.field || ''), c.newValue),
        timestamp: c.timestamp
      } as ChangeT));
  }

  /**
   * Calcola un delta minimo confrontando il payload entity con il pristine.
   * Utile quando il tracker non ha registrato cambi ma la UI ha comunque mutato campi.
   */
  private buildFallbackChangesForSync(entity: any, pristine: any): ChangeT[] {
    if (!entity || !pristine) {
      return [];
    }

    const now = new Date();
    const changes: ChangeT[] = [];
    (this.metaInfo?.columnMetadata || []).forEach((col) => {
      const field = String(col?.mc_nome_colonna || '').trim();
      if (!this.isTrackableChangeField(field)) {
        return;
      }

      const oldValue = this.normalizeFieldValueForSync(field, pristine?.[field]);
      const newValue = this.normalizeFieldValueForSync(field, entity?.[field]);
      if (this.areTrackedFieldValuesEqual(field, oldValue, newValue)) {
        return;
      }

      changes.push({
        field,
        oldValue: this.cloneJson(oldValue),
        newValue: this.cloneJson(newValue),
        timestamp: now
      } as ChangeT);
    });

    return changes;
  }

  /**
* Rimuove i tracked changes associati a una specifica entità risolta per PK o GUID.
* @param entityLike Entità principale per risolvere PK/GUID.
* @param fallbackEntityLike Entità fallback se la principale non contiene identificativi.
*/
  public removeTrackedChangesForEntity(entityLike: any, fallbackEntityLike?: any): void {
    const unwrap = (value: any) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return value.value;
      }
      return value;
    };

    const pkeyName = this.getPrimaryKeyName();
    const pkeyValue = pkeyName
      ? (unwrap(entityLike?.[pkeyName]) ?? unwrap(fallbackEntityLike?.[pkeyName]))
      : undefined;
    const guidValue = unwrap(entityLike?.__guid) ?? unwrap(fallbackEntityLike?.__guid);

    const toRemove = (this.changes || []).filter((tracked) => {
      if (pkeyValue !== undefined && pkeyValue !== null && tracked?.pkey !== undefined && tracked?.pkey !== null) {
        return String(tracked.pkey) === String(pkeyValue);
      }
      if (guidValue !== undefined && guidValue !== null && tracked?.guid !== undefined && tracked?.guid !== null) {
        return String(tracked.guid) === String(guidValue);
      }
      return false;
    });

    if (toRemove.length) {
      this.removeTrackedChanges(toRemove);
    }
  }

  /**
  * Crea un nuovo record con default metadato (e chiavi parent nested), lo imposta corrente e lo restituisce.
  * @param record Override opzionale dei valori default del nuovo record.
  * @returns Nuovo record osservabile impostato come corrente nel datasource.
  */
  addNewRecord(record?: any) {
    let defaulted = { __new: new BehaviorSubject<boolean>(true), __guid: new BehaviorSubject<string>(WtoolboxService.uuidv4()) };
    this.metaInfo.columnMetadata.forEach((col) => {

      if (col.mc_default_value) {
        defaulted[col.mc_nome_colonna] = col.mc_default_value
      } else if (col.mc_default_value_callback__fn) {
        // Suggest failure is non-fatal: if the user callback throws, the
        // typed dialog appears and the column simply stays unset.
        void WtoolboxService.runUserCallback(
          'mc_default_value_callback',
          col.mc_default_value_callback__fn,
          [defaulted, col, this.metaInfo, WtoolboxService],
          {
            column: col.mc_nome_colonna,
            route:  String(this.metaInfo?.tableMetadata?.md_route_name || ''),
            phase:  'add-new-record',
          },
          { targetName: 'DataSourceComponent.addNewRecord.mc_default_value_callback' }
        ).then((_v) => {
          // If the callback didn't write a value (sync set may have happened
          // inside the callback), make sure the slot exists.
          if (defaulted[col.mc_nome_colonna] === undefined) {
            defaulted[col.mc_nome_colonna] = null;
          }
        });
      } else {
        defaulted[col.mc_nome_colonna] = null;
      }

      if (col.convert_null_to_string && defaulted[col.mc_nome_colonna] == null) {
        defaulted[col.mc_nome_colonna] = col.convert_null_to_string == '{EMPTY}' ? '' : col.convert_null_to_string;
      }

      if (col.mc_ui_column_type == "lookupByID" || col.mc_ui_column_type == "multiple_check") {
        defaulted[col.mc_nome_colonna + "__lookup_obj"] = null;
      }
    });

    if (this.parentMetaInfo && this.parentRecord) {
      (this.parentMetaInfo.nestedRoutes || []).forEach((route) => {
        route.pKeys.forEach((key, index) => {
          defaulted[route.fKeys[index]] = this.parentRecord[route.pKeys[index]];
        });
      });
    }

    if (record) {
      Object.assign(defaulted, record);
    }

    // this.resultInfo.current = defaulted;
    // this.pristine = JSON.parse(JSON.stringify(this.getModelFromObservable(defaulted)));

    this.setCurrent(defaulted);

    // this.resultInfo.dato.push(defaulted);

    return this.resultInfo.current;
  }

  /**
  * Azzera filtro/lookup della colonna, rimuove filtri compatibili da `filterInfo` e opzionalmente rilancia `fetchData`.
  * @param col Metadato colonna di cui azzerare i filtri.
  * @param fetch Se true esegue fetchData dopo il reset filtro.
  */
  clearColumnFilter(col: MetadatiColonna, fetch: boolean = false) {
    this.filterDescriptor[col.mc_nome_colonna].next(null);

    const isLookupFilter = col.mc_ui_column_type == "lookupByID" || col.mc_ui_column_type == "multiple_check";
    const relatedLookupSearchFields = new Set<string>();
    if (isLookupFilter) {
      const lookupTextField = String(col.mc_ui_lookup_dataTextField || '').trim();
      const lookupDisplayField = String(col.mc_ui_grid_display_field || '').trim();
      if (lookupTextField && lookupTextField !== col.mc_nome_colonna) {
        relatedLookupSearchFields.add(lookupTextField);
      }
      if (lookupDisplayField && lookupDisplayField !== col.mc_nome_colonna) {
        relatedLookupSearchFields.add(lookupDisplayField);
      }
    }

    if (this.filterInfo?.filters?.length) {
      const currentOperator = this.metaInfo?.operators?.[col.mc_nome_colonna];
      this.filterInfo.filters = this.filterInfo.filters.filter(f => {
        if (f.fixed) {
          return true;
        }

        if (isLookupFilter && relatedLookupSearchFields.has(String(f.field || ''))) {
          const op = String(f.operatore || '').toLowerCase();
          // Remove lookup text-search filters generated by autocomplete.
          if (op === 'contains' || op === 'startswith' || op === 'endswith') {
            return false;
          }
        }

        if (f.field !== col.mc_nome_colonna) {
          return true;
        }

        if (isLookupFilter) {
          const op = String(f.operatore || '').toLowerCase();
          // For lookup column clear, always remove selection filters too.
          if (op === 'eqor' || op === 'eq' || op === 'in' || op === 'contains' || op === 'startswith' || op === 'endswith') {
            return false;
          }
        }

        // Default behavior for non-lookup columns:
        // remove only the UI-managed filter for the current field/operator.
        if (!currentOperator) {
          return false;
        }
        return f.operatore !== currentOperator;
      });
    }

    if (col.mc_ui_column_type == "multiple_check" || col.mc_ui_column_type == "lookupByID") {
      this.resetFilterDescriptorValue(col.mc_nome_colonna + '__lookup_obj');
    }

    if (isLookupFilter) {
      relatedLookupSearchFields.forEach((fieldName) => {
        if (this.filterDescriptor[fieldName]) {
          this.resetFilterDescriptorValue(fieldName);
        }
      });
    }

    if (fetch) {
      this.fetchData();
    }
  }
}


