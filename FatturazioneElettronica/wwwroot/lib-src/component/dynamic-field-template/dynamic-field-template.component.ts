import { Component, HostBinding, Input } from '@angular/core';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { FieldEditorComponent } from '../field/field-editor/field-editor.component';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';

@Component({
    template: '',
    selector: 'wuic-dynamic-field-template',
    imports: []
})
export class DynamicFieldTemplateComponent {
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: any;
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();

  /**
   * Compila un template HTML in una subclass di `DynamicFieldTemplateComponent`
   * via `DynamicCompilerService` (API pubblica `Compiler` di Angular).
   *
   * Refactor 2026-04-23: sostituisce il precedente `ɵcompileComponent` +
   * `ɵcompileNgModule` (API private) con il `Compiler` pubblico. Questo
   * permette di abilitare `optimization.scripts: true` + `enableProdMode()`
   * senza il crash `ɵfac configurable:false`. Vedi
   * [skills/angular-jit-compiler-migration/SKILL.md](../../../../../../../skills/angular-jit-compiler-migration/SKILL.md).
   *
   * @param template Template HTML/Angular da compilare a runtime.
   * @returns Subclass compilata pronta per `NgComponentOutlet` / `createComponent`.
   */
  static getComponentFromTemplate(template: string, route?: string, templateField?: string) {
    return DynamicCompilerService.compile({
      template,
      selector: '[field-editor]',
      baseClass: DynamicFieldTemplateComponent,
      imports: [FieldEditorComponent],
      templateField: templateField || 'mc_ui_grid_column_data_template',
      route,
    });
  }
}
