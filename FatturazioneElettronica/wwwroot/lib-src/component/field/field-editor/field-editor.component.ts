import { ChangeDetectorRef, Component, DoCheck, ElementRef, HostBinding, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild, forwardRef } from '@angular/core';
import { NgClass, NgComponentOutlet, NgStyle } from '@angular/common';
import { MetadatiColonna } from '../../../class/metadati_colonna';

import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { MetaInfo } from '../../../class/metaInfo';
import { TooltipModule } from 'primeng/tooltip';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { BehaviorSubject, Subscription } from 'rxjs';
import { FormatGridViewValuePipe } from '../../../pipe/format-grid-view-value.pipe';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { UpdateInfo } from '../../../class/updateInfo';
import { BoundedRepeaterComponent } from '../../bounded-repeater/bounded-repeater.component';
import { DialogModule } from 'primeng/dialog';
import { UserInfoService } from '../../../service/user-info.service';
import { MetadataEditorService } from '../../../service/metadata-editor.service';
import { ParametricDialogComponent } from '../../../component/parametric-dialog/parametric-dialog.component';

@Component({
  selector: 'wuic-field-editor',
  imports: [NgComponentOutlet, NgStyle, NgClass, TranslateModule, FormsModule, TooltipModule, FormatGridViewValuePipe, forwardRef(() => BoundedRepeaterComponent), DialogModule],
  templateUrl: './field-editor.component.html',
  styleUrl: './field-editor.component.scss'
})
export class FieldEditorComponent implements OnInit, OnChanges, OnDestroy, DoCheck {
  private static readonly LABEL_FOR_SUPPORTED_WIDGETS = new Set<string>([
    'text',
    'textarea',
    'txt_area',
    'number',
    'date',
    'datetime',
    'time',
    'point',
    'polygon',
    'geometry'
  ]);

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource?: any;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: any;
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly?: boolean;
  /**
   * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() isFilter?: boolean;
  /**
   * Input dal componente padre per hide label; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideLabel?: boolean;
  /**
   * Input dal componente padre per force show label; usata nella configurazione e nel rendering del componente.
   */
  @Input() forceShowLabel?: boolean;
  /**
   * Input dal componente padre per operator; usata nella configurazione e nel rendering del componente.
   */
  @Input() operator: string;

  /**
   * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedIndex: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp: BehaviorSubject<any>;
  /**
   * Tabindex assegnato dinamicamente dal parent in base all'ordine campi del form.
   */
  @Input() tabIndex?: number;
  /**
   * Callback opzionale per autosave inline-cell-editing in contesto grid.
   */
  @Input() onInlineCellValueChange?: (rowData: any, metaColumn: MetadatiColonna) => void;

  /**
   * Proprieta di stato del componente per widget definition, usata dalla logica interna e dal template.
   */
  widgetDefinition: any;
  /**
   * Proprieta di stato del componente per widget map, usata dalla logica interna e dal template.
   */
  widgetMap: {
    [key: string]: {
      component?: any,
      loader?: () => Promise<any>,
      width?: string,
      height?: string
    }
  };
  /**
   * Proprieta di stato del componente per widget, usata dalla logica interna e dal template.
   */
  widget: any;
  /**
   * Proprieta di stato del componente per resolved component, usata dalla logica interna e dal template.
   */
  resolvedComponent: any = null;
  /**
   * Mantiene il tipo widget precedente per intercettare cambi dinamici su `field.mc_ui_column_type`
   * anche quando l'oggetto `field` mantiene lo stesso riferimento.
   */
  private lastWidgetKey: string = '';
  /**
   * Proprieta di stato del componente per wtoolbox, usata dalla logica interna e dal template.
   */
  wtoolbox: typeof WtoolboxService;
  /**
   * Proprieta di stato del componente per popup ref, usata dalla logica interna e dal template.
   */
  popupRef: DynamicDialogRef<ParametricDialogComponent>;
  private inlineGridValueSubscription?: Subscription;
  private inlineGridSkipFirstEmission = true;

  /**
   * Proprieta di stato del componente per search action, usata dalla logica interna e dal template.
   */
  searchAction: BehaviorSubject<string> = new BehaviorSubject<string>('list');
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a search visible.
   */
  searchVisible: boolean = false;

