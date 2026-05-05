import { Component, Input } from '@angular/core';
// import { MetaInfo } from '../../class/metaInfo';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { FieldEditorComponent } from '../field/field-editor/field-editor.component';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';

@Component({
  template: '',
  standalone: false
})
export class DynamicFormTemplateComponent {
  /**
   * Input dal componente padre per metas; usata nella configurazione e nel rendering del componente.
   */
  @Input() metas: any;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: any;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: any; //MetaInfo = new MetaInfo();
  /**
   * Input dal componente padre per read only; usata nella configurazione e nel rendering del componente.
   */
  @Input() readOnly: boolean = false;
  // @Input() datasource: DataSourceComponent;

  /**
   * Input dal componente padre per is edit form; usata nella configurazione e nel rendering del componente.
   */
  @Input() isEditForm: boolean = false;


  /**
* Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare campi, chiavi e comportamento runtime.
* @param fieldName Valore testuale usato come chiave, campo, route o parametro di configurazione.
* @returns Valore di tipo `any` costruito dal metodo per i passaggi successivi del flusso.
*/
  getMetaColumn(fieldName: string): any {
    const normalized = (fieldName || '').trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const allColumns = [
      ...((this.metas as any[]) || []),
      ...((this.metaInfo?.columnMetadata as any[]) || [])
    ];

    const found = allColumns.find((c: any) => {
      const logicalName = String(c?.mc_nome_colonna || '').trim().toLowerCase();
      return logicalName === normalized;
    });

    return found || null;
  }

  /**
* Recupera i dati/valori richiesti da `getComponentFromTemplate`.
* @param template Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore risolto da `getComponentFromTemplate` in base ai criteri implementati.
*/





  /**
   * Compila un template form dinamico via `DynamicCompilerService`. Refactor
   * 2026-04-23: API pubblica `Compiler` sostituisce `ɵcompileComponent`
   * privata. Vedi skills/angular-jit-compiler-migration/SKILL.md.
   */
  static getComponentFromTemplate(template: string, route?: string): typeof DynamicFormTemplateComponent {
    const configuredImports = MetadataProviderService.widgetDefinition.dynamicFormImports || [];
    const allImports = configuredImports.includes(FieldEditorComponent)
      ? configuredImports
      : [...configuredImports, FieldEditorComponent];
    return DynamicCompilerService.compile({
      template,
      baseClass: DynamicFormTemplateComponent,
      imports: allImports,
      templateField: 'md_edit_template',
      route,
    }) as typeof DynamicFormTemplateComponent;
  }
}

