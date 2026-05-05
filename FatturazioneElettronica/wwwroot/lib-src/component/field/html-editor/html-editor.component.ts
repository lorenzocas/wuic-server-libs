import { AfterViewInit, Component, Input } from '@angular/core';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { BehaviorSubject } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { AsyncPipe } from '@angular/common';
import { EditorModule } from 'primeng/editor';
import { Textarea } from 'primeng/textarea';
import { WtoolboxService } from '../../../service/wtoolbox.service';
import { ValidationRule } from '../../../class/validationRule';

@Component({
  selector: 'wuic-html-editor',
  imports: [FormsModule, AsyncPipe, EditorModule, Textarea],
  templateUrl: './html-editor.component.html',
  styleUrl: './html-editor.component.scss'
})
export class HtmlEditorComponent implements AfterViewInit {
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
    this.field = new MetadatiColonna('');
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit(): void {
    if (!this.record || !this.field?.mc_nome_colonna) {
      return;
    }

    this.valore = this.record[this.field.mc_nome_colonna]?.value;

    if (!this.field.editor) {
      this.field.editor = new BehaviorSubject<any>(null);
    }

    this.field.editor?.next(this as any);
  }

  /**
* Gestisce comportamento UI tramite `toggleEditor` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
* @returns Esito booleano calcolato dal metodo.
*/
  toggleEditor() {
    if (!this.field.codeEditing) {
      this.metaInfo.columnMetadata.forEach((col) => {
        if (col.mc_nome_colonna !== this.field.mc_nome_colonna && col.codeEditing) {
          col.codeEditing = false;
        }
      });
    }

    this.field.codeEditing = !this.field.codeEditing;
    return false;
  }

  /**
* Gestisce la logica di `modelChangeFn` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
  async modelChangeFn(value: string): Promise<void> {
    if (!this.record || !this.field?.mc_nome_colonna) {
      return;
    }

    const newValue = value ?? '';
    this.record[this.field.mc_nome_colonna].next(newValue);

    if (this.field.mc_selection_changed_custom_function__fn) {
      await Promise.resolve(this.field.mc_selection_changed_custom_function__fn(
        this.record,
        this.field,
        this.metaInfo,
        newValue,
        this.valore,
        WtoolboxService,
        this.nestedIndex
      ));
    }

    this.valore = newValue;
  }

  /**
* Gestisce la logica di `onBlur` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna).
*/
  onBlur() {
    if (!this.record || !this.field?.mc_nome_colonna) {
      return;
    }

    this.field.validationsRules?.forEach(async (vr: ValidationRule) => {
      await MetadatiColonna.validateField(this.record[this.field.mc_nome_colonna].value, vr, this.record, this.field);
    });
  }
}

