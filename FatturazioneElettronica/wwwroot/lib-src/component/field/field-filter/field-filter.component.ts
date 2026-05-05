import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { NgClass, NgComponentOutlet, NgStyle } from '@angular/common';
import { MetadatiColonna } from '../../../class/metadati_colonna';

import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { MetaInfo } from '../../../class/metaInfo';
import { TooltipModule } from 'primeng/tooltip';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { AvailableOperatorsPipe } from '../../../pipe/available-operators.pipe';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { PointFilterComponent } from '../point-filter/point-filter.component';
import { NumberEditorComponent } from '../number-editor/number-editor.component';
import { BehaviorSubject, Subscription } from 'rxjs';
@Component({
    selector: 'wuic-field-filter',
    imports: [NgComponentOutlet, NgStyle, NgClass, TranslateModule, FormsModule, TooltipModule, AvailableOperatorsPipe, PointFilterComponent, NumberEditorComponent],
    templateUrl: './field-filter.component.html',
    styleUrl: './field-filter.component.scss'
})
export class FieldFilterComponent implements OnInit, OnChanges, OnDestroy {
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
   * Input dal componente padre per hide label; usata nella configurazione e nel rendering del componente.
   */
  @Input() hideLabel?: boolean;
  /**
   * Input dal componente padre per operator; usata nella configurazione e nel rendering del componente.
   */
  @Input() operator: string;
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource?: BehaviorSubject<DataSourceComponent>;

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
  rangeFrom: any = null;
  rangeTo: any = null;
  rangeFromRecord: { [key: string]: BehaviorSubject<any> } = {};
  rangeToRecord: { [key: string]: BehaviorSubject<any> } = {};
  rangeFromField!: MetadatiColonna;
  rangeToField!: MetadatiColonna;
  rangeFromFieldName = '';
  rangeToFieldName = '';
  private suppressRangeEditorWriteback = false;
  private rangeFromEditorFirstEmission = true;
  private rangeToEditorFirstEmission = true;
  private rangeFieldSubscription?: Subscription;
  private rangeFromEditorSubscription?: Subscription;
  private rangeToEditorSubscription?: Subscription;
  private readonly availableOperatorsPipe = new AvailableOperatorsPipe();
  /**
   * Proprieta di stato del componente per wtoolbox, usata dalla logica interna e dal template.
   */
  wtoolbox: typeof WtoolboxService;

      /**
   * Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('class') get classes(): string | null {
    return this.field.extras?.form?.columns ? ('col-md-' + (12 / this.field.extras?.form?.columns)) : this.metaInfo.tableMetadata.extraProps?.archetypes?.form?.columns ? ('col-md-' + (12 / this.metaInfo.tableMetadata.extraProps?.archetypes?.form?.columns)) : MetadataProviderService.widgetDefinition.formColumns > 1 ? 'col-md-' + (12 / MetadataProviderService.widgetDefinition.formColumns) : null;
  }

      /**
   * function Object() { [native code] }
   * @param metaSrv Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
   * @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(public metaSrv: MetadataProviderService, private cd: ChangeDetectorRef) {
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
    this.ensureRangeEditorsInitialized();
    this.bindRangeDescriptorSync();
    this.enforceRangeFilterOperator();
    this.enforceMultiCheckFilterOperator();
    this.ensureCurrentOperatorIsAllowed();

    void this.ensureComponentLoaded();
  }

      /**
   * Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
   * @param _changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  ngOnChanges(_changes: SimpleChanges): void {
    this.ensureRangeEditorsInitialized();
    this.bindRangeDescriptorSync();
    this.enforceRangeFilterOperator();
    this.enforceMultiCheckFilterOperator();
    this.ensureCurrentOperatorIsAllowed();
    void this.ensureComponentLoaded();
  }

  /**
   * Cleanup subscription create per sincronizzare i campi range.
   */
  ngOnDestroy(): void {
    this.rangeFieldSubscription?.unsubscribe();
    this.rangeFromEditorSubscription?.unsubscribe();
    this.rangeToEditorSubscription?.unsubscribe();
    this.rangeFieldSubscription = undefined;
    this.rangeFromEditorSubscription = undefined;
    this.rangeToEditorSubscription = undefined;
  }

  /**
   * Indica se il filtro corrente usa la modalità range.
   */
  isRangeFilter(): boolean {
    return !!this.field?.mc_is_range_filter;
  }

  /**
   * Allinea l'operatore al valore obbligatorio `between` per i range filter.
   */
  private enforceRangeFilterOperator(): void {
    if (!this.isRangeFilter()) {
      return;
    }

    const fieldName = String(this.field?.mc_nome_colonna || '');
    this.operator = 'between';
    if (!this.metaInfo?.operators) {
      this.metaInfo.operators = {};
    }
    if (fieldName) {
      this.metaInfo.operators[fieldName] = 'between';
    }
  }

