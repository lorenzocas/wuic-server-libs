import { CommonModule } from '@angular/common';
import { Component, Input, forwardRef } from '@angular/core';
import type { Table } from 'primeng/table';
import { DataSourceComponent } from '../data-source/data-source.component';
import { BehaviorSubject } from 'rxjs';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { LazyListGridComponent } from '../list-grid/list-grid.lazy.component';
import { LazyMapListComponent } from '../map-list/map-list.lazy.component';
import { LazySchedulerListComponent } from '../scheduler-list/scheduler-list.lazy.component';
import { LazyParametricDialogComponent } from '../parametric-dialog/parametric-dialog.lazy.component';
import { LazySpreadsheetListSfComponent } from '../spreadsheet-list-sf/spreadsheet-list-sf.lazy.component';
import { LazyTreeListComponent } from '../tree-list/tree-list.lazy.component';
import { LazyChartListComponent } from '../chart-list/chart-list.lazy.component';
import { LazyCarouselListComponent } from '../carousel-list/carousel-list.lazy.component';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';

@Component({
  selector: 'wuic-dynamic-repeater-template',
  imports: [CommonModule],
  template: ''
})
export class DynamicRepeaterTemplateComponent {
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;

  /**
   * Input dal componente padre per action; usata nella configurazione e nel rendering del componente.
   */
  @Input() action: BehaviorSubject<string>;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: any;
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: any;

  /**
   * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;

  @Input() hideToolbar: boolean = false;

  /**
   * Compila un template repeater dinamico via `DynamicCompilerService`.
   * Refactor 2026-04-23: API pubblica `Compiler` sostituisce
   * `ɵcompileComponent` privata. Vedi
   * skills/angular-jit-compiler-migration/SKILL.md.
   *
   * Preserva la normalizzazione `wuic-parametric-dialog` -> `-lazy` per
   * reindirizzare istanze a lazy chunk.
   */
  static getComponentFromTemplate(template: string, route?: string, templateField?: string): typeof DynamicRepeaterTemplateComponent {
    const normalizedTemplate = String(template || '').replace(/wuic-parametric-dialog(?!-lazy)/g, 'wuic-parametric-dialog-lazy');
    return DynamicCompilerService.compile({
      template: normalizedTemplate,
      baseClass: DynamicRepeaterTemplateComponent,
      imports: [
        CommonModule,
        forwardRef(() => LazyListGridComponent),
        forwardRef(() => LazyMapListComponent),
        forwardRef(() => LazySchedulerListComponent),
        forwardRef(() => LazyParametricDialogComponent),
        forwardRef(() => LazySpreadsheetListSfComponent),
        forwardRef(() => LazyTreeListComponent),
        forwardRef(() => LazyChartListComponent),
        forwardRef(() => LazyCarouselListComponent),
        ...MetadataProviderService.customRepeaterComponents,
      ],
      providers: [DynamicDialogRef, DynamicDialogConfig],
      templateField: templateField || 'md_repeater_template',
      route,
    }) as typeof DynamicRepeaterTemplateComponent;
  }
}


