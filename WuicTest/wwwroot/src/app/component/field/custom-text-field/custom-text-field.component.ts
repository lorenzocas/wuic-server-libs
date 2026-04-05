import { AsyncPipe, CommonModule, NgClass, NgStyle } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AfterViewInit, Component, Input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo, ValidationRule, IFieldEditor, MetadatiColonna, WtoolboxService } from 'wuic-framework-lib';
import { InputTextModule } from 'primeng/inputtext';


@Component({
  selector: 'app-custom-text-field',
  imports: [FormsModule, InputTextModule, AsyncPipe, NgStyle, NgClass],
  templateUrl: './custom-text-field.component.html',
  styleUrl: './custom-text-field.component.scss'
})
export class CustomTextFieldComponent implements IFieldEditor, AfterViewInit {


  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record!: { [key: string]: BehaviorSubject<any> };
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field!: MetadatiColonna;
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
  @Input() nestedIndex!: number;
  /**
   * Input dal componente padre per trigger prop; usata nella configurazione e nel rendering del componente.
   */
  @Input() triggerProp!: BehaviorSubject<any>;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly!: boolean;

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
    this.valore = this.record[this.field.mc_nome_colonna]?.value;

    if (this.valore) {
      if (this.field.mc_selection_changed_custom_function__fn) {
        this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, this.valore, null, WtoolboxService, this.nestedIndex);
      }
    }

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor?.next(this);
  }

  /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  async modelChangeFn($event: Event) {
    const target = $event.target as HTMLInputElement | null;
    const newValue = target?.value ?? '';

    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await this.field.mc_selection_changed_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, WtoolboxService, this.nestedIndex);
    }

    this.valore = newValue;

    this.onBlur();
  }

  /**
* Gestisce la logica di `beforeChange` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @param $event Evento UI/payload evento che innesca la logica del metodo.
*/
  beforeChange($event: KeyboardEvent) {
    if ($event.key != "Shift" && $event.key != "Control" && $event.key != "Alt" && $event.key != "ArrowLeft" && $event.key != "ArrowRight" && $event.key != "ArrowUp" && $event.key != "ArrowDown" && $event.key != "CapsLock" && $event.key != "Tab" && $event.key != "Enter" && $event.key != "Escape" && $event.key != "Delete" && $event.key != "End" && $event.key != "Home" && $event.key != "PageUp" && $event.key != "PageDown") {
      // debugger;
      // $event.preventDefault();
      // console.log('beforeChange' + this.valore);
      var newValue = $event.key == "Backspace" ? (this.valore ? this.valore.toString().substr(0, this.valore.length - 1) : '') : (this.valore || '') + $event.key;

      if (this.field.mc_selection_changing_custom_function) {
        this.field.mc_selection_changing_custom_function__fn(this.record, this.field, this.metaInfo, newValue, this.valore, $event, WtoolboxService);
      }
    }
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




