/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AfterViewInit, ChangeDetectorRef, Component, EventEmitter, HostListener, Input,
  OnDestroy, OnInit, Output, ViewChild
} from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';

import {
  SpreadsheetComponent as SyncfusionSpreadsheetComponent,
  SpreadsheetModule
} from '@syncfusion/ej2-angular-spreadsheet';
import type {
  SheetModel, CellSaveEventArgs, CellRenderEventArgs,
  MenuSelectEventArgs, CellEditEventArgs
} from '@syncfusion/ej2-spreadsheet';

import { MetaInfo } from '../../class/metaInfo';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetadatiUiStiliTabella } from '../../class/metadati_ui_stili_tabella';
import { MetadatiUiStiliColonna } from '../../class/metadati_ui_stili_colonna';
import { ResultInfo } from '../../class/resultInfo';
import { SortInfo } from '../../class/sortInfo';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';
import { DataSourceComponent } from '../data-source/data-source.component';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { ensureWuicSyncfusionLicenseRegistered } from '../../service/syncfusion-license.service';
import { ImportExportButtonComponent } from '../import-export-button/import-export-button.component';
import { SyncfusionStylesBootstrapComponent } from './syncfusion-styles-bootstrap.component';

/**
 * <wuic-spreadsheet-list-sf>
 * -----------------------------------------------------------------------
 * Wrapper Syncfusion EJ2 Spreadsheet con API pubblica IDENTICA al
 * componente storico <wuic-spreadsheet-list> basato su jspreadsheet.
 *
 * PERCHÉ ESISTE:
 *   jspreadsheet Pro è domain-locked client-side, incompatibile col modello
 *   di redistribuzione di WUIC (licenze commerciali emesse a clienti che
 *   deployano su propri domini). Syncfusion Small-Business Community License
 *   è invece server-side, senza domain lock e con redistribution clause
 *   inclusa — perfetta per framework.
 *
 * COMPATIBILITÀ SOSTITUTIVA:
 *   Il componente è drop-in compatibile col vecchio <wuic-spreadsheet-list>:
 *   stessi @Input, @Output, ViewChild ref (#lookupSource), stesse public
 *   properties (records, metaInfo, worksheetInstances/spreadsheetInstance,
 *   currentRoute, currentRecord, pageSize, pageIndex, totalRecords...),
 *   stessi metodi CRUD (handleSpreadsheetInsertRow, handleSpreadsheetDeleteRows,
 *   handleSpreadsheetSaveRows, handleSpreadsheetSavePendingChanges).
 *
 *   Alcune feature storiche sono state semplificate / marcate TODO
 *   SF-PARITY: per arrivare a parità 1:1 col vecchio (4117 righe) servirà
 *   ulteriore lavoro incrementale. I TODO sono elencati in fondo al file.
 *
 * LICENSING:
 *   Non registra la chiave qui. La registrazione è a carico dell'app host
 *   via `registerWuicSyncfusionLicense(key)` (service/syncfusion-license.service.ts)
 *   chiamato in main.ts prima di bootstrapApplication.
 */
@Component({
  selector: 'wuic-spreadsheet-list-sf',
  standalone: true,
  imports: [
    DataSourceComponent,
    SpreadsheetModule,
    ImportExportButtonComponent,
    ButtonModule,
    TranslateModule,
    SyncfusionStylesBootstrapComponent
  ],
  templateUrl: './spreadsheet-list-sf.component.html',
  styleUrl: './spreadsheet-list-sf.component.css'
})
export class SpreadsheetListSfComponent implements OnInit, AfterViewInit, OnDestroy, IDataBoundHostComponent {

  // ============================================================
  // Cache predicate stili condizionali
  // ------------------------------------------------------------
  // Compilazione one-shot di must_attribute_value / musc_attribute_value
  // (stringhe JS) in Function, cached by must_id|conditionCode.
  // Evita di ricompilare a ogni beforeCellRender (N righe x M colonne).
  // Pattern coerente con DynamicRowTemplateComponent:
  // vedi dynamic-template.component.ts righe 23/27.
  // ============================================================

  private static readonly tableStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();
  private static readonly columnStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();

  // ============================================================
  // ViewChild
  // ============================================================

  /** Host Syncfusion Spreadsheet (rendering area). */
  @ViewChild('sfSpreadsheet') sfSpreadsheet: SyncfusionSpreadsheetComponent;

  /** Backward-compat alias: alcuni parent chiamano `spreadsheet` (vecchio nome del ViewChild su `<div #spreadsheet>` jspreadsheet). */
  get spreadsheet(): { nativeElement: HTMLElement } | undefined {
    const el = (this.sfSpreadsheet as any)?.element as HTMLElement | undefined;
    return el ? { nativeElement: el } : undefined;
  }

  /** Datasource per lookup autocomplete (stesso pattern del vecchio componente). */
  @ViewChild('lookupSource') lookupSource: DataSourceComponent;

  // ============================================================
  // @Input (SIGNATURE IDENTICA AL VECCHIO COMPONENTE)
  // ============================================================

  @Input() hardcodedRoute: string;
  @Input() parentRecord: any;
  @Input() parentMetaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() hideToolbar: boolean = false;

  /**
   * Provider letto da `<wuic-import-export-button>` al click su Export XLS.
   * Arrow function per preservare il binding di `this` quando passata come Input.
   * Ritorna lo stato filtri LIVE del datasource (header/filter-bar non sono
   * propagati nella URL query string).
   */
  getCurrentFilterInfoForExport = (): any => {
    return this.datasource?.value?.filterInfo || { logic: 'AND', filters: [] };
  };

  // ============================================================
  // @Output (SIGNATURE IDENTICA AL VECCHIO COMPONENTE)
  // ============================================================

  @Output() onSpreadsheetDataBound = new EventEmitter<{
    metaInfo: MetaInfo; data: any[]; totalRecords: number;
  }>();
  @Output() onSpreadsheetBeforePageChange = new EventEmitter<{
    pageNumber: number; oldPage: number; quantityPerPage: number;
  }>();
  @Output() onSpreadsheetPageChange = new EventEmitter<{
    currentPage: number; pageSize: number; zeroBased: boolean;
  }>();
  @Output() onSpreadsheetRowInserted = new EventEmitter<{
    rowIndex: number; record: any; insertBefore: boolean;
  }>();
  @Output() onSpreadsheetRowsDeleted = new EventEmitter<{
    rowIndexes: number[]; deletedAny: boolean;
  }>();
  @Output() onSpreadsheetBatchSaved = new EventEmitter<{
    savedCount: number; mode: 'rowSelection' | 'pendingChanges';
  }>();

  // ============================================================
  // Public state (API PUBBLICA COMPATIBILE COL VECCHIO)
  // ============================================================

  /** Opzioni Syncfusion correnti (equivalente a spreadsheetOptions jspreadsheet). */
  spreadsheetOptions: any;

  /** Records correnti renderizzati. */
  records: any[] = [];

  /** Alias dei column metadata (compat vecchia). */
  metas: MetadatiColonna[];

  /** Route corrente (usata da lookup datasource). */
  currentRoute: BehaviorSubject<string> = new BehaviorSubject<string>(null!);
  /** Record in edit (popolato durante cellEdit / autocomplete). */
  currentRecord: any;
  /** Colonna in edit. */
  currentField: MetadatiColonna;

  cols: any;
  metaInfo: MetaInfo;
  loading: boolean = false;

  /** Istanza Syncfusion esposta per compat con chi leggeva `worksheetInstances[0]`. */
  get spreadsheetInstance(): SyncfusionSpreadsheetComponent | undefined {
    return this.sfSpreadsheet;
  }
  /** Shim: emula `worksheetInstances: jspreadsheet.worksheetInstance[]` del vecchio. */
  get worksheetInstances(): any[] {
    return this.sfSpreadsheet ? [this.sfSpreadsheet] : [];
  }

  // Autocomplete / lookup state
  autoCompleteEditor: any;
  inputEvent: any;
  currentEditorInstance: any;
  currentCell: any;
  selectedItem: any;
  info: any;
  autocompleteItems: { resultInfo: ResultInfo; metaInfo: MetaInfo; };
  currentAutocompleteItemIndex: number;

  // Pagination
  pageSize: number = 10;
  pageIndex: number = 1;
  totalRecords: number = 0;

  /** Slice dei records effettivamente mostrati nella pagina corrente (client paging). */
  pagedRecords: any[] = [];
  isServerSide: boolean = false;

  /**
   * Subset di `records` che matcha il filtro attivo. null = nessun filtro,
   * tutti i records mostrati. Quando filtrato, paging e sort operano su
   * questo array. Viene azzerato on "clear filter".
   */
  filteredRecords: any[] | null = null;

  /**
   * Stato filtri per colonna. Chiave = `mc_nome_colonna` della colonna.
   * Valore = Set dei valori (già formattati per display) selezionati.
   * Solo i record il cui valore di quella colonna è nel Set passano il filtro.
   * Una colonna senza entry nella Map = nessun filtro su quella colonna.
   */
  private columnFilters = new Map<string, Set<string>>();

  /**
   * Flag attivo durante un save immediato (cell-level edit, batch fallback,
   * delete) per sopprimere il subscribe al `fetchInfo$` del datasource.
   * Il `syncData` post-save chiama `publishLocalStateUpdate` che riemette
   * il `resultInfo.dato` interno del datasource (non sincronizzato con la
   * modifica appena salvata), provocando rollback UI se non sospeso.
   */
  private suppressFetchInfoDuringSync: boolean = false;

  /** DOM overlay corrente del popup filter custom (null se chiuso). */
  private filterPopupEl: HTMLElement | null = null;
  private filterPopupOutsideClickHandler?: (ev: MouseEvent) => void;

  routeName: any;

  // ============================================================
  // Private state
  // ============================================================

  private fetchInfoSubscription?: Subscription;
  private datasourceReadySubscription?: Subscription;
  private themeObserver?: MutationObserver;
  private pendingLayoutPassTimeouts: number[] = [];

  /** Set di indici (relativi a `records` globali, non paginati) con modifiche pending non ancora persistite. */
  private pendingSpreadsheetRows = new Set<number>();

  /** Flag per distinguere operazioni programmatiche da edit utente. */
  private suppressCellSaveEvents = false;

  /** Syncfusion `created` evento → ready per operazioni DOM-bound (scroll, events, ecc.). */
  private sfReady = false;

  /** Config sheet accumulata mentre attendiamo che `sfReady` diventi true. */
  private pendingSheetConfig: SheetModel | null = null;

  /**
   * Array sheets bindato in template via `[sheets]="sfSheets"`. Angular push
   * il cambio come input al SpreadsheetComponent Syncfusion, che a sua volta
   * gestisce lifecycle/render internamente. È il pattern idiomatico per
   * Syncfusion Angular.
   *
   * Lasciato vuoto per partenza: il template renderizza `<ejs-spreadsheet>`
   * solo quando abbiamo una config reale (evita doppio render placeholder + vera).
   */
  sfSheets: SheetModel[] = [];

  /**
   * Altezza dinamica del Syncfusion Spreadsheet in px. Calcolata in base al
   * numero di righe dati correnti: header + N data rows * row-height + buffer.
   * Default `auto` (Syncfusion usa l'altezza del contenitore).
   */
  sfHeight: string = 'auto';

  /** Larghezza dinamica calcolata come sopra. */
  sfWidth: string = '100%';

  /**
   * scrollSettings.isFinite: true → Syncfusion limita la griglia scrollabile
   * esattamente ai dati caricati (usedRange), niente celle vuote extra
   * oltre la zona dati. Sostituisce gli hack con max-height + overflow:hidden.
   * enableVirtualization: true è il default Syncfusion, lasciato per performance.
   */
  sfScrollSettings = { isFinite: true, enableVirtualization: true };

  // ============================================================
  // Constructor
  // ============================================================

  constructor(
    private cd: ChangeDetectorRef,
    private titleService: Title,
    private activatedRoute: ActivatedRoute,
    private http: HttpClient,
    private wtoolbox: WtoolboxService,
    private metadataProvider: MetadataProviderService,
    private userInfoService: UserInfoService,
  ) {
    // Attiva automaticamente la Community License Syncfusion bundled nel
    // framework. Idempotente — le istanze successive non ripetono il lavoro.
    // Il cliente finale di WUIC non deve fare nulla in main.ts, la chiave è
    // gia bundled nel FESM del wuic-framework-lib.
    ensureWuicSyncfusionLicenseRegistered();
  }

  // ============================================================
  // OnInit / ngAfterViewInit / OnDestroy
  // ============================================================

  ngOnInit(): void {
    this.routeName = this.hardcodedRoute
      || this.activatedRoute.snapshot?.params?.['route_name']
      || this.activatedRoute.snapshot?.data?.['route_name'];
    this.currentRoute.next(this.routeName);
  }

