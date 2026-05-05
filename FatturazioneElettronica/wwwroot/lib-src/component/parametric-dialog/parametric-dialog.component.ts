import { NgTemplateOutlet, NgComponentOutlet, NgClass, AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Optional, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { DataSourceComponent } from './../data-source/data-source.component';
import { ActivatedRoute, Router } from '@angular/router';
import { DynamicDialogRef, DynamicDialogConfig, DialogService } from 'primeng/dynamicdialog';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DynamicFormTemplateComponent } from '../dynamic-form-template/dynamic-form-template.component';
import { MetadatiCustomActionTabella } from '../../class/metadati_custom_actions_tabelle';
import { ButtonModule } from 'primeng/button';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

@Component({
  selector: 'wuic-parametric-dialog',
  imports: [NgClass, Tabs, TabList, Tab, TabPanels, TabPanel, ButtonModule, NgTemplateOutlet, NgComponentOutlet, TranslateModule],
  templateUrl: './parametric-dialog.component.html',
  styleUrl: './parametric-dialog.component.scss'
})
export class ParametricDialogComponent implements OnInit, AfterViewInit, OnDestroy, IDataBoundHostComponent {
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent; //To access directly the directive
  /**
   * Input dal componente padre per hide toolbar; quando true nasconde la button bar in basso.
   */
  @Input() hideToolbar: boolean = false;

  /**
 * Input dal componente padre per indicare se il dialogo è un wizard; quando true abilita il comportamento wizard.
 */
  @Input() isWizard: boolean = false;

  /**
 * Input dal componente padre per indicare se il dialogo è un edit form; quando true abilita comportamenti specifici per edit form.
 */
  @Input() isEditForm: boolean = false;

  /**
   * Input dal componente padre per readOnly; quando true disabilita interazioni e azioni di modifica.
   */
  @Input() readOnly: boolean = false;
  /**
   * Evento emesso quando il dialog ha allineato snapshot locale dal datasource.
   */
  @Output() onDialogDataBound = new EventEmitter<{ metaInfo: MetaInfo; record: any; pristine: any }>();
  /**
   * Evento emesso al cambio tab/step.
   */
  @Output() onDialogTabChange = new EventEmitter<{ value: number; tab: any | null; isWizard: boolean }>();
  /**
   * Evento emesso al cambio step wizard.
   */
  @Output() onWizardStepChange = new EventEmitter<{ stepIndex: number; tab: any | null }>();
  /**
   * Evento emesso al click/execute di una custom action tabella.
   */
  @Output() onDialogCustomAction = new EventEmitter<{ event: any; item: MetadatiCustomActionTabella }>();
  /**
   * Evento emesso dopo submit riuscito (save callback o syncData).
   */
  @Output() onDialogSubmit = new EventEmitter<{ result: any; isWizard: boolean; isEditForm: boolean }>();
  /**
   * Evento emesso dopo rollback locale dei cambi.
   */
  @Output() onDialogRollback = new EventEmitter<{ record: any }>();
  /**
   * Evento emesso quando viene richiusa/annullata la chiusura del dialog/form.
   */
  @Output() onDialogCloseRequested = new EventEmitter<{ result?: any; hasPendingChanges: boolean }>();

  /**
   * Record corrente in edit/view, usato da editor e callback dinamiche del componente.
   */
  record: any;
  /**
   * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
   */
  metas: MetadatiColonna[] = [];
  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo = new MetaInfo();
  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: BehaviorSubject<string>;
  /**
   * Proprieta di stato del componente per pristine, usata dalla logica interna e dal template.
   */
  pristine: any;
  /**
   * Configurazione di presentazione per form template, usata nel rendering del componente.
   */
  formTemplate: any;

  /**
 * Flag di stato che governa il comportamento UI/logico relativo a cloning.
 */
  cloning: boolean = false;

  /**
   * Proprieta di stato del componente per wtoolbox, usata dalla logica interna e dal template.
   */
  wtoolbox: typeof WtoolboxService;
  /**
   * Proprieta di stato del componente per conditions bootstrapped, usata dalla logica interna e dal template.
   */
  private conditionsBootstrapped = false;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;
  /**
   * Collezione dati per record value subscriptions, consumata dal rendering e dalle operazioni del componente.
   */
  private recordValueSubscriptions: Subscription[] = [];
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a disable callbacks running.
   */
  private disableCallbacksRunning = false;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a disable callbacks pending.
   */
  private disableCallbacksPending = false;
  /**
   * Chiave dell'ultimo record wizard su cui e stato effettuato il bind tracking.
   * Evita rebind ripetuti allo stesso record su tick successivi di fetchInfo$.
   */
  private wizardTrackingBoundKey?: string;
  private originalDialogClose?: (result?: any) => void;
  private bypassDialogCloseGuard = false;
  private dialogHeaderCloseButton: HTMLElement | null = null;
  private dialogHeaderCloseListener?: (event: Event) => void;
  private headerClosePromptInProgress = false;
  private patchedDialogInstance: any = null;
  private originalDialogOnVisibleChange?: (visible: boolean) => void;
  private originalDialogOnHide?: (event: any) => void;
  /**
   * Valore tab attivo usato da PrimeNG Tabs.
   */
  activeTabValue: number = 0;
  /**
   * Cache dei tab visibili gia renderizzati almeno una volta.
   * Serve a evitare il costo iniziale di rendering di tutti i field-editor.
   */
  private renderedTabValues = new Set<number>();
  private fieldTabIndexByKey = new Map<string, number>();
  private wizardFocusTimer: ReturnType<typeof setTimeout> | null = null;
  private wizardFocusRetry = 0;
  private readonly wizardFocusMaxRetry = 50;

  get visibleDataTabs() {
    return this.metaInfo?.dataTabs?.filter(t => !t.hidden) ?? [];
  }

  get tableCustomActions(): MetadatiCustomActionTabella[] {
    return this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles || [];
  }

  /**
 * Restituisce il value tab/panel con mapping stabile:
 * il tab selezionato vale 0, gli altri valgono 1..N.
 * @param dataTab Tab visibile corrente.
 * @param index Indice del tab visibile nel loop.
 * @returns Valore numerico usato da PrimeNG per matching tab/panel.
*/
  getTabValue(dataTab: any, index: number): number {
    return index;
  }

