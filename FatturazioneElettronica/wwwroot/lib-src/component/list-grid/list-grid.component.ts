import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, SecurityContext, ViewChild, forwardRef } from '@angular/core';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DeviceAwarenessService } from '../../service/device-awareness.service';
import { DataSourceComponent } from "../data-source/data-source.component";
import { Table, TableModule } from 'primeng/table';
import type { TableRowCollapseEvent, TableRowExpandEvent } from 'primeng/table';
import { SelectButton } from 'primeng/selectbutton';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { AsyncPipe, NgClass, NgComponentOutlet, NgTemplateOutlet } from '@angular/common';

import { FieldFilterComponent } from '../field/field-filter/field-filter.component';

import { MetaInfo } from '../../class/metaInfo';
import { DynamicRowTemplateComponent } from '../dynamic-template/dynamic-template.component';
// DynamicCardTemplateComponent: removed from list-grid import 2026-04-23.
// Mobile ora riusa lo stesso `DynamicRowTemplateComponent` del desktop con
// template string card-layout. Il modulo resta in public API della lib per
// host che lo usano direttamente.
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Location, CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, NavigationStart, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SplitButtonModule } from 'primeng/splitbutton';
import { ContextMenuModule } from 'primeng/contextmenu';
import { PaginatorModule } from 'primeng/paginator';
import { ScrollerModule } from 'primeng/scroller';
import type { ContextMenu } from 'primeng/contextmenu';
import { MenuModule } from 'primeng/menu';
import { TranslateModule } from '@ngx-translate/core';
import { VisibleFieldListPipe } from '../../pipe/visible-field-list.pipe';
import { Title } from "@angular/platform-browser";
import { TranslationManagerService } from '../../service/translation-manager.service';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { DataRepeaterComponent } from '../data-repeater/data-repeater.component';
import { BehaviorSubject, Subscription } from 'rxjs';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { UserInfoService } from '../../service/user-info.service';
import type { MenuItem } from 'primeng/api';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor.component';
import { MetadatiCustomActionTabella } from '../../class/metadati_custom_actions_tabelle';
import { ChangeT, TrackedChange } from '../../class/trackedChanges';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import { ImportExportButtonComponent } from '../import-export-button/import-export-button.component';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

interface ListGridSavedState {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  createdAt: string;
  filterInfo: any;
  sortInfo: any[];
  pageInfo: { currentPage: number; pageSize: number };
  columnWidths: { [field: string]: number };
  columnLayout?: ListGridColumnLayout;
}

interface ListGridColumnLayout {
  order: string[];
  hidden: string[];
  pinnedLeft: string[];
  pinnedRight: string[];
}

interface ReportVariableInput {
  name: string;
  alias: string;
  value: string;
  type?: string;
}

interface GridPendingChangeItem {
  id: string;
  change: TrackedChange;
  label: string;
  details: string;
  selected: boolean;
}

export interface ListGridBeforeRowRenderEvent {
  row: any;
  rowIndex: number;
  cancel: boolean;
  cancelRender: () => void;
}

export interface ListGridAfterRowRenderEvent {
  row: any;
  rowIndex: number;
}

export interface ListGridAfterRenderEvent {
  rows: any[];
  totalRecords: number;
  metaInfo: MetaInfo;
  datasource?: DataSourceComponent;
}

@Component({
  selector: 'wuic-list-grid',
  imports: [DataSourceComponent, forwardRef(() => DataRepeaterComponent), TableModule, ButtonModule, SplitButtonModule, DialogModule, ContextMenuModule, MenuModule, PaginatorModule, ScrollerModule, Tabs, TabList, Tab, TabPanels, TabPanel, NgClass, AsyncPipe, FormsModule, InputTextModule, FieldFilterComponent, NgComponentOutlet, TranslateModule, VisibleFieldListPipe, MetadataEditorComponent, ImportExportButtonComponent],
  templateUrl: './list-grid.component.html',
  styleUrl: './list-grid.component.scss',
  providers: [Title]
})
export class ListGridComponent implements AfterViewInit, OnInit, OnDestroy, IDataBoundHostComponent {
  private static readonly FORCED_VIRTUALIZATION_PAGE_SIZE_THRESHOLD = 1000;
  private static readonly FORCED_VIRTUALIZATION_ITEM_SIZE = 44;
  private static readonly ACTION_BUTTON_VISIBLE_ROWS_OVERSCAN = 4;
  private static readonly ACTION_BUTTON_INITIAL_VISIBLE_ROWS_FALLBACK = 28;
  private static readonly GRID_VIEW_STATES_SETTINGS_KEY = 'listGridViewStates';
  private static readonly GRID_COLUMN_LAYOUT_SETTINGS_KEY = 'listGridColumnLayout';
  private static selectButtonGuardInstalled = false;
  private columnFilterRenderEpochByField: { [field: string]: number } = {};
  private actionButtonsVisibleStartIndex = 0;
  private actionButtonsVisibleEndIndex = Number.MAX_SAFE_INTEGER;
  private actionButtonsLimitToVisibleRows = false;
  private actionButtonsPreLimitBeforeContainerReady = false;
  private actionButtonsScrollContainer: HTMLElement | null = null;
  private actionButtonsScrollRafToken: number | null = null;
  private actionButtonsScrollHandler: ((event: Event) => void) | null = null;
  private inlineCellSaveInFlightByRowKey = new Set<string>();
  private inlineCellSaveDebounceByRowKey: { [rowKey: string]: any } = {};
  private inlineCellLastChangedFieldByRowKey: { [rowKey: string]: string } = {};
  private inlineBatchOriginalByRowKey: { [rowKey: string]: any } = {};
  private inlineGridRuntimeFieldCacheByKey: { [cacheKey: string]: MetadatiColonna } = {};
  private suppressNextInlineFetchInfoRebind = false;
  public getRuntimeGridFieldMetaFn = (metaColumn: MetadatiColonna, rowData: any): MetadatiColonna =>
    this.getRuntimeGridFieldMeta(metaColumn, rowData);

  @Input() hardcodedRoute: string;
  @Input() parentRecord: any;
  @Input() parentMetaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
  @Input() hideToolbar: boolean = false;

  /**
   * Provider letto da `<wuic-import-export-button>` al click su Export XLS.
   * Arrow function (NON metodo) per preservare il binding di `this` quando
   * passata come Input — un metodo verrebbe richiamato col `this` del child.
   * Ritorna lo stato filtri LIVE del datasource: include i filtri applicati
   * via header/filter-bar che NON vengono propagati nella URL query string.
   */
  getCurrentFilterInfoForExport = (): any => {
    return this.datasource?.value?.filterInfo || { logic: 'AND', filters: [] };
  };

  /**
   * Evento emesso subito prima del rendering logico della singola riga.
   * Il consumer puo annullare la riga chiamando `cancelRender()`.
   */
  @Output() onBeforeRowRender = new EventEmitter<ListGridBeforeRowRenderEvent>();
  /**
   * Evento emesso subito dopo il rendering logico della singola riga.
   */
  @Output() onAfterRowRender = new EventEmitter<ListGridAfterRowRenderEvent>();
  /**
   * Evento emesso al termine del ciclo di binding dati della griglia.
   */
  @Output() onAfterRender = new EventEmitter<ListGridAfterRenderEvent>();
  /**
   * Evento emesso su paging (evento p-table onPage).
   */
  @Output() onPaging = new EventEmitter<any>();
  /**
   * Evento emesso su sorting (evento p-table onSort).
   */
  @Output() onSorting = new EventEmitter<any>();
  /**
   * Evento emesso su filtering (evento p-table onFilter).
   */
  @Output() onFiltering = new EventEmitter<any>();
  /**
   * Evento emesso dopo un refresh esplicito (click su bottone "Aggiorna"
   * del toolbar o invocazione di `refresh()` da codice). Gli host in Pattern 3
   * server-side possono usarlo per ri-fetchare dal loro backend custom.
   */
  @Output() onRefresh = new EventEmitter<void>();
  /**
   * Eventi p-table esposti lato host.
   */
  @Output() onPTableSelectionChange = new EventEmitter<any>();
  @Output() onPTableRowExpand = new EventEmitter<TableRowExpandEvent>();
  @Output() onPTableRowCollapse = new EventEmitter<TableRowCollapseEvent>();
  @Output() onPTableColumnResize = new EventEmitter<any>();
  @Output() onPTableColumnReorder = new EventEmitter<any>();

  @ViewChild('dt1') table: Table;
  @ViewChild('columnCtxMenu') columnCtxMenu: ContextMenu;
  @ViewChild('metadataColumnsDatasource') metadataColumnsDatasource: DataSourceComponent;
  @ViewChild('gridContainer') gridContainerRef?: ElementRef<HTMLElement>;

  @ViewChild('tableActionsMenu') tableActionsMenu: any;

  /** ResizeObserver per esporre --wuic-outer-thead-h alle nested grid figlie. */
  private outerTheadResizeObserver?: ResizeObserver;
  private outerTheadObserveRetryTimer?: any;

  records: any[] = [];
  cols: any[] = [];

  /**
   * Constant CSS value for `<col>`/`<th>` min-width binding. Pulled into a
   * field (instead of `getColumnMinWidthCss()` method) so the template binding
   * `[style.min-width]="columnMinWidthCss"` resolves to a property read
   * (no function call) and Angular's change-detection short-circuits when
   * the value didn't change. Saves ~3 function calls per column per CD cycle
   * (template uses it on `<col>`, header `<th>`, and filter row `<th>`).
   */
  readonly columnMinWidthCss = '10px';
  metas: MetadatiColonna[] = [];
  metaInfo: MetaInfo = new MetaInfo();
  routeName: string = '';
  actionName: string = '';
  totalRecords: number;
  pageSize: number = 10;
  rowNumber: number = 0;
  orderColumn: string = '';
  orderDir: 'asc' | 'desc' = 'asc';
  loading: BehaviorSubject<boolean>;
  pageIndex: number;
  globalFilterFields: string[] = [];
  searchValue: string = '';
  rowTemplate: any;
  /**
   * Tracks whether the currently compiled `rowTemplate` is the **mobile card**
   * variant (vs desktop). Decoupled from live `deviceAwareness.isMobile$`:
   * il viewport puo' attraversare la soglia (es. utente ridimensiona DevTools)
   * senza che il template sia ancora stato ricompilato. La classe CSS
   * `wuic-list-grid-mobile` (che nasconde thead/footer/paginator e rompe la
   * semantica table) deve seguire **lo stato del template compilato**, non il
   * viewport live, altrimenti si vede una hybrid view (desktop header + card rows).
   */
  gridLayoutIsMobile = false;
  /** @deprecated 2026-04-23 — mobile ora riusa rowTemplate del desktop. Field ancora esposto per backward-compat con host che lo leggevano. */
  mobileCardComponent: any;
  /** Subscription a `isMobile$` per ricompilare il rowTemplate quando il viewport attraversa la soglia mobile. */
  private isMobileSubscription?: Subscription;
  selectedItems: any[];
  expandedRows = {};
  aggregates: any[];
  private nestedLongDescriptionRawCache = '';
  private nestedLongDescriptionSafeCache: SafeHtml | '' = '';

  /**
   * Collezione dati per pending change items, consumata dal rendering e dalle operazioni del componente.
   */
  pendingChangeItems: GridPendingChangeItem[] = [];
  private syncFilterInfoQueryTimer: any;
  private syncGridStateQueryTimer: any;
  private suppressGridStateUrlPush = false;
  private releaseGridStateUrlPushTimer: any;
  private navigationTriggeredByPopstate = false;
  private suppressNextPageOnlyQuerySync = false;
  clientSideCrudToggleBusy = false;
  private persistedColumnWidthsByRoute: { [routeKey: string]: { [field: string]: number } } = {};
  private persistedColumnLayoutByRoute: { [routeKey: string]: ListGridColumnLayout } = {};
  private manualResizeDisablesProportionalByRoute: { [routeKey: string]: boolean } = {};
  private remoteColumnLayoutHydrationInFlight = false;
  private persistedGridStatesByRoute: { [routeKey: string]: ListGridSavedState[] } = {};
  private remoteGridStatesHydrationInFlight = false;
  currentRouteSavedStates: ListGridSavedState[] = [];
  selectedSavedStateId: string = '';
  private applyingSavedState = false;
  readonly NEW_GRID_STATE_OPTION_ID = '__new__';
  saveGridStateDialogVisible = false;
  saveGridStateDialogSelectedId = this.NEW_GRID_STATE_OPTION_ID;
  saveGridStateDialogNewName = '';
  saveGridStateDialogSetAsDefault = false;
  renameGridStateDialogVisible = false;
  renameGridStateDialogName = '';
  columnLayoutDialogVisible = false;
  columnLayoutDraft: Array<{ field: string; header: string; visible: boolean }> = [];
  saveStateMenuItems: MenuItem[] = [];
  columnContextMenuItems: MenuItem[] = [];
  selectedColumnForContextMenu?: MetadatiColonna;
  availableReports: { path: string; name: string }[] = [];
  reportMenuItems: MenuItem[] = [];
  tableActionMenuItems: MenuItem[] = [];
  reportVariableDialogVisible = false;
  reportVariableDialogLoading = false;
  selectedReportNameForVariables = '';
  selectedReportVariables: ReportVariableInput[] = [];
  changesDialogVisible = false;
  changesDialogBusy = false;
  /**
   * Proprieta di stato del componente per pending preferred state auto apply, usata dalla logica interna e dal template.
   */
  private pendingPreferredStateAutoApply = true;
  /**
   * Proprieta di stato del componente per query param subscription, usata dalla logica interna e dal template.
   */
  private queryParamSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
   */
  private routerEventsSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
   */
  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;

  /**
   * Proprieta di stato del componente per width defined, usata dalla logica interna e dal template.
   */
  public width_defined: string = null;

  /**
   * Proprieta di stato del componente per metadati colonna, usata dalla logica interna e dal template.
   */
  public MetadatiColonna: typeof MetadatiColonna = MetadatiColonna;

  /**
   * function Object() { [native code] }
   * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
   * @param route Informazione di navigazione usata per risolvere la route di destinazione.
   * @param router Informazione di navigazione usata per risolvere la route di destinazione.
   * @param location Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param titleService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(private metaSrv: MetadataProviderService, private sanitizer: DomSanitizer, private route: ActivatedRoute,
    private router: Router, private location: Location, private titleService: Title, private trslSrv: TranslationManagerService, private cd: ChangeDetectorRef, public userInfo: UserInfoService,
    private elementRef: ElementRef<HTMLElement>,
    public deviceAwareness: DeviceAwarenessService,
  ) {
    this.loading = WtoolboxService.isBusy;
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit() {
    this.ensureSelectButtonGuard();

    this.routeName = this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '';
    this.actionName = this.route.snapshot.paramMap.get('action') || '';

    this.width_defined = null;

    this.totalRecords = 0;
    this.pageIndex = 1;
    this.refreshSaveStateMenuItems();
    void this.loadReportList();
    this.loadPersistedColumnLayoutFromLocalStorage();
    this.hydratePersistedColumnLayoutFromServerIfNeeded();
    this.loadPersistedGridStatesFromLocalStorage();
    this.hydratePersistedGridStatesFromServerIfNeeded();
    this.refreshCurrentRouteSavedStates();

    // Subscribe a `isMobile$` per ricompilare il rowTemplate quando il viewport
    // attraversa la soglia mobile (es. utente ridimensiona DevTools responsive
    // mode). Senza questo, il template resta quello compilato all'ultimo
    // fetchInfo$ e la classe `wuic-list-grid-mobile` (che nasconde thead/footer/
    // paginator) non si allinea allo stato reale del viewport.
    this.isMobileSubscription?.unsubscribe();
    this.isMobileSubscription = this.deviceAwareness?.isMobile$?.subscribe((isMobile) => {
      if (this.gridLayoutIsMobile === isMobile) {
        return;
      }
      // Recompile only if we already have a metaInfo (initial load handled by fetchInfo$).
      if (this.metaInfo?.tableMetadata) {
        this.compileGridRowTemplate();
        this.cd.detectChanges();
      }
    });

    const queryParamChanges: any = (this.route as any)?.queryParamMap || (this.route as any)?.queryParams;
    if (queryParamChanges?.subscribe) {
      this.queryParamSubscription?.unsubscribe();
      this.queryParamSubscription = queryParamChanges.subscribe(() => {
        this.syncSelectedSavedStateWithDatasourceCurrentState();
      });
    }

    this.routerEventsSubscription?.unsubscribe();
    this.routerEventsSubscription = this.router.events.subscribe((val) => {
      if (val instanceof NavigationStart) {
        this.navigationTriggeredByPopstate = (val as any).navigationTrigger === 'popstate';
      }

      if (val instanceof NavigationStart && this.navigationTriggeredByPopstate) {
        this.suppressGridStateUrlPush = true;

        if (this.syncFilterInfoQueryTimer) {
          clearTimeout(this.syncFilterInfoQueryTimer);
          this.syncFilterInfoQueryTimer = undefined;
        }
        if (this.syncGridStateQueryTimer) {
          clearTimeout(this.syncGridStateQueryTimer);
          this.syncGridStateQueryTimer = undefined;
        }

        if (this.releaseGridStateUrlPushTimer) {
          clearTimeout(this.releaseGridStateUrlPushTimer);
        }

        return;
      }

      if (val instanceof NavigationEnd) {
        const nextRouteName = this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '';
        const nextActionName = this.route.snapshot.paramMap.get('action') || '';
        const routeChanged = nextRouteName !== this.routeName;
        const actionChanged = nextActionName !== this.actionName;
        this.routeName = nextRouteName;
        this.actionName = nextActionName;

        if (!routeChanged && !actionChanged) {
          return;
        }

        this.totalRecords = 0;
        this.pageIndex = 1;
        this.loadPersistedColumnLayoutFromLocalStorage();
        this.hydratePersistedColumnLayoutFromServerIfNeeded();
        this.loadPersistedGridStatesFromLocalStorage();
        this.hydratePersistedGridStatesFromServerIfNeeded();
        this.pendingPreferredStateAutoApply = true;
        this.refreshCurrentRouteSavedStates();
        // Bug fix duplicate fetches on saved-state-restore: se per la route
        // appena attivata esiste un saved state default, segnaliamo al data-
        // source di skippare la sua auto-fetch iniziale (con pageSize default).
        // Senza questo, partono 2 chiamate a `MetaService.getFlatRecordData`:
        // una con pageSize default (es. 10) dalla auto-fetch del data-source
        // dopo getSchemaAndData, e una con pageSize 50 (saved state) da
        // `applySelectedGridState`. Il timing di arrivo race-vince tra le due
        // → il list-grid binda i record della "sbagliata" e poi sovrascrive
        // con i 50, ma durante il rebuild PrimeNG del frozen split puo' lasciare
        // celle vuote. Skippando l'auto-fetch iniziale, l'unica fetchData che
        // parte e' quella di applySelectedGridState (correct route + pageSize).
        const hasDefaultSavedState = !!this.currentRouteSavedStates?.some(s => s.isDefault);
        if (hasDefaultSavedState && this.datasource?.value) {
          (this.datasource.value as any)._suppressInitialFetchForSavedState = true;
        }
        void this.loadReportList();

        if (this.table) {
          this.table.clearFilterValues();
          this.table.clearState();
          this.table.clear();
          this.table.reset();
          this.table.filters = {};
        }
      }

      if (this.suppressGridStateUrlPush) {
        if (this.releaseGridStateUrlPushTimer) {
          clearTimeout(this.releaseGridStateUrlPushTimer);
        }

        // Release after the router/navigation-driven table updates settle.
        this.releaseGridStateUrlPushTimer = setTimeout(() => {
          this.suppressGridStateUrlPush = false;
          this.releaseGridStateUrlPushTimer = undefined;
        }, 300);
      }
    });

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else {
      const datasource$ = this.datasource;
      if (datasource$?.value) {
        this.subscribeToDS();
      } else if (typeof (datasource$ as any)?.subscribe === 'function') {
        this.datasourceReadySubscription?.unsubscribe();
        this.datasourceReadySubscription = datasource$.subscribe((ds) => {
          if (ds) {
            this.datasourceReadySubscription?.unsubscribe();
            this.datasourceReadySubscription = undefined;
            this.subscribeToDS();
          }
        });
      }
    }

  }

  /**
   * Gestisce la logica operativa di `ensureSelectButtonGuard` orchestrando le chiamate `call`.
   */
  private ensureSelectButtonGuard(): void {
    if (ListGridComponent.selectButtonGuardInstalled) {
      return;
    }

    const proto = (SelectButton as any)?.prototype;
    if (!proto) {
      return;
    }

    const originalGetOptionLabel = proto.getOptionLabel;
    if (typeof originalGetOptionLabel === 'function') {
      proto.getOptionLabel = function (option: any) {
        if (option == null) {
          return '';
        }
        return originalGetOptionLabel.call(this, option);
      };
    }

    const originalGetOptionValue = proto.getOptionValue;
    if (typeof originalGetOptionValue === 'function') {
      proto.getOptionValue = function (option: any) {
        if (option == null) {
          return undefined;
        }
        return originalGetOptionValue.call(this, option);
      };
    }

    const originalIsOptionDisabled = proto.isOptionDisabled;
    if (typeof originalIsOptionDisabled === 'function') {
      proto.isOptionDisabled = function (option: any) {
        if (option == null) {
          return true;
        }
        return originalIsOptionDisabled.call(this, option);
      };
    }

    ListGridComponent.selectButtonGuardInstalled = true;
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.scheduleGridViewportHeightSync();
    this.scheduleActionButtonsVisibleRangeSync();
    this.observeOuterTheadHeight();
    this.scheduleApplyPersistedTableWidth();
  }

  /**
   * Applica direttamente in DOM (senza Angular binding) la `<table style.width
   * + min-width>` salvata in `persistedColumnWidthsByRoute` come `__tableTotalWidth`.
   *
   * Why direct DOM e non `[tableStyle]` binding:
   *  - Durante il drag PrimeNG (`columnResizeMode="expand"`) modifica
   *    `<table style.width>` inline. Se anche Angular setta lo stesso prop
   *    via binding, i due meccanismi entrano in race → comportamento di
   *    spalmamento osservato (il delta del drag si distribuisce tra tutte
   *    le colonne invece di concentrarsi su quella trascinata).
   *  - Direct DOM bypassa Angular CD. Lo applichiamo SOLO al boot
   *    (ngAfterViewInit) e dopo `parseColumns` su data refresh — non durante
   *    il drag — quindi nessun conflitto.
   *  - Senza la table.style.width esplicita, al refresh il browser fitta il
   *    table al container (default `min-width: 100%` PrimeNG) e shrinkka
   *    le colonne → la scrollbar svanisce.
   */
  private scheduleApplyPersistedTableWidth(): void {
    // setTimeout 0 per aspettare il primo paint con i `<col style.width>`
    // gia' applicati dall'Angular binding
    setTimeout(() => this.applyPersistedTableWidth(), 0);
    // Backup tick a 250ms per dati che caricano async (datasource subscribe)
    setTimeout(() => this.applyPersistedTableWidth(), 250);
  }

  private applyPersistedTableWidth(): void {
    const totalWidth = this.computePersistedTableTotalWidth();
    // PrimeNG Table espone `tableViewChild` come @ViewChild del `<table>`
    // interno (NON dell'host `<p-table>`). Settando style.width sul `<table>`
    // interno NON allarghiamo il container scrollabile padre — il container
    // resta vincolato alla sua viewport e la `<table>` overflowa al suo
    // interno → scrollbar visibile dentro il container, non a livello pagina.
    const tableEl = (this.table as any)?.tableViewChild?.nativeElement as HTMLElement | undefined;
    if (!tableEl) return;
    if (totalWidth > 0) {
      const px = `${Math.ceil(totalWidth)}px`;
      tableEl.style.width = px;
      tableEl.style.minWidth = px;
    } else {
      // Nessuna persisted width → rimuovi eventuali leftover (cleanup)
      tableEl.style.width = '';
      tableEl.style.minWidth = '';
    }
  }

  /**
   * Ritorna la `<table style.width>` da applicare al refresh per riprodurre
   * il layout end-of-drag.
   *
   * Strategia:
   *  1. Se esiste `__tableWidth` persistito (chiave speciale catturata in
   *     `captureResizedColumnWidth`), usa quello — e' il valore esatto
   *     `oldTableWidth + delta` che PrimeNG ha applicato a fine drag.
   *  2. Fallback: somma persisted col widths + frozen widths reali (DOM)
   *     per il caso di stati legacy salvati prima del fix.
   */
  private computePersistedTableTotalWidth(): number {
    const routeWidths = this.getCurrentRouteColumnWidths();
    if (!routeWidths || Object.keys(routeWidths).length === 0) return 0;

    const stored = Number(routeWidths['__tableWidth']);
    if (Number.isFinite(stored) && stored > 0) return stored;

    let sum = 0;
    const host = this.elementRef?.nativeElement as HTMLElement | undefined;
    const frozenThs = host?.querySelectorAll('thead tr:first-child th.p-datatable-frozen-column');
    if (frozenThs && frozenThs.length > 0) {
      frozenThs.forEach((th) => {
        sum += Number((th as HTMLElement).getBoundingClientRect().width) || 0;
      });
    }

    const visibleCols = (this.cols || []).filter((c: any) => !c?.hidden);
    for (const c of visibleCols) {
      const persisted = Number(routeWidths[c?.field]);
      if (Number.isFinite(persisted) && persisted > 0) {
        sum += persisted;
      } else {
        sum += Number(c?.width) > 0 ? Number(c.width) : 100;
      }
    }
    return sum;
  }

  /**
   * Espone l'altezza del thead OUTER (top-level grid) come CSS var `--wuic-outer-thead-h`
   * sull'host element, per permettere a `position: sticky; top: var(...)` sull'inner thead
   * di lasciare spazio sotto l'header outer (anch'esso sticky a top:0).
   *
   * Si attiva SOLO sulla grid root (non nested): le inner ListGridComponent leggono la var
   * via cascade CSS dall'ancestor `wuic-list-grid` piu vicino, che corrisponde all'outer.
   */
  private observeOuterTheadHeight(): void {
    const host = this.elementRef?.nativeElement;
    if (!host) {
      return;
    }
    const isNested = !!host.parentElement?.closest('wuic-list-grid');
    if (isNested) {
      return;
    }

    const tryAttach = () => {
      this.outerTheadObserveRetryTimer = undefined;
      const outerThead = host.querySelector('.p-datatable-thead') as HTMLElement | null;
      if (!outerThead) {
        // Tabella outer puo essere creata in async (data load / cd cycle): retry breve.
        this.outerTheadObserveRetryTimer = window.setTimeout(tryAttach, 200);
        return;
      }

      const updateVar = () => {
        const h = Math.ceil(outerThead.getBoundingClientRect().height);
        host.style.setProperty('--wuic-outer-thead-h', `${h}px`);
      };

      updateVar();

      if (typeof ResizeObserver === 'undefined') {
        return;
      }

      this.outerTheadResizeObserver = new ResizeObserver(updateVar);
      this.outerTheadResizeObserver.observe(outerThead);
    };

    tryAttach();
  }

  /**
   * Ricalcola l'altezza disponibile della grid al resize finestra.
   */
  @HostListener('window:resize')
  onWindowResizeForGridLayout(): void {
    this.scheduleGridViewportHeightSync();
  }

  /**
   * Pianifica piu pass di sync layout per gestire render asincrono PrimeNG/pager.
   */
  private scheduleGridViewportHeightSync(): void {
    const run = () => this.applyGridViewportHeight();
    requestAnimationFrame(run);
    [80, 260, 650].forEach((delay) => window.setTimeout(run, delay));
  }