  /**
   * Mantiene sincronizzati i due input range con il descriptor (BehaviorSubject).
   */
  private bindRangeDescriptorSync(): void {
    if (!this.isRangeFilter() || !this.record || !this.field?.mc_nome_colonna) {
      return;
    }

    const source = this.record[this.field.mc_nome_colonna];
    if (!(source instanceof BehaviorSubject)) {
      return;
    }

    this.rangeFieldSubscription?.unsubscribe();
    this.rangeFieldSubscription = source.subscribe((value: any) => {
      const parsed = this.parseRangeFilterValue(value);
      this.rangeFrom = parsed.from;
      this.rangeTo = parsed.to;
      this.pushRangeValuesToEditors();
      this.cd.markForCheck();
    });
  }

  /**
   * Handler dei campi from/to: aggiorna descriptor con payload serializzato per `between`.
   */
  onRangeChanged(): void {
    if (!this.record || !this.field?.mc_nome_colonna) {
      return;
    }

    this.enforceRangeFilterOperator();

    const normalizedFrom = this.normalizeRangeInput(this.rangeFrom);
    const normalizedTo = this.normalizeRangeInput(this.rangeTo);
    const subject = this.record[this.field.mc_nome_colonna];
    if (!(subject instanceof BehaviorSubject)) {
      return;
    }

    if (normalizedFrom === null || normalizedTo === null) {
      subject.next(null);
      return;
    }

    subject.next(JSON.stringify({ from: normalizedFrom, to: normalizedTo }));
  }

  /**
   * Inizializza i due number-editor (from/to) usati dal range filter.
   */
  private ensureRangeEditorsInitialized(): void {
    if (!this.isRangeFilter() || !this.field?.mc_nome_colonna) {
      return;
    }

    this.rangeFromFieldName = `${this.field.mc_nome_colonna}__range_from`;
    this.rangeToFieldName = `${this.field.mc_nome_colonna}__range_to`;

    if (!this.rangeFromRecord[this.rangeFromFieldName]) {
      this.rangeFromRecord[this.rangeFromFieldName] = new BehaviorSubject<any>(null);
    }
    if (!this.rangeToRecord[this.rangeToFieldName]) {
      this.rangeToRecord[this.rangeToFieldName] = new BehaviorSubject<any>(null);
    }

    this.rangeFromField = this.cloneNumericRangeField(this.rangeFromFieldName);
    this.rangeToField = this.cloneNumericRangeField(this.rangeToFieldName);
    this.rangeFromEditorFirstEmission = true;
    this.rangeToEditorFirstEmission = true;

    this.rangeFromEditorSubscription?.unsubscribe();
    this.rangeToEditorSubscription?.unsubscribe();

    this.rangeFromEditorSubscription = this.rangeFromRecord[this.rangeFromFieldName].subscribe((value: any) => {
      if (this.suppressRangeEditorWriteback) {
        return;
      }
      if (this.rangeFromEditorFirstEmission) {
        this.rangeFromEditorFirstEmission = false;
        return;
      }
      this.rangeFrom = this.normalizeRangeInput(value);
      this.onRangeChanged();
    });
    this.rangeToEditorSubscription = this.rangeToRecord[this.rangeToFieldName].subscribe((value: any) => {
      if (this.suppressRangeEditorWriteback) {
        return;
      }
      if (this.rangeToEditorFirstEmission) {
        this.rangeToEditorFirstEmission = false;
        return;
      }
      this.rangeTo = this.normalizeRangeInput(value);
      this.onRangeChanged();
    });
  }

  /**
   * Clona metadati colonna come number editor dedicato al range (from/to).
   */
  private cloneNumericRangeField(fieldName: string): MetadatiColonna {
    const clone = new MetadatiColonna(fieldName);
    Object.assign(clone, this.field || {});
    clone.mc_nome_colonna = fieldName;
    clone.mc_ui_column_type = 'number';
    clone.mc_display_string_in_edit = '';
    clone.mc_is_range_filter = false;
    return clone;
  }

  /**
   * Aggiorna i number-editor quando cambia il valore serializzato del descriptor.
   */
  private pushRangeValuesToEditors(): void {
    const fromSubject = this.rangeFromRecord?.[this.rangeFromFieldName];
    const toSubject = this.rangeToRecord?.[this.rangeToFieldName];
    if (!fromSubject || !toSubject) {
      return;
    }

    this.suppressRangeEditorWriteback = true;
    try {
      if (fromSubject.value !== this.rangeFrom) {
        fromSubject.next(this.rangeFrom);
      }
      if (toSubject.value !== this.rangeTo) {
        toSubject.next(this.rangeTo);
      }
    } finally {
      this.suppressRangeEditorWriteback = false;
    }
  }

