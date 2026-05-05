import { Pipe, PipeTransform } from '@angular/core';
import { MetadatiColonna } from '../class/metadati_colonna';

@Pipe({
  name: 'getComponent',
  standalone: true
})
export class GetComponentPipe implements PipeTransform {

  transform(col: MetadatiColonna, fieldEditor: any): any {
    fieldEditor.widget = fieldEditor.widgetMap[col.mc_ui_column_type];
    if (!fieldEditor.widget) {
      console.error('Widget not found for type: ' + col.mc_ui_column_type);
      return fieldEditor.widgetMap['text'].component;
    }

    // return this.field.mc_nome_colonna == "Cod_CapoArea" ? this.widgetMap['code_editor'].component : this.widget?.component;
    return fieldEditor.widget?.component;
  }

}
