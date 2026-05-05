import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { AutoCompleteModule } from 'primeng/autocomplete';
import type { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { SplitButtonModule } from 'primeng/splitbutton';
import { SelectModule } from 'primeng/select';
import type { MenuItem } from 'primeng/api';
import { SplitterModule } from 'primeng/splitter';
import { AccordionModule } from 'primeng/accordion';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { MonacoEditorModule } from '@materia-ui/ngx-monaco-editor';
import { DataProviderService } from '../../service/data-provider.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { LicenseFeatureService } from '../../service/license-feature.service';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { DataSourceComponent } from '../data-source/data-source.component';
import { FilterBarComponent, MultiDatasourceMeta } from '../filter-bar/filter-bar.component';
import { FilterInfo } from '../../class/filterInfo';
import { ViewBuilderComponent } from './view-builder/view-builder.component';
import type { ViewDefinition } from './view-builder/view-builder.types';
import { getSelectedColumns } from './view-builder/view-builder.types';
import { MetaInfo } from '../../class/metaInfo';
import { WuicClientException } from '../../exception/WuicClientException';
import { WuicErrorCodes } from '../../exception/WuicErrorCodes';
import { GlobalHandler } from '../../handler/GlobalHandler';

type RouteOption = { label: string; value: string; mdId: number | null };
type PivotColumn = { alias: string; realName: string; label: string; dbType: string; uiType: string };
type PivotAxisColumn = PivotColumn & { castDate?: boolean; dateGroupBy?: string };
type PivotValueColumn = PivotColumn & {
  id: string;
  caption: string;
  aggregateFunction: string;
};
type SavedPivotOption = { label: string; value: string; info: any };

@Component({
  selector: 'wuic-pivot-builder',
  imports: [NgClass, FormsModule, AutoCompleteModule, ButtonModule, SplitButtonModule, SelectModule, SplitterModule, AccordionModule, DialogModule, TableModule, Tabs, TabList, Tab, TabPanels, TabPanel, MonacoEditorModule, TranslateModule, DataSourceComponent, FilterBarComponent, ViewBuilderComponent],
  templateUrl: './pivot-builder.component.html',
  styleUrl: './pivot-builder.component.css'
})
export class PivotBuilderComponent implements OnInit, AfterViewInit, OnDestroy {
  activeTab = 0;
  activeFilterPanel: string = 'filters';
  pivotName = '';
  routeOptions: RouteOption[] = [];
  viewDefinition: ViewDefinition | null = null;
  filteredRouteOptions: RouteOption[] = [];
  selectedRouteOption?: RouteOption;
  public selectedRouteName = '';
  selectedRouteMdId: number | null = null;

  sourceColumns: PivotColumn[] = [];
  rowColumns: PivotAxisColumn[] = [];
  columnColumns: PivotAxisColumn[] = [];
  valueColumns: PivotValueColumn[] = [];
  dateGroupByOptions: Array<{ label: string; value: string }> = [];

  aggregateFunction = 'SUM';
  topRows = 300;
  readonly aggregateOptions = [
    { label: 'SUM', value: 'SUM' },
    { label: 'AVG', value: 'AVG' },
    { label: 'MIN', value: 'MIN' },
    { label: 'MAX', value: 'MAX' },
    { label: 'COUNT', value: 'COUNT' }
  ];

  /** True when the view builder has at least one table with selected columns. */
  get hasViewDefinition(): boolean {
    return (this.viewDefinition?.tables?.length ?? 0) >= 1
      && getSelectedColumns(this.viewDefinition).length > 0;
  }

  /** True when enough context exists for pivot actions (Tab 1). */
  get canExecutePivot(): boolean {
    return !this.loadingRouteColumns && !!this.selectedRouteName;
  }

  /** True when enough context for either tab. Used internally. */
  get canExecute(): boolean {
    if (this.hasViewDefinition) return getSelectedColumns(this.viewDefinition).length > 0;
    return this.canExecutePivot;
  }

  generatedSql = '';
  loadingRouteColumns = false;
  generatingSql = false;
  savingConfiguration = false;
  executingQuery = false;
  creatingView = false;
  creatingMaterializedTable = false;
  creatingViewFromDef = false;
  generatingViewDefSql = false;
  executingViewDefQuery = false;
  autoGenerateQuery = false;
  manualSqlMode = false;
  /** Qualified SQL name della view (es. `[dbo].[testw]`) — mostrato nel chip. */
  createdViewName = '';
  /** Route metadata scaffoldata dalla view (es. `testw`) — target del link
   *  "apri in nuovo tab" sul chip createdViewName. Vuoto se la view è stata
   *  creata senza scaffold oppure se il payload del backend non l'ha
   *  restituita (retrocompatibilità). */
  createdViewRoute = '';

  // -----------------------------------------------------------------
  // Tab Pivot Config: view/materialized-table creata dal pivot builder
  // (Create View / Create Materialized Table). Tracciamo nome SQL +
  // route WUIC scaffoldata + tipo, per mostrare un chip cliccabile
  // accanto al split-button "Actions" (pattern identico al chip
  // createdViewName del tab View Builder). Persiste nel payload del
  // savePivotConfiguration e viene ripristinato da
  // loadPersistedPivotConfiguration.
  // -----------------------------------------------------------------
  /** Qualified SQL name dell'oggetto creato dal pivot (es. `dbo.test_view`). */
  pivotCreatedName = '';
  /** Route WUIC scaffoldata (equals viewName/tableName per i pivot create). */
  pivotCreatedRoute = '';
  /** Tipo dell'oggetto creato: 'view' o 'table'. Usato per icona/tooltip. */
  pivotCreatedKind: 'view' | 'table' | '' = '';

  /** True quando la pivot configuration corrente e' stata salvata (ha pivotName). */
  get hasSavedPivot(): boolean {
    return !!(this.pivotName && this.pivotName.trim());
  }

  /** Flag loading per "Delete current pivot" del tab Pivot Config. */
  deletingPivot = false;

  /**
   * Cancella dal backend la pivot configuration corrente (identificata
   * da `pivotName`). Pattern identico a `deleteCurrentViewDefinition`:
   * - Conferma utente (`confirm` se nessun oggetto pivot linked,
   *   `promptDialog` con checkbox "drop linked view/table" se presente);
   * - `deletePivotConfiguration(pivotName)` sul backend;
   * - Opzionale `dropScaffoldedView(pivotCreatedRoute)` per rimuovere
   *   la view/table DB + cleanup metadati;
   * - Reset stato locale (pivotName, pivotCreated*, rowColumns,
   *   columnColumns, valueColumns, generatedSql, ...).
   */
  async deleteCurrentPivotConfiguration(): Promise<void> {
    if (!this.hasSavedPivot) return;
    const name = this.pivotName;
    const hasLinkedObject = !!(this.pivotCreatedRoute && this.pivotCreatedRoute.trim());
    const warningMsg = this.t('pivot_builder.delete_pivot_message', 'The current pivot configuration will be permanently deleted. This action cannot be undone.') + ' "' + name + '"';

    let alsoDropObject = false;
    let linkedKindLabel = '';
    if (hasLinkedObject) {
      linkedKindLabel = this.pivotCreatedKind === 'table'
        ? this.t('pivot_builder.prev_kind_table', 'materialized table')
        : this.t('pivot_builder.prev_kind_view', 'view');
      const confirmed = await WtoolboxService.promptDialog(
        this.t('pivot_builder.delete_pivot_title', 'Delete pivot configuration') + ' "' + name + '"',
        [
          {
            name: 'drop_object',
            caption: this.trslSrv.format(
              this.t('pivot_builder.delete_pivot_drop_linked_{0}_{1}', 'Also drop linked {0} and remove its metadata: {1}'),
              linkedKindLabel, this.pivotCreatedRoute
            ),
            type: 'boolean',
            value: false
          }
        ],
        '520px', 'auto'
      );
      if (!confirmed) return;
      alsoDropObject = !!confirmed?.drop_object?.value;
    } else {
      const confirmed = await WtoolboxService.confirm({
        header: this.t('pivot_builder.delete_pivot_title', 'Delete pivot configuration'),
        message: warningMsg,
        icon: 'pi pi-exclamation-triangle'
      });
      if (!confirmed) return;
    }

    const linkedRoute = this.pivotCreatedRoute;
    this.deletingPivot = true;
    this.rebuildPivotConfigMenuItems();
    try {
      const resp = await this.metaSrv.deletePivotConfiguration(name);
      if (!resp?.ok) {
        throw new Error(resp?.error || this.t('pivot_builder.error_deleting_pivot', 'Error deleting pivot configuration.'));
      }
      // Optional drop del linked object (view o materialized table)
      let dropReport: any = null;
      if (alsoDropObject && linkedRoute) {
        try {
          dropReport = await this.metaSrv.dropScaffoldedView(linkedRoute);
        } catch (dropErr: any) {
          WtoolboxService.messageNotificationService?.add?.({
            severity: 'warn',
            summary: this.t('pivot_builder.summary', 'Pivot builder'),
            detail: this.t('pivot_builder.vb.drop_linked_view_error', 'Linked view could not be dropped.') + ' ' + String(dropErr?.message || '')
          });
        }
      }
      // Reset stato locale pivot
      this.pivotName = '';
      this.pivotCreatedName = '';
      this.pivotCreatedRoute = '';
      this.pivotCreatedKind = '';
      this.rowColumns = [];
      this.columnColumns = [];
      this.valueColumns = [];
      this.generatedSql = '';
      this.queryResultColumns = [];
      this.queryResultRows = [];
      this.persistedFilterInfo = undefined;
      this.persistedSortInfo = undefined;
      // Invalida cache metadata (il backend setMetadataVersion e' gia'
      // stato chiamato da deletePivotConfiguration + dropScaffoldedView)
      try {
        await WtoolboxService.http.post(
          WtoolboxService.appSettings.global_root_url + 'MetaService.invalidateMetadataRuntime',
          {}, { withCredentials: true }
        ).toPromise();
      } catch {}
      let detail = this.t('pivot_builder.pivot_deleted', 'Pivot configuration deleted.') + ' "' + name + '"';
      if (alsoDropObject) {
        const droppedOk = !!dropReport?.dropped_view;
        const metadataOk = !!dropReport?.removed_metadata;
        detail += ' — ' + this.t('pivot_builder.vb.drop_linked_view_done', 'Linked view:') + ' ' +
          (droppedOk ? this.t('pivot_builder.vb.drop_view_ok', 'DB view dropped') : this.t('pivot_builder.vb.drop_view_skip', 'DB view not dropped')) + ', ' +
          (metadataOk ? this.t('pivot_builder.vb.drop_metadata_ok', 'metadata removed') : this.t('pivot_builder.vb.drop_metadata_skip', 'no metadata to remove'));
      }
      WtoolboxService.messageNotificationService?.add?.({ severity: 'success', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail });
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({ severity: 'error', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: String(err?.message || this.t('pivot_builder.error_deleting_pivot', 'Error deleting pivot configuration.')) });
    } finally {
      this.deletingPivot = false;
      this.rebuildPivotConfigMenuItems();
    }
  }

  /**
   * Gestisce la sostituzione di un eventuale oggetto pivot precedente
   * (view o materialized table) legato alla definition corrente quando
   * l'utente clicca Create View / Create Materialized Table.
   *
   * Regole (richiesta esplicita utente):
   * - Stesso nome dell'oggetto esistente → chiediamo conferma "Ricreare?"
   *   e se accettato droppiamo il precedente (drop DB object + cleanup
   *   metadati) prima di procedere col nuovo create.
   * - Nome diverso → avvisiamo che il precedente verra' eliminato
   *   (la definition gestisce UNO solo oggetto scaffoldato alla volta
   *   — niente multi-view associate allo stesso pivot).
   * - Se non c'e' un precedente → no-op, ritorna true.
   *
   * @param newRoute Route/name scelto nel prompt attuale.
   * @returns `true` se si puo' procedere col create, `false` se l'utente
   *   ha annullato.
   */
  private async ensurePrevPivotObjectReplacedIfAny(newRoute: string): Promise<boolean> {
    const prevRoute = String(this.pivotCreatedRoute || '').trim();
    if (!prevRoute) return true; // niente da sostituire
    const prevName = String(this.pivotCreatedName || '').trim() || prevRoute;
    const prevKind = this.pivotCreatedKind === 'table'
      ? this.t('pivot_builder.prev_kind_table', 'materialized table')
      : this.t('pivot_builder.prev_kind_view', 'view');
    const sameName = prevRoute.toLowerCase() === String(newRoute || '').trim().toLowerCase();

    const confirmed = await WtoolboxService.confirm({
      header: sameName
        ? this.t('pivot_builder.replace_prev_same_title', 'Recreate existing pivot object?')
        : this.t('pivot_builder.replace_prev_diff_title', 'Replace existing pivot object?'),
      message: sameName
        ? this.trslSrv.format(
            this.t('pivot_builder.replace_prev_same_message_{0}_{1}', 'The existing {0} "{1}" will be dropped and recreated with the same name. Continue?'),
            prevKind, prevName)
        : this.trslSrv.format(
            this.t('pivot_builder.replace_prev_diff_message_{0}_{1}_{2}', 'The existing {0} "{1}" will be dropped (this definition manages one pivot object at a time) and replaced with "{2}". Continue?'),
            prevKind, prevName, newRoute),
      icon: sameName ? 'pi pi-refresh' : 'pi pi-exclamation-triangle'
    });
    if (!confirmed) return false;

    // Drop + cleanup metadata del precedente (idempotente: gestisce sia
    // view che table lato backend).
    try {
      await this.metaSrv.dropScaffoldedView(prevRoute);
    } catch (err: any) {
      // Non-blocking: avvisa ma prosegui. Il create successivo poi
      // reagirà al TABLE/VIEW_EXISTS nel caso il drop non sia andato
      // a buon fine.
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.vb.drop_linked_view_error', 'Linked view could not be dropped.') + ' ' + String(err?.message || '')
      });
    }
    // Reset stato locale del chip: il nuovo create popolerà i nuovi valori.
    this.pivotCreatedName = '';
    this.pivotCreatedRoute = '';
    this.pivotCreatedKind = '';
    return true;
  }
  draggingColumn?: PivotColumn;
  @ViewChild('nestedSource') nestedSource?: DataSourceComponent;
  @ViewChild('viewBuilderRef') viewBuilderRef?: ViewBuilderComponent;
  pivotDatasource?: DataSourceComponent;
  pivotDatasourceSub?: Subscription;
  persistedFilterInfo?: any;
  persistedSortInfo?: any[];

  readonly pivotRoute$ = new BehaviorSubject<string>('');
  readonly pivotDatasourceRef$ = new BehaviorSubject<DataSourceComponent>(null as any);
  // readonly pivotDatasourceComponentRef$ = new BehaviorSubject<{ component: DataSourceComponent; id: number; name: string; uniqueName: string }>({
  //   component: null as any,
  //   id: 1,
  //   name: 'PIVOT_DATASOURCE',
  //   uniqueName: 'PIVOT_DATASOURCE'
  // });

  showQueryResults = false;
  queryResultColumns: string[] = [];
  queryResultRows: any[] = [];
  private readonly dateOnlyFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' });
  private readonly dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium' });
  reopenPivotDialogVisible = false;
  reopeningPivotList = false;
  savedPivotOptions: SavedPivotOption[] = [];
  reopenDialogSelectedPivotName: string | null = null;

  sqlEditorOptions: any = {
    theme: 'vs-dark',
    language: 'sql',
    automaticLayout: true,
    minimap: { enabled: false },
    readOnly: true
  };

  constructor(
    private dataSrv: DataProviderService,
    private metaSrv: MetadataProviderService,
    private trslSrv: TranslationManagerService,
    private aRoute: ActivatedRoute,
    private licenseFeature: LicenseFeatureService
  ) { }

  /**
   * `true` quando il backend espone `dataDbms='mysql'` (visto via LicenseStatus).
   * Su MySQL il concetto di "schema" SQL Server non esiste: i nomi tabella/view
   * sono per-database, niente prefisso `<schema>.<name>`. La UI nasconde quindi
   * il campo Schema dal prompt "Crea vista pivot" / "Crea tabella materializzata"
   * e il backend gestisce schema vuoto come no-op.
   */
  private isDataMysql(): boolean {
    const snap = this.licenseFeature?.snapshot();
    return String(snap?.dataDbms || '').trim().toLowerCase() === 'mysql';
  }

  t(key: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  private buildDateGroupByOptions(): Array<{ label: string; value: string }> {
    return [
      { label: this.t('pivot_builder.group_by.none', 'No grouping'), value: '' },
      { label: this.t('pivot_builder.group_by.year', 'Year'), value: 'year' },
      { label: this.t('pivot_builder.group_by.month', 'Month'), value: 'month' },
      { label: this.t('pivot_builder.group_by.day', 'Day'), value: 'day' },
      { label: this.t('pivot_builder.group_by.hour', 'Hour'), value: 'hour' },
      { label: this.t('pivot_builder.group_by.minute', 'Minute'), value: 'minute' },
      { label: this.t('pivot_builder.group_by.second', 'Second'), value: 'second' }
    ];
  }

  /** Route of the first table in the View Builder — drives the filter-bar datasource */
  viewBuilderFilterRoute = '';
  viewBuilderFilterMetas: MultiDatasourceMeta[] = [];
  multiDatasourceFilterInfo: FilterInfo | null = null;

  onViewDefinitionChange(def: ViewDefinition | null): void {
    console.log('[PivotBuilder] onViewDefinitionChange', { tables: def?.tables?.length, cols: def?.tables?.map(t => t.columns.filter(c => c.selected).length) });
    this.viewDefinition = def;
    // When the view definition changes and has selected columns,
    // populate sourceColumns for Tab 2 (pivot config).
    if ((def?.tables?.length ?? 0) >= 1) {
      this.sourceColumns = getSelectedColumns(def).map(c => ({
        alias: `${c.tableAlias}__${c.alias}`,
        realName: c.realName,
        label: c.qualifiedLabel,
        dbType: c.dbType,
        uiType: c.uiType,
      }));
      // Build multi-datasource metas for the filter-bar (only when 2+ tables)
      const tablesWithCols = def!.tables.filter(t => t.columns.some(c => c.selected));
      this.viewBuilderFilterMetas = tablesWithCols.length >= 2 ? tablesWithCols.map(t => ({
          tableAlias: t.tableAlias,
          tableCaption: t.caption || t.tableName || t.route,
          metaInfo: this.buildMetaInfoFromViewTable(t)
        })) : [];

      // Also set single-datasource route for backward compat
      const firstRoute = def!.tables[0].route;
      if (firstRoute !== this.viewBuilderFilterRoute) {
        this.viewBuilderFilterRoute = firstRoute;
        this.pivotRoute$.next(firstRoute);
      }
    } else {
      this.viewBuilderFilterRoute = '';
      this.viewBuilderFilterMetas = [];
    }
    if (this.autoGenerateQuery && !this.manualSqlMode && this.hasViewDefinition && !this.generatingViewDefSql) {
      clearTimeout(this.autoGenerateDebounce);
      this.autoGenerateDebounce = setTimeout(() => this.generateSqlFromViewDefinition(), 300);
    }
    // Il menu "Definition" ha voci disabled in base a `hasViewDefinition`
    // → rigenera il model cosi' PrimeNG vede il nuovo stato al prossimo
    // click sul dropdown.
    this.rebuildDefinitionMenuItems();
  }

  async onManualSqlModeChange(enabled: boolean): Promise<void> {
    if (enabled) {
      this.autoGenerateQuery = false;
      this.sqlEditorOptions = { ...this.sqlEditorOptions, readOnly: false };
    } else {
      // Decheck: confirm loss of manual edits
      const confirmed = await WtoolboxService.promptDialog(
        this.t('pivot_builder.vb.disable_manual_sql_title', 'Disable Manual SQL'),
        [
          { name: 'info', caption: this.t('pivot_builder.vb.disable_manual_sql_message', 'Manual changes to the SQL will be lost. The query will be regenerated from the visual definition.'), type: 'label', value: '' }
        ],
        '480px', 'auto'
      );
      if (!confirmed) {
        // Re-check: user cancelled
        this.manualSqlMode = true;
        return;
      }
      this.sqlEditorOptions = { ...this.sqlEditorOptions, readOnly: true };
      // Regenerate SQL from view definition
      if (this.hasViewDefinition) {
        await this.generateSqlFromViewDefinition();
      }
    }
  }

  private autoGenerateDebounce: any = null;

  /** When true, all columns are shown in filter-bar regardless of mc_show_in_filters */
  forceAllColumnsFilterable = false;

  onForceAllColumnsFilterableChange(): void {
    // Re-trigger filter-bar rebuild with updated flag
    if (this.viewDefinition) {
      this.onViewDefinitionChange(this.viewDefinition);
    }
  }

  /** Se true (default) il View Builder applica auto-reflow layout orizzontale
   *  + zoom-to-fit ad ogni drop di tabella. Disabilitabile dal settings menu
   *  quando l'utente vuole controllare manualmente la posizione dei nodi.
   *  Passata giu' via @Input al componente `<wuic-view-builder>`. */
  autoReflowLayout = true;

  /**
   * Settings split-button model (View Builder toolbar).
   * Array STABILE (non getter) ricostruito esplicitamente ad ogni toggle
   * via `rebuildSettingsMenuItems()`: PrimeNG splitbutton binda il model
   * con reference-check, quindi serve nuova reference per aggiornare
   * le icone on/off (`pi pi-check-square` / `pi pi-stop`).
   * Pattern analogo al menu "Azioni designer" (toggle con label + icona).
   */
  settingsMenuItems: MenuItem[] = [];
  /** Settings menu per il tab Pivot Config (= View Builder menu meno `auto_reflow`). */
  pivotSettingsMenuItems: MenuItem[] = [];

  private rebuildSettingsMenuItems(): void {
    const check = (v: boolean) => v ? 'pi pi-check-square' : 'pi pi-stop';
    // Dopo ogni toggle: rebuild di entrambi i menu (View Builder + Pivot
    // Config) perche' condividono lo stato (autoGenerateQuery /
    // manualSqlMode / forceAllColumnsFilterable). Cosi' aprendo il menu
    // dell'altro tab si vede l'icona check/stop aggiornata.
    const rebuildBoth = () => {
      this.rebuildSettingsMenuItems();
      this.rebuildPivotSettingsMenuItems();
    };
    this.settingsMenuItems = [
      {
        label: this.t('pivot_builder.vb.auto_generate', 'Auto-generate query'),
        icon: check(this.autoGenerateQuery),
        disabled: this.manualSqlMode,
        command: () => {
          if (this.manualSqlMode) return;
          this.autoGenerateQuery = !this.autoGenerateQuery;
          rebuildBoth();
          this.triggerAutoGeneratePivotIfNeeded();
        }
      },
      {
        label: this.t('pivot_builder.vb.manual_sql_edit', 'Manual SQL edit'),
        icon: check(this.manualSqlMode),
        command: () => {
          const next = !this.manualSqlMode;
          this.manualSqlMode = next;
          rebuildBoth();
          void this.onManualSqlModeChange(next);
        }
      },
      {
        label: this.t('pivot_builder.vb.force_all_filterable', 'All columns filterable'),
        icon: check(this.forceAllColumnsFilterable),
        command: () => {
          this.forceAllColumnsFilterable = !this.forceAllColumnsFilterable;
          rebuildBoth();
          this.onForceAllColumnsFilterableChange();
        }
      },
      {
        label: this.t('pivot_builder.vb.auto_reflow', 'Auto-reflow layout'),
        icon: check(this.autoReflowLayout),
        command: () => {
          this.autoReflowLayout = !this.autoReflowLayout;
          rebuildBoth();
        }
      }
    ];
  }

  /**
   * Settings menu del tab Pivot Config. Stessi 3 toggle del View Builder
   * meno `auto_reflow` (che e' specifico del canvas rete). Tutti e tre
   * scrivono sugli stessi flag condivisi (`autoGenerateQuery`,
   * `manualSqlMode`, `forceAllColumnsFilterable`) cosi' il comportamento
   * e' coerente tra i due tab.
   */
  private rebuildPivotSettingsMenuItems(): void {
    const check = (v: boolean) => v ? 'pi pi-check-square' : 'pi pi-stop';
    const rebuildBoth = () => {
      this.rebuildSettingsMenuItems();
      this.rebuildPivotSettingsMenuItems();
    };
    this.pivotSettingsMenuItems = [
      {
        label: this.t('pivot_builder.vb.auto_generate', 'Auto-generate query'),
        icon: check(this.autoGenerateQuery),
        disabled: this.manualSqlMode,
        command: () => {
          if (this.manualSqlMode) return;
          this.autoGenerateQuery = !this.autoGenerateQuery;
          rebuildBoth();
          this.triggerAutoGeneratePivotIfNeeded();
        }
      },
      {
        label: this.t('pivot_builder.vb.manual_sql_edit', 'Manual SQL edit'),
        icon: check(this.manualSqlMode),
        command: () => {
          const next = !this.manualSqlMode;
          this.manualSqlMode = next;
          rebuildBoth();
          void this.onManualSqlModeChange(next);
        }
      },
      {
        label: this.t('pivot_builder.vb.force_all_filterable', 'All columns filterable'),
        icon: check(this.forceAllColumnsFilterable),
        command: () => {
          this.forceAllColumnsFilterable = !this.forceAllColumnsFilterable;
          rebuildBoth();
          this.onForceAllColumnsFilterableChange();
        }
      }
    ];
  }

  /** Click sul main button dello split-button Settings del tab Pivot Config. */
  openPivotSettingsMenu(splitBtnRef: any, _event: MouseEvent): void {
    this.openSettingsMenu(splitBtnRef, _event);
  }

  /**
   * Se `autoGenerateQuery && !manualSqlMode && canExecutePivot`, debounce
   * + rigenera la query pivot. Chiamato dopo ogni mutazione degli axes
   * (rows/columns/values) dal tab Pivot Config.
   */
  private autoGeneratePivotDebounce: any = null;
  private triggerAutoGeneratePivotIfNeeded(): void {
    if (!this.autoGenerateQuery || this.manualSqlMode) return;
    if (!this.canExecutePivot) return;
    if (this.generatingSql) return;
    clearTimeout(this.autoGeneratePivotDebounce);
    this.autoGeneratePivotDebounce = setTimeout(() => {
      void this.generatePivotSql();
    }, 300);
  }

  /**
   * Click sul bottone principale dello split-button "Settaggi"/"Definizione":
   * apre il menu a tendina (stesso comportamento del dropdown arrow), non
   * esegue la prima voce.
   *
   * Race-condition PrimeNG 21 (`primeng-splitbutton.mjs:307`):
   * il metodo `onDefaultButtonClick(event)` emette `onClick` e POI chiama
   * `menu.hide()`. Se il nostro handler aprisse il menu in modo sincrono
   * (dentro la subscribe di onClick), `menu.hide()` lo chiuderebbe subito
   * dopo. Quindi posticipiamo l'apertura via `setTimeout(0)` cosi' che
   * `menu.hide()` interno completi prima del nostro `toggle()`.
   *
   * Fallback al DOM-query (`.p-splitbutton-dropdown` / aria-haspopup) se la
   * struttura interna cambia in versioni future.
   */
  openSettingsMenu(splitBtnRef: any, event: MouseEvent): void {
    setTimeout(() => {
      try {
        // Preferred path: chiamata diretta al metodo pubblico del componente.
        if (typeof splitBtnRef?.onDropdownButtonClick === 'function') {
          splitBtnRef.onDropdownButtonClick(event);
          return;
        }
        // Fallback DOM-query (toggla via click sul chevron).
        const host: HTMLElement | undefined =
          splitBtnRef?.el?.nativeElement ??
          splitBtnRef?.containerViewChild?.nativeElement ??
          undefined;
        if (!host) return;
        const dd = host.querySelector(
          'button.p-splitbutton-dropdown, .p-splitbutton-dropdown, button[aria-haspopup="true"], button[aria-haspopup="menu"]'
        ) as HTMLButtonElement | null;
        dd?.click();
      } catch {}
    }, 0);
  }

  private buildMetaInfoFromViewTable(table: any): MetaInfo {
    const mi = new MetaInfo();
    mi.columnMetadata = (table.columns || [])
      .filter((c: any) => c.selected && !c.virtual)
      .map((c: any) => {
        const mc = new MetadatiColonna(c.alias || c.realName);
        mc.mc_real_column_name = c.realName || c.alias;
        mc.mc_display_string_in_view = c.label || c.alias;
        mc.mc_db_column_type = c.dbType || '';
        mc.mc_ui_column_type = c.uiType || '';
        mc.mc_show_in_filters = this.forceAllColumnsFilterable || !!c.showInFilters;
        if (c.lookupEntityName) mc.mc_ui_lookup_entity_name = c.lookupEntityName;
        if (c.lookupDataTextField) mc.mc_ui_lookup_dataTextField = c.lookupDataTextField;
        if (c.lookupDataValueField) mc.mc_ui_lookup_dataValueField = c.lookupDataValueField;
        return mc;
      });
    mi.operators = {};
    mi.columnMetadata.forEach((c: MetadatiColonna) => {
      mi.operators[c.mc_nome_colonna] = 'contains';
    });
    return mi;
  }

  onViewBuilderFilterApplied(): void {
    if (!this.hasViewDefinition || this.generatingViewDefSql) return;
    void this.generateSqlFromViewDefinition();
  }

  onViewBuilderMultiFilterApplied(event: { mode: string; filterInfo: FilterInfo | null }): void {
    this.multiDatasourceFilterInfo = event.filterInfo;
    if (this.autoGenerateQuery) {
      this.generateSqlFromViewDefinition();
    }
  }

  /**
   * Handler "Applica dimensione pagina" del filter-bar pivot. Forza regenerate
   * della SQL preview (con `LIMIT/TOP <pageSize>` se >0, altrimenti senza cap).
   * Senza questo hook, il filter-bar chiamava solo `fetchData()` su `nestedSource`
   * (che e' irrilevante in pivot mode) lasciando la SQL preview stale.
   */
  onViewBuilderPageSizeApplied(_event: { pageSize: number; currentPage: number }): void {
    if (!this.hasViewDefinition || this.generatingViewDefSql) return;
    void this.generateSqlFromViewDefinition();
  }

  /**
   * Handler "Sorting" del filter-bar pivot. Stesso pattern di pageSize: rigenera
   * la SQL preview cosi' la `ORDER BY` proposta riflette la scelta utente.
   * (Il backend `previewViewDefinition` accetta filterInfo ma non un sortInfo
   * dedicato; per ora si limita a regenerate, lasciando il sort al server-side
   * tramite `viewDefinition` se mai cablato. L'hook resta utile per consistency.)
   */
  onViewBuilderSortingApplied(_event: { sortInfo: any[] }): void {
    if (!this.hasViewDefinition || this.generatingViewDefSql) return;
    void this.generateSqlFromViewDefinition();
  }

  /**
   * Handler "Raggruppamento" del filter-bar pivot. Allineato al pattern
   * onViewBuilderFilterApplied / onViewBuilderPageSizeApplied.
   */
  onViewBuilderGroupingChanged(_event: { groupInfo: any[]; aggregationInfo: any[]; action: string }): void {
    if (!this.hasViewDefinition || this.generatingViewDefSql) return;
    void this.generateSqlFromViewDefinition();
  }

  /**
   * Creates a DB VIEW from the multi-table view definition (Tab 0 action).
   * After creation, the scaffolded view appears as a route in Tab 1.
   */
  async createViewFromDefinition(): Promise<void> {
    if (!this.viewDefinition && !this.manualSqlMode) return;
    if (this.manualSqlMode && !this.generatedSql?.trim()) {
      WtoolboxService.messageNotificationService?.add?.({ severity: 'warn', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.sql_editor_empty', 'SQL editor is empty.') });
      return;
    }

    const promptResult = await WtoolboxService.promptDialog(
      'Create DB View',
      [
        { name: 'view_name', caption: 'View name', type: 'text', required: true, value: this.createdViewName?.replace(/^\[.*\]\.\[?/, '').replace(/\]$/, '') || '' },
        { name: 'overwrite', caption: 'Overwrite if exists', type: 'boolean', value: !!this.createdViewName },
      ],
      '480px', '340px'
    );
    if (!promptResult) return;

    const viewName = String(promptResult?.view_name?.value ?? '').trim();
    if (!viewName) return;

    // Manual SQL mode: create view using the SQL from the editor
    if (this.manualSqlMode) {
      this.creatingViewFromDef = true;
      WtoolboxService.isBusy.next(true);
      try {
        const overwrite = !!promptResult?.overwrite?.value;
        const resp = await this.metaSrv.createViewFromDefinition(
          this.viewDefinition || { tables: [], joins: [] },
          viewName, 'dbo', false, 0, overwrite, true,
          this.generatedSql
        );
        if (!resp?.ok) throw new Error(resp?.error || this.t('pivot_builder.vb.error_creating_view', 'Error creating view.'));

        this.createdViewName = String(resp.qualifiedView || `[dbo].[${viewName}]`).trim();
        this.createdViewRoute = String(resp.scaffoldRoute || viewName || '').trim();
        this.rebuildDefinitionMenuItems();
        WtoolboxService.messageNotificationService?.add?.({ severity: 'success', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.view_created_manual', 'View created from manual SQL.') + ' ' + this.createdViewName });

        try {
          await WtoolboxService.http.post(
            WtoolboxService.appSettings.global_root_url + 'MetaService.invalidateMetadataRuntime',
            {}, { withCredentials: true }
          ).toPromise();
        } catch {}
        await this.loadRouteOptions();
        // Auto-select del dropdown route come nel ramo visuale.
        if (this.createdViewRoute) {
          await this.selectScaffoldedRoute(this.createdViewRoute);
        }
        if (this.pivotName) {
          await this.saveViewBuilderDefinition(true);
        } else if (this.createdViewRoute) {
          // Definition non salvata: auto-save silent con nome = route
          // della view appena creata (stessa regola del ramo visuale).
          this.pivotName = this.createdViewRoute;
          await this.saveViewBuilderDefinition(true);
        }
      } catch (err: any) {
        WtoolboxService.messageNotificationService?.add?.({ severity: 'error', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: String(err?.message || this.t('pivot_builder.vb.error_creating_view', 'Error creating view.')) });
      } finally {
        this.creatingViewFromDef = false;
        WtoolboxService.isBusy.next(false);
      }
      return;
    }

    this.creatingViewFromDef = true;
    WtoolboxService.isBusy.next(true);
    try {
      const resp = await this.metaSrv.createViewFromDefinition(
        this.viewDefinition,
        viewName,
        'dbo',
        false,
        0,
        !!promptResult?.overwrite?.value,
        true
      );
      if (!resp?.ok) {
        throw new Error(resp?.error || this.t('pivot_builder.vb.error_creating_view', 'Error creating view.'));
      }
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'success',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.vb.view_created_scaffolded', 'View created.') + ' ' + (resp.qualifiedView || '') + (resp.scaffolded ? ' → route "' + (resp.scaffoldRoute || '') + '"' : '')
      });
      // Flush metadata cache and refresh route list so the new view is selectable in Tab 1
      try {
        await WtoolboxService.http.post(
          WtoolboxService.appSettings.global_root_url + 'MetaService.invalidateMetadataRuntime',
          {}, { withCredentials: true }
        ).toPromise();
      } catch {}
      await this.loadRouteOptions();
      this.generatedSql = resp.sql || '';

      // Track the created view name and auto-save the definition
      this.createdViewName = String(resp.qualifiedView || resp.scaffoldRoute || viewName || '').trim();
      this.createdViewRoute = String(resp.scaffoldRoute || viewName || '').trim();
      this.rebuildDefinitionMenuItems();
      // Auto-select nel dropdown "Select metadata route" del tab Pivot Config
      // la route appena scaffoldata, cosi' le colonne sono in contesto senza
      // che l'utente debba selezionarla manualmente dopo aver creato la view.
      if (this.createdViewRoute) {
        await this.selectScaffoldedRoute(this.createdViewRoute);
      }
      if (this.pivotName) {
        // Re-save the existing definition with the created view name
        await this.saveViewBuilderDefinition(true);
      } else if (this.createdViewRoute) {
        // Definition non ancora salvata: auto-save con lo stesso nome
        // della view scaffoldata (richiesta esplicita utente: "se la
        // definizione corrente non e' salvata ne salva una con lo stesso
        // nome della vista creata"). Pre-imposto pivotName cosi' il save
        // silent non apre il prompt.
        this.pivotName = this.createdViewRoute;
        await this.saveViewBuilderDefinition(true);
      }
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: err?.message || this.t('pivot_builder.vb.error_creating_view', 'Error creating view.')
      });
    } finally {
      this.creatingViewFromDef = false;
      WtoolboxService.isBusy.next(false);
    }
  }

  /**
   * Calls the backend to generate a SELECT SQL from the ViewDefinition
   * (generate only, no execution).
   */
  async generateSqlFromViewDefinition(): Promise<void> {
    if (this.manualSqlMode) return;
    if (!this.viewDefinition?.tables?.length) return;
    this.generatingViewDefSql = true;
    try {
      const ds = this.nestedSource;
      // Allinea il maxRows del SQL preview al pageSize impostato dalla filter-bar
      // del pivot ("Dimensione pagina"). pageSize=0 (Illimitato) → server salta TOP/LIMIT.
      // Hardcoded 0 prima → il preview non mostrava mai LIMIT anche dopo "Applica dimensione".
      const dsPageSize = Number(ds?.pageSize ?? 0);
      const previewMaxRows = dsPageSize > 0 ? dsPageSize : 0;
      const resp = await this.metaSrv.previewViewDefinition(this.viewDefinition, previewMaxRows, true, this.multiDatasourceFilterInfo ?? ds?.filterInfo ?? null);
      if (!resp?.ok) {
        throw new Error(resp?.error || this.t('pivot_builder.vb.error_generating_query', 'Error generating query.'));
      }
      this.generatedSql = String(resp?.sql || '').trim();
      this.showQueryResults = false;
    } catch (err: any) {
      this.generatedSql = '';
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.vb.error_generating_query', 'Error generating query.'))
      });
    } finally {
      this.generatingViewDefSql = false;
    }
  }

  /**
   * Calls the backend to generate and execute the SELECT query.
   */
  async executeViewDefinitionQuery(): Promise<void> {
    if (!this.viewDefinition?.tables?.length && !this.manualSqlMode) return;
    if (this.manualSqlMode && !this.generatedSql?.trim()) {
      WtoolboxService.messageNotificationService?.add?.({ severity: 'warn', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.sql_editor_empty', 'SQL editor is empty.') });
      return;
    }
    // Execute Query: se NON siamo in manual SQL edit, rigenera sempre
    // la query dal view definition corrente prima di eseguire. Cosi'
    // l'utente non deve premere Generate → Execute separatamente e la
    // query eseguita rispecchia sempre l'ultimo stato del canvas.
    // In manualSqlMode la SQL nel Monaco editor e' pilotata dall'utente
    // → non la sovrascriviamo.
    if (!this.manualSqlMode && this.hasViewDefinition) {
      await this.generateSqlFromViewDefinition();
    }
    this.executingViewDefQuery = true;
    try {
      const ds = this.nestedSource;
      const manualSql = this.manualSqlMode ? this.generatedSql : undefined;
      // pageSize=0 (sentinel "Illimitato" dalla filter-bar) → niente cap; il server
      // (`MetaService.previewViewDefinition`) salta TOP/LIMIT.
      // Hardcoded 200 prima → ora rispettiamo il pageSize impostato dall'utente
      // tramite la filter-bar del pivot (datasource.pageSize).
      const dsPageSize = Number(ds?.pageSize ?? 0);
      const maxRows = dsPageSize > 0 ? dsPageSize : 0;
      const resp = await this.metaSrv.previewViewDefinition(
        this.viewDefinition || { tables: [], joins: [] }, maxRows, false,
        this.multiDatasourceFilterInfo ?? ds?.filterInfo ?? null,
        manualSql
      );
      if (!resp?.ok) {
        throw new Error(resp?.error || this.t('pivot_builder.vb.error_executing_query', 'Error executing query.'));
      }
      this.queryResultColumns = Array.isArray(resp?.columns) ? resp.columns.map((x: any) => String(x)) : [];
      this.queryResultRows = Array.isArray(resp?.rows) ? resp.rows : [];
      // In manual mode, don't overwrite the editor content with the server response
      if (!this.manualSqlMode) {
        this.generatedSql = String(resp?.sql || this.generatedSql || '');
      }
      this.showQueryResults = true;
    } catch (err: any) {
      this.queryResultColumns = [];
      this.queryResultRows = [];
      this.showQueryResults = false;
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.vb.error_executing_query', 'Error executing query.'))
      });
    } finally {
      this.executingViewDefQuery = false;
    }
  }

  async ngOnInit(): Promise<void> {
    this.dateGroupByOptions = this.buildDateGroupByOptions();
    this.rebuildSettingsMenuItems();
    this.rebuildPivotSettingsMenuItems();
    this.rebuildDefinitionMenuItems();
    this.rebuildPivotConfigMenuItems();
    // this.pivotDatasourceSub = this.pivotDatasourceComponentRef$.subscribe((ref) => {
    //   if (ref?.component && this.pivotDatasource !== ref.component) {
    //     this.pivotDatasource = ref.component;
    //     this.pivotDatasourceRef$.next(ref.component);
    //     this.applyPersistedGridStateToDatasource();
    //   }
    // });

    await this.loadRouteOptions();

    const routeFromUrl = String(this.aRoute.snapshot?.paramMap?.get('route') || '').trim();
    if (routeFromUrl) {
      const persistedByName = await this.tryLoadPivotByName(routeFromUrl);
      if (persistedByName) {
        return;
      }

      const match = this.routeOptions.find((x) => String(x.value).toLowerCase() === routeFromUrl.toLowerCase());
      if (match) {
        this.selectedRouteOption = match;
        await this.selectRoute(match.value, match.mdId);
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.nestedSource && this.pivotDatasource !== this.nestedSource) {
      this.pivotDatasource = this.nestedSource;
      this.pivotDatasourceRef$.next(this.nestedSource);
      this.applyPersistedGridStateToDatasource();
    }
  }

  async loadRouteOptions(): Promise<void> {
    try {
      const result = await this.dataSrv.selectByRoute(MetadataProviderService.metaTableRoute, [], [], 10000, 1);
      const rows = (result?.dato || []) as any[];
      this.routeOptions = rows
        .filter((row) => !row?.is_system_route && !!String(row?.md_route_name || '').trim())
        .map((row) => {
          const routeName = String(row.md_route_name || '').trim();
          const caption = String(row.mm_display_string || row.md_nome_tabella || routeName).trim();
          const mdId = Number(row.md_id);
          return {
            label: `${caption} (${routeName})`,
            value: routeName,
            mdId: Number.isFinite(mdId) && mdId > 0 ? mdId : null
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      this.filteredRouteOptions = [...this.routeOptions];
    } catch {
      this.routeOptions = [];
      this.filteredRouteOptions = [];
    }
  }

  filterRouteOptions(event: AutoCompleteCompleteEvent): void {
    const query = String(event?.query || '').trim().toLowerCase();
    this.filteredRouteOptions = !query
      ? [...this.routeOptions]
      : this.routeOptions.filter((item) =>
        String(item.label || '').toLowerCase().includes(query)
        || String(item.value || '').toLowerCase().includes(query)
      );
  }

  async onRouteOptionSelected(option: RouteOption): Promise<void> {
    if (!option?.value) {
      return;
    }

    await this.selectRoute(option.value, option.mdId);
  }

  private async selectRoute(routeName: string, mdId?: number | null): Promise<void> {
    this.selectedRouteName = String(routeName || '').trim();
    this.selectedRouteMdId = Number.isFinite(Number(mdId)) && Number(mdId) > 0 ? Number(mdId) : null;
    this.generatedSql = '';
    this.rowColumns = [];
    this.columnColumns = [];
    this.valueColumns = [];
    this.persistedFilterInfo = undefined;
    this.persistedSortInfo = undefined;
    this.pivotRoute$.next(this.selectedRouteName);
    // `canExecutePivot` ora dipende da `selectedRouteName`: le voci del
    // split-button Pivot Actions (Create View / Save Configuration / ...)
    // devono riflettere il nuovo stato enabled.
    this.rebuildPivotConfigMenuItems();

    if (!this.selectedRouteName) {
      this.sourceColumns = [];
      return;
    }

    this.loadingRouteColumns = true;
    // Initial rebuild: while loading, `canExecutePivot` returns false (the
    // gate uses `!loadingRouteColumns`), so the Pivot Actions menu items
    // (Crea vista / Crea tabella / Salva configurazione) become disabled.
    this.rebuildPivotConfigMenuItems();
    try {
      const metadataColumns = await this.metaSrv.getMetadati(this.selectedRouteName);
      this.sourceColumns = this.mapPivotColumns(metadataColumns);
      this.valueColumns = this.sourceColumns.length ? [this.createValueColumn(this.sourceColumns[0])] : [];
      // askConfirmIfFound=true solo sul flusso IMPLICITO (cambio route
      // nell'autoComplete, `this.pivotName` vuoto perché non abbiamo
      // navigato da un URL esplicito né siamo in tryLoadPivotByName).
      // Se `pivotName` è già settato → ripristino diretto (l'utente ha
      // esplicitamente richiesto quella pivot via Open Pivot dialog).
      const isImplicitRouteChange = !this.pivotName;
      await this.loadPersistedPivotConfiguration(this.pivotName || null, isImplicitRouteChange);
    } finally {
      this.loadingRouteColumns = false;
      // CRITICAL: rebuild the menu after the load completes. Without this,
      // the items computed at the top of the function with `loadingRouteColumns=true`
      // stay disabled forever — the user sees Crea vista / Salva configurazione /
      // Crea tabella materializzata greyed out even after the route columns have
      // finished loading and `canExecutePivot` returns true. The menu is computed
      // once on rebuild (PrimeNG MenuItem[] is not reactive), so we must rebuild
      // it explicitly whenever a flag that drives `disabled` flips.
      this.rebuildPivotConfigMenuItems();
    }
  }

  private async tryLoadPivotByName(pivotName: string): Promise<boolean> {
    try {
      const response = await this.metaSrv.loadPivotConfiguration('', null, pivotName);
      if (!response?.ok || !response?.found) {
        return false;
      }

      const routeName = String(response?.route_name || '').trim();
      if (!routeName) {
        return false;
      }

      this.pivotName = String(response?.pivot_name || pivotName).trim();
      const match = this.routeOptions.find((x) => String(x.value).toLowerCase() === routeName.toLowerCase());
      if (match) {
        this.selectedRouteOption = match;
        await this.selectRoute(match.value, match.mdId);
        return true;
      }

      await this.selectRoute(routeName, Number.isFinite(Number(response?.md_id)) ? Number(response?.md_id) : null);
      return true;
    } catch {
      return false;
    }
  }

  private mapPivotColumns(columns: MetadatiColonna[]): PivotColumn[] {
    const map = new Map<string, PivotColumn>();
    (columns || []).forEach((c: MetadatiColonna) => {
      const alias = String(c?.mc_nome_colonna || '').trim();
      if (!alias || c?.mc_ui_column_type === 'button') {
        return;
      }

      const realName = String(c?.mc_real_column_name || alias).trim();
      const label = String(c?.mc_display_string_in_view || alias).trim();
      map.set(alias.toLowerCase(), {
        alias,
        realName,
        label: `${label} (${alias})`,
        dbType: String(c?.mc_db_column_type || ''),
        uiType: String(c?.mc_ui_column_type || '')
      });
    });

    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  onDragStart(event: DragEvent, column: PivotColumn): void {
    this.draggingColumn = column;
    event.dataTransfer?.setData('text/plain', column.alias);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDropToRows(event: DragEvent): void {
    event.preventDefault();
    this.applyDrop('rows');
  }

  onDropToColumns(event: DragEvent): void {
    event.preventDefault();
    this.applyDrop('columns');
  }

  onDropToValues(event: DragEvent): void {
    event.preventDefault();
    this.applyDrop('values');
  }

  addToRows(column: PivotColumn): void {
    this.draggingColumn = column;
    this.applyDrop('rows');
  }

  addToColumns(column: PivotColumn): void {
    this.draggingColumn = column;
    this.applyDrop('columns');
  }

  addToValues(column: PivotColumn): void {
    this.draggingColumn = column;
    this.applyDrop('values');
  }

  private applyDrop(target: 'rows' | 'columns' | 'values'): void {
    const column = this.draggingColumn;
    this.draggingColumn = undefined;
    if (!column) {
      return;
    }

    this.rowColumns = this.rowColumns.filter((x) => x.alias !== column.alias);
    this.columnColumns = this.columnColumns.filter((x) => x.alias !== column.alias);
    if (target !== 'values') {
      this.valueColumns = this.valueColumns.filter((x) => x.alias !== column.alias);
    }

    if (target === 'rows') {
      this.rowColumns = [...this.rowColumns, { ...column, castDate: false, dateGroupBy: '' }];
    } else if (target === 'columns') {
      this.columnColumns = [...this.columnColumns, { ...column, castDate: false, dateGroupBy: '' }];
    } else {
      this.valueColumns = [...this.valueColumns, this.createValueColumn(column)];
    }
    this.triggerAutoGeneratePivotIfNeeded();
  }

  removeFromRows(alias: string): void {
    this.rowColumns = this.rowColumns.filter((x) => x.alias !== alias);
    this.triggerAutoGeneratePivotIfNeeded();
  }

  isAxisDateCastAvailable(column: PivotAxisColumn): boolean {
    const uiType = String((column as any)?.uiType || '').trim().toLowerCase();
    if (uiType === 'date' || uiType === 'datetime') {
      return true;
    }
    const dbType = String(column?.dbType || '').trim().toLowerCase();
    return dbType.includes('date') || dbType.includes('datetime') || dbType.includes('smalldatetime');
  }

  isAxisDateTimeGroupAvailable(column: PivotAxisColumn): boolean {
    const uiType = String((column as any)?.uiType || '').trim().toLowerCase();
    if (uiType === 'date' || uiType === 'datetime') {
      return true;
    }
    const dbType = String(column?.dbType || '').trim().toLowerCase();
    const realName = String(column?.realName || '').trim().toLowerCase();
    return dbType.includes('date')
      || dbType.includes('datetime')
      || dbType.includes('smalldatetime')
      || dbType.includes('datetime2')
      || dbType.includes('datetimeoffset')
      || realName.includes('date')
      || realName.includes('time');
  }

  private normalizeDateGroupBy(groupBy: string | null | undefined): string {
    const normalized = String(groupBy || '').trim().toLowerCase();
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].includes(normalized) ? normalized : '';
  }

  setRowCastDate(alias: string, checked: boolean): void {
    const target = this.rowColumns.find((x) => x.alias === alias);
    if (!target) {
      return;
    }
    target.castDate = this.isAxisDateCastAvailable(target) ? !!checked : false;
    this.triggerAutoGeneratePivotIfNeeded();
  }

  setColumnCastDate(alias: string, checked: boolean): void {
    const target = this.columnColumns.find((x) => x.alias === alias);
    if (!target) {
      return;
    }
    target.castDate = this.isAxisDateCastAvailable(target) ? !!checked : false;
    this.triggerAutoGeneratePivotIfNeeded();
  }

  setRowDateGroupBy(alias: string, groupBy: string): void {
    const target = this.rowColumns.find((x) => x.alias === alias);
    if (!target) {
      return;
    }
    target.dateGroupBy = this.isAxisDateTimeGroupAvailable(target) ? this.normalizeDateGroupBy(groupBy) : '';
    this.triggerAutoGeneratePivotIfNeeded();
  }

  setColumnDateGroupBy(alias: string, groupBy: string): void {
    const target = this.columnColumns.find((x) => x.alias === alias);
    if (!target) {
      return;
    }
    target.dateGroupBy = this.isAxisDateTimeGroupAvailable(target) ? this.normalizeDateGroupBy(groupBy) : '';
    this.triggerAutoGeneratePivotIfNeeded();
  }

  private getRowColumnOptionsPayload(): Array<{ alias: string; castDate: boolean; groupBy: string }> {
    return (this.rowColumns || []).map((x) => ({
      alias: x.alias,
      castDate: this.isAxisDateCastAvailable(x) ? !!x.castDate : false,
      groupBy: this.isAxisDateTimeGroupAvailable(x) ? this.normalizeDateGroupBy(x.dateGroupBy) : ''
    }));
  }

  private getColumnColumnOptionsPayload(): Array<{ alias: string; castDate: boolean; groupBy: string }> {
    return (this.columnColumns || []).map((x) => ({
      alias: x.alias,
      castDate: this.isAxisDateCastAvailable(x) ? !!x.castDate : false,
      groupBy: this.isAxisDateTimeGroupAvailable(x) ? this.normalizeDateGroupBy(x.dateGroupBy) : ''
    }));
  }

  removeFromColumns(alias: string): void {
    this.columnColumns = this.columnColumns.filter((x) => x.alias !== alias);
    this.triggerAutoGeneratePivotIfNeeded();
  }

  removeFromValues(id: string): void {
    this.valueColumns = this.valueColumns.filter((x) => x.id !== id);
    this.triggerAutoGeneratePivotIfNeeded();
  }

  getValueAggregate(id: string): string {
    const target = this.valueColumns.find((x) => x.id === id);
    return this.normalizeAggregate(target?.aggregateFunction);
  }

  setValueAggregate(id: string, aggregate: string): void {
    const target = this.valueColumns.find((x) => x.id === id);
    if (target) {
      target.aggregateFunction = this.normalizeAggregate(aggregate);
      this.triggerAutoGeneratePivotIfNeeded();
    }
  }

  setValueCaption(id: string, caption: string): void {
    const target = this.valueColumns.find((x) => x.id === id);
    if (target) {
      target.caption = String(caption || '').trim() || this.extractDisplayLabel(target.label);
      this.triggerAutoGeneratePivotIfNeeded();
    }
  }

  private normalizeAggregate(aggregate: string | null | undefined): string {
    const normalized = String(aggregate || 'SUM').trim().toUpperCase();
    return ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT'].includes(normalized) ? normalized : 'SUM';
  }

  normalizeTopRows(value: any): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 300;
    }
    if (parsed <= 0) {
      return 0;
    }
    return Math.floor(parsed);
  }

  private extractDisplayLabel(label: string): string {
    const raw = String(label || '').trim();
    const openIdx = raw.lastIndexOf(' (');
    if (openIdx > 0 && raw.endsWith(')')) {
      return raw.substring(0, openIdx).trim();
    }
    return raw;
  }

  private createValueColumn(source: PivotColumn, aggregateFunction?: string, caption?: string): PivotValueColumn {
    const resolvedCaption = String(caption || '').trim() || this.extractDisplayLabel(source.label);
    return {
      ...source,
      id: `${source.alias}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      caption: resolvedCaption,
      aggregateFunction: this.normalizeAggregate(aggregateFunction || this.aggregateFunction)
    };
  }

  /**
   * Cerca + eventualmente ripristina una configurazione pivot salvata.
   *
   * @param requestedPivotName Se specificato, cerca la pivot con quel nome
   *   (path esplicito, es. "Open Pivot" dal dialog). Se null/empty, il
   *   backend fa fallback alla piu' recente pivot salvata per la route
   *   selezionata (route-based lookup).
   * @param askConfirmIfFound Se true e una pivot viene trovata, chiede
   *   conferma all'utente prima di applicarla. Usato dal flusso implicito
   *   (cambio di route nell'autoComplete del tab Pivot Config): l'utente
   *   non deve trovarsi assi pre-popolati senza averli chiesti.
   */
  private async loadPersistedPivotConfiguration(
    requestedPivotName?: string | null,
    askConfirmIfFound: boolean = false
  ): Promise<void> {
    if (!this.selectedRouteName) {
      return;
    }

    try {
      const response = await this.metaSrv.loadPivotConfiguration(this.selectedRouteName, this.selectedRouteMdId, requestedPivotName || null);
      if (!response?.ok || !response?.found) {
        return;
      }
      // Conferma utente per il flusso implicito (cambio route). Il nome
      // della pivot trovata e' mostrato nel messaggio cosi' l'utente
      // sa cosa sta per ripristinare.
      if (askConfirmIfFound) {
        const foundName = String(response?.pivot_name || '').trim();
        const confirmed = await WtoolboxService.confirm({
          header: this.t('pivot_builder.restore_confirm_title', 'Load saved pivot?'),
          message: this.t('pivot_builder.restore_confirm_message', 'A saved pivot configuration exists for this route:')
            + (foundName ? ' "' + foundName + '". ' : ' ')
            + this.t('pivot_builder.restore_confirm_question', 'Do you want to load it?'),
          icon: 'pi pi-question-circle'
        });
        if (!confirmed) {
          // L'utente ha rifiutato: restiamo sullo stato "clean slate"
          // gia' impostato da `selectRoute` (sourceColumns caricate,
          // rowColumns/columnColumns vuoti, valueColumns[0] fallback).
          return;
        }
      }
      this.pivotName = String(response?.pivot_name || requestedPivotName || '').trim();

      const config = this.parseConfig(response?.pivot_config_json);
      const rowAliases = Array.isArray(config?.rowColumns) ? config.rowColumns : [];
      const rowColumnOptions = Array.isArray(config?.rowColumnOptions) ? config.rowColumnOptions : [];
      const columnColumnOptions = Array.isArray(config?.columnColumnOptions) ? config.columnColumnOptions : [];
      const rowCastMap = new Map<string, boolean>(
        rowColumnOptions
          .map((x: any) => ({
            alias: String(x?.alias || '').trim(),
            castDate: !!(x?.castDate ?? x?.castToDate ?? x?.applyDateCast ?? false)
          }))
          .filter((x: any) => !!x.alias)
          .map((x: any) => [x.alias, x.castDate] as [string, boolean])
      );
      const rowGroupByMap = new Map<string, string>(
        rowColumnOptions
          .map((x: any) => ({
            alias: String(x?.alias || '').trim(),
            groupBy: this.normalizeDateGroupBy(x?.groupBy ?? x?.dateGroupBy)
          }))
          .filter((x: any) => !!x.alias)
          .map((x: any) => [x.alias, x.groupBy] as [string, string])
      );
      const colCastMap = new Map<string, boolean>(
        columnColumnOptions
          .map((x: any) => ({
            alias: String(x?.alias || '').trim(),
            castDate: !!(x?.castDate ?? x?.castToDate ?? x?.applyDateCast ?? false)
          }))
          .filter((x: any) => !!x.alias)
          .map((x: any) => [x.alias, x.castDate] as [string, boolean])
      );
      const colGroupByMap = new Map<string, string>(
        columnColumnOptions
          .map((x: any) => ({
            alias: String(x?.alias || '').trim(),
            groupBy: this.normalizeDateGroupBy(x?.groupBy ?? x?.dateGroupBy)
          }))
          .filter((x: any) => !!x.alias)
          .map((x: any) => [x.alias, x.groupBy] as [string, string])
      );
      const columnAliases = Array.isArray(config?.columnColumns) ? config.columnColumns : [];
      const valueAliases = Array.isArray(config?.valueColumns)
        ? config.valueColumns
        : (String(config?.valueColumn || '').trim() ? [String(config.valueColumn).trim()] : []);
      const valueDefinitions = Array.isArray(config?.valueDefinitions) ? config.valueDefinitions : [];
      const legacyValueAggregates = (config?.valueAggregates && typeof config.valueAggregates === 'object')
        ? config.valueAggregates
        : {};

      this.rowColumns = rowAliases
        .map((alias: string) => this.sourceColumns.find((c) => c.alias === alias))
        .filter((c): c is PivotColumn => !!c);
      this.rowColumns = this.rowColumns.map((c) => ({
        ...c,
        castDate: this.isAxisDateCastAvailable(c) ? !!rowCastMap.get(c.alias) : false,
        dateGroupBy: this.isAxisDateTimeGroupAvailable(c) ? this.normalizeDateGroupBy(rowGroupByMap.get(c.alias) || '') : ''
      }));

      this.columnColumns = columnAliases
        .map((alias: string) => this.sourceColumns.find((c) => c.alias === alias))
        .filter((c): c is PivotColumn => !!c)
        .map((c) => ({
          ...c,
          castDate: this.isAxisDateCastAvailable(c) ? !!colCastMap.get(c.alias) : false,
          dateGroupBy: this.isAxisDateTimeGroupAvailable(c) ? this.normalizeDateGroupBy(colGroupByMap.get(c.alias) || '') : ''
        }));

      this.valueColumns = [];

      const loadedAggregate = String(config?.aggregateFunction || '').trim().toUpperCase();
      if (this.aggregateOptions.some((x) => x.value === loadedAggregate)) {
        this.aggregateFunction = loadedAggregate;
      }
      this.topRows = this.normalizeTopRows(config?.topRows ?? 300);

      if (valueDefinitions.length) {
        this.valueColumns = valueDefinitions
          .map((def: any) => {
            const alias = String(def?.alias || '').trim();
            const src = this.sourceColumns.find((c) => c.alias === alias);
            if (!src) {
              return null;
            }
            return this.createValueColumn(src, def?.aggregateFunction, def?.caption);
          })
          .filter((x): x is PivotValueColumn => !!x);
      } else {
        this.valueColumns = valueAliases
          .map((alias: string) => this.sourceColumns.find((c) => c.alias === alias))
          .filter((c): c is PivotColumn => !!c)
          .map((c) => this.createValueColumn(c, legacyValueAggregates?.[c.alias]));
      }
      if (!this.valueColumns.length && this.sourceColumns.length) {
        this.valueColumns = [this.createValueColumn(this.sourceColumns[0])];
      }

      this.persistedFilterInfo = config?.filterInfo || null;
      this.persistedSortInfo = Array.isArray(config?.sortInfo) ? config.sortInfo : [];
      this.applyPersistedGridStateToDatasource();

      // Restore view definition (multi-table view builder state)
      if (config?.viewDefinition?.tables?.length) {
        this.viewDefinition = config.viewDefinition;
        // The view-builder component will restore the graph when it receives
        // the definition via @Input or a method call.
      }

      // Restore del chip "Pivot-created view/table": se la definition
      // aveva linkata una view o una materialized table scaffoldata,
      // deserializziamo i campi cosi' il chip cliccabile si ripopola.
      // Retrocompatibile: payload pre-feature non hanno questi campi
      // → il chip resta hidden.
      this.pivotCreatedName = String(config?.pivotCreatedName || '').trim();
      this.pivotCreatedRoute = String(config?.pivotCreatedRoute || '').trim();
      const kind = String(config?.pivotCreatedKind || '').trim().toLowerCase();
      this.pivotCreatedKind = (kind === 'view' || kind === 'table') ? kind : '';

      this.generatedSql = String(response?.sql_text || '').trim();
      // Rigenera il menu Pivot Actions: ora `hasSavedPivot === true` →
      // voce "Delete current pivot" deve passare a enabled.
      this.rebuildPivotConfigMenuItems();
    } catch {
      // Keep UX resilient: configuration persistence errors must not block route metadata loading.
    }
  }

  private getPivotDatasource(): DataSourceComponent | undefined {
    return this.nestedSource || this.pivotDatasource;
  }

  private applyPersistedGridStateToDatasource(): void {
    const ds = this.getPivotDatasource();
    if (!ds) {
      return;
    }

    if (this.persistedFilterInfo && Array.isArray(this.persistedFilterInfo?.filters)) {
      const logic = String(this.persistedFilterInfo.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
      ds.filterInfo = new FilterInfo(logic, this.deepClone(this.persistedFilterInfo.filters));
    } else if (this.persistedFilterInfo === null) {
      ds.filterInfo = new FilterInfo('AND', []);
    }

    ds.sortInfo = Array.isArray(this.persistedSortInfo)
      ? this.deepClone(this.persistedSortInfo)
      : [];

    ds.currentPage = 1;
    ds.fetchData();
  }

  private deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  formatQueryCellValue(value: any, columnName?: string): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      const parsed = this.tryParseIsoLikeDate(value);
      if (parsed) {
        const groupBy = this.getAxisGroupByForResultColumn(columnName);
        return this.formatDateByGroupBy(parsed, groupBy);
      }
    }

    if (value instanceof Date) {
      const groupBy = this.getAxisGroupByForResultColumn(columnName);
      return this.formatDateByGroupBy(value, groupBy);
    }

    return String(value);
  }

  private tryParseIsoLikeDate(value: string): Date | null {
    const raw = String(value || '').trim();
    if (!raw) {
      return null;
    }

    const isoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?)?$/;
    if (!isoLike.test(raw)) {
      return null;
    }

    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private getAxisGroupByForResultColumn(columnName?: string): string {
    const normalizedName = String(columnName || '').trim();
    if (!normalizedName) {
      return '';
    }

    const normalize = (x: string) => String(x || '').trim().toLowerCase();
    const target = normalize(normalizedName);
    const axisCols = [...(this.rowColumns || []), ...(this.columnColumns || [])];
    const match = axisCols.find((c) => {
      const alias = normalize(c.alias);
      const real = normalize(c.realName);
      const display = normalize(this.extractDisplayLabel(c.label));
      return target === alias || target === real || target === display;
    });

    return this.normalizeDateGroupBy(match?.dateGroupBy);
  }

  private formatDateByGroupBy(value: Date, groupBy: string): string {
    const normalized = this.normalizeDateGroupBy(groupBy);
    switch (normalized) {
      case 'year':
        return new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(value);
      case 'month':
        return new Intl.DateTimeFormat(undefined, { month: '2-digit', year: 'numeric' }).format(value);
      case 'day':
        return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(value);
      case 'hour':
        return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit' }).format(value);
      case 'minute':
        return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value);
      case 'second':
        return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value);
      default: {
        const hasTimePart = value.getHours() !== 0
          || value.getMinutes() !== 0
          || value.getSeconds() !== 0
          || value.getMilliseconds() !== 0;
        return hasTimePart
          ? this.dateTimeFormatter.format(value)
          : this.dateOnlyFormatter.format(value);
      }
    }
  }

  private parseConfig(raw: any): any {
    if (!raw) {
      return {};
    }
    if (typeof raw === 'object') {
      return raw;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (err) {
        // skills/typed-localized-exceptions: distingui "config corrotto" da
        // "config legittimamente vuoto". Senza questo emit l'utente vedeva
        // solo "Nessuna definizione vista trovata" (toast generico) anche
        // quando il pivot_config_json salvato era JSON malformato.
        try {
          GlobalHandler.emitClientException(new WuicClientException(
            WuicErrorCodes.MetadataPropsBagMalformed,
            {
              route:         this.selectedRouteName || 'pivot',
              field:         'pivot_config_json',
              parserMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
              phase:         'pivot.parseConfig',
            },
            { surface: 'component', targetName: 'PivotBuilderComponent.parseConfig', cause: err }
          ));
        } catch { /* noop */ }
        return {};
      }
    }
    return {};
  }

  async generatePivotSql(): Promise<void> {
    if (!this.selectedRouteName) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_route', 'Seleziona una route.')
      });
      return;
    }

    if (!this.columnColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_columns_axis', 'Seleziona almeno una colonna per l’asse colonne.')
      });
      return;
    }

    if (!this.valueColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_value_column', 'Seleziona almeno una colonna valore.')
      });
      return;
    }

    this.generatingSql = true;
    try {
      const ds = this.getPivotDatasource();
      const response = await this.metaSrv.generatePivotQuery(
        this.selectedRouteName,
        this.rowColumns.map((x) => x.alias),
        this.columnColumns.map((x) => x.alias),
        this.valueColumns.map((x) => x.alias),
        this.aggregateFunction,
        this.valueColumns.map((x) => ({ alias: x.alias, aggregateFunction: x.aggregateFunction, caption: x.caption })),
        ds?.filterInfo ?? this.persistedFilterInfo ?? null,
        Array.isArray(ds?.sortInfo) ? ds?.sortInfo : (this.persistedSortInfo ?? []),
        this.getRowColumnOptionsPayload(),
        this.getColumnColumnOptionsPayload(),
        this.topRows
      );

      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.error.generate_query', 'Errore durante la generazione query pivot.')));
      }

      this.generatedSql = String(response?.query || '').trim();
    } catch (err: any) {
      this.generatedSql = '';
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.generate_query', 'Errore durante la generazione query pivot.'))
      });
    } finally {
      this.generatingSql = false;
    }
  }

  async executePivotSql(): Promise<void> {
    if (!this.selectedRouteName) {
      return;
    }

    if (!this.generatedSql?.trim()) {
      await this.generatePivotSql();
      if (!this.generatedSql?.trim()) {
        return;
      }
    }

    this.executingQuery = true;
    try {
      const ds = this.getPivotDatasource();
      const response = await this.metaSrv.executePivotQuery(
        this.selectedRouteName,
        this.rowColumns.map((x) => x.alias),
        this.columnColumns.map((x) => x.alias),
        this.valueColumns.map((x) => x.alias),
        this.aggregateFunction,
        this.valueColumns.map((x) => ({ alias: x.alias, aggregateFunction: x.aggregateFunction, caption: x.caption })),
        ds?.filterInfo ?? this.persistedFilterInfo ?? null,
        Array.isArray(ds?.sortInfo) ? ds?.sortInfo : (this.persistedSortInfo ?? []),
        this.topRows,
        this.getRowColumnOptionsPayload(),
        this.getColumnColumnOptionsPayload()
      );

      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.error.execute_query', 'Errore esecuzione query pivot.')));
      }

      this.queryResultColumns = Array.isArray(response?.columns) ? response.columns.map((x: any) => String(x)) : [];
      this.queryResultRows = Array.isArray(response?.rows) ? response.rows : [];
      this.generatedSql = String(response?.executedSql || this.generatedSql || '');
      this.showQueryResults = true;
    } catch (err: any) {
      this.queryResultColumns = [];
      this.queryResultRows = [];
      this.showQueryResults = false;
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.execute_query', 'Errore esecuzione query pivot.'))
      });
    } finally {
      this.executingQuery = false;
    }
  }

  async createPivotView(): Promise<void> {
    if (!this.selectedRouteName) {
      return;
    }

    if (!this.columnColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_columns_axis', 'Seleziona almeno una colonna per l’asse colonne.')
      });
      return;
    }

    if (!this.valueColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_value_column', 'Seleziona almeno una colonna valore.')
      });
      return;
    }

    // Su MySQL il concetto di schema SQL Server non esiste — il prompt nasconde
    // il campo Schema e il backend riceve string.Empty (gestito come no-op
    // nel ramo `dbms=mysql` di MetaService.createPivotView).
    const isMysql = this.isDataMysql();
    const promptFields: any[] = [
      {
        name: 'create_menu',
        caption: this.t('pivot_builder.prompt.create_menu', 'Crea anche voce menu'),
        type: 'boolean',
        value: false
      }
    ];
    if (!isMysql) {
      promptFields.push({
        name: 'schema_name',
        caption: this.t('schema', 'Schema'),
        type: 'text',
        required: true,
        value: 'dbo'
      });
    }
    promptFields.push({
      name: 'view_name',
      caption: this.t('pivot_builder.prompt.view_name', 'Nome vista'),
      type: 'text',
      required: true,
      value: this.pivotName || `${this.selectedRouteName}_pivot`
    });
    // Scheduler dinamico: disponibile SOLO per Create Materialized Table.
    // Le view (anche pivot) vengono re-interrogate al read e non hanno
    // bisogno di refresh periodico → il flag sarebbe fuorviante qui,
    // quindi omesso dal prompt e forzato a false lato chiamata backend.

    const promptResult = await WtoolboxService.promptDialog(
      this.t('pivot_builder.prompt.create_view.title', 'Crea vista pivot'),
      promptFields,
      '520px',
      'auto'
    );

    if (!promptResult) {
      return;
    }

    // MySQL → schema vuoto (il backend non userà schema-prefix); MSSQL → 'dbo' default.
    const schemaName = isMysql
      ? ''
      : (String(promptResult?.schema_name?.value ?? 'dbo').trim() || 'dbo');
    const defaultViewName = String(this.pivotName || `${this.selectedRouteName}_pivot`).trim() || `${this.selectedRouteName}_pivot`;
    const viewName = String(promptResult?.view_name?.value ?? defaultViewName).trim() || defaultViewName;
    const createMenu = !!promptResult?.create_menu?.value;
    // Scheduler dinamico: non esposto nel prompt di Create View → sempre
    // disattivato per le view, attivo solo su Create Materialized Table.
    const enableDynamicScheduler = false;
    const schedulerFrequency = '';

    // Se la definition ha gia' una view/table pivot scaffoldata, chiedi
    // conferma e droppa (stesso nome = "ricrea", nome diverso = "sostituisci").
    if (!(await this.ensurePrevPivotObjectReplacedIfAny(viewName))) {
      return;
    }

    this.creatingView = true;
    this.rebuildPivotConfigMenuItems();
    // Loading overlay fullscreen: il split-button nasconde il flag di
    // loading dei singoli item (la menu si chiude al click) → usiamo
    // il busy overlay globale standard del framework per dare feedback
    // chiaro all'utente durante la creazione (puo' richiedere secondi).
    WtoolboxService.isBusy.next(true);
    try {
      let response = await this.requestCreatePivotView(
        schemaName,
        createMenu,
        viewName,
        enableDynamicScheduler,
        schedulerFrequency,
        false
      );

      if (!response?.ok && String(response?.errorCode || '').trim().toUpperCase() === 'VIEW_EXISTS') {
        // Sospendiamo l'overlay busy globale durante il prompt di conferma
        // overwrite: altrimenti il confirm dialog sta SOTTO l'overlay e
        // l'utente non puo' interagire con Cancel/Ok (deadlock UI).
        WtoolboxService.isBusy.next(false);
        const confirmed = await WtoolboxService.confirm({
          header: this.t('pivot_builder.confirm.view_exists.header', 'Vista gia esistente'),
          message: this.trslSrv.format(
            this.t('pivot_builder.confirm.view_exists.message_{0}_{1}', 'La vista {0}.{1} esiste gia. Vuoi sovrascriverla?'),
            schemaName,
            viewName
          )
        });

        if (!confirmed) {
          return;
        }

        // Riattiva busy per la seconda creazione (overwrite=true).
        WtoolboxService.isBusy.next(true);
        response = await this.requestCreatePivotView(
          schemaName,
          createMenu,
          viewName,
          enableDynamicScheduler,
          schedulerFrequency,
          true
        );
      }

      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.error.create_view', 'Errore durante la creazione della vista pivot.')));
      }

      const qualifiedView = String(response?.qualifiedView || '').trim() || `${schemaName}.${response?.viewName || ''}`;
      const scaffoldedRoute = String(response?.scaffoldRoute || response?.viewName || viewName || '').trim();
      const schedulerCreated = !!response?.schedulerCreated;
      if (createMenu) {
        this.metaSrv.invalidateMenuByUserIdCache(undefined, true);
        WtoolboxService.menuUpdated.next(true);
      }
      // Traccia oggetto scaffoldato + persisti: chip cliccabile nella
      // toolbar Pivot Config, deserializzato al prossimo Open Pivot.
      this.pivotCreatedName = qualifiedView;
      this.pivotCreatedRoute = scaffoldedRoute;
      this.pivotCreatedKind = 'view';
      // Auto-save della pivot config: se non è già salvata, usa lo
      // stesso nome della view creata (coerente con la regola del tab
      // View Builder). L'utente vede subito la voce Delete abilitata
      // e al prossimo Open Pivot trova il chip collegato.
      if (!this.pivotName && scaffoldedRoute) {
        this.pivotName = scaffoldedRoute;
      }
      try {
        if (this.pivotName) {
          await this.savePivotConfigurationSilent();
        }
      } catch { /* non-blocking: il chip comunque esiste in memoria locale */ }
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'success',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: schedulerCreated
          ? this.trslSrv.format(this.t('pivot_builder.success.view_created_with_scheduler_{0}', 'Vista creata e scaffoldata: {0}. Schedulazione dinamica attivata.'), qualifiedView)
          : this.trslSrv.format(this.t('pivot_builder.success.view_created_{0}', 'Vista creata e scaffoldata: {0}'), qualifiedView)
      });
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.create_view', 'Errore durante la creazione della vista pivot.'))
      });
    } finally {
      this.creatingView = false;
      this.rebuildPivotConfigMenuItems();
      WtoolboxService.isBusy.next(false);
    }
  }

  private async requestCreatePivotView(
    schemaName: string,
    createMenu: boolean,
    viewName: string,
    enableDynamicScheduler: boolean,
    schedulerFrequency: string,
    overwriteIfExists: boolean
  ): Promise<any> {
    const ds = this.getPivotDatasource();
    return await this.metaSrv.createPivotView(
      this.selectedRouteName,
      this.rowColumns.map((x) => x.alias),
      this.columnColumns.map((x) => x.alias),
      this.valueColumns.map((x) => x.alias),
      this.aggregateFunction,
      this.valueColumns.map((x) => ({ alias: x.alias, aggregateFunction: x.aggregateFunction, caption: x.caption })),
      ds?.filterInfo ?? this.persistedFilterInfo ?? null,
      Array.isArray(ds?.sortInfo) ? ds?.sortInfo : (this.persistedSortInfo ?? []),
      this.getRowColumnOptionsPayload(),
      this.getColumnColumnOptionsPayload(),
      schemaName,
      createMenu,
      viewName,
      enableDynamicScheduler,
      schedulerFrequency,
      this.topRows,
      overwriteIfExists
    );
  }

  async createPivotMaterializedTable(): Promise<void> {
    if (!this.selectedRouteName) {
      return;
    }

    if (!this.columnColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_columns_axis', 'Seleziona almeno una colonna per l’asse colonne.')
      });
      return;
    }

    if (!this.valueColumns.length) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.select_value_column', 'Seleziona almeno una colonna valore.')
      });
      return;
    }

    // Stesso pattern di createPivotView: schema field hidden+nullato su MySQL.
    const isMysqlMat = this.isDataMysql();
    const promptFieldsMat: any[] = [
      {
        name: 'create_menu',
        caption: this.t('pivot_builder.prompt.create_menu', 'Crea anche voce menu'),
        type: 'boolean',
        value: false
      }
    ];
    if (!isMysqlMat) {
      promptFieldsMat.push({
        name: 'schema_name',
        caption: this.t('schema', 'Schema'),
        type: 'text',
        required: true,
        value: 'dbo'
      });
    }
    promptFieldsMat.push(
      {
        name: 'table_name',
        caption: this.t('pivot_builder.prompt.table_name', 'Nome tabella'),
        type: 'text',
        required: true,
        value: this.pivotName || `${this.selectedRouteName}_pivot_mat`
      },
      {
        name: 'enable_dynamic_scheduler',
        caption: this.t('pivot_builder.prompt.enable_dynamic_scheduler', 'Crea schedulazione aggiornamento dinamica'),
        type: 'boolean',
        value: false,
        selectionChanged: (record, field, metaInfo, newValue) => {
          const enabled = !!newValue;
          const schedulerField = (metaInfo?.columnMetadata || []).find(x => x?.mc_nome_colonna === 'scheduler_frequency');
          if (schedulerField) {
            schedulerField.mc_hide_in_edit = !enabled;
          }
          if (!enabled && record?.['scheduler_frequency']) {
            record['scheduler_frequency'].next('');
          } else if (enabled && record?.['scheduler_frequency'] && !record['scheduler_frequency'].value) {
            record['scheduler_frequency'].next('hourly');
          }
        }
      },
      {
        name: 'scheduler_frequency',
        caption: this.t('pivot_builder.prompt.scheduler_frequency', 'Periodicita esecuzione'),
        type: 'dictionary',
        value: '',
        hide: true,
        required: false,
        dictionaryData: [
          { label: this.t('pivot_builder.freq.every_5_minutes', 'Ogni 5 minuti'), value: 'every_5_minutes' },
          { label: this.t('pivot_builder.freq.every_15_minutes', 'Ogni 15 minuti'), value: 'every_15_minutes' },
          { label: this.t('pivot_builder.freq.hourly', 'Ogni ora'), value: 'hourly' },
          { label: this.t('pivot_builder.freq.daily', 'Ogni giorno'), value: 'daily' }
        ]
      }
    );

    const promptResult = await WtoolboxService.promptDialog(
      this.t('pivot_builder.prompt.create_materialized_table.title', 'Create materialized Table'),
      promptFieldsMat,
      '520px',
      '72vh'
    );

    if (!promptResult) {
      return;
    }

    const schemaName = isMysqlMat
      ? ''
      : (String(promptResult?.schema_name?.value ?? 'dbo').trim() || 'dbo');
    const defaultTableName = String(this.pivotName || `${this.selectedRouteName}_pivot_mat`).trim() || `${this.selectedRouteName}_pivot_mat`;
    const tableName = String(promptResult?.table_name?.value ?? defaultTableName).trim() || defaultTableName;
    const createMenu = !!promptResult?.create_menu?.value;
    const enableDynamicScheduler = !!promptResult?.enable_dynamic_scheduler?.value;
    const schedulerFrequency = String(promptResult?.scheduler_frequency?.value ?? '').trim();

    // Gestione di un eventuale oggetto pivot precedente (view o materialized
    // table) legato a questa definition — stesse regole di createPivotView.
    if (!(await this.ensurePrevPivotObjectReplacedIfAny(tableName))) {
      return;
    }

    this.creatingMaterializedTable = true;
    this.rebuildPivotConfigMenuItems();
    WtoolboxService.isBusy.next(true);
    try {
      let response = await this.requestCreatePivotMaterializedTable(
        schemaName,
        createMenu,
        tableName,
        enableDynamicScheduler,
        schedulerFrequency,
        false
      );

      if (!response?.ok && String(response?.errorCode || '').trim().toUpperCase() === 'TABLE_EXISTS') {
        // Stesso fix del ramo VIEW_EXISTS: disattiva busy durante il
        // prompt cosi' il confirm dialog e' interagibile.
        WtoolboxService.isBusy.next(false);
        const confirmed = await WtoolboxService.confirm({
          header: this.t('pivot_builder.confirm.table_exists.header', 'Tabella gia esistente'),
          message: this.trslSrv.format(
            this.t('pivot_builder.confirm.table_exists.message_{0}_{1}', 'La tabella {0}.{1} esiste gia. Vuoi sovrascriverla?'),
            schemaName,
            tableName
          )
        });

        if (!confirmed) {
          return;
        }

        WtoolboxService.isBusy.next(true);
        response = await this.requestCreatePivotMaterializedTable(
          schemaName,
          createMenu,
          tableName,
          enableDynamicScheduler,
          schedulerFrequency,
          true
        );
      }

      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.error.create_materialized_table', 'Errore durante la creazione della tabella materializzata.')));
      }

      const qualifiedTable = String(response?.qualifiedTable || '').trim() || `${schemaName}.${response?.tableName || ''}`;
      const scaffoldedRoute = String(response?.scaffoldRoute || response?.tableName || tableName || '').trim();
      const schedulerCreated = !!response?.schedulerCreated;
      if (createMenu) {
        this.metaSrv.invalidateMenuByUserIdCache(undefined, true);
        WtoolboxService.menuUpdated.next(true);
      }

      // Chip cliccabile + auto-save (stessa regola della Create View pivot)
      this.pivotCreatedName = qualifiedTable;
      this.pivotCreatedRoute = scaffoldedRoute;
      this.pivotCreatedKind = 'table';
      if (!this.pivotName && scaffoldedRoute) {
        this.pivotName = scaffoldedRoute;
      }
      try {
        if (this.pivotName) {
          await this.savePivotConfigurationSilent();
        }
      } catch { /* non-blocking */ }

      WtoolboxService.messageNotificationService?.add?.({
        severity: 'success',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: schedulerCreated
          ? this.trslSrv.format(this.t('pivot_builder.success.materialized_table_created_with_scheduler_{0}', 'Tabella materializzata creata: {0}. Schedulazione dinamica attivata.'), qualifiedTable)
          : this.trslSrv.format(this.t('pivot_builder.success.materialized_table_created_{0}', 'Tabella materializzata creata: {0}'), qualifiedTable)
      });
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.create_materialized_table', 'Errore durante la creazione della tabella materializzata.'))
      });
    } finally {
      this.creatingMaterializedTable = false;
      this.rebuildPivotConfigMenuItems();
      WtoolboxService.isBusy.next(false);
    }
  }

  private async requestCreatePivotMaterializedTable(
    schemaName: string,
    createMenu: boolean,
    tableName: string,
    enableDynamicScheduler: boolean,
    schedulerFrequency: string,
    overwriteIfExists: boolean
  ): Promise<any> {
    const ds = this.getPivotDatasource();
    return await this.metaSrv.createPivotMaterializedTable(
      this.selectedRouteName,
      this.rowColumns.map((x) => x.alias),
      this.columnColumns.map((x) => x.alias),
      this.valueColumns.map((x) => x.alias),
      this.aggregateFunction,
      this.valueColumns.map((x) => ({ alias: x.alias, aggregateFunction: x.aggregateFunction, caption: x.caption })),
      ds?.filterInfo ?? this.persistedFilterInfo ?? null,
      Array.isArray(ds?.sortInfo) ? ds?.sortInfo : (this.persistedSortInfo ?? []),
      this.getRowColumnOptionsPayload(),
      this.getColumnColumnOptionsPayload(),
      schemaName,
      createMenu,
      tableName,
      enableDynamicScheduler,
      schedulerFrequency,
      this.topRows,
      overwriteIfExists
    );
  }

  onFilterBarApplied(): void {
    if (!this.selectedRouteName || this.executingQuery || this.generatingSql) {
      return;
    }
    void this.executePivotSql();
  }

  /**
   * Handler "Applica dimensione pagina" del filter-bar di Configurazione Pivot.
   * Il pageSize scelto dall'utente diventa il `topRows` della pivot SQL —
   * sentinel 0 = "Illimitato" → niente cap (server salta TOP/LIMIT).
   * Senza questo wiring il filter-bar emette solo l'evento ma `topRows`
   * non si aggiornava (e il campo input "Top rows" e' stato rimosso dalla UI
   * proprio perche' delegato al pageSize della filter-bar).
   */
  onPivotConfigPageSizeApplied(event: { pageSize: number; currentPage: number }): void {
    if (!this.selectedRouteName) return;
    const ps = Number(event?.pageSize ?? 0);
    this.topRows = Number.isFinite(ps) && ps > 0 ? Math.trunc(ps) : 0;
    if (this.executingQuery || this.generatingSql) return;
    void this.executePivotSql();
  }

  /** Handler sorting filter-bar pivot config: rigenera la pivot SQL. */
  onPivotConfigSortingApplied(_event: { sortInfo: any[] }): void {
    if (!this.selectedRouteName || this.executingQuery || this.generatingSql) return;
    void this.executePivotSql();
  }

  /** Handler grouping filter-bar pivot config: rigenera la pivot SQL. */
  onPivotConfigGroupingChanged(_event: { groupInfo: any[]; aggregationInfo: any[]; action: string }): void {
    if (!this.selectedRouteName || this.executingQuery || this.generatingSql) return;
    void this.executePivotSql();
  }

  async savePivotConfiguration(): Promise<void> {
    if (!this.selectedRouteName) {
      return;
    }

    const suggestedPivotName = String(this.pivotName || this.selectedRouteName || '').trim();
    const promptResult = await WtoolboxService.promptDialog(
      this.t('pivot_builder.prompt.save_configuration.title', 'Salva configurazione pivot'),
      [
        {
          name: 'pivot_name',
          caption: this.t('pivot_builder.prompt.pivot_name', 'Nome pivot'),
          type: 'text',
          required: true,
          value: suggestedPivotName
        }
      ],
      '520px',
      '320px'
    );

    if (!promptResult) {
      return;
    }

    const pivotName = String(promptResult?.pivot_name?.value ?? '').trim();
    if (!pivotName) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.save_cancelled_name_required', 'Salvataggio annullato: nome pivot obbligatorio.')
      });
      return;
    }

    const payload = this.buildPivotConfigPayload(pivotName);

    this.savingConfiguration = true;
    this.rebuildPivotConfigMenuItems();
    try {
      const response = await this.metaSrv.savePivotConfiguration(
        this.selectedRouteName,
        this.selectedRouteMdId,
        payload,
        this.generatedSql,
        pivotName
      );
      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.error.save_configuration', 'Errore salvataggio configurazione pivot.')));
      }
      this.pivotName = String(response?.pivot_name || pivotName).trim();

      WtoolboxService.messageNotificationService?.add?.({
        severity: 'success',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.saved_configuration', 'Configurazione pivot salvata.')
      });
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.save_configuration', 'Errore salvataggio configurazione pivot.'))
      });
    } finally {
      this.savingConfiguration = false;
      this.rebuildPivotConfigMenuItems();
    }
  }

  /**
   * Costruisce il payload completo per `metaSrv.savePivotConfiguration`
   * usato sia dal flusso interattivo `savePivotConfiguration` che
   * dall'auto-save silent dopo Create View / Create Materialized Table.
   * Include anche i campi `pivotCreatedName`/`pivotCreatedRoute`/
   * `pivotCreatedKind` cosi' al prossimo Open Pivot il chip cliccabile
   * che apre `#/<route>/list` viene ripristinato.
   */
  private buildPivotConfigPayload(pivotName: string): any {
    const ds = this.getPivotDatasource();
    return {
      pivotName,
      routeName: this.selectedRouteName,
      mdId: this.selectedRouteMdId,
      rowColumns: this.rowColumns.map((x) => x.alias),
      rowColumnOptions: this.getRowColumnOptionsPayload(),
      columnColumns: this.columnColumns.map((x) => x.alias),
      columnColumnOptions: this.getColumnColumnOptionsPayload(),
      valueColumns: this.valueColumns.map((x) => x.alias),
      valueColumn: this.valueColumns[0]?.alias || '',
      aggregateFunction: this.aggregateFunction,
      topRows: this.topRows,
      valueDefinitions: this.valueColumns.map((x) => ({
        alias: x.alias,
        aggregateFunction: x.aggregateFunction,
        caption: x.caption
      })),
      filterInfo: ds?.filterInfo ? this.deepClone(ds.filterInfo) : null,
      sortInfo: Array.isArray(ds?.sortInfo) ? this.deepClone(ds.sortInfo) : [],
      viewDefinition: this.viewDefinition ?? null,
      // Tracking della view/materialized-table creata dal pivot builder
      // (chip cliccabile accanto al split-button Actions).
      pivotCreatedName: this.pivotCreatedName || undefined,
      pivotCreatedRoute: this.pivotCreatedRoute || undefined,
      pivotCreatedKind: this.pivotCreatedKind || undefined,
    };
  }

  /**
   * Salva la configurazione pivot senza prompt UI. Chiamato dopo
   * Create View / Create Materialized Table quando `this.pivotName`
   * e' gia' stato pre-impostato (di solito = route scaffoldata).
   * No-op se `pivotName` o `selectedRouteName` sono vuoti.
   */
  private async savePivotConfigurationSilent(): Promise<void> {
    if (!this.selectedRouteName || !this.pivotName) return;
    const payload = this.buildPivotConfigPayload(this.pivotName);
    try {
      const response = await this.metaSrv.savePivotConfiguration(
        this.selectedRouteName,
        this.selectedRouteMdId,
        payload,
        this.generatedSql,
        this.pivotName
      );
      if (response?.ok && response?.pivot_name) {
        this.pivotName = String(response.pivot_name).trim();
      }
    } catch {
      // Non-blocking: lo stato locale del chip resta popolato.
    }
  }

  // ------------------------------------------------------------------
  // View Builder Save / Open
  // ------------------------------------------------------------------

  async saveViewBuilderDefinition(silent = false): Promise<void> {
    if (!this.viewDefinition?.tables?.length) return;

    let defName = this.pivotName;

    if (!silent || !defName) {
      const firstRoute = this.viewDefinition.tables[0].route || '';
      const suggestedName = String(this.pivotName || 'view_' + firstRoute || '').trim();

      const promptResult = await WtoolboxService.promptDialog(
        this.t('pivot_builder.vb.save_definition_title', 'Save View Definition'),
        [
          { name: 'def_name', caption: this.t('pivot_builder.vb.definition_name', 'Definition name'), type: 'text', required: true, value: suggestedName }
        ],
        '500px', '280px'
      );
      if (!promptResult) return;

      defName = String(promptResult?.def_name?.value ?? '').trim();
    }
    if (!defName) return;

    this.savingConfiguration = true;
    this.rebuildPivotConfigMenuItems();
    try {
      const firstRoute = this.viewDefinition!.tables[0].route || '';
      const payload = {
        configType: 'view',
        pivotName: defName,
        routeName: firstRoute,
        createdViewName: this.createdViewName || undefined,
        createdViewRoute: this.createdViewRoute || undefined,
        viewDefinition: this.viewDefinition,
        filterInfo: this.multiDatasourceFilterInfo ?? null,
        autoGenerateQuery: this.autoGenerateQuery,
        manualSqlMode: this.manualSqlMode,
        manualSql: this.manualSqlMode ? this.generatedSql : undefined,
        // Toggle aggiuntivi del menu Settaggi: persistiamo l'intero
        // stato del settings split-button in modo che alla riapertura
        // della view definition la UI sia esattamente come l'utente
        // l'ha lasciata.
        forceAllColumnsFilterable: this.forceAllColumnsFilterable,
        autoReflowLayout: this.autoReflowLayout,
      };

      const response = await this.metaSrv.savePivotConfiguration(
        firstRoute,
        this.viewDefinition.tables[0].mdId ?? null,
        payload,
        this.generatedSql || '',
        defName
      );

      if (!response?.ok) {
        throw new Error(String(response?.error || this.t('pivot_builder.vb.error_saving_definition', 'Error saving view definition.')));
      }
      this.pivotName = defName;
      if (!silent) {
        WtoolboxService.messageNotificationService?.add?.({
          severity: 'success',
          summary: this.t('pivot_builder.summary', 'Pivot builder'),
          detail: this.t('pivot_builder.vb.definition_saved', 'View definition saved.') + ' "' + defName + '"'
        });
      }
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || this.t('pivot_builder.vb.error_saving_definition', 'Error saving view definition.'))
      });
    } finally {
      this.savingConfiguration = false;
      // Aggiorna voce "Delete" che dipende da `hasSavedDefinition`
      // (appena abbiamo salvato, `pivotName` ora è popolato → Delete
      // deve passare da disabled a enabled).
      this.rebuildDefinitionMenuItems();
    }
  }

  viewBuilderOpenMode = false;

  /**
   * Seleziona nel dropdown "Select metadata route" del tab Pivot Config
   * la `RouteOption` che matcha la route passata (case-insensitive).
   * Richiede che `loadRouteOptions()` sia stato chiamato di recente cosi'
   * la route scaffoldata e' in `routeOptions`. Triggera `selectRoute(...)`
   * per popolare le colonne nel contesto pivot.
   */
  private async selectScaffoldedRoute(routeName: string): Promise<void> {
    const normalized = String(routeName || '').trim().toLowerCase();
    if (!normalized) return;
    const match = this.routeOptions.find(x => String(x.value).toLowerCase() === normalized);
    if (!match) return;
    this.selectedRouteOption = match;
    try {
      await this.selectRoute(match.value, match.mdId);
    } catch { /* best-effort: lo state UI e' stato comunque impostato */ }
  }

  /** True quando la view definition corrente è stata salvata (ha un pivotName). */
  get hasSavedDefinition(): boolean {
    return !!(this.pivotName && this.pivotName.trim());
  }

  deletingDefinition = false;

  /**
   * Cancella dal backend la view definition corrente (identificata da
   * `pivotName`). Richiede conferma esplicita dell'utente via promptDialog.
   * Dopo la cancellazione svuota lo stato UI (viewDefinition, generatedSql,
   * pivotName, createdViewName) e invalida la cache metadata.
   */
  async deleteCurrentViewDefinition(): Promise<void> {
    if (!this.hasSavedDefinition) return;
    const name = this.pivotName;
    const hasLinkedView = !!(this.createdViewRoute && this.createdViewRoute.trim());
    const warningMsg = this.t('pivot_builder.vb.delete_definition_message', 'The current view definition will be permanently deleted. This action cannot be undone.') + ' "' + name + '"';

    let alsoDropView = false;
    if (hasLinkedView) {
      // Caso con view scaffoldata linked: serve un checkbox opzionale per
      // droppare anche la view DB + cleanup metadata. promptDialog renderizza
      // un input editabile per ogni field (anche per `type: 'label'`) → NON
      // aggiungiamo field "info" inutili. Il warning "cannot be undone" e'
      // implicito dal title del dialog + OK button; il checkbox descrive
      // l'azione aggiuntiva opzionale.
      const confirmed = await WtoolboxService.promptDialog(
        this.t('pivot_builder.vb.delete_definition_title', 'Delete view definition') + ' "' + name + '"',
        [
          {
            name: 'drop_view',
            caption: this.t('pivot_builder.vb.drop_linked_view', 'Also drop linked DB view and remove its metadata:') + ' ' + this.createdViewRoute,
            type: 'boolean',
            value: false
          }
        ],
        '520px', 'auto'
      );
      if (!confirmed) return;
      alsoDropView = !!confirmed?.drop_view?.value;
    } else {
      // Caso semplice: nessuna linked view → confirmDialog PrimeNG standard
      // (message + header, niente input box). API: WtoolboxService.confirm.
      const confirmed = await WtoolboxService.confirm({
        header: this.t('pivot_builder.vb.delete_definition_title', 'Delete view definition'),
        message: warningMsg,
        icon: 'pi pi-exclamation-triangle'
      });
      if (!confirmed) return;
    }
    const linkedRoute = this.createdViewRoute;
    this.deletingDefinition = true;
    try {
      // 1) Cancella la definition salvata
      const resp = await this.metaSrv.deletePivotConfiguration(name);
      if (!resp?.ok) {
        throw new Error(resp?.error || this.t('pivot_builder.vb.error_deleting_definition', 'Error deleting view definition.'));
      }
      // 2) Se richiesto, droppa la view scaffoldata + metadati. Eseguito
      //    dopo il delete della definition per non bloccare quest'ultimo
      //    se il drop fallisse (es. view inesistente, permessi).
      let dropReport: any = null;
      if (alsoDropView && linkedRoute) {
        try {
          dropReport = await this.metaSrv.dropScaffoldedView(linkedRoute);
        } catch (dropErr: any) {
          // Non-blocking: avviso ma proseguiamo col cleanup UI
          WtoolboxService.messageNotificationService?.add?.({
            severity: 'warn',
            summary: this.t('pivot_builder.summary', 'Pivot builder'),
            detail: this.t('pivot_builder.vb.drop_linked_view_error', 'Linked view could not be dropped.') + ' ' + String(dropErr?.message || '')
          });
        }
      }
      // Svuota lo stato locale
      this.pivotName = '';
      this.createdViewName = '';
      this.createdViewRoute = '';
      this.viewDefinition = null;
      this.generatedSql = '';
      this.queryResultColumns = [];
      this.queryResultRows = [];
      this.viewBuilderFilterMetas = [];
      this.viewBuilderFilterRoute = '';
      try { this.viewBuilderRef?.clearDefinition?.(); } catch {}
      // Invalida cache metadata
      try {
        await WtoolboxService.http.post(
          WtoolboxService.appSettings.global_root_url + 'MetaService.invalidateMetadataRuntime',
          {}, { withCredentials: true }
        ).toPromise();
      } catch {}
      this.rebuildDefinitionMenuItems();
      // Messaggio composito: definition deleted + eventuale drop view
      let detail = this.t('pivot_builder.vb.definition_deleted', 'View definition deleted.') + ' "' + name + '"';
      if (alsoDropView) {
        const droppedOk = !!dropReport?.dropped_view;
        const metadataOk = !!dropReport?.removed_metadata;
        detail += ' — ' + this.t('pivot_builder.vb.drop_linked_view_done', 'Linked view:') + ' ' +
          (droppedOk ? this.t('pivot_builder.vb.drop_view_ok', 'DB view dropped') : this.t('pivot_builder.vb.drop_view_skip', 'DB view not dropped')) + ', ' +
          (metadataOk ? this.t('pivot_builder.vb.drop_metadata_ok', 'metadata removed') : this.t('pivot_builder.vb.drop_metadata_skip', 'no metadata to remove'));
      }
      WtoolboxService.messageNotificationService?.add?.({ severity: 'success', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail });
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({ severity: 'error', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: String(err?.message || this.t('pivot_builder.vb.error_deleting_definition', 'Error deleting view definition.')) });
    } finally {
      this.deletingDefinition = false;
      this.rebuildDefinitionMenuItems();
    }
  }

  /**
   * Definition split-button model: raggruppa Create View / Save Definition /
   * Open / Delete (quest'ultima disabilitata se non c'e' una definition
   * salvata). Il main click del split-button apre il menu — l'apertura
   * e' gestita da `openDefinitionMenu()`, stesso pattern del Settaggi menu.
   */
  definitionMenuItems: MenuItem[] = [];

  rebuildDefinitionMenuItems(): void {
    this.definitionMenuItems = [
      {
        label: this.t('pivot_builder.vb.create_view', 'Create View'),
        icon: 'pi pi-database',
        disabled: !this.hasViewDefinition || this.creatingViewFromDef,
        command: () => { void this.createViewFromDefinition(); }
      },
      {
        label: this.t('pivot_builder.vb.save_definition', 'Save Definition'),
        icon: 'pi pi-save',
        disabled: !this.hasViewDefinition || this.savingConfiguration,
        command: () => { void this.saveViewBuilderDefinition(); }
      },
      {
        label: this.t('pivot_builder.vb.open', 'Open'),
        icon: 'pi pi-folder-open',
        disabled: this.reopeningPivotList,
        command: () => { void this.openViewBuilderDefinition(); }
      },
      { separator: true },
      {
        label: this.t('pivot_builder.vb.delete_definition', 'Delete current definition'),
        icon: 'pi pi-trash',
        disabled: !this.hasSavedDefinition || this.deletingDefinition,
        command: () => { void this.deleteCurrentViewDefinition(); }
      }
    ];
  }

  /**
   * Click sul button principale dello split-button "Definition": apre il menu.
   * NB: NON ricostruire `definitionMenuItems` qui — il click al dropdown
   * viene dispatchato sincronamente subito dopo, e il TieredMenu interno
   * aprirebbe con il `[model]` stale (l'Angular change detection non fa
   * in tempo a propagare la nuova array reference). Il rebuild va fatto
   * reattivamente quando cambia lo stato (vedi onViewDefinitionChange,
   * saveViewBuilderDefinition, deleteCurrentViewDefinition).
   */
  openDefinitionMenu(splitBtnRef: any, _event: MouseEvent): void {
    this.openSettingsMenu(splitBtnRef, _event);
  }

  /**
   * Pivot Config split-button model: raggruppa Create View / Create
   * Materialized Table / Save Configuration / Open Pivot del tab
   * Pivot Config. Stesso pattern del Definition split-button.
   * Ricostruito reattivamente quando cambia `canExecutePivot` (via
   * onRouteOptionSelected / selectRoute) o un loading flag termina.
   */
  pivotConfigMenuItems: MenuItem[] = [];

  rebuildPivotConfigMenuItems(): void {
    // Swap icon → spinner quando l'azione corrispondente e' in corso,
    // cosi' nel dropdown aperto si vede lo stato loading della voce.
    // MenuItem non ha un flag `loading` nativo in PrimeNG 21 — usiamo
    // `pi pi-spin pi-spinner` come icona per imitare il `[loading]` di
    // p-button.
    this.pivotConfigMenuItems = [
      {
        label: this.t('pivot_builder.create_view', 'Create View'),
        icon: this.creatingView ? 'pi pi-spin pi-spinner' : 'pi pi-database',
        disabled: !this.canExecutePivot || this.creatingView,
        command: () => { void this.createPivotView(); }
      },
      {
        label: this.t('pivot_builder.create_materialized_table', 'Create Materialized Table'),
        icon: this.creatingMaterializedTable ? 'pi pi-spin pi-spinner' : 'pi pi-table',
        disabled: !this.canExecutePivot || this.creatingMaterializedTable,
        command: () => { void this.createPivotMaterializedTable(); }
      },
      {
        label: this.t('pivot_builder.save_configuration', 'Save Configuration'),
        icon: this.savingConfiguration ? 'pi pi-spin pi-spinner' : 'pi pi-save',
        disabled: !this.canExecutePivot || this.savingConfiguration,
        command: () => { void this.savePivotConfiguration(); }
      },
      {
        label: this.t('pivot_builder.open_pivot', 'Open Pivot'),
        icon: this.reopeningPivotList ? 'pi pi-spin pi-spinner' : 'pi pi-folder-open',
        disabled: this.reopeningPivotList,
        command: () => { void this.openReopenPivotDialog(); }
      },
      { separator: true },
      {
        label: this.t('pivot_builder.delete_pivot', 'Delete current pivot'),
        icon: this.deletingPivot ? 'pi pi-spin pi-spinner' : 'pi pi-trash',
        disabled: !this.hasSavedPivot || this.deletingPivot,
        command: () => { void this.deleteCurrentPivotConfiguration(); }
      }
    ];
  }

  /** Click sul button principale dello split-button "Pivot Actions": apre il menu. */
  openPivotConfigMenu(splitBtnRef: any, _event: MouseEvent): void {
    this.openSettingsMenu(splitBtnRef, _event);
  }

  async openViewBuilderDefinition(): Promise<void> {
    this.viewBuilderOpenMode = true;
    this.reopeningPivotList = true;
    try {
      const response = await this.metaSrv.listPivotConfigurations('');
      const rows = Array.isArray(response?.items) ? response.items : [];
      this.savedPivotOptions = rows
        .filter((row: any) => String(row?.config_type || '').toLowerCase() === 'view')
        .map((row: any) => {
          const pivot = String(row?.pivot_name || '').trim();
          const route = String(row?.route_name || '').trim();
          if (!pivot) return null;
          return { label: route ? `${pivot} (${route})` : pivot, value: pivot, info: row } as any;
        })
        .filter((x: any) => !!x);
      this.reopenPivotDialogVisible = true;
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || this.t('pivot_builder.vb.error_loading_definitions', 'Error loading saved definitions.'))
      });
    } finally {
      this.reopeningPivotList = false;
    }
  }

  async openReopenPivotDialog(): Promise<void> {
    this.reopenDialogSelectedPivotName = null;
    this.reopeningPivotList = true;
    try {
      const response = await this.metaSrv.listPivotConfigurations(this.selectedRouteName || '');
      const rows = Array.isArray(response?.items) ? response.items : [];
      this.savedPivotOptions = rows
        .filter((row: any) => String(row?.config_type || 'pivot').toLowerCase() !== 'view')
        .map((row: any) => {
          const pivot = String(row?.pivot_name || '').trim();
          const route = String(row?.route_name || '').trim();
          if (!pivot) {
            return null;
          }
          return {
            label: route ? `${pivot} (${route})` : pivot,
            value: pivot,
            info: row
          } as SavedPivotOption;
        })
        .filter((x): x is SavedPivotOption => !!x);
      this.reopenPivotDialogVisible = true;
    } catch (err: any) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'error',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: String(err?.message || err || this.t('pivot_builder.error.load_saved_list', 'Errore caricamento elenco pivot salvate.'))
      });
    } finally {
      this.reopeningPivotList = false;
    }
  }

  cancelReopenPivotDialog(): void {
    this.reopenPivotDialogVisible = false;
    this.reopenDialogSelectedPivotName = null;
  }

  async confirmReopenPivotDialog(): Promise<void> {
    const pivotName = String(this.reopenDialogSelectedPivotName || '').trim();
    if (!pivotName) {
      return;
    }

    this.cancelReopenPivotDialog();

    // View Builder open mode: load config and restore graph
    if (this.viewBuilderOpenMode) {
      this.viewBuilderOpenMode = false;
      try {
        const response = await this.metaSrv.loadPivotConfiguration('', null, pivotName);
        if (!response?.ok || !response?.found) {
          WtoolboxService.messageNotificationService?.add?.({ severity: 'warn', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.definition_not_found', 'Definition not found.') });
          return;
        }
        const config = this.parseConfig(response?.pivot_config_json);
        if (config?.viewDefinition?.tables?.length && this.viewBuilderRef) {
          this.pivotName = String(response?.pivot_name || pivotName).trim();
          await this.viewBuilderRef.restoreFromDefinition(config.viewDefinition);
          this.generatedSql = String(response?.sql_text || '').trim();
          if (config?.autoGenerateQuery !== undefined) {
            this.autoGenerateQuery = !!config.autoGenerateQuery;
          }
          this.createdViewName = String(config?.createdViewName || '').trim();
          this.createdViewRoute = String(config?.createdViewRoute || '').trim();
          this.manualSqlMode = !!config?.manualSqlMode;
          this.sqlEditorOptions = { ...this.sqlEditorOptions, readOnly: !this.manualSqlMode };
          if (this.manualSqlMode && config?.manualSql) {
            this.generatedSql = String(config.manualSql);
          }
          // Restore degli altri toggle del menu Settaggi (default consistenti
          // con lo stato iniziale del componente per payload vecchi privi di
          // questi campi).
          if (config?.forceAllColumnsFilterable !== undefined) {
            this.forceAllColumnsFilterable = !!config.forceAllColumnsFilterable;
          }
          if (config?.autoReflowLayout !== undefined) {
            this.autoReflowLayout = !!config.autoReflowLayout;
          }
          // Rigenera il modello del split-button Settaggi cosi' le icone
          // check/stop riflettono i nuovi valori ripristinati.
          this.rebuildSettingsMenuItems();
          this.rebuildPivotSettingsMenuItems();
          // Rigenera anche il menu Definition (il load ha appena settato
          // pivotName + createdViewName/Route → Delete deve diventare
          // enabled e Create View deve riflettere hasViewDefinition).
          this.rebuildDefinitionMenuItems();
          // Auto-select nel dropdown "Select metadata route" del tab Pivot
          // Config la route scaffoldata salvata nel payload (se presente).
          // `loadRouteOptions()` prima di selezionare per coprire il caso
          // in cui la route e' stata creata tra un'istanza di pivot-builder
          // e l'altra e non e' ancora in `routeOptions` dell'ngOnInit.
          if (this.createdViewRoute) {
            try { await this.loadRouteOptions(); } catch {}
            await this.selectScaffoldedRoute(this.createdViewRoute);
          }
          WtoolboxService.messageNotificationService?.add?.({ severity: 'success', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.definition_loaded', 'Definition loaded.') + ' "' + this.pivotName + '"' });
        } else {
          WtoolboxService.messageNotificationService?.add?.({ severity: 'warn', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: this.t('pivot_builder.vb.no_view_definition_found', 'No view definition found in this config.') });
        }
      } catch (err: any) {
        WtoolboxService.messageNotificationService?.add?.({ severity: 'error', summary: this.t('pivot_builder.summary', 'Pivot builder'), detail: String(err?.message || this.t('pivot_builder.vb.error_loading_definition', 'Error loading definition.')) });
      }
      return;
    }

    // Pivot Config open mode (original)
    const loaded = await this.tryLoadPivotByName(pivotName);
    if (!loaded) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn',
        summary: this.t('pivot_builder.summary', 'Pivot builder'),
        detail: this.t('pivot_builder.error.selected_not_found', 'Pivot selezionata non trovata.')
      });
      return;
    }

    if (typeof window !== 'undefined') {
      const base = window.location.href.split('#')[0];
      const url = `${base}#/${encodeURIComponent(pivotName)}/pivot-builder`;
      window.history.replaceState(null, '', url);
    }
  }

  ngOnDestroy(): void {
    this.pivotDatasourceSub?.unsubscribe();
  }
}
