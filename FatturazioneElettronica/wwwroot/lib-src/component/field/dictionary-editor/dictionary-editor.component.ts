import { AfterViewChecked, AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { SelectModule } from 'primeng/select';
import type { Select } from 'primeng/select';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { FormsModule } from '@angular/forms';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { TranslateModule } from '@ngx-translate/core';
import { MetaInfo } from '../../../class/metaInfo';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { AsyncPipe, NgClass } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { ValidationRule } from '../../../class/validationRule';

@Component({
  selector: 'wuic-dictionary-editor',
  imports: [SelectModule, FormsModule, TranslateModule, AsyncPipe, NgClass],
  templateUrl: './dictionary-editor.component.html',
  styleUrl: './dictionary-editor.component.scss'
})
export class DictionaryEditorComponent implements OnInit, OnChanges, AfterViewChecked, AfterViewInit, OnDestroy {
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
  @Input() metaInfo: MetaInfo = new MetaInfo();
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
  @ViewChild('selectCmp') selectCmp?: Select;
  private overlayKeydownListener?: (event: KeyboardEvent) => void;

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;

  /**
   * Collezione dati per items, consumata dal rendering e dalle operazioni del componente.
   */
  items: any[] = [];
  /**
   * Proprieta di stato del componente per lookup props, usata dalla logica interna e dal template.
   */
  lookupProps: any = {};

  get resolvedTabIndex(): number {
    const parsed = Number(this.tabIndex);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  /**
* function Object() { [native code] }
* @param trnSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param hostElementRef Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private trnSrv: TranslationManagerService, private hostElementRef: ElementRef<HTMLElement>) {

  }

  /**
 * Verifica una condizione di stato o di validita orchestrando le chiamate `toLowerCase` e `some`.
 * @returns Esito booleano dell'elaborazione svolta dal metodo.
 */
  private isNumericDbType(): boolean {
    const dbType = (this.field?.mc_db_column_type || '').toLowerCase();
    return ['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'float', 'double', 'real'].some(t => dbType.includes(t));
  }

  /**
* Gestisce la logica operativa di `coerceDictionaryValue` in modo coerente con l'implementazione corrente.
* @param rawValue Valore in ingresso elaborato o normalizzato dal metodo.
* @returns Risultato elaborato da `coerceDictionaryValue` e restituito al chiamante.
*/
  private coerceDictionaryValue(rawValue: string): any {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return rawValue;
    }

    if (this.isNumericDbType()) {
      const numericValue = Number(rawValue);
      if (!Number.isNaN(numericValue)) {
        return numericValue;
      }
    }

    return rawValue;
  }

  /**
* Gestisce la logica operativa di `normalizeCurrentValueType` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`, propagando aggiornamenti sui flussi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
*/
  private normalizeCurrentValueType(): void {
    const current = this.record?.[this.field?.mc_nome_colonna]?.value;
    if (current === null || current === undefined || this.items.length === 0) {
      return;
    }

    const optionValues = this.items.map(x => x.value);
    if (optionValues.includes(current)) {
      return;
    }

    const currentAsString = String(current);
    const matchingOption = optionValues.find(v => String(v) === currentAsString);
    if (matchingOption !== undefined) {
      this.record[this.field.mc_nome_colonna].next(matchingOption);
    }
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    let self = this;

    let lookupProps = self.field.extras.lookup;

    if (self.field.mc_nome_colonna == "mc_ui_column_type") {
      this.items = Object.keys(MetadataProviderService.widgetMap).filter(x => !MetadataProviderService.widgetMap[x].hide).map(function (widget) {
        return { value: widget, text: widget, __selected: false };
      });
    } else {
      this.items = self.field.mc_dictionary_value ? self.field.mc_dictionary_value.split("||").map(function (dict_item: any) {
        const token = dict_item.split("@@");
        return { value: self.coerceDictionaryValue(token[0]), text: self.trnSrv.instant(token[1]), __selected: false };
      }) : []
    }

    this.normalizeCurrentValueType();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.applyAriaLabelledByToInput();
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.valore = this.record[this.field.mc_nome_colonna].value;
    this.normalizeCurrentValueType();
    this.valore = this.record[this.field.mc_nome_colonna].value;

    if (this.valore) {
      if (this.field.mc_selection_changed_custom_function__fn) {
        this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, this.valore, null, WtoolboxService, this.nestedIndex);
      }
    }

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor.next(this);
    this.applyAriaLabelledByToInput();
  }

  ngAfterViewChecked(): void {
    this.applyAriaLabelledByToInput();
  }

  ngOnDestroy(): void {
    this.detachOverlayKeyboardListener();
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
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  async modelChangeFn($event) {
    let newValue = $event.value;

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = newValue;

    this.onBlur();
  }

  /**
* Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
*/
  onBlur() {
    this.field.validationsRules.forEach(async (vr: ValidationRule) => {
      await MetadatiColonna.validateField(this.record[this.field.mc_nome_colonna].value, vr, this.record, this.field);
    });
  }

  public onSelectPanelShow(): void {
    this.attachOverlayKeyboardListener();
  }

  public onSelectPanelHide(): void {
    this.detachOverlayKeyboardListener();
  }

  private attachOverlayKeyboardListener(): void {
    if (this.overlayKeydownListener || typeof document === 'undefined') {
      return;
    }

    this.overlayKeydownListener = (event: KeyboardEvent) => {
      const dsb = !!(this.field?.extras?.form?.disabled || this.readOnly);
      if (dsb) {
        return;
      }

      const select = this.selectCmp as any;
      if (!select?.overlayVisible) {
        return;
      }

      const target = event.target as Node | null;
      const listId = String(select?.listId || '').trim();
      const listEl = listId ? document.getElementById(listId) : null;
      const inHost = !!(target && this.hostElementRef?.nativeElement?.contains(target));
      const inOverlayList = !!(target && listEl?.contains(target as Node));
      if (!inHost && !inOverlayList) {
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (key === 'arrowdown') {
        event.preventDefault();
        event.stopPropagation();
        this.selectAdjacentOption(1);
      } else if (key === 'arrowup') {
        event.preventDefault();
        event.stopPropagation();
        this.selectAdjacentOption(-1);
      } else if (key === 'enter') {
        // Confirm current keyboard selection and close overlay.
        event.preventDefault();
        event.stopPropagation();
        select.hide?.(true);
        this.onBlur();
      } else if (key === 'tab') {
        // Close overlay but keep browser default tab navigation.
        event.stopPropagation();
        select.hide?.(true);
      }
    };

    document.addEventListener('keydown', this.overlayKeydownListener, true);
  }

  private detachOverlayKeyboardListener(): void {
    if (!this.overlayKeydownListener || typeof document === 'undefined') {
      return;
    }

    document.removeEventListener('keydown', this.overlayKeydownListener, true);
    this.overlayKeydownListener = undefined;
  }

  public onSelectKeyboardToggle(event: Event): void {
    const dsb = !!(this.field?.extras?.form?.disabled || this.readOnly);
    if (dsb) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const select = this.selectCmp as any;
    if (!select) {
      return;
    }

    const key = String((event as any)?.key || '').toLowerCase();

    if (select.overlayVisible) {
      event.preventDefault();
      event.stopPropagation();
      if (key === 'enter') {
        select.onEnterKey?.(event as any, false);
      } else {
        select.onSpaceKey?.(event as any, false);
      }
    } else {
      event.preventDefault();
      event.stopPropagation();
      select.show?.(true);
    }
  }

  public onSelectKeyboardDown(event: Event): void {
    const dsb = !!(this.field?.extras?.form?.disabled || this.readOnly);
    if (dsb) {
      return;
    }

    const select = this.selectCmp as any;
    if (!select) {
      return;
    }

    if (select.overlayVisible) {
      event.preventDefault();
      event.stopPropagation();
      this.selectAdjacentOption(1);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    select.show?.(true);
  }

  public onSelectKeyboardUp(event: Event): void {
    const dsb = !!(this.field?.extras?.form?.disabled || this.readOnly);
    if (dsb) {
      return;
    }

    const select = this.selectCmp as any;
    if (!select || !select.overlayVisible) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.selectAdjacentOption(-1);
  }

  private selectAdjacentOption(delta: number): void {
    if (!Array.isArray(this.items) || this.items.length === 0) {
      return;
    }

    const currentValue = this.record?.[this.field?.mc_nome_colonna]?.value;
    const currentIndex = this.items.findIndex((item) => String(item?.value) === String(currentValue));
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + delta + this.items.length) % this.items.length;
    const nextItem = this.items[nextIndex];
    if (!nextItem) {
      return;
    }

    const previousValue = this.valore;
    const newValue = nextItem.value;
    this.record[this.field.mc_nome_colonna].next(newValue);
    this.valore = newValue;

    if (this.field.mc_selection_changed_custom_function__fn) {
      void this.field.mc_selection_changed_custom_function__fn(
        this.record,
        this.field,
        this.metaInfo,
        newValue,
        previousValue,
        WtoolboxService,
        this.nestedIndex
      );
    }
  }

}
