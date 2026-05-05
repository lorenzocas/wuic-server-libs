import { Component, HostBinding, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { ConfirmationService } from 'primeng/api';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import type { Table } from 'primeng/table';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadatiUiStiliTabella } from '../../class/metadati_ui_stili_tabella';
import { MetadatiUiStiliColonna } from '../../class/metadati_ui_stili_colonna';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';

/**
 * Variante "card" del DynamicRowTemplateComponent usata sul layout mobile della list-grid.
 *
 * Importanti scelte di design (no regressioni!):
 *  - **NON estende** DynamicRowTemplateComponent: l'inheritance + double `ɵcompileComponent`
 *    su classi correlate provoca metadata ambigui nel resolver DI di Angular.
 *  - **selector custom** `'wuic-mobile-card-host'`: usare un selector HTML standard come `'div'`
 *    fa scattare l'auto-applicazione del component a ogni `<div>` del template (incluse le card row),
 *    causando ricorsione infinita su NgIf -> ViewContainerRef.
 */
@Component({
  template: '',
  selector: 'wuic-mobile-card-host',
  imports: []
})
export class DynamicCardTemplateComponent {
  private static readonly tableStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();
  private static readonly columnStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();

  @Input() rowData: any;
  @Input() rowIndex: number;
  @Input() actionButtonRowIsVisible: any;
  @Input() isListVirtualizationEnabled: boolean;
  @Input() columns: MetadatiColonna[] = [];
  @Input() metaInfo: MetaInfo = new MetaInfo();
  @Input() datasource: DataSourceComponent;
  @Input() dt: Table;
  @Input() rowSelect: (rowData: any, $event: any, dt: Table) => void;
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
  @Input() MetadatiColonna: typeof MetadatiColonna;

  @HostBinding('class') get classes(): string | null {
    const classList: string[] = [];
    const tableStyleClasses = this.getTableStyleClasses();
    classList.push(...tableStyleClasses);
    if (tableStyleClasses.length) {
      classList.push('wuic-row-style-applied');
    }

    if ((this.metaInfo.tableMetadata.md_ui_grid_conditional_template || this.metaInfo.tableMetadata.md_ui_grid_conditional_alt_template) && this.metaInfo.tableMetadata.md_ui_grid_conditional_template_condition) {
      if (this.metaInfo.gridRowTemplateCondition(this.metaInfo, this.rowData, WtoolboxService)) {
        classList.push(this.metaInfo.tableMetadata.md_ui_grid_conditional_template || this.metaInfo.tableMetadata.md_ui_grid_conditional_alt_template);
        classList.push('wuic-row-style-applied');
      }
    }

    if (this.isSelectedRow()) {
      classList.push('wuic-row-selected');
    }

    return classList.length ? classList.join(' ') : null;
  }

  private getTableStyleClasses(): string[] {
    const styles = (this.metaInfo?.tableMetadata?._Metadati_UI_Stili_Tabelles || []) as MetadatiUiStiliTabella[];
    if (!Array.isArray(styles) || !styles.length) {
      return [];
    }

    const classes: string[] = [];
    styles.forEach((style) => {
      const cssClass = String(style?.must_attribute_name || '').trim();
      if (!cssClass) {
        return;
      }
      const conditionCode = String(style?.must_attribute_value || '').trim();
      if (!conditionCode) {
        classes.push(cssClass);
        return;
      }
      const cacheKey = `${String(style?.must_id ?? '')}|${conditionCode}`;
      let predicate = DynamicCardTemplateComponent.tableStyleConditionCache.get(cacheKey);
      if (!predicate) {
        predicate = this.buildPredicate(conditionCode);
        DynamicCardTemplateComponent.tableStyleConditionCache.set(cacheKey, predicate);
      }
      try {
        if (predicate(this.metaInfo, this.rowData, WtoolboxService)) {
          classes.push(cssClass);
        }
      } catch {}
    });
    return classes;
  }