  /**
   * Vincola la griglia all'altezza disponibile in viewport, lasciando lo scroll al body p-table.
   */
  private applyGridViewportHeight(): void {
    const host = this.gridContainerRef?.nativeElement;
    if (!host) {
      return;
    }
    // Layout managed by flex residual space (no JS forced viewport height).
    // Keep container unconstrained so changing filter-bar tabs naturally
    // expands/reduces the table scroll area.
    host.style.removeProperty('height');
    host.style.removeProperty('max-height');
    host.style.minHeight = '0';
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy() {
    if (this.syncFilterInfoQueryTimer) {
      clearTimeout(this.syncFilterInfoQueryTimer);
    }
    if (this.syncGridStateQueryTimer) {
      clearTimeout(this.syncGridStateQueryTimer);
    }
    if (this.releaseGridStateUrlPushTimer) {
      clearTimeout(this.releaseGridStateUrlPushTimer);
    }
    this.queryParamSubscription?.unsubscribe();
    this.routerEventsSubscription?.unsubscribe();
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
    this.isMobileSubscription?.unsubscribe();
    this.detachActionButtonsScrollTracking();
    if (this.actionButtonsScrollRafToken !== null) {
      cancelAnimationFrame(this.actionButtonsScrollRafToken);
      this.actionButtonsScrollRafToken = null;
    }
    Object.keys(this.inlineCellSaveDebounceByRowKey || {}).forEach((key) => {
      if (this.inlineCellSaveDebounceByRowKey[key]) {
        clearTimeout(this.inlineCellSaveDebounceByRowKey[key]);
      }
    });
    this.inlineCellSaveDebounceByRowKey = {};
    this.inlineCellSaveInFlightByRowKey.clear();
    this.inlineCellLastChangedFieldByRowKey = {};
    this.inlineBatchOriginalByRowKey = {};
    this.inlineGridRuntimeFieldCacheByKey = {};
    this.suppressNextInlineFetchInfoRebind = false;

    if (this.outerTheadResizeObserver) {
      this.outerTheadResizeObserver.disconnect();
      this.outerTheadResizeObserver = undefined;
    }
    if (this.outerTheadObserveRetryTimer) {
      clearTimeout(this.outerTheadObserveRetryTimer);
      this.outerTheadObserveRetryTimer = undefined;
    }
    this.width_defined = null;
  }

  getNestedLongDescriptionSafeHtml(nestedSource?: DataSourceComponent): SafeHtml | '' {
    const raw = String(nestedSource?.metaInfo?.tableMetadata?.md_long_description || '');
    if (!raw.trim()) {
      this.nestedLongDescriptionRawCache = '';
      this.nestedLongDescriptionSafeCache = '';
      return '';
    }

    if (raw === this.nestedLongDescriptionRawCache && this.nestedLongDescriptionSafeCache) {
      return this.nestedLongDescriptionSafeCache;
    }

    this.nestedLongDescriptionRawCache = raw;
    this.nestedLongDescriptionSafeCache = this.sanitizer.bypassSecurityTrustHtml(this.stripScriptTags(raw));
    return this.nestedLongDescriptionSafeCache;
  }

  private stripScriptTags(html: string): string {
    return String(html || '')
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }

  // trackByFn(index, item) {
  //   return item.metaColumn.mc_id;
  // }

  /**
   * Restituisce una chiave stabile per il tracking colonne nel template,
   * evitando re-render completi quando l'array visibile viene ricreato.
   */
  getStableColumnTrackKey(col: any, index: number): string {
    const byField = String(col?.field || '').trim();
    if (byField) {
      return byField;
    }

    const mcId = Number(col?.metaColumn?.mc_id);
    if (Number.isFinite(mcId) && mcId > 0) {
      return `mc_${mcId}`;
    }

    return `idx_${index}`;
  }

  /**
   * Inline style per la `<p-table>` che replica il behavior runtime di PrimeNG
   * `columnResizeMode="expand"`: setta `width: <sum>; min-width: <sum>` sul
   * `<table>` quando esistono persisted column widths.
   *
   * Why: PrimeNG durante il resize "expand" applica esplicitamente questi
   * stili per forzare il `<table>` a essere piu' largo del container e
   * generare la scrollbar. Al refresh quegli inline styles spariscono e il
   * default `table-layout: auto + min-width: 100%` fa shrinkare le colonne
   * per fittare il container — la scrollbar svanisce e le widths persistite
   * (settate via `<col style.width>`) vengono ignorate dal browser.
   *
   * Con questo binding, la `<table>` riceve gli stessi stili che PrimeNG
   * applicherebbe a fine drag → table-layout puo' restare `auto` + i `<col>`
   * widths vengono rispettati come hint di partenza, e il browser distribuisce
   * la larghezza totale tra di loro proporzionalmente alle widths richieste.
   *
   * Ritorna `null` quando non ci sono persisted widths (default proportional).
   */
  getTableStyle(): { [key: string]: string } | null {
    const routeWidths = this.getCurrentRouteColumnWidths();
    if (!routeWidths || Object.keys(routeWidths).length === 0) return null;

    let sum = 0;
    // Frozen cols (chevron, checkbox, action): non hanno `data-field` e non
    // sono persistite. Misuriamo le widths REALI dal DOM (offsetWidth) invece
    // di hardcodare 33/50/64, perche' la realta' varia per tema/config (es.
    // checkbox e' 33px in alcuni temi, 50px in altri). Hardcodare in eccesso
    // (es. somma frozen = 147 vs reale 130 = +17px surplus) fa allargare
    // `<table style.width>` di 17px in piu' del necessario → con `table-layout:
    // auto` il browser scarica quel surplus shrinkando la col con piu' "slack"
    // (tipicamente Location, content "Lat: ... Long: ..." piu' stretto della
    // sua width persistita) → al refresh la col risulta piu' stretta del valore
    // saved nonostante il match esatto sulle altre.
    const host = this.elementRef?.nativeElement as HTMLElement | undefined;
    const frozenThs = host?.querySelectorAll('thead tr:first-child th.p-datatable-frozen-column');
    if (frozenThs && frozenThs.length > 0) {
      frozenThs.forEach((th) => {
        sum += Number((th as HTMLElement).getBoundingClientRect().width) || 0;
      });
    } else {
      // Fallback al primo render quando il DOM non e' ancora montato:
      // valori approssimati che verranno corretti al successivo CD cycle
      // (getTableStyle e' chiamato ripetutamente da Angular binding).
      const tm: any = this.metaInfo?.tableMetadata;
      if (tm?.md_nested_grid_routes) sum += 33;
      if (tm?.md_multiple_selection) sum += 33;
      const actionVisible = tm?.md_editable || tm?.md_deletable || tm?.md_detail_action || tm?.md_clonable || tm?.md_inline_edit;
      if (actionVisible) sum += 64;
    }

    // Data cols: somma le widths delle colonne visibili (escluse hidden),
    // usando persisted width se disponibile, altrimenti un fallback ragionevole.
    const visibleCols = (this.cols || []).filter((c: any) => !c?.hidden);
    for (const c of visibleCols) {
      const persisted = Number(routeWidths[c?.field]);
      if (Number.isFinite(persisted) && persisted > 0) {
        sum += persisted;
      } else {
        sum += Number(c?.width) > 0 ? Number(c.width) : 100;
      }
    }

    if (sum <= 0) return null;
    const px = `${Math.ceil(sum)}px`;
    // Settiamo SOLO `min-width` sul `<table>` (NON `width`).
    //
    // Why solo min-width:
    //  - Durante il drag PrimeNG (`columnResizeMode="expand"`) modifica
    //    `<table style.width>` inline per espandere il table. Se settiamo
    //    `width` via `[tableStyle]`, Angular CD cycle dopo il drag scrive
    //    di nuovo il valore computato → conflitto + comportamento rotto
    //    (delta del drag spalmato proporzionalmente su tutte le cols).
    //  - `min-width` non entra in conflitto: PrimeNG setta `width`,
    //    Angular setta `min-width`. Il browser usa il maggiore.
    //  - A refresh, senza un `width` esplicito, il browser sceglie:
    //    `max(content-width, min-width)`. Con min-width = sum desiderato,
    //    il table sara' >= sum → scrollbar visibile, layout preservato.
    //  - `table-layout: auto` resta default → nessun conflitto col drag.
    return { 'min-width': px };
  }

  /**
   * Restituisce le classi della p-table includendo il profilo inline-cell-editing.
   */
  getTableStyleClass(): string {
    const classes: string[] = [];
    if (this.width_defined) {
      classes.push(this.width_defined);
    }
    if (this.isInlineEditEnabled()) {
      classes.push('wuic-inline-editing');
    }
    if (this.isInlineCellEditingEnabled()) {
      classes.push('wuic-inline-cell-editing');
    }
    if (this.isNestedGridInstance()) {
      classes.push('wuic-nested-grid');
    }
    return classes.join(' ').trim();
  }

  private isNestedGridInstance(): boolean {
    return !!this.datasource?.value?.parentRecord;
  }

  private isInlineEditEnabled(): boolean {
    return !!this.metaInfo?.tableMetadata?.md_inline_edit;
  }

  /**
   * Gestisce la logica operativa di `subscribeToDS` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `subscribeToDS` e restituito al chiamante.
   */
  subscribeToDS() {
    if (!this.datasource?.value?.fetchInfo$?.subscribe) {
      return;
    }

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = this.datasource.value.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = String(this.datasource?.value?.route?.value || this.routeName || '').trim().toLowerCase();
      const payloadRoute = String(info?.metaInfo?.tableMetadata?.md_route_name || '').trim().toLowerCase();
      const routeMatches = !info || !payloadRoute || !dataSourceRoute || dataSourceRoute === payloadRoute;
      if (info && routeMatches) {
        if (this.suppressNextInlineFetchInfoRebind && this.isInlineCellEditingEnabled()) {
          this.suppressNextInlineFetchInfoRebind = false;
          return;
        }

        this.records = this.parseData(info.resultInfo.dato);
        this.inlineGridRuntimeFieldCacheByKey = {};
        this.selectedItems = [];
        this.datasource?.value?.clearSelectedRows?.();
        this.metas = info.metaInfo.columnMetadata;
        this.metaInfo = info.metaInfo;
        if (this.isInlineCellEditingEnabled() && this.metaInfo?.tableMetadata) {
          this.metaInfo.tableMetadata.md_inline_edit = true;
        }
        // Bug fix saved-state-restore: durante `applySelectedGridState` i `cols`
        // sono gia' stati ricostruiti (linea 5738) con il `persistedColumnLayoutByRoute`
        // aggiornato (frozen + widths + order). Riapplicare `parseColumns` qui dentro
        // la subscribe a `fetchInfo$` triggera un SECONDO rebuild dello split
        // frozen/scrollable di PrimeNG p-table sulla stessa CD pass dell'arrivo
        // dei records → il rebuild distrugge il bind del rowTemplate
        // (`*ngComponentOutlet` con inputs dinamici) e le celle restano vuote.
        // Sintomo utente: "applica width e frozen e poi le celle scompaiono"
        // — il primo render era OK, il secondo svuotava. Skippiamo solo durante
        // `applyingSavedState`, mantenendo il comportamento per fetch standalone
        // (refresh, filter apply, sort, ecc.) che NON passano da applySelectedGridState.
        if (!this.applyingSavedState) {
          this.cols = this.parseColumns(info.metaInfo.columnMetadata);
        }
        // Riapplica la persisted table.width dopo data refresh (cols.width
        // appena ricaricate da parseColumns).
        this.scheduleApplyPersistedTableWidth();
        void this.loadReportList();
        void this.rebuildTableActionMenuItems();
        this.pageSize = this.datasource?.value?.pageSize || this.metaInfo?.tableMetadata?.md_pagesize || this.pageSize || 10;
        this.pageIndex = this.datasource?.value?.currentPage || this.pageIndex || 1;
        this.rowNumber = Math.max(0, (this.pageIndex - 1) * (this.pageSize || 0));
        const currentSort = this.datasource?.value?.sortInfo?.[0];
        this.orderColumn = currentSort?.field || '';
        this.orderDir = currentSort?.dir || 'asc';

        if (this.datasource?.value?.cursorMode) {
          const cursorRows = Array.isArray(info.resultInfo?.dato) ? info.resultInfo.dato.length : 0;
          const hasNext = !!this.datasource?.value?.nextPageCursor;
          // PrimeNG paginator needs a finite totalRecords to enable/disable next.
          // In cursor mode we expose a synthetic total: current window + sentinel row for next page.
          this.totalRecords = this.rowNumber + cursorRows + (hasNext ? 1 : 0);
        } else {
          this.totalRecords = Number(info.resultInfo?.totalRowCount ?? 0) < 0
            ? (Array.isArray(info.resultInfo?.dato) ? info.resultInfo.dato.length : 0)
            : Number(info.resultInfo?.totalRowCount || 0);
        }
        this.aggregates = info.resultInfo.Agg || [];

        let title = this.metaInfo.tableMetadata.md_display_string;

        this.titleService.setTitle(title);

        this.globalFilterFields = this.metas.filter((col: MetadatiColonna) => {
          return col.mc_show_in_filters;
        }).map((col: MetadatiColonna) => {
          return col.mc_nome_colonna;
        });

        this.compileGridRowTemplate();

        // Mobile card compile removed 2026-04-23: il mobile usa lo stesso
        // `rowTemplate` del desktop ma con template string diverso (card layout
        // in un singolo <td colspan>). Vedi `getEffectiveGridRowTemplate` +
        // `buildMobileCardAsRowTemplate`. `DynamicCardTemplateComponent` resta
        // nella lib come API pubblica per host che vogliono usarlo direttamente,
        // ma list-grid non lo usa piu'.

        this.applyInlineCellEditingStateToRows();
        this.actionButtonsPreLimitBeforeContainerReady = this.shouldPreLimitActionButtonsBeforeContainerReady();
        this.syncTableFilterUiFromDatasource();
        this.syncSelectedSavedStateWithDatasourceCurrentState();
        this.tryAutoApplyPreferredStateForCurrentRoute();

        this.cd.detectChanges();
        this.scheduleActionButtonsVisibleRangeSync();
        this.removeEmptyColumnFilterOverlays();
        setTimeout(() => this.removeEmptyColumnFilterOverlays(), 0);
        setTimeout(() => this.removeEmptyColumnFilterOverlays(), 180);
        setTimeout(() => {
          this.onAfterRender.emit({
            rows: this.records || [],
            totalRecords: Number(this.totalRecords || 0),
            metaInfo: this.metaInfo,
            datasource: this.datasource?.value
          });
        }, 0);
      }
    });
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare chiavi, campi e comportamento runtime.
   * @param metaInfo Metadati del contesto corrente usati per guidare filtri, mapping e comportamento runtime.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  /**
   * Compila il `rowTemplate` corrente in base a `metaInfo` e al viewport mobile/desktop
   * live (`deviceAwareness.isMobile`). Aggiorna anche il flag `gridLayoutIsMobile` che
   * pilota la classe CSS `wuic-list-grid-mobile` (nasconde thead/footer/paginator e rompe
   * la semantica table). Estratto in metodo dedicato per poter essere richiamato anche
   * dalla subscription `isMobile$` in `ngOnInit` quando il viewport attraversa la soglia.
   */
  private compileGridRowTemplate(): void {
    if (!this.metaInfo?.tableMetadata) {
      return;
    }
    const isMobile = !!this.deviceAwareness?.isMobile;
    const template = this.getEffectiveGridRowTemplate(this.metaInfo);
    const route = String(this.metaInfo?.tableMetadata?.md_route_name || '');
    let component: any;
    try {
      component = DynamicRowTemplateComponent.getComponentFromTemplate(template || '', route);
    } catch (err) {
      console.error('Grid row template compile failed. Falling back to default template.', err);
      component = DynamicRowTemplateComponent.getComponentFromTemplate(this.buildDefaultGridRowTemplateWithColumnTemplates(this.metaInfo?.columnMetadata || []), route);
    }
    this.rowTemplate = component;
    this.gridLayoutIsMobile = isMobile;
  }

  private getEffectiveGridRowTemplate(metaInfo: MetaInfo): string {
    // Mobile: il row template emette una singola <td colspan="N"> con layout
    // card-style. Questo unifica desktop+mobile sotto lo stesso p-table + JIT
    // compile pipeline del row subclass (gia' testato e funzionante). Elimina
    // il code path separato `mobileCardComponent + *ngComponentOutlet inputs`
    // che soffriva di un bug di propagation inputs su subclass compilati JIT.
    if (this.deviceAwareness?.isMobile) {
      return this.buildMobileCardAsRowTemplate(metaInfo?.columnMetadata || []);
    }

    const customRowTemplate = String(metaInfo?.tableMetadata?.md_rowTemplate || '').trim();
    if (customRowTemplate) {
      return customRowTemplate;
    }

    const hostOverriddenTemplate = this.getHostOverriddenGridRowTemplate();
    if (hostOverriddenTemplate) {
      return hostOverriddenTemplate;
    }

    return this.buildDefaultGridRowTemplateWithColumnTemplates(metaInfo?.columnMetadata || []);
  }

  /**
   * Costruisce il row template per mobile: UNA sola <td colspan="N"> contenente
   * il card layout (label/value per colonna + action button). Il row subclass
   * resta compilato dallo stesso `DynamicRowTemplateComponent.
   * getComponentFromTemplate` usato in desktop (selector 'tr'), solo il template
   * string cambia.
   *
   * `colspan` = numero totale di colonne del grid desktop, cosi' la <td> occupa
   * tutta la larghezza della row. Il CSS `@media (max-width: 768px)` nel
   * list-grid.component.scss setta `display: block` su <tr> / <td.wuic-mobile-
   * card-cell> liberando dalla semantica table.
   */
  private buildMobileCardAsRowTemplate(columns: MetadatiColonna[]): string {
    const customCases = this.buildGridColumnTemplateSwitchCases(columns);
    // Colspan: somma tutte le colonne potenzialmente attive + frozen prefix
    // (chevron/checkbox/action). Sovra-stimiamo con 99 — l'<td> ha
    // `display: block` in mobile, non conta la table layout.
    return `
        <td colspan="99" class="wuic-mobile-card-cell">
          <div class="wuic-mobile-card-actions" *ngIf="metaInfo.tableMetadata.md_editable || metaInfo.tableMetadata.md_deletable || metaInfo.tableMetadata.md_detail_action || metaInfo.tableMetadata.md_clonable">
            <wuic-data-action-button-lazy *ngIf="(actionButtonRowIsVisible || actionButtonRowIsVisible(rowIndex)) || !isListVirtualizationEnabled()" [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy>
          </div>
          <div class="wuic-mobile-card-body">
            <ng-container *ngFor="let col of columns | visibleFieldList">
              <div class="wuic-mobile-card-row" [ngClass]="getCellClasses(col.metaColumn, rowData)" (click)="onRowSelect($event, rowData)">
                <div class="wuic-mobile-card-label">{{ col.header }}</div>
                <div class="wuic-mobile-card-value">
                  <ng-container [ngSwitch]="col.metaColumn.mc_nome_colonna">
                    ${customCases}
                    <ng-container *ngSwitchDefault>
                      <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color' && !col.metaColumn.mc_logic_allow_navigation" class='list-grid-cell-text-content'>
                        {{ rowData | formatGridViewValue: col.metaColumn }}
                      </span>
                      <a *ngIf="col.metaColumn.mc_logic_allow_navigation" [href]="'#/' + col.metaColumn.mc_ui_lookup_entity_name + '/list/' + col.metaColumn.mc_ui_lookup_dataValueField + '||eq||' + rowData[col.metaColumn.mc_nome_colonna]" [attr.target]="col.metaColumn.mc_logic_navigate_new_window ? '_blank' : null">{{ rowData | formatGridViewValue: col.metaColumn }}</a>
                      <wuic-image-wrapper-lazy *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper-lazy>
                      <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>
                      <div *ngIf="col.metaColumn.mc_ui_column_type == 'color' && rowData[col.field]" class="grid-color-cell" [ngStyle]="{backgroundColor: rowData[col.field]}"></div>
                    </ng-container>
                  </ng-container>
                </div>
              </div>
            </ng-container>
          </div>
        </td>
    `;
  }

  /**
   * Restituisce il template host solo se realmente sovrascritto rispetto al default libreria.
   */
  private getHostOverriddenGridRowTemplate(): string {
    const hostTemplate = String(MetadataProviderService.widgetDefinition?.gridRowTemplate || '').trim();
    if (!hostTemplate) {
      return '';
    }

    const libraryDefaultTemplate = String(MetadataProviderService.defaultGridRowTemplate || '').trim();
    if (hostTemplate === libraryDefaultTemplate) {
      return '';
    }

    return hostTemplate;
  }

  /**
   * Cascata mobile: host `WidgetDefinition.mobileCardTemplate` -> library default.
   * Nessuna lettura da `metaInfo.tableMetadata` (no per-tabella).
   */
  private getEffectiveMobileCardTemplate(metaInfo: MetaInfo): string {
    const hostTemplate = String(MetadataProviderService.widgetDefinition?.mobileCardTemplate || '').trim();
    const libraryDefault = String(MetadataProviderService.defaultMobileCardTemplate || '').trim();
    if (hostTemplate && hostTemplate !== libraryDefault) {
      return hostTemplate;
    }
    return this.buildDefaultMobileCardTemplate(metaInfo?.columnMetadata || []);
  }

  /**
   * Costruisce il template default per la card mobile: una card per record, con
   * `data-action-button` in testa e una riga `label/value` per ogni colonna visibile.
   * Riusa gli stessi switch case dei custom cell template del desktop.
   * Inline editing escluso per scelta (regola: su mobile l'edit apre sempre il form).
   */
  private buildDefaultMobileCardTemplate(columns: MetadatiColonna[]): string {
    const customCases = this.buildGridColumnTemplateSwitchCases(columns);

    return `
        <div class="wuic-mobile-card-actions" *ngIf="metaInfo.tableMetadata.md_editable || metaInfo.tableMetadata.md_deletable || metaInfo.tableMetadata.md_detail_action || metaInfo.tableMetadata.md_clonable">
          <wuic-data-action-button-lazy *ngIf="(actionButtonRowIsVisible || actionButtonRowIsVisible(rowIndex)) || !isListVirtualizationEnabled()" [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy>
        </div>
        <div class="wuic-mobile-card-body">
          <ng-container *ngFor="let col of columns | visibleFieldList">
            <div class="wuic-mobile-card-row" [ngClass]="getCellClasses(col.metaColumn, rowData)" (click)="onRowSelect($event, rowData)">
              <div class="wuic-mobile-card-label">{{ col.header }}</div>
              <div class="wuic-mobile-card-value">
                <ng-container [ngSwitch]="col.metaColumn.mc_nome_colonna">
                  ${customCases}
                  <ng-container *ngSwitchDefault>
                    <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color' && !col.metaColumn.mc_logic_allow_navigation" class='list-grid-cell-text-content'>
                      {{ rowData | formatGridViewValue: col.metaColumn }}
                    </span>

                    <a *ngIf="col.metaColumn.mc_logic_allow_navigation" [href]="'#/' + col.metaColumn.mc_ui_lookup_entity_name + '/list/' + col.metaColumn.mc_ui_lookup_dataValueField + '||eq||' + rowData[col.metaColumn.mc_nome_colonna]" [attr.target]="col.metaColumn.mc_logic_navigate_new_window ? '_blank' : null">{{ rowData | formatGridViewValue: col.metaColumn }}</a>

                    <wuic-image-wrapper-lazy *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper-lazy>

                    <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>

                    <div *ngIf="col.metaColumn.mc_ui_column_type == 'color' && rowData[col.field]" class="grid-color-cell" [ngStyle]="{backgroundColor: rowData[col.field]}"></div>
                  </ng-container>
                </ng-container>
              </div>
            </div>
          </ng-container>
        </div>
    `;
  }

  /**
   * Costruisce una struttura di output a partire dal contesto corrente usando i metadati per determinare chiavi, campi e comportamento runtime.
   * @param columns Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private buildDefaultGridRowTemplateWithColumnTemplates(columns: MetadatiColonna[]): string {
    const customCases = this.buildGridColumnTemplateSwitchCases(columns);

    // 2026-04-25: usa le directive standalone WUIC `wuicFrozenColumn` +
    // `wuicRowToggler` (replicano `pFrozenColumn` + `pRowToggler` di PrimeNG
    // come standalone owned dal framework). Le directive PrimeNG
    // `isStandalone:false` non sono visibili allo scope dei template
    // runtime-compiled via `Compiler.compileModuleAndAllComponentsSync` —
    // vedi commento esteso in `wuic-frozen-column.directive.ts`.
    //
    // wuic-data-action-button-lazy render when in viewport.
    return `
        <td *ngIf="metaInfo.tableMetadata.md_nested_grid_routes" [wuicFrozenColumn]="true" alignFrozen="left">
           <button type="button" class="p-button p-button-text p-button-rounded p-button-sm p-0" [wuicRowToggler]="rowData" [wuicToggleFn]="toggleRow" [wuicTable]="dt" [attr.aria-label]="'${this.trslSrv.instant('list_grid.expand_row') || 'Espandi riga'}'">
             <i class="pi" [ngClass]="{'pi-chevron-down': expanded, 'pi-chevron-right': !expanded }"></i>
           </button>
        </td>
        <td *ngIf="metaInfo.tableMetadata.md_multiple_selection" class="wuic-selection-td" [wuicFrozenColumn]="true" alignFrozen="left">
         <input class="p-checkbox-box" type="checkbox" (click)="rowSelect(rowData, $event, dt)" [checked]="dt.selection | isSelectedRow : rowData : metaInfo" [attr.aria-label]="'${this.trslSrv.instant('list_grid.select_row') || 'Seleziona riga'}'" />
        </td>
        <td *ngIf="metaInfo.tableMetadata.md_editable || metaInfo.tableMetadata.md_deletable || metaInfo.tableMetadata.md_detail_action || metaInfo.tableMetadata.md_clonable || metaInfo.tableMetadata.md_inline_edit" class="wuic-action-cell" [wuicFrozenColumn]="true" alignFrozen="left">
            <ng-container >
            <wuic-data-action-button-lazy *ngIf="(actionButtonRowIsVisible || actionButtonRowIsVisible(rowIndex)) || !isListVirtualizationEnabled()" [data]="rowData" [metaInfo]="metaInfo" [datasource]="datasource"></wuic-data-action-button-lazy>
            </ng-container>
        </td>
        <ng-container *ngFor="let col of columns | visibleFieldList">
          <td *ngIf="!col?.frozen" [ngClass]="getCellClasses(col.metaColumn, rowData)" (click)="onRowSelect($event, rowData)" (focusout)="onCellFocusOut($event, rowData, col.metaColumn)">
            <wuic-field-editor-lazy *ngIf="rowData.__is_editing && !col.metaColumn.mc_hide_in_edit" [record]="rowData.__observable" [field]="getRuntimeGridFieldMeta(col.metaColumn, rowData)" [metaInfo]="metaInfo" [datasource]="datasource" [hideLabel]="metaInfo.tableMetadata.md_inline_edit" [onInlineCellValueChange]="onInlineCellEditorValueChange"></wuic-field-editor-lazy>
            <ng-container *ngIf="!rowData.__is_editing">
              <ng-container [ngSwitch]="col.metaColumn.mc_nome_colonna">
                ${customCases}
                <ng-container *ngSwitchDefault>
                  <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color' && !col.metaColumn.mc_logic_allow_navigation" class='list-grid-cell-text-content'>
                    {{ rowData | formatGridViewValue: col.metaColumn }}
                  </span>

                  <a *ngIf="col.metaColumn.mc_logic_allow_navigation" [href]="'#/' + col.metaColumn.mc_ui_lookup_entity_name + '/list/' + col.metaColumn.mc_ui_lookup_dataValueField + '||eq||' + rowData[col.metaColumn.mc_nome_colonna]" [attr.target]="col.metaColumn.mc_logic_navigate_new_window ? '_blank' : null">{{ rowData | formatGridViewValue: col.metaColumn }}</a>

                  <wuic-image-wrapper-lazy *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper-lazy>

                  <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>

                  <div *ngIf="col.metaColumn.mc_ui_column_type == 'color' && rowData[col.field]" class="grid-color-cell" [ngStyle]="{backgroundColor: rowData[col.field]}"></div>
                </ng-container>
              </ng-container>
            </ng-container>
          </td>
          <td *ngIf="col?.frozen" [wuicFrozenColumn]="true" [alignFrozen]="col?.alignFrozen || 'left'" [ngClass]="getCellClasses(col.metaColumn, rowData)" (click)="onRowSelect($event, rowData)" (focusout)="onCellFocusOut($event, rowData, col.metaColumn)">
            <wuic-field-editor-lazy *ngIf="rowData.__is_editing && !col.metaColumn.mc_hide_in_edit" [record]="rowData.__observable" [field]="getRuntimeGridFieldMeta(col.metaColumn, rowData)" [metaInfo]="metaInfo" [datasource]="datasource" [hideLabel]="metaInfo.tableMetadata.md_inline_edit" [onInlineCellValueChange]="onInlineCellEditorValueChange"></wuic-field-editor-lazy>
            <ng-container *ngIf="!rowData.__is_editing">
              <ng-container [ngSwitch]="col.metaColumn.mc_nome_colonna">
                ${customCases}
                <ng-container *ngSwitchDefault>
                  <span *ngIf="col.metaColumn.mc_ui_column_type != 'upload' && col.metaColumn.mc_ui_column_type != 'color' && !col.metaColumn.mc_logic_allow_navigation" class='list-grid-cell-text-content'>
                    {{ rowData | formatGridViewValue: col.metaColumn }}
                  </span>

                  <a *ngIf="col.metaColumn.mc_logic_allow_navigation" [href]="'#/' + col.metaColumn.mc_ui_lookup_entity_name + '/list/' + col.metaColumn.mc_ui_lookup_dataValueField + '||eq||' + rowData[col.metaColumn.mc_nome_colonna]" [attr.target]="col.metaColumn.mc_logic_navigate_new_window ? '_blank' : null">{{ rowData | formatGridViewValue: col.metaColumn }}</a>

                  <wuic-image-wrapper-lazy *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && col.metaColumn.isImageUpload" [preview]="true" [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" [alt]="rowData[col.field]" [previewImageSrc]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" [alt]="rowData[col.field]" [width]="col.metaColumn.thumbWidth ? col.metaColumn.thumbWidth : 50" [height]="col.metaColumn.thumbHeight ? col.metaColumn.thumbHeight : 50"></wuic-image-wrapper-lazy>

                  <a *ngIf="col.metaColumn.mc_ui_column_type == 'upload' && rowData[col.field] && !col.metaColumn.isImageUpload" [href]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData" target="_blank"><img [src]="rowData[col.field] | getSrcUploadPreview : col.metaColumn : metaInfo : rowData : true" height="50" width="50" /></a>

                  <div *ngIf="col.metaColumn.mc_ui_column_type == 'color' && rowData[col.field]" class="grid-color-cell" [ngStyle]="{backgroundColor: rowData[col.field]}"></div>
                </ng-container>
              </ng-container>
            </ng-container>
          </td>
        </ng-container>
    `;
  }

  /**
   * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
   * @param columns Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private buildGridColumnTemplateSwitchCases(columns: MetadatiColonna[]): string {
    const cases = (columns || [])
      .filter((c) => c && String(c.mc_ui_grid_column_data_template || '').trim() !== '' && String(c.mc_nome_colonna || '').trim() !== '')
      .filter((c) => this.isAngularCellMarkupTemplate(String(c.mc_ui_grid_column_data_template || '')))
      .map((c) => {
        const fieldName = String(c.mc_nome_colonna || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const template = this.normalizeGridCellTemplate(String(c.mc_ui_grid_column_data_template || ''));
        if (!template) {
          return '';
        }
        return `<ng-container *ngSwitchCase="'${fieldName}'">${template}</ng-container>`;
      })
      .filter((x) => !!x);

    return cases.join('\n');
  }

  /**
   * Verifica una condizione di stato o di validita orchestrando le chiamate `trim` e `String`.
   * @param template Valore testuale usato come chiave, nome campo, criterio o frammento di configurazione.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
  private isAngularCellMarkupTemplate(template: string): boolean {
    const normalized = String(template || '').trim();
    if (!normalized) {
      return false;
    }

    if (/^#=\s*[\s\S]*\s*#$/.test(normalized)) {
      return false;
    }

    return normalized.includes('<') || normalized.includes('{{');
  }

  /**
   * Trasforma i dati in una forma coerente con il rendering o con il payload richiesto orchestrando le chiamate `trim` e `String`.
   * @param template Valore testuale usato come chiave, nome campo, criterio o frammento di configurazione.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private normalizeGridCellTemplate(template: string): string {
    let normalized = String(template || '').trim();
    if (!normalized) {
      return '';
    }

    // Cell template metadata should contain only inner cell markup.
    // Remove accidental table wrappers that would break the generated row structure.
    normalized = normalized.replace(/^<tr[^>]*>/i, '').replace(/<\/tr>$/i, '').trim();
    normalized = normalized.replace(/^<td[^>]*>/i, '').replace(/<\/td>$/i, '').trim();

    // Backwards-compatibility alias: rewrite `record` → `rowData` so authors
    // can use EITHER placeholder in `mc_ui_grid_column_data_template` and the
    // result is the same at runtime. The doc page (docs/pages/templating.md)
    // historically documented `{{record.X}}` as the binding form, but the
    // actual scope where the template is compiled exposes `let-rowData`
    // (PrimeNG <p-table> body template at list-grid.component.html line 227).
    // Without this rewrite, every template using the documented `record.*`
    // syntax silently renders empty because Angular cannot resolve `record`
    // and strips the surrounding text node content.
    //
    // Replacement rules (intentionally narrow to avoid touching unrelated
    // identifiers and string literals):
    //   - Match `record` as a standalone identifier (`\b` after).
    //   - Do NOT match when preceded by `.`, `_`, `$` or another word
    //     character — that would corrupt member access like
    //     `someObject.record` or property names like `myrecord`.
    //   - Do NOT match when preceded by a quote character (`'` or `"`) —
    //     that's a JS string literal and the word "record" inside it
    //     should stay literal.
    //
    // This means BOTH of the following templates render identically:
    //   <span class='badge'>{{record.status}}</span>
    //   <span class='badge'>{{rowData.status}}</span>
    // And these are correctly left alone:
    //   <span>{{ row.recordType }}</span>          // member access — not record itself
    //   <span>{{ status === 'record' ? 'A' : 'B' }}</span>  // string literal
    normalized = normalized.replace(/(^|[^.\w$"'])record\b/g, '$1rowData');

    return normalized;
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncTableFilterUiFromDatasource` trasformando e filtrando collezioni dati.
   */
  private syncTableFilterUiFromDatasource() {
    if (!this.table) {
      return;
    }

    const nextFilters: any = {};
    const filters = this.datasource?.value?.filterInfo?.filters || [];

    filters
      .filter(f => f && typeof f.field === 'string' && f.value !== null && f.value !== undefined && f.value !== '')
      .forEach((f) => {
        nextFilters[f.field] = [{
          value: f.value,
          matchMode: 'in'
        }];
      });

    this.table.filters = nextFilters;
  }

  /**
   * Allinea il sort visuale della p-table con `datasource.sortInfo`, inclusa la rimozione esplicita del descriptor.
   */
  private syncTableSortUiFromDatasource(): void {
    const sortInfo = this.datasource?.value?.sortInfo;
    const currentSort = Array.isArray(sortInfo) && sortInfo.length ? sortInfo[0] : null;
    const field = String(currentSort?.field || '').trim();
    const isDesc = String(currentSort?.dir || '').toLowerCase() === 'desc';
    const order = field ? (isDesc ? -1 : 1) : 0;

    this.orderColumn = field;
    this.orderDir = isDesc ? 'desc' : 'asc';

    if (!this.table) {
      return;
    }

    (this.table as any).sortField = field || null;
    (this.table as any).sortOrder = order;
    if ((this.table as any).multiSortMeta) {
      (this.table as any).multiSortMeta = field ? [{ field, order }] : [];
    }

    // PrimeNG sort icons are driven by tableService.onSort events.
    // Keep header descriptor in sync also when sort is cleared by saved state switch.
    const tableService = (this.table as any)?.tableService;
    if (tableService?.onSort) {
      tableService.onSort(field ? { field, order } : null);
    }
  }

  /**
   * Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
   * @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
   */
  parseData(data: any) {
    if (!Array.isArray(data)) {
      return data;
    }

    const parsedRows: any[] = [];
    data.forEach((row: any, rowIndex: number) => {
      const beforeEvent: ListGridBeforeRowRenderEvent = {
        row,
        rowIndex,
        cancel: false,
        cancelRender: () => {
          beforeEvent.cancel = true;
        }
      };

      this.onBeforeRowRender.emit(beforeEvent);
      if (beforeEvent.cancel) {
        return;
      }

      parsedRows.push(beforeEvent.row);
      this.onAfterRowRender.emit({
        row: beforeEvent.row,
        rowIndex
      });
    });

    return parsedRows;
  }