  /**
   * Normalizza input range eliminando stringhe vuote.
   */
  private normalizeRangeInput(value: any): any {
    if (value === undefined || value === null) {
      return null;
    }
    const asString = String(value).trim();
    return asString === '' ? null : asString;
  }

  /**
   * Parsing robusto del valore range serializzato nel filter descriptor.
   */
  private parseRangeFilterValue(value: any): { from: any; to: any } {
    if (value === undefined || value === null || value === '') {
      return { from: null, to: null };
    }

    if (typeof value === 'object') {
      const fromObj = this.normalizeRangeInput((value as any).from);
      const toObj = this.normalizeRangeInput((value as any).to);
      return { from: fromObj, to: toObj };
    }

    const raw = String(value).trim();
    if (!raw) {
      return { from: null, to: null };
    }

    try {
      const parsed = JSON.parse(raw);
      const fromJson = this.normalizeRangeInput(parsed?.from);
      const toJson = this.normalizeRangeInput(parsed?.to);
      return { from: fromJson, to: toJson };
    } catch {
      const separators = ['||', '|', ';', ','];
      for (const separator of separators) {
        if (raw.includes(separator)) {
          const parts = raw.split(separator);
          return {
            from: this.normalizeRangeInput(parts[0]),
            to: this.normalizeRangeInput(parts.slice(1).join(separator))
          };
        }
      }
      return { from: null, to: null };
    }
  }

  /**
   * Forza `eqor` per filtri multicheck (multiple_check o lookupByID con mc_is_multicheck_filter).
   */
  private enforceMultiCheckFilterOperator(): void {
    if (this.isRangeFilter()) {
      return;
    }

    const fieldName = String(this.field?.mc_nome_colonna || '');
    const shouldForceEqOr =
      this.field?.mc_ui_column_type == 'multiple_check'
      || (this.field?.mc_ui_column_type == 'lookupByID' && !!this.field?.mc_is_multicheck_filter);

    if (!shouldForceEqOr) {
      return;
    }

    this.operator = 'eqor';
    if (!this.metaInfo?.operators) {
      this.metaInfo.operators = {};
    }
    if (fieldName) {
      this.metaInfo.operators[fieldName] = 'eqor';
    }
  }