  /**
 * Gestisce il cambio tab proveniente da PrimeNG aggiornando lo stato metadata.
 * @param value Value emesso dal tab selezionato.
*/
  onTabValueChange(value: any): void {
    const numericValue = Number(value);
    const selectedTab = this.findVisibleTabByValue(numericValue);
    if (!selectedTab) {
      return;
    }

    this.setSelectedVisibleTab(selectedTab);
    this.markTabAsRendered(this.activeTabValue);
    this.scheduleWizardFirstFieldFocus();
    this.onDialogTabChange.emit({
      value: this.activeTabValue,
      tab: selectedTab,
      isWizard: this.isWizard
    });
    if (this.isWizard) {
      this.onWizardStepChange.emit({
        stepIndex: this.activeTabValue,
        tab: selectedTab
      });
    }
  }

  /**
* function Object() { [native code] }
* @param ref Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param config Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param route Informazione di navigazione usata per risolvere la route di destinazione.
* @param router Informazione di navigazione usata per risolvere la route di destinazione.
*/
  constructor(@Optional() public ref: DynamicDialogRef | null,
    @Optional() public config: DynamicDialogConfig | null, private route: ActivatedRoute,
    private router: Router,
    private trnsl: TranslationManagerService,
    private hostElementRef: ElementRef<HTMLElement>,
    @Optional() private dialogService?: DialogService) {
    this.routeName = new BehaviorSubject<string>(this.route.snapshot.paramMap.get('route') || '');
    this.wtoolbox = WtoolboxService;
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.installDialogCloseGuard();

    if (this.config?.data) {
      this.isEditForm = this.config.data.isEditForm || this.isEditForm;
      this.readOnly = this.config.data.readOnly || this.readOnly;
      this.datasource = this.config.data.datasource;

      this.applyDatasourceSnapshot(this.datasource?.value);
      this.ensureWizardTrackingBound(this.datasource?.value);

      this.bootstrapConditionalActions();

      this.datasource?.value.parseConditions?.();

    } else if (this.datasource?.value) {
      this.fetchInfoSubscription?.unsubscribe();
      this.applyDatasourceSnapshot(this.datasource.value);
      this.ensureWizardTrackingBound(this.datasource.value);
      const fetchInfo$ = (this.datasource.value as any)?.fetchInfo$;
      if (fetchInfo$ && typeof fetchInfo$.subscribe === 'function') {
        this.fetchInfoSubscription = fetchInfo$.subscribe((info) => {
          if (info && info.metaInfo) {
            this.applyDatasourceSnapshot(this.datasource?.value, info.metaInfo);
            this.ensureWizardTrackingBound(this.datasource?.value);
            this.bootstrapConditionalActions();
            this.setupRecordValueSubscriptions();
            void this.recomputeActionDisabledStateFromValidations();

            this.datasource?.value.parseConditions?.();
          }
        });
      }
    } else if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject(this.hardcodedDatasource);
      this.applyDatasourceSnapshot(this.datasource?.value);
      this.ensureWizardTrackingBound(this.datasource?.value);
      this.fetchInfoSubscription?.unsubscribe();
      const fetchInfo$ = (this.datasource.value as any)?.fetchInfo$;
      if (fetchInfo$ && typeof fetchInfo$.subscribe === 'function') {
        this.fetchInfoSubscription = fetchInfo$.subscribe((info) => {
          if (info && info.metaInfo) {
            this.applyDatasourceSnapshot(this.datasource?.value, info.metaInfo);
            this.ensureWizardTrackingBound(this.datasource?.value);
            this.bootstrapConditionalActions();
            this.setupRecordValueSubscriptions();
            void this.recomputeActionDisabledStateFromValidations();

            this.datasource?.value.parseConditions?.();
          }
        });
      }
    }