  ngAfterViewInit(): void {
    this.initThemeObserver();

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource && this.datasource.value) {
      this.subscribeToDS();
    } else if (this.datasource) {
      this.datasourceReadySubscription?.unsubscribe();
      this.datasourceReadySubscription = this.datasource.subscribe((ds) => {
        if (ds) {
          this.datasourceReadySubscription?.unsubscribe();
          this.datasourceReadySubscription = undefined;
          this.subscribeToDS();
        } else {
          this.cd.detectChanges();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
    this.themeObserver?.disconnect();
    this.stopColHeaderObserver();
    this.clearPendingLayoutPassTimeouts();
    try {
      (this.sfSpreadsheet as any)?.destroy?.();
    } catch {
      // swallow
    }
  }

  // ============================================================
  // DataSource subscription
  // ============================================================

  subscribeToDS(): void {
    if (!this.datasource?.value) return;

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = this.datasource.value.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = this.datasource?.value?.route?.value || this.routeName;
      if (!info || dataSourceRoute !== info.metaInfo?.tableMetadata?.md_route_name) return;

      // Suppressione durante un save immediato in corso: `syncData` del datasource
      // chiama `publishLocalStateUpdate` che riemette `fetchInfo$` col vecchio
      // `resultInfo.dato` (non ancora sincronizzato con la modifica appena
      // salvata). Se non skippiamo, `parseData` overwrite `this.records` col
      // valore PRE-edit → UI torna indietro. Al termine del save il flag è
      // resettato e il componente fa rebuild manuale col record aggiornato.
      if (this.suppressFetchInfoDuringSync) return;

      if (info?.resultInfo && !info.resultInfo.dato) {
        this.datasource.value.fetchData();
        return;
      }
      if (!info?.resultInfo?.dato) return;

      // Defer fuori dal CD pass corrente (vedi vecchio componente per la motivazione NG0100).
      queueMicrotask(() => {
        this.records = this.parseData(info.resultInfo.dato, info.metaInfo);
        this.metaInfo = info.metaInfo;
        // Preserva le larghezze colonne modificate dall'utente: il metaInfo
        // appena arrivato dal backend puo' avere ancora i valori pre-resize
        // (cache metadata non invalidata). Ri-applichiamo le width della
        // sessione corrente dalla mappa userResizedColumnWidths.
        this.applyUserResizedWidths();
        this.metas = info.metaInfo.columnMetadata;
        this.totalRecords = Number(info.resultInfo?.totalRowCount || this.records.length || 0);

        this.isServerSide = info.metaInfo?.tableMetadata?.md_server_side_operations === true;

        // Risolvi page size: datasource > metadata > default 10.
        const datasourcePageSize = Number(this.datasource?.value?.pageSize);
        const metadataPageSize = Number(this.metaInfo?.tableMetadata?.md_pagesize);
        const fallbackPageSize = Number(this.pageSize || 10);
        this.pageSize = Number.isFinite(datasourcePageSize) && datasourcePageSize > 0
          ? Math.trunc(datasourcePageSize)
          : (Number.isFinite(metadataPageSize) && metadataPageSize > 0
            ? Math.trunc(metadataPageSize)
            : Math.max(1, Math.trunc(fallbackPageSize || 10)));
        this.pageIndex = Number(this.datasource?.value?.currentPage || this.pageIndex || 1);

        if (this.datasource?.value) {
          this.datasource.value.pageSize = Math.max(0, Math.trunc(this.pageSize || 0));
          this.datasource.value.currentPage = Math.max(1, Math.trunc(this.pageIndex || 1));
        }

        this.onSpreadsheetDataBound.emit({
          metaInfo: this.metaInfo,
          data: this.records,
          totalRecords: this.totalRecords
        });

        // Costruiamo sheet + data in una sola operazione atomica e poi
        // assegniamo sfSheets una volta sola. Syncfusion osserva il cambio
        // di input `sheets` e monta il componente con i dati gia popolati.
        this.rebuildSheetWithData();
        this.cd.detectChanges();
      });
    });
  }

  /**
   * Trasforma il record raw del datasource (con BehaviorSubject wrapping) in
   * record "piatti" per il binding Syncfusion. Syncfusion Spreadsheet lavora
   * su array di oggetti plain, non su BehaviorSubject wrapped fields.
   */
  parseData(raw: any[], metaInfo: MetaInfo): any[] {
    if (!Array.isArray(raw)) return [];
    const ds = this.datasource?.value;
    return raw.map(row => {
      const plain: any = {};
      for (const col of metaInfo.columnMetadata || []) {
        const name = col.mc_nome_colonna;
        const value = row?.[name];
        if (value != null && typeof value === 'object' && 'value' in value && typeof (value as any).subscribe === 'function') {
          // BehaviorSubject — prendi il .value corrente
          plain[name] = (value as any).value;
        } else {
          plain[name] = value ?? null;
        }

        // Lookup alias (ID___displayField__colonna): preserva display string per cella lookup
        if (col.mc_ui_column_type === 'lookupByID' && col.mc_ui_lookup_entity_name && col.mc_ui_lookup_dataTextField) {
          const aliasField = this.getLookupAliasField(col);
          const aliasValue = row?.[aliasField];
          if (aliasValue != null) {
            plain[aliasField] = typeof aliasValue === 'object' && 'value' in aliasValue
              ? (aliasValue as any).value
              : aliasValue;
          }
        }
      }
      // Preserva pKey/guid/flag di tracking
      if (row?.['__new']) plain['__new'] = row['__new'];
      if (row?.['__guid']) plain['__guid'] = row['__guid'];
      return plain;
    });
  }

  // ============================================================
  // Costruzione del Syncfusion Sheet da metadata WUIC
  // ============================================================

  /**
   * Equivalente del vecchio `initOptions()` jspreadsheet — costruisce
   * il Sheet Syncfusion partendo da metaInfo.columnMetadata e lo applica
   * via Syncfusion `openFromJson()` / reimpostazione di `sheets`.
   */
  /**
   * Costruisce un SheetModel Syncfusion COMPLETO (columns + ranges con dataSource
   * gia popolato) e lo assegna a `this.sfSheets` in un'unica operazione atomica.
   *
   * Syncfusion in v33 NON osserva mutazioni deep su `sheets[].ranges[].dataSource`
   * dopo che il componente e' montato (il grid interno renderizza solo la
   * griglia vuota di default 100x100). L'unico modo affidabile per aggiornare
   * i dati e' sostituire l'intero sheet passando una nuova array reference al
   * binding `[sheets]`, cosicche EJ2 triggera il re-render completo.
   *
   * Note:
   * - Questa e' anche la funzione chiamata ad ogni cambio pagina client-side,
   *   quindi il costo di un re-render completo si paga ad ogni page change.
   *   Per dataset tipici (10-100 righe per pagina) e' accettabile.
   * - `showFieldAsHeader: true` + `startCell: 'A1'` fa si che Syncfusion
   *   renderizzi automaticamente una riga header con le keys del dataSource
   *   (mapped ai display string WUIC) a riga 1, e i dati da riga 2 in poi.
   */
  /** Sorgente corrente per paging: filtered se filtro attivo, altrimenti records full. */
  private get effectiveRecords(): any[] {
    const base = this.filteredRecords ?? this.records;
    // In batch mode escludi i record marcati __deleted (pending delete): spariscono
    // visivamente finché l'utente non clicca "Salva modifiche", poi vanno al server
    // come batch entity con `_destroy: true`. Se il batch non è abilitato il flag
    // non viene mai impostato, quindi il filter è no-op.
    return base.filter((r: any) => !this.isRecordDeleted(r));
  }

  private isRecordDeleted(record: any): boolean {
    if (!record) return false;
    const d = record.__deleted;
    if (d == null) return false;
    if (typeof d === 'boolean') return d;
    if (typeof d === 'object' && 'value' in d) return !!(d as any).value;
    return !!d;
  }

  private markRecordDeleted(record: any): void {
    if (!record) return;
    const cur = record.__deleted;
    if (cur && typeof cur === 'object' && typeof (cur as any).next === 'function') {
      (cur as any).next(true);
    } else {
      record.__deleted = new BehaviorSubject<boolean>(true);
    }
  }

  private rebuildSheetWithData(): void {
    if (!this.metaInfo) return;

    const visibleMetaCols = (this.metaInfo.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
    const sfColumns = visibleMetaCols.map((col) => this.mapColumnWidth(col));

    // Page slicing su effectiveRecords (filtered se filter attivo)
    const source = this.effectiveRecords;
    if (this.isServerSide) {
      this.pagedRecords = [...source];
    } else {
      const start = Math.max(0, (this.pageIndex - 1) * this.pageSize);
      this.pagedRecords = source.slice(start, start + this.pageSize);
    }

    // Mappa record → riga sheet con celle esplicite (value in ordine colonna).
    // Non usiamo `dataSource` con array di oggetti perché Syncfusion, quando
    // vede oggetti, aggiunge automaticamente una riga header con le chiavi
    // (anche senza showFieldAsHeader). Usando `rows[].cells[]` passiamo solo
    // i valori e abbiamo controllo completo: nessuna riga header nel dati.
    const sheetRows: any[] = this.pagedRecords.map(rec => {
      const cells = visibleMetaCols.map(col => ({
        value: this.formatValueForDisplay(rec?.[col.mc_nome_colonna], col, rec)
      }));
      return { cells };
    });

    // NUOVO APPROCCIO: usiamo il comportamento STANDARD Syncfusion Spreadsheet:
    // - riga column-letter (nativa Syncfusion, dove sono i resize grip)
    //   → riscriviamo le lettere A/B/C... con i nomi colonna WUIC via DOM
    //     in `syncColumnHeadersWithMetadata()` chiamato su `created`/`dataBound`
    // - celle dati partono da sheet row 0 (NO riga header intermedia)
    // - niente `showFieldAsHeader: true` → niente workaround, niente click offset

    // Solo le righe con dati effettivi. L'insert di nuove righe avviene
    // via toolbar / context-menu (handleSpreadsheetInsertRow), non con un
    // placeholder empty-row in fondo.
    const effectiveRowCount = sheetRows.length;
    const effectiveColCount = visibleMetaCols.length;

    const sheet: SheetModel = {
      name: this.metaInfo.tableMetadata?.md_display_string || 'Data',
      columns: sfColumns,
      rowCount: effectiveRowCount,
      colCount: effectiveColCount,
      rows: sheetRows
    };

    // Altezza: 100% del container host (flex 1 auto in parent).
    // - Se lo spazio è sufficiente per tutti i record: niente scroll, panel
    //   riempie solo lo spazio necessario (per `scrollSettings.isFinite:true`)
    // - Se i record eccedono lo spazio: scrollbar interna automatica del panel
    // Con sfHeight='100%' + isFinite evitiamo sia le celle vuote che il
    // clipping quando N righe * rowH > viewport.
    this.sfHeight = '100%';
    this.sfWidth = '100%';

    this.pendingSheetConfig = sheet;
    this.spreadsheetOptions = { sheets: [sheet] };
    this.sfSheets = [sheet];

    // Force refresh post-sheets-change: senza questo, dopo cambio page size
    // EJ2 piazza le nuove celle fuori viewport (y=1365).
    this.cd.detectChanges();
    setTimeout(() => {
      try { (this.sfSpreadsheet as any)?.refresh?.(); } catch { /* swallow */ }
      // Ri-applica sync header (funnel custom + nomi colonna) che Syncfusion
      // perde ad ogni refresh del DOM.
      this.syncColumnHeadersWithMetadata();
    }, 30);
  }

  /** @deprecated sostituito da scrollSettings.isFinite */
  private applyHardClip(_visibleRowsN: number, _colCount: number): void {
    // no-op
  }

  /**
   * Converte un valore raw del record in stringa/tipo adatto al rendering
   * Syncfusion Spreadsheet. Gestisce tutti i tipi `mc_ui_column_type` WUIC.
   *
   * Pattern per tipo:
   * - lookupByID → display alias (es. "Graphic Design Institute" invece di 42)
   * - boolean/number_boolean → "Sì" / "No"
   * - date → "dd/MM/yyyy"
   * - datetime → "dd/MM/yyyy HH:mm"
   * - time → "HH:mm"
   * - number → numero (Syncfusion lo formatta secondo `format` della colonna)
   * - dictionary → label dalla mappa `mc_dictionary_value`
   * - text/txt_area/default → stringa raw
   */
  private formatValueForDisplay(value: any, col: MetadatiColonna, rec: any): any {
    if (value == null) return '';

    // Unwrap BehaviorSubject se residuo
    if (typeof value === 'object' && 'value' in value && typeof (value as any).subscribe === 'function') {
      value = (value as any).value;
    }

    const type = col.mc_ui_column_type;
    const locale = this.resolveLocale();

    switch (type) {
      case 'lookupByID': {
        const aliasField = this.getLookupAliasField(col);
        return rec?.[aliasField] ?? value ?? '';
      }

      case 'boolean':
      case 'number_boolean': {
        const truthy = value === true || value === 1 || value === '1' || value === 'true' || value === 'True';
        // Traduzione Sì/No localizzata; per altri locali default Yes/No.
        if (locale.startsWith('it')) return truthy ? 'Sì' : 'No';
        if (locale.startsWith('es')) return truthy ? 'Sí' : 'No';
        if (locale.startsWith('fr')) return truthy ? 'Oui' : 'Non';
        if (locale.startsWith('de')) return truthy ? 'Ja' : 'Nein';
        return truthy ? 'Yes' : 'No';
      }

      case 'date': {
        const d = this.tryParseDate(value);
        if (!d) return String(value);
        // Prefisso zero-width-joiner: impedisce a Syncfusion di ri-parsare il
        // testo come data (che altrimenti rimuove i leading zero con il suo
        // format interno m/d/yyyy). Invisibile all'utente.
        return '\u200B' + new Intl.DateTimeFormat(locale, {
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(d);
      }

      case 'datetime': {
        const d = this.tryParseDate(value);
        if (!d) return String(value);
        return '\u200B' + new Intl.DateTimeFormat(locale, {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }).format(d);
      }

      case 'time': {
        const d = this.tryParseDate(value);
        if (!d) return String(value);
        return '\u200B' + new Intl.DateTimeFormat(locale, {
          hour: '2-digit', minute: '2-digit'
        }).format(d);
      }

      case 'dictionary': {
        const dict = this.parseDictionarySource(col);
        const lookupId = String(value);
        const match = dict.find(d => String(d.id) === lookupId);
        return match ? match.label : value;
      }

      case 'number': {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return String(value);
        // Intl.NumberFormat con il locale corrente applica separatore decimale e
        // migliaia corretto (es. 1.234,56 per it-IT vs 1,234.56 per en-US).
        return new Intl.NumberFormat(locale).format(n);
      }

      default:
        return String(value);
    }
  }

  /**
   * Risolve il locale corrente da usare per formatting data/numeri.
   * Priorità:
   * 1. UserInfoService language (preferenza utente loggato, es. 'it-IT')
   * 2. `document.documentElement.lang` (se app host lo setta)
   * 3. `navigator.language` (browser)
   * 4. fallback 'it-IT'
   */
  private resolveLocale(): string {
    try {
      const userLang = this.userInfoService?.getuserInfo()?.language
        || (this.userInfoService?.getuserInfo() as any)?.lingua?.id;
      if (typeof userLang === 'string' && userLang.length >= 2) return userLang;
    } catch { /* ignore */ }
    try {
      const htmlLang = typeof document !== 'undefined' ? document.documentElement?.lang : null;
      if (htmlLang && htmlLang.length >= 2) return htmlLang;
    } catch { /* ignore */ }
    try {
      if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    } catch { /* ignore */ }
    return 'it-IT';
  }

  private tryParseDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    const str = String(value);
    // ISO / anything Date() can parse
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
    // Italian format dd/mm/yyyy
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      return new Date(
        Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0)
      );
    }
    return null;
  }

  private formatDateIT(d: Date, withTime: boolean): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const base = `${dd}/${mm}/${yyyy}`;
    if (!withTime) return base;
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${base} ${hh}:${min}`;
  }

  /**
   * Parsing di `mc_dictionary_value` WUIC: stringa "ID1@@Label1||ID2@@Label2"
   * → array `{ id, label }[]`. Usato per render valori dictionary.
   */
  private parseDictionarySource(col: MetadatiColonna): Array<{ id: string; label: string }> {
    const raw = col?.mc_dictionary_value;
    if (!raw || typeof raw !== 'string') return [];
    return raw.split('||').map(pair => {
      const parts = pair.split('@@');
      return {
        id: (parts[0] ?? '').trim(),
        label: (parts[1] ?? parts[0] ?? '').trim()
      };
    }).filter(d => d.id !== '');
  }

  /**
   * Retrocompatibilita: il vecchio flusso chiamava buildSyncfusionSheet()
   * + applyPageSlice() separatamente. Ora entrambi delegano a
   * rebuildSheetWithData() per evitare il bug di mutazione deep.
   */
  private buildSyncfusionSheet(): void {
    this.rebuildSheetWithData();
  }

  private flushPendingSheetConfig(): void {
    // no-op: la prima assegnazione avviene gia in rebuildSheetWithData
  }

  /**
   * Mappa `MetadatiColonna.mc_ui_column_type` → ColumnModel Syncfusion
   * (width, format numeric/date, data-validation per dictionary/lookup).
   */
  private mapColumnWidth(col: MetadatiColonna): any {
    const widthPx = this.parsePixelWidthOrDefault(col.mc_ui_grid_size_width, 120);
    return { width: widthPx };
  }

  private parsePixelWidthOrDefault(raw: any, fallback: number): number {
    if (raw == null) return fallback;
    const str = String(raw).trim();
    const pxMatch = str.match(/^(\d+(?:\.\d+)?)px$/i);
    if (pxMatch) return Math.max(60, Math.round(parseFloat(pxMatch[1])));
    const percentMatch = str.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
      const hostWidth = this.spreadsheet?.nativeElement?.clientWidth || 0;
      if (hostWidth > 0) {
        return Math.max(60, Math.round((parseFloat(percentMatch[1]) / 100) * hostWidth));
      }
    }
    const numeric = Number(str);
    if (Number.isFinite(numeric) && numeric > 0) return Math.max(60, Math.round(numeric));
    return fallback;
  }

  // ============================================================
  // Pagination (manuale, Syncfusion non la offre built-in)
  // ============================================================

  /**
   * Applica slice client-side su `records` → `pagedRecords` e lo scrive nel
   * primo `rangeSettings` dello sheet Syncfusion.
   *
   * Server-side: il datasource ha gia caricato SOLO la pagina corrente,
   * quindi `pagedRecords === records`.
   */
  private applyPageSlice(): void {
    // Delega a rebuildSheetWithData() — Syncfusion non osserva mutazioni
    // deep sul dataSource, quindi page change = rebuild completo.
    this.rebuildSheetWithData();
  }

  /** Cambia pagina lato client. */
  setClientPage(page: number): void {
    const maxPage = Math.max(1, Math.ceil(this.effectiveRecords.length / this.pageSize));
    const safePage = Math.min(maxPage, Math.max(1, Math.trunc(page)));
    if (safePage === this.pageIndex) return;
    const oldPage = this.pageIndex;
    this.pageIndex = safePage;
    // Sync datasource.currentPage: la subscribe a fetchInfo$ rilegge
    // `ds.currentPage` dopo ogni fetchData (es. post save/sync). Senza
    // questa sync, ds.currentPage resta stale a 1 e il post-save riporta
    // lo spreadsheet a pagina 1 anche se l'utente era a pagina 3.
    if (this.datasource?.value) {
      this.datasource.value.currentPage = safePage;
    }
    this.applyPageSlice();
    this.onSpreadsheetPageChange.emit({
      currentPage: safePage,
      pageSize: this.pageSize,
      zeroBased: false
    });
    // Emette anche BeforePageChange per coerenza API con vecchio jspreadsheet
    this.onSpreadsheetBeforePageChange.emit({
      pageNumber: safePage,
      oldPage,
      quantityPerPage: this.pageSize
    });
  }

  /** Cambia dimensione pagina (da dropdown custom). */
  setPageSize(size: number): void {
    const safeSize = Math.max(1, Math.trunc(Number(size) || 10));
    if (safeSize === this.pageSize) return;
    this.pageSize = safeSize;
    this.pageIndex = 1;
    if (this.datasource?.value) {
      this.datasource.value.pageSize = safeSize;
      this.datasource.value.currentPage = 1;
    }
    if (this.isServerSide) {
      // Server-side: re-fetch with new page size; subscribeToDS rebuilds sheet.
      this.datasource?.value?.fetchData?.();
    } else {
      // Client-side: just re-slice records and rebuild sheet.
      this.rebuildSheetWithData();
    }
  }

  /** Server-side: chiamata quando l'utente clicca pagina nella custom pagination UI. */
  handleServerPageChange(pageNumber: number, pageSize: number): void {
    this.onSpreadsheetBeforePageChange.emit({
      pageNumber,
      oldPage: this.pageIndex,
      quantityPerPage: pageSize
    });
    const ds = this.datasource?.value;
    if (!ds) return;
    ds.currentPage = pageNumber;
    ds.pageSize = pageSize;
    this.pageIndex = pageNumber;
    this.pageSize = pageSize;
    ds.fetchData();
  }

  get totalPages(): number {
    if (this.isServerSide) {
      return Math.max(1, Math.ceil(this.totalRecords / this.pageSize));
    }
    return Math.max(1, Math.ceil(this.effectiveRecords.length / this.pageSize));
  }

  // ============================================================
  // Lookup autocomplete helpers (stesso pattern vecchio componente)
  // ============================================================

  getLookupAliasField(col: MetadatiColonna): string {
    return (col.mc_ui_lookup_entity_name?.toString().replaceAll(' ', '_') || '')
      + '___' + col.mc_ui_lookup_dataTextField + '__' + col.mc_nome_colonna;
  }

  // ============================================================
  // CRUD Handlers (API COMPATIBILE COL VECCHIO)
  // ============================================================

  /**
   * Insert row: equivalente del vecchio `handleSpreadsheetInsertRow()`.
   * Syncfusion API: `insertRow(rows, startIndex)`.
   */
  async handleSpreadsheetInsertRow(targetRow?: number, insertBefore: boolean = true): Promise<void> {
    const currentDs = this.datasource?.value;
    if (!currentDs || !this.canInsertRows()) return;

    try {
      const record = currentDs.addNewRecord();
      const plainRecord = currentDs.getModelFromObservable(record);
      plainRecord['__new'] = record['__new'] || new BehaviorSubject<boolean>(true);
      plainRecord['__guid'] = record['__guid'] || new BehaviorSubject<string>(WtoolboxService.uuidv4());

      const baseIndex = Number(targetRow);
      const targetIndex = Number.isFinite(baseIndex)
        ? (insertBefore ? Math.max(0, Math.trunc(baseIndex)) : Math.max(0, Math.trunc(baseIndex) + 1))
        : this.records.length;
      const insertIndex = Math.min(Math.max(targetIndex, 0), this.records.length);

      // Aggiungi ai records in memoria
      this.records.splice(insertIndex, 0, plainRecord);
      this.markPendingRow(plainRecord);

      // Chiedi a Syncfusion di aggiungere una riga vuota all'indice corrispondente nella pagina
      // Nota: Syncfusion usa indice assoluto nel sheet; la riga 1 è l'header.
      try {
        const sfInsertRowIdx = (insertIndex - (this.pageIndex - 1) * this.pageSize) + 1; // +1 per header
        if (sfInsertRowIdx >= 1) {
          (this.sfSpreadsheet as any).insertRow?.([{}], sfInsertRowIdx);
        }
      } catch {
        // Fallback: re-render completo
        this.applyPageSlice();
      }

      this.onSpreadsheetRowInserted.emit({
        rowIndex: insertIndex,
        record: plainRecord,
        insertBefore
      });
    } catch (err) {
      console.error('[SpreadsheetListSf] insert row error', err);
    }
  }

  /**
   * Delete rows selezionate. Syncfusion: `deleteRow(startIndex, endIndex)`.
   */
  async handleSpreadsheetDeleteRows(rowHint?: number): Promise<void> {
    const currentDs = this.datasource?.value;
    if (!currentDs || !this.canDeleteRows()) return;

    const rowIndexes = this.getVisibleRowIndexes(rowHint).sort((a, b) => b - a);
    if (!rowIndexes.length) return;

    // --- BATCH MODE: nessuna chiamata al backend. Marchiamo i record come
    // `__deleted=true` e aggiungiamo a `pendingSpreadsheetRows`. Il delete reale
    // avverrà al click di "Salva modifiche" via `syncDataBatch` con payload
    // `_destroy: true` (vedi `buildBatchEntity`).
    if (this.isBatchSaveEnabled()) {
      const markedIndexes: number[] = [];
      const toRemoveNewLocally: any[] = [];
      for (const rowIndex of rowIndexes) {
        const record = this.records?.[rowIndex];
        if (!record) continue;
        // Conditional delete rule
        if (this.metaInfo?.tableMetadata?.md_conditional_delete_rule
          && !this.metaInfo.tableMetadata.md_conditional_delete_rule_fn(
            this.metaInfo, record, currentDs, WtoolboxService
          )) {
          continue;
        }
        const isNew = record?.__new === true
          || (record?.__new && typeof record.__new === 'object' && (record.__new as any).value === true);
        if (!record[this.metaInfo?.pKey?.mc_nome_colonna] || isNew) {
          // Riga nuova non ancora salvata sul server → rimozione solo locale,
          // niente payload batch.
          toRemoveNewLocally.push(record);
        } else {
          this.markRecordDeleted(record);
          this.markPendingRow(record);
          markedIndexes.push(rowIndex);
        }
      }
      for (const rec of toRemoveNewLocally) this.removeRecordLocally(rec);
      // Rebuild per nascondere le righe marcate (effectiveRecords filtra __deleted).
      this.rebuildSheetWithData();
      this.onSpreadsheetRowsDeleted.emit({ rowIndexes: markedIndexes, deletedAny: markedIndexes.length > 0 });
      return;
    }

    // --- IMMEDIATE MODE: delete server-side immediato (flusso originale).
    let deletedAny = false;
    const toRemoveLocally: any[] = [];

    // Sopprimi il subscribe a fetchInfo$ durante il ciclo delete: syncData
    // chiama publishLocalStateUpdate che altrimenti riemetterebbe il record
    // cancellato (ancora presente nel resultInfo.dato interno).
    this.suppressFetchInfoDuringSync = true;
    try {
      for (const rowIndex of rowIndexes) {
        const record = this.records?.[rowIndex];
        if (!record) continue;

        if (record[this.metaInfo?.pKey?.mc_nome_colonna]) {
          if (this.metaInfo?.tableMetadata?.md_conditional_delete_rule
            && !this.metaInfo.tableMetadata.md_conditional_delete_rule_fn(
              this.metaInfo, record, currentDs, WtoolboxService
            )) {
            continue;
          }

          try {
            const result = await this.syncRecordViaDatasource(record, record, 'delete');
            if (result) {
              deletedAny = true;
              toRemoveLocally.push(record);
            }
          } catch (err) {
            console.error('[SpreadsheetListSf] delete row error', err);
          }
        } else {
          // Riga nuova mai salvata — rimuovila solo in memoria
          deletedAny = true;
          toRemoveLocally.push(record);
        }
      }
    } finally {
      this.suppressFetchInfoDuringSync = false;
    }

    for (const rec of toRemoveLocally) {
      this.removeRecordLocally(rec);
    }

    this.onSpreadsheetRowsDeleted.emit({ rowIndexes, deletedAny });
  }

  /**
   * Save righe selezionate. Stesso flusso del vecchio componente.
   */
  async handleSpreadsheetSaveRows(rowHint?: number): Promise<void> {
    const currentDs = this.datasource?.value;
    if (!currentDs) return;

    // Flush edit cella attiva (vedi commento in handleSpreadsheetSavePendingChanges).
    await this.flushPendingCellEdit();

    const rowIndexes = this.getVisibleRowIndexes(rowHint);
    if (!rowIndexes.length) return;

    const records = rowIndexes.map(i => this.records?.[i]).filter(r => !!r);
    let savedCount = 0;
    try {
      const result = await this.saveSpreadsheetRecords(records);
      savedCount = result?.savedCount || 0;
    } catch (err) {
      console.error('[SpreadsheetListSf] save rows error', err);
      if (this.isBatchSaveEnabled()) {
        this.notifySpreadsheetBatchSave('error', 'Salvataggio batch', 'Errore durante il salvataggio batch.');
      }
    }

    if (savedCount > 0) {
      this.pendingSpreadsheetRows.clear();
      // Rimuovi fisicamente i record marcati deleted che sono stati processati
      // con successo (server li ha cancellati, il flag __deleted non serve più).
      const deletedRecords = records.filter(r => this.isRecordDeleted(r));
      for (const rec of deletedRecords) this.removeRecordLocally(rec);
      // NB: non rifacciamo `currentDs.fetchData()` qui. `syncData()` del
      // datasource (invocato da saveSpreadsheetRecords via
      // syncRecordViaDatasource) aggiorna `resultInfo.dato` IN PLACE e
      // chiama `publishLocalStateUpdate()` che riemette `fetchInfo$`:
      // la subscribe dello spreadsheet riceve i nuovi dati e rebuildda
      // solo la pagina corrente, preservando `this.pageIndex`/scroll.
      // Un fetchData extra qui rifarebbe il roundtrip HTTP completo e
      // resetterebbe la paginazione (se qualche percorso lascia stale
      // `ds.currentPage`).
      if (this.isBatchSaveEnabled()) {
        this.notifySpreadsheetBatchSave('success', 'Salvataggio batch', `Salvati ${savedCount} record.`);
      }
      this.onSpreadsheetBatchSaved.emit({ savedCount, mode: 'rowSelection' });
    } else if (this.isBatchSaveEnabled()) {
      this.notifySpreadsheetBatchSave('info', 'Salvataggio batch', 'Nessuna modifica da salvare.');
    }
  }

  /** Save di tutte le pending changes tracciate dal datasource. */
  async handleSpreadsheetSavePendingChanges(): Promise<void> {
    const currentDs = this.datasource?.value;
    if (!currentDs) return;

    // Se l'utente ha modificato una cella e cliccato "Salva modifiche" SENZA
    // prima premere Enter/Tab/cambiare cella, l'edit e' ancora open nell'editor
    // Syncfusion (valore nell'input, non ancora applicato al record). Senza
    // questo flush il record non risulta pending e il save parte a vuoto.
    await this.flushPendingCellEdit();

    const pending = (currentDs.changes || []).filter((x: any) => Array.isArray(x?.changes) && x.changes.length > 0);
    const localPendingIndexes = Array.from(this.pendingSpreadsheetRows).filter((idx) => idx >= 0 && idx < this.records.length);

    if (!pending.length && !localPendingIndexes.length) return;

    const pkeyName = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0]?.mc_nome_colonna;
    const matchedRecordsFromTracked = this.records.filter((record: any) =>
      pending.some((change: any) => this.recordMatchesTrackedChange(record, change, pkeyName))
    );
    const matchedRecordsFromLocal = localPendingIndexes.map(i => this.records[i]).filter(r => !!r);
    const matchedRecords = Array.from(new Set([...matchedRecordsFromTracked, ...matchedRecordsFromLocal]));

    if (!matchedRecords.length) return;

    let savedCount = 0;
    try {
      const result = await this.saveSpreadsheetRecords(matchedRecords);
      savedCount = result?.savedCount || 0;
    } catch (err) {
      console.error('[SpreadsheetListSf] save pending changes error', err);
      if (this.isBatchSaveEnabled()) {
        this.notifySpreadsheetBatchSave('error', 'Salvataggio batch', 'Errore durante il salvataggio batch.');
      }
    }

    if (savedCount > 0) {
      this.pendingSpreadsheetRows.clear();
      matchedRecords.forEach(ent => {
        this.datasource.value.removeTrackedChangesForEntity(ent, ent);
      });
      // Rimuovi fisicamente i record marcati deleted che sono stati processati
      // con successo.
      const deletedRecords = matchedRecords.filter(r => this.isRecordDeleted(r));
      for (const rec of deletedRecords) this.removeRecordLocally(rec);
      // NB: nessun fetchData qui. syncData del datasource aggiorna
      // `resultInfo.dato` in place + publishLocalStateUpdate → la subscribe
      // rebuild della pagina corrente. Evita reset di paginazione/scroll.
      if (this.isBatchSaveEnabled()) {
        this.notifySpreadsheetBatchSave('success', 'Salvataggio batch', `Salvati ${savedCount} record.`);
      }
      this.onSpreadsheetBatchSaved.emit({ savedCount, mode: 'pendingChanges' });
    } else if (this.isBatchSaveEnabled()) {
      this.notifySpreadsheetBatchSave('info', 'Salvataggio batch', 'Nessuna modifica da salvare.');
    }
  }

  private async saveSpreadsheetRecords(records: any[]): Promise<{ response: any; savedCount: number } | null> {
    if (!records?.length) return null;

    const currentDs = this.datasource?.value;
    if (!currentDs) return null;

    // Se batch NON abilitato, fallback a syncData() singolo.
    if (!this.isBatchSaveEnabled()) {
      let savedCount = 0;
      let lastResult: any = null;
      for (const record of records) {
        try {
          // Wrappa il record plain in BehaviorSubject prima di syncData;
          // usa il record stesso come pristine (batch fallback: non abbiamo
          // snapshot pre-edit; il concurrency check userà __original=record).
          const mode = record?.__new === true ? 'insert' : 'update';
          const result = await this.syncRecordViaDatasource(record, record, mode);
          if (result) {
            savedCount++;
            lastResult = result;
          }
        } catch (err) {
          console.error('[SpreadsheetListSf] syncData error', err);
        }
      }
      return { response: lastResult, savedCount };
    }

    // Batch: POST a batchEditUri
    const pkeyName = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0]?.mc_nome_colonna;
    const trackedChanges = (currentDs.changes || []).filter((c: any) => Array.isArray(c?.changes) && c.changes.length > 0);
    const localPendingRecords = Array.from(this.pendingSpreadsheetRows)
      .filter(idx => idx >= 0 && idx < this.records.length)
      .map(idx => this.records[idx])
      .filter(r => !!r);
    const candidateRecords = Array.from(new Set([...(records || []), ...localPendingRecords]));

    const recordsToSave = trackedChanges.length
      ? candidateRecords.filter((record: any) =>
          this.isRecordDeleted(record) ||
          trackedChanges.some((change: any) => this.recordMatchesTrackedChange(record, change, pkeyName))
        )
      : candidateRecords;

    const entities = recordsToSave.map(r => this.buildBatchEntity(r)).filter(e => !!e);
    if (!entities.length) return null;

    // Batch unico: delete (entity con `_destroy: true`) + insert/update nello
    // stesso roundtrip. `syncDataBatch` ora skippa `validateData` sulle entity
    // delete (vedi data-source.component.ts), quindi il payload minimale
    // {pKey, _destroy: true} passa la validation. Il backend
    // `MetaService.batchRecord` dispatcha per ogni entity a insertRecord /
    // updateRecord / deleteRecord in base ai flag.
    const response = await currentDs.syncDataBatch(entities, null);
    return { response, savedCount: entities.length };
  }

  private buildBatchEntity(record: any): any {
    if (!record || !this.metaInfo?.columnMetadata) return null;
    const pKey = this.metaInfo?.pKey?.mc_nome_colonna;
    const unwrap = (v: any) => (v != null && typeof v === 'object' && 'value' in v && typeof v.subscribe === 'function')
      ? (v as any).value
      : v;

    // DELETE batch: payload minimale con solo la chiave primaria e flag
    // `_destroy: true` riconosciuto da `MetaService.batchRecord`. Serializzare
    // tutti i field come nelle update causava errori "Conversione varchar →
    // int" perché i field wrappati venivano passati al backend come stringhe
    // del tipo Dictionary.
    if (this.isRecordDeleted(record)) {
      const entity: any = { _destroy: true };
      if (pKey && record[pKey] != null) {
        entity[pKey] = unwrap(record[pKey]);
      }
      if (record.__guid != null) entity.__guid = unwrap(record.__guid);
      return entity;
    }

    const entity: any = {};
    for (const col of this.metaInfo.columnMetadata) {
      const name = col.mc_nome_colonna;
      entity[name] = unwrap(record[name]) ?? null;
    }
    // pKey preservation
    if (pKey && record[pKey] != null) {
      entity[pKey] = unwrap(record[pKey]);
    }
    return entity;
  }

  private recordMatchesTrackedChange(record: any, change: any, pkeyName?: string): boolean {
    if (!record || !change) return false;
    if (pkeyName && record[pkeyName] != null && change[pkeyName] != null) {
      return String(record[pkeyName]) === String(change[pkeyName]);
    }
    // fallback by guid
    const recGuid = typeof record['__guid'] === 'object' ? record['__guid']?.value : record['__guid'];
    const chgGuid = typeof change['__guid'] === 'object' ? change['__guid']?.value : change['__guid'];
    return recGuid != null && recGuid === chgGuid;
  }

  private markPendingRow(record: any): void {
    const idx = this.records.indexOf(record);
    if (idx >= 0) this.pendingSpreadsheetRows.add(idx);
  }

  private getVisibleRowIndexes(fallbackRow?: number): number[] {
    const sf = this.sfSpreadsheet as any;
    if (!sf) return [];

    // Syncfusion API: getSelectedRange() → "A2:C5" etc. Parsiamo.
    try {
      const activeSheet = sf.getActiveSheet?.();
      const selectedRange: string = activeSheet?.selectedRange || '';
      if (selectedRange) {
        // Esempio "A1:D5" → righe 1-5 in sheet index (1-based, nessun header
        // intermedio — l'header è il column-letter row nativo Syncfusion).
        // data index 0-based = sheetRow - 1.
        const match = selectedRange.match(/^[A-Z]+(\d+):[A-Z]+(\d+)$/i);
        if (match) {
          const startSheetRow = parseInt(match[1], 10);
          const endSheetRow = parseInt(match[2], 10);
          const startDataIdx = Math.max(0, startSheetRow - 1);
          const endDataIdx = Math.max(0, endSheetRow - 1);
          const pageOffset = this.isServerSide ? 0 : (this.pageIndex - 1) * this.pageSize;
          const indexes: number[] = [];
          for (let i = startDataIdx; i <= endDataIdx; i++) {
            indexes.push(pageOffset + i);
          }
          return Array.from(new Set(indexes));
        }
      }
    } catch (err) {
      console.warn('[SpreadsheetListSf] getVisibleRowIndexes parse error', err);
    }

    const fallback = Number(fallbackRow);
    if (Number.isFinite(fallback) && fallback >= 0) return [Math.trunc(fallback)];
    return [];
  }

  // ============================================================
  // Syncfusion event handlers (agganciati dal template)
  // ============================================================

  onSyncfusionCreated(): void {
    // Segnale che Syncfusion ha finito l'init interno DOM/scroll: da questo
    // momento in poi sono sicure le operazioni che attaccano event handler.
    this.sfReady = true;

    // NOTA: il polyfill SVGAnimatedString per bug v33 Resize3.setTarget è
    // applicato in `ensureWuicSyncfusionLicenseRegistered()` del license
    // service (chiamato dal costruttore PRIMA di qualsiasi mousemove su
    // elementi SVG Syncfusion). Non serve richiamarlo qui.

    // Flush della config sheet accumulata prima che `created` fosse disponibile.
    if (this.pendingSheetConfig) {
      this.flushPendingSheetConfig();
    }

    // Riscrivi i nomi colonna nella riga column-letter di Syncfusion (sostituisce
    // A/B/C con "Suppliers", "Transaction Types", ecc. preservando i resize grip).
    this.syncColumnHeadersWithMetadata();

    // Osserva cambi nel column-header e riapplica la sync (Syncfusion ripristina
    // le lettere A/B/C ad ogni redraw: scroll, filter toggle, resize, ecc.)
    this.startColHeaderObserver();

    // NOTA: il filter Syncfusion nativo NON viene attivato (operava solo sui
    // 10 record della pagina visibile). Il filter custom è gestito dai funnel
    // button nell'header column-letter, vedi `ensureHeaderFilterButton` +
    // `openCustomFilterPopup`.

    // Syncfusion ignora `rowCount`/`colCount` passati in SheetModel quando
    // `showFieldAsHeader: true` è attivo (calcola le dimensioni dal dataSource).
    // Lo forziamo imperativamente qui per limitare la griglia alle righe/colonne
    // effettivamente usate (no celle vuote extra in fondo).
    this.enforceGridBoundaries();

    this.scheduleLayoutPass();
  }


  onSyncfusionDataBound(): void {
    this.cd.markForCheck();
    this.enforceGridBoundaries();
    // Re-sync header con funnel custom (re-creato da syncColumnHeadersWithMetadata
    // ad ogni rebuild di DOM — Syncfusion azzera gli override testo/children).
    this.syncColumnHeadersWithMetadata();
    // Retry multipli per coprire i casi dove Syncfusion redraws ancora l'header
    // dopo il dataBound (es. page change, sort, virtual scroll).
    const delays = [40, 150, 400, 900];
    for (const d of delays) {
      setTimeout(() => this.syncColumnHeadersWithMetadata(), d);
    }
  }

  /**
   * Sostituisce il testo delle celle nell'header column-letter nativo di
   * Syncfusion (dove normalmente stanno A, B, C, ...) con i nomi colonna
   * da `metaInfo.columnMetadata` (es. "Suppliers", "Transaction Types", ...).
   *
   * Strategia:
   * - cerca `.e-column-header .e-header-cell` (escludendo select-all corner)
   * - imposta `textContent` con `mc_display_string_in_edit`
   * - aggiunge class `.wuic-sf-colname-header` per styling custom (bold/bg)
   *
   * Robustezza:
   * - un MutationObserver attivato in `created` richiama la sync quando
   *   Syncfusion redraws l'header (scroll, resize, filter, ecc.)
   */
  private syncColumnHeadersWithMetadata(): void {
    if (!this.metaInfo || !this.spreadsheet?.nativeElement) return;
    try {
      const visibleMetaCols = (this.metaInfo.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
      const headerCells = this.spreadsheet.nativeElement.querySelectorAll(
        '.e-column-header .e-header-cell:not(.e-select-all-cell)'
      );
      headerCells.forEach((cell: Element, idx: number) => {
        const col = visibleMetaCols[idx];
        if (!col) return;
        const name = col.mc_display_string_in_edit || col.mc_nome_colonna || '';
        const textContainer = cell.querySelector('.e-header-cell-div') as HTMLElement | null;
        if (textContainer) {
          if (textContainer.textContent !== name) {
            textContainer.textContent = name;
          }
        } else if (cell.textContent !== name) {
          cell.textContent = name;
        }
        (cell as HTMLElement).classList.add('wuic-sf-colname-header');

        // Aggiungi un funnel button nell'header se la colonna permette il
        // filtro E il button non esiste già.
        this.ensureHeaderFilterButton(cell as HTMLElement, idx, col as any);
      });
    } catch {
      // swallow
    }
  }

  /**
   * Inserisce un pulsante funnel custom nell'header column-letter per una
   * specifica colonna, quando `mc_allow_filter` / `mc_show_in_filters` sono
   * abilitati. Il click sul pulsante inoltra al filter-btn nativo Syncfusion
   * (nascosto, che sta nella prima cella dati) così si apre il popup distinct.
   */
  private ensureHeaderFilterButton(headerCell: HTMLElement, colIdx: number, col: any): void {
    const allowed = col?.mc_allow_filter !== false && col?.mc_show_in_filters !== false;
    const existing = headerCell.querySelector('.wuic-sf-header-filter-btn') as HTMLElement | null;

    if (!allowed) {
      // Colonna senza filter → rimuovi eventuale button
      if (existing) existing.remove();
      return;
    }
    if (existing) return; // già presente

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wuic-sf-header-filter-btn';
    btn.setAttribute('title', 'Filtra');
    btn.setAttribute('data-col-idx', String(colIdx));
    btn.setAttribute('data-field', col?.mc_nome_colonna ?? '');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>';

    // Marca "active" se esiste un filtro su questa colonna.
    if (col?.mc_nome_colonna && this.columnFilters.has(col.mc_nome_colonna)) {
      btn.classList.add('wuic-sf-header-filter-btn--active');
    }

    // Syncfusion ascolta `mousedown` (non solo click) sulla header cell per
    // selezionare la colonna. Dobbiamo bloccare mousedown + mouseup + click
    // in capture phase affinche' il suo handler non veda mai l'evento.
    const swallow = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
      (ev as any).stopImmediatePropagation?.();
    };
    btn.addEventListener('mousedown', swallow, true);
    btn.addEventListener('mouseup', swallow, true);
    btn.addEventListener('pointerdown', swallow, true);
    btn.addEventListener('click', (ev) => {
      swallow(ev);
      // Apri il popup filter CUSTOM (non quello nativo di Syncfusion, che
      // opera solo sui dati della pagina visibile). Il popup custom legge
      // i distinct values da `this.records` (tutti i 2434).
      setTimeout(() => this.openCustomFilterPopup(btn, colIdx, col), 0);
    }, true);
    headerCell.appendChild(btn);
  }

  /**
   * Apre un popup filter custom ancorato al funnel button, con checkbox
   * list dei distinct values per la colonna.
   *
   * Client-side: distinct calcolati su `this.records` filtrato dagli altri
   *              filter attivi (Excel-like).
   * Server-side: distinct recuperati via `MetaService.getDistinctValues`
   *              (solo `this.records` contiene la pagina corrente, non tutti
   *              i record; serve una chiamata dedicata sul backend).
   */
  private async openCustomFilterPopup(anchorBtn: HTMLElement, colIdx: number, col: any): Promise<void> {
    // Se un popup è già aperto per la stessa colonna → toggle (chiudi).
    if (this.filterPopupEl) {
      const prevField = this.filterPopupEl.getAttribute('data-field');
      this.closeFilterPopup();
      if (prevField === (col?.mc_nome_colonna ?? '')) return;
    }

    const fieldName: string = col?.mc_nome_colonna ?? '';
    if (!fieldName) return;

    // Calcola i distinct (client-side o server-side)
    const distinctList = await this.computeDistinctValuesForPopup(col, fieldName);

    // Selezione corrente: se esiste un filtro sulla colonna, quei valori
    // sono pre-checked; altrimenti tutti checked.
    const currentFilter = this.columnFilters.get(fieldName) || null;
    const selectedSet: Set<string> = currentFilter
      ? new Set(currentFilter)
      : new Set(distinctList.map(d => d.display));

    // ==== Costruisci DOM popup ====
    const popup = document.createElement('div');
    popup.className = 'wuic-sf-filter-popup';
    if (this.isDarkThemeActive()) {
      popup.classList.add('wuic-sf-filter-popup--dark');
    }
    popup.setAttribute('data-field', fieldName);
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Filtro colonna');

    const colDisplayName = col?.mc_display_string_in_view ?? col?.mc_nome_colonna ?? '';

    // Sort abilitato solo se la colonna NON ha mc_disable_sorting=true.
    // Retro-compat: valore assente / null / false → sort abilitato.
    const sortAllowed = col?.mc_disable_sorting !== true;

    const sortSectionHtml = sortAllowed
      ? `<div class="wuic-sf-filter-popup-sort">
          <button type="button" class="wuic-sf-filter-popup-sort-btn" data-sort="asc">
            <span class="wuic-sf-filter-popup-sort-icon">&#9650;</span> Ordina crescente
          </button>
          <button type="button" class="wuic-sf-filter-popup-sort-btn" data-sort="desc">
            <span class="wuic-sf-filter-popup-sort-icon">&#9660;</span> Ordina decrescente
          </button>
        </div>`
      : '';

    popup.innerHTML = `
      <div class="wuic-sf-filter-popup-header">
        <span class="wuic-sf-filter-popup-title">Filtra: ${this.escapeHtml(colDisplayName)}</span>
        <button type="button" class="wuic-sf-filter-popup-close" title="Chiudi">&times;</button>
      </div>
      ${sortSectionHtml}
      <div class="wuic-sf-filter-popup-clear">
        <button type="button" class="wuic-sf-filter-popup-clear-btn"
          ${currentFilter ? '' : 'disabled'}>
          Rimuovi filtro su "${this.escapeHtml(colDisplayName)}"
        </button>
      </div>
      <div class="wuic-sf-filter-popup-search">
        <input type="text" class="wuic-sf-filter-popup-search-input"
          placeholder="Cerca..." />
      </div>
      <div class="wuic-sf-filter-popup-list-wrap">
        <label class="wuic-sf-filter-popup-item wuic-sf-filter-popup-selectall">
          <input type="checkbox" class="wuic-sf-filter-popup-selectall-cb" />
          <span>(Seleziona tutto)</span>
        </label>
        <div class="wuic-sf-filter-popup-list" role="listbox"></div>
      </div>
      <div class="wuic-sf-filter-popup-footer">
        <button type="button" class="wuic-sf-filter-popup-ok">OK</button>
        <button type="button" class="wuic-sf-filter-popup-cancel">Annulla</button>
      </div>
    `;

    // Render list items
    const listEl = popup.querySelector('.wuic-sf-filter-popup-list') as HTMLElement;
    const renderList = (filterText: string) => {
      const ft = (filterText || '').toLowerCase();
      listEl.innerHTML = '';
      distinctList.forEach((d, i) => {
        if (ft && !d.display.toLowerCase().includes(ft)) return;
        const label = document.createElement('label');
        label.className = 'wuic-sf-filter-popup-item';
        label.setAttribute('data-value', d.display);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'wuic-sf-filter-popup-cb';
        cb.checked = selectedSet.has(d.display);
        cb.addEventListener('change', () => {
          if (cb.checked) selectedSet.add(d.display);
          else selectedSet.delete(d.display);
          updateSelectAllState();
        });
        const span = document.createElement('span');
        span.textContent = d.display === '' ? '(vuoto)' : d.display;
        label.appendChild(cb);
        label.appendChild(span);
        listEl.appendChild(label);
      });
    };

    const selectAllCb = popup.querySelector('.wuic-sf-filter-popup-selectall-cb') as HTMLInputElement;
    const updateSelectAllState = () => {
      const total = distinctList.length;
      const sel = selectedSet.size;
      selectAllCb.checked = sel === total;
      selectAllCb.indeterminate = sel > 0 && sel < total;
    };
    selectAllCb.addEventListener('change', () => {
      if (selectAllCb.checked) {
        distinctList.forEach(d => selectedSet.add(d.display));
      } else {
        selectedSet.clear();
      }
      renderList((popup.querySelector('.wuic-sf-filter-popup-search-input') as HTMLInputElement).value);
      updateSelectAllState();
    });

    renderList('');
    updateSelectAllState();

    // Search
    const searchInput = popup.querySelector('.wuic-sf-filter-popup-search-input') as HTMLInputElement;
    searchInput.addEventListener('input', () => renderList(searchInput.value));

    // Sort buttons
    popup.querySelectorAll<HTMLElement>('.wuic-sf-filter-popup-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const order = btn.getAttribute('data-sort') === 'desc' ? 'Descending' : 'Ascending';
        const fieldLetter = this.columnIndexToLetter(colIdx);
        this.closeFilterPopup();
        this.applyFullSort(fieldLetter, order);
      });
    });

    // Clear filter
    (popup.querySelector('.wuic-sf-filter-popup-clear-btn') as HTMLButtonElement)
      .addEventListener('click', () => {
        this.columnFilters.delete(fieldName);
        this.closeFilterPopup();
        this.applyColumnFiltersToRecords();
      });

    // OK
    (popup.querySelector('.wuic-sf-filter-popup-ok') as HTMLButtonElement)
      .addEventListener('click', () => {
        // Se tutto selezionato (oppure niente selezionato) = nessun filtro
        // effettivo → rimuovi entry dalla mappa.
        if (selectedSet.size === 0 || selectedSet.size === distinctList.length) {
          this.columnFilters.delete(fieldName);
        } else {
          this.columnFilters.set(fieldName, new Set(selectedSet));
        }
        this.closeFilterPopup();
        this.applyColumnFiltersToRecords();
      });

    // Cancel
    (popup.querySelector('.wuic-sf-filter-popup-cancel') as HTMLButtonElement)
      .addEventListener('click', () => this.closeFilterPopup());

    // Close (X)
    (popup.querySelector('.wuic-sf-filter-popup-close') as HTMLButtonElement)
      .addEventListener('click', () => this.closeFilterPopup());

    // ==== Positioning ====
    // Ancora popup al funnel button. Appendi al body per uscire dal
    // clipping dello spreadsheet host.
    document.body.appendChild(popup);
    const rect = anchorBtn.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 2;
    // Evita overflow destra
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (left + popupRect.width > vw - 8) left = Math.max(8, vw - popupRect.width - 8);
    // Evita overflow basso → apri verso l'alto
    if (top + popupRect.height > vh - 8) {
      top = Math.max(8, rect.top - popupRect.height - 2);
    }
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    this.filterPopupEl = popup;

    // Outside click → chiudi
    this.filterPopupOutsideClickHandler = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (!popup.contains(target) && target !== anchorBtn && !anchorBtn.contains(target)) {
        this.closeFilterPopup();
      }
    };
    // Attacca al prossimo tick per evitare di chiudere subito al mousedown
    // che ha aperto il popup.
    setTimeout(() => {
      if (this.filterPopupOutsideClickHandler) {
        document.addEventListener('mousedown', this.filterPopupOutsideClickHandler, true);
      }
    }, 0);

    // Focus search
    setTimeout(() => searchInput.focus(), 0);
  }

  /**
   * Calcola la lista distinct per il popup filter di una colonna.
   * - Client-side: iterazione su `this.records` filtrato dagli altri filtri
   *   attivi (Excel-like: il popup mostra le opzioni coerenti con gli altri
   *   filtri, ma ignora il filtro della colonna stessa).
   * - Server-side: chiamata a `MetaService.getDistinctValues` (richiede
   *   `column_id` numerico; non considera gli altri filter attivi perché
   *   l'endpoint serve la "lookup" classica di distinct completo).
   */
  private async computeDistinctValuesForPopup(col: any, fieldName: string): Promise<Array<{ display: string; count: number }>> {
    if (this.isServerSide) {
      return this.fetchDistinctValuesFromServer(col, fieldName);
    }
    const baseRecords = this.records.filter(rec =>
      this.recordMatchesColumnFilters(rec, fieldName)
    );
    const distinctMap = new Map<string, { display: string; count: number }>();
    for (const rec of baseRecords) {
      const raw = rec?.[fieldName];
      const display = this.formatValueForDisplay(raw, col, rec);
      const key = display == null ? '' : String(display);
      const entry = distinctMap.get(key);
      if (entry) entry.count++;
      else distinctMap.set(key, { display: key, count: 1 });
    }
    return this.sortDistinctList(distinctMap);
  }

  /**
   * Chiama `MetaService.getDistinctValues(column_id, text, filter_type,
   * max_results, user_id)` (endpoint AsmxProxy) e trasforma `rawPagedResult`
   * in `Array<{display, count}>` compatibile col popup.
   *
   * In caso di errore ritorna array vuoto (il popup mostrerà nessuna opzione
   * — un notification error è comunque inviata).
   */
  private async fetchDistinctValuesFromServer(col: any, fieldName: string): Promise<Array<{ display: string; count: number }>> {
    const url = MetadataProviderService.getDistinctValuesUri;
    if (!url) return [];
    const userId = this.userInfoService.getuserInfo()?.user_id ?? '';
    const payload = {
      column_id: Number(col?.mc_id) || 0,
      text: '',
      filter_type: 'contains',
      max_results: 1000,
      user_id: String(userId)
    };
    try {
      const resp: any = await this.http.post(url, payload).toPromise();
      // AsmxProxy wrappa la response come `{ d: "<json serialized>" }` (string)
      // oppure come oggetto direttamente. Normalizziamo entrambi i casi.
      let data: any = resp;
      if (resp && typeof resp === 'object' && 'd' in resp) {
        const d = resp.d;
        data = typeof d === 'string' ? (d ? JSON.parse(d) : null) : d;
      }
      const results: any[] = data?.results || data?.Results || [];
      const distinctMap = new Map<string, { display: string; count: number }>();
      for (const row of results) {
        // La SELECT DISTINCT restituisce una colonna con il nome `fieldName`.
        // FastExpando conserva il case originale.
        const raw = row?.[fieldName] ?? row?.[fieldName?.toLowerCase?.()]
          ?? row?.[fieldName?.toUpperCase?.()] ?? Object.values(row || {})[0];
        const display = this.formatValueForDisplay(raw, col, row);
        const key = display == null ? '' : String(display);
        const entry = distinctMap.get(key);
        if (entry) entry.count++;
        else distinctMap.set(key, { display: key, count: 1 });
      }
      return this.sortDistinctList(distinctMap);
    } catch (err) {
      console.error('[SpreadsheetListSf] getDistinctValues failed', err);
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: 'Errore caricamento filtri',
        detail: 'Impossibile recuperare i valori distinti dal server.'
      });
      return [];
    }
  }

  /** Ordinamento comune della lista distinct (numerico se possibile, poi locale). */
  private sortDistinctList(distinctMap: Map<string, { display: string; count: number }>): Array<{ display: string; count: number }> {
    return Array.from(distinctMap.values()).sort((a, b) => {
      const na = Number(a.display); const nb = Number(b.display);
      if (!isNaN(na) && !isNaN(nb) && a.display !== '' && b.display !== '') return na - nb;
      return a.display.localeCompare(b.display, this.resolveLocale(), { numeric: true, sensitivity: 'base' });
    });
  }

  /** Chiude il popup filter custom se aperto. */
  private closeFilterPopup(): void {
    if (this.filterPopupOutsideClickHandler) {
      document.removeEventListener('mousedown', this.filterPopupOutsideClickHandler, true);
      this.filterPopupOutsideClickHandler = undefined;
    }
    if (this.filterPopupEl) {
      this.filterPopupEl.remove();
      this.filterPopupEl = null;
    }
  }

  /**
   * Ritorna true se il record passa TUTTI i column filter attivi (AND tra colonne).
   * Se `excludeField` è passato, il filtro su quella colonna viene ignorato
   * (usato quando si costruisce la lista distinct del popup: vogliamo mostrare
   * tutte le opzioni della colonna X coerenti coi filtri delle ALTRE colonne).
   */
  private recordMatchesColumnFilters(rec: any, excludeField?: string): boolean {
    if (this.columnFilters.size === 0) return true;
    const cols = this.metaInfo?.columnMetadata || [];
    for (const [field, selSet] of this.columnFilters.entries()) {
      if (excludeField && field === excludeField) continue;
      const metaCol = cols.find(c => c.mc_nome_colonna === field);
      if (!metaCol) continue;
      const display = this.formatValueForDisplay(rec?.[field], metaCol as any, rec);
      const key = display == null ? '' : String(display);
      if (!selSet.has(key)) return false;
    }
    return true;
  }

  /**
   * Applica `columnFilters` al dataset:
   *  - client-side: filtra `this.records` → popola `this.filteredRecords`
   *  - server-side: scrive i predicati in `ds.filterInfo.filters` con
   *    operator `eqor` (value = lista CSV dei distinct selezionati)
   *    e chiama `ds.fetchData()` → il backend WUIC applica il WHERE.
   * Resetta pagina a 1.
   */
  private applyColumnFiltersToRecords(): void {
    if (this.isServerSide) {
      this.applyColumnFiltersServerSide();
      setTimeout(() => this.syncColumnHeadersWithMetadata(), 0);
      return;
    }
    if (this.columnFilters.size === 0) {
      this.filteredRecords = null;
    } else {
      this.filteredRecords = this.records.filter(rec => this.recordMatchesColumnFilters(rec));
    }
    this.pageIndex = 1;
    this.rebuildSheetWithData();
    // syncColumnHeadersWithMetadata ricostruisce i funnel → applica stato "active".
    setTimeout(() => this.syncColumnHeadersWithMetadata(), 0);
  }

  /**
   * Server-side filter: proietta `this.columnFilters` in `ds.filterInfo.filters`
   * con operator `eqor` + value CSV dei distinct selezionati, poi `fetchData()`.
   *
   * Rimuove eventuali filter entries precedenti marcate `__wuicSfMulti=true`
   * (quelle aggiunte da noi) prima di aggiungere i nuovi, così evitiamo
   * accumulo tra apply successivi.
   */
  private applyColumnFiltersServerSide(): void {
    const ds = this.datasource?.value;
    if (!ds) return;

    if (!ds.filterInfo) {
      ds.filterInfo = { logicOperator: 'AND', filters: [] } as any;
    }
    const filters: any[] = Array.isArray((ds.filterInfo as any).filters)
      ? (ds.filterInfo as any).filters
      : [];

    // Rimuovi entries precedenti aggiunte da questo metodo (marker dedicato)
    for (let i = filters.length - 1; i >= 0; i--) {
      if (filters[i]?.__wuicSfMulti === true) filters.splice(i, 1);
    }

    // Aggiungi una entry per ogni colonna filtrata
    for (const [field, selSet] of this.columnFilters.entries()) {
      const values = Array.from(selSet);
      if (!values.length) continue;
      filters.push({
        field,
        operatore: 'eqor',
        value: values.join(','),
        __wuicSfMulti: true
      });
      // Registra l'operatore nel metaInfo.operators (usato in fetchData)
      if (this.metaInfo?.operators) {
        this.metaInfo.operators[field] = 'eqor';
      }
    }

    (ds.filterInfo as any).filters = filters;
    this.pageIndex = 1;
    ds.currentPage = 1;
    ds.fetchData();
    // Il refetch triggera subscribeToDS → rebuildSheetWithData automaticamente.
  }

  /**
   * Ritorna true se il tema WUIC attivo è dark. Mirror della logica in
   * `syncThemeClass()` — controlla classi/data-attr del body/html, NON
   * `prefers-color-scheme` (che è theme OS, non WUIC).
   */
  private isDarkThemeActive(): boolean {
    if (typeof document === 'undefined') return false;
    return (
      document.body.classList.contains('theme-dark') ||
      document.documentElement.classList.contains('theme-dark') ||
      document.body.getAttribute('data-theme') === 'dark' ||
      document.documentElement.getAttribute('data-theme') === 'dark'
    );
  }

  /** HTML-escape minimal per inserire testo sicuro in innerHTML. */
  private escapeHtml(s: string | null | undefined): string {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Observer per ri-sincronizzare i nomi colonna quando Syncfusion redraws l'header. */
  private colHeaderObserver?: MutationObserver;

  private startColHeaderObserver(): void {
    if (this.colHeaderObserver || typeof MutationObserver === 'undefined') return;
    const target = this.spreadsheet?.nativeElement?.querySelector('.e-column-header') as HTMLElement | null;
    if (!target) return;
    let pendingRaf = 0;
    this.colHeaderObserver = new MutationObserver(() => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0;
        this.syncColumnHeadersWithMetadata();
      });
    });
    this.colHeaderObserver.observe(target, { childList: true, subtree: true, characterData: true });
  }

  private stopColHeaderObserver(): void {
    try { this.colHeaderObserver?.disconnect(); } catch { /* ignore */ }
    this.colHeaderObserver = undefined;
  }

  /** Converte indice 0-based in lettera colonna (0→A, 25→Z, 26→AA, ...) */
  private columnIndexToLetter(index: number): string {
    let i = Math.max(0, Math.trunc(index));
    let s = '';
    while (true) {
      s = String.fromCharCode(65 + (i % 26)) + s;
      if (i < 26) return s;
      i = Math.floor(i / 26) - 1;
    }
  }

  /**
   * Limita la griglia Syncfusion alle righe/colonne effettivamente necessarie
   * (header + N data rows + optional insert-placeholder; N visible columns).
   * Altrimenti Syncfusion renderizza una griglia 100x100 (o più) default con
   * decine di celle vuote.
   */
  private enforceGridBoundaries(): void {
    // NO-OP: relying on sheet.rowCount/colCount passed in SheetModel.
  }

  /**
   * cellSave = utente ha confermato un edit di cella. Propaghiamo al record
   * backing e marchiamo la riga come pending (o syncData immediato se batch
   * non è abilitato).
   */
  async onSyncfusionCellSave(args: CellSaveEventArgs): Promise<void> {
    if (this.suppressCellSaveEvents) return;

    const addr = (args as any).address as string; // es. "Sheet1!B3"
    const newValue = (args as any).value;
    if (!addr) return;

    const cellMatch = addr.match(/!([A-Z]+)(\d+)$/i) || addr.match(/^([A-Z]+)(\d+)$/i);
    if (!cellMatch) return;

    const colLetter = cellMatch[1].toUpperCase();
    const sheetRow = parseInt(cellMatch[2], 10);
    const colIndex = this.columnLetterToIndex(colLetter);
    // Syncfusion usa 1-based sheet rows; il column-letter header è row 0
    // del modello ma non è editabile/indirizzabile come cella. La prima
    // cella dati è sheet row 1 → data index 0.
    const dataRowIndex = sheetRow - 1;
    if (dataRowIndex < 0) return;

    const pageOffset = this.isServerSide ? 0 : (this.pageIndex - 1) * this.pageSize;
    const absoluteRowIndex = pageOffset + dataRowIndex;

    const visibleMetaCols = (this.metaInfo?.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
    const col = visibleMetaCols[colIndex];
    if (!col) return;

    const record = this.records[absoluteRowIndex];
    if (!record) return;

    // Snapshot pristine PRIMA di mutare (per concurrency check backend).
    const pristineSnapshot = this.clonePristineRecord(record);

    // Scrivi il valore nel record
    record[col.mc_nome_colonna] = newValue;
    this.markPendingRow(record);

    if (!this.isBatchSaveEnabled()) {
      // Save immediato via datasource.syncData (wrappa i field in BehaviorSubject
      // internamente; gestisce concurrency, validation, notifiche UI).
      try {
        await this.saveSingleRecordImmediate(record, pristineSnapshot);
      } catch (err) {
        console.error('[SpreadsheetListSf] cellSave sync error', err);
      }
    }
  }

  /**
   * beforeCellSave: hook prima del save del cell. Utile per validazione lato
   * metadata (mc_validation_required, ecc.). TODO SF-PARITY.
   *
   * Anche usato per bloccare modifica della riga header (row 1 sheet-level).
   */
  onSyncfusionBeforeCellSave(_args: any): void {
    // No-op: non c'è più un header editabile da bloccare — l'header è il
    // column-letter row nativo Syncfusion (non editabile di default).
  }

  /**
   * Context menu custom — riscritto con DOM patching diretto perché le API
   * Syncfusion `addContextMenuItems`/`removeContextMenuItems` non sono
   * idempotenti: Syncfusion Spreadsheet ricostruisce la `<ul>` del menu da
   * zero ad ogni right-click usando un master template target-specific,
   * scartando le modifiche (osservato: flicker del menu custom poi menu nativo).
   *
   * Strategia: intercettiamo `contextMenuBeforeOpen` e patchiamo il DOM del
   * menu PRIMA che venga mostrato:
   *  - rimuoviamo i `<li>` delle voci native Insert/Delete/Hide Row
   *  - inseriamo le 4 voci WUIC dopo Paste Special
   *  - applichiamo stato disabled in base ai permessi
   *
   * Questo garantisce che il menu mostrato corrisponda sempre a quello atteso.
   */
  onSyncfusionContextMenuBeforeOpen(args: any): void {
    const ul: HTMLElement | undefined = args?.element;
    if (!ul || !(ul instanceof HTMLElement)) return;
    try {
      const lis = Array.from(ul.querySelectorAll(':scope > li')) as HTMLElement[];

      // Rimuovi native Insert Row / Delete Row / Hide Row (match per id suffix).
      for (const li of lis) {
        const id = li.id || '';
        if (/_cmenu_(insert_row|delete_row|hide_row)$/i.test(id)) {
          li.remove();
        }
      }

      // Inserisci voci WUIC dopo Paste Special (o come ultimo gruppo se non trovata).
      if (!ul.querySelector('#wuic-delete')) {
        const pasteSpecial = lis.find(li => /_cmenu_paste_special$/i.test(li.id || ''));
        const anchor: Node | null = pasteSpecial?.nextSibling ?? null;

        const wuicItems: Array<{ id?: string; text?: string; icon?: string; separator?: boolean }> = [
          { separator: true },
          { id: 'wuic-insert-before', text: 'Inserisci riga sopra', icon: 'e-plus-icon' },
          { id: 'wuic-insert-after', text: 'Inserisci riga sotto', icon: 'e-plus-icon' },
          { id: 'wuic-delete', text: 'Elimina riga/e selezionate', icon: 'e-delete-icon' },
          { id: 'wuic-save', text: 'Salva riga/e selezionate', icon: 'e-save-icon' },
        ];

        for (const it of wuicItems) {
          const li = document.createElement('li');
          if (it.separator) {
            li.className = 'e-menu-item e-separator';
          } else {
            li.className = 'e-menu-item';
            li.setAttribute('role', 'menuitem');
            li.tabIndex = -1;
            if (it.id) li.id = it.id;
            const icon = document.createElement('span');
            icon.className = `e-menu-icon e-icons ${it.icon ?? ''}`.trim();
            li.appendChild(icon);
            li.appendChild(document.createTextNode(it.text ?? ''));

            // Intercetta il click sui nostri <li> prima che Syncfusion lo
            // gestisca: il suo selectHandler cerca l'item nel model interno
            // e throwa `Cannot read properties of undefined (reading 'id')`
            // perché non abbiamo aggiunto gli item al model (solo al DOM).
            // Stopping propagation + dispatch manuale agli handler CRUD.
            const itemId = it.id!;
            const handler = (ev: Event) => {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              ev.stopPropagation();
              if (li.classList.contains('e-disabled')) return;
              this.dispatchWuicContextMenuItem(itemId);
            };
            li.addEventListener('mousedown', handler, true);
            li.addEventListener('click', handler, true);
          }
          if (anchor) {
            ul.insertBefore(li, anchor);
          } else {
            ul.appendChild(li);
          }
        }
      }

      // Applica stato disabled in base ai permessi.
      const canInsert = this.canInsertRows();
      const canDelete = this.canDeleteRows();
      const setEnabled = (id: string, enable: boolean) => {
        const el = ul.querySelector('#' + id) as HTMLElement | null;
        if (!el) return;
        el.classList.toggle('e-disabled', !enable);
        el.setAttribute('aria-disabled', enable ? 'false' : 'true');
      };
      setEnabled('wuic-insert-before', canInsert);
      setEnabled('wuic-insert-after', canInsert);
      setEnabled('wuic-delete', canDelete);
    } catch (err) {
      console.warn('[SpreadsheetListSf][cmenu] contextMenuBeforeOpen patch error', err);
    }
  }

  /**
   * Gestione click su voce menu contestuale per voci native Syncfusion (non
   * WUIC — le nostre voci WUIC sono dispatchate via listener DOM diretto in
   * `onSyncfusionContextMenuBeforeOpen`, bypassando il selectHandler interno
   * di Syncfusion che throwa su item non registrati nel suo model).
   */
  onSyncfusionContextMenuItemSelect(args: MenuSelectEventArgs): void {
    const id = (args.item as any)?.id as string;
    if (id?.startsWith('wuic-')) {
      // Già gestito dal listener DOM dedicato. Shouldn't arrive here.
      this.dispatchWuicContextMenuItem(id);
    }
  }

  /** Dispatch centralizzato dei click sulle voci WUIC del context menu. */
  private dispatchWuicContextMenuItem(id: string): void {
    const hint = this.getFirstSelectedDataRow();
    switch (id) {
      case 'wuic-insert-before':
        void this.handleSpreadsheetInsertRow(hint, true);
        break;
      case 'wuic-insert-after':
        void this.handleSpreadsheetInsertRow(hint, false);
        break;
      case 'wuic-delete':
        void this.handleSpreadsheetDeleteRows(hint);
        break;
      case 'wuic-save':
        void this.handleSpreadsheetSaveRows(hint);
        break;
    }
    // Chiudi il context menu Syncfusion (il nostro stopPropagation ha
    // bloccato il percorso normale di chiusura).
    this.closeSyncfusionContextMenu();
  }

  private closeSyncfusionContextMenu(): void {
    try {
      const sf: any = this.sfSpreadsheet;
      if (typeof sf?.closeContextMenu === 'function') {
        sf.closeContextMenu();
        return;
      }
      const cm: any = sf?.contextMenuModule?.contextMenu;
      if (cm && typeof cm.close === 'function') {
        cm.close();
        return;
      }
    } catch {
      // fall through to DOM fallback
    }
    // Fallback: click fuori per forzare la chiusura.
    document.body.click();
  }

  /**
   * beforeCellRender (Syncfusion v33): fires per ogni cella visibile in una
   * pagina di rendering. Usato per applicare stili condizionali riga/cella
   * basati sui metadati `_metadati__u_i__stili__tabelle` e
   * `_metadati__u_i__stili__colonne`.
   *
   * PATTERN CONDIZIONALI (coerente con DynamicRowTemplateComponent):
   * - Row-level: `tableMetadata._Metadati_UI_Stili_Tabelles` array di
   *   `MetadatiUiStiliTabella`. Ogni entry ha:
   *     must_attribute_name  → classe CSS da applicare
   *     must_attribute_value → codice JS (return true/false)
   *   Quando il callback ritorna true, la classe viene applicata a TUTTE
   *   le celle della riga (Syncfusion non ha un hook row-level, applichiamo
   *   per cella). Aggiunge marker `wuic-row-style-applied` coerente con
   *   `[HostBinding('class')]` di dynamic-template.
   *
   * - Cell-level: `column._Metadati_UI_Stili_Colonnes` array di
   *   `MetadatiUiStiliColonna`. Ogni entry ha:
   *     musc_attribute_name           → classe CSS
   *     musc_attribute_value          → codice JS (return true/false)
   *     musc_attribute_value_callback → override (se presente, ha priorità)
   *   Quando il callback ritorna true, la classe viene applicata SOLO a
   *   quella cella. Aggiunge marker `wuic-cell-style-applied`.
   *
   * CACHE: la compilazione di `new Function(...)` è costosa. Cached per
   * must_id|code e musc_id|code su cache statiche della classe
   * (tableStyleConditionCache / columnStyleConditionCache). La cache
   * sopravvive tra istanze del componente (singola classe = stessa cache).
   *
   * ALLINEAMENTO: left di default, right per number/date/datetime/time
   * (invariato vs versione precedente).
   *
   * SAFETY: try/catch attorno ad ogni predicate — un errore in un
   * callback utente NON deve bloccare il rendering del foglio. Gli errori
   * vengono ingoiati silenziosamente (come in dynamic-template).
   */
  onSyncfusionBeforeCellRender(args: CellRenderEventArgs): void {
    if (!args?.element || !this.metaInfo) return;
    const el = args.element as HTMLElement;
    try {
      const rowIdx = (args as any).rowIndex;
      const colIdx = (args as any).colIndex;

      // Allineamento per tipo colonna: number / date / datetime / time → right,
      // altrimenti left. Applicato a tutte le celle dati.
      const visibleMetaCols = (this.metaInfo.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
      const col = visibleMetaCols[colIdx];
      if (col) {
        const t = col.mc_ui_column_type;
        if (t === 'number' || t === 'date' || t === 'datetime' || t === 'time') {
          el.style.textAlign = 'right';
        } else {
          el.style.textAlign = 'left';
        }
      }

      // rowIdx 0-based; data parte da sheet row 0 ora che niente header intermedio.
      const dataRowIdx = rowIdx;
      const pageOffset = this.isServerSide ? 0 : (this.pageIndex - 1) * this.pageSize;
      const record = this.records[pageOffset + dataRowIdx];
      if (!record) return;

      // ---- Row-level conditional styles ----
      const rowClasses = this.computeRowStyleClasses(record);
      if (rowClasses.length) {
        for (const cls of rowClasses) el.classList.add(cls);
        el.classList.add('wuic-row-style-applied');
      }

      // ---- Cell-level conditional styles (per colonna) ----
      if (col) {
        const cellClasses = this.computeCellStyleClasses(col, record);
        if (cellClasses.length) {
          for (const cls of cellClasses) el.classList.add(cls);
          el.classList.add('wuic-cell-style-applied');
        }
      }
    } catch {
      // swallow render hook errors (non bloccare il render)
    }
  }

  /**
   * Ritorna le classi CSS da applicare alla riga corrente in base a
   * `tableMetadata._Metadati_UI_Stili_Tabelles`. Usa cache statica per
   * non ricompilare le Function predicate a ogni render.
   */
  private computeRowStyleClasses(record: any): string[] {
    const styles = ((this.metaInfo?.tableMetadata as any)?._Metadati_UI_Stili_Tabelles || []) as MetadatiUiStiliTabella[];
    if (!Array.isArray(styles) || !styles.length) return [];

    const out: string[] = [];
    for (const style of styles) {
      const cssClass = String(style?.must_attribute_name || '').trim();
      if (!cssClass) continue;

      const conditionCode = String(style?.must_attribute_value || '').trim();
      if (!conditionCode) {
        // Nessun callback = classe sempre applicata
        out.push(cssClass);
        continue;
      }

      const cacheKey = `${String(style?.must_id ?? '')}|${conditionCode}`;
      let predicate = SpreadsheetListSfComponent.tableStyleConditionCache.get(cacheKey);
      if (!predicate) {
        predicate = this.buildConditionalStylePredicate(conditionCode);
        SpreadsheetListSfComponent.tableStyleConditionCache.set(cacheKey, predicate);
      }

      try {
        if (predicate(this.metaInfo, record, WtoolboxService)) {
          out.push(cssClass);
        }
      } catch {
        // predicate errato, non applicare la classe
      }
    }
    return out;
  }

  /**
   * Ritorna le classi CSS da applicare alla cella (colonna) corrente in
   * base a `column._Metadati_UI_Stili_Colonnes`. Usa cache statica per
   * non ricompilare le Function predicate a ogni render.
   *
   * `musc_attribute_value_callback` ha priorità su `musc_attribute_value`
   * (stessa semantica di DynamicRowTemplateComponent.getCellClasses).
   */
  private computeCellStyleClasses(metaColumn: MetadatiColonna, record: any): string[] {
    const styles = ((metaColumn as any)?._Metadati_UI_Stili_Colonnes || []) as MetadatiUiStiliColonna[];
    if (!Array.isArray(styles) || !styles.length) return [];

    const out: string[] = [];
    for (const style of styles) {
      const cssClass = String(style?.musc_attribute_name || '').trim();
      if (!cssClass) continue;

      const callbackCode = String(style?.musc_attribute_value_callback || '').trim();
      const conditionCode = String(style?.musc_attribute_value || '').trim();
      const effectiveCode = callbackCode || conditionCode;

      if (!effectiveCode) {
        // Nessun callback = classe sempre applicata
        out.push(cssClass);
        continue;
      }

      const cacheKey = `${String(style?.musc_id ?? '')}|${effectiveCode}`;
      let predicate = SpreadsheetListSfComponent.columnStyleConditionCache.get(cacheKey);
      if (!predicate) {
        predicate = this.buildConditionalStylePredicate(effectiveCode);
        SpreadsheetListSfComponent.columnStyleConditionCache.set(cacheKey, predicate);
      }

      try {
        if (predicate(this.metaInfo, record, WtoolboxService)) {
          out.push(cssClass);
        }
      } catch {
        // predicate errato, non applicare la classe
      }
    }
    return out;
  }

  /**
   * Compila una stringa JS utente in Function predicate.
   * Espone nello scope: `metaInfo`, `record`, `rowData` (alias),
   * `dataItem` (alias), `wtoolbox` (= WtoolboxService classe).
   *
   * Prima tenta come ESPRESSIONE (`return (code);`); se parse fallisce
   * tenta come BLOCCO (`code; return true;`). Se entrambi falliscono
   * ritorna un predicate che torna sempre false.
   *
   * Pattern identico a DynamicRowTemplateComponent.buildTableStylePredicate.
   */
  private buildConditionalStylePredicate(
    conditionCode: string
  ): (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean {
    const expressionWrapper = `
      const dataItem = record;
      const rowData = record;
      return (${conditionCode});
    `;
    let compiled: ((metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean) | null = null;
    try {
      compiled = new Function('metaInfo', 'record', 'wtoolbox', expressionWrapper) as (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean;
    } catch {
      const blockWrapper = `
        const dataItem = record;
        const rowData = record;
        ${conditionCode}
        return true;
      `;
      try {
        compiled = new Function('metaInfo', 'record', 'wtoolbox', blockWrapper) as (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean;
      } catch {
        return () => false;
      }
    }
    // skills/typed-localized-exceptions: cached compiled fn invocata per ogni
    // cell-style check → wrap il call-site cosi' un throw runtime emette typed
    // envelope (`errors.client.user_callback.failed`) invece di propagare uncaught.
    const route = this.metaInfo?.tableMetadata?.md_route_name;
    return (metaInfo, record, wtoolbox) => WtoolboxService.runUserCallbackSync(
      'archetypes.spreadsheet.conditionalStyle',
      () => compiled!(metaInfo, record, wtoolbox),
      [],
      { archetype: 'spreadsheet', route },
      { fallback: false }
    ) ?? false;
  }

  /**
   * cellEdit: intercettato per lookup columns per mostrare un autocomplete
   * custom invece dell'editor testuale Syncfusion default.
   *
   * Inoltre blocca l'editing della PRIMA riga del foglio che contiene i
   * nomi colonna auto-generati da `showFieldAsHeader: true` — non devono
   * essere modificabili dall'utente (sono metadati di presentazione WUIC,
   * non dati applicativi).
   */
  onSyncfusionCellEdit(args: CellEditEventArgs): void {
    if (!this.metaInfo) return;
    const addr = (args as any).address as string;
    if (!addr) return;
    const match = addr.match(/!([A-Z]+)(\d+)$/i) || addr.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return;

    const colIdx = this.columnLetterToIndex(match[1]);
    const sheetRow = parseInt(match[2], 10);
    const visibleMetaCols = (this.metaInfo.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
    const col = visibleMetaCols[colIdx];
    if (!col) return;

    this.currentField = col;

    // Editor custom per tipi non-testo:
    // - date / datetime → input HTML5 date/datetime-local (picker nativo)
    // - boolean / number_boolean → dropdown Sì/No (locale-aware)
    // - dictionary → dropdown con le option da `mc_dictionary_value`
    // Per questi tipi annulliamo l'editor testuale default di Syncfusion
    // e montiamo un overlay custom ancorato alla cella.
    const type = col.mc_ui_column_type;
    if (
      type === 'date' || type === 'datetime' ||
      type === 'boolean' || type === 'number_boolean' ||
      type === 'dictionary'
    ) {
      (args as any).cancel = true;
      // Apre overlay al prossimo tick: se apriamo mentre Syncfusion è ancora
      // nello stack di cellEdit, il suo closeEdit post-cancel può ri-rubare
      // il focus dal nostro input.
      setTimeout(() => this.openCustomCellEditor(col, sheetRow, colIdx), 0);
      return;
    }

    // Lookup autocomplete inline: fetch via `lookupSource` filtrato `contains`
    // sul `dataTextField`; popup `<ul>` sotto la cella, arrow-nav + enter/click
    // per select. Salva l'ID nel record (col.mc_nome_colonna) e anche il campo
    // display join-prefixed per il rendering cella post-save.
    if (type === 'lookupByID' && col.mc_ui_lookup_entity_name && col.mc_ui_lookup_dataTextField) {
      (args as any).cancel = true;
      setTimeout(() => this.openCustomLookupEditor(col, sheetRow, colIdx), 0);
      return;
    }
  }

  // ============================================================
  // Custom cell editors (date / datetime / boolean / dictionary)
  // ============================================================

  /** Overlay editor corrente (null se nessun editor aperto). */
  private cellEditorOverlayEl: HTMLElement | null = null;
  private cellEditorOutsideClickHandler?: (ev: MouseEvent) => void;
  private cellEditorEscapeHandler?: (ev: KeyboardEvent) => void;

  /**
   * Apre un editor custom floating ancorato alla cella (colIdx, sheetRow),
   * del tipo appropriato (date / datetime / boolean / dictionary).
   *
   * - Calcola bbox della cella DOM (Syncfusion v33 usa aria-rowindex/colindex
   *   1-based sulla `.e-sheet-content .e-cell`).
   * - Risolve il record backing e il valore raw corrente.
   * - Monta l'input nel `document.body` posizionato absolute sopra la cella.
   * - Gestisce salvataggio: Enter / change / blur → commit, Escape → cancel.
   */
  private openCustomCellEditor(col: any, sheetRow: number, colIdx: number): void {
    this.closeCellEditor();

    if (!this.spreadsheet?.nativeElement) return;
    const ariaCol = colIdx + 1;
    // Syncfusion v33 piazza `aria-rowindex` sul `<tr.e-row>` parent, NON
    // sulla `<td.e-cell>`. Navighiamo quindi via la row: prima la row, poi
    // la cell con aria-colindex matching.
    const rowSel = `.e-sheet-content .e-row[aria-rowindex="${sheetRow}"]`;
    const rowEl = this.spreadsheet.nativeElement.querySelector(rowSel) as HTMLElement | null;
    const cellEl = rowEl
      ? (rowEl.querySelector(`.e-cell[aria-colindex="${ariaCol}"]`) as HTMLElement | null)
      : null;
    if (!cellEl) return;
    const rect = cellEl.getBoundingClientRect();

    // Resolve record backing (pagedRecords index = sheetRow - 1).
    const dataRowIndex = sheetRow - 1;
    const pageOffset = this.isServerSide ? 0 : (this.pageIndex - 1) * this.pageSize;
    const baseList = this.effectiveRecords;
    const absoluteIndex = this.isServerSide ? dataRowIndex : (pageOffset + dataRowIndex);
    const record = baseList[absoluteIndex];
    if (!record) return;

    const rawValue = record[col.mc_nome_colonna];
    const type = col.mc_ui_column_type;

    // Snapshot pristine del record PRIMA di modificarlo: serve come secondo
    // argomento di `syncData(entita, original, ...)` per il concurrency check
    // lato backend (MetaService.updateRecord confronta timestamp/rowversion
    // dell'original col record corrente sul DB). Se passiamo il record mutato
    // come original, il check fallisce con "Errore concorrenza ottimistica".
    const pristineSnapshot = this.clonePristineRecord(record);

    // Build input element in base al tipo
    let inputEl: HTMLElement;
    let getValue: () => any;
    switch (type) {
      case 'date': {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'wuic-sf-cell-editor wuic-sf-cell-editor--date';
        const d = this.tryParseDate(rawValue);
        if (d) input.value = this.dateToInputDateString(d);
        inputEl = input;
        getValue = () => input.value ? input.value : null; // ISO yyyy-MM-dd
        break;
      }
      case 'datetime': {
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'wuic-sf-cell-editor wuic-sf-cell-editor--datetime';
        const d = this.tryParseDate(rawValue);
        if (d) input.value = this.dateToInputDateTimeString(d);
        inputEl = input;
        getValue = () => {
          const v = input.value;
          if (!v) return null;
          // Normalizza a ISO 8601 completo con secondi (backend-friendly).
          return v.length === 16 ? `${v}:00` : v;
        };
        break;
      }
      case 'boolean':
      case 'number_boolean': {
        const select = document.createElement('select');
        select.className = 'wuic-sf-cell-editor wuic-sf-cell-editor--boolean';
        const locale = this.resolveLocale();
        const yesLabel = locale.startsWith('it') ? 'Sì'
          : locale.startsWith('es') ? 'Sí'
            : locale.startsWith('fr') ? 'Oui'
              : locale.startsWith('de') ? 'Ja'
                : 'Yes';
        const noLabel = locale.startsWith('it') ? 'No'
          : locale.startsWith('fr') ? 'Non'
            : locale.startsWith('de') ? 'Nein'
              : 'No';
        // Blank option per permettere null (nullable boolean)
        const blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '';
        select.appendChild(blankOpt);
        const yesOpt = document.createElement('option');
        yesOpt.value = '1';
        yesOpt.textContent = yesLabel;
        select.appendChild(yesOpt);
        const noOpt = document.createElement('option');
        noOpt.value = '0';
        noOpt.textContent = noLabel;
        select.appendChild(noOpt);
        const truthy = rawValue === true || rawValue === 1 || rawValue === '1' || rawValue === 'true' || rawValue === 'True';
        const falsy = rawValue === false || rawValue === 0 || rawValue === '0' || rawValue === 'false' || rawValue === 'False';
        select.value = truthy ? '1' : (falsy ? '0' : '');
        inputEl = select;
        getValue = () => {
          const v = select.value;
          if (v === '') return null;
          if (type === 'number_boolean') return v === '1' ? 1 : 0;
          return v === '1';
        };
        break;
      }
      case 'dictionary': {
        const select = document.createElement('select');
        select.className = 'wuic-sf-cell-editor wuic-sf-cell-editor--dictionary';
        const dict = this.parseDictionarySource(col);
        const blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '';
        select.appendChild(blankOpt);
        for (const d of dict) {
          const opt = document.createElement('option');
          opt.value = String(d.id);
          opt.textContent = d.label;
          select.appendChild(opt);
        }
        if (rawValue != null && rawValue !== '') select.value = String(rawValue);
        inputEl = select;
        getValue = () => {
          const v = select.value;
          if (v === '') return null;
          // Preserva il tipo numerico se l'id originale era number-like.
          const first = dict[0];
          if (first && typeof first.id === 'number') return Number(v);
          return v;
        };
        break;
      }
      default:
        return; // tipo non gestito qui
    }

    // Posiziona overlay sopra la cella (absolute, fuori dal clipping dello sheet)
    inputEl.style.position = 'fixed';
    inputEl.style.left = `${rect.left}px`;
    inputEl.style.top = `${rect.top}px`;
    inputEl.style.width = `${Math.max(80, rect.width)}px`;
    inputEl.style.height = `${Math.max(24, rect.height)}px`;
    inputEl.style.zIndex = '99999';
    if (this.isDarkThemeActive()) {
      inputEl.classList.add('wuic-sf-cell-editor--dark');
    }

    document.body.appendChild(inputEl);
    this.cellEditorOverlayEl = inputEl;

    // Flag per evitare double-commit (blur + change entrambi)
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newValue = getValue();
      this.applyCellEditorValue(record, col, newValue, pristineSnapshot);
      this.closeCellEditor();
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      this.closeCellEditor();
    };

    // Eventi
    if (inputEl instanceof HTMLSelectElement) {
      inputEl.addEventListener('change', commit);
    } else {
      inputEl.addEventListener('change', commit);
    }
    inputEl.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      else if (ev.key === 'Tab') { commit(); /* lascia Syncfusion gestire il focus */ }
    });
    // blur commit (ma solo se non c'è già stato commit via change)
    inputEl.addEventListener('blur', () => {
      setTimeout(() => { if (!committed) commit(); }, 0);
    });

    // Outside click → commit (coerente con data entry spreadsheet classico)
    this.cellEditorOutsideClickHandler = (ev: MouseEvent) => {
      if (!inputEl.contains(ev.target as Node)) {
        commit();
      }
    };
    setTimeout(() => {
      if (this.cellEditorOutsideClickHandler) {
        document.addEventListener('mousedown', this.cellEditorOutsideClickHandler, true);
      }
    }, 0);
    this.cellEditorEscapeHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', this.cellEditorEscapeHandler, true);

    // Focus
    setTimeout(() => {
      try {
        (inputEl as any).focus?.();
        if (inputEl instanceof HTMLInputElement && (type === 'date' || type === 'datetime')) {
          // Apri il picker nativo quando supportato (Chromium)
          (inputEl as any).showPicker?.();
        }
      } catch { /* ignore */ }
    }, 0);
  }

  private closeCellEditor(): void {
    if (this.cellEditorOutsideClickHandler) {
      document.removeEventListener('mousedown', this.cellEditorOutsideClickHandler, true);
      this.cellEditorOutsideClickHandler = undefined;
    }
    if (this.cellEditorEscapeHandler) {
      document.removeEventListener('keydown', this.cellEditorEscapeHandler, true);
      this.cellEditorEscapeHandler = undefined;
    }
    if (this.cellEditorOverlayEl) {
      this.cellEditorOverlayEl.remove();
      this.cellEditorOverlayEl = null;
    }
    // Cleanup del popup autocomplete (gestito separatamente dall'input perché
    // e' posizionato sotto la cella, fuori dal bounding box dell'editor).
    if (this.cellLookupPopupEl) {
      this.cellLookupPopupEl.remove();
      this.cellLookupPopupEl = null;
    }
    this.cellLookupDebounceTimer && clearTimeout(this.cellLookupDebounceTimer);
    this.cellLookupDebounceTimer = undefined;
  }

  /**
   * Chiude/commit l'editor cella attivo prima di un save batch.
   *
   * Scenario bug: l'utente modifica una cella (testo/numero/data/lookup) e clicca
   * "Salva modifiche" (o "Salva riga/e selezionate") SENZA prima premere
   * Enter/Tab/cambiare cella. In quel momento l'editor e' ancora open:
   *  - Per l'editor Syncfusion nativo il valore vive nell'input `<input>` interno
   *    e non e' stato ancora applicato al dataSource → `cellSave` non ha emesso.
   *  - Per gli editor custom WUIC (date/datetime/boolean/dictionary/lookup)
   *    l'overlay e' ancora nel DOM e `applyCellEditorValue` non e' stato chiamato.
   *
   * Senza flush il record non risulta pending, `pendingSpreadsheetRows` e'
   * vuoto, e il save parte a vuoto (early-return su `!pending.length && !localPendingIndexes.length`).
   *
   * Strategia:
   *  1. Se esiste un overlay custom (cellEditorOverlayEl), triggeriamo `blur`
   *     → i handler che ho wired committeranno (applyCellEditorValue o commitWithSelection).
   *  2. Syncfusion nativo: `sf.endEdit()` chiude l'editor interno emettendo
   *     `cellSave` sincrono (che valorizza il record tramite onSyncfusionCellSave).
   *  3. Attendiamo un tick per propagare eventuali subscribe/markPending.
   */
  private async flushPendingCellEdit(): Promise<void> {
    // 1. Editor custom overlay (se presente) → blur triggera il mio handler commit
    if (this.cellEditorOverlayEl) {
      try { (this.cellEditorOverlayEl as any).blur?.(); } catch { /* ignore */ }
    }

    // 2. Editor Syncfusion nativo: quando l'utente digita via tastiera il valore
    //    finisce nel DOM (`.e-spreadsheet-edit` contenteditable) MA non viene
    //    propagato a `editModule.editCellData.value` finche' lo spreadsheet non
    //    processa un keydown/keyup. Se cliccano "Salva modifiche" senza
    //    blurrare la cella, `endEdit()` chiude l'editor col valore originale
    //    (editCellData.value = oldValue) e `cellSave` emette un valore stale.
    //    Fix: chiamare `syncEditModelFromEditor()` PRIMA di `endEdit()` cosi'
    //    il model viene sincronizzato dal DOM contenteditable.
    try {
      const sf: any = this.sfSpreadsheet;
      const editModule = sf?.editModule;
      if (editModule && editModule.isEdit) {
        if (typeof editModule.syncEditModelFromEditor === 'function') {
          editModule.syncEditModelFromEditor();
        }
        if (typeof sf.endEdit === 'function') {
          sf.endEdit();
        } else if (typeof sf.closeEdit === 'function') {
          sf.closeEdit();
        }
      }
    } catch { /* ignore: editor not open */ }

    // 3. Lascia che i microtask propaghino: Syncfusion cellSave → onSyncfusionCellSave
    //    → record[col] = newValue → markPendingRow. Servono almeno 2 tick perche'
    //    Syncfusion wrappa il cellSave in un async internal.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  // ============================================================
  // Custom lookup editor inline (type === 'lookupByID')
  // ============================================================

  /** Popup <ul> dell'autocomplete, separato dall'input (position: fixed diverso). */
  private cellLookupPopupEl: HTMLElement | null = null;
  private cellLookupDebounceTimer: any;
  private cellLookupSelectedIndex = -1;
  private cellLookupLastResults: any[] = [];

  /**
   * Inline autocomplete editor per colonne `lookupByID`:
   *  1. input text ancorato alla cella + popup `<ul>` sotto
   *  2. debounce 300ms su input → `lookupSource.fetchData()` con
   *     `filterInfo = { contains on mc_ui_lookup_dataTextField }`
   *  3. navigazione ↓/↑ + Enter per select, click mouse per select
   *  4. al select: `record[col.mc_nome_colonna] = item[dataValueField]` +
   *     `record[displayKey]  = item[dataTextField]` (displayKey = il join
   *     naming convention usato anche da list-grid: `entity___textField__colName`)
   *  5. `markPendingRow` + `rebuildSheet` (mostra nuovo display text in cella)
   *  6. se NOT batch mode → `saveSingleRecordImmediate` per sync server-side
   *
   * Esc annulla; Tab / outside click / blur committano la selezione corrente
   * (se presente) altrimenti chiudono senza modifiche.
   */
  private openCustomLookupEditor(col: any, sheetRow: number, colIdx: number): void {
    this.closeCellEditor();
    if (!this.spreadsheet?.nativeElement || !this.lookupSource) return;

    const ariaCol = colIdx + 1;
    const rowSel = `.e-sheet-content .e-row[aria-rowindex="${sheetRow}"]`;
    const rowEl = this.spreadsheet.nativeElement.querySelector(rowSel) as HTMLElement | null;
    const cellEl = rowEl
      ? (rowEl.querySelector(`.e-cell[aria-colindex="${ariaCol}"]`) as HTMLElement | null)
      : null;
    if (!cellEl) return;
    const rect = cellEl.getBoundingClientRect();

    const dataRowIndex = sheetRow - 1;
    const pageOffset = this.isServerSide ? 0 : (this.pageIndex - 1) * this.pageSize;
    const absoluteIndex = this.isServerSide ? dataRowIndex : (pageOffset + dataRowIndex);
    const record = this.effectiveRecords[absoluteIndex];
    if (!record) return;
    const pristineSnapshot = this.clonePristineRecord(record);

    // CRUCIAL: instrada il `lookupSource` verso la route lookup della colonna
    // corrente. Senza questo, `fetchData()` usa la route precedente (o null) e
    // ritorna sempre 0 risultati. Pattern identico al vecchio spreadsheet-list
    // jspreadsheet (vedi `self.currentRoute.next(mc_ui_lookup_entity_name)`).
    this.currentField = col;
    this.currentRecord = record;
    this.currentRoute.next(col.mc_ui_lookup_entity_name);

    // Display key: "<entity_underscored>___<dataTextField>__<colName>" — stessa
    // convention di list-grid / spreadsheet-list legacy (vedi
    // `buildLookupDisplayKey()` nel componente jspreadsheet originale).
    const displayKey = this.buildLookupDisplayFieldName(col);
    const initialDisplay = record[displayKey] ?? record[col.mc_nome_colonna] ?? '';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'wuic-sf-cell-editor wuic-sf-cell-editor--lookup';
    input.value = String(initialDisplay);
    input.autocomplete = 'off';
    input.spellcheck = false;
    Object.assign(input.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${Math.max(80, rect.width)}px`,
      height: `${Math.max(24, rect.height)}px`,
      zIndex: '99999',
    });
    if (this.isDarkThemeActive()) input.classList.add('wuic-sf-cell-editor--dark');
    document.body.appendChild(input);
    this.cellEditorOverlayEl = input;

    // Popup results
    const popup = document.createElement('ul');
    popup.className = 'wuic-sf-lookup-popup';
    Object.assign(popup.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.bottom}px`,
      minWidth: `${Math.max(120, rect.width)}px`,
      maxHeight: '220px',
      overflow: 'auto',
      margin: '0',
      padding: '0',
      listStyle: 'none',
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      zIndex: '99999',
      display: 'none',
    });
    if (this.isDarkThemeActive()) {
      popup.style.background = '#1f2937';
      popup.style.color = '#e5e7eb';
      popup.style.borderColor = '#374151';
    }
    document.body.appendChild(popup);
    this.cellLookupPopupEl = popup;
    this.cellLookupSelectedIndex = -1;
    this.cellLookupLastResults = [];

    let committed = false;
    const commitWithSelection = () => {
      if (committed) return;
      committed = true;
      const idx = this.cellLookupSelectedIndex;
      const results = this.cellLookupLastResults;
      if (idx >= 0 && idx < results.length) {
        const sel = results[idx];
        const newId = sel[col.mc_ui_lookup_dataValueField];
        const newDisplay = sel[col.mc_ui_lookup_dataTextField];
        // Aggiorna sia l'ID che il display "joined" per rendering cella.
        record[col.mc_nome_colonna] = newId;
        if (displayKey) record[displayKey] = newDisplay;
        if (record[col.mc_nome_colonna] !== pristineSnapshot[col.mc_nome_colonna]) {
          this.markPendingRow(record);
          this.rebuildSheetWithData();
          if (!this.isBatchSaveEnabled()) {
            void this.saveSingleRecordImmediate(record, pristineSnapshot);
          }
        }
      }
      this.closeCellEditor();
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      this.closeCellEditor();
    };

    const runAutocomplete = async () => {
      const q = input.value.trim();
      popup.innerHTML = '';
      if (!q) { popup.style.display = 'none'; this.cellLookupLastResults = []; return; }
      try {
        this.lookupSource.filterInfo = {
          logic: 'AND',
          filters: [{
            field: col.mc_ui_lookup_dataTextField,
            operatore: 'contains',
            value: q,
            fixed: true,
          }],
        } as any;
        const fetched = await this.lookupSource.fetchData();
        const items: any[] = (fetched?.resultInfo?.dato) || [];
        this.cellLookupLastResults = items;
        this.cellLookupSelectedIndex = items.length > 0 ? 0 : -1;
        if (!items.length) {
          popup.style.display = 'none';
          return;
        }
        items.forEach((rec, i) => {
          const li = document.createElement('li');
          li.textContent = String(rec[col.mc_ui_lookup_dataTextField] ?? '');
          Object.assign(li.style, {
            padding: '4px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          });
          if (i === this.cellLookupSelectedIndex) li.classList.add('selected');
          li.addEventListener('mouseenter', () => {
            this.cellLookupSelectedIndex = i;
            this.refreshLookupPopupHighlight();
          });
          li.addEventListener('mousedown', (ev) => {
            // mousedown così avviene PRIMA del blur sull'input
            ev.preventDefault();
            this.cellLookupSelectedIndex = i;
            commitWithSelection();
          });
          popup.appendChild(li);
        });
        this.refreshLookupPopupHighlight();
        popup.style.display = 'block';
      } catch (err) {
        console.warn('[SpreadsheetListSf][lookup] autocomplete fetch error', err);
        popup.style.display = 'none';
      }
    };

    input.addEventListener('input', () => {
      if (this.cellLookupDebounceTimer) clearTimeout(this.cellLookupDebounceTimer);
      this.cellLookupDebounceTimer = setTimeout(() => void runAutocomplete(), 300);
    });
    input.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (this.cellLookupLastResults.length === 0) return;
        this.cellLookupSelectedIndex = (this.cellLookupSelectedIndex + 1) % this.cellLookupLastResults.length;
        this.refreshLookupPopupHighlight();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (this.cellLookupLastResults.length === 0) return;
        this.cellLookupSelectedIndex = (this.cellLookupSelectedIndex - 1 + this.cellLookupLastResults.length) % this.cellLookupLastResults.length;
        this.refreshLookupPopupHighlight();
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        commitWithSelection();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      } else if (ev.key === 'Tab') {
        commitWithSelection();
      }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (!committed) commitWithSelection(); }, 150);
    });

    this.cellEditorOutsideClickHandler = (ev: MouseEvent) => {
      if (!input.contains(ev.target as Node) && !popup.contains(ev.target as Node)) {
        commitWithSelection();
      }
    };
    setTimeout(() => {
      if (this.cellEditorOutsideClickHandler) {
        document.addEventListener('mousedown', this.cellEditorOutsideClickHandler, true);
      }
    }, 0);
    this.cellEditorEscapeHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', this.cellEditorEscapeHandler, true);

    setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  private refreshLookupPopupHighlight(): void {
    const popup = this.cellLookupPopupEl;
    if (!popup) return;
    const children = Array.from(popup.children) as HTMLElement[];
    children.forEach((li, i) => {
      const active = i === this.cellLookupSelectedIndex;
      li.classList.toggle('selected', active);
      li.style.background = active
        ? (this.isDarkThemeActive() ? '#374151' : '#e0e7ff')
        : 'transparent';
    });
    const active = children[this.cellLookupSelectedIndex];
    if (active) {
      const top = active.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < popup.scrollTop) popup.scrollTop = top;
      else if (bottom > popup.scrollTop + popup.clientHeight) popup.scrollTop = bottom - popup.clientHeight;
    }
  }

  /**
   * Display field name convention: "<entity_underscored>___<dataTextField>__<colName>".
   * Usato sia da list-grid che dal vecchio spreadsheet-list jspreadsheet per leggere
   * il testo joined dal record flattened (il backend `getFlatRecordData` espande le
   * lookup con questo naming).
   */
  private buildLookupDisplayFieldName(col: any): string {
    const entity = String(col?.mc_ui_lookup_entity_name ?? '').trim();
    const textField = col?.mc_ui_lookup_dataTextField;
    const colName = col?.mc_nome_colonna;
    if (!entity || !textField || !colName) return '';
    return `${entity.replaceAll(' ', '_')}___${textField}__${colName}`;
  }

  /**
   * Scrive il nuovo valore nel record, marca pending, e se non-batch
   * propaga lo sync immediato. Infine rebuilds dello sheet per mostrare
   * il valore formattato nella cella.
   *
   * @param pristineSnapshot snapshot del record PRIMA della modifica —
   *   passato come `original` a `syncData` così il backend può fare il
   *   concurrency check contro lo stato "noto" (rowversion/updated_at),
   *   altrimenti fallisce con "Errore concorrenza ottimistica".
   */
  private applyCellEditorValue(record: any, col: any, newValue: any, pristineSnapshot: any): void {
    if (!record) return;
    const oldValue = record[col.mc_nome_colonna];
    if (oldValue === newValue) return; // no-op se invariato

    record[col.mc_nome_colonna] = newValue;
    this.markPendingRow(record);

    // Ricostruisce lo sheet — la cella mostra il valore formattato aggiornato
    // (es. 2025-04-19 → "19/04/2025" per date, ID 42 → "Graphic Design..." per dict).
    this.rebuildSheetWithData();

    // Se batch save non abilitato → persisti subito via datasource.syncData.
    // Il datasource si occupa di concurrency check, validation, notifiche UI.
    if (!this.isBatchSaveEnabled()) {
      (async () => {
        try {
          await this.saveSingleRecordImmediate(record, pristineSnapshot);
        } catch (err) {
          console.error('[SpreadsheetListSf] cellEditor save error', err);
        }
      })();
    }
  }

  /**
   * Wrappa un record "plain" (com'è presente in `this.records` dello spreadsheet)
   * in una forma compatibile con `DataSourceComponent.syncData(entita, pristine)`,
   * che legge i field tramite `entita[field].value` — ovvero assume che ogni
   * field sia un `BehaviorSubject` (o duck-type con `.value`).
   *
   * Replica lo stesso contratto dei record generati dal DataSource form flow.
   */
  private wrapRecordForDatasourceSync(record: any): any {
    if (!record || !this.metaInfo?.columnMetadata) return record;
    const wrapped: any = {
      __new: new BehaviorSubject<boolean>(record.__new === true || (record.__new as any)?.value === true),
      __guid: new BehaviorSubject<string | null>(
        (record.__guid && typeof record.__guid === 'object' && 'value' in record.__guid)
          ? (record.__guid as any).value
          : (record.__guid ?? null)
      )
    };
    for (const col of this.metaInfo.columnMetadata) {
      const name = col.mc_nome_colonna;
      const raw = record[name];
      const unwrapped = (raw && typeof raw === 'object' && 'value' in raw && typeof (raw as any).subscribe === 'function')
        ? (raw as any).value
        : raw;
      wrapped[name] = new BehaviorSubject(unwrapped ?? null);
      // Se è una colonna lookup a multiple_check, replica anche `__lookup_obj`
      if (col.mc_ui_column_type === 'multiple_check') {
        const lookupKey = name + '__lookup_obj';
        const rawLookup = record[lookupKey];
        const unwrappedLookup = (rawLookup && typeof rawLookup === 'object' && 'value' in rawLookup)
          ? (rawLookup as any).value
          : (rawLookup ?? []);
        wrapped[lookupKey] = new BehaviorSubject(unwrappedLookup);
      }
    }
    return wrapped;
  }

  /**
   * Helper unificato per insert/update/delete di un singolo record via
   * il datasource WUIC. Usa `datasource.syncData(entita, pristine, deleting)`
   * che si occupa di:
   *  - concurrency check (`__original`)
   *  - validation + before/after sync callbacks
   *  - notifica success/error via messageNotificationService
   *  - refresh del tracked changes / resultInfo
   *
   * `record` è il record plain nello spreadsheet (post-modifica).
   * `pristine` è lo snapshot PRIMA della modifica (plain); verrà wrappato
   *  nello stesso formato di entita.
   *
   * @param mode 'insert' (entity.__new=true), 'update' (default), 'delete'.
   */
  private async syncRecordViaDatasource(
    record: any,
    pristine: any,
    mode: 'insert' | 'update' | 'delete' = 'update'
  ): Promise<any> {
    const ds = this.datasource?.value;
    if (!ds) throw new Error('Datasource non disponibile');

    // `entita` viene wrappato perché `syncData` legge `entita[field].value`.
    // `pristine` invece deve restare PLAIN — il datasource lo usa sia come
    // `__original` per concurrency check sia come argomento di
    // `buildFallbackChangesForSync(entity, pristine)` che fa confronto
    // campo-per-campo con `normalizeFieldValueForSync(field, pristine[field])`.
    // Se wrappato, il confronto fallirebbe (BehaviorSubject vs string) → no delta
    // → UPDATE no-op → UI rollback al valore pristine.
    const entita = this.wrapRecordForDatasourceSync(record);
    const pristinePlain = this.clonePristineRecord(pristine ?? record);

    // Per insert marcare `__new=true` sul wrapped entity
    if (mode === 'insert') {
      (entita.__new as BehaviorSubject<boolean>).next(true);
    } else {
      (entita.__new as BehaviorSubject<boolean>).next(false);
    }

    const deleting = mode === 'delete';
    return await ds.syncData(entita, pristinePlain, deleting);
  }

  /**
   * Save immediato di un singolo record. Wrappa il record in BehaviorSubject
   * e delega a `datasource.syncData` (WUIC standard per insert/update/delete).
   * Gestisce automaticamente concurrency check, validation, notifiche UI.
   */
  private async saveSingleRecordImmediate(record: any, pristine: any): Promise<void> {
    if (!record) return;
    const mode: 'insert' | 'update' = record.__new === true ? 'insert' : 'update';

    // Sopprimi il subscribe al fetchInfo$ mentre syncData esegue
    // publishLocalStateUpdate (che altrimenti sovrascriverebbe `this.records`
    // col dato interno del datasource, non ancora aggiornato con la modifica).
    this.suppressFetchInfoDuringSync = true;
    let syncResult: any;
    try {
      syncResult = await this.syncRecordViaDatasource(record, pristine, mode);
    } finally {
      this.suppressFetchInfoDuringSync = false;
    }

    // Rimuovi pending marker (save riuscito).
    const idx = this.records.indexOf(record);
    if (idx >= 0) this.pendingSpreadsheetRows.delete(idx);

    // Overlay del record locale con l'entity ritornata dal server (include
    // eventuali colonne server-generated: PK su insert, trigger rowversion,
    // computed columns, timestamps ecc.). Preserva l'identità del record
    // (stesso object reference in this.records) per non rompere indexOf etc.
    const returnedEntity = this.extractEntityFromSyncResult(syncResult);
    if (returnedEntity) {
      for (const key of Object.keys(returnedEntity)) {
        record[key] = returnedEntity[key];
      }
    }
    // Clear flag new per sicurezza (record esiste sul server ora).
    if (mode === 'insert' && record.__new === true) {
      record.__new = false;
    }

    // Sincronizza anche il record INTERNO del datasource (per eventuali
    // future emissioni di fetchInfo$ che non passano dal suppress flag).
    this.syncInternalDatasourceRecord(record, returnedEntity);

    // Rebuild dello sheet per mostrare i valori server-aggiornati.
    this.rebuildSheetWithData();
  }

  /**
   * Propaga il valore aggiornato del record (post-sync) dentro l'array
   * interno `datasource.resultInfo.dato`. Identifica il record per PK.
   * I field in quell'array sono `BehaviorSubject`, quindi usiamo `.next()`
   * per preservare la subscription chain del form flow.
   */
  private syncInternalDatasourceRecord(record: any, returnedEntity: any | null): void {
    const ds = this.datasource?.value;
    const dato = ds?.resultInfo?.dato;
    const pkCol = this.metaInfo?.pKey;
    if (!ds || !Array.isArray(dato) || !pkCol) return;

    const pkName = pkCol.mc_nome_colonna;
    const pkVal = record?.[pkName];
    if (pkVal == null) return;

    const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
    const dsRec = dato.find((r: any) => String(unwrap(r?.[pkName])) === String(pkVal));
    if (!dsRec) return;

    // Prendi i valori da returnedEntity (preferred, server-updated) o dal
    // record locale come fallback.
    const source = returnedEntity || record;
    for (const key of Object.keys(source)) {
      const newVal = source[key];
      const target = dsRec[key];
      if (target && typeof target === 'object' && 'next' in target && typeof (target as any).next === 'function') {
        // BehaviorSubject → usa .next() (emette ai subscribers del form flow).
        try { (target as any).next(newVal); } catch { /* ignore */ }
      } else {
        dsRec[key] = newVal;
      }
    }
  }

  /**
   * Estrae l'entity "record completo" dal payload di risposta di syncData.
   * Il backend WUIC usa diverse shape a seconda dell'operazione:
   *   - insert/clone:  `{ result: { <PK>: ..., ...fields } }` oppure `{ __entity: {...} }`
   *   - update:         idem, con `result` spesso = full record post-UPDATE
   *   - delete:         `{ result: <pkValue> }` (non un entity — ritorniamo null)
   *
   * Ritorna null se non si riesce a individuare una shape valida di entity.
   */
  private extractEntityFromSyncResult(syncResult: any): any | null {
    if (!syncResult || typeof syncResult !== 'object') return null;
    // Shape 1: __entity diretto
    if (syncResult.__entity && typeof syncResult.__entity === 'object') {
      return this.unwrapBehaviorSubjectFields(syncResult.__entity);
    }
    // Shape 2: result come entity (oggetto con fields)
    const result = syncResult.result;
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      // Se result è solo un ID primitivo (delete), viene serializzato come
      // scalar — quindi qui siamo sicuri che è un oggetto.
      return this.unwrapBehaviorSubjectFields(result);
    }
    return null;
  }

  /**
   * Se un oggetto ha field BehaviorSubject (`.value`), li unwrappa.
   * Per sicurezza nel merge col record plain dello spreadsheet.
   */
  private unwrapBehaviorSubjectFields(entity: any): any {
    if (!entity || typeof entity !== 'object') return entity;
    const out: any = {};
    for (const key of Object.keys(entity)) {
      const v = entity[key];
      if (v && typeof v === 'object' && 'value' in v && typeof (v as any).subscribe === 'function') {
        out[key] = (v as any).value;
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  /**
   * Rimuove un record dall'array locale `this.records` (+ eventuale
   * filteredRecords) dopo un delete server-side riuscito. Riassesta la
   * paginazione se la pagina corrente diventa vuota → salta alla precedente.
   */
  private removeRecordLocally(record: any): void {
    const idx = this.records.indexOf(record);
    if (idx >= 0) {
      this.records.splice(idx, 1);
      this.pendingSpreadsheetRows.delete(idx);
      // Shift pending indices > idx (indici cambiati per splice)
      const shifted = new Set<number>();
      for (const i of this.pendingSpreadsheetRows) {
        shifted.add(i > idx ? i - 1 : i);
      }
      this.pendingSpreadsheetRows = shifted;
    }
    if (this.filteredRecords) {
      const fIdx = this.filteredRecords.indexOf(record);
      if (fIdx >= 0) this.filteredRecords.splice(fIdx, 1);
    }

    // Rimuovi anche dal dato interno del datasource (per PK) così il
    // publishLocalStateUpdate post-sync non riemette il record cancellato.
    const ds = this.datasource?.value;
    const pkCol = this.metaInfo?.pKey;
    if (ds?.resultInfo?.dato && pkCol) {
      const pkName = pkCol.mc_nome_colonna;
      const pkVal = record?.[pkName];
      if (pkVal != null) {
        const unwrap = (v: any) => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
        const dsIdx = ds.resultInfo.dato.findIndex((r: any) =>
          String(unwrap(r?.[pkName])) === String(pkVal)
        );
        if (dsIdx >= 0) ds.resultInfo.dato.splice(dsIdx, 1);
      }
    }

    this.totalRecords = Math.max(0, (this.totalRecords || 0) - 1);
    // Se la pagina corrente resta vuota → torna alla precedente.
    const maxPage = Math.max(1, Math.ceil(this.effectiveRecords.length / this.pageSize));
    if (this.pageIndex > maxPage) this.pageIndex = maxPage;

    this.rebuildSheetWithData();
  }

  /**
   * Crea uno snapshot "pristine" di un record per il concurrency check:
   * - unwrap dei field wrappati in BehaviorSubject (che hanno forma `{ value }`)
   * - deep-clone dei valori primitivi/array/Date per isolare da successive
   *   mutazioni del record vivo.
   * Non è un vero deep-clone strutturale (sufficiente per payload JSON piatti
   * come quelli di DataSource). Se il backend ha bisogno del rowversion/
   * updated_at lo trova qui identico a quello corrente sul DB.
   */
  private clonePristineRecord(record: any): any {
    if (record == null || typeof record !== 'object') return record;
    const out: any = {};
    for (const key of Object.keys(record)) {
      const v = record[key];
      if (v && typeof v === 'object' && 'value' in v && typeof (v as any).next === 'function') {
        // BehaviorSubject-like: capture current value
        out[key] = (v as any).value;
      } else if (v instanceof Date) {
        out[key] = new Date(v.getTime());
      } else if (Array.isArray(v)) {
        out[key] = v.slice();
      } else if (v && typeof v === 'object') {
        try { out[key] = JSON.parse(JSON.stringify(v)); } catch { out[key] = v; }
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  /** Formato yyyy-MM-dd per `<input type="date">`. */
  private dateToInputDateString(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /** Formato yyyy-MM-ddTHH:mm per `<input type="datetime-local">`. */
  private dateToInputDateTimeString(d: Date): string {
    const base = this.dateToInputDateString(d);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${base}T${hh}:${mi}`;
  }

  /**
   * actionComplete: fires dopo ogni azione significativa (resize, sort,
   * filter, paste, ecc.). Usata per:
   * - persistere larghezze colonne modificate dall'utente (in `mc_ui_grid_size_width`)
   * - tracciare sort column per re-apply al refetch
   */
  onSyncfusionActionComplete(args: any): void {
    if (!args) return;
    const action = args?.action;
    if (action === 'resize' && args?.eventArgs?.oldWidth != null && args?.eventArgs?.width != null) {
      const colIdx = args.eventArgs.index;
      // Syncfusion puo' passare `width` come Number (es. via setColWidth API)
      // o come stringa con suffisso "px" (es. "280px" via drag utente sul
      // resize handle). parseFloat gestisce entrambi: parseFloat("280px") = 280,
      // parseFloat(280) = 280. Number("280px") invece ritorna NaN → bug
      // storico che faceva finire "NaNpx" nei metadata e perdeva il resize
      // al primo paging/refresh.
      const newWidth = parseFloat(String(args.eventArgs.width));
      if (Number.isFinite(newWidth) && newWidth > 0) {
        this.persistColumnWidth(colIdx, newWidth);
      }
    }
    if (action === 'sorting' && this.pendingSortRequest) {
      const req = this.pendingSortRequest;
      this.pendingSortRequest = null;
      this.applyFullSort(req.field, req.order);
    }
    // NOTA: il filter NON è più gestito via Syncfusion native (popup nativo
    // operava solo sui 10 record della pagina visibile e mostrava distincts
    // incompleti). Ora è interamente gestito dal popup custom aperto dal
    // funnel button in `ensureHeaderFilterButton` → `openCustomFilterPopup`.
    // Il popup custom legge i distinct da `this.records` (tutto il dataset)
    // e applica il filtro via `applyColumnFiltersToRecords`.
  }

  /**
   * actionBegin: fires PRIMA che Syncfusion applichi un'azione. Usato per:
   * - Intercettare il sort utente: di default Syncfusion ordina solo
   *   il dataSource corrente (= solo i 10 record della pagina corrente).
   *   Noi annulliamo quel sort e lo applichiamo a `this.records` intero
   *   (client-side) o delegiamo al datasource (server-side), poi ricostruiamo
   *   lo sheet ripartendo da pagina 1.
   */
  onSyncfusionActionBegin(args: any): void {
    if (!args) return;
    const action = args?.action;

    if (action === 'beforeSort' || action === 'sort') {
      // Syncfusion v33 wrapping: args.args = { eventArgs, action, name }
      const nested = args?.args?.eventArgs || args?.args || args?.eventArgs || {};
      const sortOptions = nested?.sortOptions || args?.args?.sortOptions || {};
      const sortDescriptor = sortOptions?.sortDescriptors || {};
      const field = (sortDescriptor as any)?.field;
      const order = (sortDescriptor as any)?.order || 'Ascending';
      const range = nested?.range || args?.args?.range;

      let resolvedField = field as string | undefined;
      if (!resolvedField && typeof range === 'string') {
        const m = range.match(/^([A-Z]+)\d+/i);
        if (m) resolvedField = m[1];
      }

      // Marca range come "contiene header" per sopprimere l'alert "expand range"
      // di Syncfusion (che tenta di aprire un dialog che crasha).
      if (sortOptions) (sortOptions as any).containsHeader = true;

      // Memorizza la richiesta di sort — verrà ri-applicata sui records
      // INTERI dopo che Syncfusion ha completato il suo sort (che tocca
      // solo i 10 visibili, ma non è un problema perché noi riscriviamo
      // l'intero dataSource dopo).
      if (resolvedField) {
        this.pendingSortRequest = { field: resolvedField, order };
      }
    }
  }

  /** Richiesta di sort in coda, applicata in onSyncfusionActionComplete */
  private pendingSortRequest: { field: string; order: string } | null = null;

  /**
   * dialogBeforeOpen: Syncfusion emette questo evento prima di renderizzare
   * qualunque dialog built-in (sort range alert, protect sheet, ecc.). Lo
   * usiamo per cancellare il dialog "Sort range alert" che altrimenti
   * crasha dopo il cancel del nostro custom sort (nativeElement undefined
   * nella template compile della dialog Syncfusion).
   */
  onSyncfusionDialogBeforeOpen(args: any): void {
    if (!args) return;
    const name = args?.dialogName || args?.name;
    // Nome dialog Syncfusion per sort alert: 'SortRangeDialog' (v33).
    // Per robustezza cancelliamo QUALSIASI dialog che si apre durante un
    // flow di sort (abbiamo comunque già gestito il sort via applyFullSort).
    if (name === 'SortRangeDialog' || /sort/i.test(String(name || ''))) {
      args.cancel = true;
    }
  }

  /**
   * Chiude eventuale popup "Sort range alert" di Syncfusion che appare dopo
   * un cancel del sort. Cerca dialog aperti e li dismissa.
   */
  private dismissSyncfusionSortAlert(): void {
    try {
      const dialogs = document.querySelectorAll('.e-dialog.e-popup-open, .e-dlg-container .e-dialog');
      dialogs.forEach((dlg) => {
        // Prova a chiudere via l'istanza EJ2 se disponibile
        const inst = (dlg as any).ej2_instances?.[0];
        if (inst?.hide) {
          try { inst.hide(); return; } catch { /* ignore */ }
        }
        // Fallback: trova il bottone close e cliccalo
        const closeBtn = dlg.querySelector('.e-dlg-closeicon-btn, .e-btn-close, .e-dlg-header-content .e-icon-dlg-close') as HTMLElement | null;
        if (closeBtn) {
          try { closeBtn.click(); return; } catch { /* ignore */ }
        }
        // Ultima istanza: rimuovi via DOM
        try { (dlg.parentElement || dlg).remove(); } catch { /* ignore */ }
      });
    } catch {
      // swallow
    }
  }

  /**
   * Esegue un sort sull'intero dataset `this.records` (client-side) oppure
   * sul datasource (server-side), poi ricostruisce lo sheet partendo dalla
   * prima pagina. Serve per superare il limite del sort built-in Syncfusion
   * che opera solo sul range dati della pagina corrente.
   */
  private applyFullSort(sheetColLetter: string | null | undefined, order: string): void {
    if (!this.metaInfo || !sheetColLetter) return;

    // Mappa lettera colonna sheet → MetadatiColonna visibile
    const sheetColIdx = this.columnLetterToIndex(sheetColLetter);
    const visibleMetaCols = (this.metaInfo.columnMetadata || []).filter(c => !c.mc_hide_in_edit);
    const col = visibleMetaCols[sheetColIdx];
    if (!col) return;
    const fieldName = col.mc_nome_colonna;
    const dir: 'asc' | 'desc' | 'none' =
      order === 'Ascending' ? 'asc'
        : order === 'Descending' ? 'desc'
          : 'none';

    if (this.isServerSide) {
      // Delega al datasource: il WUIC backend legge `ds.sortInfo: SortInfo[]`
      // e applica ORDER BY nel SELECT generato da BuildDynamicSelectQuery.
      const ds = this.datasource?.value;
      if (ds) {
        if (dir === 'none') {
          ds.sortInfo = [];
        } else {
          ds.sortInfo = [{
            field: fieldName,
            dir,
            mc_id: (col as any).mc_id
          } as SortInfo];
        }
        ds.currentPage = 1;
        this.pageIndex = 1;
        ds.fetchData();
      }
      // Il refetch innesca subscribeToDS → rebuildSheetWithData
      return;
    }

    // Client-side: sort in-place di `this.records`
    const comparator = (a: any, b: any): number => {
      if (dir === 'none') return 0;
      const av = a?.[fieldName];
      const bv = b?.[fieldName];
      // Unwrap BehaviorSubject
      const aUnwrapped = (av && typeof av === 'object' && 'value' in av) ? (av as any).value : av;
      const bUnwrapped = (bv && typeof bv === 'object' && 'value' in bv) ? (bv as any).value : bv;
      // null/undefined vanno in fondo
      if (aUnwrapped == null && bUnwrapped == null) return 0;
      if (aUnwrapped == null) return 1;
      if (bUnwrapped == null) return -1;
      // Numeric compare se entrambi numerici
      const aNum = Number(aUnwrapped);
      const bNum = Number(bUnwrapped);
      let cmp = 0;
      if (!isNaN(aNum) && !isNaN(bNum) && `${aUnwrapped}`.trim() !== '' && `${bUnwrapped}`.trim() !== '') {
        cmp = aNum - bNum;
      } else {
        cmp = String(aUnwrapped).localeCompare(String(bUnwrapped), 'it', { sensitivity: 'base', numeric: true });
      }
      return dir === 'asc' ? cmp : -cmp;
    };

    this.records = [...this.records].sort(comparator);
    this.pageIndex = 1;
    this.rebuildSheetWithData();
  }

  /**
   * Salva la nuova larghezza colonna nei metadati (mc_ui_grid_size_width)
   * chiamando l'API MetaService. Best-effort: se il backend rifiuta, silent.
   */
  private persistColumnWidth(sfColIdx: number, newWidth: number): void {
    if (!this.metaInfo?.columnMetadata) return;
    const visibleMetaCols = this.metaInfo.columnMetadata.filter(c => !c.mc_hide_in_edit);
    const col = visibleMetaCols[sfColIdx];
    if (!col) return;

    // Optimistic update dell'in-memory metadata: ogni rebuildSheetWithData
    // successivo (save, refresh, paging, sorting, filter) passa in
    // `mapColumnWidth(col)` che legge da `col.mc_ui_grid_size_width`. Senza
    // questa sync, la larghezza UX viene ripristinata al valore originale
    // metadata al primo rebuild anche se il resize era stato persistito
    // sul server.
    (col as any).mc_ui_grid_size_width = `${newWidth}px`;

    // ALSO: salva in una mappa component-level keyed per mc_id. Il subscribe
    // a `fetchInfo$` (paging/refresh/sort) fa `this.metaInfo = info.metaInfo`
    // sostituendo l'oggetto intero → il mio update sopra viene perso perche'
    // la runtime metadata cache lato server non e' stata invalidata e ritorna
    // ancora il valore vecchio. Ri-applichiamo da questa mappa dopo ogni
    // sostituzione di metaInfo (vedi applyUserResizedWidths).
    if (col.mc_id != null) {
      this.userResizedColumnWidths.set(Number(col.mc_id), `${newWidth}px`);
    }

    try {
      // La colonna SQL `mcuigridsizewidth` e' INT — manda numero puro, niente
      // suffisso "px". Il driver MSSQL silenziosamente convertiva "240px"→240,
      // ma MySQL e' stricter e respinge con `Data truncated for column`.
      // L'in-memory metadata `col.mc_ui_grid_size_width` resta in formato CSS
      // ("240px") perche' il template binding lo usa come px diretto.
      const body = {
        column_metadata_patches: [{
          mc_id: col.mc_id,
          mc_ui_grid_size_width: Math.max(1, Math.trunc(Number(newWidth) || 0))
        }]
      };
      this.http.post('/api/Meta/AsmxProxy/MetaService.updateColumnMetadata', body).subscribe({
        next: () => { /* success, cache rinfrescato alla prossima invalidate */ },
        error: () => { /* silent: resize UI resta, ma non persiste */ }
      });
    } catch {
      // swallow
    }
  }

  /**
   * Mappa delle larghezze colonne modificate dall'utente nella sessione corrente
   * (mc_id → "NNNpx"). Preservata attraverso le emissioni di `fetchInfo$` che
   * sostituiscono `this.metaInfo` con un oggetto fresh dal backend (che pero'
   * puo' ancora avere il valore pre-resize finche' la cache metadata non e'
   * invalidata). Vedi `applyUserResizedWidths`.
   */
  private userResizedColumnWidths = new Map<number, string>();

  /**
   * Ri-applica le larghezze utente salvate in `userResizedColumnWidths` sopra
   * il `this.metaInfo.columnMetadata` corrente. Da chiamare ogni volta che
   * `this.metaInfo` viene sostituito (paging/refresh/sort/filter).
   */
  private applyUserResizedWidths(): void {
    if (!this.userResizedColumnWidths.size || !this.metaInfo?.columnMetadata) return;
    for (const col of this.metaInfo.columnMetadata) {
      const mcId = Number((col as any).mc_id);
      if (!mcId) continue;
      const userWidth = this.userResizedColumnWidths.get(mcId);
      if (userWidth) {
        (col as any).mc_ui_grid_size_width = userWidth;
      }
    }
  }

  /**
   * beforeFilter: intercetta l'apertura del filter popup per remappare i
   * valori ID→Label nelle lookup columns (analogo a createLookupFilterTemplate
   * del vecchio jspreadsheet).
   */
  onSyncfusionBeforeFilter(args: any): void {
    if (!this.metaInfo || !args) return;
    try {
      const colIdx = args?.filterIndex?.colIndex ?? args?.colIndex;
      if (colIdx == null) return;
      const visibleMetaCols = this.metaInfo.columnMetadata.filter(c => !c.mc_hide_in_edit);
      const col = visibleMetaCols[colIdx];
      if (!col || col.mc_ui_column_type !== 'lookupByID') return;
      // Le opzioni filtro Syncfusion usano già il valore come renderizzato
      // nel foglio (che e' gia il display alias), quindi niente remap necessario.
      // Questa funzione e' pronta per eventuali filtri server-side custom.
    } catch {
      // swallow
    }
  }

  // ============================================================
  // Feature flags
  // ============================================================

  canInsertRows(): boolean {
    return !!this.metaInfo?.tableMetadata?.md_insertable;
  }

  canDeleteRows(): boolean {
    return !!this.metaInfo?.tableMetadata?.md_deletable;
  }

  isBatchSaveEnabled(): boolean {
    const md = this.metaInfo?.tableMetadata as any;
    return !!(md?.md_spreadsheet_batch_save || md?.md_batch_save);
  }

  // ============================================================
  // Toolbar handlers (bound from template)
  // ============================================================

  onToolbarInsert(): void {
    void this.handleSpreadsheetInsertRow(undefined, true);
  }

  onToolbarSaveBatch(): void {
    void this.handleSpreadsheetSavePendingChanges();
  }

  onToolbarRefresh(): void {
    this.datasource?.value?.fetchData();
  }


  // ============================================================
  // Helpers
  // ============================================================

  private getFirstSelectedDataRow(): number | undefined {
    const indexes = this.getVisibleRowIndexes();
    return indexes.length > 0 ? indexes[0] : undefined;
  }

  private columnLetterToIndex(letter: string): number {
    let idx = 0;
    const upper = letter.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      idx = idx * 26 + (upper.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  private notifySpreadsheetBatchSave(severity: 'success' | 'info' | 'error', title: string, detail: string): void {
    WtoolboxService.messageNotificationService?.add({ severity, summary: title, detail });
  }

  // ============================================================
  // Theme observer (TODO SF-PARITY: porting completo del vecchio)
  // ============================================================

  private initThemeObserver(): void {
    if (typeof document === 'undefined') return;
    try {
      // Applica subito il tema corrente al componente (se e' gia montato)
      this.syncThemeClass();
      this.themeObserver = new MutationObserver(() => {
        this.syncThemeClass();
        this.scheduleLayoutPass();
      });
      this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    } catch (err) {
      console.warn('[SpreadsheetListSf] theme observer init failed', err);
    }
  }

  /**
   * Aggiunge/rimuove la classe `.wuic-sf-dark` sull'ejs-spreadsheet element
   * in funzione dello stato theme dell'app host (body/html class o data-theme).
   * Il CSS in spreadsheet-list-sf.component.css scopa override per dark mode.
   */
  private syncThemeClass(): void {
    if (typeof document === 'undefined') return;
    const isDark =
      document.body.classList.contains('theme-dark') ||
      document.documentElement.classList.contains('theme-dark') ||
      document.body.getAttribute('data-theme') === 'dark' ||
      document.documentElement.getAttribute('data-theme') === 'dark';
    const hostEl = this.spreadsheet?.nativeElement;
    if (!hostEl) return;
    if (isDark) {
      hostEl.classList.add('wuic-sf-dark');
    } else {
      hostEl.classList.remove('wuic-sf-dark');
    }
  }

  private scheduleLayoutPass(): void {
    this.clearPendingLayoutPassTimeouts();
    const handle = window.setTimeout(() => {
      try {
        (this.sfSpreadsheet as any)?.resize?.();
      } catch {
        // swallow
      }
    }, 80);
    this.pendingLayoutPassTimeouts.push(handle);
  }

  private clearPendingLayoutPassTimeouts(): void {
    this.pendingLayoutPassTimeouts.forEach(id => window.clearTimeout(id));
    this.pendingLayoutPassTimeouts = [];
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.scheduleLayoutPass();
  }

  // ============================================================
  // TODO SF-PARITY (da completare in iterazioni successive):
  //
  // - [ ] Custom autocomplete lookup editor (attualmente usa display alias
  //       readonly; in vecchio componente era editor inline con suggest)
  // - [ ] Filtri lookup: creazione template con mapping ID→Label nel popup
  //       filtro Syncfusion (analogo a createLookupFilterTemplate vecchio)
  // - [ ] Pagination UI custom (barra di navigazione server-side con
  //       "go to page", dropdown page size, summary)
  // - [ ] Stili condizionali riga/cella via beforeCellRender + metadata styles
  //       (_metadati__u_i__stili__tabelle / __colonne)
  // - [ ] Date editor custom (Syncfusion ha date ma vanno forzati i format
  //       italiani DD/MM/YYYY)
  // - [ ] Boolean checkbox cell editor (wuicBooleanMode 'boolean' vs 'number')
  // - [ ] Dictionary dropdown editor (dataValidation List con source)
  // - [ ] Persistenza larghezze colonne su resize (metadata server)
  // - [ ] Sort icons injection (Syncfusion ha le sue, ma stile WUIC)
  // - [ ] Filter active indicator (funnel filled)
  // - [ ] Per-column filter visibility (mc_show_in_filters)
  // - [ ] Applicazione corretta di mc_hide_in_list vs mc_hide_in_edit
  // - [ ] Theme sync completo con WUIC light/dark variables
  // - [ ] Context menu: reintrodurre shortcut testuali coerenti col vecchio
  // ============================================================
}
