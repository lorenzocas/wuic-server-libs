import { AfterViewInit, Component, Input } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { MetaInfo } from '../../../class/metaInfo';
import { AsyncPipe } from '@angular/common';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { BehaviorSubject } from 'rxjs';
import { IFieldEditor } from '../../../class/IFieldEditor';
import { DataSourceComponent } from '../../data-source/data-source.component';

@Component({
  selector: 'wuic-boolean-editor',
  imports: [CheckboxModule, FormsModule, AsyncPipe],
  templateUrl: './boolean-editor.component.html',
  styleUrl: './boolean-editor.component.scss'
})
export class BooleanEditorComponent implements IFieldEditor, AfterViewInit {
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

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;

  /**
 * function Object() { [native code] }
 */
  constructor() {

  }
  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
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
  }

  /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  async modelChangeFn($event) {
    let newValue = $event.checked;

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = newValue;
  }

  private toBool(value: any, fallback: boolean = false): boolean {
    if (value === null || value === undefined) {
      return fallback;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    const normalized = String(value).trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }

    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
      return true;
    }

    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
      return false;
    }

    return fallback;
  }

  private isNewRecord(): boolean {
    const marker = this.record?.['__new'];
    if (marker instanceof BehaviorSubject) {
      return this.toBool(marker.value, false);
    }
    return this.toBool(marker, false);
  }

  isDisabled(): boolean {
    if (this.toBool(this.isFilter, false)) {
      return false;
    }

    const readOnly = this.toBool(this.readOnly, false);
    const editable = this.toBool(this.field?.mc_logic_editable, true);
    const isComputed = this.toBool(this.field?.mc_is_computed, false);
    const isDbComputed = this.toBool(this.field?.mc_is_db_computed, false);
    const editableInsertOnly = this.toBool(this.field?.mc_editable_insert_only, false);
    const isNew = this.isNewRecord();

    return readOnly || !editable || isComputed || isDbComputed || (editableInsertOnly && !isNew);
  }

}