  private buildPredicate(conditionCode: string): (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean {
    const expressionWrapper = `
      const dataItem = record;
      const rowData = record;
      return (${conditionCode});
    `;
    try {
      return new Function('metaInfo', 'record', 'wtoolbox', expressionWrapper) as any;
    } catch {
      const blockWrapper = `
        const dataItem = record;
        const rowData = record;
        ${conditionCode}
        return true;
      `;
      try {
        return new Function('metaInfo', 'record', 'wtoolbox', blockWrapper) as any;
      } catch {
        return () => false;
      }
    }
  }

  getCellClasses(metaColumn: any, rowData: any): string | null {
    const column = metaColumn as any;
    if (!column) {
      return null;
    }
    const conditionalClass = String(column?.mc_ui_grid_conditional_template_class || '').trim();
    const altConditionalClass = String(column?.mc_ui_grid_conditional_alt_template_class || '').trim();
    const conditionalCode = String(column?.mc_ui_grid_conditional_template_condition || '').trim();
    const styles = (column._Metadati_UI_Stili_Colonnes || []) as MetadatiUiStiliColonna[];
    const hasStyleRules = Array.isArray(styles) && styles.length > 0;
    const hasConditionalClass = !!conditionalClass || !!altConditionalClass;
    if (!hasStyleRules && !hasConditionalClass) {
      return null;
    }

    const classes: string[] = [];
    if (hasStyleRules) {
      styles.forEach((style) => {
        const cssClass = String(style?.musc_attribute_name || '').trim();
        if (!cssClass) {
          return;
        }
        const conditionCode = String(style?.musc_attribute_value || '').trim();
        const callbackCode = String(style?.musc_attribute_value_callback || '').trim();
        const effectiveConditionCode = callbackCode || conditionCode;
        if (!effectiveConditionCode) {
          classes.push(cssClass);
          return;
        }
        const cacheKey = `${String(style?.musc_id ?? '')}|${effectiveConditionCode}`;
        let predicate = DynamicCardTemplateComponent.columnStyleConditionCache.get(cacheKey);
        if (!predicate) {
          predicate = this.buildPredicate(effectiveConditionCode);
          DynamicCardTemplateComponent.columnStyleConditionCache.set(cacheKey, predicate);
        }
        try {
          if (predicate(this.metaInfo, rowData, WtoolboxService)) {
            classes.push(cssClass);
          }
        } catch {}
      });
    }

    if (hasConditionalClass) {
      if (!conditionalCode) {
        if (conditionalClass) {
          classes.push(conditionalClass);
        } else if (altConditionalClass) {
          classes.push(altConditionalClass);
        }
      } else {
        const cacheKey = `mc_conditional:${String(column?.mc_id ?? column?.mc_nome_colonna ?? '')}|${conditionalCode}`;
        let predicate = DynamicCardTemplateComponent.columnStyleConditionCache.get(cacheKey);
        if (!predicate) {
          predicate = this.buildPredicate(conditionalCode);
          DynamicCardTemplateComponent.columnStyleConditionCache.set(cacheKey, predicate);
        }
        try {
          const useMainClass = !!predicate(this.metaInfo, rowData, WtoolboxService);
          const classToApply = useMainClass ? conditionalClass : altConditionalClass;
          if (classToApply) {
            classes.push(classToApply);
          }
        } catch {
          if (altConditionalClass) {
            classes.push(altConditionalClass);
          }
        }
      }
    }

    if (classes.length) {
      classes.push('wuic-cell-style-applied');
      return classes.join(' ');
    }
    return null;
  }

  onRowSelect($event: any, rowData: any) {
    if (this.rowCustomSelect && this.dt) {
      this.dt.selection = rowData;
    }
    if (this.rowCustomSelect) {
      this.rowCustomSelect($event, rowData, this.dt);
    }
  }

  private isSelectedRow(): boolean {
    const selection: any = this.dt?.selection;
    if (!selection || !this.rowData) {
      return false;
    }
    if (Array.isArray(selection)) {
      return selection.some((item) => this.areSameRow(item, this.rowData));
    }
    return this.areSameRow(selection, this.rowData);
  }

  private areSameRow(a: any, b: any): boolean {
    if (!a || !b) {
      return false;
    }
    const key = this.metaInfo?.pKey?.mc_nome_colonna;
    if (key) {
      return String(a[key]) === String(b[key]);
    }
    return a === b;
  }

  /**
   * Compila un template card dinamico via `DynamicCompilerService`. Refactor
   * 2026-04-23: sostituisce `ɵcompileComponent` + `ɵcompileNgModule` private
   * con l'API pubblica `Compiler`. Vedi
   * skills/angular-jit-compiler-migration/SKILL.md.
   */
  static getComponentFromTemplate(template: string, route?: string): typeof DynamicCardTemplateComponent {
    return DynamicCompilerService.compile({
      template,
      selector: 'wuic-mobile-card-host',
      baseClass: DynamicCardTemplateComponent,
      imports: [
        ...(MetadataProviderService.widgetDefinition.gridRowImports || []),
        NgSwitch, NgSwitchCase, NgSwitchDefault,
      ],
      providers: [ConfirmationService],
      templateField: '<mobile card auto-template>',
      route,
    }) as typeof DynamicCardTemplateComponent;
  }
}
