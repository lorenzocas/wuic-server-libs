import { AfterViewChecked, AfterViewInit, ChangeDetectorRef, Component, ElementRef, forwardRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { FormsModule } from '@angular/forms';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { IFieldEditor } from '../../../class/IFieldEditor';
import { BehaviorSubject } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { ValidationRule } from '../../../class/validationRule';
import { TranslationManagerService } from '../../../service/translation-manager.service';

@Component({
  selector: 'wuic-lookup-editor',
  imports: [forwardRef(() => DataSourceComponent), AutoCompleteModule, FormsModule, AsyncPipe],
  templateUrl: './lookup-editor.component.html',
  styleUrl: './lookup-editor.component.scss'
})
export class LookupEditorComponent implements IFieldEditor, AfterViewInit, AfterViewChecked, OnChanges {
  private static readonly LOOKUP_VIRTUALIZATION_DEFAULT_ITEM_SIZE = 44;
  private pendingSearchFocusRestore = false;
  private lookupOverlayVisible = false;
  private hasActiveLookupQuery = false;
  private multiLookupViewCacheSource: any[] | null = null;
  private multiLookupViewCacheDeletedCount = -1;
  private multiLookupViewCacheValue: any[] = [];

  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: { [key: string]: BehaviorSubject<any> };
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: any;
  /**
   * Input dal componente padre per is filter; usata nella configurazione e nel rendering del componente.
   */
  @Input() isFilter?: boolean;
  /**
   * Input dal componente padre per nested index; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedIndex: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp: BehaviorSubject<any>;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean;
  @Input() tabIndex?: number;
  @Input() ariaLabelledBy?: string;

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per nested source.
   */
  @ViewChild(DataSourceComponent) nestedSource: DataSourceComponent;

  /**
   * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
   */
  items: any[] = [];
  /**
   * Collezione dati per client items, consumata dal rendering e dalle operazioni del componente.
   */
  clientItems: any[] = [];

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;
  /**
   * Proprieta di stato del componente per lookup value, usata dalla logica interna e dal template.
   */
  lookupValue: any;

  // Fix if ngmodel has value before items are retrieved
  /**
   * Proprieta di stato del componente per loaded, usata dalla logica interna e dal template.
   */
  loaded = false;

  /**
* function Object() { [native code] }
* @param trslSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param cd Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param hostElementRef Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private trslSrv: TranslationManagerService, private cd: ChangeDetectorRef, private hostElementRef: ElementRef<HTMLElement>) {

  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.applyAriaLabelledByToInput();
  }

  /**
   * Legge `mc_props_bag.lookup.virtualize` e determina se abilitare il virtual scroll del p-autocomplete.
   * Supporta boolean/number/string oppure object con `enabled`.
   */
  isLookupVirtualizationEnabled(): boolean {
    const raw = this.field?.extras?.lookup?.virtualize;
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
   * Restituisce item size per virtual scroll lookup.
   * Legge `mc_props_bag.lookup.virtualize.itemSize` (o alias `virtualRowHeight`/`rowHeight`) quando abilitato.
   */
  getLookupVirtualizationItemSize(): number | undefined {
    if (!this.isLookupVirtualizationEnabled()) {
      return undefined;
    }

    const raw = this.field?.extras?.lookup?.virtualize;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const candidate = Number((raw as any).itemSize ?? (raw as any).virtualRowHeight ?? (raw as any).rowHeight);
      if (Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }

    return LookupEditorComponent.LOOKUP_VIRTUALIZATION_DEFAULT_ITEM_SIZE;
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    // this.nestedSource.loading.subscribe((loading) => {
    //   debugger;
    // });

    this.valore = this.ensureFieldValueSubject().value;

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor.next(this);

    let self = this;

    setTimeout(() => {
      // Fallback anti-stallo: mostra comunque l'input anche se la lookup e ancora in loading,
      // mantenendo lo spinner visibile finche il datasource termina.
      if (!self.loaded) {
        self.loaded = true;
        self.cd.detectChanges();
      }
    }, 1000);

    this.nestedSource.fetchInfo$.subscribe(async (info) => {
      //se è valorizzato ngModel aspetto che valorizzi gli items altrimenti non si seleziona l'elemento corrente nella dropdown
      if (info && info.resultInfo && (!this.valore || (info.resultInfo.dato))) {

        if (!this.loaded && (this.field.mc_ui_column_type == 'multiple_check' || (this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor'))) {
          this.items = this.ensureLookupObjectSubject().value;
          this.clientItems = Array.isArray(this.items) ? [...this.items] : this.items;

          this.loaded = true;
        } else {
          this.items = info.resultInfo.dato;
          this.clientItems = Array.isArray(this.items) ? [...this.items] : [];

          const isSingleLookup =
            this.field.mc_ui_column_type == 'lookupByID'
            && !(this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor');

          // While user is typing a query, avoid forcing the selected object back into ngModel,
          // otherwise the input text is reverted to the original selected label.
          if (isSingleLookup && !this.hasActiveLookupQuery && this.items) {
            const match = this.findLookupMatch(this.items, this.valore);
            // Do not clear current selection when the current lookup value is not present
            // in the latest fetched page/filter result (common in standalone edit route).
            if (match !== undefined && match !== null) {
              this.ensureLookupObjectSubject().next(match);
            }
          }

          this.loaded = true;
        }

        if (this.pendingSearchFocusRestore || this.lookupOverlayVisible) {
          this.pendingSearchFocusRestore = true;
          this.restoreLookupInputFocusIfNeeded();
        }
      }
    });

    if (this.valore) {

      if (this.field.mc_ui_column_type == 'lookupByID' && !(this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor')) {
        this.nestedSource.filterInfo = {
          logic: "OR",
          filters: [
            { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: this.valore, __extra: true },
            { field: "__extra", operatore: undefined, value: undefined, fixed: true }
          ]
        }
      }
      else if (this.field.mc_ui_column_type == 'lookupByID' && (this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor')) {
        this.valore = this.valore.map(x => x[this.field.mc_ui_lookup_dataValueField]).join(',');
        this.nestedSource.filterInfo = {
          logic: "OR",
          filters: [
            { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: this.valore, __extra: true }
          ]
        }
      }
      else if (this.field.mc_ui_column_type == 'multiple_check') {
        // Do not constrain initial datasource by selected IDs:
        // for many-to-many we need searchable full options list in edit mode.
      }
      else {
        this.nestedSource.filterInfo = {
          logic: "OR",
          filters: [
            { field: this.field.mc_ui_grid_related_id_field, operatore: "eqor", value: (<any[]>this.valore).join(','), fixed: true }
          ]
        }
      }

      if (this.field.mc_selection_changed_custom_function__fn) {
        this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, this.valore, null, WtoolboxService, this.nestedIndex);
      }
    }

    if (this.field.extras?.lookup?.filter) {
      this.nestedSource.filterInfo = this.field.extras.lookup.filter;
    }

    this.nestedSource.getSchemaAndData().catch(() => {
      // Do not break parent edit form when lookup route metadata is unavailable.
      this.items = [];
      this.clientItems = [];
      this.loaded = true;
      this.cd.detectChanges();
    });

    this.applyAriaLabelledByToInput();
  }

  ngAfterViewChecked(): void {
    this.applyAriaLabelledByToInput();
  }

  private applyAriaLabelledByToInput(): void {
    const labelId = String(this.ariaLabelledBy || '').trim();
    const inputId = String(this.field?.ang_name || '').trim();
    if (!labelId || !inputId) {
      return;
    }

    const ownerDocument = this.hostElementRef?.nativeElement?.ownerDocument;
    const inputElement = ownerDocument?.getElementById(inputId) as HTMLInputElement | null;
    if (!inputElement) {
      return;
    }

    if (!this.hostElementRef.nativeElement.contains(inputElement)) {
      return;
    }

    if (inputElement.getAttribute('aria-labelledby') !== labelId) {
      inputElement.setAttribute('aria-labelledby', labelId);
    }
  }

  /**
* Gestisce la logica di `search` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
* @param event Evento UI/payload evento che innesca la logica del metodo.
*/
  async search(event: AutoCompleteCompleteEvent) {
    const isManyToMany = this.field.mc_ui_column_type == 'multiple_check';
    const shouldUseServerSearch = !!this.field.mc_serverside_operations || isManyToMany;
    const normalizedQuery = String(event?.query ?? '').trim();
    this.hasActiveLookupQuery = normalizedQuery.length > 0;

    if (this.clientItems?.length == 0 || shouldUseServerSearch) {
      // During async server refresh PrimeNG can drop focus from the input.
      // Track and restore it after fetch to keep typing uninterrupted.
      this.pendingSearchFocusRestore = true;

      let value = this.ensureFieldValueSubject().value;
      const searchField = this.field.mc_ui_column_type == 'multiple_check'
        ? this.field.mc_ui_grid_display_field
        : this.field.mc_ui_lookup_dataTextField;

      let filterInfo = null;

      if (event.query && shouldUseServerSearch) {

        filterInfo = {
          logic: "and",
          filters: [
            { field: this.field.mc_ui_lookup_dataTextField || this.field.mc_ui_grid_display_field || searchField, operatore: "contains", value: event.query },
          ]
        }

      } else if (value && shouldUseServerSearch) {
        this.hasActiveLookupQuery = false;
        if (searchField && this.nestedSource.filterDescriptor?.[searchField]) {
          // Avoid stale text-search filter from previous lookup query.
          this.nestedSource.filterDescriptor[searchField].next(null);
        }
        if (this.field.mc_ui_column_type == 'lookupByID' && (this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor')) {

          value = value.map(x => x[this.field.mc_ui_lookup_dataValueField]).join(',');
          filterInfo = {
            logic: "or",
            filters: [
              { field: this.field.mc_ui_lookup_dataValueField, operatore: "eqor", value: value, fixed: true }
            ]
          }
        } else if (this.field.mc_ui_column_type == 'multiple_check') {
          // Many-to-many: do NOT constrain the dropdown by the currently
          // selected IDs (mirrors the ngAfterViewInit branch). The user needs
          // a searchable full options list to add new associations; the
          // already-selected items remain visible as chips. Building a
          // {field: mc_ui_lookup_dataValueField, value: <array>} filter here
          // is doubly broken for m2m: dataValueField is typically null and
          // value is an array, which the SQL builder can't render.
          filterInfo = null;
        } else {

          filterInfo = {
            logic: "or",
            filters: [
              { field: this.field.mc_ui_lookup_dataValueField, operatore: "eq", value: value, __extra: true, fixed: true },
              { field: "__extra" }
            ]
          }
        }
      } else if (shouldUseServerSearch) {
        this.hasActiveLookupQuery = false;

        if (searchField && this.nestedSource.filterDescriptor?.[searchField]) {
          // Query cleared: restore full lookup list by clearing contains filter.
          this.nestedSource.filterDescriptor[searchField].next(null);
        }
      } else if (!shouldUseServerSearch && this.items && this.items.length > 0) {

        this.clientItems = this.items = JSON.parse(JSON.stringify(this.items));
        return;
      }

      if (this.field.extras?.lookup?.filter) {
        this.nestedSource.filterInfo = this.field.extras.lookup.filter;
      } else {
        this.nestedSource.filterInfo = filterInfo;
      }

      await this.nestedSource.fetchData();
      this.restoreLookupInputFocusIfNeeded();

    } else if (this.clientItems.length > 0) {
      const textField = this.field.mc_ui_column_type == 'multiple_check'
        ? this.field.mc_ui_grid_display_field
        : this.field.mc_ui_lookup_dataTextField;

      const readText = (item: any): string => {
        const raw = textField ? item?.[textField] : item?.[this.field.mc_ui_lookup_dataTextField];
        return String(raw ?? '').toLowerCase();
      };

      if (event.query) {
        const query = String(event.query || '').toLowerCase();
        if (this.field.mc_ui_lookup_filter === 'contains') {
          this.items = this.clientItems.filter((item) => readText(item).indexOf(query) >= 0);
        } else if (this.field.mc_ui_lookup_filter === 'startswith') {
          this.items = this.clientItems.filter((item) => readText(item).startsWith(query));
        } else if (this.field.mc_ui_lookup_filter === 'endswith') {
          this.items = this.clientItems.filter((item) => readText(item).endsWith(query));
        } else {
          this.items = this.clientItems.filter((item) => readText(item).indexOf(query) >= 0);
        }
      } else {
        this.hasActiveLookupQuery = false;
        this.items = JSON.parse(JSON.stringify(this.clientItems));
      }
    } else {
      this.hasActiveLookupQuery = false;
      this.items = JSON.parse(JSON.stringify(this.items));
    }
  }

  /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
* @param removed Flag di controllo che abilita/disabilita rami specifici della logica.
*/
  async modelChangeFn($event, removed?: boolean) {
    const valueSubject = this.ensureFieldValueSubject();
    if (this.field.mc_ui_column_type == 'lookupByID' && !(this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor')) {
      let newValue = $event?.value?.[this.field.mc_ui_lookup_dataValueField];
      const lookupObjSubject = this.ensureLookupObjectSubject();

      // Guard: this.items puo' essere null se la lookup non e' ancora stata
      // popolata (es. cambio modello triggherato prima del fetch combo). In
      // quel caso emettiamo solo il valore e lasciamo lookupObj vuoto, invece
      // di un raw `Cannot read properties of null (reading 'find')`.
      const itemsList = Array.isArray(this.items) ? this.items : [];
      lookupObjSubject.next(itemsList.find((item) => item[this.field.mc_ui_lookup_dataValueField] == newValue));
      valueSubject.next(newValue);

      if (this.field.mc_selection_changed_custom_function__fn) {
        await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, $event?.value, this.valore, WtoolboxService, this.nestedIndex));
      }

      this.valore = newValue;
      this.lookupValue = lookupObjSubject.value;
      this.hasActiveLookupQuery = false;
    } else if (this.field.mc_ui_column_type == 'multiple_check' || (this.field.mc_ui_column_type == 'lookupByID' && (this.isFilter && this.metaInfo.operators[this.field.mc_nome_colonna] == 'eqor'))) {
      let newObj = $event?.value;
      let newValue = newObj; // newObj[this.field.mc_ui_lookup_dataValueField];
      const idField = this.field.mc_ui_column_type == 'multiple_check'
        ? this.field.mc_ui_grid_related_id_field
        : this.field.mc_ui_lookup_dataValueField;

      let selectionObs = this.ensureLookupObjectSubject();
      let selectionArray = Array.isArray(selectionObs.value) ? selectionObs.value : [];

      // PrimeNG onClear may emit no selected item (or an array), so guard this path.
      if (!removed && (!newObj || Array.isArray(newObj))) {
        const clearedSelection = selectionArray.map((item) => {
          if (!item || typeof item !== 'object') {
            return item;
          }
          return { ...item, ___deleted: true };
        });

        selectionObs.next(clearedSelection);
        valueSubject.next([]);
        this.valore = [];
        this.lookupValue = [];
        this.onBlur();
        return;
      }

      if (!selectionArray) {
        newObj.___added = true;
        selectionObs.next([newObj]);
      } else {
        if (removed) {
          const selectionMatchIndex = selectionArray.findIndex((item) => item[idField] == newObj[idField]);
          if (selectionMatchIndex >= 0) {
            selectionArray[selectionMatchIndex].___deleted = true;
          }
        } else {
          newObj.___added = true;
          selectionArray.push(newObj);
          selectionObs.next(selectionArray);
        }
      }

      if (!valueSubject.value) {
        // console.log(210);

        valueSubject.next([newValue]);
      } else {
        if (removed) {
          const recordMatchIndex = valueSubject.value.findIndex((item) => item[idField] == newObj[idField]);
          if (recordMatchIndex >= 0) {
            valueSubject.value.splice(recordMatchIndex, 1)
            valueSubject.next(valueSubject.value);
          }

          if (this.isFilter && this.field.mc_ui_column_type == 'multiple_check') {
            const lookupSelection = this.ensureLookupObjectSubject();
            const lookupMatchIndex = lookupSelection.value.findIndex((item) => item[this.field.mc_ui_grid_related_id_field] == newObj[this.field.mc_ui_grid_related_id_field]);

            if (lookupMatchIndex >= 0) {
              lookupSelection.value.splice(lookupMatchIndex, 1)
              lookupSelection.next(lookupSelection.value);
            }
          }
        } else {
          // console.log(221, this.record[this.field.mc_nome_colonna].value);

          let arr = JSON.parse(JSON.stringify(valueSubject.value));

          if (!arr.find((item) => item[idField] == newValue[idField])) {
            valueSubject.next(arr.concat([newValue]));
          }
        }
      }

      this.valore = valueSubject.value;
      this.lookupValue = selectionArray;
    } else {

      throw new Error('Not implemented');
    }

    this.onBlur();
  }

  /**
* Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
*/
  onBlur() {
    const valueSubject = this.ensureFieldValueSubject();
    if (this.field.validationsRules) {
      this.field.validationsRules.forEach(async (vr: ValidationRule) => {
        await MetadatiColonna.validateField(valueSubject.value, vr, this.record, this.field);
      });
    }
  }

  getNgModelValue(): any {
    const lookupObs = this.record?.[this.field?.mc_nome_colonna + "__lookup_obj"];
    const currentValue = lookupObs?.value;
    const isMultiValue =
      this.field?.mc_ui_column_type == 'multiple_check' ||
      (this.field?.mc_ui_column_type == 'lookupByID' && this.isFilter && this.metaInfo?.operators?.[this.field?.mc_nome_colonna] == 'eqor');

    if (!isMultiValue) {
      return currentValue;
    }

    if (!Array.isArray(currentValue)) {
      this.multiLookupViewCacheSource = null;
      this.multiLookupViewCacheDeletedCount = -1;
      this.multiLookupViewCacheValue = [];
      return [];
    }

    let deletedCount = 0;
    for (const item of currentValue) {
      if (item && item.___deleted) {
        deletedCount++;
      }
    }

    if (deletedCount === 0) {
      this.multiLookupViewCacheSource = currentValue;
      this.multiLookupViewCacheDeletedCount = 0;
      this.multiLookupViewCacheValue = currentValue;
      return currentValue;
    }

    if (this.multiLookupViewCacheSource === currentValue && this.multiLookupViewCacheDeletedCount === deletedCount) {
      return this.multiLookupViewCacheValue;
    }

    // Keep deleted items in backing store for sync payload, but hide them from UI chips.
    this.multiLookupViewCacheSource = currentValue;
    this.multiLookupViewCacheDeletedCount = deletedCount;
    this.multiLookupViewCacheValue = currentValue.filter((item) => !(item && item.___deleted));
    return this.multiLookupViewCacheValue;
  }


  private findLookupMatch(items: any[], value: any): any {
    if (!Array.isArray(items) || value === undefined || value === null) {
      return null;
    }

    const valueField = String(this.field?.mc_ui_lookup_dataValueField || '').trim();
    const relatedField = String(this.field?.mc_ui_grid_related_id_field || '').trim();
    const normalizedValue = String(value);

    return items.find((item: any) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const candidates: any[] = [];
      if (valueField) {
        candidates.push(item[valueField]);
      }
      if (relatedField && relatedField !== valueField) {
        candidates.push(item[relatedField]);
      }

      return candidates.some((candidate) =>
        candidate !== undefined && candidate !== null && String(candidate) === normalizedValue
      );
    }) || null;
  }

  private ensureLookupObjectSubject(): BehaviorSubject<any> {
    const key = this.field?.mc_nome_colonna ? this.field.mc_nome_colonna + "__lookup_obj" : "__lookup_obj";
    let subject = this.record?.[key];
    if (!subject || typeof (subject as any).next !== 'function') {
      subject = new BehaviorSubject<any>(null);
      if (this.record) {
        this.record[key] = subject;
      }
    }
    return subject;
  }

  private ensureFieldValueSubject(): BehaviorSubject<any> {
    const key = String(this.field?.mc_nome_colonna || '').trim();
    let subject = key ? this.record?.[key] : null;
    if (!subject || typeof (subject as any).next !== 'function') {
      subject = new BehaviorSubject<any>(null);
      if (key && this.record) {
        this.record[key] = subject;
      }
    }
    return subject;
  }

  /**
   * Parser permissivo boolean-like usato per metadata bag.
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

  private getLookupInputElement(): HTMLInputElement | null {
    const ownerDocument = this.hostElementRef?.nativeElement?.ownerDocument;
    if (!ownerDocument) {
      return null;
    }

    const configuredId = String(this.field?.ang_name || '').trim();
    if (configuredId) {
      const byId = ownerDocument.getElementById(configuredId) as HTMLInputElement | null;
      if (byId && this.hostElementRef.nativeElement.contains(byId)) {
        return byId;
      }
    }

    return this.hostElementRef.nativeElement.querySelector('input.p-autocomplete-input') as HTMLInputElement | null;
  }

  private isLookupInputFocused(): boolean {
    const ownerDocument = this.hostElementRef?.nativeElement?.ownerDocument;
    const input = this.getLookupInputElement();
    return !!ownerDocument && !!input && ownerDocument.activeElement === input;
  }

  private restoreLookupInputFocusIfNeeded(): void {
    if (!this.pendingSearchFocusRestore) {
      return;
    }

    this.pendingSearchFocusRestore = false;
    const ownerDocument = this.hostElementRef?.nativeElement?.ownerDocument;
    const tryFocus = (attempt: number) => {
      const input = this.getLookupInputElement();
      if (!input || input.disabled) {
        return;
      }

      input.focus({ preventScroll: true });
      const end = input.value?.length ?? 0;
      try {
        input.setSelectionRange(end, end);
      } catch {
      }

      const isFocused = !!ownerDocument && ownerDocument.activeElement === input;
      if (!isFocused && attempt < 4) {
        setTimeout(() => tryFocus(attempt + 1), 40);
      }
    };

    setTimeout(() => tryFocus(0), 0);
  }

  onLookupOverlayShow(): void {
    this.lookupOverlayVisible = true;
    this.pendingSearchFocusRestore = true;
    setTimeout(() => this.restoreLookupInputFocusIfNeeded(), 100);
  }

  onLookupOverlayHide(): void {
    this.lookupOverlayVisible = false;
    this.hasActiveLookupQuery = false;
  }


}