  /**
* Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
* @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
*/


  @HostBinding('class') get classes(): string | null {
    return this.field.extras?.form?.columns ? ('col-md-' + (12 / this.field.extras?.form?.columns)) : this.metaInfo.tableMetadata.extraProps?.archetypes?.form?.columns ? ('col-md-' + (12 / this.metaInfo.tableMetadata.extraProps?.archetypes?.form?.columns)) : MetadataProviderService.widgetDefinition.formColumns > 1 ? 'col-md-' + (12 / MetadataProviderService.widgetDefinition.formColumns) : null;
  }

  // ---------------------------------------------------------------------------
  // DOM-exposed runtime state (2026-04-22): `window.ng.getComponent()` non e'
  // piu' disponibile dopo `enableProdMode()` nei deploy. I test E2E leggevano
  // `cmp.field.mc_ui_column_type`, `cmp.field.mc_logic_editable`, `cmp.field
  // .mc_hide_in_edit`, `cmp.record[field]`, `cmp.isEditForm` via ng.getComponent.
  //
  // IMPLEMENTAZIONE: setAttribute imperativo in syncDomAttrs() invocato da
  // ngOnChanges + ngDoCheck. HostBinding getter-based NON e' affidabile in
  // Angular 21 zoneless: il getter fire solo quando Angular fa CD per il
  // componente, e con il flow tipico edit-form (record iniettato tramite
  // BehaviorSubject + field arriva al primo render) il CD sul host element
  // non sempre ri-valuta i getter in tempo utile per il primo read del test.
  // setAttribute diretto su hostElementRef.nativeElement bypassa completamente
  // il ciclo CD.
  // ---------------------------------------------------------------------------

  private syncDomAttrs(): void {
    const el = this.hostElementRef?.nativeElement;
    if (!el) return;

    const f = this.field as any;
    const widgetType = String(f?.mc_ui_column_type || '').trim();
    const editable = f?.mc_logic_editable === false ? 'false' : 'true';
    // Il flag arriva in due forme (snake_case + camelCase alias dal server JSON raw).
    const hideInEdit = (f?.mchideinedit || f?.mc_hide_in_edit) ? 'true' : 'false';
    // isEditForm non e' un Input di FieldEditorComponent: rilevato via ancestor
    // DOM `wuic-parametric-dialog` (il dialog lo riceve via DynamicDialogConfig.data).
    const isEditForm = el.closest('wuic-parametric-dialog, .edit-form-content') ? 'true' : 'false';
    const hasRecord = this.record ? 'true' : 'false';
    const fieldName = String(this.field?.mc_nome_colonna || this.field?.ang_name || '').trim();
    const fieldId = Number(this.field?.mc_id || 0);

    el.setAttribute('data-widget-type', widgetType);
    el.setAttribute('data-editable', editable);
    el.setAttribute('data-hide-in-edit', hideInEdit);
    el.setAttribute('data-is-edit-form', isEditForm);
    el.setAttribute('data-has-record', hasRecord);
    el.setAttribute('data-field-name', fieldName);
    el.setAttribute('data-field-id', fieldId > 0 ? String(fieldId) : '');

    // Valore corrente del campo: per lookup esponiamo `.value` annidato;
    // per altri tipi toString; objects → JSON.stringify.
    let fieldValue = '';
    const nameKey = fieldName;
    if (nameKey && this.record) {
      const subj = (this.record as any)[nameKey];
      if (subj != null) {
        if (typeof subj === 'object' && 'value' in subj) {
          const inner = subj.value;
          if (inner == null) {
            fieldValue = '';
          } else if (typeof inner === 'object') {
            try { fieldValue = JSON.stringify(inner); } catch { fieldValue = ''; }
          } else {
            fieldValue = String(inner);
          }
        } else if (typeof subj === 'object') {
          try { fieldValue = JSON.stringify(subj); } catch { fieldValue = ''; }
        } else {
          fieldValue = String(subj);
        }
      }
    }
    el.setAttribute('data-field-value', fieldValue);
  }

