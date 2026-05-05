import { ChangeDetectorRef, Component, ElementRef, EmbeddedViewRef, EventEmitter, Input, OnDestroy, OnInit, Output, TemplateRef, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { FullCalendarComponent } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core/index.js';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { DataSourceComponent } from '../data-source/data-source.component';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { ChartModule } from 'primeng/chart';
import type { UIChart } from 'primeng/chart';
import { TranslateModule } from '@ngx-translate/core';

import { ResultInfo } from '../../class/resultInfo';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { UserInfoService } from '../../service/user-info.service';
import { ActivatedRoute } from '@angular/router';
import { ArchetypeConfiguratorComponent } from '../archetype-configurator/archetype-configurator.component';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';
import { WuicClientException } from '../../exception/WuicClientException';
import { WuicErrorCodes } from '../../exception/WuicErrorCodes';
import { GlobalHandler } from '../../handler/GlobalHandler';

@Component({
  selector: 'wuic-chart-list',
  imports: [ChartModule, TranslateModule, ArchetypeConfiguratorComponent],
  templateUrl: './chart-list.component.html',
  styleUrl: './chart-list.component.css'
})
export class ChartListComponent implements OnInit, OnDestroy, IDataBoundHostComponent {
  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;
  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per hide toolbar; quando true nasconde la toolbar chart.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Evento emesso quando l'utente seleziona un punto/serie nel p-chart.
   */
  @Output() onChartDataSelect = new EventEmitter<any>();
  /**
   * Evento emesso quando viene eseguito il drilldown chart (prima/dopo callback custom metadata).
   */
  @Output() onChartDrillDown = new EventEmitter<{ event: any; clickedItem: any; chartOptions: any; data: any }>();
  /**
   * Evento emesso quando il componente riceve dati validi dal datasource e ricostruisce il dataset chart.
   */
  @Output() onChartDataBound = new EventEmitter<{ metaInfo: MetaInfo; data: any; rawResult: ResultInfo }>();
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per chart ref.
   */
  @ViewChild('chartRef') chartRef?: UIChart;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per chart host ref.
   */
  @ViewChild('chartHostRef') chartHostRef?: ElementRef<HTMLElement>;

  // @ViewChild("fcEventContent") eventContent: TemplateRef<any>;
  // @ViewChild("calendar") calendar: FullCalendarComponent;

  /**
   * Collezione dati per chart options, consumata dal rendering e dalle operazioni del componente.
   */
  chartOptions: any;

  /**
   * Collezione dati per records, consumata dal rendering e dalle operazioni del componente.
   */
  records: any[] = [];

  /**
   * Configurazione di presentazione per content renderers, usata nel rendering del componente.
   */
  private readonly contentRenderers = new Map<string, EmbeddedViewRef<any>>();

  /**
   * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
   */
  metas: MetadatiColonna[];
  /**
   * Proprieta di stato del componente per cols, usata dalla logica interna e dal template.
   */
  cols: any;
  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: boolean = false;
  /**
   * Proprieta di stato del componente per title field, usata dalla logica interna e dal template.
   */
  titleField: string = 'title';
  /**
   * Configurazione di presentazione per item template string, usata nel rendering del componente.
   */
  itemTemplateString: string;

  /**
   * Proprieta di stato del componente per counter, usata dalla logica interna e dal template.
   */
  counter: number = 0;
  /**
   * Configurazione di presentazione per item template, usata nel rendering del componente.
   */
  itemTemplate: typeof DynamicGenericTemplateComponent;
  /**
   * Proprieta di stato del componente per title function, usata dalla logica interna e dal template.
   */
  titleFunction: Function;
  /**
   * Proprieta di stato del componente per basic data, usata dalla logica interna e dal template.
   */
  basicData: any;
  /**
   * Collezione dati per basic options, consumata dal rendering e dalle operazioni del componente.
   */
  basicOptions: any;
  /**
   * Proprieta di stato del componente per data, usata dalla logica interna e dal template.
   */
  data: any;
  /**
   * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
   */
  totalRecords: number = 0;
  /**
   * Proprieta di stato del componente per cutoff value, usata dalla logica interna e dal template.
   */
  cutoffValue: number = 0;
  /**
   * Proprieta di stato del componente per last result info, usata dalla logica interna e dal template.
   */
  lastResultInfo?: ResultInfo;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a show config popup.
   */
  showConfigPopup: boolean = false;
  /**
   * Collezione dati per chart types, consumata dal rendering e dalle operazioni del componente.
   */
  chartTypes: string[] = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter'];
  /**
   * Valore corrente selezionato per selected chart type, usato dai flussi interattivi del componente.
   */
  selectedChartType: string = 'bar';
  /**
   * Collezione dati per legend positions, consumata dal rendering e dalle operazioni del componente.
   */
  legendPositions: string[] = ['top', 'right', 'bottom', 'left'];
  /**
   * Collezione dati per animation easings, consumata dal rendering e dalle operazioni del componente.
   */
  animationEasings: string[] = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeOutQuart'];
  /**
   * Collezione dati per palette presets, consumata dal rendering e dalle operazioni del componente.
   */
  palettePresets: string[] = ['default', 'warm', 'cool', 'pastel'];
  /**
   * Proprieta di stato del componente per ui, usata dalla logica interna e dal template.
   */
  ui = {
    legendDisplay: true,
    legendPosition: 'top',
    titleDisplay: false,
    titleText: '',
    tooltipEnabled: true,
    maintainAspectRatio: false,
    animationDuration: 700,
    animationEasing: 'easeOutQuart',
    sortEnabled: true,
    sortDir: 'desc' as 'asc' | 'desc',
    stacked: false,
    indexAxis: 'x' as 'x' | 'y',
    showGridX: true,
    showGridY: true,
    beginAtZero: false,
    tension: 0.3,
    barThickness: 0,
    cutout: 50,
    palette: 'default'
  };
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a has user chart type override.
   */
  private hasUserChartTypeOverride: boolean = false;
  /**
   * Proprieta di stato del componente per chart bottom padding, usata dalla logica interna e dal template.
   */
  private readonly chartBottomPadding = 16;
  /**
   * Proprieta di stato del componente per chart resize pass delays ms, usata dalla logica interna e dal template.
   */
  private readonly chartResizePassDelaysMs = [60, 220];
  /**
   * Collezione dati per default chart options, consumata dal rendering e dalle operazioni del componente.
   */
  private readonly defaultChartOptions: any;
  /**
   * Collezione dati per meta chart options, consumata dal rendering e dalle operazioni del componente.
   */
  private metaChartOptions: any = {};
  /**
   * Proprieta di stato del componente per theme observer, usata dalla logica interna e dal template.
   */
  private themeObserver?: MutationObserver;
  /**
   * Proprieta di stato del componente per chart resize observer, usata dalla logica interna e dal template.
   */
  private chartResizeObserver?: ResizeObserver;
  /**
   * Proprieta di stato del componente per pending chart resize handle, usata dalla logica interna e dal template.
   */
  private pendingChartResizeHandle?: number;
  /**
   * Collezione dati per pending chart measure timeouts, consumata dal rendering e dalle operazioni del componente.
   */
  private pendingChartMeasureTimeouts: number[] = [];
  /**
   * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
   */
  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: any;
  /**
   * Proprieta di stato del componente per chart host height px, usata dalla logica interna e dal template.
   */
  chartHostHeightPx?: number;

  /**
   * Proprieta di stato del componente per on window resize, usata dalla logica interna e dal template.
   */
  private readonly onWindowResize = () => {
    this.measureAndResizeChart(true);
  };

  /**
   * Proprieta di stato del componente per on window scroll, usata dalla logica interna e dal template.
   */
  private readonly onWindowScroll = () => {
    this.measureAndResizeChart();
  };

  /**
   * Inietta servizi di UI/sessione usati dal componente chart e inizializza
   * le opzioni base del grafico con il tema corrente.
   * @param titleService Servizio Angular `Title`.
   * @param cd `ChangeDetectorRef` per refresh espliciti.
   * @param route Route attiva per ricavare il nome route quando non hardcoded.
   * @param trslSrv Servizio traduzioni per messaggi di conferma/successo.
   * @param userInfo Servizio utente per controlli ruolo admin.
   */
  constructor(private titleService: Title, private cd: ChangeDetectorRef, private route: ActivatedRoute, private trslSrv: TranslationManagerService, private userInfo: UserInfoService) { // , private cd: ChangeDetectorRef
    this.defaultChartOptions = {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {}
    };
    this.basicOptions = this.deepMerge({}, this.defaultChartOptions, this.getThemeChartOptions());
  }

  /**
   * Espone se l'utente corrente ha privilegi amministrativi.
   * @returns `true` se utente admin.
   */

  get isAdmin(): boolean {
    return this.userInfo.isCurrentUserAdmin();
  }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.routeName = this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '';

    this.observeThemeClassChanges();
    this.attachLayoutListeners();
    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource?.value) {
      this.subscribeToDS();
    } else if (this.datasource?.subscribe) {
      this.datasourceReadySubscription?.unsubscribe();
      this.datasourceReadySubscription = this.datasource.subscribe((ds) => {
        if (ds) {
          this.datasourceReadySubscription?.unsubscribe();
          this.datasourceReadySubscription = undefined;
          this.subscribeToDS();
        }
      });
    }
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
    this.themeObserver?.disconnect();
    this.chartResizeObserver?.disconnect();
    this.detachLayoutListeners();
    if (typeof window !== 'undefined' && this.pendingChartResizeHandle) {
      window.cancelAnimationFrame(this.pendingChartResizeHandle);
      this.pendingChartResizeHandle = undefined;
    }
    this.clearPendingChartMeasureTimeouts();
  }

  /**
   * Sottoscrive il `fetchInfo$` del datasource, applica configurazione chart da metadati
   * (tipo/opzioni), aggiorna titolo pagina e prepara dataset/resize del grafico.
   */
  subscribeToDS() {
    this.fetchInfoSubscription?.unsubscribe();
    if (!this.datasource?.value?.fetchInfo$) {
      return;
    }
    this.fetchInfoSubscription = this.datasource.value.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = this.datasource?.value?.route?.value || this.routeName;
      if (info && dataSourceRoute == info.metaInfo?.tableMetadata?.md_route_name) {
        this.metaInfo = info.metaInfo;

        const metaChartOptions = info.metaInfo.tableMetadata.extraProps?.archetypes?.chart?.options || {};
        const metaChartType = info.metaInfo.tableMetadata.extraProps?.archetypes?.chart?.type || "bar";
        this.metaChartOptions = metaChartOptions;

        this.basicOptions = this.deepMerge({}, this.defaultChartOptions, this.getThemeChartOptions(), this.metaChartOptions);
        if (!this.hasUserChartTypeOverride) {
          this.selectedChartType = metaChartType;
        }
        this.refreshChartOptions();
        this.startChartResizeObserver();
        this.scheduleChartResizePasses();

        let title = this.metaInfo.tableMetadata.md_display_string;

        this.titleService.setTitle(title);

        if (info.resultInfo.dato) {
          this.lastResultInfo = info.resultInfo;
          this.totalRecords = this.getTotalForCutoff(info.resultInfo);
          const configuredCutoff = Number(this.metaInfo.tableMetadata.extraProps?.archetypes?.chart?.dataOptions?.cutOffCount || 0);
          this.cutoffValue = configuredCutoff > 0 ? Math.min(configuredCutoff, this.totalRecords || configuredCutoff) : this.totalRecords;
          this.data = this.parseData(info.resultInfo, this.cutoffValue);
          this.onChartDataBound.emit({
            metaInfo: this.metaInfo,
            data: this.data,
            rawResult: info.resultInfo
          });
          this.scheduleChartResizePasses();
        } else {
          this.datasource.value.fetchData();
        }

      }
    });
  }

  /**
 * Verifica una condizione di stato o di validita normalizzando e trasformando collezioni di record.
 * @returns Esito booleano del controllo effettuato dal metodo (true quando la condizione verificata risulta soddisfatta).
 */
  private hasGroupingApplied(): boolean {
    return Array.isArray(this.datasource?.value?.groupInfo) && this.datasource.value.groupInfo.length > 0;
  }

  /**
   * Calcola il totale usato dal cutoff chart scegliendo tra `totalGroups` e `totalRowCount`
   * in base alla presenza di grouping; usa la lunghezza di `dato` come fallback.
   * @param result Risultato datasource corrente.
   * @returns Totale non negativo da usare per limite cutoff.
   */
  private getTotalForCutoff(result: ResultInfo): number {
    const useTotalGroups = this.hasGroupingApplied();
    const groupTotal = Number(result?.totalGroups || 0);
    const rowTotal = Number(result?.totalRowCount || 0);
    const fallbackTotal = Array.isArray(result?.dato) ? result.dato.length : 0;

    const total = useTotalGroups ? (groupTotal || fallbackTotal) : (rowTotal || fallbackTotal);
    return Math.max(0, total);
  }

  /**
   * Esegue il callback di drill-down configurato nei metadati chart
   * passando record cliccato, opzioni chart e dati correnti.
   * @param $event Evento click punto/barra del grafico.
   */
  drillDown($event) {
    this.onChartDataSelect.emit($event);
    let clicked = this.datasource?.value?.resultInfo?.dato?.[$event?.element?.index];
    this.onChartDrillDown.emit({
      event: $event,
      clickedItem: clicked,
      chartOptions: this.chartOptions,
      data: this.data
    });

    if (this.metaInfo.tableMetadata.extraProps?.archetypes?.chart?.drillDown) {
      clicked = this.datasource.value.resultInfo.dato[$event.element.index];
      // `new Function(paramList, body)` richiede il `paramList` come
      // stringa di NOMI separati da virgola — niente type annotations
      // TypeScript (`: any`) che il parser JS nativo non conosce,
      // altrimenti butta "SyntaxError: Arg string terminates parameters early".
      //
      // `utility` e' iniettato come 4 parametro perche' molti drillDown scripts
      // legacy fanno riferimento a `utility.chartDrillDown(...)` senza che il
      // framework abbia mai dichiarato quel namespace → ReferenceError.
      // Passiamo `window.utility` se la host app l'ha definito (crm/wuictest
      // possono estendere via `(window as any).utility = { ... }`), altrimenti
      // forniamo un default minimo con chartDrillDown no-op + log per debug.
      const drillDown = this.metaInfo.tableMetadata.extraProps.archetypes.chart.drillDown;
      const utility = this.resolveDrillDownUtility();
      // skills/sql-injection-defense + skills/typed-localized-exceptions:
      // user-supplied JS dal metadata DEVE passare per runUserCallbackSync
      // → typed `errors.client.user_callback.failed` su throw, niente raw stack.
      const ctx = { archetype: 'chart', route: this.metaInfo?.tableMetadata?.md_route_name };
      if (typeof drillDown === 'string') {
        // Iniettiamo `utility` SOLO nel path string-eval (legacy metadata che fanno
        // riferimento a `utility.chartDrillDown`). Quando drillDown e' gia' una
        // function ref, il caller ha accesso diretto ai suoi imports/closure →
        // non serve iniettare utility (evita anche TS2554 su signature 3-args).
        WtoolboxService.runUserCallbackSync(
          'archetypes.chart.drillDown',
          () => new Function("clickedItem, chartOptions, data, utility", drillDown)(clicked, this.chartOptions, this.data, utility),
          [], ctx
        );
      } else {
        WtoolboxService.runUserCallbackSync(
          'archetypes.chart.drillDown',
          () => drillDown(clicked, this.chartOptions, this.data),
          [], ctx
        );
      }
    }
  }

  /**
   * Ritorna un oggetto `utility` da iniettare nel scope del drillDown script.
   * Prima controlla se l'app host ha definito `window.utility` (pattern
   * legacy): se si', lo usa tel-quel. Altrimenti fornisce un default minimo
   * con `chartDrillDown` no-op che logga il click per debug — senza crash.
   */
  private resolveDrillDownUtility(): any {
    const fromHost = (window as any)?.utility;
    if (fromHost && typeof fromHost === 'object') return fromHost;
    return {
      chartDrillDown: (clickedItem: any, _chartOptions: any, _data: any) => {
        console.warn(
          "[chart-list] drillDown script references 'utility' but host app did not define window.utility. No-op fallback.",
          { clickedItem }
        );
      }
    };
  }

  /**
* Recupera i dati/valori richiesti da `getSeriesValue`.
* @param row Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @param field Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore risolto da `getSeriesValue` in base ai criteri implementati.
*/
  private getSeriesValue(row: any, field: string): any {
    if (!row || !field) {
      return undefined;
    }

    if (row[field] !== undefined) {
      return row[field];
    }

    const aggregateSuffixes = ['_SUM', '_AVG', '_MIN', '_MAX', '_COUNT'];
    for (const suffix of aggregateSuffixes) {
      const key = `${field}${suffix}`;
      if (row[key] !== undefined) {
        return row[key];
      }
    }

    const prefixed = Object.keys(row).find(k => k.startsWith(`${field}_`));
    if (prefixed) {
      return row[prefixed];
    }

    return undefined;
  }

  /**
* Recupera i dati/valori richiesti da `getLabelValue`.
* @param row Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @param field Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore stringa restituito da `getLabelValue`.
*/
  private getLabelValue(row: any, field: string): any {
    if (!row) {
      return '';
    }

    if (field && row[field] !== undefined) {
      return row[field];
    }

    const descriptiveKey = Object.keys(row).find(k => !k.startsWith('__') && k.includes('___') && row[k] !== undefined && row[k] !== null && row[k] !== '');
    if (descriptiveKey) {
      return row[descriptiveKey];
    }

    const firstStringKey = Object.keys(row).find(k => !k.startsWith('__') && typeof row[k] === 'string' && row[k].trim().length > 0);
    if (firstStringKey) {
      return row[firstStringKey];
    }

    const firstKey = Object.keys(row).find(k => !k.startsWith('__'));
    return firstKey ? row[firstKey] : '';
  }

  /**
   * Legge il cutoff da input HTML e lo applica al dataset visualizzato.
   * @param event Evento `input/change`.
   */
  onCutoffChanged(event: Event) {
    const value = Number((event.target as HTMLInputElement)?.value || 0);
    this.applyCutoffValue(value);
  }

  /**
   * Applica il cutoff ricevuto dal controllo numerico/slider.
   * @param value Nuovo limite massimo di elementi da mostrare.
   */
  onCutoffValueChanged(value: number) {
    this.applyCutoffValue(value);
  }

  /**
   * Normalizza il cutoff entro [1, totalRecords], persiste l'opzione in metadata locale
   * e ricostruisce i dati chart se l'ultimo risultato e disponibile.
   * @param value Valore cutoff richiesto.
   */
  private applyCutoffValue(value: number) {
    this.cutoffValue = Math.max(1, Math.min(Number(value || 0), this.totalRecords || Number(value || 0) || 1));
    this.persistChartArchetypeOptions();
    if (this.lastResultInfo) {
      this.data = this.parseData(this.lastResultInfo, this.cutoffValue);
    }
  }

  /**
   * Apre il popup configurazione caricando prima lo stato dal `md_props_bag`.
   */
  openConfigPopup() {
    if (!this.isAdmin) {
      return;
    }
    this.syncChartConfigFromPropsBag();
    this.showConfigPopup = true;
  }

  /**
   * Chiude il popup configurazione chart.
   */
  closeConfigPopup() {
    this.showConfigPopup = false;
  }

  /**
   * Esporta il grafico corrente in PNG usando `toBase64Image()` e download via link temporaneo.
   */
  exportChart() {
    const chart = this.chartRef?.chart;
    if (!chart) {
      return;
    }

    const image = chart.toBase64Image();
    if (!image) {
      return;
    }

    const fileName = `${(this.metaInfo?.tableMetadata?.md_route_name || 'chart')}.png`;
    const link = document.createElement('a');
    link.href = image;
    link.download = fileName;
    link.click();
  }

  /**
   * Handler cambio tipo chart: aggiorna opzioni, persiste la scelta e ricalcola il dataset.
   */
  onChartTypeChanged() {
    this.hasUserChartTypeOverride = true;
    this.refreshChartOptions();
    this.persistChartArchetypeOptions();
    if (this.lastResultInfo) {
      this.data = this.parseData(this.lastResultInfo, this.cutoffValue);
    }
  }

  /**
   * Handler cambio opzioni widget UI: ricalcola opzioni chart, persiste e rigenera dati.
   */
  onWidgetOptionsChanged() {
    this.refreshChartOptions();
    this.persistChartArchetypeOptions();
    if (this.lastResultInfo) {
      this.data = this.parseData(this.lastResultInfo, this.cutoffValue);
    }
  }

  /**
   * Ricompone le opzioni finali del grafico facendo merge tra base/theme/widget
   * e pianifica un resize del canvas.
   */
  // Chart.js + PrimeNG controller registry — la lista deve riflettere i
  // controller registrati di default. Se l'utente configura un type non
  // presente, falliamo PRIMA del render con typed envelope, invece di
  // lasciare propagare il "is not a registered controller" raw da PrimeNG.
  private static readonly KNOWN_CHART_TYPES = new Set([
    'bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar', 'bubble', 'scatter'
  ]);

  private refreshChartOptions() {
    const widgetOptions = this.buildWidgetChartOptions();
    this.chartOptions = this.deepMerge({}, this.basicOptions, widgetOptions);
    this.chartOptions.type = this.selectedChartType || this.chartOptions.type || 'bar';
    // skills/typed-localized-exceptions: pre-validate type per evitare il
    // raw stack PrimeNG `Registry._get` quando type=metadata non noto.
    if (!ChartListComponent.KNOWN_CHART_TYPES.has(this.chartOptions.type)) {
      const exc = new WuicClientException(
        WuicErrorCodes.archetypeInitFailed('chart'),
        {
          archetype: 'chart',
          phase: 'refreshChartOptions',
          route: this.metaInfo?.tableMetadata?.md_route_name,
          innerName: 'UnknownChartType',
          innerMessage: `Chart type '${this.chartOptions.type}' is not a registered controller. Known types: ${Array.from(ChartListComponent.KNOWN_CHART_TYPES).join(', ')}`,
        },
        { surface: 'archetype', targetName: 'ChartListComponent.refreshChartOptions' }
      );
      GlobalHandler.emitClientException(exc);
      // Fallback al default 'bar' per non rompere il render successivo.
      this.chartOptions.type = 'bar';
    }
    this.scheduleChartResize();
  }

  /**
   * Costruisce l'oggetto opzioni Chart.js partendo dai controlli UI
   * (legend/title/tooltip/scales/stacking/cutout/indexAxis/animazione).
   * @returns Opzioni widget da mergeare con base+tema.
   */
  private buildWidgetChartOptions(): any {
    const options: any = {
      maintainAspectRatio: !!this.ui.maintainAspectRatio,
      responsive: true,
      animation: {
        duration: Math.max(0, Number(this.ui.animationDuration || 0)),
        easing: this.ui.animationEasing || 'easeOutQuart',
        // After render: ricalcola spazio disponibile e adatta il canvas.
        onComplete: () => this.onChartAfterRender()
      },
      plugins: {
        legend: {
          display: !!this.ui.legendDisplay,
          position: this.ui.legendPosition || 'top'
        },
        title: {
          display: !!this.ui.titleDisplay,
          text: this.ui.titleText || ''
        },
        tooltip: {
          enabled: !!this.ui.tooltipEnabled
        }
      }
    };

    if (this.isCartesianChart()) {
      options.scales = {
        x: {
          stacked: !!this.ui.stacked,
          grid: { display: !!this.ui.showGridX }
        },
        y: {
          stacked: !!this.ui.stacked,
          beginAtZero: !!this.ui.beginAtZero,
          grid: { display: !!this.ui.showGridY }
        }
      };
    }

    if (this.isBarChart()) {
      options.indexAxis = this.ui.indexAxis || 'x';
    }

    if (this.isDoughnutLikeChart()) {
      options.cutout = `${Math.max(0, Math.min(95, Number(this.ui.cutout || 0)))}%`;
    }

    return options;
  }

  /**
   * Osserva i cambi classe sul root document per intercettare switch tema
   * e rigenerare opzioni colore/layout del grafico.
   */
  private observeThemeClassChanges() {
    const root = document?.documentElement;
    if (!root || typeof MutationObserver === 'undefined') {
      return;
    }

    this.themeObserver = new MutationObserver((mutations) => {
      const classChanged = mutations.some(m => m.type === 'attributes' && m.attributeName === 'class');
      if (!classChanged) {
        return;
      }

      this.basicOptions = this.deepMerge({}, this.defaultChartOptions, this.getThemeChartOptions(), this.metaChartOptions);
      this.refreshChartOptions();
      this.scheduleChartResizePasses();
    });

    this.themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  /**
   * Deriva palette e opzioni visuali chart dalle CSS variables correnti
   * (testo, bordi, tooltip, griglie) con fallback light/dark.
   * @returns Blocco opzioni tema Chart.js.
   */
  private getThemeChartOptions(): any {
    const root = document?.documentElement;
    const style = getComputedStyle(root);
    const darkEnabled = root?.classList?.contains('theme-dark');
    const textColor = (style.getPropertyValue('--text-color') || '').trim() || (darkEnabled ? '#f5f5f5' : '#222222');
    const textColorSecondary = (style.getPropertyValue('--text-color-secondary') || '').trim() || (darkEnabled ? '#d4d4d4' : '#666666');
    const surfaceBorder = (style.getPropertyValue('--surface-border') || '').trim() || (darkEnabled ? '#3f3f46' : '#e5e7eb');
    const tooltipBg = darkEnabled ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.95)';

    return {
      plugins: {
        legend: {
          labels: { color: textColor }
        },
        title: {
          color: textColor
        },
        tooltip: {
          titleColor: textColor,
          bodyColor: textColorSecondary,
          backgroundColor: tooltipBg,
          borderColor: surfaceBorder,
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: { color: textColorSecondary },
          grid: { color: surfaceBorder, drawBorder: false }
        },
        y: {
          ticks: { color: textColorSecondary },
          grid: { color: surfaceBorder, drawBorder: false }
        }
      }
    };
  }

  /**
   * Indica se il tipo chart selezionato usa assi cartesiani.
   * @returns `true` per bar/line/scatter/bubble.
   */
  isCartesianChart(): boolean {
    return ['bar', 'line', 'scatter', 'bubble'].includes(this.selectedChartType);
  }

  /**
   * Indica se il tipo chart usa opzioni tipiche dei grafici lineari.
   * @returns `true` per line/radar.
   */
  isLineLikeChart(): boolean {
    return ['line', 'radar'].includes(this.selectedChartType);
  }

  /**
   * Verifica se il tipo chart corrente e `bar`.
   * @returns `true` se tipo selezionato e bar.
   */
  isBarChart(): boolean {
    return this.selectedChartType === 'bar';
  }

  /**
   * Verifica se il tipo chart e della famiglia doughnut/pie.
   * @returns `true` per doughnut o pie.
   */
  isDoughnutLikeChart(): boolean {
    return ['doughnut', 'pie'].includes(this.selectedChartType);
  }

  /**
* Recupera i dati/valori richiesti da `getPaletteColors`.
* @param count Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Collezione `string[]` derivata dalla trasformazione dei dati nel metodo `getPaletteColors`.
*/
  private getPaletteColors(count: number): string[] {
    const size = Math.max(1, count || 1);
    const repeatToSize = (seed: string[]) => Array.from({ length: size }, (_, i) => seed[i % seed.length]);

    if (this.ui.palette === 'warm') return repeatToSize(['#ef4444', '#f97316', '#f59e0b', '#eab308', '#fb7185']);
    if (this.ui.palette === 'cool') return repeatToSize(['#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e', '#3b82f6']);
    if (this.ui.palette === 'pastel') return repeatToSize(['#93c5fd', '#a7f3d0', '#fde68a', '#fbcfe8', '#c4b5fd']);

    const colors: string[] = [];
    for (let i = 0; i < size; i++) {
      const hue = Math.round((360 / size) * i);
      colors.push(`hsl(${hue}, 72%, 52%)`);
    }
    return colors;
  }

  /**
* Applica aggiornamenti di stato tramite `applyDatasetAppearance` mantenendo coerenti UI e dati.
* @param chartData Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  private applyDatasetAppearance(chartData: any) {
    if (!chartData?.datasets?.length) return;

    chartData.datasets.forEach((ds: any) => {
      const points = Array.isArray(ds?.data) ? ds.data.length : 1;
      const palette = this.getPaletteColors(points);
      if (!ds.backgroundColor) ds.backgroundColor = palette;

      if (this.isLineLikeChart()) {
        ds.tension = Math.max(0, Math.min(1, Number(this.ui.tension || 0)));
      }

      if (this.isBarChart() && Number(this.ui.barThickness || 0) > 0) {
        ds.barThickness = Math.max(1, Number(this.ui.barThickness));
      }
    });
  }

  /**
   * Esegue un merge profondo di oggetti plain:
   * gli array vengono clonati, gli oggetti ricorsivamente uniti, i primitivi sovrascritti.
   * @param target Oggetto destinazione.
   * @param sources Sorgenti da fondere in ordine.
   * @returns Oggetto mergeato.
   */
  private deepMerge(target: any, ...sources: any[]): any {
    const out = target || {};
    for (const source of sources) {
      if (!source || typeof source !== 'object') {
        continue;
      }

      for (const key of Object.keys(source)) {
        const value = source[key];
        if (Array.isArray(value)) {
          out[key] = value.slice();
          continue;
        }

        if (value && typeof value === 'object') {
          const base = (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) ? out[key] : {};
          out[key] = this.deepMerge(base, value);
          continue;
        }

        out[key] = value;
      }
    }

    return out;
  }

  /**
   * Aggiorna in memoria `extraProps.archetypes.chart` con tipo, opzioni widget
   * e valore cutoff, serializzando anche `md_props_bag` locale.
   */
  private persistChartArchetypeOptions() {
    if (!this.metaInfo?.tableMetadata) {
      return;
    }

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {};
    const existingChart = extraProps.archetypes.chart || {};
    const existingDataOptions = existingChart.dataOptions || {};

    extraProps.archetypes.chart = Object.assign({}, existingChart, {
      type: this.selectedChartType,
      options: this.buildWidgetChartOptions(),
      dataOptions: Object.assign({}, existingDataOptions, {
        cutOffCount: this.cutoffValue
      })
    });

    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);
  }

  /**
   * Salva su backend il `md_props_bag` aggiornato per la tabella metadata corrente
   * e invalida la cache route; eseguibile solo da admin.
   */
  async saveChartMetadataPropsBag() {
    if (!this.isAdmin) {
      return;
    }

    if (!this.metaInfo?.tableMetadata?.md_id) {
      return;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!userId) {
      return;
    }

    this.persistChartArchetypeOptions();

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {};
    const existingChart = extraProps.archetypes.chart || {};
    const existingDataOptions = existingChart.dataOptions || {};

    extraProps.archetypes.chart = Object.assign({}, existingChart, {
      type: this.selectedChartType,
      options: this.buildWidgetChartOptions(),
      dataOptions: Object.assign({}, existingDataOptions, {
        cutOffCount: this.cutoffValue
      })
    });

    const mdPropsBag = JSON.stringify(extraProps);
    const currentTableMetadata = await this.loadCurrentTableMetadataRecord(userId);
    if (!currentTableMetadata) {
      return;
    }

    const entity = Object.assign({}, currentTableMetadata, {
      md_props_bag: mdPropsBag,
      __original: currentTableMetadata
    });

    await WtoolboxService.http.post(MetadataProviderService.updateUri, {
      route: MetadataProviderService.metaTableRoute,
      user_id: userId,
      entity: entity
    }).toPromise();

    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = mdPropsBag;

    await WtoolboxService.http.post(MetadataProviderService.flushCacheUri, {
      route: this.metaInfo.tableMetadata.md_route_name
    }).toPromise();

    WtoolboxService.messageNotificationService.add({
      severity: 'success',
      summary: this.trslSrv.instant('success'),
      detail: this.trslSrv.instant('metadata.table_saved')
    });
  }

  /**
   * Mergea extraProps correnti con quelle parseate dal `md_props_bag`,
   * preservando la struttura `archetypes`.
   * @returns Oggetto extraProps mergeato.
   */
  private ensureMergedExtraProps(): any {
    let propsFromBag: any = {};

    try {
      propsFromBag = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}') || {};
    } catch {
      propsFromBag = {};
    }

    const current: any = this.metaInfo?.tableMetadata?.extraProps || {};
    const merged: any = Object.assign({}, propsFromBag, current);
    merged.archetypes = Object.assign({}, propsFromBag?.archetypes || {}, current?.archetypes || {});
    return merged;
  }

  /**
   * Rilegge configurazione chart da `md_props_bag` e la riflette nello stato UI
   * (tipo, opzioni plugin/scales, cutoff, cutout), quindi rigenera le opzioni runtime.
   */
  private syncChartConfigFromPropsBag() {
    const chartFromBag = this.getChartPropsFromPropsBag();
    if (!chartFromBag) {
      return;
    }

    this.selectedChartType = chartFromBag.type || this.selectedChartType;
    this.metaChartOptions = chartFromBag.options || {};
    this.basicOptions = this.deepMerge({}, this.defaultChartOptions, this.getThemeChartOptions(), this.metaChartOptions);

    const opts = chartFromBag.options || {};
    const plugins = opts.plugins || {};
    const scales = opts.scales || {};
    const x = scales.x || {};
    const y = scales.y || {};

    this.ui.legendDisplay = !!(plugins.legend?.display ?? this.ui.legendDisplay);
    this.ui.legendPosition = plugins.legend?.position || this.ui.legendPosition;
    this.ui.titleDisplay = !!(plugins.title?.display ?? this.ui.titleDisplay);
    this.ui.titleText = plugins.title?.text || this.ui.titleText;
    this.ui.tooltipEnabled = !!(plugins.tooltip?.enabled ?? this.ui.tooltipEnabled);
    this.ui.maintainAspectRatio = !!(opts.maintainAspectRatio ?? this.ui.maintainAspectRatio);
    this.ui.animationDuration = Number(opts.animation?.duration ?? this.ui.animationDuration) || this.ui.animationDuration;
    this.ui.animationEasing = opts.animation?.easing || this.ui.animationEasing;
    this.ui.stacked = !!(x.stacked ?? y.stacked ?? this.ui.stacked);
    this.ui.showGridX = !!(x.grid?.display ?? this.ui.showGridX);
    this.ui.showGridY = !!(y.grid?.display ?? this.ui.showGridY);
    this.ui.beginAtZero = !!(y.beginAtZero ?? this.ui.beginAtZero);
    this.ui.indexAxis = opts.indexAxis || this.ui.indexAxis;

    const cutout = String(opts.cutout ?? '').replace('%', '').trim();
    const cutoutNum = Number(cutout);
    if (Number.isFinite(cutoutNum) && cutoutNum >= 0) {
      this.ui.cutout = cutoutNum;
    }

    const cutOffCount = Number(chartFromBag.dataOptions?.cutOffCount || 0);
    if (cutOffCount > 0) {
      this.cutoffValue = Math.min(cutOffCount, this.totalRecords || cutOffCount);
    }

    this.refreshChartOptions();
  }

  /**
   * Applica configurazione archetype ricevuta dal configuratore,
   * aggiorna `md_props_bag` locale e ricostruisce dati/opzioni chart.
   * @param nextConfig Configurazione archetype da mergeare.
   */
  onArchetypeConfigApply(nextConfig: any) {
    if (!nextConfig || !this.metaInfo?.tableMetadata) {
      return;
    }

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {};
    const existingChart = extraProps.archetypes.chart || {};
    extraProps.archetypes.chart = Object.assign({}, existingChart, nextConfig);
    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);

    this.syncChartConfigFromPropsBag();

    if (this.lastResultInfo) {
      this.data = this.parseData(this.lastResultInfo, this.cutoffValue);
    }
  }

  /**
   * Restituisce la configurazione chart attuale preferendo quella serializzata in `md_props_bag`
   * e fallback su `extraProps.archetypes.chart`.
   * @returns Configurazione chart corrente o `null`.
   */
  getChartConfigValue(): any {
    return this.getChartPropsFromPropsBag() || this.metaInfo?.tableMetadata?.extraProps?.archetypes?.chart || null;
  }

  /**
   * Estrae la sezione `archetypes.chart` dal JSON `md_props_bag`.
   * @returns Configurazione chart o `null` se assente/non parseabile.
   */
  private getChartPropsFromPropsBag(): any | null {
    try {
      const parsed = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}');
      return parsed?.archetypes?.chart || null;
    } catch {
      return null;
    }
  }

  /**
* Carica dati e li armonizza per l'uso nel componente usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework, coordinando chiamate verso servizi applicativi.
* @param userId Identificativo tecnico usato per lookup, confronto o aggiornamento mirato.
* @returns Promise che completa il flusso asincrono e restituisce un risultato di tipo `Promise<any | null>`.
*/
  private async loadCurrentTableMetadataRecord(userId: number): Promise<any | null> {
    const payload: any = await WtoolboxService.http.post(
      MetadataProviderService.readUri,
      {
        user_id: userId,
        route: MetadataProviderService.metaTableRoute,
        lookup_table_id: 0,
        SortInfo: [],
        GroupInfo: [],
        PageInfo: { pageSize: 1, currentPage: 1 },
        filterInfo: {
          logic: 'AND',
          filters: [{ field: 'md_id', operatore: 'eq', value: this.metaInfo.tableMetadata.md_id.toString(), fixed: true }]
        },
        logicOperator: 'AND',
        has_server_operation: true,
        aggregates: [],
        columnRestrictionList: [],
        formula_lookup: '',
        mc_id: 0
      }
    ).toPromise();

    return payload?.results?.[0] || null;
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param result Parametro utilizzato dal metodo nel flusso elaborativo.
* @param runtimeCutOff Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(result: ResultInfo, runtimeCutOff?: number) {
    // skills/typed-localized-exceptions: wrap il lifecycle parseData con
    // try/catch → typed `errors.client.archetype.chart.init_failed` (al posto
    // di lasciare propagare uncaught TypeError tipo "datasets.forEach is not
    // a function" → dialog raw stack).
    try {
      return this._parseDataInternal(result, runtimeCutOff);
    } catch (err: any) {
      try { (err as any).__wuicHandled = true; } catch { /* primitive throw */ }
      const innerMessage = err instanceof Error ? err.message
        : (err && typeof err === 'object' && typeof err.message === 'string') ? err.message
        : String(err);
      const exc = new WuicClientException(
        WuicErrorCodes.archetypeInitFailed('chart'),
        {
          archetype: 'chart',
          phase: 'parseData',
          route: this.metaInfo?.tableMetadata?.md_route_name,
          innerName: err?.constructor?.name || (typeof err),
          innerMessage: innerMessage?.slice(0, 500),
        },
        { surface: 'archetype', targetName: 'ChartListComponent.parseData', cause: err }
      );
      GlobalHandler.emitClientException(exc);
      return undefined;
    }
  }

  private _parseDataInternal(result: ResultInfo, runtimeCutOff?: number) {

    let chartData: any;
    // = {
    //   labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    //   datasets: [
    //     {
    //       label: 'Sales',
    //       data: [540, 325, 702, 620],
    //       // backgroundColor: ['rgba(255, 159, 64, 0.2)', 'rgba(75, 192, 192, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(153, 102, 255, 0.2)'],
    //       // borderColor: ['rgb(255, 159, 64)', 'rgb(75, 192, 192)', 'rgb(54, 162, 235)', 'rgb(153, 102, 255)'],
    //       // borderWidth: 1
    //     }
    //   ]
    // };

    if (this.metaInfo.tableMetadata.extraProps?.archetypes?.chart?.dataOptions) {

      let dataOptions = this.metaInfo.tableMetadata.extraProps.archetypes.chart.dataOptions;

      if (dataOptions.getChartData) {

        chartData = typeof dataOptions.getChartData === 'string' ? new Function("data", dataOptions.getChartData)(result) : dataOptions.getChartData(result);

      } else {

        chartData = {
          labels: [],
          datasets: []
        };

        let data = Array.isArray(result[dataOptions.dataProperty]) ? result[dataOptions.dataProperty] : [];
        const groupRows = data.filter((d: any) => d && d.__group_header === 1);
        const chartRows = groupRows.length ? groupRows : data;
        const sortField = dataOptions.datasets?.[0]?.dataField;
        let orderedRows = [...chartRows];

        if (sortField && this.ui.sortEnabled) {
          orderedRows.sort((a, b) => {
            const av = Number(this.getSeriesValue(a, sortField) ?? 0);
            const bv = Number(this.getSeriesValue(b, sortField) ?? 0);
            return this.ui.sortDir === 'asc' ? (av - bv) : (bv - av);
          });
        }

        const effectiveCutOff = Number(runtimeCutOff || dataOptions.cutOffCount || 0);
        if (effectiveCutOff > 0) {
          orderedRows = orderedRows.slice(0, effectiveCutOff);
        }

        chartData.labels = orderedRows.map((d) => this.getLabelValue(d, dataOptions.datasets?.[0]?.labelField));

        dataOptions.datasets.forEach((ds) => {

          if (ds.parseData) {

            chartData.datasets.push(typeof ds.parseData === 'string' ? new Function("data", ds.parseData)(result) : ds.parseData(data));

          } else if (ds.labelField && ds.dataField) {

            let dsInstance: any = {
              label: ds.label,
              // backgroundColor: ds.backgroundColor,
              // borderColor: ds.borderColor,
              // borderWidth: ds.borderWidth
            }

            dsInstance.data = orderedRows.map((d) => this.getSeriesValue(d, ds.dataField));

            if (ds.backgroundColorField) {
              dsInstance.backgroundColor = orderedRows.map((d) => d[ds.backgroundColorField]);
            } else if (ds.generateRandomColor) {
              dsInstance.backgroundColor = orderedRows.map(() => {
                return 'rgba(' + Math.floor(Math.random() * 255) + ',' + Math.floor(Math.random() * 255) + ',' + Math.floor(Math.random() * 255) + ',0.8)';
              });
            }

            if (ds.borderColorField) {
              dsInstance.borderColor = orderedRows.map((d) => d[ds.borderColorField]);
              dsInstance.borderWidth = 1;
            }

            chartData.datasets.push(dsInstance);

          }

        });

        this.applyDatasetAppearance(chartData);

      }

      return chartData;
    }
  }

  /**
   * Inizializza un `ResizeObserver` sul contenitore chart per innescare
   * pass di misura/resize quando il layout cambia dimensione.
   */
  private startChartResizeObserver() {
    if (this.chartResizeObserver || !this.chartHostRef?.nativeElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.chartResizeObserver = new ResizeObserver(() => {
      this.scheduleChartResizePasses();
    });
    // Observe the chart host itself
    this.chartResizeObserver.observe(this.chartHostRef.nativeElement);
    // Also observe the root container (.chart-list-root) — when the filter-bar
    // expands/collapses, it changes the root height but NOT the chart host
    // (which has a fixed px height). Without this, the chart doesn't recalculate.
    const rootEl = this.chartHostRef.nativeElement.closest('.chart-list-root');
    if (rootEl) {
      this.chartResizeObserver.observe(rootEl);
    }
    // Also observe the host element itself (the bounded-repeater content area)
    const hostEl = this.chartHostRef.nativeElement.closest('wuic-chart-list');
    if (hostEl) {
      this.chartResizeObserver.observe(hostEl);
    }
  }

  /**
   * Pianifica un resize canvas nel prossimo frame annullando richieste pendenti.
   */
  private scheduleChartResize() {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.pendingChartResizeHandle) {
      window.cancelAnimationFrame(this.pendingChartResizeHandle);
    }

    this.pendingChartResizeHandle = window.requestAnimationFrame(() => {
      this.pendingChartResizeHandle = undefined;
      this.chartRef?.chart?.resize();
    });
  }

  /**
   * Calcola l'altezza disponibile nel layout e aggiorna `chartHostHeightPx`
   * adattandosi allo spazio reale disponibile.
   */
  private updateChartHostHeight(): boolean {
    if (typeof window === 'undefined' || !this.chartHostRef?.nativeElement) {
      return false;
    }

    const chartHost = this.chartHostRef.nativeElement;

    // Temporarily clear inline height so the layout reflects true available
    // space. Without this, after filter-bar collapse the ancestor rects stay
    // limited by the old (smaller) chart height — circular dependency.
    const prevH = chartHost.style.height;
    const prevMH = chartHost.style.maxHeight;
    chartHost.style.height = '';
    chartHost.style.maxHeight = '';

    const hostRect = chartHost.getBoundingClientRect();
    const hostTop = hostRect.top;
    const layoutContainer = this.getLayoutScrollableContainer(chartHost);
    const layoutBottom = layoutContainer ? layoutContainer.getBoundingClientRect().bottom : window.innerHeight;
    let nextHeight = Math.floor(layoutBottom - hostTop - this.chartBottomPadding);

    // Se c'e un overflow verticale residuo, riduciamo il chart host del delta
    // cosi il contenitore non mostra scrollbar.
    if (layoutContainer) {
      const overflowDelta = layoutContainer.scrollHeight - layoutContainer.clientHeight;
      if (overflowDelta > 0) {
        nextHeight -= overflowDelta;
      }
    }

    // Restore inline styles before updating the binding
    chartHost.style.height = prevH;
    chartHost.style.maxHeight = prevMH;

    nextHeight = Math.max(0, nextHeight);
    if (this.chartHostHeightPx === nextHeight) {
      return false;
    }

    this.chartHostHeightPx = nextHeight;
    return true;
  }

  /**
   * Risale il DOM e ritorna il primo contenitore con overflow verticale gestito
   * (`auto`, `scroll`, `overlay`) usato come viewport di layout.
   * @param startElement Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Contenitore scrollabile trovato o `null`.
   */
  private getLayoutScrollableContainer(startElement: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = startElement.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY || '';
      if ((overflowY.includes('auto') || overflowY.includes('scroll') || overflowY.includes('overlay')) && node.clientHeight > 0) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  /**
   * Esegue un resize immediato e ulteriori pass differiti per gestire transizioni/layout asincroni.
   */
  private scheduleChartResizePasses() {
    if (typeof window === 'undefined') {
      return;
    }

    this.clearPendingChartMeasureTimeouts();
    this.measureAndResizeChart(true);

    this.chartResizePassDelaysMs.forEach((delay) => {
      const handle = window.setTimeout(() => {
        this.measureAndResizeChart();
      }, delay);
      this.pendingChartMeasureTimeouts.push(handle);
    });
  }

  /**
   * Annulla tutti i timeout di misura chart ancora pendenti.
   */
  private clearPendingChartMeasureTimeouts() {
    if (typeof window === 'undefined') {
      return;
    }
    this.pendingChartMeasureTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.pendingChartMeasureTimeouts = [];
  }

  /**
   * Ricalcola spazio disponibile e richiede il resize del grafico.
   */
  private measureAndResizeChart(forceResize: boolean = false) {
    const hostHeightChanged = this.updateChartHostHeight();
    if (forceResize || hostHeightChanged) {
      this.scheduleChartResize();
    }
  }

  /**
   * Hook eseguito al termine del render Chart.js: riallinea l'altezza
   * e ridimensiona solo quando necessario per evitare scrollbar.
   */
  private onChartAfterRender() {
    this.measureAndResizeChart();
  }

  /**
   * Registra listener globali resize/scroll per mantenere il grafico sincronizzato col layout.
   */
  private parentResizeObserver?: ResizeObserver;

  private attachLayoutListeners() {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('scroll', this.onWindowScroll, true);

    // Note: filter-bar toggle dispatches a synthetic window 'resize' event
    // (see filter-bar.component.ts toggleCollapse), so chart height
    // recalculation is already handled by the onWindowResize listener above.
  }

  /**
   * Rimuove i listener globali registrati da `attachLayoutListeners`.
   */
  private detachLayoutListeners() {
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('scroll', this.onWindowScroll, true);
    this.parentResizeObserver?.disconnect();
    this.parentResizeObserver = undefined;
  }
}