      /**
   * Gestisce la logica operativa di `ensureComponentLoaded` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
   */
  private async ensureComponentLoaded(): Promise<void> {
    const widgetKey = this.field?.mc_ui_column_type || 'text';
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
      isFilter: true
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

  //BETTER TO USE A PIPE
          /**
   * Gestisce la logica di `condition` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
   * @returns Esito booleano calcolato dal metodo.
   */
  condition() {
    if (this.field) {

      if (this.metaInfo.tableMetadata.md_edit_template) {
        return true;
      }

      return this.field.mc_ui_column_type == 'button' || this.field.mc_ui_column_type == 'lookupByID' || this.field.mc_ui_column_type == 'boolean' || this.field.mc_ui_column_type == 'number_boolean' || /*this.field.mc_ui_column_type == 'number' ||*/ (!this.readOnly && (true || (this.field.mc_logic_editable && (this.field.mc_editable_insert_only ? (this.record ? this.record.__new : true) : true))))
    }
  }

  //BETTER TO USE A PIPE
            /**
   * Gestisce la logica operativa di `conditionSpan` in modo coerente con l'implementazione corrente.
   * @returns Risultato elaborato da `conditionSpan` e restituito al chiamante.
   */
  conditionSpan() {
    if (this.field) {
      return !true && this.field.mc_ui_column_type != 'button' && (this.readOnly || !this.field.mc_logic_editable || (this.field.mc_editable_insert_only ? (this.record ? !this.record.__new : false) : false)) && this.field.mc_ui_column_type != 'lookupByID' && this.field.mc_ui_column_type != 'boolean' && this.field.mc_ui_column_type != 'number_boolean' //&& this.field.mc_ui_column_type != 'number'
    }

    return false;
  }

          /**
   * Applica aggiornamenti di stato tramite `setOperator` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
   * @param $event Evento UI/payload evento che innesca la logica del metodo.
   */
  setOperator($event) {
    if (this.isRangeFilter()) {
      this.enforceRangeFilterOperator();
      return;
    }

    const selectedOperator = this.field?.mc_ui_column_type == 'lookupByID' && !!this.field?.mc_is_multicheck_filter
      ? 'eqor'
      : String($event?.target?.value || '');

    if (this.field.mc_ui_column_type == 'lookupByID') {
      if (!(this.record[this.field.mc_nome_colonna] instanceof BehaviorSubject)) {
        this.record[this.field.mc_nome_colonna] = new BehaviorSubject<any>(null);
      }
      if (!(this.record[this.field.mc_nome_colonna + '__lookup_obj'] instanceof BehaviorSubject)) {
        this.record[this.field.mc_nome_colonna + '__lookup_obj'] = new BehaviorSubject<any>(null);
      }
      this.record[this.field.mc_nome_colonna].next(null);
      this.record[this.field.mc_nome_colonna + '__lookup_obj'].next(selectedOperator === 'eqor' ? [] : null);
    }

    setTimeout(() => {
      this.metaInfo.operators[this.field.mc_nome_colonna] = selectedOperator;
    }, 200);
  }

  getOperatorOptions(): any[] {
    const allOperators = Array.isArray(this.widgetDefinition?.filterOperators) ? this.widgetDefinition.filterOperators : [];
    const byFieldType = this.availableOperatorsPipe.transform(allOperators, this.field) || [];
    const canonicalByKey = new Map<string, any>();
    for (const op of allOperators) {
      const k = this.normalizeOperatorKey(op?.key);
      if (k) {
        canonicalByKey.set(k, op);
      }
    }

    const normalizedByFieldType = byFieldType.map((op: any) => {
      const k = this.normalizeOperatorKey(op?.key);
      const canonical = canonicalByKey.get(k);
      if (canonical) {
        // Use canonical display/value from WidgetDefinition.filterOperators.
        return { ...op, key: canonical.key, value: canonical.value };
      }
      return op;
    });

    const allowedKeys = this.getAllowedOperatorKeysFromColumnMetadata();
    if (!allowedKeys.size) {
      return normalizedByFieldType;
    }
    return normalizedByFieldType.filter((op: any) => allowedKeys.has(this.normalizeOperatorKey(op?.key)));
  }

  private getAllowedOperatorKeysFromColumnMetadata(): Set<string> {
    const fieldAny = this.field as any;
    const rawAllowed =
      fieldAny?.filterOperators
      ?? fieldAny?.availableOperators
      ?? fieldAny?.extras?.filter?.filterOperators
      ?? fieldAny?.extras?.filter?.availableOperators
      ?? fieldAny?.extras?.filterOperators
      ?? fieldAny?.extras?.availableOperators;

    if (rawAllowed === undefined || rawAllowed === null || rawAllowed === '') {
      return new Set<string>();
    }

    const list = this.normalizeOperatorList(rawAllowed);
    const normalized = list
      .map((x) => this.normalizeOperatorKey(x))
      .filter((x) => !!x);
    return new Set<string>(normalized);
  }

  private normalizeOperatorList(value: any): string[] {
    if (Array.isArray(value)) {
      return value
        .map((x: any) => {
          if (typeof x === 'string') {
            return x;
          }
          if (x && typeof x === 'object') {
            return String(x.key ?? x.value ?? x.name ?? '');
          }
          return '';
        })
        .filter((x) => !!String(x).trim());
    }

    if (typeof value === 'string') {
      return value
        .split(/[,\s;|]+/)
        .map((x) => x.trim())
        .filter((x) => !!x);
    }

    return [];
  }

  private normalizeOperatorKey(value: any): string {
    const key = String(value || '').trim().toLowerCase();
    if (!key) {
      return '';
    }

    // Tolleranza alias legacy.
    if (key === 'neq') {
      return 'ne';
    }
    if (key === 'lte') {
      return 'le';
    }
    if (key === 'gte') {
      return 'ge';
    }
    return key;
  }

  private ensureCurrentOperatorIsAllowed(): void {
    if (!this.field || this.isRangeFilter()) {
      return;
    }
    const options = this.getOperatorOptions();
    if (!options.length) {
      return;
    }

    const current = this.normalizeOperatorKey(this.operator || this.metaInfo?.operators?.[this.field.mc_nome_colonna]);
    const exists = options.some((op: any) => this.normalizeOperatorKey(op?.key) === current);
    if (exists) {
      return;
    }

    const fallback = options[0]?.key;
    if (!fallback) {
      return;
    }

    this.operator = fallback;
    if (!this.metaInfo?.operators) {
      this.metaInfo.operators = {};
    }
    this.metaInfo.operators[this.field.mc_nome_colonna] = fallback;
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

    return FieldFilterComponent.LABEL_FOR_SUPPORTED_WIDGETS.has(widgetType) ? controlId : null;
  }

}