  /**
* function Object() { [native code] }
* @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
* @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param userInfo Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param metadataEditorSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
*/
  constructor(
    public metaSrv: MetadataProviderService,
    private trslSrv: TranslationManagerService,
    private cd: ChangeDetectorRef,
    public userInfo: UserInfoService,
    private metadataEditorSrv: MetadataEditorService,
    private hostElementRef: ElementRef<HTMLElement>
  ) {
    this.wtoolbox = WtoolboxService;
    this.field = new MetadatiColonna('');
    this.metaInfo = new MetaInfo();

    this.widgetDefinition = MetadataProviderService.widgetDefinition;

    this.widgetMap = MetadataProviderService.widgetMap;

  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {

    if (this.field.mc_ui_column_type == 'multiple_check' && this.isFilter && this.operator == 'eq') {
      this.operator = 'eqor';
    }

    void this.ensureComponentLoaded();
    this.setupInlineGridValueSubscription();
  }

  /**
* Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
* @param _changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  ngOnChanges(_changes: SimpleChanges): void {
    void this.ensureComponentLoaded();
    this.setupInlineGridValueSubscription();
    this.syncDomAttrs();
  }

  ngOnDestroy(): void {
    this.inlineGridValueSubscription?.unsubscribe();
    this.inlineGridValueSubscription = undefined;
  }

  /**
   * Rileva mutazioni in-place del tipo widget (es. da text a dictionary nel designer)
   * e riallinea il componente editor visualizzato.
   */
  ngDoCheck(): void {
    const currentWidgetKey = this.field?.mc_ui_column_type || 'text';
    if (currentWidgetKey !== this.lastWidgetKey) {
      this.lastWidgetKey = currentWidgetKey;
      this.resolvedComponent = null;
      void this.ensureComponentLoaded();
    }
    // Re-sync DOM attrs a ogni CD: `record` e altri input mutano in-place
    // (BehaviorSubject.next()) senza innescare ngOnChanges.
    this.syncDomAttrs();
  }

  /**
* Gestisce la logica operativa di `ensureComponentLoaded` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
*/
  private async ensureComponentLoaded(): Promise<void> {
    const widgetKey = this.field?.mc_ui_column_type || 'text';
    this.lastWidgetKey = widgetKey;
    const widget = this.widgetMap[widgetKey] || this.widgetMap['text'];
    this.widget = widget;

    if (!widget) {
      this.resolvedComponent = null;
      return;
    }

    if (widget.component) {
      this.resolvedComponent = widget.component;
      return;
    }

    if (!widget.loader) {
      this.resolvedComponent = this.widgetMap['text']?.component ?? null;
      return;
    }

    const widgetWithPromise = widget as typeof widget & { __loadingPromise?: Promise<any> };
    if (!widgetWithPromise.__loadingPromise) {
      widgetWithPromise.__loadingPromise = widget.loader()
        .then((component) => {
          widget.component = component;
          return component;
        })
        .finally(() => {
          delete widgetWithPromise.__loadingPromise;
        });
    }

    const component = await widgetWithPromise.__loadingPromise;
    if ((this.field?.mc_ui_column_type || 'text') !== widgetKey) {
      return;
    }

    this.resolvedComponent = component;
    this.cd.markForCheck();
  }

  //BETTER TO USE A PIPE
  /**
* Recupera i dati/valori richiesti da `getComponent` usando metadati server `_Metadati_*` per risolvere i campi.
* @returns Valore risolto da `getComponent` in base ai criteri implementati.
*/
  getComponent() {
    this.widget = this.widgetMap[this.field.mc_ui_column_type] || this.widgetMap['text'];
    if (!this.widget) {
      console.error('Widget not found for type: ' + this.field.mc_ui_column_type);
      return this.resolvedComponent || null;
    }

    if (!this.resolvedComponent) {
      void this.ensureComponentLoaded();
    }

    return this.resolvedComponent;
  }

  //BETTER TO USE A PIPE
  /**
* Recupera informazioni tramite `getInputs` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
*/
  getInputs() {
    const inputs: any = {
      record: this.record,
      field: this.field,
      metaInfo: this.metaInfo,
      isFilter: this.isFilter,
      nestedIndex: this.nestedIndex,
      triggerProp: this.triggerProp,
      tabIndex: this.tabIndex,
      readOnly: this.field.mc_editable_insert_only && !this.record?.__new?.value ? true : this.readOnly
    };

    const widgetType = String(this.field?.mc_ui_column_type || '').trim();
    if (widgetType === 'lookupByID' || widgetType === 'multiple_check' || widgetType === 'dictionary') {
      inputs.ariaLabelledBy = this.getAccessibleLabelId();
    }

    return inputs;
  }

  getAccessibleLabelId(): string | null {
    const controlId = String(this.field?.ang_name || '').trim();
    return controlId ? `${controlId}__label` : null;
  }

  /**
   * Restituisce l'id del controllo solo per widget che espongono un input reale con id agganciabile.
   */
  getAccessibleControlId(): string | null {
    // `for` is valid only when an editable control is actually rendered.
    if (!this.condition()) {
      return null;
    }

    const widgetType = String(this.field?.mc_ui_column_type || '').trim();
    const controlId = String(this.field?.ang_name || '').trim();
    if (!controlId) {
      return null;
    }

    return FieldEditorComponent.LABEL_FOR_SUPPORTED_WIDGETS.has(widgetType) ? controlId : null;
  }

  //BETTER TO USE A PIPE
  /**
* Gestisce la logica di `condition` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Esito booleano calcolato dal metodo.
*/
  condition() {
    if (this.field) {

      // Custom edit templates should force editor rendering only in edit mode.
      // In readOnly/detail mode we keep the standard condition logic to avoid
      // rendering both editor and span at the same time.
      if (this.metaInfo.tableMetadata.md_edit_template && !this.readOnly) {
        return true;
      }

      return this.field.mc_ui_column_type == 'button' || this.field.mc_ui_column_type == 'boolean' || this.field.mc_ui_column_type == 'number_boolean' || /*this.field.mc_ui_column_type == 'number' ||*/ (!this.readOnly && (this.isFilter || (this.field.mc_logic_editable && (!this.field.mc_is_computed || this.field.mc_ui_column_type == 'multiple_check') && !this.field.mc_is_db_computed && (this.field.mc_editable_insert_only ? (this.record ? this.record.__new : true) : true))))
    }
  }

  //BETTER TO USE A PIPE
  /**
* Gestisce la logica di `conditionSpan` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Esito booleano calcolato dal metodo.
*/
  conditionSpan() {
    if (this.field) {
      // In custom edit template mode we must render only the editor widget
      // to avoid duplicated control + readonly span for the same field.
      if (this.metaInfo.tableMetadata.md_edit_template && !this.readOnly) {
        return false;
      }

      return !this.isFilter && this.field.mc_ui_column_type != 'button' && (this.readOnly || !this.field.mc_logic_editable || (this.field.mc_is_computed && this.field.mc_ui_column_type != 'multiple_check') || this.field.mc_is_db_computed || (this.field.mc_editable_insert_only ? (this.record ? !this.record.__new : false) : false)) && this.field.mc_ui_column_type != 'boolean' && this.field.mc_ui_column_type != 'number_boolean' //&& this.field.mc_ui_column_type != 'number'
    }

    return false;
  }

  /**
* Applica aggiornamenti di stato tramite `setOperator` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  setOperator($event) {
    if (this.field.mc_ui_column_type == 'lookupByID' && this.isFilter) {
      this.record[this.field.mc_nome_colonna].next(null);
      this.record[this.field.mc_nome_colonna + '__lookup_obj'].next(null);
    }

    setTimeout(() => {
      this.metaInfo.operators[this.field.mc_nome_colonna] = $event.target.value;
    }, 200);
  }

  /**
   * Click handler for the suggest button (sparkles icon next to the label
   * when `mc_suggest_value_callback` is configured). Routes through the
   * generic `WtoolboxService.runUserCallback` helper so any throw becomes
   * a typed `errors.client.user_callback.failed` dialog instead of the
   * raw `errors.client.unknown` fallback.
   */
  async onSuggestClick(field: any) {
    await WtoolboxService.runUserCallback(
      'mc_suggest_value_callback',
      field.mc_suggest_value_callback__fn,
      [this.record, field, this.metaInfo, WtoolboxService],
      {
        column: field?.mc_nome_colonna,
        route:  String(this.metaInfo?.tableMetadata?.md_route_name || ''),
        phase:  'suggest-click',
      },
      { targetName: 'FieldEditorComponent.onSuggestClick' }
    );
  }

  /**
* Gestisce la logica di `editLookupRecord` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, propagando aggiornamenti sui campi reattivi usati dalla UI.
*/
  editLookupRecord() {

    let nestedSource = this.field.editor.value.nestedSource;
    let header = this.trslSrv.instant('edit') + ' ' + nestedSource.metaInfo.tableMetadata.md_display_string;

    let data = nestedSource.resultInfo.dato.find((item) => item[this.field.mc_ui_lookup_dataValueField] == this.record[this.field.mc_nome_colonna].value);
    nestedSource.setCurrent(data);

    if (this.metaInfo.tableMetadata.md_display_formula) {
      header = this.metaInfo.tableMetadata.md_display_formula_fn(this.metaInfo, nestedSource.resultInfo.current, nestedSource, WtoolboxService);
    }

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(nestedSource),
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center',
      duplicate: true
    });

