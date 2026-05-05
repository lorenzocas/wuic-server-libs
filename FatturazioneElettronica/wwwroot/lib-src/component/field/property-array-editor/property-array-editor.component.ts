import { Component, Input, OnInit } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';
import { AsyncPipe } from '@angular/common';
import { FieldEditorComponent } from "../field-editor/field-editor.component";
import { IDesignerProperties } from '../../../class/IDesignerProperties';
import { WtoolboxService } from '../../../service/wtoolbox.service';

@Component({
  selector: 'wuic-property-array-editor',
  imports: [ButtonModule, TranslateModule, AsyncPipe, FieldEditorComponent],
  templateUrl: './property-array-editor.component.html',
  styleUrl: './property-array-editor.component.css'
})
export class PropertyArrayEditorComponent implements OnInit {

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
  @Input() metaInfo: MetaInfo;
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
   * Input dal componente padre per tabindex; usata nella configurazione e nel rendering del componente.
   */
  @Input() tabIndex?: number;
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean;

  /**
   * Proprieta di stato del componente per nested meta info, usata dalla logica interna e dal template.
   */
  nestedMetaInfo: MetaInfo;
  /**
   * Proprieta di stato del componente per nested obj, usata dalla logica interna e dal template.
   */
  nestedObj: IDesignerProperties;

  /**
   * Proprieta di stato del componente per valore, usata dalla logica interna e dal template.
   */
  valore: any;

      /**
   * function Object() { [native code] }
   * @param trnsl Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(private trnsl: TranslationManagerService) {

  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.nestedObj = new this.field.propConstructor();
    this.nestedObj.init(this.metaInfo, this.nestedIndex);

    if (this.nestedObj.getDesignerProps) {
      this.nestedMetaInfo = this.nestedObj.getDesignerProps(this.metaInfo, this.triggerProp);
    }

    let propPath = this.field.propPath ? (this.field.propPath + '.' + this.field.mc_nome_colonna) : this.field.mc_nome_colonna;

    this.nestedMetaInfo.columnMetadata.forEach((col) => {
      if (col.mc_ui_column_type == 'lookupByID') {
        this.nestedObj[col.mc_nome_colonna + '__lookup_obj'] = new BehaviorSubject<any>(null);
      }

      col.propPath = propPath;
    });
  }

          /**
   * Gestisce la logica di `addObj` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), propagando aggiornamenti sui campi reattivi usati dalla UI, trasformando e filtrando collezioni dati.
   */
  addObj() {

    this.nestedMetaInfo.columnMetadata.forEach((col) => {
      this.nestedObj[col.mc_nome_colonna] = new BehaviorSubject<any>(this.nestedObj[col.mc_nome_colonna]);
    });

    // Object.keys(this.nestedObj).filter(x => x != 'archetypePropName').forEach(key => {
    //   this.nestedObj[key] = new BehaviorSubject<any>(this.nestedObj[key]);
    // });

    let updatedArray = [...this.record[this.field.mc_nome_colonna].value, this.nestedObj];
    this.record[this.field.mc_nome_colonna].next(updatedArray);

    if (this.field.mc_selection_changed_custom_function__fn) {
      let models: any[] = [];

      updatedArray.forEach((el, index) => {
        let model = {};
        Object.keys(el).forEach(key => {
          model[key] = el[key].value;
        });

        models.push(model);
      });

      this.field.mc_selection_changed_custom_function__fn(this.record[this.field.mc_nome_colonna].value, this.field, this.metaInfo, models, this.valore, WtoolboxService, this.nestedIndex);
    }

    this.valore = updatedArray;
  }
}