  /**
   * Ricalcola lo stato `_disabled` delle azioni tabella valutando i callback di disabilitazione contro `resultInfo.current` e il contesto UI corrente.
   */
  reEvaluateActionEnabledStates() {
    const actions = (this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles || []) as MetadatiCustomActionTabella[];
    this.tableActionMenuItems.forEach((action) => {
      let correspondingMetaAction: MetadatiCustomActionTabella = actions.find(a => a.Id === action['_id']);
      if (!correspondingMetaAction) {
        return;
      }

      action.disabled = typeof correspondingMetaAction?.disable_callback__fn === 'function' ? correspondingMetaAction.disable_callback__fn(this.datasource?.value, this.metaInfo, this.datasource?.value?.resultInfo?.current, WtoolboxService) : false;

      console.log(action.disabled);
    });
  }

  /**
   * Ricostruisce il menu azioni tabella includendo solo le voci autorizzate/visibili e riallineando caption, stato disabled e comandi eseguibili.
   */
  private async rebuildTableActionMenuItems(): Promise<void> {
    const actions = (this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles || []) as MetadatiCustomActionTabella[];
    if (!actions.length) {
      this.tableActionMenuItems = [];
      return;
    }

    const ds = this.datasource?.value;
    const record = ds?.resultInfo?.current;

    this.tableActionMenuItems = actions.map((action) => ({
      _id: action.Id,
      label: action.button_caption || 'Action',
      icon: action.button_image || undefined,
      disabled: false,
      command: async (event) => {
        try {
          await Promise.resolve(action.action_callback__fn(ds, this.metaInfo, record, event, WtoolboxService));
        } catch (err) {
          WtoolboxService.errorHandler.handleError(err);
        }
      }
    }));
  }

  /**
   * Gestisce la logica operativa di `onColumnHeaderContextMenu` in modo coerente con l'implementazione corrente.
   * @param event Evento che innesca il comportamento del metodo.
   * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param menu Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  onColumnHeaderContextMenu(event: MouseEvent, col: any, menu: ContextMenu) {
    event.preventDefault();
    event.stopPropagation();

    const metaColumn = col?.metaColumn as MetadatiColonna;
    if (!metaColumn?.mc_nome_colonna) {
      return;
    }

    this.selectedColumnForContextMenu = metaColumn;
    const items: MenuItem[] = [
      {
        label: this.trslSrv.instant('list_grid.column_context.pin_left') || 'Pin left',
        icon: 'pi pi-angle-double-left',
        disabled: !this.canPinLeft(col),
        command: () => {
          if (!this.canPinLeft(col)) return;
          void this.pinColumnFromContextMenu(col, 'left');
        }
      },
      {
        label: this.trslSrv.instant('list_grid.column_context.pin_right') || 'Pin right',
        icon: 'pi pi-angle-double-right',
        disabled: !this.canPinRight(col),
        command: () => {
          if (!this.canPinRight(col)) return;
          void this.pinColumnFromContextMenu(col, 'right');
        }
      },
      {
        label: this.trslSrv.instant('list_grid.column_context.unpin') || 'Unpin',
        icon: 'pi pi-times',
        command: () => {
          void this.unpinColumnFromContextMenu(col);
        }
      },
      {
        label: this.trslSrv.instant('list_grid.column_context.unpin_all') || 'Unpin all',
        icon: 'pi pi-times-circle',
        command: () => {
          void this.unpinAllColumnsFromContextMenu();
        }
      }
    ];

    if (this.userInfo.isCurrentUserAdmin() && !!metaColumn?.mc_id) {
      items.push(
        { separator: true },
        {
          label: this.trslSrv.instant('list_grid.column_context.open_metadata'),
          icon: 'pi pi-external-link',
          command: () => {
            void this.openColumnMetadataEditor(metaColumn);
          }
        },
        {
          label: this.trslSrv.instant('list_grid.column_context.hide_column'),
          icon: 'pi pi-eye-slash',
          command: () => {
            void this.hideColumnByMetadata(metaColumn);
          }
        },
        {
          label: this.trslSrv.instant('list_grid.column_context.edit_texts'),
          icon: 'pi pi-pencil',
          command: () => {
            void this.editColumnDisplayStrings(metaColumn);
          }
        }
      );
    }

    this.columnContextMenuItems = items;

    menu.show(event);
  }

  /**
   * Determina se la colonna `col` puo' essere pinned a sinistra. Regola
   * simmetrica a `canPinRight`: pin-left e' consentito SOLO se la colonna
   * e' la prima visibile, oppure tutte le colonne visibili prima di essa
   * sono gia' pinned left.
   *
   * Why: pin-left sticky CSS funziona correttamente solo per colonne in
   * testa: una colonna pinned-left con altre col non-pinned prima crea un
   * gap visivo e disallinea il sticky offset (style.left viene calcolato
   * sommando le sibling precedenti, ma quelle non-pinned scrollano →
   * la cella pinned salta di posizione durante scroll orizzontale).
   *
   * Se la colonna e' gia' pinned a sinistra, ritorna `false` (l'azione
   * "Pin left" sarebbe no-op — usare "Unpin" invece).
   */
  canPinLeft(col: any): boolean {
    if (!col || !Array.isArray(this.cols) || !this.cols.length) return false;
    const isAlreadyLeft = String(col?.pinSide || '').toLowerCase() === 'left'
      || (col?.frozen && String(col?.alignFrozen || '').toLowerCase() === 'left');
    if (isAlreadyLeft) return false;

    const visibleCols = this.cols.filter((c: any) => !c?.hidden);
    const idx = visibleCols.findIndex((c: any) => c === col || String(c?.field || '') === String(col?.field || ''));
    if (idx < 0) return false;
    if (idx === 0) return true; // prima visibile → ok

    // Tutte le precedenti devono essere gia' pinned-left
    for (let i = 0; i < idx; i++) {
      const prev = visibleCols[i];
      const prevIsLeft = String(prev?.pinSide || '').toLowerCase() === 'left'
        || (prev?.frozen && String(prev?.alignFrozen || '').toLowerCase() === 'left');
      if (!prevIsLeft) return false;
    }
    return true;
  }

  /**
   * Determina se la colonna `col` puo' essere pinned a destra. Regola:
   * il pin-right e' consentito SOLO se la colonna e' l'ultima visibile,
   * oppure tutte le colonne visibili dopo di essa sono gia' pinned right.
   *
   * Why: pin-right sticky CSS funziona correttamente solo per colonne in
   * coda: una colonna pinned-right con altre col non-pinned dopo crea un
   * gap visivo e disallinea il sticky offset (style.right viene calcolato
   * sommando le sibling successive, ma quelle non-pinned scrollano →
   * la cella pinned salta di posizione durante scroll orizzontale).
   *
   * Se la colonna e' gia' pinned a destra, ritorna `false` (l'azione
   * "Pin right" sarebbe no-op — usare "Unpin" invece).
   */
  canPinRight(col: any): boolean {
    if (!col || !Array.isArray(this.cols) || !this.cols.length) return false;
    const isAlreadyRight = String(col?.pinSide || '').toLowerCase() === 'right'
      || (col?.frozen && String(col?.alignFrozen || '').toLowerCase() === 'right');
    if (isAlreadyRight) return false;

    const visibleCols = this.cols.filter((c: any) => !c?.hidden);
    const idx = visibleCols.findIndex((c: any) => c === col || String(c?.field || '') === String(col?.field || ''));
    if (idx < 0) return false;
    if (idx === visibleCols.length - 1) return true; // ultima visibile → ok

    // Tutte le successive devono essere gia' pinned-right
    for (let i = idx + 1; i < visibleCols.length; i++) {
      const next = visibleCols[i];
      const nextIsRight = String(next?.pinSide || '').toLowerCase() === 'right'
        || (next?.frozen && String(next?.alignFrozen || '').toLowerCase() === 'right');
      if (!nextIsRight) return false;
    }
    return true;
  }

  /**
   * Imposta pin/frozen della colonna nel lato richiesto e persiste il layout utente.
   */
  private async pinColumnFromContextMenu(col: any, side: 'left' | 'right'): Promise<void> {
    const field = String(col?.field || '');
    if (!field || !Array.isArray(this.cols) || !this.cols.length) {
      return;
    }

    this.cols = (this.cols || []).map((c: any) => {
      if (String(c?.field || '') !== field) {
        return c;
      }

      return {
        ...c,
        pinSide: side,
        frozen: true,
        alignFrozen: side === 'right' ? 'right' : 'left'
      };
    });

    this.cd.detectChanges();
    await this.persistCurrentRouteColumnLayoutFromCols();
  }

  /**
   * Rimuove pin/frozen dalla colonna selezionata e persiste il layout utente.
   */
  private async unpinColumnFromContextMenu(col: any): Promise<void> {
    const field = String(col?.field || '');
    if (!field || !Array.isArray(this.cols) || !this.cols.length) {
      return;
    }

    this.cols = (this.cols || []).map((c: any) => {
      if (String(c?.field || '') !== field) {
        return c;
      }

      return {
        ...c,
        pinSide: null,
        frozen: false,
        alignFrozen: 'left'
      };
    });

    this.cd.detectChanges();
    await this.persistCurrentRouteColumnLayoutFromCols();
  }

  /**
   * Rimuove pin/frozen da tutte le colonne e persiste il layout utente.
   */
  private async unpinAllColumnsFromContextMenu(): Promise<void> {
    if (!Array.isArray(this.cols) || !this.cols.length) {
      return;
    }

    this.cols = (this.cols || []).map((c: any) => ({
      ...c,
      pinSide: null,
      frozen: false,
      alignFrozen: undefined
    }));

    this.cd.detectChanges();
    await this.persistCurrentRouteColumnLayoutFromCols();
  }

  /**
   * Gestisce la logica operativa di `ensureMetadataColumnsDatasourceRoute` propagando aggiornamenti sui flussi reattivi usati dalla UI.
   */
  private ensureMetadataColumnsDatasourceRoute(): void {
    const ds = this.metadataColumnsDatasource;
    if (!ds) {
      return;
    }

    const targetRoute = String(ds.hardcodedRoute || ' metadati  colonne');
    if (targetRoute && ds.route?.value !== targetRoute) {
      ds.route.next(targetRoute);
    }
  }

  /**
   * Inizializza (una sola volta) il datasource dedicato alle colonne metadato, caricando schema e configurazione necessari alle operazioni di update metadati.
   */
  private async ensureMetadataColumnsDatasourceSchema(): Promise<void> {
    this.ensureMetadataColumnsDatasourceRoute();
    if (!this.metadataColumnsDatasource?.metaInfo?.tableMetadata) {
      await this.metadataColumnsDatasource.getSchemaAndData(true);
    }
  }

  /**
   * Recupera dal datasource metadati il record colonna corrispondente a `mc_id`, usato per modifiche puntuali alle proprietà della colonna.
   * @param mcId Identificativo `mc_id` della colonna metadato da leggere nel datasource amministrativo.
   * @returns Promise che completa il flusso asincrono restituendo un risultato di tipo `Promise<any | null>`.
   */
  private async fetchMetadataColumnRecord(mcId: number): Promise<any | null> {
    if (!mcId || !this.metadataColumnsDatasource) {
      return null;
    }

    await this.ensureMetadataColumnsDatasourceSchema();

    const ds = this.metadataColumnsDatasource;
    const prevPageSize = ds.pageSize;
    const prevCurrentPage = ds.currentPage;

    ds.filterInfo = {
      logic: 'AND',
      filters: [{ field: 'mc_id', value: String(mcId), operatore: 'eq' }]
    };

    if (ds.filterDescriptor?.['mc_id']) {
      ds.filterDescriptor['mc_id'].next(String(mcId));
    }

    // Avoid missing records because of paging/windowing on metadata routes.
    ds.pageSize = 0;
    ds.currentPage = 1;

    try {
      const payload = await ds.fetchData();
      const rows = payload?.resultInfo?.dato || [];
      return rows.find((x: any) => Number.parseInt(String(x?.mc_id ?? ''), 10) === Number.parseInt(String(mcId), 10)) || null;
    } finally {
      ds.pageSize = prevPageSize;
      ds.currentPage = prevCurrentPage;
    }
  }