    ref.onClose.subscribe(async (result) => {
      if (result) {

        nestedSource.filterInfo = {
          logic: "OR",
          filters: [
            { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: this.record[this.field.mc_nome_colonna].value, __extra: true },
            { field: "__extra", operatore: undefined, value: undefined }
          ]
        }

        let val = this.record[this.field.mc_nome_colonna].value;
        this.record[this.field.mc_nome_colonna].next(null);

        nestedSource.fetchInfo$.subscribe((info) => {
          setTimeout(() => {
            this.record[this.field.mc_nome_colonna].next(val);
            this.record[this.field.mc_nome_colonna + '__lookup_obj'].next(info.resultInfo.dato[0]);
          }, 100);
        });

        await nestedSource.fetchData();

      }
    });
  }

  /**
* Gestisce la logica di `addLookupRecord` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, propagando aggiornamenti sui campi reattivi usati dalla UI.
*/
  addLookupRecord() {
    let nestedSource = this.field.editor.value.nestedSource;

    let header = this.trslSrv.instant('insert') + ' ' + nestedSource.metaInfo.tableMetadata.md_display_string;

    let defaulted = nestedSource.addNewRecord();

    this.popupRef = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        record: defaulted,
        pristine: nestedSource.pristine,
        metaInfo: nestedSource.metaInfo,
        datasource: new BehaviorSubject<DataSourceComponent>(nestedSource),
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center',
      duplicate: true
    });

    this.popupRef.onClose.subscribe(async (result: UpdateInfo) => {
      if (result) {
        nestedSource.filterInfo = {
          logic: "OR",
          filters: [
            { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: result.result, __extra: true },
            { field: "__extra", operatore: undefined, value: undefined, fixed: true }
          ]
        }

        if (this.field.mc_selection_changed_custom_function__fn) {
          this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, result.result, null, WtoolboxService, this.nestedIndex);
        }

        nestedSource.fetchInfo$.subscribe((info) => {
          this.record[this.field.mc_nome_colonna].next(nestedSource.resultInfo.current[nestedSource.metaInfo.pKey.mc_nome_colonna].value);
          this.record[this.field.mc_nome_colonna + '__lookup_obj'].next(nestedSource.resultInfo.dato[0]);

          // nestedSource.fetchInfo$.unsubscribe();
          this.cd.detectChanges();
        });

        await nestedSource.fetchData();

      }
    });

  }

  /**
* Gestisce la logica di `searchLookupRecord` con il flusso specifico definito dalla sua implementazione.
*/
  searchLookupRecord() {
    this.searchVisible = true;
  }

  /**
* Gestisce la logica operativa di `selectRow` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param rowData Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @param dt Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  async selectRow($event, rowData, dt) {
    let self = this;

    self.record[self.field.mc_nome_colonna].next(null);

    let nestedSource = self.field.editor.value.nestedSource;

    nestedSource.filterInfo = {
      logic: "OR",
      filters: [
        { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: rowData[self.field.mc_ui_lookup_dataValueField], __extra: true },
        { field: "__extra", operatore: undefined, value: undefined, fixed: true }
      ]
    }

    if (this.field.mc_selection_changed_custom_function__fn) {
      this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, rowData[self.field.mc_ui_lookup_dataValueField], null, WtoolboxService, this.nestedIndex);
    }

    nestedSource.fetchInfo$.subscribe((info) => {
      setTimeout(() => {
        self.record[self.field.mc_nome_colonna].next(rowData[self.field.mc_ui_lookup_dataValueField]);
        self.record[self.field.mc_nome_colonna + '__lookup_obj'].next(rowData);

        this.cd.detectChanges();

        self.searchVisible = false;
      }, 100);
    });

    await nestedSource.fetchData();
  }

  /**
* Gestisce la logica operativa di `onLabelDoubleClick` orchestrando le chiamate `isCurrentUserAdmin` e `preventDefault`.
* @param event Evento UI o payload evento che innesca il flusso del metodo.
*/
  onLabelDoubleClick(event: MouseEvent): void {
    if (!this.userInfo.isCurrentUserAdmin() || this.isFilter) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void this.metadataEditorSrv.openMetadataColumnEditor(this.field, this.metaSrv);
  }

  private setupInlineGridValueSubscription(): void {
    this.inlineGridValueSubscription?.unsubscribe();
    this.inlineGridValueSubscription = undefined;

    if (!this.onInlineCellValueChange || this.isFilter || !this.field?.mc_nome_colonna) {
      return;
    }

    const fieldObs = this.record?.[this.field.mc_nome_colonna];
    if (!fieldObs || typeof fieldObs.subscribe !== 'function') {
      return;
    }

    this.inlineGridSkipFirstEmission = true;
    this.inlineGridValueSubscription = fieldObs.subscribe(() => {
      if (this.inlineGridSkipFirstEmission) {
        this.inlineGridSkipFirstEmission = false;
        return;
      }

      const rowModel = this.resolveInlineGridRowModel();
      if (!rowModel) {
        return;
      }

      this.onInlineCellValueChange?.(rowModel, this.field);
    });
  }

  private resolveInlineGridRowModel(): any {
    const ds = (this.datasource as any)?.value ?? this.datasource as any;
    const rowFromGrid = this.tryResolveInlineGridRowFromDatasource(ds);
    if (rowFromGrid) {
      return rowFromGrid;
    }

    if (ds && typeof ds.getModelFromObservable === 'function') {
      try {
        return ds.getModelFromObservable(this.record);
      } catch {
      }
    }

    return this.record;
  }

  private tryResolveInlineGridRowFromDatasource(ds: any): any | null {
    const rows = Array.isArray(ds?.resultInfo?.dato) ? ds.resultInfo.dato : null;
    if (!rows || !rows.length || !this.field?.mc_nome_colonna || !this.record) {
      return null;
    }

    const pkeyName = ds?.metaInfo?.pKey?.mc_nome_colonna;
    const getValue = (v: any) => this.unwrapObservableLike(v);
    const recordPk = pkeyName ? getValue(this.record?.[pkeyName]) : null;
    if (pkeyName && recordPk !== null && recordPk !== undefined && String(recordPk).trim() !== '') {
      const byPk = rows.find((row: any) => {
        const rowPk = getValue(row?.[pkeyName]);
        return rowPk !== null && rowPk !== undefined && String(rowPk) === String(recordPk);
      });
      if (byPk) {
        return byPk;
      }
    }

    const recordGuid = getValue(this.record?.__guid);
    if (recordGuid !== null && recordGuid !== undefined && String(recordGuid).trim() !== '') {
      const byGuid = rows.find((row: any) => {
        const rowGuid = getValue(row?.__guid);
        return rowGuid !== null && rowGuid !== undefined && String(rowGuid) === String(recordGuid);
      });
      if (byGuid) {
        return byGuid;
      }
    }

    return null;
  }

  private unwrapObservableLike(value: any): any {
    if (value && typeof value === 'object' && 'value' in value) {
      return (value as any).value;
    }
    return value;
  }

}



