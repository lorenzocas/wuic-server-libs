import { AfterViewInit, Component, Input } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
// import { CalendarModule } from 'primeng/calendar';
import { DatePickerModule } from 'primeng/datepicker';
import { FormsModule } from '@angular/forms';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { AsyncPipe, DatePipe } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { IFieldEditor } from '../../../class/IFieldEditor';
import { ToDatePipe } from '../../../pipe/to-date.pipe';
import { ValidationRule } from '../../../class/validationRule';

@Component({
  selector: 'wuic-date-editor',
  imports: [DatePickerModule, FormsModule, AsyncPipe, ToDatePipe],
  templateUrl: './date-editor.component.html',
  styleUrl: './date-editor.component.scss'
})
export class DateEditorComponent implements IFieldEditor, AfterViewInit {

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
   * Proprieta di stato del componente per hour format, usata dalla logica interna e dal template.
   */
  hourFormat = "12";

  /**
 * function Object() { [native code] }
 */
  constructor() {

  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit() {
    this.valore = this.record[this.field.mc_nome_colonna];

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
    let newValue = $event;

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex));
    }

    this.valore = $event;

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
}