  /**
   * Apre il form editor dei metadati colonna per la `mc_id` selezionata e, alla chiusura con salvataggio, ricarica schema/dati della griglia.
   * @param metaColumn Metadato colonna su cui aprire l'editor; la ricerca del record avviene tramite `mc_id`.
   */
  private async openColumnMetadataEditor(metaColumn: MetadatiColonna): Promise<void> {
    const record = await this.fetchMetadataColumnRecord(Number(metaColumn?.mc_id));
    if (!record || !this.metadataColumnsDatasource) {
      return;
    }

    const currentModel = this.metadataColumnsDatasource.getModelFromObservable(record);
    this.metadataColumnsDatasource.setCurrent(currentModel);

    const data = {
      datasource: new BehaviorSubject<DataSourceComponent>(this.metadataColumnsDatasource),
      saveCallback: null,
      isEditForm: true
    };

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data,
      header: this.trslSrv.instant('edit'),
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });

    if (ref) {
      ref.onClose.subscribe(async (result) => {
        if (result) {
          await this.datasource.value.getSchemaAndData();
        }
      });
    }
  }

  /**
   * Imposta `mc_hide_in_list = true` sulla colonna selezionata (risolta via `mc_id`), salva il record metadato e ricarica la griglia per applicare la nuova visibilità.
   * @param metaColumn Metadato colonna selezionato; viene usato `mc_id` per recuperare il record persistito e aggiornare `mc_hide_in_list`.
   */
  private async hideColumnByMetadata(metaColumn: MetadatiColonna): Promise<void> {
    const record = await this.fetchMetadataColumnRecord(Number(metaColumn?.mc_id));
    if (!record || !this.metadataColumnsDatasource) {
      return;
    }

    if (record.mc_hide_in_list === true) {
      return;
    }

    const entity = this.metadataColumnsDatasource.getObservable(record);
    if (entity?.['mc_hide_in_list']) {
      entity['mc_hide_in_list'].next(true);
    }

    await this.metadataColumnsDatasource.syncData(entity, record);
    await this.datasource.value.getSchemaAndData();
  }

  /**
   * Aggiorna i testi di colonna `mc_display_string_in_view` e `mc_display_string_in_edit` tramite prompt, persiste il record metadato e ricarica lo schema.
   * @param metaColumn Metadato colonna selezionato; viene usato `mc_id` per aggiornare `mc_display_string_in_view` e `mc_display_string_in_edit`.
   */
  private async editColumnDisplayStrings(metaColumn: MetadatiColonna): Promise<void> {
    const record = await this.fetchMetadataColumnRecord(Number(metaColumn?.mc_id));
    if (!record || !this.metadataColumnsDatasource) {
      return;
    }

    const promptResult = await WtoolboxService.promptDialog(
      this.trslSrv.instant('list_grid.column_context.edit_texts'),
      [
        {
          name: 'mc_display_string_in_view',
          caption: this.trslSrv.instant('list_grid.column_context.display_in_view'),
          type: 'text',
          required: false,
          value: record.mc_display_string_in_view || ''
        },
        {
          name: 'mc_display_string_in_edit',
          caption: this.trslSrv.instant('list_grid.column_context.display_in_edit'),
          type: 'text',
          required: false,
          value: record.mc_display_string_in_edit || ''
        }
      ],
      '620px',
      '420px'
    );

    if (!promptResult) {
      return;
    }

    const entity = this.metadataColumnsDatasource.getObservable(record);
    const newView = String(promptResult.mc_display_string_in_view?.value ?? '');
    const newEdit = String(promptResult.mc_display_string_in_edit?.value ?? '');

    entity['mc_display_string_in_view']?.next(newView);
    entity['mc_display_string_in_edit']?.next(newEdit);

    await this.metadataColumnsDatasource.syncData(entity, record);
    await this.datasource.value.getSchemaAndData();
  }

  /**
   * Interpreta e normalizza input/configurazione in `parseColumns` per l'utilizzo nel componente.
   * @param columns Collezione in ingresso processata dal metodo.
   * @returns Struttura dati prodotta da `parseColumns` dopo normalizzazione/elaborazione.
   */
  parseColumns(columns: MetadatiColonna[]) {
    this.width_defined = null;
    const routeWidths = this.getCurrentRouteColumnWidths();
    const proportionalColwidth = this.isProportionalColwidthEnabled() && !this.hasPersistedColumnWidths(routeWidths);
    const currentLayout = this.getCurrentRouteColumnLayout();
    const forcedHiddenFields = new Set(
      (columns || [])
        .filter((c: MetadatiColonna) => !!c?.mc_hide_in_list)
        .map((c: MetadatiColonna) => String(c?.mc_nome_colonna || ''))
        .filter((field: string) => !!field)
    );
    const hiddenFields = new Set([...(currentLayout.hidden || []), ...Array.from(forcedHiddenFields)]);
    const pinnedLeftFields = new Set(currentLayout.pinnedLeft || []);
    const pinnedRightFields = new Set(currentLayout.pinnedRight || []);
    const orderedFields = new Set(currentLayout.order || []);
    const baseOrderedColumns = [...(columns || [])].sort((a: MetadatiColonna, b: MetadatiColonna) => {
      const aOrder = Number((a as any)?.mc_sort_order);
      const bOrder = Number((b as any)?.mc_sort_order);
      const aValid = Number.isFinite(aOrder);
      const bValid = Number.isFinite(bOrder);

      if (aValid && bValid) {
        return aOrder - bOrder;
      }
      if (aValid) {
        return -1;
      }
      if (bValid) {
        return 1;
      }
      return 0;
    });

    const mapped = baseOrderedColumns.map((col: MetadatiColonna) => {
      const persistedWidth = routeWidths[col.mc_nome_colonna];
      const metadataWidth = col.mc_ui_grid_size_width?.toString() == '0' ? undefined : col.mc_ui_grid_size_width;
      const width = Number.isFinite(Number(persistedWidth)) && Number(persistedWidth) > 0
        ? Number(persistedWidth)
        : metadataWidth;
      const fieldName = String(col.mc_nome_colonna || '');
      const hasFieldCustomSetting = hiddenFields.has(fieldName) || orderedFields.has(fieldName);
      const hidden = col.mc_ui_column_type === 'button'
        ? true
        : !!col.mc_hide_in_list
          ? true
          : hasFieldCustomSetting
            ? hiddenFields.has(fieldName)
            : false;

      if (width) {
        this.width_defined = 'width_defined';
      }

      return {
        field: fieldName,
        header: col.mc_display_string_in_view,
        metaColumn: col,
        width: width,
        widthPercent: undefined,
        hidden: hidden,
        pinSide: pinnedRightFields.has(fieldName)
          ? 'right'
          : pinnedLeftFields.has(fieldName)
            ? 'left'
            : null,
        frozen: pinnedLeftFields.has(fieldName) || pinnedRightFields.has(fieldName),
        alignFrozen: pinnedRightFields.has(fieldName)
          ? 'right'
          : pinnedLeftFields.has(fieldName)
            ? 'left'
            : undefined
      };
    });

    if (proportionalColwidth) {
      const visibleColumns = mapped.filter((c: any) => !c.hidden);
      const normalizedWeights = visibleColumns.map((column: any) => {
        const rawWeight = Number(column?.width ?? 100);
        return Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 100;
      });
      const totalWeight = normalizedWeights.reduce((acc, current) => acc + current, 0);

      visibleColumns.forEach((column: any, index: number) => {
        const columnWeight = normalizedWeights[index];
        const percentageWidth = totalWeight > 0
          ? Number(((columnWeight / totalWeight) * 100).toFixed(4))
          : undefined;
        column.widthPercent = percentageWidth;
      });

      if (visibleColumns.some((c: any) => Number(c?.widthPercent) > 0)) {
        this.width_defined = 'width_defined';
      }
    }

    return this.applyPersistedColumnOrder(mapped, this.getCurrentRouteColumnLayout().order || []);
  }

  /**
   * Gestisce la logica di `onColumnResize` orchestrando le chiamate `captureResizedColumnWidth` e `detectChanges`.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  async onColumnResize(event: any) {
    this.onPTableColumnResize.emit(event);
    const resizedField = this.getFieldFromResizeEvent(event);
    const routeKey = this.getRouteKey(this.routeName);
    if (routeKey) {
      this.manualResizeDisablesProportionalByRoute[routeKey] = true;
    }

    this.captureResizedColumnWidth(event);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    if (resizedField) {
      this.captureColumnWidthFromTableDomByField(resizedField);
    }
    this.cols = (this.cols || []).map((c: any) => ({
      ...c,
      widthPercent: undefined
    }));
    this.width_defined = 'width_defined';
    this.cd.detectChanges();

    // POST-CD capture: dopo detectChanges il browser ha applicato le nuove
    // `<col style.width>`/`<th style.width>` e fatto layout. Re-misuriamo
    // tutte le sibling widths + la table.style.width finale dal DOM e li
    // sovrascriviamo nel persisted state. Questo garantisce che i valori
    // saved == valori che il browser ha effettivamente disegnato → al
    // refresh, applicando gli stessi valori, si riproduce pixel-perfect
    // lo stesso visual state.
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    this.captureAllSiblingsAndTableWidthFromDom(resizedField);

    await this.persistCurrentRouteColumnWidths();
  }

  /**
   * Re-misura POST-CD le widths di tutte le data cols + la `<table style.width>`
   * dal DOM e le sovrascrive in `persistedColumnWidthsByRoute[routeKey]`.
   *
   * Why post-CD: durante l'evento `onColResize` PrimeNG fa il drag e setta
   * inline `<table style.width>` + `<th style.width>` solo per la colonna
   * trascinata. L'Angular CD successiva riapplica via binding `<col style.width>`
   * e `<th style.width>` da `cols[i].width`. Solo dopo CD + paint il browser
   * ha distribuito definitivamente le widths. Misurando qui catturiamo
   * il visual state finale, NON quello transitorio durante l'evento.
   */
  private captureAllSiblingsAndTableWidthFromDom(resizedField: string): void {
    const routeKey = this.getRouteKey(this.routeName);
    if (!routeKey) return;
    const widths: { [field: string]: number } = { ...this.getCurrentRouteColumnWidths() };

    const host = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (host) {
      const headers = host.querySelectorAll('thead th[data-field]');
      headers.forEach((th) => {
        const field = (th as HTMLElement).getAttribute('data-field');
        if (!field || field === resizedField) return;
        const w = Number((th as HTMLElement).getBoundingClientRect().width.toFixed(2));
        if (Number.isFinite(w) && w > 0) {
          widths[field] = w;
        }
      });
    }

    const tableEl = (this.table as any)?.tableViewChild?.nativeElement as HTMLElement | undefined;
    const tableW = tableEl ? Number(tableEl.getBoundingClientRect().width.toFixed(2)) : 0;
    if (Number.isFinite(tableW) && tableW > 0) {
      widths['__tableWidth'] = tableW;
    }

    this.persistedColumnWidthsByRoute[routeKey] = widths;
  }

  /**
   * Rigenera il menu "Salva stato" con azioni contestuali sullo stato selezionato.
   */
  onSaveStateMenuToggle(event: Event, saveStateMenu: { toggle: (e: Event) => void }): void {
    // Ricostruiamo le label ad ogni apertura: `instant()` e' uno snapshot,
    // quindi un cambio lingua avvenuto dopo il primo refresh non si
    // propagherebbe ai MenuItem in cache senza questa chiamata.
    this.refreshSaveStateMenuItems();
    saveStateMenu.toggle(event);
  }

  private refreshSaveStateMenuItems(): void {
    this.saveStateMenuItems = [
      {
        label: this.trslSrv.instant('list_grid.save_state'),
        icon: 'pi pi-bookmark',
        command: () => {
          this.openSaveGridStateDialog();
        }
      },
      {
        label: this.trslSrv.instant('list_grid.columns'),
        icon: 'pi pi-list',
        command: () => {
          this.openColumnLayoutDialog();
        }
      },
      {
        label: this.trslSrv.instant('list_grid.reset_state'),
        icon: 'pi pi-undo',
        command: () => {
          this.resetGridState(this.table);
        }
      },
      {
        separator: true
      },
      {
        label: this.trslSrv.instant('list_grid.set_preferred'),
        icon: 'pi pi-star',
        command: () => {
          void this.setSelectedGridStateAsPreferred();
        }
      },
      {
        label: this.trslSrv.instant('list_grid.rename_state') || 'Rinomina stato',
        icon: 'pi pi-pencil',
        command: () => {
          this.openRenameGridStateDialog();
        }
      },
      {
        label: this.trslSrv.instant('list_grid.remove_state') || 'Rimuovi stato',
        icon: 'pi pi-trash',
        command: () => {
          void this.removeSelectedGridState();
        }
      }
    ];
  }

  /**
   * Riallinea la larghezza della colonna leggendo il valore finale dal DOM della tabella.
   * Utile quando l'evento resize espone una width intermedia/non definitiva.
   */
  private captureColumnWidthFromTableDomByField(field: string): void {
    const safeField = String(field || '').trim();
    const routeKey = this.getRouteKey(this.routeName);
    if (!safeField || !routeKey) {
      return;
    }

    const tableElement = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!tableElement) {
      return;
    }

    const escapedField = safeField.replace(/"/g, '\\"');
    const header = tableElement.querySelector(`th[data-field="${escapedField}"]`) as HTMLElement | null;
    if (!header) {
      return;
    }

    const measuredWidth = Number(header.getBoundingClientRect().width);
    if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
      return;
    }

    const minWidthPx = Number.parseFloat(this.getColumnMinWidthCss()) || 10;
    const normalizedWidth = Number(Math.max(minWidthPx, measuredWidth).toFixed(2));
    const widths: { [field: string]: number } = { ...this.getCurrentRouteColumnWidths() };
    widths[safeField] = normalizedWidth;
    this.persistedColumnWidthsByRoute[routeKey] = widths;

    this.cols = (this.cols || []).map((c: any) => {
      if (String(c?.field || '') === safeField) {
        return {
          ...c,
          width: normalizedWidth,
          widthPercent: undefined
        };
      }

      return c;
    });
  }

  /**
   * Gestisce la logica di `onColumnReorder` trasformando e filtrando collezioni dati.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  async onColumnReorder(event: any) {
    this.onPTableColumnReorder.emit(event);
    if (!this.cols?.length) {
      return;
    }

    const nextVisibleOrder = this.extractVisibleColumnOrderFromReorderEvent(event);
    if (!nextVisibleOrder.length) {
      return;
    }

    const visibleMap = new Map(
      (this.cols || [])
        .filter((c: any) => !c?.hidden)
        .map((c: any) => [String(c.field), c])
    );

    const reorderedVisible = nextVisibleOrder
      .map((field) => visibleMap.get(field))
      .filter((c): c is any => !!c);

    const missingVisible = (this.cols || []).filter((c: any) => !c?.hidden && !nextVisibleOrder.includes(String(c.field)));
    const hiddenCols = (this.cols || []).filter((c: any) => !!c?.hidden);

    this.cols = [...reorderedVisible, ...missingVisible, ...hiddenCols];
    this.cd.detectChanges();
    await this.persistCurrentRouteColumnLayoutFromCols();
  }

  /**
   * Wrapper paginator mobile: dopo lo switch pagina riporta lo scroll all'inizio.
   * Su mobile virtualizzato lo scroll reale e' sul container interno di
   * `<p-virtualscroller>` (`.wuic-mobile-virtualscroller`, overflow-y: auto) —
   * non sulla `.wuic-mobile-card-list` ne' sulla `window`. Senza questo fix
   * il page change cambia i record ma lascia il viewport alla posizione precedente
   * (che pero' mostra ora i record della pagina nuova mid-list, percezione UX
   * di "non aver navigato"). Lo facciamo dopo che `pageFilterChange` ha completato
   * (await) + un rAF per dare tempo al virtualscroller di rebindare gli items.
   */
  async onMobilePageChange(event: any) {
    await this.pageFilterChange(event);
    if (!this.deviceAwareness?.isMobile) {
      return;
    }
    const root = this.gridContainerRef?.nativeElement;
    if (!root) {
      return;
    }
    const scrollAllMobileScrollers = () => {
      const targets = root.querySelectorAll(
        '.wuic-mobile-virtualscroller, .wuic-mobile-card-list, p-virtualscroller, p-scroller'
      );
      targets.forEach((el: Element) => {
        const node = el as HTMLElement;
        if (node.scrollHeight > node.clientHeight) {
          node.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(scrollAllMobileScrollers));
  }

  /**
   * Gestisce la logica operativa di `pageFilterChange` in modo coerente con l'implementazione corrente.
   * @param event Evento che innesca il comportamento del metodo.
   * @returns Risultato elaborato da `pageFilterChange` e restituito al chiamante.
   */
  async pageFilterChange(event: any) {
    // Applying a saved state updates sort/filter bindings programmatically.
    // Ignore transient table events to avoid duplicate fetches.
    if (this.applyingSavedState) {
      return;
    }

    // NOTA: gli @Output (onFiltering/onSorting/onPaging) vengono emessi
    // PIU' AVANTI nel metodo, DOPO che `ds.currentPage / pageSize / sortInfo
    // / filterInfo` sono stati aggiornati. Ragione: handler esterni (es.
    // Pattern 3 server-side, vedi doc pattern-framework-comp-custom-data.md)
    // tipicamente leggono `ds.currentPage/pageSize/...` per ricostruire la
    // query backend. Emettere qui (prima dei set) forniva loro lo state
    // VECCHIO -> paging/sort/filter con "un click di ritardo".

    const shouldSyncFilterQuery = !!event?.filters;
    const shouldSyncPageQuery = !!event?.rows && !event?.field;
    const shouldSyncSortQuery = !!event?.field;
    const isPageOnlyEvent = !!event?.rows && !event?.field && !event?.filters;

    if (event.filters) {
      // this.filterInfo = new FilterInfo('AND', []);
      // Filtering must always restart from the first page.
      this.pageIndex = 1;
      this.rowNumber = 0;
      if (typeof event.rows === 'number' && event.rows > 0) {
        this.pageSize = event.rows;
      }

      Object.keys(event.filters).forEach((key) => {
        const col = this.metas.find((col: MetadatiColonna) => {
          return col.mc_nome_colonna == key;
        });

        if (event.filters[key] && event.filters[key].length) {
          // Guard: in Pattern 3 (hardcoded datasource) `filterDescriptor[key]`
          // puo' essere undefined perche' l'host inizializza l'oggetto a `{}`
          // e non passa per `getSchemaAndData()` che lo popolerebbe con un
          // BehaviorSubject per ogni colonna. Senza questo guard:
          //   undefined.value -> TypeError: Cannot read properties of undefined.
          // Quando il descriptor manca, lasciamo il valore raw inviato da
          // p-table cosi' come e' (gia' la stringa digitata dall'utente).
          const fd = this.datasource.value.filterDescriptor?.[key];
          if (fd !== undefined && fd !== null) {
            event.filters[key][0].value = fd.value;
          }
        }

        if (col?.mc_is_range_filter) {
          if (!this.metaInfo?.operators) {
            this.metaInfo.operators = {};
          }
          this.metaInfo.operators[key] = 'between';
        }
      });

    } else if (event.field) {
      this.suppressNextPageOnlyQuerySync = true;
      this.orderColumn = event.field;

      if (event.order == 1) {
        this.orderDir = 'asc';
      } else {
        this.orderDir = 'desc';
      }

      // PrimeNG onSort may also include paging payload (first/rows), often resetting to page 1.
      // Keep local paging state aligned so pageInfo querystring is updated coherently.
      const sortEventRows = typeof event.rows === 'number' && event.rows > 0 ? event.rows : this.pageSize;
      const sortEventFirst = typeof event.first === 'number' ? event.first : 0;
      if (sortEventRows > 0) {
        this.pageSize = sortEventRows;
        this.rowNumber = sortEventFirst;
        this.pageIndex = Math.floor(this.rowNumber / sortEventRows) + 1;
      } else {
        this.rowNumber = 0;
        this.pageIndex = 1;
      }
    } else if (event.rows) {

      this.pageSize = event.rows;
      this.rowNumber = event.first;
      this.pageIndex = Math.floor(event.first / event.rows) + 1;

      const dsCursor = this.datasource?.value;
      if (dsCursor?.cursorMode) {
        const previousPage = Math.max(1, Number(dsCursor.currentPage || 1));
        const pageSizeChanged = Number(dsCursor.pageSize || 0) !== Number(this.pageSize || 0);

        if (pageSizeChanged) {
          this.pageIndex = 1;
          this.rowNumber = 0;
          dsCursor.pageDirection = 'next';
          dsCursor.pageCursor = null;
          dsCursor.currentPage = 1;
        } else if (this.pageIndex > previousPage) {
          const token = dsCursor.nextPageCursor || null;
          if (!token) {
            this.pageIndex = previousPage;
            this.rowNumber = Math.max(0, (previousPage - 1) * this.pageSize);
            return;
          }

          dsCursor.pageDirection = 'next';
          dsCursor.pageCursor = token;
          dsCursor.currentPage = this.pageIndex;
        } else if (this.pageIndex < previousPage) {
          const token = dsCursor.prevPageCursor || null;
          if (!token) {
            this.pageIndex = previousPage;
            this.rowNumber = Math.max(0, (previousPage - 1) * this.pageSize);
            return;
          }

          dsCursor.pageDirection = 'prev';
          dsCursor.pageCursor = token;
          dsCursor.currentPage = this.pageIndex;
        } else {
          dsCursor.pageDirection = 'next';
          dsCursor.pageCursor = null;
          dsCursor.currentPage = this.pageIndex;
        }
      }
    }

    if (this.datasource) {
      this.datasource.value.pageSize = this.pageSize;
      this.datasource.value.currentPage = this.pageIndex;
      // this.datasource.value.filterInfo = this.filterInfo;

      if (this.orderColumn) {
        this.datasource.value.sortInfo = [
          {
            field: this.orderColumn,
            dir: this.orderDir,
            mc_id: 0
          }
        ];
      } else {
        this.datasource.value.sortInfo = [];
      }

      await this.datasource.value.fetchData();
      this.scheduleGridViewportHeightSync();

      // Emit @Output events DOPO fetchData: a questo punto TUTTO lo stato
      // del ds e' consistente.
      //   - ds.currentPage/pageSize/sortInfo: settati sync sopra (pre-fetchData)
      //   - ds.filterInfo: costruito dentro fetchData() nella pre-prep
      //     (applyFilterInfoToFilterDescriptor + sync da filterDescriptor)
      // Emettere PRIMA di fetchData daria' filterInfo stale al handler
      // esterno (vedi Pattern 3 server-side: 3b/3c in doc).
      //
      // Per hardcoded datasource (Pattern 3) fetchData e' no-op sul backend
      // quindi niente roundtrip inutile. Per Pattern 1/2 fetchData fa la
      // fetch standard del framework; l'handler esterno che poi re-fetcha
      // sul suo backend custom e' solo in Pattern 3, quindi nessuna doppia
      // chiamata qui.
      if (event?.filters) {
        this.onFiltering.emit(event);
      } else if (event?.field) {
        this.onSorting.emit(event);
      } else if (event?.rows) {
        this.onPaging.emit(event);
      }

      if (shouldSyncFilterQuery) {
        this.scheduleSyncFilterInfoQueryString();
      }
      if (shouldSyncPageQuery && !this.suppressNextPageOnlyQuerySync) {
        this.syncPageInfoQueryString();
      }
      if (shouldSyncSortQuery) {
        this.syncSortInfoQueryString();
      }

      if (isPageOnlyEvent && this.suppressNextPageOnlyQuerySync) {
        this.suppressNextPageOnlyQuerySync = false;
      } else if (shouldSyncSortQuery) {
        // The sort sync already includes pageInfo and sortInfo.
        // Ignore the follow-up page-only event PrimeNG may emit.
        this.suppressNextPageOnlyQuerySync = true;
      }

      this.syncSelectedSavedStateWithDatasourceCurrentState();
    }
  }

  /**
   * Gestisce la logica operativa di `clearFilter` in modo coerente con l'implementazione corrente.
   * @param table Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async clearFilter(table: Table) {
    // Preserve sorting: PrimeNG clear() resets both filters and sort state.
    const preservedSortInfo = this.deepClone(this.datasource?.value?.sortInfo || []);
    const preservedSort = preservedSortInfo?.[0];
    const preservedOrderColumn = this.orderColumn;
    const preservedOrderDir = this.orderDir;

    table?.clearFilterValues?.();
    table.filters = {};

    this.pageIndex = 1;
    this.rowNumber = 0;
    this.datasource.value.currentPage = 1;

    this.datasource.value.metaInfo.columnMetadata.forEach((col) => {
      this.datasource.value.clearColumnFilter(col, false);
    });

    this.datasource.value.sortInfo = preservedSortInfo;
    this.orderColumn = preservedSort?.field || preservedOrderColumn || '';
    this.orderDir = preservedSort?.dir || preservedOrderDir || 'asc';

    this.scheduleSyncFilterInfoQueryString();
    await this.datasource.value.fetchData();
    this.scheduleGridViewportHeightSync();

    // Emit onFiltering DOPO fetchData (filterInfo e' appena stato resettato
    // dentro fetchData's pre-prep + clearColumnFilter sopra). Gli handler
    // esterni (Pattern 3 server-side, vedi 3b/3c) devono reagire al clear
    // ri-fetchando dal loro backend senza filter; senza questo emit la grid
    // mostrerebbe ancora l'ultimo payload filtrato (es. 0 righe) anche se
    // lo stato logico dei filtri e' stato ripulito.
    this.onFiltering.emit({ filters: {} });
  }

  /**
   * Gestisce la logica operativa di `resetGridState` in modo coerente con l'implementazione corrente.
   * @param table Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async resetGridState(table: Table) {
    const ds = this.datasource?.value;
    if (!ds) {
      return;
    }

    table?.clearFilterValues?.();
    table.filters = {};

    // Reset sort UI and datasource sort state.
    (table as any).sortField = null;
    (table as any).sortOrder = 0;
    if ((table as any).multiSortMeta) {
      (table as any).multiSortMeta = [];
    }

    this.orderColumn = '';
    this.orderDir = 'asc';
    ds.sortInfo = [];

    // Reset all column filters and datasource filter state.
    ds.metaInfo.columnMetadata.forEach((col) => {
      ds.clearColumnFilter(col, false);
    });

    // Reset paging to defaults and remove grid-state query params.
    const defaultPageSize = this.metaInfo?.tableMetadata?.md_pageable
      ? Number(this.metaInfo?.tableMetadata?.md_pagesize || this.pageSize || 10)
      : 0;
    this.pageSize = Number.isFinite(defaultPageSize) ? Math.max(0, Math.trunc(defaultPageSize)) : (this.pageSize || 10);
    this.pageIndex = 1;
    this.rowNumber = 0;
    ds.pageSize = this.pageSize;
    ds.currentPage = 1;

    this.clearGridStateQueryString();
    await ds.fetchData();
    this.scheduleGridViewportHeightSync();
    this.syncSelectedSavedStateWithDatasourceCurrentState();
  }

  /**
   * Recupera i dati/valori richiesti da `getTgtVal`.
   * @param tgt Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getTgtVal` in base ai criteri implementati.
   */
  getTgtVal(tgt: any) {
    return tgt.value;
  }

  /**
   * Calcola i valori di aggregazione per colonna (`sum`, `avg`, `min`, `max`, `count`) usando i campi metadato con flag `mc_aggregation`.
   * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getAggregations` in base ai criteri implementati.
   */
  getAggregations(col: MetadatiColonna) {
    return this.aggregates ? this.aggregates.filter((agg) => agg.field == col.mc_nome_colonna) : [];
  }

  /**
   * Gestisce la logica di `exportXls` orchestrando le chiamate `exportXls` e `open`.
   */

  /**
   * Gestisce la logica di `refresh` preparando/aggiornando il dataset visualizzato.
   */
  async refresh() {
    const ds = this.datasource?.value;
    if (!ds) {
      return;
    }

    const schedulerInfo = this.getPrimaryActiveSchedulerInfo();
    if (schedulerInfo) {
      const nextExecutionText = this.formatSchedulerDateTime(
        schedulerInfo?.next_execution ?? schedulerInfo?.nextExecution ?? schedulerInfo?.next_execution_utc
      );
      const lastExec = schedulerInfo?.last_scheduler_execution ?? schedulerInfo?.lastSchedulerExecution ?? null;
      const lastDurationMsRaw = lastExec?.duration_ms ?? lastExec?.durationMs ?? null;
      const lastDurationMs = Number(lastDurationMsRaw);
      const lastDurationText = Number.isFinite(lastDurationMs) && lastDurationMs >= 0
        ? `${Math.round(lastDurationMs)} ms`
        : (this.trslSrv.instant('list_grid.not_available_short') || 'n/d');

      const infoMessage = [
        this.trslSrv.instant('list_grid.scheduler_active_message_line1') || 'E attiva una schedulazione su questa route.',
        this.trslSrv.format(
          this.trslSrv.instant('list_grid.scheduler_active_message_line2') || 'Prossima esecuzione: {0}.',
          nextExecutionText
        ),
        this.trslSrv.format(
          this.trslSrv.instant('list_grid.scheduler_active_message_line3') || 'Durata ultima esecuzione: {0}.',
          lastDurationText
        ),
        '',
        this.trslSrv.instant('list_grid.scheduler_active_message_line4') || 'Vuoi forzare l esecuzione immediata?'
      ].join('\n');

      const forceNow = await WtoolboxService.confirm({
        header: this.trslSrv.instant('list_grid.scheduler_active_header') || 'Schedulazione attiva',
        message: infoMessage,
        acceptLabel: this.trslSrv.instant('list_grid.scheduler_force_execution') || 'Forza esecuzione',
        rejectLabel: this.trslSrv.instant('list_grid.scheduler_refresh_only') || 'Solo aggiorna'
      });

      if (forceNow) {
        WtoolboxService.messageNotificationService?.add?.({
          severity: 'info',
          summary: this.trslSrv.instant('list_grid.scheduler_summary') || 'Schedulazione',
          detail: this.trslSrv.instant('list_grid.scheduler_force_execution_started') || 'Esecuzione forzata avviata. Riceverai una notifica al termine.'
        });

        try {
          const schedulerId = Number(schedulerInfo?.id ?? schedulerInfo?.scheduler_id ?? 0);
          const response = await this.metaSrv.forceSchedulerExecutionNow(schedulerId, this.routeName || this.metaInfo?.tableMetadata?.md_route_name || '');
          if (!response?.ok) {
            throw new Error(String(response?.error || (this.trslSrv.instant('list_grid.scheduler_force_execution_error') || 'Errore avvio esecuzione schedulazione.')));
          }
        } catch (err: any) {
          WtoolboxService.messageNotificationService?.add?.({
            severity: 'error',
            summary: this.trslSrv.instant('list_grid.scheduler_summary') || 'Schedulazione',
            detail: String(err?.message || err || (this.trslSrv.instant('list_grid.scheduler_force_execution_error') || 'Errore avvio esecuzione schedulazione.'))
          });
        }
      }
    }

    await ds.fetchData();

    // Emit onRefresh AFTER fetchData: ds state (filterInfo/sortInfo/pageInfo)
    // e' stato ricostruito nel pre-prep di fetchData. Gli host server-side
    // (Pattern 3 / 3b / 3c) possono bindare (onRefresh)="reloadFromServer()"
    // per ri-fetchare dal loro backend.
    this.onRefresh.emit();
  }

  private getPrimaryActiveSchedulerInfo(): any | null {
    const list = Array.isArray(this.metaInfo?.schedulerInfo) ? this.metaInfo.schedulerInfo : [];
    if (!list.length) {
      return null;
    }

    const active = list.find((x: any) => {
      const enabledRaw = x?.enabled ?? x?.is_enabled ?? x?.isEnabled ?? true;
      if (typeof enabledRaw === 'boolean') {
        return enabledRaw;
      }
      const normalized = String(enabledRaw ?? '1').trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    });
    return active || list[0] || null;
  }

  private formatSchedulerDateTime(value: any): string {
    if (value == null) {
      return this.trslSrv.instant('list_grid.not_available_short') || 'n/d';
    }

    const dt = value instanceof Date ? value : new Date(value);
    if (!dt || Number.isNaN(dt.getTime())) {
      return this.trslSrv.instant('list_grid.not_available_short') || 'n/d';
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(dt);
  }

  /**
   * Verifica una condizione di stato o di validita orchestrando le chiamate `canUseClientSideCrud`.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
  canToggleClientSideCrud(): boolean {
    return !!this.datasource?.value?.canUseClientSideCrud();
  }

  /**
   * Valuta una condizione tramite `isClientSideCrudActive` con il flusso specifico definito dalla sua implementazione.
   * @returns Esito booleano del controllo/elaborazione eseguito dal metodo.
   */
  isClientSideCrudActive(): boolean {
    return !!this.datasource?.value?.clientSideCrudActive;
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record.
   * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
   */
  getDatasourceChangesCount(): number {
    const rows = this.datasource?.value?.changes;
    return Array.isArray(rows) ? rows.length : 0;
  }

  /**
   * Verifica una condizione di stato o di validita orchestrando le chiamate `getDatasourceChangesCount`.
   * @returns Esito booleano del controllo effettuato dal metodo (true quando la condizione verificata risulta soddisfatta).
   */
  hasDatasourceChanges(): boolean {
    return this.getDatasourceChangesCount() > 0;
  }

  /**
   * Gestisce il comportamento UI di `openChangesDialog` orchestrando le chiamate `buildPendingChangeItems`.
   */
  openChangesDialog(): void {
    this.pendingChangeItems = this.buildPendingChangeItems();
    this.changesDialogVisible = true;
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record.
   * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
   */
  getSelectedPendingChangesCount(): number {
    return this.pendingChangeItems.filter((x) => x.selected).length;
  }

  /**
   * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
   * @returns Collezione di tipo `GridPendingChangeItem[]` derivata dalle trasformazioni applicate nel metodo.
   */
  private buildPendingChangeItems(): GridPendingChangeItem[] {
    const pending = this.datasource?.value?.getPendingChanges?.() || [];
    return pending.map((change, index) => {
      const id = `${String(change?.pkey ?? '')}::${String(change?.guid ?? '')}::${index}`;
      const label = change?.pkey !== undefined && change?.pkey !== null
        ? `ID ${change.pkey}`
        : (change?.guid ? `GUID ${change.guid}` : `Record ${index + 1}`);
      const details = (change?.changes || [])
        .filter((c) => !String(c?.field || '').includes('__lookup_obj'))
        .map((c) => `${c.field}: ${String(c.oldValue)} -> ${String(c.newValue)}`)
        .join(' | ') || '(nessun campo visualizzabile)';
      return {
        id,
        change,
        label,
        details,
        selected: true
      };
    });
  }

  /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale normalizzando e trasformando collezioni di record, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
   */
  async saveAllPendingChanges(): Promise<void> {
    const ds = this.datasource?.value;
    if (!ds || this.changesDialogBusy) {
      return;
    }

    const pending = this.pendingChangeItems.length
      ? this.pendingChangeItems.map((x) => x.change)
      : (ds.getPendingChanges?.() || []);
    if (!pending.length) {
      this.changesDialogVisible = false;
      return;
    }

    this.changesDialogBusy = true;
    try {
      await ds.batchSave(pending);
      this.resetInlineEditingRows();
      this.reassignModifiedRows(pending);
      if (this.isInlineBatchSaveEnabled()) {
        this.refreshInlineBatchOriginalSnapshots(pending);
      }
      WtoolboxService.messageNotificationService.add({
        severity: 'success',
        summary: this.trslSrv.instant('list_grid.save_summary') || 'Salvataggio',
        detail: this.trslSrv.format(
          this.trslSrv.instant('list_grid.save_all_detail') || '{1} modifiche salvate',
          pending.length
        )
      });
      this.changesDialogVisible = false;
      this.pendingChangeItems = [];
    } catch (_err) {
      WtoolboxService.errorHandler.handleError(_err);
    } finally {
      this.changesDialogBusy = false;
    }
  }

  /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale normalizzando e trasformando collezioni di record, allineando i record al formato atteso dai componenti del framework, coordinando chiamate verso servizi applicativi.
   */
  async saveSelectedPendingChanges(): Promise<void> {
    const ds = this.datasource?.value;
    if (!ds || this.changesDialogBusy) {
      return;
    }

    const selected = this.pendingChangeItems.filter((x) => x.selected).map((x) => x.change);
    const unselected = this.pendingChangeItems.filter((x) => !x.selected).map((x) => x.change);

    if (!selected.length && !unselected.length) {
      this.changesDialogVisible = false;
      return;
    }

    this.changesDialogBusy = true;
    try {
      if (selected.length) {
        await ds.batchSave(selected);
      }
      if (unselected.length) {
        this.applyTrackedRollbackToInlineObservables(unselected);
        ds.rollbackChanges(unselected);
        this.resyncInlineRowsAfterRollback(unselected);
      }
      this.resetInlineEditingRows();
      this.reassignModifiedRows(selected);
      if (this.isInlineBatchSaveEnabled()) {
        this.refreshInlineBatchOriginalSnapshots(selected);
      }

      WtoolboxService.messageNotificationService.add({
        severity: 'success',
        summary: this.trslSrv.instant('list_grid.save_summary') || 'Salvataggio',
        detail: this.trslSrv.format(
          this.trslSrv.instant('list_grid.save_selected_detail') || 'Salvate {1}, rollback {2}',
          selected.length,
          unselected.length
        )
      });
      this.changesDialogVisible = false;
      this.pendingChangeItems = [];
    } catch (_err) {
      WtoolboxService.errorHandler.handleError(_err);
    } finally {
      this.changesDialogBusy = false;
    }
  }

  /**
   * Gestisce la logica operativa di `cancelAllPendingChanges` trasformando e filtrando collezioni dati.
   */
  cancelAllPendingChanges(): void {
    const ds = this.datasource?.value;
    if (!ds || this.changesDialogBusy) {
      return;
    }

    const pending = this.pendingChangeItems.length
      ? this.pendingChangeItems.map((x) => x.change)
      : (ds.getPendingChanges?.() || []);
    if (pending.length) {
      this.applyTrackedRollbackToInlineObservables(pending);
      ds.rollbackChanges(pending);
      this.resyncInlineRowsAfterRollback(pending);
    }
    this.resetInlineEditingRows();

    WtoolboxService.messageNotificationService.add({
      severity: 'info',
      summary: this.trslSrv.instant('list_grid.cancelled_summary') || 'Annullate',
      detail: this.trslSrv.format(
        this.trslSrv.instant('list_grid.cancelled_detail') || '{1} modifiche annullate',
        pending.length
      )
    });
    this.changesDialogVisible = false;
    this.pendingChangeItems = [];
  }

  /**
   * Riconcilia le righe modificate dopo refresh dati associando i pending changes ai record correnti in base a PK/GUID e mantenendo il tracking coerente.
   * @param changes Collezione di input processata dal metodo.
   */
  private reassignModifiedRows(changes: TrackedChange[]): void {
    if (!Array.isArray(this.records) || !this.records.length || !Array.isArray(changes) || !changes.length) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const normalize = (value: any) => {
      if (value && typeof value === 'object' && 'value' in value) {
        return value.value;
      }
      return value;
    };

    const changesByRowId = new Map<string, TrackedChange[]>();
    changes.forEach((change) => {
      const rowId = `${String(change?.pkey ?? '')}::${String(change?.guid ?? '')}`;
      if (!changesByRowId.has(rowId)) {
        changesByRowId.set(rowId, []);
      }
      changesByRowId.get(rowId)!.push(change);
    });

    let touched = false;
    this.records = this.records.map((row: any) => {
      if (!row) {
        return row;
      }

      const rowPkey = pkeyName ? normalize(row[pkeyName]) : undefined;
      const rowGuid = normalize(row.__guid);
      const rowId = `${String(rowPkey ?? '')}::${String(rowGuid ?? '')}`;
      const rowChanges = changesByRowId.get(rowId) || [];
      if (rowChanges.length) {
        touched = true;
        const updatedRow = { ...row };
        rowChanges.forEach((trackedChange) => {
          (trackedChange?.changes || []).forEach((fieldChange) => {
            if (!fieldChange?.field) {
              return;
            }
            updatedRow[fieldChange.field] = fieldChange.newValue;
          });
        });
        return updatedRow;
      }

      return row;
    });

    if (touched) {
      this.cd.detectChanges();
    }
  }

  /**
   * Forza la riga in edit mode e inizializza l'observable record quando `md_inline_cell_editing` è attivo.
   */
  private applyInlineCellEditingStateToRows(): void {
    if (!this.isInlineCellEditingEnabled() || !Array.isArray(this.records) || !this.datasource?.value) {
      return;
    }

    this.records = this.records.map((row: any) => {
      if (!row) {
        return row;
      }

      const nextRow = row;
      nextRow.__observable = nextRow.__observable || this.datasource.value.getObservable(nextRow);
      nextRow.__is_editing = true;
      if (this.isInlineBatchSaveEnabled()) {
        nextRow.__inline_batch_original = this.buildInlineBatchRowSnapshot(nextRow);
        const rowKey = this.getInlineRowKey(nextRow);
        if (rowKey) {
          this.inlineBatchOriginalByRowKey[rowKey] = { ...nextRow.__inline_batch_original };
        }
      }
      return nextRow;
    });

    this.cd.detectChanges();
  }

  /**
   * Trigger blur cella editabile: salva in debounce solo la riga con modifiche pendenti.
   */
  onInlineCellEditorBlur(event: FocusEvent, rowData: any, _metaColumn?: MetadatiColonna): void {
    if (!this.isInlineCellEditingEnabled() || !rowData || !this.datasource?.value) {
      return;
    }
    if (this.isInlineBatchSaveEnabled()) {
      return;
    }

    const currentTarget = event?.currentTarget as HTMLElement | null;
    const relatedTarget = event?.relatedTarget as HTMLElement | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }

    this.scheduleInlineRowAutosave(rowData);
  }

  /**
   * Trigger change valore field-editor inline: salva in debounce solo la riga con modifiche pendenti.
   */
  onInlineCellEditorValueChange(rowData: any, _metaColumn?: MetadatiColonna): void {
    if (!this.isInlineCellEditingEnabled() || !rowData || !this.datasource?.value) {
      return;
    }

    const rowKey = this.getInlineRowKey(rowData);
    if (rowKey && _metaColumn?.mc_nome_colonna) {
      this.inlineCellLastChangedFieldByRowKey[rowKey] = String(_metaColumn.mc_nome_colonna);
    }

    if (this.isInlineBatchSaveEnabled()) {
      this.syncInlineBatchTrackedChangesForRow(rowData);
      this.cd.detectChanges();
      return;
    }

    this.scheduleInlineRowAutosave(rowData);
  }

  /**
   * Debounce unificato autosave riga inline.
   */
  private scheduleInlineRowAutosave(rowData: any): void {
    const rowKey = this.getInlineRowKey(rowData);
    if (!rowKey) {
      return;
    }

    if (this.inlineCellSaveDebounceByRowKey[rowKey]) {
      clearTimeout(this.inlineCellSaveDebounceByRowKey[rowKey]);
    }

    this.inlineCellSaveDebounceByRowKey[rowKey] = setTimeout(() => {
      delete this.inlineCellSaveDebounceByRowKey[rowKey];
      void this.saveInlineRowOnBlur(rowData, rowKey);
    }, 120);
  }

  /**
   * Salva la singola riga in blur mantenendo l'edit mode attivo.
   */
  private async saveInlineRowOnBlur(rowData: any, rowKey: string): Promise<void> {
    if (!rowData || !this.datasource?.value || this.inlineCellSaveInFlightByRowKey.has(rowKey)) {
      return;
    }

    if (!this.hasPendingInlineChangesForRow(rowData)) {
      return;
    }

    const ds = this.datasource.value;
    rowData.__observable = rowData.__observable || ds.getObservable(rowData);
    if (!rowData.__observable) {
      return;
    }

    const changedFieldName = this.inlineCellLastChangedFieldByRowKey[rowKey];
    const previousChangeTracking = !!(ds as any).changeTracking;
    this.forceInlineSingleFieldTrackedChange(rowData, changedFieldName);
    (ds as any).changeTracking = true;

    const pristine: any = {};
    (this.metaInfo?.columnMetadata || []).forEach((meta) => {
      pristine[meta.mc_nome_colonna] = rowData[meta.mc_nome_colonna];
    });

    this.inlineCellSaveInFlightByRowKey.add(rowKey);
    try {
      this.suppressNextInlineFetchInfoRebind = true;
      const ret = await ds.syncData(rowData.__observable, pristine, false);
      if (!ret) {
        this.suppressNextInlineFetchInfoRebind = false;
        return;
      }

      const serverUpdatedRow = this.resolveUpdatedInlineRowFromSyncResult(ret, ds, rowData);
      const normalizedUpdatedRow = serverUpdatedRow ? { ...serverUpdatedRow } : { ...ds.getModelFromObservable(rowData.__observable) };
      normalizedUpdatedRow.__is_editing = true;
      normalizedUpdatedRow.__observable = rowData.__observable || ds.getObservable(normalizedUpdatedRow);

      this.replaceInlineRowInDatasource(ds, normalizedUpdatedRow);
      Object.assign(rowData, normalizedUpdatedRow);
      rowData.__is_editing = true;
      rowData.__observable = normalizedUpdatedRow.__observable;
      this.cd.detectChanges();
    } catch (err) {
      this.suppressNextInlineFetchInfoRebind = false;
      WtoolboxService.errorHandler.handleError(err);
    } finally {
      (ds as any).changeTracking = previousChangeTracking;
      this.inlineCellSaveInFlightByRowKey.delete(rowKey);
      delete this.inlineCellLastChangedFieldByRowKey[rowKey];
    }
  }

  /**
   * In modalita inline+batch aggiorna il tracker locale `ds.changes` con tutti i campi riga modificati.
   */
  private syncInlineBatchTrackedChangesForRow(rowData: any): void {
    const ds: any = this.datasource?.value;
    if (!ds || !rowData) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(rowData?.[pkeyName]) : null;
    const guidValue = this.unwrapObservableLikeValue(rowData?.__guid);
    if ((pkeyValue === null || pkeyValue === undefined || String(pkeyValue).trim() === '')
      && (guidValue === null || guidValue === undefined || String(guidValue).trim() === '')) {
      return;
    }

    const rowKey = this.getInlineRowKey(rowData);
    const originalFromMap = rowKey ? this.inlineBatchOriginalByRowKey[rowKey] : null;
    const originalSnapshot = (originalFromMap && typeof originalFromMap === 'object')
      ? originalFromMap
      : (rowData.__inline_batch_original && typeof rowData.__inline_batch_original === 'object'
        ? rowData.__inline_batch_original
        : this.buildInlineBatchRowSnapshot(rowData));

    if (rowKey && !this.inlineBatchOriginalByRowKey[rowKey]) {
      this.inlineBatchOriginalByRowKey[rowKey] = { ...originalSnapshot };
    }
    if (!rowData.__inline_batch_original) {
      rowData.__inline_batch_original = { ...originalSnapshot };
    }

    const fieldChanges: ChangeT[] = [];
    (this.metaInfo?.columnMetadata || []).forEach((meta) => {
      const fieldName = String(meta?.mc_nome_colonna || '').trim();
      if (!fieldName) {
        return;
      }

      const oldValue = this.unwrapObservableLikeValue(originalSnapshot?.[fieldName]);
      const newValue = this.resolveInlineCurrentFieldValue(rowData, fieldName);
      if (!this.areInlineComparableValuesEqual(oldValue, newValue)) {
        fieldChanges.push(new ChangeT(fieldName, oldValue, newValue));
      }
    });

    const isSameEntity = (x: any) => {
      if (!x) {
        return false;
      }
      if (pkeyValue !== null && pkeyValue !== undefined && x?.pkey !== null && x?.pkey !== undefined) {
        return String(x.pkey) === String(pkeyValue);
      }
      if (guidValue !== null && guidValue !== undefined && x?.guid !== null && x?.guid !== undefined) {
        return String(x.guid) === String(guidValue);
      }
      return false;
    };

    ds.changes = Array.isArray(ds.changes) ? [...ds.changes] : [];
    const existingIndex = ds.changes.findIndex((x: any) => isSameEntity(x));

    if (!fieldChanges.length) {
      if (existingIndex >= 0) {
        ds.changes.splice(existingIndex, 1);
      }
      return;
    }

    const tracked = new TrackedChange(pkeyValue, guidValue);
    tracked.changes = fieldChanges;

    if (existingIndex >= 0) {
      ds.changes[existingIndex] = tracked;
    } else {
      ds.changes.push(tracked);
    }
  }

  /**
   * Snapshot "originale" per inline+batch usato da rollback/save: clone dei valori correnti dei campi metadata.
   */
  private buildInlineBatchRowSnapshot(rowData: any): any {
    const snapshot: any = {};
    (this.metaInfo?.columnMetadata || []).forEach((meta) => {
      const fieldName = String(meta?.mc_nome_colonna || '').trim();
      if (!fieldName) {
        return;
      }
      snapshot[fieldName] = this.cloneInlineComparableValue(this.unwrapObservableLikeValue(rowData?.[fieldName]));
    });
    return snapshot;
  }

  private cloneInlineComparableValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (value instanceof Date) {
      return new Date(value.getTime());
    }
    if (typeof value !== 'object') {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }

  /**
   * Dopo batch save allinea lo snapshot originale delle sole righe salvate.
   */
  private refreshInlineBatchOriginalSnapshots(changes: TrackedChange[]): void {
    if (!Array.isArray(this.records) || !this.records.length || !Array.isArray(changes) || !changes.length) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const sameEntity = (row: any, change: TrackedChange): boolean => {
      const rowPk = pkeyName ? this.unwrapObservableLikeValue(row?.[pkeyName]) : null;
      if (change?.pkey !== null && change?.pkey !== undefined && rowPk !== null && rowPk !== undefined) {
        return String(change.pkey) === String(rowPk);
      }

      const rowGuid = this.unwrapObservableLikeValue(row?.__guid);
      if (change?.guid !== null && change?.guid !== undefined && rowGuid !== null && rowGuid !== undefined) {
        return String(change.guid) === String(rowGuid);
      }

      return false;
    };

    this.records.forEach((row: any) => {
      if (!row) {
        return;
      }
      const matched = changes.some((change) => sameEntity(row, change));
      if (matched) {
        const snapshot = this.buildInlineBatchRowSnapshot(row);
        row.__inline_batch_original = snapshot;
        const rowKey = this.getInlineRowKey(row);
        if (rowKey) {
          this.inlineBatchOriginalByRowKey[rowKey] = { ...snapshot };
        }
      }
    });
  }

  /**
   * Dopo rollback riallinea i BehaviorSubject dei field-editor inline ai rispettivi oldValue.
   */
  private applyTrackedRollbackToInlineObservables(changes: TrackedChange[]): void {
    if (!Array.isArray(this.records) || !this.records.length || !Array.isArray(changes) || !changes.length) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const sameEntity = (row: any, change: TrackedChange): boolean => {
      const rowPk = pkeyName ? this.unwrapObservableLikeValue(row?.[pkeyName]) : null;
      if (change?.pkey !== null && change?.pkey !== undefined && rowPk !== null && rowPk !== undefined) {
        return String(change.pkey) === String(rowPk);
      }

      const rowGuid = this.unwrapObservableLikeValue(row?.__guid);
      if (change?.guid !== null && change?.guid !== undefined && rowGuid !== null && rowGuid !== undefined) {
        return String(change.guid) === String(rowGuid);
      }

      return false;
    };

    this.records.forEach((row: any) => {
      if (!row) {
        return;
      }

      const tracked = changes.find((change) => sameEntity(row, change));
      if (!tracked || !Array.isArray(tracked.changes) || !tracked.changes.length) {
        return;
      }

      tracked.changes.forEach((fieldChange) => {
        const fieldName = String(fieldChange?.field || '').trim();
        if (!fieldName) {
          return;
        }

        const rolledBackValue = this.cloneInlineComparableValue(fieldChange.oldValue);
        row[fieldName] = rolledBackValue;
        const observableField = row?.__observable?.[fieldName];
        if (observableField && typeof observableField.next === 'function') {
          observableField.next(this.cloneInlineComparableValue(fieldChange.oldValue));
        }
      });
    });
  }

  /**
   * Riallinea in modo forzato righe+observable ai valori post-rollback presenti nel datasource.
   * Evita mismatch UI quando l'editor legge dai BehaviorSubject e non dal valore raw della riga.
   */
  private resyncInlineRowsAfterRollback(changes: TrackedChange[]): void {
    if (!Array.isArray(this.records) || !this.records.length || !Array.isArray(changes) || !changes.length) {
      return;
    }

    const ds = this.datasource?.value as any;
    const sourceRows = Array.isArray(ds?.resultInfo?.dato) ? ds.resultInfo.dato : null;
    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const trackedIds = new Set(changes.map((x) => `${String(x?.pkey ?? '')}::${String(x?.guid ?? '')}`));

    const sameEntity = (row: any, tracked: TrackedChange): boolean => {
      const rowPk = pkeyName ? this.unwrapObservableLikeValue(row?.[pkeyName]) : null;
      if (tracked?.pkey !== null && tracked?.pkey !== undefined && rowPk !== null && rowPk !== undefined) {
        return String(tracked.pkey) === String(rowPk);
      }

      const rowGuid = this.unwrapObservableLikeValue(row?.__guid);
      if (tracked?.guid !== null && tracked?.guid !== undefined && rowGuid !== null && rowGuid !== undefined) {
        return String(tracked.guid) === String(rowGuid);
      }

      return false;
    };

    const findSourceRow = (row: any): any => {
      if (!Array.isArray(sourceRows)) {
        return row;
      }
      return sourceRows.find((candidate: any) => {
        const candidateId = `${String(this.unwrapObservableLikeValue(candidate?.[pkeyName || '']) ?? '')}::${String(this.unwrapObservableLikeValue(candidate?.__guid) ?? '')}`;
        const rowId = `${String(this.unwrapObservableLikeValue(row?.[pkeyName || '']) ?? '')}::${String(this.unwrapObservableLikeValue(row?.__guid) ?? '')}`;
        return candidateId === rowId;
      }) || row;
    };

    this.records.forEach((row: any) => {
      if (!row) {
        return;
      }

      const tracked = changes.find((change) => sameEntity(row, change));
      if (!tracked) {
        return;
      }

      const sourceRow = findSourceRow(row);
      const rowKey = this.getInlineRowKey(row);
      const originalSnapshot = (rowKey ? this.inlineBatchOriginalByRowKey[rowKey] : null)
        || row.__inline_batch_original
        || null;

      const changedFieldNames = (tracked.changes || [])
        .map((fieldChange) => String(fieldChange?.field || '').trim())
        .filter((fieldName) => !!fieldName);
      const fieldsToRestore = changedFieldNames.length
        ? changedFieldNames
        : (this.metaInfo?.columnMetadata || [])
          .map((m) => String(m?.mc_nome_colonna || '').trim())
          .filter((fieldName) => !!fieldName);

      fieldsToRestore.forEach((fieldName) => {
        if (!fieldName) {
          return;
        }

        const metaField = (this.metaInfo?.columnMetadata || []).find((m) => String(m?.mc_nome_colonna || '').trim() === fieldName);
        const snapshotValue = originalSnapshot ? this.unwrapObservableLikeValue(originalSnapshot?.[fieldName]) : undefined;
        const sourceValue = this.cloneInlineComparableValue(
          snapshotValue !== undefined
            ? snapshotValue
            : this.unwrapObservableLikeValue(sourceRow?.[fieldName])
        );
        row[fieldName] = sourceValue;
        const observableField = row?.__observable?.[fieldName];
        if (observableField && typeof observableField.next === 'function') {
          observableField.next(this.cloneInlineComparableValue(sourceValue));
        }

        if (sourceRow) {
          sourceRow[fieldName] = this.cloneInlineComparableValue(sourceValue);
        }

        // Lookup fields need companion restore (`__lookup_obj` + optional alias text key),
        // otherwise UI can keep stale selected label even if ID is rolled back.
        if (metaField?.mc_ui_column_type === 'lookupByID') {
          const companionKeys: string[] = [`${fieldName}__lookup_obj`];
          const aliasKey = this.getLookupAliasKey(metaField);
          if (aliasKey) {
            companionKeys.push(aliasKey);
          }

          companionKeys.forEach((key) => {
            const companionSnapshotValue = originalSnapshot ? this.unwrapObservableLikeValue(originalSnapshot?.[key]) : undefined;
            const companionValue = this.cloneInlineComparableValue(
              companionSnapshotValue !== undefined
                ? companionSnapshotValue
                : this.unwrapObservableLikeValue(sourceRow?.[key])
            );

            row[key] = companionValue;
            const companionObs = row?.__observable?.[key];
            if (companionObs && typeof companionObs.next === 'function') {
              companionObs.next(this.cloneInlineComparableValue(companionValue));
            }

            if (sourceRow) {
              sourceRow[key] = this.cloneInlineComparableValue(companionValue);
            }
          });
        }
      });

      if (rowKey && trackedIds.has(`${String(tracked?.pkey ?? '')}::${String(tracked?.guid ?? '')}`)) {
        const snapshot = this.buildInlineBatchRowSnapshot(row);
        row.__inline_batch_original = snapshot;
        this.inlineBatchOriginalByRowKey[rowKey] = { ...snapshot };
      }
    });

    this.records = [...this.records];
    this.cd.detectChanges();
  }

  private getLookupAliasKey(metaField: any): string {
    const entityName = String(metaField?.mc_ui_lookup_entity_name || '').trim();
    const textField = String(metaField?.mc_ui_lookup_dataTextField || '').trim();
    const fieldName = String(metaField?.mc_nome_colonna || '').trim();
    if (!entityName || !textField || !fieldName) {
      return '';
    }

    return `${entityName.replaceAll(' ', '_')}___${textField}__${fieldName}`;
  }

  /**
   * Forza tracker delta inline ad un solo campo (old/new) per ottenere update payload minimal (PK + campo).
   */
  private forceInlineSingleFieldTrackedChange(rowData: any, fieldName?: string): void {
    const ds: any = this.datasource?.value;
    const normalizedField = String(fieldName || '').trim();
    if (!ds || !normalizedField) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(rowData?.[pkeyName]) : null;
    const guidValue = this.unwrapObservableLikeValue(rowData?.__guid);
    if ((pkeyValue === null || pkeyValue === undefined || String(pkeyValue).trim() === '')
      && (guidValue === null || guidValue === undefined || String(guidValue).trim() === '')) {
      return;
    }

    const originalRow = this.findOriginalRowFromDatasourceResult(rowData);
    const oldValue = this.unwrapObservableLikeValue(originalRow?.[normalizedField]);
    const newValue = this.unwrapObservableLikeValue(rowData?.[normalizedField]);

    const tracked = new TrackedChange(pkeyValue, guidValue);
    tracked.changes.push(new ChangeT(normalizedField, oldValue, newValue));

    const sameEntity = (x: any) => {
      if (!x) {
        return false;
      }
      if (pkeyValue !== null && pkeyValue !== undefined && x?.pkey !== null && x?.pkey !== undefined) {
        return String(x.pkey) === String(pkeyValue);
      }
      if (guidValue !== null && guidValue !== undefined && x?.guid !== null && x?.guid !== undefined) {
        return String(x.guid) === String(guidValue);
      }
      return false;
    };

    ds.changes = Array.isArray(ds.changes) ? ds.changes.filter((x: any) => !sameEntity(x)) : [];
    ds.changes.push(tracked);
  }

  /**
   * Estrae la riga aggiornata dalla response sync (preferenza: __entity, fallback result object).
   */
  private resolveUpdatedInlineRowFromSyncResult(syncResult: any, ds: any, fallbackRow: any): any | null {
    const entityFromServer = syncResult?.__entity;
    if (entityFromServer && typeof entityFromServer === 'object' && !Array.isArray(entityFromServer)) {
      return entityFromServer;
    }

    const resultObj = syncResult?.result;
    if (resultObj && typeof resultObj === 'object' && !Array.isArray(resultObj)) {
      return resultObj;
    }

    try {
      return ds?.getModelFromObservable?.(fallbackRow?.__observable) || null;
    } catch {
      return null;
    }
  }

  /**
   * Sostituisce solo la riga aggiornata nel datasource/lista locale (no refetch completo).
   */
  private replaceInlineRowInDatasource(ds: any, updatedRow: any): void {
    if (!ds || !updatedRow) {
      return;
    }

    const rows = Array.isArray(ds?.resultInfo?.dato) ? ds.resultInfo.dato : null;
    if (!rows) {
      return;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(updatedRow?.[pkeyName]) : null;
    const guidValue = this.unwrapObservableLikeValue(updatedRow?.__guid);

    const isSameRow = (candidate: any): boolean => {
      const candidatePk = pkeyName ? this.unwrapObservableLikeValue(candidate?.[pkeyName]) : null;
      if (pkeyName && pkeyValue !== null && pkeyValue !== undefined && candidatePk !== null && candidatePk !== undefined) {
        return String(candidatePk) === String(pkeyValue);
      }

      const candidateGuid = this.unwrapObservableLikeValue(candidate?.__guid);
      if (guidValue !== null && guidValue !== undefined && candidateGuid !== null && candidateGuid !== undefined) {
        return String(candidateGuid) === String(guidValue);
      }

      return false;
    };

    const index = rows.findIndex((x: any) => isSameRow(x));
    if (index >= 0) {
      rows[index] = { ...rows[index], ...updatedRow };
      ds.resultInfo.dato = [...rows];
    }

    if (Array.isArray(this.records)) {
      const localIndex = this.records.findIndex((x: any) => isSameRow(x));
      if (localIndex >= 0) {
        this.records[localIndex] = { ...this.records[localIndex], ...updatedRow };
        this.records = [...this.records];
      }
    }
  }

  /**
   * Verifica se la riga ha change tracking pendente.
   */
  private hasPendingTrackedChangesForRow(rowData: any): boolean {
    const ds = this.datasource?.value;
    const pending = ds?.changes || [];
    if (!Array.isArray(pending) || !pending.length) {
      return false;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(rowData?.[pkeyName]) : null;
    const guidValue = this.unwrapObservableLikeValue(rowData?.__guid);

    return pending.some((x: any) => {
      const samePkey = pkeyValue !== null && pkeyValue !== undefined && x?.pkey !== null && x?.pkey !== undefined && String(x.pkey) === String(pkeyValue);
      const sameGuid = guidValue !== null && guidValue !== undefined && x?.guid !== null && x?.guid !== undefined && String(x.guid) === String(guidValue);
      return (samePkey || sameGuid) && Array.isArray(x?.changes) && x.changes.length > 0;
    });
  }

  /**
   * Verifica delta locale riga confrontando il record corrente con l'old-value presente in `resultInfo.dato`.
   * Non dipende da `rowData.__observable` e funziona anche quando il tracking locale non e inizializzato.
   */
  private hasPendingInlineChangesForRow(rowData: any): boolean {
    if (!rowData || !this.metaInfo?.columnMetadata?.length || !this.datasource?.value) {
      return false;
    }

    const originalRow = this.findOriginalRowFromDatasourceResult(rowData);
    if (!originalRow) {
      return this.hasPendingTrackedChangesForRow(rowData);
    }

    for (const meta of this.metaInfo.columnMetadata) {
      const fieldName = meta?.mc_nome_colonna;
      if (!fieldName) {
        continue;
      }

      const currentValue = this.resolveInlineCurrentFieldValue(rowData, fieldName);
      const originalValue = this.unwrapObservableLikeValue(originalRow[fieldName]);
      if (!this.areInlineComparableValuesEqual(originalValue, currentValue)) {
        return true;
      }
    }

    // Fallback legacy: quando il tracker globale è disponibile resta comunque valido.
    return this.hasPendingTrackedChangesForRow(rowData);
  }

  /**
   * Recupera il record originale dal dataset corrente (`resultInfo.dato`) usando PK o GUID.
   */
  private findOriginalRowFromDatasourceResult(rowData: any): any | null {
    const rows = this.datasource?.value?.resultInfo?.dato;
    if (!Array.isArray(rows) || !rows.length || !rowData) {
      return null;
    }

    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(rowData[pkeyName]) : null;
    if (pkeyName && pkeyValue !== null && pkeyValue !== undefined && String(pkeyValue).trim() !== '') {
      const byPk = rows.find((x: any) => {
        const candidate = this.unwrapObservableLikeValue(x?.[pkeyName]);
        return candidate !== null && candidate !== undefined && String(candidate) === String(pkeyValue);
      });
      if (byPk) {
        return byPk;
      }
    }

    const guidValue = this.unwrapObservableLikeValue(rowData?.__guid);
    if (guidValue !== null && guidValue !== undefined && String(guidValue).trim() !== '') {
      const byGuid = rows.find((x: any) => {
        const candidate = this.unwrapObservableLikeValue(x?.__guid);
        return candidate !== null && candidate !== undefined && String(candidate) === String(guidValue);
      });
      if (byGuid) {
        return byGuid;
      }
    }

    return null;
  }

  /**
   * Confronto permissivo per valori inline (primitive/object/array/date) con normalizzazione JSON.
   */
  private areInlineComparableValuesEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    const normalize = (value: any): any => {
      if (value === undefined || value === null) {
        return null;
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (Array.isArray(value)) {
        return value.map((x) => normalize(x));
      }

      if (typeof value === 'object') {
        const obj: any = {};
        Object.keys(value)
          .sort()
          .forEach((k) => {
            obj[k] = normalize(value[k]);
          });
        return obj;
      }

      return value;
    };

    try {
      return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    } catch {
      return String(a) === String(b);
    }
  }

  /**
   * Chiave stabile riga per debounce/concurrency guard autosave.
   */
  private getInlineRowKey(rowData: { [key: string]: BehaviorSubject<any> }): string {
    const pkeyName = this.metaInfo?.pKey?.mc_nome_colonna;
    const pkeyValue = pkeyName ? this.unwrapObservableLikeValue(rowData?.[pkeyName]) : null;
    const guidValue = this.unwrapObservableLikeValue(rowData?.['__guid']);

    if (pkeyValue !== null && pkeyValue !== undefined && String(pkeyValue).trim() !== '') {
      return `pk:${String(pkeyValue)}`;
    }

    if (guidValue !== null && guidValue !== undefined && String(guidValue).trim() !== '') {
      return `guid:${String(guidValue)}`;
    }

    return '';
  }

  /**
   * Restituisce metadato colonna runtime per inline-grid con `ang_name` univoco per riga
   * così gli editor non generano id/name duplicati nel DOM.
   */
  public getRuntimeGridFieldMeta(metaColumn: MetadatiColonna, rowData: any): MetadatiColonna {
    if (!metaColumn || !this.isInlineCellEditingEnabled()) {
      return metaColumn;
    }

    const baseAngName = String(metaColumn.ang_name || '').trim();
    if (!baseAngName) {
      return metaColumn;
    }

    const rowKey = this.getInlineRowKey(rowData);
    if (!rowKey) {
      return metaColumn;
    }

    const fieldIdentity = String(metaColumn.mc_id || metaColumn.mc_nome_colonna || baseAngName);
    const cacheKey = `${fieldIdentity}::${rowKey}`;
    if (this.inlineGridRuntimeFieldCacheByKey[cacheKey]) {
      return this.inlineGridRuntimeFieldCacheByKey[cacheKey];
    }

    const sanitizedRowKey = rowKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    const runtimeField = Object.assign(new MetadatiColonna(''), metaColumn);
    runtimeField.ang_name = `${baseAngName}__${sanitizedRowKey}`;

    this.inlineGridRuntimeFieldCacheByKey[cacheKey] = runtimeField;
    return runtimeField;
  }

  /**
   * Unwrap helper per valori observable-like (BehaviorSubject/Signal-like).
   */
  private unwrapObservableLikeValue(value: any): any {
    if (value && typeof value === 'object' && typeof (value as any).getValue === 'function') {
      try {
        return (value as any).getValue();
      } catch {
      }
    }

    if (value && typeof value === 'object' && 'value' in value) {
      try {
        return (value as any).value;
      } catch {
      }
    }

    return value;
  }

  /**
   * Valore corrente campo in inline-grid: preferisce `__observable[field]` quando disponibile (piu aggiornato del model riga dopo blur).
   */
  private resolveInlineCurrentFieldValue(rowData: any, fieldName: string): any {
    const observableField = rowData?.__observable?.[fieldName];
    if (observableField && typeof observableField === 'object' && 'value' in observableField) {
      return this.unwrapObservableLikeValue(observableField);
    }

    if (observableField && typeof observableField.getValue === 'function') {
      try {
        return observableField.getValue();
      } catch {
      }
    }

    return this.unwrapObservableLikeValue(rowData?.[fieldName]);
  }

  /**
   * Ripristina lo stato e pulisce risorse temporanee legate al flusso del componente normalizzando e trasformando collezioni di record.
   */
  private resetInlineEditingRows(): void {
    if (!Array.isArray(this.records) || !this.records.length) {
      return;
    }

    if (this.isInlineCellEditingEnabled()) {
      this.applyInlineCellEditingStateToRows();
      return;
    }

    this.records.forEach((row: any) => {
      if (row && row.__is_editing) {
        row.__is_editing = false;
      }
    });

    this.records = [...this.records];
    this.cd.detectChanges();
  }

  /**
   * Gestisce comportamento UI tramite `toggleClientSideCrud` orchestrando le chiamate `canToggleClientSideCrud` e `syncAndDisableClientSideCrud`.
   */
  async toggleClientSideCrud() {
    if (!this.datasource?.value || !this.canToggleClientSideCrud() || this.clientSideCrudToggleBusy) {
      return;
    }

    if (this.datasource.value.clientSideCrudActive) {
      await this.syncAndDisableClientSideCrud();
      return;
    }

    this.clientSideCrudToggleBusy = true;

    try {
      await this.datasource.value.enableClientSideCrud();
      WtoolboxService.messageNotificationService.add({
        severity: 'info',
        summary: this.trslSrv.instant('client_side_crud_enabled_summary'),
        detail: this.trslSrv.instant('client_side_crud_enabled_detail')
      });
    } finally {
      this.clientSideCrudToggleBusy = false;
    }
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncAndDisableClientSideCrud` orchestrando le chiamate `isClientSideCrudActive` e `confirm`.
   */
  async syncAndDisableClientSideCrud() {
    if (!this.datasource?.value || !this.isClientSideCrudActive() || this.clientSideCrudToggleBusy) {
      return;
    }

    const confirmed = await WtoolboxService.confirm({
      header: this.trslSrv.instant('client_side_crud_sync_confirm_header'),
      message: this.trslSrv.instant('client_side_crud_sync_confirm_message')
    });

    if (!confirmed) {
      return;
    }

    this.clientSideCrudToggleBusy = true;
    try {
      const sync = await this.datasource.value.disableClientSideCrud();
      WtoolboxService.messageNotificationService.add({
        severity: 'success',
        summary: this.trslSrv.instant('client_side_crud_sync_summary'),
        detail: `${this.trslSrv.instant('inserted')}: ${sync.inserted}, ${this.trslSrv.instant('updated')}: ${sync.updated}, ${this.trslSrv.instant('deleted')}: ${sync.deleted}`
      });
    } finally {
      this.clientSideCrudToggleBusy = false;
    }
  }

  /**
   * Gestisce la logica di `discardLocalAndDisableClientSideCrud` orchestrando le chiamate `isClientSideCrudActive` e `confirm`.
   */
  async discardLocalAndDisableClientSideCrud() {
    if (!this.datasource?.value || !this.isClientSideCrudActive() || this.clientSideCrudToggleBusy) {
      return;
    }

    const confirmed = await WtoolboxService.confirm({
      header: this.trslSrv.instant('client_side_crud_disable_without_sync'),
      message: this.trslSrv.instant('client_side_crud_discard_confirm_message')
    });

    if (!confirmed) {
      return;
    }

    this.clientSideCrudToggleBusy = true;
    try {
      await this.datasource.value.disableClientSideCrudWithoutSync();
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('client_side_crud_discard_summary'),
        detail: this.trslSrv.instant('client_side_crud_discard_detail')
      });
    } finally {
      this.clientSideCrudToggleBusy = false;
    }
  }

  /**
   * Crea un nuovo record tramite datasource (`addNewRecord`), lo porta in edit mode e sincronizza lo stato locale della griglia.
   */
  addRecord() {
    let header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    let defaulted = this.datasource.value.addNewRecord();

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        record: defaulted,
        pristine: this.datasource.value.pristine,
        metaInfo: this.metaInfo,
        datasource: this.datasource,
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center'
    });

    ref.onClose.subscribe((added: any) => {
      if (added) {
        this.datasource.value.fetchData();
      }
    });
  }

  /**
   * Espande tutte le righe raggruppate presenti nella vista corrente e aggiorna il relativo stato espansione della griglia.
   */
  expandAll() {
    this.expandedRows = this.records.reduce((acc, p) => (acc[p[MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)[0].mc_nome_colonna]] = true) && acc, {});
  }

  /**
   * Gestisce la logica di `collapseAll` con il flusso specifico definito dalla sua implementazione.
   */
  collapseAll() {
    this.expandedRows = {};
  }

  /**
   * Gestisce la logica di `onRowExpand` con il flusso specifico definito dalla sua implementazione.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  onRowExpand(event: TableRowExpandEvent) {
    this.onPTableRowExpand.emit(event);
    // this.messageService.add({ severity: 'info', summary: 'Product Expanded', detail: event.data.name, life: 3000 });
  }

  /**
   * Gestisce la logica di `onRowCollapse` con il flusso specifico definito dalla sua implementazione.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  onRowCollapse(event: TableRowCollapseEvent) {
    this.onPTableRowCollapse.emit(event);
    // this.messageService.add({ severity: 'success', summary: 'Product Collapsed', detail: event.data.name, life: 3000 });
  }

  /**
   * Gestisce la logica operativa di `toggleRow` in modo coerente con l'implementazione corrente.
   * @param item Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @param event Evento che innesca il comportamento del metodo.
   * @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  toggleRow(item: any, event: Event, dt: Table) {
    // Guard: PrimeNG p-table.toggleRow throws "dataKey or groupRowsBy must be
    // defined to use row expansion" se [dataKey] non e' valorizzato. In
    // condizioni normali il list-grid bind `[dataKey]="metaInfo.pKey?.mc_nome_colonna"`
    // (template list-grid.component.html), ma su dashboard con `<wuic-data-source>`
    // hardcoded + metaInfo custom, oppure su route metadata senza colonna PK
    // (`mc_pkey != true` su tutte le colonne), `metaInfo.pKey` resta undefined
    // → il dataKey del p-table e' undefined → click expand crasha. Skippiamo
    // l'espansione con un warning invece di propagare l'eccezione.
    if (!dt?.dataKey) {
      console.warn('[wuic-list-grid] Row expansion skipped: dataKey not set (no primary key column on metaInfo). Configure mc_pkey on a column or remove the expander button for this route.');
      event?.preventDefault?.();
      return;
    }
    dt.toggleRow(item, event);
  };

  /**
   * Gestisce la logica operativa di `rowSelect` in modo coerente con l'implementazione corrente.
   * @param item Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @param event Evento che innesca il comportamento del metodo.
   * @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  rowSelect(item: any, event: any, dt: Table) {
    dt.toggleRowWithCheckbox(event, item);
  };

  /**
   * Gestisce la logica operativa di `onSelectionChange` in modo coerente con l'implementazione corrente.
   * @param selection Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  onSelectionChange(selection: any): void {
    const selected = Array.isArray(selection) ? selection : (selection ? [selection] : []);
    this.selectedItems = selected;
    this.datasource?.value?.setSelectedRows(selected);
    this.onPTableSelectionChange.emit(selected);
  }

  /**
   * Gestisce la logica operativa di `clearColumnFilter` in modo coerente con l'implementazione corrente.
   * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param fetch Flag che abilita/disabilita rami della logica.
   */
  async clearColumnFilter(col: MetadatiColonna, fetch: boolean): Promise<void> {
    this.datasource.value.clearColumnFilter(col, false);
    this.scheduleSyncFilterInfoQueryString();

    if (fetch) {
      await this.datasource.value.fetchData();
      this.scheduleGridViewportHeightSync();
      this.scheduleActionButtonsVisibleRangeSync();
    }
  }

  /**
   * Sincronizza il clear tra API PrimeNG ColumnFilter e datasource applicativo.
   * Applica i 3 fix runtime: clearFilter, initFieldFilterConstraint, hide.
   */
  async onColumnFilterClear(filterCallback: any, col: MetadatiColonna, columnFilterRef?: any): Promise<void> {
    try {
      if (columnFilterRef && typeof columnFilterRef.clearFilter === 'function') {
        columnFilterRef.clearFilter();
      } else if (typeof filterCallback === 'function') {
        filterCallback(null);
      }
    } catch {
      // ignore clear callback failures
    }

    await this.clearColumnFilter(col, true);

    try {
      if (columnFilterRef && typeof columnFilterRef.initFieldFilterConstraint === 'function') {
        columnFilterRef.initFieldFilterConstraint();
      }
      if (columnFilterRef && typeof columnFilterRef.hide === 'function') {
        columnFilterRef.hide();
      }
    } catch {
      // ignore post-clear lifecycle failures
    }

    this.removeEmptyColumnFilterOverlays();
    setTimeout(() => this.removeEmptyColumnFilterOverlays(), 0);
    setTimeout(() => this.removeEmptyColumnFilterOverlays(), 250);
    this.bumpColumnFilterRenderEpoch(col);
    this.cd.detectChanges();
  }

  /**
   * Applica il filtro usando il valore corrente nel descriptor colonna e chiude il menu
   * per evitare overlay orfani dopo il refresh dati.
   */
  onColumnFilterApply(filterCallback: any, col: MetadatiColonna, columnFilterRef?: any, event?: any): void {
    const field = String(col?.mc_nome_colonna || '').trim();
    const descriptor = field ? this.datasource?.value?.filterDescriptor?.[field] : null;

    if (col?.mc_is_range_filter && descriptor) {
      const clickTarget = (event?.originalEvent?.target || event?.target) as HTMLElement | null;
      const overlay = clickTarget?.closest?.('.p-datatable-filter-overlay') as HTMLElement | null;
      const inputs = overlay ? Array.from(overlay.querySelectorAll('.wuic-range-filter-item input')) as HTMLInputElement[] : [];
      const fromRaw = String(inputs[0]?.value ?? '').trim();
      const toRaw = String(inputs[1]?.value ?? '').trim();

      if (!this.metaInfo?.operators) {
        this.metaInfo.operators = {};
      }
      if (field) {
        this.metaInfo.operators[field] = 'between';
      }

      if (fromRaw !== '' && toRaw !== '') {
        descriptor.next(JSON.stringify({ from: fromRaw, to: toRaw }));
      } else {
        descriptor.next(null);
      }
    }

    const nextValue = descriptor ? descriptor.value : null;

    try {
      if (typeof filterCallback === 'function') {
        filterCallback(nextValue);
      }
    } catch {
      // ignore apply callback failures; datasource fetch will surface real errors
    }

    // Let PrimeNG emit onFilter first, then close/cleanup possible orphan overlay.
    setTimeout(() => {
      try {
        if (columnFilterRef && typeof columnFilterRef.hide === 'function') {
          columnFilterRef.hide();
        }
      } catch {
        // ignore hide failures
      }
      this.removeEmptyColumnFilterOverlays();
    }, 0);
  }

  getColumnFilterRenderEpoch(col: MetadatiColonna): number {
    const field = String(col?.mc_nome_colonna || '').trim();
    if (!field) {
      return 0;
    }

    return Number(this.columnFilterRenderEpochByField[field] || 0);
  }

  onColumnFilterMenuShow(col: MetadatiColonna, columnFilterRef?: any): void {
    try {
      if (columnFilterRef && typeof columnFilterRef.initFieldFilterConstraint === 'function') {
        columnFilterRef.initFieldFilterConstraint();
      }
    } catch {
      // ignore init failures and continue with template rebuild
    }

    this.bumpColumnFilterRenderEpoch(col);
    this.cd.detectChanges();
  }

  private bumpColumnFilterRenderEpoch(col: MetadatiColonna): void {
    const field = String(col?.mc_nome_colonna || '').trim();
    if (!field) {
      return;
    }

    this.columnFilterRenderEpochByField[field] = (this.columnFilterRenderEpochByField[field] || 0) + 1;
  }

  /**
   * Rimuove overlay filtro PrimeNG rimasti vuoti/orfani dopo clear.
   */
  private removeEmptyColumnFilterOverlays(): void {
    try {
      const overlays = Array.from(document.querySelectorAll('.p-datatable-filter-overlay')) as HTMLElement[];
      overlays.forEach((overlay) => {
        overlay.remove();
      });
    } catch {
      // ignore DOM cleanup failures
    }
  }

  /**
   * Valuta la condizione gestita da `hasActiveFilter` restituendo un esito utile al flusso.
   * @param col Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Esito booleano restituito da `hasActiveFilter`.
   */
  hasActiveFilter(col: MetadatiColonna) {
    const filters = this.datasource?.value?.filterInfo?.filters;
    if (!filters?.length) {
      return false;
    }

    return filters.some(f => f.field === col.mc_nome_colonna && f.value !== null && f.value !== undefined && f.value !== '');
  }

  /**
   * Gestisce la logica operativa di `showActionColumn` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `showActionColumn` e restituito al chiamante.
   */
  showActionColumn() {
    const t = this.metaInfo?.tableMetadata;
    return !!(t && (t.md_editable || t.md_deletable || t.md_detail_action || t.md_clonable || t.md_inline_edit));
  }

  /**
   * Valuta una condizione di stato o validita usando i metadati per determinare campi, chiavi e comportamento runtime.
   * @param col Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   * @returns Esito booleano del controllo/elaborazione effettuato dal metodo.
   */
  isColumnSortable(col: any): boolean {
    const tableSortable = !!this.metaInfo?.tableMetadata?.md_sortable;
    if (!tableSortable || !col?.metaColumn) {
      return false;
    }

    const uiType = String(col.metaColumn.mc_ui_column_type || '').trim().toLowerCase();
    const dbType = String(col.metaColumn.mc_db_column_type || '').trim().toLowerCase();
    const isSpatialType =
      uiType === 'point'
      || uiType === 'polygon'
      || uiType.includes('point')
      || uiType.includes('polygon')
      || dbType === 'point'
      || dbType === 'polygon'
      || dbType.includes('point')
      || dbType.includes('polygon')
      || dbType.includes('geometry')
      || dbType.includes('geography');

    if (isSpatialType) {
      return false;
    }

    return !col.metaColumn.mc_disable_sorting;
  }

  /**
   * Mappa l'operatore WUIC corrente (scelto dall'utente nel dropdown
   * dentro `<wuic-field-filter>`) al `matchMode` di p-columnFilter.
   *
   * Importante per la modalita' non-lazy (client-side, `md_server_side_operations: false`):
   * il matchMode di p-table controlla il filtering interno sull'array `[value]`.
   * Se non rispecchia l'operatore scelto dall'utente, p-table userebbe sempre
   * lo stesso match (es. sempre `contains` per text) ignorando "starts with",
   * "equals", ecc. → l'utente vede il dropdown ma la sua scelta non ha effetto.
   *
   * In modalita' lazy (server-side) il matchMode e' solo metadata UI: il
   * filtering reale avviene server-side via `filterInfo.operatore` (sempre
   * sincronizzato col dropdown). Quindi questo mapping non e' critico li',
   * ma rispecchia comunque la scelta utente per coerenza.
   *
   * Mapping WUIC -> PrimeNG:
   *   eq -> equals      ne -> notEquals
   *   lt -> lt          le -> lte
   *   gt -> gt          ge -> gte
   *   contains -> contains    notcontains -> notContains
   *   startswith -> startsWith   endswith -> endsWith
   *   between -> between
   *   eqor -> in
   *
   * Fallback se nessun operatore selezionato: default per column type
   * (text -> contains, number/date -> equals, lookup multicheck -> in).
   */
  getPrimeNgMatchMode(metaColumn: any): string {
    if (!!metaColumn?.mc_is_range_filter) {
      return 'between';
    }

    const fieldName = String(metaColumn?.mc_nome_colonna || '');
    const currentOp = String(this.metaInfo?.operators?.[fieldName] || '').toLowerCase();

    if (currentOp) {
      const wuicToPrimeNg: { [key: string]: string } = {
        'eq': 'equals',
        'ne': 'notEquals',
        'lt': 'lt',
        'le': 'lte',
        'gt': 'gt',
        'ge': 'gte',
        'contains': 'contains',
        'notcontains': 'notContains',
        'startswith': 'startsWith',
        'endswith': 'endsWith',
        'between': 'between',
        'eqor': 'in'
      };
      const mapped = wuicToPrimeNg[currentOp];
      if (mapped) {
        return mapped;
      }
    }

    // Fallback: default per column type quando l'operatore non e' settato.
    const colType = String(metaColumn?.mc_ui_column_type || '').toLowerCase();

    if (colType === 'text' || colType === 'txt_area' || colType === 'html_area' || colType === 'code_editor') {
      return 'contains';
    }

    if (colType === 'multiple_check') {
      return 'in';
    }

    if (colType === 'lookupbyid' && !!metaColumn?.mc_is_multicheck_filter) {
      return 'in';
    }

    return 'equals';
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncFilterInfoQueryString` orchestrando le chiamate `syncGridStateQueryString`.
   */
  private syncFilterInfoQueryString() {
    this.syncGridStateQueryString();
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncGridStateQueryString` allineando lo stato con parametri route/query, trasformando e filtrando collezioni dati, coordinando la navigazione applicativa.
   */
  private syncGridStateQueryString() {
    if (!this.datasource?.value) {
      return;
    }

    // Nested grids (row expanders, data-repeaters) must not push their state to the URL.
    if (this.isNestedGridInstance()) {
      return;
    }

    const filterInfo = this.datasource.value.filterInfo;
    const hasFilters = !!filterInfo?.filters?.length;
    const pageSize = Number(this.datasource.value.pageSize || this.pageSize || 0);
    const currentPage = Number(this.datasource.value.currentPage || this.pageIndex || 1);
    const hasPaging = Number.isFinite(pageSize) && pageSize > 0 && Number.isFinite(currentPage) && currentPage > 0;
    const sortInfo = this.datasource.value.sortInfo;
    const hasSort = !!sortInfo?.length;

    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        filterInfo: hasFilters ? JSON.stringify(filterInfo) : null,
        filterinfo: null,
        pageInfo: hasPaging ? JSON.stringify({ currentPage: Math.trunc(currentPage), pageSize: Math.trunc(pageSize) }) : null,
        pageinfo: null,
        sortInfo: hasSort ? JSON.stringify(sortInfo.map(s => ({ field: s.field, dir: s.dir }))) : null,
        sortinfo: null
      },
      queryParamsHandling: 'merge'
    });

    this.pushGridStateUrl(tree);
  }

  /**
   * Gestisce la logica di `clearGridStateQueryString` allineando lo stato con parametri route/query, coordinando la navigazione applicativa.
   */
  private clearGridStateQueryString() {
    const tree = this.router.createUrlTree([], {
      relativeTo: this.route,
      queryParams: {
        filterInfo: null,
        filterinfo: null,
        pageInfo: null,
        pageinfo: null,
        sortInfo: null,
        sortinfo: null
      },
      queryParamsHandling: 'merge'
    });

    this.pushGridStateUrl(tree);
  }

  /**
   * Gestisce la logica di `scheduleSyncFilterInfoQueryString` orchestrando le chiamate `clearTimeout` e `setTimeout`.
   */
  private scheduleSyncFilterInfoQueryString() {
    if (this.syncFilterInfoQueryTimer) {
      clearTimeout(this.syncFilterInfoQueryTimer);
    }

    this.syncFilterInfoQueryTimer = setTimeout(() => {
      this.syncFilterInfoQueryTimer = undefined;
      this.syncFilterInfoQueryString();
    }, 250);
  }

  /**
   * Gestisce la logica operativa di `scheduleSyncGridStateQueryString` in modo coerente con l'implementazione corrente.
   * @param delayMs Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private scheduleSyncGridStateQueryString(delayMs: number = 25) {
    if (this.syncGridStateQueryTimer) {
      clearTimeout(this.syncGridStateQueryTimer);
    }

    this.syncGridStateQueryTimer = setTimeout(() => {
      this.syncGridStateQueryTimer = undefined;
      this.syncGridStateQueryString();
    }, delayMs);
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncPageInfoQueryString` orchestrando le chiamate `scheduleSyncGridStateQueryString`.
   */
  private syncPageInfoQueryString() {
    this.scheduleSyncGridStateQueryString();
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncSortInfoQueryString` orchestrando le chiamate `scheduleSyncGridStateQueryString`.
   */
  private syncSortInfoQueryString() {
    this.scheduleSyncGridStateQueryString();
  }

  /**
   * Gestisce la logica operativa di `pushGridStateUrl` in modo coerente con l'implementazione corrente.
   * @param tree Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private pushGridStateUrl(tree: any) {
    if (this.suppressGridStateUrlPush) {
      return;
    }

    const nextUrl = this.router.serializeUrl(tree);
    const currentUrl = this.location.path(true);

    if (this.areUrlsEquivalent(nextUrl, currentUrl)) {
      return;
    }

    this.location.go(nextUrl);
  }

  /**
   * Gestisce la logica di `areUrlsEquivalent` allineando lo stato con parametri route/query, trasformando e filtrando collezioni dati, coordinando la navigazione applicativa.
   * @param aUrl Informazioni di routing usate per risolvere il contesto o comporre la navigazione.
   * @param bUrl Informazioni di routing usate per risolvere il contesto o comporre la navigazione.
   * @returns Esito booleano calcolato dal metodo.
   */
  private areUrlsEquivalent(aUrl: string, bUrl: string) {
    if (aUrl === bUrl) {
      return true;
    }

    const a = this.router.parseUrl(aUrl);
    const b = this.router.parseUrl(bUrl);

    const aPrimary = a.root.children['primary'];
    const bPrimary = b.root.children['primary'];
    const aPath = aPrimary ? aPrimary.segments.map(s => s.path).join('/') : '';
    const bPath = bPrimary ? bPrimary.segments.map(s => s.path).join('/') : '';

    if (aPath !== bPath) {
      return false;
    }

    return this.normalizedQueryParams(a.queryParams) === this.normalizedQueryParams(b.queryParams);
  }

  /**
   * Gestisce la logica operativa di `normalizedQueryParams` in modo coerente con l'implementazione corrente.
   * @param queryParams Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Risultato elaborato da `normalizedQueryParams` e restituito al chiamante.
   */
  private normalizedQueryParams(queryParams: any) {
    const normalized: any = {};

    Object.keys(queryParams || {})
      .sort()
      .forEach((key) => {
        const value = queryParams[key];
        normalized[key] = Array.isArray(value) ? [...value].map(v => `${v}`) : `${value}`;
      });

    return JSON.stringify(normalized);
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `toLowerCase` e `trim`.
   * @param route Informazioni di routing usate per comporre o risolvere la navigazione.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private getRouteKey(route?: string): string {
    return String(route || '').trim().toLowerCase();
  }

  /**
   * Recupera informazioni tramite `getCurrentRouteColumnWidths` orchestrando le chiamate `getRouteKey` e `keys`.
   * @returns Valore di tipo `{ [field: string]: number }` restituito dal metodo.
   */
  private getCurrentRouteColumnWidths(): { [field: string]: number } {
    const routeKey = this.getRouteKey(this.routeName);
    const fromRuntime = this.persistedColumnWidthsByRoute[routeKey];
    if (fromRuntime && Object.keys(fromRuntime).length > 0) {
      return fromRuntime;
    }

    const routeStates = this.persistedGridStatesByRoute[routeKey] || [];
    const targetStateId = String(this.selectedSavedStateId || '');
    const preferredState = routeStates.find((s) => !!s.isDefault);
    const selectedState = targetStateId
      ? routeStates.find((s) => s.id === targetStateId)
      : undefined;
    const effectiveState = selectedState || preferredState;
    const normalized = this.normalizePersistedColumnWidthMap({
      [routeKey]: effectiveState?.columnWidths || {}
    })[routeKey] || {};

    this.persistedColumnWidthsByRoute[routeKey] = normalized;
    return normalized;
  }

  /**
   * Recupera informazioni tramite `getCurrentRouteColumnLayout` orchestrando le chiamate `getRouteKey`.
   * @returns Valore di tipo `ListGridColumnLayout` restituito dal metodo.
   */
  private getCurrentRouteColumnLayout(): ListGridColumnLayout {
    const routeKey = this.getRouteKey(this.routeName);
    const selectedStateId = String(this.selectedSavedStateId || '');
    if (routeKey && selectedStateId) {
      const selectedState = (this.persistedGridStatesByRoute[routeKey] || []).find((s) => s.id === selectedStateId);
      if (selectedState?.columnLayout) {
        return this.normalizePersistedColumnLayoutMap({ [routeKey]: selectedState.columnLayout })[routeKey] || this.buildEmptyColumnLayout();
      }
    }

    return this.persistedColumnLayoutByRoute[routeKey] || this.buildEmptyColumnLayout();
  }

  /**
   * Apre il dialog layout colonne precompilato con ordine/larghezze correnti per consentire all'utente di personalizzare la griglia.
   */
  openColumnLayoutDialog() {
    this.columnLayoutDraft = (this.cols || [])
      .filter((c: any) => !!c?.field && c?.metaColumn?.mc_ui_column_type !== 'button' && !c?.metaColumn?.mc_hide_in_list)
      .map((c: any) => ({
        field: String(c.field),
        header: String(c.header || c.field),
        visible: !c.hidden
      }));
    this.columnLayoutDialogVisible = true;
  }

  /**
   * Gestisce la logica operativa di `resetColumnLayoutDraftToMetadata` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `resetColumnLayoutDraftToMetadata` e restituito al chiamante.
   */
  resetColumnLayoutDraftToMetadata() {
    if (!Array.isArray(this.metas) || !this.metas.length) {
      return;
    }

    this.columnLayoutDraft = this.metas
      .filter((c: MetadatiColonna) => !!c?.mc_nome_colonna && c.mc_ui_column_type !== 'button' && !c.mc_hide_in_list)
      .sort((a: MetadatiColonna, b: MetadatiColonna) => {
        const aOrder = Number((a as any)?.mc_sort_order);
        const bOrder = Number((b as any)?.mc_sort_order);
        const aValid = Number.isFinite(aOrder);
        const bValid = Number.isFinite(bOrder);

        if (aValid && bValid) {
          return aOrder - bOrder;
        }
        if (aValid) {
          return -1;
        }
        if (bValid) {
          return 1;
        }
        return 0;
      })
      .map((c: MetadatiColonna) => ({
        field: String(c.mc_nome_colonna),
        header: String(c.mc_display_string_in_view || c.mc_nome_colonna),
        visible: !c.mc_hide_in_list
      }));
  }

  /**
   * Gestisce la logica di `resetColumnLayoutDraftAndWidths` orchestrando le chiamate `resetColumnLayoutDraftToMetadata` e `saveColumnLayoutFromDialog`.
   */
  async resetColumnLayoutDraftAndWidths() {
    this.resetColumnLayoutDraftToMetadata();
    await this.saveColumnLayoutFromDialog();
    await this.resetCurrentRouteColumnWidths();
  }

  /**
   * Gestisce la logica operativa di `moveColumnLayoutDraft` in modo coerente con l'implementazione corrente.
   * @param index Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param direction Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  moveColumnLayoutDraft(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (!Array.isArray(this.columnLayoutDraft) || index < 0 || target < 0 || index >= this.columnLayoutDraft.length || target >= this.columnLayoutDraft.length) {
      return;
    }

    const copy = [...this.columnLayoutDraft];
    const tmp = copy[index];
    copy[index] = copy[target];
    copy[target] = tmp;
    this.columnLayoutDraft = copy;
  }

  /**
   * Salva ordine, visibilità e larghezza colonne nel profilo route corrente e applica immediatamente il layout persistito alla griglia.
   */
  async saveColumnLayoutFromDialog() {
    if (!this.columnLayoutDraft?.length || !this.cols?.length) {
      this.columnLayoutDialogVisible = false;
      return;
    }

    const draftByField = new Map(this.columnLayoutDraft.map((d) => [d.field, d]));
    const reordered = this.columnLayoutDraft
      .map((d) => (this.cols || []).find((c: any) => String(c.field) === d.field))
      .filter((c): c is any => !!c)
      .map((c: any) => ({
        ...c,
        hidden: c?.metaColumn?.mc_ui_column_type === 'button'
          ? true
          : !(draftByField.get(String(c.field))?.visible ?? true)
      }));

    const existingNotInDraft = (this.cols || [])
      .filter((c: any) => !draftByField.has(String(c.field)))
      .map((c: any) => ({
        ...c,
        hidden: c?.metaColumn?.mc_ui_column_type === 'button'
          ? true
          : !!c?.metaColumn?.mc_hide_in_list
            ? true
            : !!c?.hidden
      }));

    this.cols = [...reordered, ...existingNotInDraft];
    this.columnLayoutDialogVisible = false;
    this.cd.detectChanges();
    await this.persistCurrentRouteColumnLayoutFromCols();
  }

  /**
   * Gestisce la logica operativa di `extractVisibleColumnOrderFromReorderEvent` trasformando e filtrando collezioni dati.
   * @param event Evento UI o payload evento che innesca il flusso del metodo.
   * @returns Collezione di tipo `string[]` risultante dalle trasformazioni applicate dal metodo.
   */
  private extractVisibleColumnOrderFromReorderEvent(event: any): string[] {
    const fromEventColumns = Array.isArray(event?.columns)
      ? event.columns
        .map((c: any) => String(c?.field || ''))
        .filter((f: string) => !!f)
      : [];
    if (fromEventColumns.length) {
      return fromEventColumns;
    }

    const tableElement = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!tableElement) {
      return [];
    }

    return Array.from(tableElement.querySelectorAll('th[data-field]'))
      .map((th) => String((th as HTMLElement).getAttribute('data-field') || ''))
      .filter((f) => !!f);
  }

  /**
   * Applica aggiornamenti di stato tramite `applyPersistedColumnOrder` trasformando e filtrando collezioni dati.
   * @param cols Collezione di input processata dal metodo.
   * @param order Collezione di input processata dal metodo.
   * @returns Collezione di tipo `any[]` risultante dalle trasformazioni applicate dal metodo.
   */
  private applyPersistedColumnOrder(cols: any[], order: string[]): any[] {
    if (!Array.isArray(cols) || !cols.length) {
      return [];
    }

    if (!Array.isArray(order) || !order.length) {
      return cols;
    }

    const byField = new Map(cols.map((c: any) => [String(c.field), c]));
    const ordered = order
      .map((field) => byField.get(String(field)))
      .filter((c): c is any => !!c);
    const missing = cols.filter((c: any) => !order.includes(String(c.field)));
    return [...ordered, ...missing];
  }

  /**
   * Gestisce la logica di `persistCurrentRouteColumnLayoutFromCols` trasformando e filtrando collezioni dati.
   */
  private async persistCurrentRouteColumnLayoutFromCols() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!routeKey || userId === null || userId === undefined) {
      return;
    }

    const order = (this.cols || [])
      .map((c: any) => String(c?.field || ''))
      .filter((f: string) => !!f);
    const hidden = (this.cols || [])
      .filter((c: any) => !!c?.hidden)
      .map((c: any) => String(c.field));
    const metadataForcedHidden = (this.metas || [])
      .filter((c: MetadatiColonna) => !!c?.mc_hide_in_list && !!c?.mc_nome_colonna)
      .map((c: MetadatiColonna) => String(c.mc_nome_colonna));
    // Persist pinning using only explicit user choice (`pinSide`) to avoid
    // accidental pollution from runtime table flags (frozen/align mutations).
    const pinnedLeft = (this.cols || [])
      .filter((c: any) => String(c?.pinSide || '').toLowerCase() === 'left')
      .map((c: any) => String(c.field));
    const pinnedRight = (this.cols || [])
      .filter((c: any) => String(c?.pinSide || '').toLowerCase() === 'right')
      .map((c: any) => String(c.field));

    const normalizedLayout = this.normalizePersistedColumnLayoutMap({
      [routeKey]: {
        order: Array.from(new Set(order)),
        hidden: Array.from(new Set([...hidden, ...metadataForcedHidden])),
        pinnedLeft: Array.from(new Set(pinnedLeft)),
        pinnedRight: Array.from(new Set(pinnedRight))
      }
    })[routeKey] || this.buildEmptyColumnLayout();

    this.persistedColumnLayoutByRoute[routeKey] = normalizedLayout;

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    const selectedStateId = String(this.selectedSavedStateId || '');
    const hasValidSelectedState = !!selectedStateId && routeStates.some((s) => s.id === selectedStateId);
    const preferredState = routeStates.find((s) => !!s.isDefault);
    let effectiveTargetId = hasValidSelectedState ? selectedStateId : String(preferredState?.id || '');

    if (!effectiveTargetId) {
      const now = new Date();
      effectiveTargetId = `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
      const seededState: ListGridSavedState = {
        id: effectiveTargetId,
        name: 'default',
        description: 'default',
        isDefault: true,
        createdAt: now.toISOString(),
        filterInfo: this.deepClone(this.datasource?.value?.filterInfo || { logic: "AND", filters: [] }),
        sortInfo: this.deepClone(this.datasource?.value?.sortInfo || []),
        pageInfo: {
          currentPage: Number(this.datasource?.value?.currentPage || this.pageIndex || 1),
          pageSize: Number(this.datasource?.value?.pageSize || this.pageSize || 10)
        },
        columnWidths: this.deepClone(this.getCurrentRouteColumnWidths()),
        columnLayout: this.deepClone(normalizedLayout)
      };
      routeStates.push(seededState);
      this.selectedSavedStateId = effectiveTargetId;
    }

    if (effectiveTargetId) {
      const targetStateIndex = routeStates.findIndex((s) => s.id === effectiveTargetId);
      if (targetStateIndex >= 0) {
        routeStates[targetStateIndex] = {
          ...routeStates[targetStateIndex],
          columnLayout: this.deepClone(normalizedLayout)
        };
        this.persistedGridStatesByRoute[routeKey] = routeStates;
        this.metaSrv.setCustomSettingInLocalStorage(
          ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY,
          this.persistedColumnLayoutByRoute,
          userId
        );
        await this.metaSrv.saveCustomSettings(
          userId,
          this.persistedColumnLayoutByRoute,
          ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY
        );
        this.refreshCurrentRouteSavedStates();
        await this.persistGridStatesSettings();
        return;
      }
    }

    this.persistedColumnLayoutByRoute[routeKey] = normalizedLayout;
    this.metaSrv.setCustomSettingInLocalStorage(
      ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY,
      this.persistedColumnLayoutByRoute,
      userId
    );

    await this.metaSrv.saveCustomSettings(
      userId,
      this.persistedColumnLayoutByRoute,
      ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY
    );
  }

  /**
   * Gestisce la logica di `loadPersistedColumnLayoutFromLocalStorage` orchestrando le chiamate `getCustomSettingFromLocalStorage` e `normalizePersistedColumnLayoutMap`.
   */
  private loadPersistedColumnLayoutFromLocalStorage() {
    const cached = this.metaSrv.getCustomSettingFromLocalStorage<{ [routeKey: string]: ListGridColumnLayout }>(
      ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY
    );

    if (cached && typeof cached === 'object') {
      this.persistedColumnLayoutByRoute = this.normalizePersistedColumnLayoutMap(cached);
      return;
    }

    this.persistedColumnLayoutByRoute = {};
  }

  /**
   * Gestisce la logica di `hydratePersistedColumnLayoutFromServerIfNeeded` orchestrando le chiamate `keys` e `getuserInfo`.
   */
  private async hydratePersistedColumnLayoutFromServerIfNeeded() {
    if (this.remoteColumnLayoutHydrationInFlight) {
      return;
    }

    const hasLocal = Object.keys(this.persistedColumnLayoutByRoute || {}).length > 0;
    if (hasLocal) {
      return;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (userId === null || userId === undefined) {
      return;
    }

    this.remoteColumnLayoutHydrationInFlight = true;
    try {
      const remote = await this.metaSrv.readCustomSettings(userId, ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY);
      if (!remote || typeof remote !== 'object') {
        return;
      }

      this.persistedColumnLayoutByRoute = this.normalizePersistedColumnLayoutMap(remote);
      this.metaSrv.setCustomSettingInLocalStorage(
        ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY,
        this.persistedColumnLayoutByRoute,
        userId
      );

      if (this.metas?.length) {
        this.cols = this.parseColumns(this.metas);
        this.cd.detectChanges();
      }
    } catch {
      // Keep grid rendering stable even when custom settings endpoint is unavailable.
    } finally {
      this.remoteColumnLayoutHydrationInFlight = false;
    }
  }

  /**
   * Gestisce la logica di `captureResizedColumnWidth` orchestrando le chiamate `captureAllColumnWidthsFromTableDom`.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  private captureResizedColumnWidth(event: any) {
    const routeKey = this.getRouteKey(this.routeName);
    if (!routeKey) {
      return;
    }

    const resizedField = this.getFieldFromResizeEvent(event);
    if (!resizedField) {
      this.captureAllColumnWidthsFromTableDom(event);
      return;
    }

    const widths: { [field: string]: number } = { ...this.getCurrentRouteColumnWidths() };
    const minWidthPx = Number.parseFloat(this.getColumnMinWidthCss()) || 10;
    const previousWidth = Number(widths[resizedField] ?? this.cols?.find((c: any) => String(c?.field || '') === resizedField)?.width);
    const delta = Number(event?.delta);

    let widthFromDelta = NaN;
    if (Number.isFinite(previousWidth) && previousWidth > 0 && Number.isFinite(delta)) {
      widthFromDelta = previousWidth + delta;
    }

    const resizedElement =
      event?.element
      || event?.columnElement
      || event?.column?.el?.nativeElement
      || null;

    let widthFromDom = Number(resizedElement?.getBoundingClientRect?.().width);
    if (!Number.isFinite(widthFromDom) || widthFromDom <= 0) {
      widthFromDom = Number(resizedElement?.offsetWidth);
    }
    if (!Number.isFinite(widthFromDom) || widthFromDom <= 0) {
      const eventWidth = this.getWidthFromResizeEvent(event);
      if (Number.isFinite(eventWidth) && eventWidth > 0) {
        widthFromDom = eventWidth;
      }
    }

    // Salviamo SEMPRE quello che il browser renderizza realmente
    // (`widthFromDom`), NON il target "ideale" calcolato dalla delta
    // (`widthFromDelta`). Al refresh il browser, ricevendo lo stesso valore
    // gia' "browser-distributed", riproduce esattamente lo stesso layout
    // → match deterministico. Funziona simmetricamente per delta+ (espansione)
    // e delta- (riduzione): in entrambi i casi il valore renderizzato e' quello
    // che il browser ha effettivamente assegnato dopo aver risolto i constraints
    // (min-content del cell, table-layout, container width, ecc.).
    //
    // Il vecchio path "Math.max(delta, dom)" / "Math.min(delta, dom)" tendeva
    // a salvare il target ideale, ma poi al refresh il browser shrinka di nuovo
    // → mismatch persistente tra screenshot pre/post-refresh.
    let resizedWidth = NaN;
    if (Number.isFinite(widthFromDom) && widthFromDom > 0) {
      resizedWidth = widthFromDom;
    } else if (Number.isFinite(widthFromDelta) && widthFromDelta > 0) {
      resizedWidth = widthFromDelta;
    }

    if (!Number.isFinite(resizedWidth) || resizedWidth <= 0) {
      return;
    }

    widths[resizedField] = Number(Math.max(minWidthPx, resizedWidth).toFixed(2));

    this.persistedColumnWidthsByRoute[routeKey] = widths;
    this.cols = (this.cols || []).map((c: any) => {
      const persisted = widths[String(c?.field || '')];
      if (Number.isFinite(persisted) && persisted > 0) {
        return {
          ...c,
          width: persisted,
          widthPercent: undefined
        };
      }
      return {
        ...c,
        widthPercent: undefined
      };
    });
  }

  /**
   * Gestisce la logica di `captureAllColumnWidthsFromTableDom` trasformando e filtrando collezioni dati.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  private captureAllColumnWidthsFromTableDom(event: any) {
    const safeDelta = Number(event?.delta);
    const normalizedDelta = Number.isFinite(safeDelta) && safeDelta < 0 ? safeDelta : 0;
    const baseWidth = this.getWidthFromResizeEvent(event);
    const currentWidth = Number.isFinite(baseWidth) ? (baseWidth + normalizedDelta) : NaN;
    const currentField = this.getFieldFromResizeEvent(event);

    const tableElement = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!tableElement) {
      return;
    }

    const widths: { [field: string]: number } = { ...this.getCurrentRouteColumnWidths() };
    const headers = tableElement.querySelectorAll('th[data-field]');

    headers.forEach((th) => {
      const field = (th as HTMLElement).getAttribute('data-field');
      if (!field) {
        return;
      }

      const preciseWidth = Number((th as HTMLElement).getBoundingClientRect().width.toFixed(2));
      if (Number.isFinite(preciseWidth) && preciseWidth > 0) {
        widths[field] = preciseWidth;
      }
    });

    const routeKey = this.getRouteKey(this.routeName);
    if (!routeKey) {
      return;
    }

    if (currentField && Number.isFinite(currentWidth) && currentWidth > 0) {
      widths[currentField] = currentWidth;
    }

    this.persistedColumnWidthsByRoute[routeKey] = widths;
    this.cols = this.cols.map((c: any) => ({
      ...c,
      width: widths[c.field] || c.width,
      widthPercent: undefined
    }));
  }

  /**
   * Gestisce la logica di `persistCurrentRouteColumnWidths` trasformando e filtrando collezioni dati.
   */
  private async persistCurrentRouteColumnWidths() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!routeKey || userId === null || userId === undefined) {
      return;
    }

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    if (!routeStates.length) {
      const nnow = new Date();
      routeStates.push({
        id: `${nnow.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
        name: 'default',
        description: 'default',
        isDefault: true,
        createdAt: nnow.toISOString(),
        filterInfo: { logic: "AND", filters: [] },
        sortInfo: [],
        pageInfo: null,
        columnWidths: {},
        columnLayout: this.deepClone(this.getCurrentRouteColumnLayout())
      });
    }

    const targetStateId = String(this.selectedSavedStateId || '');
    const preferredState = routeStates.find((s) => !!s.isDefault);
    const hasValidSelectedState = !!targetStateId && routeStates.some((s) => s.id === targetStateId);
    let effectiveTargetId = hasValidSelectedState ? targetStateId : (preferredState?.id || '');

    if (!effectiveTargetId) {
      const now = new Date();
      effectiveTargetId = `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
      const seededState: ListGridSavedState = {
        id: effectiveTargetId,
        name: 'default',
        description: 'default',
        isDefault: true,
        createdAt: now.toISOString(),
        filterInfo: this.deepClone(this.datasource?.value?.filterInfo || { logic: "AND", filters: [] }),
        sortInfo: this.deepClone(this.datasource?.value?.sortInfo || []),
        pageInfo: {
          currentPage: Number(this.datasource?.value?.currentPage || this.pageIndex || 1),
          pageSize: Number(this.datasource?.value?.pageSize || this.pageSize || 10)
        },
        columnWidths: {},
        columnLayout: this.deepClone(this.getCurrentRouteColumnLayout())
      };
      routeStates.push(seededState);
      this.selectedSavedStateId = effectiveTargetId;
    }

    const normalizedWidths = this.normalizePersistedColumnWidthMap({
      [routeKey]: this.persistedColumnWidthsByRoute[routeKey] || {}
    })[routeKey] || {};

    this.persistedGridStatesByRoute[routeKey] = routeStates.map((s) => (
      s.id === effectiveTargetId
        ? { ...s, columnWidths: normalizedWidths }
        : s
    ));
    this.refreshCurrentRouteSavedStates();
    await this.persistGridStatesSettings();
  }

  /**
   * Gestisce la logica di `resetCurrentRouteColumnWidths` trasformando e filtrando collezioni dati.
   */
  async resetCurrentRouteColumnWidths() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!routeKey || userId === null || userId === undefined) {
      return;
    }

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    const hasStateColumnWidths = routeStates.some((s) =>
      !!s?.columnWidths && Object.keys(s.columnWidths).length > 0
    );
    const runtimeWidths = this.persistedColumnWidthsByRoute[routeKey] || {};
    const hasRuntimeColumnWidths = Object.keys(runtimeWidths).length > 0;
    const hasRouteSettings = hasStateColumnWidths || hasRuntimeColumnWidths;

    if (hasRouteSettings) {
      const confirmed = await WtoolboxService.confirm({
        header: this.trslSrv.instant('list_grid.reset_columns_header'),
        message: this.trslSrv.format(this.trslSrv.instant('list_grid.reset_columns_message'), this.routeName)
      });
      if (!confirmed) {
        return;
      }
    }

    if (routeStates.length) {
      this.persistedGridStatesByRoute[routeKey] = routeStates.map((s) => ({
        ...s,
        columnWidths: {}
      }));
      this.refreshCurrentRouteSavedStates();
    }
    this.persistedColumnWidthsByRoute[routeKey] = {};
    this.manualResizeDisablesProportionalByRoute[routeKey] = false;
    this.currentRouteSavedStates = (this.currentRouteSavedStates || []).map((s) => ({
      ...s,
      columnWidths: {}
    }));
    await this.persistGridStatesSettings();

    this.clearInlineColumnWidthStylesFromTableDom();

    if (this.metas?.length) {
      this.cols = this.parseColumns(this.metas).map((c: any) => {
        if (this.isProportionalColwidthEnabled()) {
          return c;
        }

        return {
          ...c,
          width: this.getMetadataDefaultColumnWidth(c?.metaColumn)
        };
      });
      if (!this.isProportionalColwidthEnabled()) {
        this.width_defined = this.cols.some((c: any) => Number.isFinite(Number(c?.width)) && Number(c.width) > 0)
          ? 'width_defined'
          : null;
      }
      this.cd.detectChanges();

      // PrimeNG may re-apply previous DOM widths during table repaint; clear them again after render.
      setTimeout(() => {
        this.clearInlineColumnWidthStylesFromTableDom();
      }, 0);
    }
  }

  /**
   * Gestisce la logica di `clearInlineColumnWidthStylesFromTableDom` orchestrando le chiamate `removeProperty` e `querySelectorAll`.
   */
  private clearInlineColumnWidthStylesFromTableDom() {
    const tableElement = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!tableElement) {
      return;
    }

    const clearWidthStyles = (el: HTMLElement) => {
      el.style.removeProperty('width');
      el.style.removeProperty('min-width');
      el.style.removeProperty('max-width');
    };

    tableElement.querySelectorAll('th[data-field]').forEach((th) => {
      clearWidthStyles(th as HTMLElement);
    });

    tableElement.querySelectorAll('colgroup col').forEach((col) => {
      clearWidthStyles(col as HTMLElement);
    });
  }

  /**
   * Restituisce la larghezza default colonna leggendo la configurazione metadato (`mc_ui_grid_width` e fallback applicativi).
   * @param metaColumn Metadati del contesto usati per guidare logica runtime e rendering.
   * @returns Valore di tipo `number | undefined` restituito dal metodo.
   */
  private getMetadataDefaultColumnWidth(metaColumn: any): number | undefined {
    const raw = metaColumn?.mc_ui_grid_size_width;
    if (raw === null || raw === undefined) {
      return undefined;
    }

    const asNumber = Number(raw);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
      return undefined;
    }

    return asNumber;
  }

  /**
   * Indica se la route corrente ha larghezze persistite valide.
   * @param routeWidths Mappa larghezze route corrente.
   * @returns True quando esiste almeno una larghezza persistita.
   */
  private hasPersistedColumnWidths(routeWidths?: { [field: string]: number }): boolean {
    const map = routeWidths || this.getCurrentRouteColumnWidths();
    return !!map && Object.keys(map).length > 0;
  }

  /**
   * Determina se la griglia deve distribuire le colonne in modo proporzionale
   * leggendo `md_props_bag.archetypes.list.proportionalColwidth`.
   * @returns True quando la modalita proporzionale e attiva.
   */
  private isProportionalColwidthEnabled(): boolean {
    const routeKey = this.getRouteKey(this.routeName);
    if (routeKey && this.manualResizeDisablesProportionalByRoute[routeKey]) {
      return false;
    }

    const raw = this.metaInfo?.tableMetadata?.extraProps?.archetypes?.list?.proportionalColwidth;
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return true;
    }

    if (raw === false || raw === 0 || raw === '0') {
      return false;
    }

    return raw === true || raw === 1 || raw === '1' || String(raw || '').trim().toLowerCase() === 'true';
  }

  /**
   * Determina se la modalita advanced filter e attiva da
   * `md_props_bag.archetypes.list.advancedFilter`.
   */
  isAdvancedFilterModeEnabled(): boolean {
    const fromPropsBag = this.getAdvancedFilterRuleFromPropsBag();
    if (fromPropsBag !== undefined) {
      return this.toBooleanLoose(fromPropsBag, false);
    }

    const listCfg: any = this.metaInfo?.tableMetadata?.extraProps?.archetypes?.list;
    if (!listCfg || typeof listCfg !== 'object' || Array.isArray(listCfg)) {
      return false;
    }

    const raw = listCfg.advancedFilter;
    return this.toBooleanLoose(raw, false);
  }

  /**
   * Determina se attivare la virtualizzazione PrimeNG della lista leggendo
   * `md_props_bag.archetypes.list.virtualize`.
   * Supporta formati compatibili:
   * - boolean/number/string (`true|false`, `1|0`)
   * - object con `enabled`.
   * @returns True quando la virtualizzazione deve essere attiva.
   */
  isListVirtualizationEnabled(): boolean {
    if (this.isVirtualizationForcedByPageSize()) {
      return true;
    }

    const raw = this.getListVirtualizationRuleFromPropsBag();
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return false;
    }

    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const enabledRaw = (raw as any).enabled;
      if (enabledRaw === undefined || enabledRaw === null || String(enabledRaw).trim() === '') {
        return true;
      }
      return this.toBooleanLoose(enabledRaw, true);
    }

    return this.toBooleanLoose(raw, false);
  }

  /**
   * Restituisce `virtualScrollItemSize` per p-table (altezza riga virtuale in px).
   * Legge in priorita `archetypes.list.virtualize.itemSize`, poi fallback su
   * `virtualRowHeight`/`rowHeight`, infine default `44`.
   * @returns Altezza riga virtuale valida (>0).
   */
  getListVirtualizationItemSize(): number | undefined {
    if (!this.isListVirtualizationEnabled()) {
      return undefined;
    }

    if (this.isVirtualizationForcedByPageSize()) {
      return ListGridComponent.FORCED_VIRTUALIZATION_ITEM_SIZE;
    }

    const raw = this.getListVirtualizationRuleFromPropsBag();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const candidate = Number((raw as any).itemSize ?? (raw as any).virtualRowHeight ?? (raw as any).rowHeight);
      if (Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }
    return 44;
  }

  /**
   * Spazio (px) fra una card mobile e la successiva nel virtual scroller.
   * Tieni allineato con `.wuic-mobile-card-slot { padding-bottom: ... }` nello scss.
   */
  private static readonly MOBILE_CARD_SLOT_GAP_PX = 18;

  /**
   * Stima iniziale altezza item per <p-virtualscroller> (autoSize ricalcola dopo).
   * Include esplicitamente il gap di separazione: senza gap nell'itemSize la
   * virtualizzazione sovrappone le card oppure le incolla senza spazio.
   * Heuristica contenuto card: padding (24px) + actions row (44px) + ~32px per
   * ogni colonna visibile. Sopra a tutto si somma `MOBILE_CARD_SLOT_GAP_PX`.
   */
  getMobileCardEstimatedHeight(): number {
    const visibleCols = (this.metaInfo?.columnMetadata || []).filter((c: any) => c && !c.mc_hide_in_list).length;
    const cardContent = 24 + 44 + Math.max(visibleCols, 1) * 32;
    const slotHeight = cardContent + ListGridComponent.MOBILE_CARD_SLOT_GAP_PX;
    return Math.max(220, Math.min(620, slotHeight));
  }

  /**
   * Parser permissivo per valori boolean-like metadata.
   * @param value Valore sorgente.
   * @param defaultValue Fallback quando non interpretabile.
   * @returns Boolean coerente.
   */
  private toBooleanLoose(value: any, defaultValue: boolean): boolean {
    if (value === undefined || value === null || String(value).trim() === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
      return false;
    }

    return defaultValue;
  }

  /**
   * Indica se la griglia deve forzare l'editing cella-per-cella con autosave al blur.
   */
  isInlineCellEditingEnabled(): boolean {
    const tableMetadata: any = this.metaInfo?.tableMetadata;
    if (!tableMetadata) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'md_inline_cell_editing')) {
      return this.toBooleanLoose(tableMetadata.md_inline_cell_editing, false);
    }

    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'd_inline_cell_editing')) {
      return this.toBooleanLoose(tableMetadata.d_inline_cell_editing, false);
    }

    const rawRule = this.getInlineCellEditingRuleFromPropsBag();
    if (rawRule === undefined) {
      return false;
    }

    return this.toBooleanLoose(rawRule, false);
  }

  /**
   * Inline-cell editing + batch-save: disabilita autosave per campo e abilita save esplicito da toolbar.
   */
  isInlineBatchSaveEnabled(): boolean {
    if (!this.isInlineCellEditingEnabled()) {
      return false;
    }

    const tableMetadata: any = this.metaInfo?.tableMetadata;
    if (!tableMetadata) {
      return false;
    }

    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'md_batch_save')) {
      return this.toBooleanLoose(tableMetadata.md_batch_save, false);
    }

    if (Object.prototype.hasOwnProperty.call(tableMetadata, 'd_batch_save')) {
      return this.toBooleanLoose(tableMetadata.d_batch_save, false);
    }

    return false;
  }

  /**
   * Legge da `md_props_bag.archetypes.list.md_inline_cell_editing` (con fallback `d_inline_cell_editing`).
   */
  private getInlineCellEditingRuleFromPropsBag(): any {
    const tableMetadata: any = this.metaInfo?.tableMetadata;
    const rawBag = tableMetadata?.md_props_bag;
    let propsBag: any = null;

    if (typeof rawBag === 'string') {
      try {
        propsBag = JSON.parse(rawBag || '{}');
      } catch {
        return undefined;
      }
    } else if (rawBag && typeof rawBag === 'object' && !Array.isArray(rawBag)) {
      propsBag = rawBag;
    } else {
      return undefined;
    }

    const listNode = propsBag?.archetypes?.list;
    if (!listNode || typeof listNode !== 'object' || Array.isArray(listNode)) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(listNode, 'md_inline_cell_editing')) {
      return listNode.md_inline_cell_editing;
    }

    if (Object.prototype.hasOwnProperty.call(listNode, 'd_inline_cell_editing')) {
      return listNode.d_inline_cell_editing;
    }

    return undefined;
  }

  /**
   * Forza la virtualizzazione quando il page size corrente e molto alto.
   * @returns True quando `pageSize >= 1000`.
   */
  private isVirtualizationForcedByPageSize(): boolean {
    const currentPageSizeRaw = (this.pageSize ?? this.datasource?.value?.pageSize ?? 0);
    const currentPageSize = Number(currentPageSizeRaw);
    return Number.isFinite(currentPageSize)
      && currentPageSize >= ListGridComponent.FORCED_VIRTUALIZATION_PAGE_SIZE_THRESHOLD;
  }

  /**
   * Legge la regola `archetypes.list.virtualize` dalla fonte canonica metadata (`md_props_bag`).
   * Se il nodo non esiste nel props bag ritorna `undefined`.
   */
  private getListVirtualizationRuleFromPropsBag(): any {
    const tableMetadata: any = this.metaInfo?.tableMetadata;
    const rawBag = tableMetadata?.md_props_bag;
    let propsBag: any = null;

    if (typeof rawBag === 'string') {
      try {
        propsBag = JSON.parse(rawBag || '{}');
      } catch {
        return undefined;
      }
    } else if (rawBag && typeof rawBag === 'object' && !Array.isArray(rawBag)) {
      propsBag = rawBag;
    } else {
      return undefined;
    }

    const listNode = propsBag?.archetypes?.list;
    if (!listNode || typeof listNode !== 'object' || Array.isArray(listNode)) {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(listNode, 'virtualize')) {
      return undefined;
    }

    return listNode.virtualize;
  }

  /**
   * Legge la regola `archetypes.list.advancedFilter` dal `md_props_bag`.
   */
  private getAdvancedFilterRuleFromPropsBag(): any {
    const tableMetadata: any = this.metaInfo?.tableMetadata;
    const rawBag = tableMetadata?.md_props_bag;
    let propsBag: any = null;

    if (typeof rawBag === 'string') {
      try {
        propsBag = JSON.parse(rawBag || '{}');
      } catch {
        return undefined;
      }
    } else if (rawBag && typeof rawBag === 'object' && !Array.isArray(rawBag)) {
      propsBag = rawBag;
    } else {
      return undefined;
    }

    const listNode = propsBag?.archetypes?.list;
    if (!listNode || typeof listNode !== 'object' || Array.isArray(listNode)) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(listNode, 'advancedFilter')) {
      return listNode.advancedFilter;
    }

    return undefined;
  }

  /**
   * Determina se il pulsante azioni di riga deve essere renderizzato per il rowIndex corrente.
   * Quando il range visibile non è ancora calcolato o non applicabile, ritorna `true`.
   */
  isActionButtonRowVisible = (rowIndex: number): boolean => {
    if (!Number.isFinite(Number(rowIndex))) {
      return true;
    }

    if (!this.actionButtonsLimitToVisibleRows) {
      if (!this.actionButtonsPreLimitBeforeContainerReady) {
        return true;
      }

      const index = Math.trunc(Number(rowIndex));
      return index <= ListGridComponent.ACTION_BUTTON_INITIAL_VISIBLE_ROWS_FALLBACK;
    }

    const index = Math.trunc(Number(rowIndex));
    return index >= this.actionButtonsVisibleStartIndex && index <= this.actionButtonsVisibleEndIndex;
  };

  /**
   * Pianifica sync del range visibile (post-render) e tracking scroll.
   */
  private scheduleActionButtonsVisibleRangeSync(): void {
    const run = () => this.syncActionButtonsVisibleRange();
    requestAnimationFrame(run);
    window.setTimeout(run, 80);
  }

  /**
   * Aggancia listener scroll al container table e aggiorna subito il range visibile.
   */
  private syncActionButtonsVisibleRange(): void {
    const nextContainer = this.resolveTableScrollContainer();
    if (!nextContainer) {
      this.detachActionButtonsScrollTracking();
      this.actionButtonsLimitToVisibleRows = false;
      this.actionButtonsVisibleStartIndex = 0;
      this.actionButtonsVisibleEndIndex = Number.MAX_SAFE_INTEGER;
      return;
    }

    if (this.actionButtonsScrollContainer !== nextContainer) {
      this.detachActionButtonsScrollTracking();
      this.actionButtonsScrollContainer = nextContainer;
      this.actionButtonsScrollHandler = () => {
        if (this.actionButtonsScrollRafToken !== null) {
          cancelAnimationFrame(this.actionButtonsScrollRafToken);
        }
        this.actionButtonsScrollRafToken = requestAnimationFrame(() => {
          this.actionButtonsScrollRafToken = null;
          this.updateActionButtonsVisibleRangeFromContainer();
        });
      };
      this.actionButtonsScrollContainer.addEventListener('scroll', this.actionButtonsScrollHandler, { passive: true });
    }

    this.updateActionButtonsVisibleRangeFromContainer();
  }

  /**
   * Rimuove eventuale listener scroll associato al tracking visibilità action buttons.
   */
  private detachActionButtonsScrollTracking(): void {
    if (this.actionButtonsScrollContainer && this.actionButtonsScrollHandler) {
      this.actionButtonsScrollContainer.removeEventListener('scroll', this.actionButtonsScrollHandler);
    }
    this.actionButtonsScrollContainer = null;
    this.actionButtonsScrollHandler = null;
  }

  /**
   * Restituisce il container scroll verticale della p-table PrimeNG.
   */
  private resolveTableScrollContainer(): HTMLElement | null {
    const host = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!host) {
      return null;
    }
    return host.querySelector('.p-datatable-table-container') as HTMLElement | null;
  }

  /**
   * Aggiorna il range indici riga visibili in base a scrollTop/clientHeight.
   */
  private updateActionButtonsVisibleRangeFromContainer(): void {
    const container = this.actionButtonsScrollContainer;
    const shouldLimit = this.computeShouldLimitActionButtonRenderingToVisibleRows();
    const modeChanged = this.actionButtonsLimitToVisibleRows !== shouldLimit;
    this.actionButtonsLimitToVisibleRows = shouldLimit;
    this.actionButtonsPreLimitBeforeContainerReady = this.shouldPreLimitActionButtonsBeforeContainerReady();

    if (!container || !shouldLimit) {
      const changed = modeChanged || this.actionButtonsVisibleStartIndex !== 0 || this.actionButtonsVisibleEndIndex !== Number.MAX_SAFE_INTEGER;
      this.actionButtonsVisibleStartIndex = 0;
      this.actionButtonsVisibleEndIndex = Number.MAX_SAFE_INTEGER;
      if (changed) {
        this.cd.detectChanges();
      }
      return;
    }

    const rowHeight = this.resolveActionButtonsEstimatedRowHeight();
    const scrollTop = Math.max(0, Number(container.scrollTop || 0));
    const viewportHeight = Math.max(0, Number(container.clientHeight || 0));
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - ListGridComponent.ACTION_BUTTON_VISIBLE_ROWS_OVERSCAN);
    const end = Math.max(start, Math.ceil((scrollTop + viewportHeight) / rowHeight) + ListGridComponent.ACTION_BUTTON_VISIBLE_ROWS_OVERSCAN);

    if (modeChanged || start !== this.actionButtonsVisibleStartIndex || end !== this.actionButtonsVisibleEndIndex) {
      this.actionButtonsVisibleStartIndex = start;
      this.actionButtonsVisibleEndIndex = end;
      this.cd.detectChanges();
    }
  }

  /**
   * Attiva il rendering "solo visibile" in virtual scroll o quando la tabella ha viewport scrollabile.
   */
  private computeShouldLimitActionButtonRenderingToVisibleRows(): boolean {
    if (this.isListVirtualizationEnabled()) {
      return true;
    }
    const container = this.actionButtonsScrollContainer;
    return !!container && container.scrollHeight > container.clientHeight;
  }

  /**
   * Euristica pre-container: limita gia al primo paint quando il dataset e abbastanza grande.
   */
  private shouldPreLimitActionButtonsBeforeContainerReady(): boolean {
    if (this.isListVirtualizationEnabled()) {
      return true;
    }

    const currentPageSize = Number(this.pageSize ?? this.datasource?.value?.pageSize ?? 0);
    if (Number.isFinite(currentPageSize) && currentPageSize >= 80) {
      return true;
    }

    const recordCount = Array.isArray(this.records) ? this.records.length : 0;
    return recordCount >= 80;
  }

  /**
   * Stima altezza riga per calcolo range visibile: preferisce config virtuale, poi misura DOM, poi fallback 44.
   */
  private resolveActionButtonsEstimatedRowHeight(): number {
    const fromVirtualConfig = Number(this.getListVirtualizationItemSize());
    if (Number.isFinite(fromVirtualConfig) && fromVirtualConfig > 0) {
      return fromVirtualConfig;
    }

    const host = this.table?.el?.nativeElement as HTMLElement | undefined;
    const firstBodyRow = host?.querySelector('.p-datatable-tbody > tr') as HTMLElement | null;
    const domHeight = Number(firstBodyRow?.getBoundingClientRect?.().height || 0);
    if (Number.isFinite(domHeight) && domHeight > 0) {
      return domHeight;
    }

    return ListGridComponent.FORCED_VIRTUALIZATION_ITEM_SIZE;
  }

  /**
   * Restituisce la stringa CSS width per una colonna in base alla modalita corrente.
   * @param col Colonna renderizzata.
   * @returns Width CSS (`px` o `%`) oppure `null`.
   */
  getColumnWidthCss(col: any): string | null {
    const routeKey = this.getRouteKey(this.routeName);
    const proportionalDisabledByManualResize = !!(routeKey && this.manualResizeDisablesProportionalByRoute[routeKey]);

    const widthPercent = Number(col?.widthPercent);
    if (!proportionalDisabledByManualResize && Number.isFinite(widthPercent) && widthPercent > 0) {
      const viewportWidth = this.getViewportWidthPx();
      if (Number.isFinite(viewportWidth) && viewportWidth > 0) {
        const percentPx = (viewportWidth * widthPercent) / 100;
        if (percentPx < 10) {
          const fallbackWidth = Number(col?.width);
          const fallbackPx = Number.isFinite(fallbackWidth) && fallbackWidth > 0 ? fallbackWidth : 100;
          return `${fallbackPx}px`;
        }
      }
      return `${widthPercent}%`;
    }

    const widthPx = Number(col?.width);
    return Number.isFinite(widthPx) && widthPx > 0 ? `${widthPx}px` : null;
  }

  /**
   * Restituisce il valore CSS per `min-width` sulle colonne della tabella.
   * @returns Valore CSS da applicare.
   *
   * NOTE: per i template binding usare direttamente il field
   * `columnMinWidthCss`. Questa funzione resta solo per i call-site interni
   * (TS) che la consumano via `getColumnMinWidthForCol` o
   * `Number.parseFloat(getColumnMinWidthCss())`.
   */
  getColumnMinWidthCss(): string {
    return this.columnMinWidthCss;
  }

  /**
   * `min-width` per il `<col>` di una specifica colonna data: ritorna la
   * persisted width se disponibile (per impedire al browser di shrinkare
   * sotto quel valore con `table-layout: auto`), altrimenti il minimo
   * generico (`getColumnMinWidthCss()`).
   *
   * Why: con `table-layout: auto` + `<table style.width>` esplicito (vedi
   * `getTableStyle`), il browser distribuisce il sum totale tra le colonne
   * usando le `<col style.width>` come hint MA puo' shrinkare quelle
   * "abbondanti" (content piu' stretto della width richiesta). Settando
   * `<col style.min-width = persistedWidth>`, il browser non puo' scendere
   * sotto quel valore → ogni colonna mantiene la sua persisted width esatta
   * dopo refresh, senza dover ricorrere a `table-layout: fixed` (che
   * confligge col drag-resize PrimeNG runtime).
   */
  getColumnMinWidthForCol(col: any): string {
    const routeWidths = this.getCurrentRouteColumnWidths();
    const persisted = Number(routeWidths?.[col?.field]);
    if (Number.isFinite(persisted) && persisted > 0) {
      return `${persisted}px`;
    }
    return this.getColumnMinWidthCss();
  }

  /**
   * Restituisce la larghezza viewport usata per valutare il fallback delle colonne percentuali.
   * @returns Larghezza viewport in px, oppure `0` se non disponibile.
   */
  private getViewportWidthPx(): number {
    const fromWindow = Number(globalThis?.innerWidth);
    if (Number.isFinite(fromWindow) && fromWindow > 0) {
      return fromWindow;
    }

    const fromDocument = Number(globalThis?.document?.documentElement?.clientWidth);
    if (Number.isFinite(fromDocument) && fromDocument > 0) {
      return fromDocument;
    }

    return 0;
  }

  /**
   * Gestisce comportamento UI tramite `openSaveGridStateDialog` orchestrando le chiamate `refreshCurrentRouteSavedStates` e `some`.
   */
  openSaveGridStateDialog() {
    this.refreshCurrentRouteSavedStates();

    this.saveGridStateDialogSelectedId = this.selectedSavedStateId && this.currentRouteSavedStates.some(s => s.id === this.selectedSavedStateId)
      ? this.selectedSavedStateId
      : this.NEW_GRID_STATE_OPTION_ID;
    this.saveGridStateDialogNewName = '';
    this.updateSaveGridStateDialogSetAsDefault();
    this.saveGridStateDialogVisible = true;
  }

  /**
   * Gestisce la logica di `onSaveGridStateDialogSelectionChange` orchestrando le chiamate `updateSaveGridStateDialogSetAsDefault`.
   */
  onSaveGridStateDialogSelectionChange() {
    if (this.saveGridStateDialogSelectedId !== this.NEW_GRID_STATE_OPTION_ID) {
      this.saveGridStateDialogNewName = '';
    }
    this.updateSaveGridStateDialogSetAsDefault();
  }

  /**
   * Applica aggiornamenti di stato tramite `updateSaveGridStateDialogSetAsDefault` orchestrando le chiamate `find`.
   */
  private updateSaveGridStateDialogSetAsDefault() {
    if (this.saveGridStateDialogSelectedId === this.NEW_GRID_STATE_OPTION_ID) {
      this.saveGridStateDialogSetAsDefault = false;
      return;
    }

    const selected = this.currentRouteSavedStates.find((s) => s.id === this.saveGridStateDialogSelectedId);
    this.saveGridStateDialogSetAsDefault = !!selected?.isDefault;
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `saveCurrentRouteGridState` allineando lo stato con parametri route/query.
   */
  async saveCurrentRouteGridState() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    const ds = this.datasource?.value;
    if (!routeKey || userId === null || userId === undefined || !ds) {
      return;
    }

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    const selectedOptionId = String(this.saveGridStateDialogSelectedId || this.NEW_GRID_STATE_OPTION_ID);
    const overwriteExisting = selectedOptionId !== this.NEW_GRID_STATE_OPTION_ID;
    const targetStateToOverwrite = overwriteExisting
      ? routeStates.find(s => s.id === selectedOptionId)
      : undefined;
    if (overwriteExisting && !targetStateToOverwrite) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_found_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_found_detail')
      });
      return;
    }

    const now = new Date();
    const baseSnapshot = {
      filterInfo: this.deepClone(ds.filterInfo),
      sortInfo: this.deepClone(ds.sortInfo || []),
      pageInfo: {
        currentPage: Number(ds.currentPage || this.pageIndex || 1),
        pageSize: Number(ds.pageSize || this.pageSize || 10)
      },
      columnLayout: this.deepClone(this.getCurrentRouteColumnLayout())
    };

    if (overwriteExisting && targetStateToOverwrite) {
      const overwritten: ListGridSavedState = {
        ...targetStateToOverwrite,
        ...baseSnapshot,
        isDefault: !!this.saveGridStateDialogSetAsDefault,
        createdAt: now.toISOString()
      };

      const index = routeStates.findIndex(s => s.id === targetStateToOverwrite.id);
      routeStates[index] = overwritten;
      this.selectedSavedStateId = overwritten.id;
    } else {
      const description = String(this.saveGridStateDialogNewName || '').trim();
      if (!description) {
        WtoolboxService.messageNotificationService.add({
          severity: 'warn',
          summary: this.trslSrv.instant('list_grid.name_required_summary'),
          detail: this.trslSrv.instant('list_grid.name_required_detail')
        });
        return;
      }

      const id = `${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
      const created: ListGridSavedState = {
        id,
        name: description,
        description,
        isDefault: !!this.saveGridStateDialogSetAsDefault,
        createdAt: now.toISOString(),
        ...baseSnapshot,
        columnWidths: {}
      };

      routeStates.push(created);
      this.selectedSavedStateId = id;
    }

    if (this.saveGridStateDialogSetAsDefault) {
      for (let i = 0; i < routeStates.length; i += 1) {
        routeStates[i] = {
          ...routeStates[i],
          isDefault: routeStates[i].id === this.selectedSavedStateId
        };
      }
    }

    this.persistedGridStatesByRoute[routeKey] = routeStates;
    this.refreshCurrentRouteSavedStates();
    await this.persistGridStatesSettings();
    this.saveGridStateDialogVisible = false;
    this.saveGridStateDialogNewName = '';
    this.saveGridStateDialogSetAsDefault = false;
  }

  /**
   * Applica aggiornamenti di stato tramite `applySelectedGridState` preparando/aggiornando il dataset visualizzato.
   * @param stateId Identificativo tecnico usato per lookup, match o aggiornamento mirato.
   */
  async applySelectedGridState(stateId?: string) {
    const routeKey = this.getRouteKey(this.routeName);
    const ds = this.datasource?.value;
    const targetStateId = String(stateId ?? this.selectedSavedStateId ?? '');
    if (!routeKey || !ds || !targetStateId) {
      return;
    }

    const selected =
      this.currentRouteSavedStates.find(s => s.id === targetStateId)
      || (this.persistedGridStatesByRoute[routeKey] || []).find(s => s.id === targetStateId);
    if (!selected) {
      return;
    }

    this.applyingSavedState = true;
    this.selectedSavedStateId = targetStateId;

    ds.filterInfo = this.mergeSavedFilterInfoWithRuntimeFixedFilters(this.deepClone(selected.filterInfo), ds.filterInfo);
    this.applySavedFilterInfoToDatasourceDescriptor(ds, ds.filterInfo);
    ds.sortInfo = this.deepClone(selected.sortInfo || []);

    const nextPageSize = Number(selected.pageInfo?.pageSize || this.pageSize || 10);
    const nextPage = Number(selected.pageInfo?.currentPage || 1);
    ds.pageSize = nextPageSize;
    ds.currentPage = nextPage;
    this.pageSize = nextPageSize;
    this.pageIndex = nextPage;
    this.rowNumber = Math.max(0, (nextPage - 1) * nextPageSize);

    this.syncTableSortUiFromDatasource();

    if (selected.columnLayout && typeof selected.columnLayout === 'object') {
      this.persistedColumnLayoutByRoute[routeKey] = this.normalizePersistedColumnLayoutMap({ [routeKey]: selected.columnLayout })[routeKey] || this.buildEmptyColumnLayout();
    } else {
      this.persistedColumnLayoutByRoute[routeKey] = this.buildEmptyColumnLayout();
    }

    if (selected.columnWidths && typeof selected.columnWidths === 'object') {
      this.persistedColumnWidthsByRoute[routeKey] = this.normalizePersistedColumnWidthMap({ [routeKey]: selected.columnWidths })[routeKey] || {};
    } else {
      this.persistedColumnWidthsByRoute[routeKey] = {};
    }

    if (this.metas?.length) {
      this.cols = this.parseColumns(this.metas);
      this.cd.detectChanges();
    }

    try {
      await ds.fetchData();
      this.syncTableFilterUiFromDatasource();
      this.syncTableSortUiFromDatasource();
      this.syncGridStateQueryString();
    } finally {
      this.applyingSavedState = false;
      this.refreshSaveStateMenuItems();
    }
  }

  /**
   * Unisce i filtri dello stato salvato con i filtri runtime "fissi" (route/nested),
   * evitando che apply state perda il vincolo master-detail.
   */
  private mergeSavedFilterInfoWithRuntimeFixedFilters(savedFilterInfo: any, runtimeFilterInfo: any): any {
    const saved = this.deepClone(savedFilterInfo || { logic: 'AND', filters: [] });
    const runtime = this.deepClone(runtimeFilterInfo || { logic: 'AND', filters: [] });

    const savedFilters = Array.isArray(saved?.filters) ? [...saved.filters] : [];
    const runtimeFilters = Array.isArray(runtime?.filters) ? runtime.filters : [];
    const fixedRuntimeFilters = runtimeFilters.filter((f: any) =>
      !!f && (f.fixed === true || f.__routefilter === true || f.__nestedroute === true)
    );

    if (!fixedRuntimeFilters.length) {
      return {
        logic: String(saved?.logic || saved?.logicOperator || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
        filters: savedFilters
      };
    }

    fixedRuntimeFilters.forEach((fixed: any) => {
      const field = String(fixed?.field || '').trim();
      const index = savedFilters.findIndex((f: any) => String(f?.field || '').trim() === field);
      const normalizedFixed = {
        ...fixed,
        fixed: true
      };

      if (index >= 0) {
        savedFilters[index] = normalizedFixed;
      } else {
        savedFilters.push(normalizedFixed);
      }
    });

    // Con filtri fixed (nested/route) imponiamo AND per non invalidare il vincolo.
    return {
      logic: 'AND',
      filters: savedFilters
    };
  }

  /**
   * Apre il popup di rinomina per lo stato corrente selezionato.
   */
  openRenameGridStateDialog(): void {
    const routeKey = this.getRouteKey(this.routeName);
    const selectedId = String(this.selectedSavedStateId || '');
    if (!routeKey || !selectedId) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_selected_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_selected_detail')
      });
      return;
    }

    const selected = (this.persistedGridStatesByRoute[routeKey] || []).find((s) => s.id === selectedId);
    if (!selected) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_found_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_found_detail')
      });
      return;
    }

    this.renameGridStateDialogName = String(selected.name || selected.description || '').trim();
    this.renameGridStateDialogVisible = true;
  }

  /**
   * Conferma rinomina dello stato corrente selezionato.
   */
  async renameSelectedGridState(): Promise<void> {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    const selectedId = String(this.selectedSavedStateId || '');
    const nextName = String(this.renameGridStateDialogName || '').trim();
    if (!routeKey || userId === null || userId === undefined || !selectedId) {
      return;
    }

    if (!nextName) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.name_required_summary'),
        detail: this.trslSrv.instant('list_grid.name_required_detail')
      });
      return;
    }

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    const stateIndex = routeStates.findIndex((s) => s.id === selectedId);
    if (stateIndex < 0) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_found_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_found_detail')
      });
      return;
    }

    routeStates[stateIndex] = {
      ...routeStates[stateIndex],
      name: nextName,
      description: nextName
    };
    this.persistedGridStatesByRoute[routeKey] = routeStates;
    this.refreshCurrentRouteSavedStates();
    await this.persistGridStatesSettings();
    this.renameGridStateDialogVisible = false;
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `removeSelectedGridState` trasformando e filtrando collezioni dati.
   */
  async removeSelectedGridState() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!routeKey || userId === null || userId === undefined || !this.selectedSavedStateId) {
      return;
    }

    const selected = (this.persistedGridStatesByRoute[routeKey] || []).find(s => s.id === this.selectedSavedStateId);
    if (!selected) {
      return;
    }

    const confirmed = await WtoolboxService.confirm({
      header: this.trslSrv.instant('list_grid.remove_state_header'),
      message: this.trslSrv.format(this.trslSrv.instant('list_grid.remove_state_message'), selected.name, this.routeName)
    });
    if (!confirmed) {
      return;
    }

    const nextRouteStates = (this.persistedGridStatesByRoute[routeKey] || []).filter(s => s.id !== this.selectedSavedStateId);
    this.persistedGridStatesByRoute[routeKey] = nextRouteStates;

    // Keep listGridColumnLayout coherent with listGridViewStates: when the route
    // has no saved states left, clear persisted layout for that route as well.
    if (!nextRouteStates.length) {
      if (this.persistedGridStatesByRoute[routeKey]) {
        delete this.persistedGridStatesByRoute[routeKey];
      }
      if (this.persistedColumnLayoutByRoute[routeKey]) {
        delete this.persistedColumnLayoutByRoute[routeKey];
      }
      if (this.persistedColumnWidthsByRoute[routeKey]) {
        delete this.persistedColumnWidthsByRoute[routeKey];
      }
      if (this.manualResizeDisablesProportionalByRoute[routeKey] !== undefined) {
        delete this.manualResizeDisablesProportionalByRoute[routeKey];
      }

      this.metaSrv.setCustomSettingInLocalStorage(
        ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY,
        this.persistedColumnLayoutByRoute,
        userId
      );
      await this.metaSrv.saveCustomSettings(
        userId,
        this.persistedColumnLayoutByRoute,
        ListGridComponent.GRID_COLUMN_LAYOUT_SETTINGS_KEY
      );
    }

    this.refreshCurrentRouteSavedStates();
    this.selectedSavedStateId = '';
    await this.persistGridStatesSettings();
    await this.resetGridState(this.table);

    // Explicit full refresh requested after state removal confirmation.
    this.reloadPage();
  }

  /**
   * Gestisce la logica operativa di `reloadPage` orchestrando le chiamate `reload`.
   */
  private reloadPage(): void {
    globalThis.location?.reload();
  }

  /**
   * Gestisce la logica di `onSelectedGridStateChange` orchestrando le chiamate `String` e `applySelectedGridState`.
   * @param stateId Identificativo tecnico usato per lookup, match o aggiornamento mirato.
   */
  async onSelectedGridStateChange(stateId: string) {
    this.selectedSavedStateId = String(stateId || '');
    this.refreshSaveStateMenuItems();
    await this.applySelectedGridState(this.selectedSavedStateId);
  }

  /**
   * Gestisce la logica di `onSavedStateDropdownChange` orchestrando le chiamate `String` e `applySelectedGridState`.
   * @param event Evento UI/payload evento che innesca la logica del metodo.
   */
  async onSavedStateDropdownChange(event: Event) {
    const target = event?.target as HTMLSelectElement | null;
    const stateId = String(target?.value || '');
    this.selectedSavedStateId = stateId;
    this.refreshSaveStateMenuItems();
    await this.applySelectedGridState(stateId);
  }

  /**
   * Applica aggiornamenti di stato tramite `setSelectedGridStateAsPreferred` trasformando e filtrando collezioni dati.
   */
  async setSelectedGridStateAsPreferred() {
    const routeKey = this.getRouteKey(this.routeName);
    const userId = this.userInfo.getuserInfo()?.user_id;
    const selectedId = String(this.selectedSavedStateId || '');
    if (!routeKey || userId === null || userId === undefined || !selectedId) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_selected_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_selected_detail')
      });
      return;
    }

    const routeStates = [...(this.persistedGridStatesByRoute[routeKey] || [])];
    const selected = routeStates.find((s) => s.id === selectedId);
    if (!selected) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('list_grid.state_not_found_summary'),
        detail: this.trslSrv.instant('list_grid.state_not_found_detail')
      });
      return;
    }

    this.persistedGridStatesByRoute[routeKey] = routeStates.map((s) => ({
      ...s,
      isDefault: s.id === selectedId
    }));
    this.pendingPreferredStateAutoApply = false;
    this.refreshCurrentRouteSavedStates();
    await this.persistGridStatesSettings();
  }

  /**
   * Gestisce la logica di `normalizePersistedColumnWidthMap` orchestrando le chiamate `keys` e `getRouteKey`.
   * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Valore di tipo `{ [routeKey: string]: { [field: string]: number } }` costruito o risolto dal metodo.
   */
  private normalizePersistedColumnWidthMap(raw: any): { [routeKey: string]: { [field: string]: number } } {
    const normalized: { [routeKey: string]: { [field: string]: number } } = {};
    if (!raw || typeof raw !== 'object') {
      return normalized;
    }

    Object.keys(raw).forEach((rawRouteKey) => {
      const routeKey = this.getRouteKey(rawRouteKey);
      const routeValue = raw[rawRouteKey];
      if (!routeKey || !routeValue || typeof routeValue !== 'object') {
        return;
      }

      const columnMap: { [field: string]: number } = {};
      Object.keys(routeValue).forEach((field) => {
        const width = Number(routeValue[field]);
        if (field && Number.isFinite(width) && width > 0) {
          columnMap[field] = Number(width.toFixed(2));
        }
      });

      normalized[routeKey] = columnMap;
    });

    return normalized;
  }

  /**
   * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
   * @param raw Parametro in ingresso usato per determinare il flusso operativo del metodo.
   * @returns Valore di tipo `{ [routeKey: string]: ListGridColumnLayout }` costruito dal metodo per i passaggi successivi del flusso.
   */
  private normalizePersistedColumnLayoutMap(raw: any): { [routeKey: string]: ListGridColumnLayout } {
    const normalized: { [routeKey: string]: ListGridColumnLayout } = {};
    if (!raw || typeof raw !== 'object') {
      return normalized;
    }

    Object.keys(raw).forEach((rawRouteKey) => {
      const routeKey = this.getRouteKey(rawRouteKey);
      const routeValue = raw[rawRouteKey];
      if (!routeKey || !routeValue || typeof routeValue !== 'object') {
        return;
      }

      const order = Array.isArray(routeValue.order)
        ? routeValue.order.map((f: any) => String(f || '')).filter((f: string) => !!f)
        : [];
      const hidden = Array.isArray(routeValue.hidden)
        ? routeValue.hidden.map((f: any) => String(f || '')).filter((f: string) => !!f)
        : [];
      const pinnedLeft = this.extractPersistedPinnedFields(routeValue, ['pinnedLeft', 'frozenLeft', 'leftPinned', 'leftFrozen']);
      const pinnedRight = this.extractPersistedPinnedFields(routeValue, ['pinnedRight', 'frozenRight', 'rightPinned', 'rightFrozen']);
      const genericPinned = this.extractPersistedPinnedFields(routeValue, ['pinned', 'frozen']);
      const byField = this.extractPersistedPinnedFieldsFromMap(routeValue.pinnedByField || routeValue.frozenByField);
      const mergedPinnedLeft = Array.from(new Set([...pinnedLeft, ...genericPinned, ...byField.left]));
      const mergedPinnedRight = Array.from(new Set([...pinnedRight, ...byField.right]));
      const pinnedLeftFiltered = mergedPinnedLeft.filter((f) => !mergedPinnedRight.includes(f));

      normalized[routeKey] = {
        order: Array.from(new Set(order)),
        hidden: Array.from(new Set(hidden)),
        pinnedLeft: pinnedLeftFiltered,
        pinnedRight: mergedPinnedRight
      };
    });

    return normalized;
  }

  /**
   * Gestisce la logica di `loadPersistedGridStatesFromLocalStorage` trasformando e filtrando collezioni dati.
   */
  private loadPersistedGridStatesFromLocalStorage() {
    const cached = this.metaSrv.getCustomSettingFromLocalStorage<{ [routeKey: string]: ListGridSavedState[] }>(
      ListGridComponent.GRID_VIEW_STATES_SETTINGS_KEY
    );

    if (!cached || typeof cached !== 'object') {
      this.persistedGridStatesByRoute = {};
      return;
    }

    const normalized: { [routeKey: string]: ListGridSavedState[] } = {};
    Object.keys(cached).forEach((rawRouteKey) => {
      const routeKey = this.getRouteKey(rawRouteKey);
      const routeStates = Array.isArray(cached[rawRouteKey]) ? cached[rawRouteKey] : [];
      if (!routeKey) {
        return;
      }

      normalized[routeKey] = routeStates
        .filter((s: any) => !!s && typeof s === 'object' && !!s.id)
        .map((s: any) => ({
          id: String(s.id),
          name: String(s.name || s.description || s.id),
          description: String(s.description || s.name || ''),
          isDefault: !!s.isDefault,
          createdAt: String(s.createdAt || ''),
          filterInfo: this.deepClone(s.filterInfo),
          sortInfo: this.deepClone(Array.isArray(s.sortInfo) ? s.sortInfo : []),
          pageInfo: {
            currentPage: Number(s.pageInfo?.currentPage || 1),
            pageSize: Number(s.pageInfo?.pageSize || 10)
          },
          columnWidths: this.normalizePersistedColumnWidthMap({ [routeKey]: s.columnWidths || {} })[routeKey] || {},
          columnLayout: this.normalizePersistedColumnLayoutMap({ [routeKey]: s.columnLayout || {} })[routeKey] || this.buildEmptyColumnLayout()
        }));

      const firstDefaultIndex = normalized[routeKey].findIndex((s) => !!s.isDefault);
      if (firstDefaultIndex >= 0) {
        normalized[routeKey] = normalized[routeKey].map((s, idx) => ({
          ...s,
          isDefault: idx === firstDefaultIndex
        }));
      }
    });

    this.persistedGridStatesByRoute = normalized;
  }

  /**
   * Gestisce la logica di `hydratePersistedGridStatesFromServerIfNeeded` orchestrando le chiamate `keys` e `getuserInfo`.
   */
  private async hydratePersistedGridStatesFromServerIfNeeded() {
    if (this.remoteGridStatesHydrationInFlight) {
      return;
    }

    const hasLocal = Object.keys(this.persistedGridStatesByRoute || {}).length > 0;
    if (hasLocal) {
      return;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (userId === null || userId === undefined) {
      return;
    }

    this.remoteGridStatesHydrationInFlight = true;
    try {
      const remote = await this.metaSrv.readCustomSettings(userId, ListGridComponent.GRID_VIEW_STATES_SETTINGS_KEY);
      if (!remote || typeof remote !== 'object') {
        return;
      }

      this.metaSrv.setCustomSettingInLocalStorage(
        ListGridComponent.GRID_VIEW_STATES_SETTINGS_KEY,
        remote,
        userId
      );
      this.loadPersistedGridStatesFromLocalStorage();
      this.refreshCurrentRouteSavedStates();
    } catch {
      // Keep grid rendering stable even when custom settings endpoint is unavailable.
    } finally {
      this.remoteGridStatesHydrationInFlight = false;
    }
  }

  /**
   * Gestisce la logica di `refreshCurrentRouteSavedStates` orchestrando le chiamate `getRouteKey` e `syncSelectedSavedStateWithDatasourceCurrentState`.
   */
  private refreshCurrentRouteSavedStates() {
    const routeKey = this.getRouteKey(this.routeName);
    const routeStates = routeKey ? (this.persistedGridStatesByRoute[routeKey] || []) : [];
    this.currentRouteSavedStates = [...routeStates];

    if (!this.currentRouteSavedStates.length) {
      this.selectedSavedStateId = '';
      this.refreshSaveStateMenuItems();
      return;
    }

    this.syncSelectedSavedStateWithDatasourceCurrentState();
    if (!routeKey) {
      this.tryAutoApplyPreferredStateForCurrentRoute();
      return;
    }

    const selected = this.currentRouteSavedStates.find((s) => s.id === this.selectedSavedStateId);
    const preferred = this.currentRouteSavedStates.find((s) => !!s.isDefault);
    const effective = selected || preferred;
    this.persistedColumnWidthsByRoute[routeKey] = this.normalizePersistedColumnWidthMap({
      [routeKey]: effective?.columnWidths || {}
    })[routeKey] || {};
    this.persistedColumnLayoutByRoute[routeKey] = this.normalizePersistedColumnLayoutMap({
      [routeKey]: effective?.columnLayout || {}
    })[routeKey] || this.persistedColumnLayoutByRoute[routeKey] || this.buildEmptyColumnLayout();
    this.refreshSaveStateMenuItems();
    this.tryAutoApplyPreferredStateForCurrentRoute();
  }

  /**
   * Gestisce la logica di `tryAutoApplyPreferredStateForCurrentRoute` allineando lo stato con parametri route/query.
   */
  private tryAutoApplyPreferredStateForCurrentRoute() {
    if (!this.pendingPreferredStateAutoApply || this.applyingSavedState || !this.datasource?.value) {
      return;
    }

    // If query carries an explicit state that matches a saved state, keep that state.
    // If query does not match any saved state, fallback to preferred state.
    if (this.navigationTriggeredByPopstate && this.hasExplicitGridStateInQueryParams() && !!this.selectedSavedStateId) {
      this.pendingPreferredStateAutoApply = false;
      return;
    }

    const preferred = this.currentRouteSavedStates.find((s) => !!s.isDefault);
    this.pendingPreferredStateAutoApply = false;
    if (!preferred) {
      return;
    }

    if (this.selectedSavedStateId === preferred.id) {
      return;
    }

    void this.applySelectedGridState(preferred.id);
  }

  /**
   * Verifica una condizione di stato o di validita coordinando chiamate verso servizi applicativi.
   * @returns Esito booleano dell'elaborazione svolta dal metodo.
   */
  private hasExplicitGridStateInQueryParams(): boolean {
    const qp = this.route.snapshot?.queryParamMap;
    if (!qp) {
      return false;
    }

    return !!(
      qp.get('filterInfo') || qp.get('filterinfo')
      || qp.get('sortInfo') || qp.get('sortinfo')
      || qp.get('pageInfo') || qp.get('pageinfo')
    );
  }

  /**
   * Gestisce la logica di `persistGridStatesSettings` orchestrando le chiamate `getuserInfo` e `setCustomSettingInLocalStorage`.
   */
  private async persistGridStatesSettings() {
    const userId = this.userInfo.getuserInfo()?.user_id;
    if (userId === null || userId === undefined) {
      return;
    }

    this.metaSrv.setCustomSettingInLocalStorage(
      ListGridComponent.GRID_VIEW_STATES_SETTINGS_KEY,
      this.persistedGridStatesByRoute,
      userId
    );

    await this.metaSrv.saveCustomSettings(
      userId,
      this.persistedGridStatesByRoute,
      ListGridComponent.GRID_VIEW_STATES_SETTINGS_KEY
    );
  }

  /**
   * Gestisce la logica operativa di `deepClone` in modo coerente con l'implementazione corrente.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Risultato elaborato da `deepClone` e restituito al chiamante.
   */
  private deepClone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  /**
   * Restituisce layout colonne vuoto con tutte le sezioni supportate.
   */
  private buildEmptyColumnLayout(): ListGridColumnLayout {
    return {
      order: [],
      hidden: [],
      pinnedLeft: [],
      pinnedRight: []
    };
  }

  /**
   * Estrae campi pinnati da chiavi note supportando array o stringa singola.
   */
  private extractPersistedPinnedFields(layout: any, keys: string[]): string[] {
    if (!layout || typeof layout !== 'object' || !Array.isArray(keys) || !keys.length) {
      return [];
    }

    const result: string[] = [];
    keys.forEach((key) => {
      const value = layout[key];
      if (Array.isArray(value)) {
        value
          .map((f: any) => String(f || '').trim())
          .filter((f: string) => !!f)
          .forEach((f: string) => result.push(f));
        return;
      }

      if (typeof value === 'string') {
        const normalized = String(value || '').trim();
        if (normalized) {
          result.push(normalized);
        }
      }
    });

    return Array.from(new Set(result));
  }

  /**
   * Estrae pinning da mappa per-campo (`field -> left/right/true/false`) per compatibilita legacy.
   */
  private extractPersistedPinnedFieldsFromMap(raw: any): { left: string[]; right: string[] } {
    const acc = { left: [] as string[], right: [] as string[] };
    if (!raw || typeof raw !== 'object') {
      return acc;
    }

    Object.keys(raw).forEach((key) => {
      const field = String(key || '').trim();
      if (!field) {
        return;
      }

      const value = raw[key];
      const normalized = String(value ?? '').toLowerCase();
      if (normalized === 'right') {
        acc.right.push(field);
        return;
      }
      if (normalized === 'left' || normalized === 'true') {
        acc.left.push(field);
        return;
      }
      if (value === true) {
        acc.left.push(field);
      }
    });

    acc.left = Array.from(new Set(acc.left.filter((f) => !acc.right.includes(f))));
    acc.right = Array.from(new Set(acc.right));
    return acc;
  }

  /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncSelectedSavedStateWithDatasourceCurrentState` orchestrando le chiamate `getCurrentGridStateSignatureFromDatasource` e `find`.
   */
  private syncSelectedSavedStateWithDatasourceCurrentState() {
    if (this.applyingSavedState) {
      return;
    }

    if (!this.currentRouteSavedStates?.length || !this.datasource?.value) {
      this.selectedSavedStateId = '';
      return;
    }

    // Preserve explicit user selection (e.g. custom state "ggg") and avoid
    // automatic fallback to another state that has the same filter/sort/page signature.
    if (this.selectedSavedStateId) {
      const selectedStillExists = this.currentRouteSavedStates.some((s) => s.id === this.selectedSavedStateId);
      if (selectedStillExists) {
        return;
      }
    }

    const currentSignature = this.getCurrentGridStateSignatureFromDatasource();
    const matched = this.currentRouteSavedStates.find((s) => this.getSavedStateSignature(s) === currentSignature);
    this.selectedSavedStateId = matched?.id || '';
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `getCurrentGridStateSignatureFromQueryOrDatasource` e `normalizeFilterInfoForCompare`.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private getCurrentGridStateSignatureFromDatasource(): string {
    const ds = this.datasource?.value;
    if (!ds) {
      return this.getCurrentGridStateSignatureFromQueryOrDatasource();
    }

    const state = {
      filterInfo: this.normalizeFilterInfoForCompare(ds.filterInfo),
      sortInfo: this.normalizeSortInfoForCompare(ds.sortInfo || []),
      pageInfo: this.normalizeForCompare({
        currentPage: Number(ds.currentPage || this.pageIndex || 1),
        pageSize: Number(ds.pageSize || this.pageSize || 10)
      })
    };

    return JSON.stringify(state);
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `getCurrentGridStateFromQueryParams` e `stringify`.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private getCurrentGridStateSignatureFromQueryOrDatasource(): string {
    const fromQuery = this.getCurrentGridStateFromQueryParams();
    if (fromQuery) {
      return JSON.stringify(fromQuery);
    }

    const ds = this.datasource?.value;
    if (!ds) {
      return '';
    }

    const state = {
      filterInfo: this.normalizeFilterInfoForCompare(ds.filterInfo),
      sortInfo: this.normalizeSortInfoForCompare(ds.sortInfo || []),
      pageInfo: this.normalizeForCompare({
        currentPage: Number(ds.currentPage || this.pageIndex || 1),
        pageSize: Number(ds.pageSize || this.pageSize || 10)
      })
    };

    return JSON.stringify(state);
  }

  /**
   * Recupera i dati/valori richiesti da `getSavedStateSignature`.
   * @param state Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `getSavedStateSignature` per chiavi/label o valori testuali.
   */
  private getSavedStateSignature(state: ListGridSavedState): string {
    const comparable = {
      filterInfo: this.normalizeFilterInfoForCompare(state?.filterInfo),
      sortInfo: this.normalizeSortInfoForCompare(state?.sortInfo || []),
      pageInfo: this.normalizeForCompare({
        currentPage: Number(state?.pageInfo?.currentPage || 1),
        pageSize: Number(state?.pageInfo?.pageSize || 10)
      })
    };

    return JSON.stringify(comparable);
  }

  /**
   * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
   * @param value Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Valore di tipo `any` costruito dal metodo per i passaggi successivi del flusso.
   */
  private normalizeForCompare(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map(v => this.normalizeForCompare(v));
    }

    if (typeof value === 'object') {
      const normalized: any = {};
      Object.keys(value)
        .sort()
        .forEach((k) => {
          normalized[k] = this.normalizeForCompare(value[k]);
        });
      return normalized;
    }

    return value;
  }

  /**
   * Recupera informazioni tramite `getCurrentGridStateFromQueryParams` leggendo parametri route/query per mantenere lo stato consistente con l'URL.
   * @returns Valore di tipo `any | null` restituito dal metodo.
   */
  private getCurrentGridStateFromQueryParams(): any | null {
    const qp = this.route.snapshot?.queryParamMap;
    if (!qp) {
      return null;
    }

    const rawFilterInfo = qp.get('filterInfo') || qp.get('filterinfo');
    const rawSortInfo = qp.get('sortInfo') || qp.get('sortinfo');
    const rawPageInfo = qp.get('pageInfo') || qp.get('pageinfo');

    if (!rawFilterInfo && !rawSortInfo && !rawPageInfo) {
      return null;
    }

    const parsedFilterInfo = this.tryParseJson(rawFilterInfo);
    const parsedSortInfo = this.tryParseJson(rawSortInfo);
    const parsedPageInfo = this.tryParseJson(rawPageInfo);

    return {
      filterInfo: this.normalizeFilterInfoForCompare(parsedFilterInfo),
      sortInfo: this.normalizeSortInfoForCompare(parsedSortInfo || []),
      pageInfo: this.normalizeForCompare({
        currentPage: Number(parsedPageInfo?.currentPage || 1),
        pageSize: Number(parsedPageInfo?.pageSize || this.pageSize || 10)
      })
    };
  }

  /**
   * Gestisce la logica operativa di `tryParseJson` in modo coerente con l'implementazione corrente.
   * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Risultato elaborato da `tryParseJson` e restituito al chiamante.
   */
  private tryParseJson(raw: string | null): any {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
   * @param filterInfo Criterio di filtro usato per limitare o rifinire il dataset elaborato.
   * @returns Valore di tipo `any` costruito dal metodo per i passaggi successivi del flusso.
   */
  private normalizeFilterInfoForCompare(filterInfo: any): any {
    const normalizeGroup = (group: any): any => {
      const logicOperator = String(group?.logicOperator || group?.logic || group?.operator || 'AND');
      const filters = Array.isArray(group?.filters) ? group.filters : [];

      const normalizedFilters = filters
        .map((f: any) => {
          if (!f) {
            return null;
          }

          if (f?.nestedFilters && Array.isArray(f.nestedFilters.filters)) {
            return {
              nestedFilters: normalizeGroup(f.nestedFilters)
            };
          }

          if (typeof f.field !== 'string') {
            return null;
          }

          return {
            field: String(f.field),
            operator: String(f.operatore || f.operator || ''),
            value: this.normalizeForCompare(f.value)
          };
        })
        .filter((f: any) => !!f)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

      return {
        logicOperator,
        filters: normalizedFilters
      };
    };

    return normalizeGroup(filterInfo);
  }

  /**
   * Trasforma i dati in una forma coerente con rendering o payload normalizzando e trasformando collezioni di record.
   * @param sortInfo Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Collezione di tipo `any[]` derivata dalle trasformazioni applicate nel metodo.
   */
  private normalizeSortInfoForCompare(sortInfo: any): any[] {
    const arr = Array.isArray(sortInfo) ? sortInfo : [];
    return arr
      .filter((s: any) => !!s && !!s.field)
      .map((s: any) => ({
        field: String(s.field),
        dir: String(s.dir || '')
      }));
  }

  /**
   * Applica aggiornamenti di stato tramite `applySavedFilterInfoToDatasourceDescriptor` mantenendo coerenti UI e dati.
   * @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param filterInfo Filtro o criteri di ricerca applicati al dataset.
   */
  private applySavedFilterInfoToDatasourceDescriptor(ds: any, filterInfo: any) {
    const descriptor = ds?.filterDescriptor;
    const columns = ds?.metaInfo?.columnMetadata || [];
    if (!descriptor || typeof descriptor !== 'object' || !columns?.length) {
      return;
    }

    // Reset existing descriptor values first.
    Object.keys(descriptor).forEach((key) => {
      if (key.endsWith('__lookup_obj')) {
        return;
      }
      const obs = descriptor[key];
      if (obs && typeof obs.next === 'function') {
        obs.next(null);
      }
      const lookupObs = descriptor[key + '__lookup_obj'];
      if (lookupObs && typeof lookupObs.next === 'function') {
        lookupObs.next(null);
      }
    });

    const filters = Array.isArray(filterInfo?.filters) ? filterInfo.filters : [];
    filters.forEach((f: any) => {
      if (!f || typeof f.field !== 'string') {
        return;
      }

      const field = f.field;
      const value = f.value;
      const operator = f.operatore ?? f.operator;

      if (descriptor[field] && typeof descriptor[field].next === 'function') {
        descriptor[field].next(value);
      }

      if (!ds.metaInfo?.operators) {
        ds.metaInfo.operators = {};
      }
      if (operator !== null && operator !== undefined && operator !== '') {
        ds.metaInfo.operators[field] = operator;
      } else if (!ds.metaInfo.operators[field]) {
        const col = columns.find((c: any) => c?.mc_nome_colonna === field);
        ds.metaInfo.operators[field] =
          (col?.mc_ui_column_type === 'text' || col?.mc_ui_column_type === 'txt_area')
            ? 'contains'
            : (col?.mc_ui_column_type === 'multiple_check' || (col?.mc_ui_column_type === 'lookupByID' && !!col?.mc_is_multicheck_filter))
              ? 'eqor'
              : 'eq';
      }
    });
  }

  /**
   * Applica al DOM tabellare le larghezze persistite per campo, riallineando header/body dopo render e resize.
   */
  private forceApplyPersistedColumnWidthsToTableDom() {
    if (this.isProportionalColwidthEnabled() && !this.hasPersistedColumnWidths()) {
      this.debugColumnWidths('dom-apply-skipped-proportional', {});
      return;
    }

    const routeWidths = this.getCurrentRouteColumnWidths();
    if (!routeWidths || !Object.keys(routeWidths).length) {
      this.debugColumnWidths('dom-apply-skipped-no-widths', {});
      return;
    }

    const tableElement = this.table?.el?.nativeElement as HTMLElement | undefined;
    if (!tableElement) {
      return;
    }

    setTimeout(() => {
      const visibleFields = (this.cols || [])
        .filter((c: any) => !c?.metaColumn?.mc_hide_in_list)
        .map((c: any) => c.field)
        .filter((f: any) => typeof f === 'string' && !!f);
      const structuralOffset = this.getLeadingStructuralColumnCount();

      const headers = tableElement.querySelectorAll('th[data-field]');
      const applied: { [field: string]: number } = {};
      headers.forEach((th) => {
        const field = (th as HTMLElement).getAttribute('data-field');
        if (!field) {
          return;
        }

        const width = routeWidths[field];
        if (!Number.isFinite(width) || width <= 0) {
          return;
        }

        const px = `${width}px`;
        (th as HTMLElement).style.width = px;
        (th as HTMLElement).style.removeProperty('min-width');
        (th as HTMLElement).style.removeProperty('max-width');
        applied[field] = width;
      });

      // PrimeNG scrollable tables use colgroup widths as layout source.
      const colgroups = tableElement.querySelectorAll('colgroup');
      colgroups.forEach((cg) => {
        const cols = cg.querySelectorAll('col');
        visibleFields.forEach((field: string, i: number) => {
          const width = routeWidths[field];
          if (!Number.isFinite(width) || width <= 0) {
            return;
          }

          const targetIndex = structuralOffset + i;
          const colEl = cols.item(targetIndex) as HTMLElement | null;
          if (!colEl) {
            return;
          }

          const px = `${width}px`;
          colEl.style.width = px;
          colEl.style.removeProperty('min-width');
          colEl.style.removeProperty('max-width');
          applied[field] = width;
        });
      });

      this.debugColumnWidths('dom-applied', applied);
    }, 0);
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare chiavi, campi e comportamento runtime.
   * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
   */
  private getLeadingStructuralColumnCount(): number {
    let count = 0;
    if (this.metaInfo?.tableMetadata?.md_nested_grid_routes) {
      count++;
    }
    if (this.metaInfo?.tableMetadata?.md_multiple_selection) {
      count++;
    }
    if (this.showActionColumn()) {
      count++;
    }
    return count;
  }

  /**
   * Gestisce la logica operativa di `debugColumnWidths` in modo coerente con l'implementazione corrente.
   * @param stage Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param payload Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   */
  private debugColumnWidths(stage: string, payload: any) {
    console.debug('[ListGrid][ColumnWidths]', {
      stage,
      routeName: this.routeName,
      routeKey: this.getRouteKey(this.routeName),
      payload
    });
  }

  /**
   * Costruisce una struttura di output a partire dal contesto corrente orchestrando le chiamate `padStart` e `String`.
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private buildNewReportName(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `Report_${timestamp}.mrt`;
  }

  /**
   * Gestisce la logica operativa di `openReportDesigner` in modo coerente con l'implementazione corrente.
   * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private openReportDesigner(reportName?: string): void {
    if (!this.routeName) {
      return;
    }

    const targetReportName = reportName || this.buildNewReportName();
    void this.router.navigateByUrl(
      '/' + this.routeName + '/report-designer?reportName=' + encodeURIComponent(targetReportName)
    );
  }

  /**
   * Gestisce la logica operativa di `openReportViewer` in modo coerente con l'implementazione corrente.
   * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param parameters Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private openReportViewer(reportName: string, parameters?: string): void {
    if (!this.routeName || !reportName) {
      return;
    }

    const baseUrl = '/' + this.routeName + '/report-viewer?reportName=' + encodeURIComponent(reportName);
    const queryParts: string[] = [];
    if (parameters) {
      queryParts.push('parameters=' + encodeURIComponent(parameters));
    }

    const filterInfo = this.datasource?.value?.filterInfo;
    const hasFilters = !!filterInfo?.filters?.length;
    if (hasFilters) {
      queryParts.push('filterInfo=' + encodeURIComponent(JSON.stringify(filterInfo)));
    }

    const query = queryParts.length ? '&' + queryParts.join('&') : '';
    void this.router.navigateByUrl(baseUrl + query);
  }

  /**
   * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
   * @param variables Collezione di input processata dal metodo (normalizzazione, filtri e mapping).
   * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
   */
  private buildReportParametersQueryString(variables: ReportVariableInput[]): string {
    return (variables || [])
      .filter((v) => !!v?.name)
      .map((v) => `${v.name}||eq||${v.value ?? ''}`)
      .join('@');
  }

  /**
   * Gestisce la logica operativa di `openReportFromMenu` in modo coerente con l'implementazione corrente.
   * @param reportName Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async openReportFromMenu(reportName: string): Promise<void> {
    if (!this.routeName || !reportName) {
      return;
    }

    this.reportVariableDialogLoading = true;
    try {
      const variables = await this.metaSrv.getReportVariables(this.routeName, reportName);
      if (!variables?.length) {
        this.openReportViewer(reportName);
        return;
      }

      this.selectedReportNameForVariables = reportName;
      this.selectedReportVariables = variables.map((v) => ({
        name: String(v?.name || ''),
        alias: String(v?.alias || v?.name || ''),
        value: v?.value == null ? '' : String(v.value),
        type: String(v?.type || '')
      }));
      this.reportVariableDialogVisible = true;
    } catch {
      this.openReportViewer(reportName);
    } finally {
      this.reportVariableDialogLoading = false;
    }
  }

  /**
   * Gestisce la logica di `cancelReportVariableDialog` con il flusso specifico definito dalla sua implementazione.
   */
  cancelReportVariableDialog(): void {
    this.reportVariableDialogVisible = false;
    this.selectedReportNameForVariables = '';
    this.selectedReportVariables = [];
  }

  /**
   * Applica aggiornamenti di stato tramite `applyReportVariablesAndOpenViewer` orchestrando le chiamate `cancelReportVariableDialog` e `buildReportParametersQueryString`.
   */
  applyReportVariablesAndOpenViewer(): void {
    if (!this.selectedReportNameForVariables) {
      this.cancelReportVariableDialog();
      return;
    }

    const parameters = this.buildReportParametersQueryString(this.selectedReportVariables);
    const reportName = this.selectedReportNameForVariables;
    this.cancelReportVariableDialog();
    this.openReportViewer(reportName, parameters);
  }

  /**
   * Carica dati dal layer applicativo e li armonizza per l'uso in UI normalizzando e trasformando collezioni di record.
   */
  private async loadReportList(): Promise<void> {
    if (!this.routeName) {
      this.availableReports = [];
      this.reportMenuItems = [];
      return;
    }
    try {
      const files = await this.metaSrv.getReportList(this.routeName);
      this.availableReports = files || [];
      const existingReportItems = this.availableReports.map(f => ({
        label: f.name.replace(/\.mrt$/i, ''),
        icon: 'pi pi-chart-bar',
        command: () => { void this.openReportFromMenu(f.name); }
      }));
      this.reportMenuItems = existingReportItems;
    } catch {
      this.availableReports = [];
      this.reportMenuItems = [];
    }
  }

  /**
   * Recupera informazioni tramite `getFieldFromResizeEvent` orchestrando le chiamate `getAttribute`.
   * @param event Evento UI o payload evento che innesca il flusso del metodo.
   * @returns Valore di tipo `string | null` restituito dal metodo.
   */
  private getFieldFromResizeEvent(event: any): string | null {
    const candidate =
      event?.column?.field
      || event?.element?.getAttribute?.('data-field')
      || event?.columnElement?.getAttribute?.('data-field')
      || null;

    return typeof candidate === 'string' && candidate.length ? candidate : null;
  }

  /**
   * Recupera e prepara i dati richiesti dal chiamante orchestrando le chiamate `Number` e `isFinite`.
   * @param event Evento UI o payload evento da cui il metodo ricava input operativi.
   * @returns Valore numerico derivato dai calcoli interni (conteggio, indice, priorita o metrica operativa).
   */
  private getWidthFromResizeEvent(event: any): number {
    const eventWidth =
      event?.element?.offsetWidth
      || event?.columnElement?.offsetWidth
      || event?.column?.el?.nativeElement?.offsetWidth
      || event?.column?.offsetWidth;

    const width = Number(eventWidth);
    return Number.isFinite(width) ? width : NaN;
  }

}

