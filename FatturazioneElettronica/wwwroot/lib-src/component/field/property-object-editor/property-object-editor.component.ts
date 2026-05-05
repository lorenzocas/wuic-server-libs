import { Component, Input, OnInit } from '@angular/core';
import { TranslationManagerService } from '../../../service/translation-manager.service';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { MetaInfo } from '../../../class/metaInfo';

import { FieldEditorComponent } from "../field-editor/field-editor.component";
import { IDesignerProperties } from '../../../class/IDesignerProperties';
import { WtoolboxService } from '../../../service/wtoolbox.service';

@Component({
  selector: 'wuic-property-object-editor',
  imports: [TranslateModule, FieldEditorComponent],
  templateUrl: './property-object-editor.component.html',
  styleUrl: './property-object-editor.component.css'
})
export class PropertyObjectEditorComponent implements OnInit {

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
    this.nestedObj = this.record[this.field.mc_nome_colonna] as any;

    if (this.nestedObj.getDesignerProps) {
      this.nestedMetaInfo = this.nestedObj.getDesignerProps(this.metaInfo, this.triggerProp);
    }

    let propPath = this.field.propPath ? (this.field.propPath + '.' + this.field.mc_nome_colonna) : this.field.mc_nome_colonna;

    this.nestedMetaInfo.columnMetadata.forEach((col) => {
      if (col.mc_ui_column_type == 'lookupByID') {
        this.nestedObj[col.mc_nome_colonna + '__lookup_obj'] = new BehaviorSubject<any>(null);
      }

      this.nestedObj[col.mc_nome_colonna] = new BehaviorSubject<any>(this.nestedObj[col.mc_nome_colonna]);

      col.propPath = propPath;
    });

    // this.record[this.field.mc_nome_colonna].next(this.nestedObj);

    if (this.field.mc_selection_changed_custom_function__fn) {

      let model = {};
      Object.keys(this.nestedObj).forEach(key => {
        model[key] = this.nestedObj[key].value;
      });

      this.field.mc_selection_changed_custom_function__fn(this.record[this.field.mc_nome_colonna].value, this.field, this.metaInfo, model, this.valore, WtoolboxService);
    }

  }

}


