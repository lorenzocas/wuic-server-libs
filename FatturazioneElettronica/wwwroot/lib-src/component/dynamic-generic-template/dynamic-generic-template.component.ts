import { Component, HostBinding, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { ConfirmationService } from 'primeng/api';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';

@Component({
  template: '',
  selector: 'wuic-dynamic-generic-template',
  standalone: false
})
export class DynamicGenericTemplateComponent {
  @Input() rowData: any;
  @Input() record: any;
  @Input() columns: MetadatiColonna[] = [];
  @Input() expanded: boolean = false;
  @Input() metaInfo: MetaInfo = new MetaInfo();
  @Input() datasource: DataSourceComponent;
  @Input() getDescription: Function;
  @Input() MetadatiColonna: typeof MetadatiColonna;
  @Input() parentField: string;

  findColumn(columnName: string): MetadatiColonna | null {
    if (!columnName || !this.metaInfo?.columnMetadata?.length) {
      return null;
    }
    return this.metaInfo.columnMetadata.find((c) => c.mc_nome_colonna === columnName) || null;
  }

  getFieldValue(record: any, fieldName: string): any {
    if (!record || !fieldName) {
      return null;
    }
    return record[fieldName];
  }

  @HostBinding('class') get classes(): string | null {
    return "dynamic-template";
  }

  /**
   * Compila un template dinamico via `DynamicCompilerService` (API pubblica
   * Angular `Compiler`). Refactor 2026-04-23: sostituisce `ɵcompileComponent`
   * privata per sbloccare prod mode con `optimization.scripts: true`. Vedi
   * skills/angular-jit-compiler-migration/SKILL.md.
   */
  static getComponentFromTemplate(template: string, templateField?: string, route?: string): typeof DynamicGenericTemplateComponent {
    return DynamicCompilerService.compile({
      template,
      selector: '[dynamic]',
      baseClass: DynamicGenericTemplateComponent,
      imports: [
        ...(MetadataProviderService.widgetDefinition.gridRowImports || []),
        CommonModule,
      ],
      providers: [ConfirmationService],
      templateField,  // archetype-specific (filter/detail/book_html/carousel-item/map-item/...): caller knows
      route,
    }) as typeof DynamicGenericTemplateComponent;
  }
}