    this.setupRecordValueSubscriptions();
    void this.recomputeActionDisabledStateFromValidations();
  }

  /**
* Allinea stato locale (`record`, `pristine`, `metaInfo`, `metas`, `formTemplate`) al datasource corrente.
* @param ds Datasource sorgente da cui leggere snapshot runtime.
* @param metaInfoOverride Metainfo opzionale proveniente da evento `fetchInfo$`.
*/
  private applyDatasourceSnapshot(ds: DataSourceComponent | null | undefined, metaInfoOverride?: MetaInfo): void {
    if (!ds) {
      return;
    }

    const resolvedMetaInfo = (metaInfoOverride || ds.metaInfo || new MetaInfo()) as MetaInfo;
    this.record = ds.resultInfo?.current;
    this.pristine = ds.pristine;

    const canCreateRecord =
      !!ds?.resultInfo
      && Array.isArray(resolvedMetaInfo?.columnMetadata)
      && resolvedMetaInfo.columnMetadata.length > 0;

    if (!this.record && canCreateRecord && typeof ds.addNewRecord === 'function') {
      try {
        ds.addNewRecord();
      } catch {
        // Datasource may still be in async bootstrap; keep dialog stable and retry on next fetchInfo$ tick.
      }

      this.record = ds.resultInfo?.current;
      this.pristine = ds.pristine;
    }

    const previousActiveTab = this.activeTabValue;
    this.metaInfo = resolvedMetaInfo;
    this.sortRootCustomActionsByOrdine();
    this.metas = this.parseColumns(resolvedMetaInfo.columnMetadata || []);
    this.rebuildFieldTabIndexMap();
    this.normalizeSelectedTabFromMetadata();
    this.renderedTabValues.clear();
    this.markTabAsRendered(this.activeTabValue);
    if (this.isWizard && this.activeTabValue !== previousActiveTab) {
      this.scheduleWizardFirstFieldFocus();
    }

    const editTemplate = String(this.metaInfo?.tableMetadata?.md_edit_template || '').trim();
    const editRoute = String(this.metaInfo?.tableMetadata?.md_route_name || '');
    this.formTemplate = editTemplate
      ? DynamicFormTemplateComponent.getComponentFromTemplate(editTemplate, editRoute)
      : null;
    this.onDialogDataBound.emit({
      metaInfo: this.metaInfo,
      record: this.record,
      pristine: this.pristine
    });
  }

  /**
* In modalita wizard forza una singola riallocazione del current record sul datasource
* per agganciare tracking/pristine anche nei flussi serializzati che non passano da setCurrent.
* @param ds Datasource attivo del dialogo.
*/
  private ensureWizardTrackingBound(ds?: DataSourceComponent | null): void {
    if (!this.isWizard || !ds) {
      return;
    }

    if (ds.changeTracking === false) {
      return;
    }

    const current = ds.resultInfo?.current;
    if (!current) {
      return;
    }

    const pKeyName = MetadataProviderService.getPKeys(ds.metaInfo?.columnMetadata || [])[0]?.mc_nome_colonna;
    const pKeyValue = pKeyName ? current?.[pKeyName]?.value : undefined;
    const guidValue = current?.['__guid']?.value;
    const bindKey = pKeyValue !== undefined && pKeyValue !== null
      ? `pk:${String(pKeyValue)}`
      : `guid:${String(guidValue ?? '')}`;

    if (!bindKey || bindKey === 'guid:' || this.wizardTrackingBoundKey === bindKey) {
      return;
    }

    if (typeof ds.getModelFromObservable !== 'function' || typeof ds.setCurrent !== 'function') {
      return;
    }

    try {
      const currentModel = ds.getModelFromObservable(current);
      ds.setCurrent(currentModel);
      this.wizardTrackingBoundKey = bindKey;
      this.record = ds.resultInfo?.current;
      this.pristine = ds.pristine;
    } catch {
      // Best effort: keep dialog rendering stable even on lightweight/mocked datasources.
    }
  }

  private bootstrapConditionalActions(): void {
    // if (this.conditionsBootstrapped) {
    //   return;
    // }

    // const ds: any = this.datasource?.value;
    // if (!ds || typeof ds.setCurrent !== 'function' || typeof ds.getModelFromObservable !== 'function') {
    //   return;
    // }

    // try {
    //   const currentRecord = ds.resultInfo?.current;
    //   if (!currentRecord) {
    //     return;
    //   }

    //   // Ensure DataSource condition listeners (including CAI cascade actions) are wired
    //   // exactly as in edit-form flows that call setCurrent before rendering.
    //   const currentModel = ds.getModelFromObservable(currentRecord);
    //   ds.setCurrent(currentModel);
    //   this.record = ds.resultInfo.current;
    //   this.pristine = ds.pristine;
    //   this.conditionsBootstrapped = true;
    // } catch {
    //   // Best-effort bootstrap: dialog should remain usable even if datasource is a lightweight mock.
    // }
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.installDynamicDialogLifecycleGuard();
    this.bindHeaderCloseGuard();
    this.scheduleWizardFirstFieldFocus();
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.uninstallDynamicDialogLifecycleGuard();
    this.unbindHeaderCloseGuard();
    this.clearWizardFocusTimer();
    this.fetchInfoSubscription?.unsubscribe();
    this.clearRecordValueSubscriptions();
  }

  subscribeToDS(): void {
    const ds = this.datasource?.value || this.hardcodedDatasource;
    if (!ds) {
      return;
    }

    this.applyDatasourceSnapshot(ds);
    this.ensureWizardTrackingBound(ds);
    this.bootstrapConditionalActions();
    this.setupRecordValueSubscriptions();
    void this.recomputeActionDisabledStateFromValidations();
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(data: any) {
    return data;
  }

  /**
* Interpreta e normalizza input/configurazione in `parseColumns` per l'utilizzo nel componente.
* @param columns Collezione in ingresso processata dal metodo.
* @returns Struttura dati prodotta da `parseColumns` dopo normalizzazione/elaborazione.
*/
  parseColumns(columns: MetadatiColonna[]) {
    return columns;
  }

  /**
* Gestisce la logica operativa di `fieldByTab` in modo coerente con l'implementazione corrente.
* @param metas Metadati runtime usati per determinare comportamento, mapping e visibilità campi.
* @param tab Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Risultato elaborato da `fieldByTab` e restituito al chiamante.
*/
  fieldByTab(metas: MetadatiColonna[], tab: any) {
    return metas.filter((meta) => !this.isFieldHiddenInEdit(meta) && (!tab || meta.mc_edit_associated_tab === tab.tabName || (!meta.mc_edit_associated_tab && tab.tabName == "non_associati_a_tab")));
  }

  /**
   * Decide se un campo va nascosto nel dialog di edit.
   *
   * Combina due criteri:
   *  1. `mc_hide_in_edit` esplicito — il dev ha scelto di nascondere il campo.
   *  2. Autorule per PK server-generate: se la colonna e' PK e la tabella ha
   *     `md_primary_key_type ∈ {IDENTITY, SEQUENCE, GUID}`, il valore viene
   *     generato da SQL Server (IDENTITY autoincrement, `NEXT VALUE FOR <seq>`,
   *     o `newid()`) quindi non ha senso mostrare il campo all'utente —
   *     ne in insert (lo fa il server) ne in update (identity column).
   *
   *     Il metamodel generator `metaModelRaw.cs` applica gia' questa logica
   *     in fase di scaffolding settando `mc_hide_in_edit = true` quando genera
   *     autometadata dal DB. Qui replichiamo la stessa regola a RUNTIME per
   *     coprire anche metadata costruiti a mano (es. Pattern 3 hardcoded
   *     datasource) dove il dev non ha esplicitato il flag: cosi' la
   *     behavior e' coerente tra metadata scaffolded e metadata handcrafted.
   */
  private isFieldHiddenInEdit(col: MetadatiColonna): boolean {
    if (col?.mc_hide_in_edit) {
      return true;
    }
    if (col?.mc_is_primary_key) {
      const pkType = String(this.metaInfo?.tableMetadata?.md_primary_key_type || '').toUpperCase();
      if (pkType === 'IDENTITY' || pkType === 'SEQUENCE' || pkType === 'GUID') {
        return true;
      }
    }
    return false;
  }

  /**
 * Sincronizza i flag `selected` nei metadata a partire da un tab visibile target.
 * @param targetTab Tab visibile da impostare come selezionato.
*/
  private setSelectedVisibleTab(targetTab: any): void {
    const allTabs = Array.isArray(this.metaInfo?.dataTabs) ? this.metaInfo.dataTabs : [];
    if (!allTabs.length) {
      this.activeTabValue = 0;
      return;
    }

    allTabs.forEach((tab: any) => {
      tab.selected = !!targetTab && tab === targetTab;
    });

    const visibleTabs = this.visibleDataTabs;
    const selectedIndex = visibleTabs.findIndex((tab: any) => !!tab?.selected);
    this.activeTabValue = selectedIndex >= 0 ? selectedIndex : 0;
    this.markTabAsRendered(this.activeTabValue);
  }

  /**
 * Normalizza la selezione iniziale tab usando `metaInfo.dataTabs`.
*/
  private normalizeSelectedTabFromMetadata(): void {
    const allTabs = Array.isArray(this.metaInfo?.dataTabs) ? this.metaInfo.dataTabs : [];
    if (!allTabs.length) {
      this.activeTabValue = 0;
      return;
    }

    const visibleTabs = allTabs.filter((tab: any) => !tab?.hidden);
    if (!visibleTabs.length) {
      allTabs.forEach((tab: any) => tab.selected = false);
      this.activeTabValue = 0;
      return;
    }

    const selectedVisible = visibleTabs.find((tab: any) => !!tab?.selected) || visibleTabs[0];
    this.setSelectedVisibleTab(selectedVisible);
  }

  /**
 * Indica se il contenuto del tab deve essere istanziato.
 * Lazy render: inizialmente solo tab attivo, poi cache dei tab gia visitati.
*/
  shouldRenderTabPanel(tabValue: number): boolean {
    return this.renderedTabValues.has(Number(tabValue));
  }

  private markTabAsRendered(tabValue: number): void {
    const normalized = Number(tabValue);
    if (!Number.isFinite(normalized) || normalized < 0) {
      return;
    }
    this.renderedTabValues.add(normalized);
  }

  /**
 * Risolve un tab visibile a partire dal value emesso da PrimeNG.
 * @param value Value selezionato emesso dal controllo tabs.
 * @returns Tab visibile corrispondente oppure null.
*/
  private findVisibleTabByValue(value: number): any | null {
    if (!Number.isFinite(value)) {
      return null;
    }

    const tabs = this.visibleDataTabs;
    return tabs[value] ?? null;
  }

  getComponent() {
    return MetadataProviderService.widgetMap['field-editor'].component;
  }

  getInputs(field: MetadatiColonna, visualIndex: number) {
    return {
      datasource: this.datasource,
      record: this.record,
      field: field,
      metaInfo: this.metaInfo,
      readOnly: this.readOnly,
      forceShowLabel: true,
      tabIndex: this.getFieldTabIndex(field, visualIndex)
    };
  }

  private getFieldKey(field: MetadatiColonna): string {
    const mcId = Number(field?.mc_id || 0);
    const colName = String(field?.mc_nome_colonna || '').trim();
    const angName = String(field?.ang_name || '').trim();
    return `${mcId > 0 ? mcId : 0}|${colName}|${angName}`;
  }

  private getFieldOrder(field: MetadatiColonna): number {
    const order = Number((field as any)?.mc_ordine ?? (field as any)?.mcordine);
    return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
  }

  private rebuildFieldTabIndexMap(): void {
    this.fieldTabIndexByKey.clear();
    const editableFields = (this.metas || []).filter((f) => !this.isFieldHiddenInEdit(f));
    const sorted = editableFields
      .map((field, sourceIndex) => ({ field, sourceIndex }))
      .sort((a, b) => {
        const orderCompare = this.getFieldOrder(a.field) - this.getFieldOrder(b.field);
        if (orderCompare !== 0) {
          return orderCompare;
        }
        return a.sourceIndex - b.sourceIndex;
      });

    sorted.forEach(({ field }, index) => {
      this.fieldTabIndexByKey.set(this.getFieldKey(field), index + 1);
    });
  }

  public getFieldTabIndex(field: MetadatiColonna, visualIndex: number): number {
    // Always 0: keep natural DOM order and keyboard navigation predictable
    // regardless of fieldTabIndexByKey content. The map is still maintained
    // for getCustomActionTabIndex() and other callers that DO use the value.
    return 0;
  }

  private getToolbarTabIndexStart(): number {
    return Math.max(1, this.fieldTabIndexByKey.size + 1);
  }

  public getCustomActionTabIndex(actionIndex: number): number {
    return this.getToolbarTabIndexStart() + Math.max(0, actionIndex);
  }

  private getEditButtonsStartTabIndex(): number {
    let base = this.getToolbarTabIndexStart();
    if (!this.isEditForm || this.isWizard) {
      base += this.tableCustomActions.length;
    }
    return base;
  }

  public getSaveButtonTabIndex(): number {
    return this.getEditButtonsStartTabIndex();
  }

  public getRollbackButtonTabIndex(): number {
    let index = this.getEditButtonsStartTabIndex();
    if (!this.readOnly && !this.metaInfo?.tableMetadata?.hideSave) {
      index += 1;
    }
    return index;
  }

  public getGoBackButtonTabIndex(): number {
    let index = this.getEditButtonsStartTabIndex();
    if (!this.readOnly && !this.metaInfo?.tableMetadata?.hideSave) {
      index += 1;
    }
    if (!this.readOnly && !this.metaInfo?.tableMetadata?.hideRollback) {
      index += 1;
    }
    return index;
  }

  /**
* Gestisce la logica di `execute` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @param $event Evento UI/payload evento che innesca la logica del metodo.
* @param item Dato/record su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
*/
  async execute($event, item: MetadatiCustomActionTabella) {
    const previousTabValue = this.activeTabValue;
    this.onDialogCustomAction.emit({
      event: $event,
      item
    });
    try {
      await Promise.resolve(item.action_callback__fn(this.datasource.value, this.metaInfo, this.record, $event, WtoolboxService));
    } finally {
      if (this.shouldScheduleWizardFocusAfterAction(item, previousTabValue)) {
        this.scheduleWizardFirstFieldFocus();
      }
    }
  }

  public onToolbarButtonKeydown(
    event: Event,
    action: 'custom' | 'save' | 'rollback' | 'goback',
    item?: MetadatiCustomActionTabella
  ): void {
    const key = String((event as any)?.key || '').toLowerCase();
    if (key !== 'enter' && key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action === 'custom' && item) {
      void this.execute(event, item);
      return;
    }

    if (action === 'save') {
      void this.submitData();
      return;
    }

    if (action === 'rollback') {
      this.rollbackChanges(this.record);
      return;
    }

    if (action === 'goback') {
      this.goBack();
    }
  }

  /**
* Ordina le custom actions tabella (`_Metadati_Custom_Actions_Tabelles`) per `ordine` ascendente.
* Le azioni senza `ordine` restano in coda preservando l'ordine relativo.
*/
  private sortRootCustomActionsByOrdine(): void {
    const actions = this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles;
    if (!Array.isArray(actions) || !actions.length) {
      return;
    }

    actions.sort((a: any, b: any) => {
      const aOrd = Number(a?.ordine ?? a?.Ordine);
      const bOrd = Number(b?.ordine ?? b?.Ordine);
      const aHasOrd = Number.isFinite(aOrd);
      const bHasOrd = Number.isFinite(bOrd);

      if (aHasOrd && bHasOrd) {
        return aOrd - bOrd;
      }
      if (aHasOrd) {
        return -1;
      }
      if (bHasOrd) {
        return 1;
      }
      return 0;
    });
  }

  /**
 * Ripristina lo stato e pulisce risorse temporanee legate al flusso del componente gestendo il ciclo di vita delle sottoscrizioni RxJS.
 */
  private clearRecordValueSubscriptions(): void {
    this.recordValueSubscriptions.forEach((sub) => sub.unsubscribe());
    this.recordValueSubscriptions = [];
  }

  /**
* Gestisce la logica operativa di `setupRecordValueSubscriptions` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
*/
  private setupRecordValueSubscriptions(): void {
    this.clearRecordValueSubscriptions();

    if (!this.record || !this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles?.length) {
      return;
    }

    Object.keys(this.record).forEach((fieldName) => {
      const fieldValue$ = this.record?.[fieldName];
      if (!(fieldValue$ instanceof BehaviorSubject)) {
        return;
      }

      let skipFirstEmission = true;
      const sub = fieldValue$.subscribe(() => {
        if (skipFirstEmission) {
          skipFirstEmission = false;
          return;
        }
        void this.recomputeActionDisabledStateFromValidations();
      });

      this.recordValueSubscriptions.push(sub);
    });

  }

  /**
* Rivalida il record corrente e riesegue i disable callback delle custom actions tabella.
* Serve a mantenere allineato `canCompleteWizard` quando cambia `isValid` nelle validation rules.
*/
  private async recomputeActionDisabledStateFromValidations(): Promise<void> {
    try {
      if (this.record && this.datasource?.value?.validateData) {
        await this.datasource.value.validateData(this.record);
      }
    } catch {
      // Best effort: proceed with callback recomputation even if validation throws.
    }

    await this.recomputeActionDisabledState();
  }

  /**
* Gestisce la logica operativa di `recomputeActionDisabledState` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
*/
  private async recomputeActionDisabledState(): Promise<void> {
    if (this.disableCallbacksRunning) {
      this.disableCallbacksPending = true;
      return;
    }

    this.disableCallbacksRunning = true;
    try {
      do {
        this.disableCallbacksPending = false;
        this.sortRootCustomActionsByOrdine();
        const actions = this.metaInfo?.tableMetadata?._Metadati_Custom_Actions_Tabelles || [];
        // Pre-calcola lo stato della navigazione wizard cosi' i 3 bottoni
        // wizard.{prev,next,complete}.action ottengono auto-disable senza
        // bisogno che la board author definisca un disable_callback ricorsivo.
        const wizardNav = this.isWizard ? this.computeWizardNavState() : null;
        for (const action of actions) {
          // Built-in framework disable logic per wizard buttons. Si applica
          // PRIMA del disable_callback custom; quest'ultimo vince se definito
          // (l'author puo' override esplicitamente).
          const autoDisabled = wizardNav ? this.computeWizardActionAutoDisabled(action, wizardNav) : null;
          if (typeof action?.disable_callback__fn === 'function') {
            action._disabled = await Promise.resolve(action.disable_callback__fn(
              this.datasource?.value,
              this.metaInfo,
              this.record,
              WtoolboxService
            ));
          } else if (autoDisabled !== null) {
            action._disabled = autoDisabled;
          } else {
            action._disabled = false;
          }
        }
      } while (this.disableCallbacksPending);
    } catch (err) {
      console.error('Error while evaluating table action disable callbacks in parametric-dialog', err);
    } finally {
      this.disableCallbacksRunning = false;
    }
  }

  /**
   * Stato di navigazione wizard usato per calcolare l'auto-disable dei
   * bottoni wizard.{prev,next,complete}.action.
   *  - currentVisibleIndex: posizione del tab attivo nell'array dei tab
   *    visibili (= activeTabValue, perche' getTabValue ritorna l'indice).
   *  - visibleCount: numero di tab visibili (non-hidden).
   *  - hasPrev: ci sono tab visibili a sinistra del corrente.
   *  - hasNext: ci sono tab visibili a destra del corrente.
   */
  private computeWizardNavState(): { currentVisibleIndex: number; visibleCount: number; hasPrev: boolean; hasNext: boolean } {
    const visibleCount = this.visibleDataTabs.length;
    const currentVisibleIndex = typeof this.activeTabValue === 'number' ? this.activeTabValue : 0;
    return {
      currentVisibleIndex,
      visibleCount,
      hasPrev: currentVisibleIndex > 0,
      hasNext: currentVisibleIndex >= 0 && currentVisibleIndex < visibleCount - 1,
    };
  }

  /**
   * Ritorna `true` se l'action e' un bottone wizard.{prev,next,complete}.action
   * che il framework deve auto-disabilitare in base allo stato di navigazione.
   * Ritorna `false` se l'action e' un wizard button ma deve restare enabled.
   * Ritorna `null` se l'action NON e' un wizard nav button (= no opinion,
   * la logica precedente decide il fallback default).
   */
  private computeWizardActionAutoDisabled(
    action: any,
    nav: { currentVisibleIndex: number; visibleCount: number; hasPrev: boolean; hasNext: boolean }
  ): boolean | null {
    const caption = String(action?.button_caption || '').trim().toLowerCase();
    if (caption === 'wizard.prev.action') return !nav.hasPrev;
    if (caption === 'wizard.next.action') return !nav.hasNext;
    // wizard.complete.action: enabled SOLO sull'ultima visible tab. La
    // validation della tab corrente resta a carico del flow esistente
    // (selectNextVisibleTab + validate); qui guard solo "non sei all'ultimo
    // step" → disable.
    if (caption === 'wizard.complete.action') return nav.visibleCount > 0 && nav.currentVisibleIndex !== nav.visibleCount - 1;
    return null;
  }


  /**
* Esegue il salvataggio del record: usa `saveCallback` custom se presente, altrimenti `datasource.syncData`; a esito positivo chiude dialog o naviga indietro.
*/
  async submitData() {

    if (this.datasource) {
      if (this.config?.data?.saveCallback) {
        const callbackResult = await Promise.resolve(this.config.data.saveCallback(this.record, this.pristine));
        if (callbackResult !== false) {
          this.onDialogSubmit.emit({
            result: callbackResult ?? this.record,
            isWizard: this.isWizard,
            isEditForm: this.isEditForm
          });
          // await this.reloadTranslationsIfMetadataSave();
        }
        if (callbackResult !== false && this.ref) {
          this.ref.close(callbackResult ?? this.record);
        } else if (callbackResult !== false && this.shouldNavigateBackAfterSave()) {
          this.navigateBackAfterSave();
        }
      } else {
        let ret = await this.datasource.value.syncData(this.record, this.pristine, false, this.cloning);
        if (ret !== null) {
          this.onDialogSubmit.emit({
            result: ret ?? this.record,
            isWizard: this.isWizard,
            isEditForm: this.isEditForm
          });
          // await this.reloadTranslationsIfMetadataSave();
        }
        // syncData returns null on validation errors; keep dialog open only in that case.
        if (ret !== null && this.ref) {
          this.ref.close(ret ?? this.record);
        } else if (ret !== null && this.shouldNavigateBackAfterSave()) {
          this.navigateBackAfterSave();
        }
      }
    }

  }

  /**
* Determina se dopo save bisogna navigare indietro: true solo in pagina standalone (no dialog) e action route uguale a `edit`.
* @returns True se il flusso post-save deve eseguire la navigazione indietro.
*/
  private shouldNavigateBackAfterSave(): boolean {
    if (this.ref) {
      return false;
    }

    const snapshots = this.route.snapshot.pathFromRoot || [];
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const action = String(snapshots[i]?.paramMap?.get('action') || '').trim().toLowerCase();
      if (action) {
        return action === 'edit';
      }
    }

    return false;
  }

  /**
* Esegue la navigazione post-save: usa `history.back()` se disponibile, altrimenti fallback su route relativa `../list`.
*/
  private navigateBackAfterSave(): void {
    if (window?.history?.length > 1) {
      window.history.back();
      return;
    }

    void this.router.navigate(['../list'], { relativeTo: this.route });
  }

  /**
* Ripristina i valori del record corrente usando `pristine` per ogni colonna metadato, annullando le modifiche non salvate.
* @param resultInfo Parametro legacy non usato nella logica corrente (mantenuto per compatibilità firma).
*/

  rollbackChanges(resultInfo) {
    let pristineSnapshot: any = null;
    try {
      pristineSnapshot = this.pristine ? JSON.parse(JSON.stringify(this.pristine)) : null;
    } catch {
      pristineSnapshot = this.pristine;
    }

    const ds = this.datasource?.value as any;
    if (ds && typeof ds.rollbackChanges === 'function') {
      ds.rollbackChanges();
      this.record = ds.resultInfo?.current || this.record;
      // Keep original pristine snapshot for UI rollback coherence on lookup editors.
      this.pristine = pristineSnapshot || this.pristine;
      if (pristineSnapshot) {
        ds.pristine = pristineSnapshot;
      }
    }

    if (this.pristine) {
      this.metaInfo.columnMetadata.forEach((field) => {
        this.record[field.mc_nome_colonna]?.next(this.pristine[field.mc_nome_colonna]);

        if (field.mc_ui_column_type == 'lookupByID' || field.mc_ui_column_type == 'multiple_check') {
          const lookupObjKey = field.mc_nome_colonna + '__lookup_obj';
          let pristineLookupObj = this.pristine[lookupObjKey];
          const defaultLookupObj = field.mc_ui_column_type == 'multiple_check' ? [] : null;

          const aliasKey = String(field.mc_ui_lookup_entity_name || '').replaceAll(' ', '_')
            + '___' + String(field.mc_ui_lookup_dataTextField || '') + '__' + field.mc_nome_colonna;

          // In many edit flows pristine stores only scalar FK + alias text, while lookup_obj is null.
          // Rebuild a minimal lookup object so UI selection is restored correctly after rollback.
          if (
            (pristineLookupObj === null || pristineLookupObj === undefined)
            && field.mc_ui_column_type == 'lookupByID'
            && this.pristine[field.mc_nome_colonna] !== null
            && this.pristine[field.mc_nome_colonna] !== undefined
          ) {
            const rebuilt: any = {};
            const valueField = String(field.mc_ui_lookup_dataValueField || field.mc_nome_colonna || '').trim();
            const textField = String(field.mc_ui_lookup_dataTextField || field.mc_ui_grid_display_field || '').trim();
            if (valueField) {
              rebuilt[valueField] = this.pristine[field.mc_nome_colonna];
            } else {
              rebuilt[field.mc_nome_colonna] = this.pristine[field.mc_nome_colonna];
            }

            const aliasValue = this.pristine[aliasKey];
            if (textField && aliasValue !== undefined && aliasValue !== null) {
              rebuilt[textField] = aliasValue;
            }

            pristineLookupObj = rebuilt;
          }

          this.record[lookupObjKey]?.next(pristineLookupObj ?? defaultLookupObj);

          if (aliasKey && this.record[aliasKey]) {
            this.record[aliasKey].next(this.pristine[aliasKey] ?? null);
          }
        }
      });
    }
    this.onDialogRollback.emit({
      record: this.record
    });
  };

  /**
* Chiude il dialog senza salvare quando presente; in modalità pagina esegue `history.back()`.
*/

  goBack() {
    this.onDialogCloseRequested.emit({
      hasPendingChanges: this.hasPendingChanges()
    });
    if (this.ref) {
      void this.tryCloseDialog(undefined);
      return;
    }

    history.back();
    // if ($scope.isPopup) {
    //   $scope.popup.close();
    // }
    // else {
    //   history.back();
    // }
  }

  /**
* Indica se il datasource corrente ha modifiche non salvate.
*/
  public hasPendingChanges(): boolean {
    if (!this.isPendingChangesGuardEnabled()) {
      return false;
    }

    const ds = this.datasource?.value as any;
    return !!(ds && typeof ds.hasPendingChanges === 'function' && ds.hasPendingChanges());
  }

  private shouldScheduleWizardFocusAfterAction(item: MetadatiCustomActionTabella | null | undefined, previousTabValue: number): boolean {
    if (!this.isWizard) {
      return false;
    }

    if (this.activeTabValue !== previousTabValue) {
      return true;
    }

    const caption = String(item?.button_caption || '').trim().toLowerCase();
    const image = String((item as any)?.button_image || '').trim().toLowerCase();
    if (caption === 'wizard.next.action' || caption === 'wizard.prev.action') {
      return true;
    }

    return image === 'wizard-next-btn' || image === 'wizard-prev-btn';
  }

  private scheduleWizardFirstFieldFocus(): void {
    if (!this.isWizard) {
      return;
    }

    this.clearWizardFocusTimer();
    this.wizardFocusRetry = 0;
    this.focusWizardFirstFieldWithRetry();
  }

  private clearWizardFocusTimer(): void {
    if (this.wizardFocusTimer !== null) {
      clearTimeout(this.wizardFocusTimer);
      this.wizardFocusTimer = null;
    }
  }

  private focusWizardFirstFieldWithRetry(): void {
    if (this.focusFirstEnabledFieldInActiveTab()) {
      this.clearWizardFocusTimer();
      return;
    }

    this.wizardFocusRetry += 1;
    if (this.wizardFocusRetry >= this.wizardFocusMaxRetry) {
      this.clearWizardFocusTimer();
      return;
    }

    this.wizardFocusTimer = setTimeout(() => {
      this.focusWizardFirstFieldWithRetry();
    }, 90);
  }

  private focusFirstEnabledFieldInActiveTab(): boolean {
    const host = this.hostElementRef?.nativeElement;
    if (!host) {
      return false;
    }

    const scope = this.resolveActiveFocusableScope(host);
    if (!scope) {
      return false;
    }

    const selector = [
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[role="combobox"]',
      '.p-select',
      '.p-autocomplete-input',
      '.p-datepicker-input',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    const candidates = Array.from(scope.querySelectorAll<HTMLElement>(selector));
    for (const candidate of candidates) {
      if (!this.isCandidateFocusable(candidate)) {
        continue;
      }

      candidate.focus({ preventScroll: false });
      return true;
    }

    return false;
  }

  private resolveActiveFocusableScope(host: HTMLElement): HTMLElement | null {
    if (this.isWizard) {
      const indexedPanels = Array.from(
        host.querySelectorAll<HTMLElement>('.p-tabpanels .p-tabpanel, .p-tabpanels [role="tabpanel"], .p-tabpanels p-tabpanel')
      );
      const indexedCandidate = indexedPanels[this.activeTabValue];
      if (indexedCandidate) {
        return indexedCandidate;
      }
    }

    const activePanel = Array.from(
      host.querySelectorAll<HTMLElement>('.p-tabpanel, [role="tabpanel"], p-tabpanel')
    ).find((panel) => this.isElementVisible(panel) && panel.getAttribute('aria-hidden') !== 'true');

    if (activePanel) {
      return activePanel;
    }

    return host.querySelector<HTMLElement>('.parametric-dialog-body, .parametric-dialog-form') || host;
  }

  private isCandidateFocusable(candidate: HTMLElement): boolean {
    if (!candidate) {
      return false;
    }

    if (candidate.classList.contains('p-tabpanel') || candidate.classList.contains('p-tab') || candidate.classList.contains('p-tablist')) {
      return false;
    }

    const tagName = String(candidate.tagName || '').toLowerCase();
    if (tagName === 'p-tabpanel' || tagName === 'p-tab' || tagName === 'p-tabpanels') {
      return false;
    }

    if (candidate.closest('.edit-form-button-bar')) {
      return false;
    }

    if (!this.isElementVisible(candidate)) {
      return false;
    }

    const attrDisabled = candidate.hasAttribute('disabled')
      || candidate.getAttribute('aria-disabled') === 'true'
      || candidate.getAttribute('tabindex') === '-1';
    if (attrDisabled) {
      return false;
    }

    if (candidate.classList.contains('p-disabled') || !!candidate.closest('.p-disabled, [disabled]')) {
      return false;
    }

    const tabIndex = candidate.tabIndex;
    if (tabIndex < 0) {
      return false;
    }

    return true;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private isPendingChangesGuardEnabled(): boolean {
    const cfg: any = this.config?.data;
    return !Boolean(cfg?.inMemoryMode);
  }

  private installDialogCloseGuard(): void {
    if (!this.ref || this.originalDialogClose) {
      return;
    }

    this.originalDialogClose = this.ref.close.bind(this.ref);
    (this.ref as any).close = (result?: any) => {
      void this.tryCloseDialog(result);
    };
  }

  private async tryCloseDialog(result?: any): Promise<void> {
    if (!this.ref || !this.originalDialogClose) {
      return;
    }
    const hasPendingChanges = this.hasPendingChanges();
    this.onDialogCloseRequested.emit({
      result,
      hasPendingChanges
    });

    if (!this.bypassDialogCloseGuard && hasPendingChanges) {
      const canProceed = await this.datasource?.value?.confirmProceedWithPendingChanges?.('navigate');
      if (!canProceed) {
        return;
      }
    }

    this.bypassDialogCloseGuard = true;
    try {
      this.originalDialogClose(result);
    } finally {
      this.bypassDialogCloseGuard = false;
    }
  }

  private bindHeaderCloseGuard(): void {
    if (!this.ref || typeof document === 'undefined') {
      return;
    }

    setTimeout(() => {
      const host = this.hostElementRef?.nativeElement;
      const dialogRoot = host?.closest('.p-dialog') as HTMLElement | null;
      const closeButton = dialogRoot?.querySelector('.p-dialog-close-button, .p-dialog-header-close-button') as HTMLElement | null;
      if (!closeButton || closeButton === this.dialogHeaderCloseButton) {
        return;
      }

      this.unbindHeaderCloseGuard();
      this.dialogHeaderCloseButton = closeButton;
      this.dialogHeaderCloseListener = (event: Event) => {
        if (this.headerClosePromptInProgress) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          return;
        }

        if (!this.hasPendingChanges()) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        this.headerClosePromptInProgress = true;
        Promise.resolve(this.tryCloseDialog(undefined)).finally(() => {
          this.headerClosePromptInProgress = false;
        });
      };

      this.dialogHeaderCloseButton.addEventListener('pointerdown', this.dialogHeaderCloseListener, true);
      this.dialogHeaderCloseButton.addEventListener('mousedown', this.dialogHeaderCloseListener, true);
      this.dialogHeaderCloseButton.addEventListener('click', this.dialogHeaderCloseListener, true);
    }, 0);
  }

  private unbindHeaderCloseGuard(): void {
    if (this.dialogHeaderCloseButton && this.dialogHeaderCloseListener) {
      this.dialogHeaderCloseButton.removeEventListener('pointerdown', this.dialogHeaderCloseListener, true);
      this.dialogHeaderCloseButton.removeEventListener('mousedown', this.dialogHeaderCloseListener, true);
      this.dialogHeaderCloseButton.removeEventListener('click', this.dialogHeaderCloseListener, true);
    }
    this.dialogHeaderCloseButton = null;
    this.dialogHeaderCloseListener = undefined;
  }

  private installDynamicDialogLifecycleGuard(): void {
    if (!this.ref || !this.dialogService || this.patchedDialogInstance) {
      return;
    }

    const instance: any = this.dialogService.getInstance(this.ref as any);
    if (!instance) {
      return;
    }

    this.patchedDialogInstance = instance;
    this.originalDialogOnVisibleChange = typeof instance.onVisibleChange === 'function'
      ? instance.onVisibleChange.bind(instance)
      : undefined;
    this.originalDialogOnHide = typeof instance.onDialogHide === 'function'
      ? instance.onDialogHide.bind(instance)
      : undefined;

    instance.onVisibleChange = (visible: boolean) => {
      if (visible === false && !this.bypassDialogCloseGuard && this.hasPendingChanges()) {
        // Keep the dialog open and delegate closing decision to pending-changes confirmation.
        instance.visible = true;
        if (!this.headerClosePromptInProgress) {
          this.headerClosePromptInProgress = true;
          Promise.resolve(this.tryCloseDialog(undefined)).finally(() => {
            this.headerClosePromptInProgress = false;
          });
        }
        return;
      }

      if (this.originalDialogOnVisibleChange) {
        this.originalDialogOnVisibleChange(visible);
      }
    };

    instance.onDialogHide = (event: any) => {
      if (this.bypassDialogCloseGuard || !this.hasPendingChanges()) {
        if (this.originalDialogOnHide) {
          this.originalDialogOnHide(event);
        }
        return;
      }

      // Prevent late hide-driven close when pending changes exist.
      instance.visible = true;
    };
  }

  private uninstallDynamicDialogLifecycleGuard(): void {
    if (!this.patchedDialogInstance) {
      return;
    }

    if (this.originalDialogOnVisibleChange) {
      this.patchedDialogInstance.onVisibleChange = this.originalDialogOnVisibleChange;
    }
    if (this.originalDialogOnHide) {
      this.patchedDialogInstance.onDialogHide = this.originalDialogOnHide;
    }

    this.patchedDialogInstance = null;
    this.originalDialogOnVisibleChange = undefined;
    this.originalDialogOnHide = undefined;
  }

  /**
* Conteggio modifiche pendenti correnti, usato dal badge toolbar.
*/
  public get pendingChangesCount(): number {
    if (!this.isPendingChangesGuardEnabled()) {
      return 0;
    }

    const ds = this.datasource?.value as any;
    if (!ds || typeof ds.getPendingChanges !== 'function') {
      return 0;
    }

    try {
      const pending = ds.getPendingChanges();
      return Array.isArray(pending) ? pending.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Dopo salvataggi metadata forza il reload delle traduzioni per evitare chiavi non risolte
   * quando la schermata viene riaperta subito dopo.
   */
  private async reloadTranslationsIfMetadataSave(): Promise<void> {
    const tableName = String(this.datasource?.value?.metaInfo?.tableMetadata?.md_nome_tabella || '').toLowerCase();
    const routeName = String(this.datasource?.value?.route?.value || this.routeName?.value || '').toLowerCase();

    const isMetadataContext = tableName.startsWith('_metadati__')
      || tableName.startsWith('dom_')
      || routeName.includes('metadati')
      || routeName.includes('metadata');

    if (!isMetadataContext) {
      return;
    }

    try {
      await this.trnsl.ensureTranslationsLoaded(true);
    } catch {
      // Non bloccare il flusso save in caso di errore reload traduzioni.
    }
  }
}

