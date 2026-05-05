import { Component, HostBinding, Input } from '@angular/core';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';
import { NgSwitch, NgSwitchCase, NgSwitchDefault, NgIf, NgForOf, NgClass, NgStyle, NgTemplateOutlet, NgComponentOutlet } from '@angular/common';
// Direttive PrimeNG Table — `isStandalone: false`, fanno parte di TableModule.
// Le importiamo nominativamente SOLO per creare un riferimento statico che il
// bundler prod usa per mantenerle nel chunk (vedi commento in
// `getComponentFromTemplate`). NON vanno passate direttamente a `allImports`:
// causerebbero "Unexpected directive ... Please add an @NgModule annotation".
// Vengono fornite al template compilato tramite `TableModule`, che l'host app
// registra in `widgetDefinition.gridRowImports`.
import {
    TableModule,
    RowToggler,
    FrozenColumn,
    SortableColumn,
    EditableColumn,
    EditableRow,
    CellEditor,
    TableCheckbox,
    TableRadioButton,
    TableHeaderCheckbox,
    ReorderableColumn,
    ResizableColumn,
    SelectableRow
} from 'primeng/table';
// Side-effect runtime SOLIDO contro tree-shaking prod.
//
// Il pattern `export const _KEEPALIVE = [Class1, Class2, ...] as const` da solo
// NON basta: esbuild/terser lo considerano "pure static array" e lo eliminano
// quando nessuno legge la const a runtime (caso tipico in prod). Risultato:
// le classi PrimeNG (RowToggler ecc.) NON entrano nel chunk → al template
// runtime-compiled, anche se TableModule e' in `allImports`, il compiler
// non trova le direttive registrate → `[pRowToggler]` non viene applicata,
// il button del chevron e' un button HTML normale senza handler.
//
// Per garantire l'inclusione nel chunk usiamo:
// 1. Un'IIFE che LEGGE un campo runtime delle classi (.name di una classe e'
//    sempre una read genuina che il bundler non puo' assumere pure).
// 2. Il risultato viene assegnato a una const exportata, che il bundler vede
//    come "exported binding observable" → non puo' eliminare la valutazione.
// 3. La lista include TUTTE le direttive PrimeNG Table usate dal template
//    runtime: row expand, frozen, sort, inline edit, multi-select, ecc.
//
// Verifica: `ng.getDirectives(btn)` su un bottone con `[pRowToggler]` deve
// ritornare `[RowToggler]` (non `[]`).
export const _PRIMENG_TABLE_DIRECTIVES_NAMES: readonly string[] = (() => {
    const directives = [
        RowToggler, FrozenColumn, SortableColumn,
        EditableColumn, EditableRow, CellEditor,
        TableCheckbox, TableRadioButton, TableHeaderCheckbox,
        ReorderableColumn, ResizableColumn, SelectableRow
    ];
    return directives.map((d) => d.name);
})();
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import type { Table } from 'primeng/table';
import { ConfirmationService } from 'primeng/api';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadatiUiStiliTabella } from '../../class/metadati_ui_stili_tabella';
import { MetadatiUiStiliColonna } from '../../class/metadati_ui_stili_colonna';

@Component({
  template: '',
  selector: 'wuic-dynamic-row-template',
  imports: []
})
export class DynamicRowTemplateComponent {
  /**
   * Configurazione di presentazione per table style condition cache, usata nel rendering del componente.
   */
  private static readonly tableStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();
  /**
   * Configurazione di presentazione per column style condition cache, usata nel rendering del componente.
   */
  private static readonly columnStyleConditionCache = new Map<string, (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean>();
  /**
   * Input dal componente padre per row data; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowData: any;

  @Input() rowIndex: number;

  @Input() actionButtonRowIsVisible: any;

  @Input() isListVirtualizationEnabled: boolean;

  /**
   * Input dal componente padre per columns; usata nella configurazione e nel rendering del componente.
   */
  @Input() columns: MetadatiColonna[] = [];
  /**
   * Input dal componente padre per expanded; usata nella configurazione e nel rendering del componente.
   */
  @Input() expanded: boolean = false;

  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: DataSourceComponent;
  /**
   * Input dal componente padre per dt; usata nella configurazione e nel rendering del componente.
   */
  @Input() dt: Table;
  /**
   * Input dal componente padre per toggle row; usata nella configurazione e nel rendering del componente.
   */
  @Input() toggleRow: (rowData: any, $event: any, dt: Table) => void;
  /**
   * Input dal componente padre per row select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowSelect: (rowData: any, $event: any, dt: Table) => void;

  /**
   * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
  /**
   * Input dal componente padre per stato inline-cell-editing.
   */
  @Input() inlineCellEditingEnabled: boolean = false;
  /**
   * Callback opzionale invocata quando un editor cella perde il focus.
   */
  @Input() onInlineCellEditorBlur: (event: FocusEvent, rowData: any, metaColumn: any) => void;
  /**
   * Callback opzionale invocata al change valore del field-editor in inline cell editing.
   */
  @Input() onInlineCellEditorValueChange: (rowData: any, metaColumn: any) => void;
  /**
   * Callback opzionale per costruire metadato colonna runtime (es. id/name univoci per riga in inline grid).
   */
  @Input() getRuntimeGridFieldMeta: (metaColumn: MetadatiColonna, rowData: any) => MetadatiColonna =
    (metaColumn: MetadatiColonna) => metaColumn;

  /**
   * Input dal componente padre per metadati colonna; usata nella configurazione e nel rendering del componente.
   */
  @Input() MetadatiColonna: typeof MetadatiColonna;

  /**
* Gestisce la logica operativa di `classes` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
* @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
*/

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

  /**
* Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record, usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @returns Collezione di tipo `string[]` derivata dalle trasformazioni applicate nel metodo.
*/
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
      let predicate = DynamicRowTemplateComponent.tableStyleConditionCache.get(cacheKey);
      if (!predicate) {
        predicate = this.buildTableStylePredicate(conditionCode);
        DynamicRowTemplateComponent.tableStyleConditionCache.set(cacheKey, predicate);
      }

      try {
        if (predicate(this.metaInfo, this.rowData, WtoolboxService)) {
          classes.push(cssClass);
        }
      } catch {
      }
    });

    return classes;
  }

  /**
* Costruisce una struttura di output a partire dal contesto corrente usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @param conditionCode Valore testuale usato come chiave, campo, route o parametro di configurazione.
* @returns Valore di tipo `(metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean` costruito dal metodo per i passaggi successivi del flusso.
*/
  private buildTableStylePredicate(
    conditionCode: string
  ): (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean {
    const expressionWrapper = `
      const dataItem = record;
      const rowData = record;
      return (${conditionCode});
    `;
    try {
      return new Function('metaInfo', 'record', 'wtoolbox', expressionWrapper) as (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean;
    } catch {
      const blockWrapper = `
        const dataItem = record;
        const rowData = record;
        ${conditionCode}
        return true;
      `;
      try {
        return new Function('metaInfo', 'record', 'wtoolbox', blockWrapper) as (metaInfo: MetaInfo, record: any, wtoolbox: typeof WtoolboxService) => boolean;
      } catch {
        return () => false;
      }
    }
  }

  /**
* Recupera e prepara i dati richiesti dal chiamante normalizzando e trasformando collezioni di record, usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework.
* @param metaColumn Metadati correnti usati per guidare mapping, validazioni e comportamento runtime.
* @param rowData Record/elemento su cui vengono applicate elaborazioni o aggiornamenti.
* @returns Valore di tipo `string | null` costruito dal metodo per i passaggi successivi del flusso.
*/
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
        let predicate = DynamicRowTemplateComponent.columnStyleConditionCache.get(cacheKey);
        if (!predicate) {
          predicate = this.buildTableStylePredicate(effectiveConditionCode);
          DynamicRowTemplateComponent.columnStyleConditionCache.set(cacheKey, predicate);
        }

        try {
          if (predicate(this.metaInfo, rowData, WtoolboxService)) {
            classes.push(cssClass);
          }
        } catch {
        }
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
        let predicate = DynamicRowTemplateComponent.columnStyleConditionCache.get(cacheKey);
        if (!predicate) {
          predicate = this.buildTableStylePredicate(conditionalCode);
          DynamicRowTemplateComponent.columnStyleConditionCache.set(cacheKey, predicate);
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

  /**
* Recupera e prepara i dati richiesti dal chiamante usando i metadati per determinare campi, chiavi e comportamento runtime.
* @param fieldName Valore testuale usato come chiave, campo, route o parametro di configurazione.
* @returns Valore di tipo `MetadatiColonna | null` costruito dal metodo per i passaggi successivi del flusso.
*/
  getMetaColumn(fieldName: string): MetadatiColonna | null {
    if (!fieldName) {
      return null;
    }

    const fromColumns = (this.columns || []).find((c: any) => c?.metaColumn?.mc_nome_colonna === fieldName) as any;
    if (fromColumns?.metaColumn) {
      return fromColumns.metaColumn as MetadatiColonna;
    }

    const fromMetaInfo = (this.metaInfo?.columnMetadata || []).find((c: any) => c?.mc_nome_colonna === fieldName) as any;
    return (fromMetaInfo || null) as MetadatiColonna | null;
  }

  /**
   * Restituisce metadato colonna runtime delegando al callback parent quando disponibile.
   */
  resolveRuntimeGridFieldMeta(metaColumn: MetadatiColonna, rowData: any): MetadatiColonna {
    if (typeof this.getRuntimeGridFieldMeta === 'function') {
      try {
        return this.getRuntimeGridFieldMeta(metaColumn, rowData);
      } catch {
      }
    }
    return metaColumn;
  }

  /**
   * Compila e ritorna una subclass di `DynamicRowTemplateComponent` con il
   * template passato, via `DynamicCompilerService` (API pubblica Angular
   * `Compiler`). Refactor 2026-04-23: sostituisce `ɵcompileComponent` +
   * `ɵcompileNgModule` private con l'API pubblica — sblocca prod mode con
   * `optimization.scripts: true` senza il crash `Cannot redefine property:
   * ɵfac`. Vedi skills/angular-jit-compiler-migration/SKILL.md.
   *
   * @param template Template HTML della row da compilare a runtime.
   * @returns Subclass compilata pronta per `createComponent` / viewChild.
   */
  static getComponentFromTemplate(template: string, route?: string): typeof DynamicRowTemplateComponent {
    const baseImports = MetadataProviderService.widgetDefinition.gridRowImports || [];
    // IMPORTANTE (bug prod-build Angular 21 tree-shaking):
    // In prod l'Angular bundler NON analizza i template compilati DINAMICAMENTE a
    // runtime via `ɵcompileComponent` (questo file), quindi NON rileva l'uso di
    // `*ngIf`, `*ngFor`, `[ngClass]`, `[ngStyle]` dentro il template string. Se
    // CommonModule e' nel set baseImports ma le sue direttive non sono nominativamente
    // riferite da qualche altra parte del bundle (che e' il caso del template
    // dinamico), il bundler le **tree-shaka** dal CommonModule esportato, e il
    // template runtime compila SENZA risolvere le direttive → `*ngIf` diventa
    // un no-op (l'Angular compiler non trova la direttiva NgIf, emette placeholder
    // `<!---->` e basta). Sintomo: righe list-grid vuote, footer/header OK.
    //
    // Fix: riferiamo esplicitamente le direttive CommonModule usate dal template
    // dinamico della list-grid (NgIf, NgForOf, NgClass, NgStyle, NgSwitch,
    // NgTemplateOutlet, NgComponentOutlet). Questo bind statico forza il
    // bundler a includerle nel chunk e a passarle al compile runtime.
    const allImports = [
      ...baseImports,
      // Direttive strutturali @angular/common (vedi commento sopra)
      NgIf, NgForOf, NgClass, NgStyle,
      NgSwitch, NgSwitchCase, NgSwitchDefault,
      NgTemplateOutlet, NgComponentOutlet,
      // TableModule importato direttamente da `primeng/table` per garantire
      // identita' del riferimento. Anche se l'host lo passa via
      // `widgetDefinition.gridRowImports`, in prod l'esbuild crea **due
      // bundle slot** distinti per lo stesso simbolo (uno via re-export
      // `wuic-framework-lib`, uno via diretto). Angular runtime confronta
      // identita' di reference, non struttura → con due istanze diverse,
      // le declarations di TableModule non sono visibili al template
      // compile-time del wrapper. Aggiungere TableModule direttamente da
      // qui (stesso path di import che la lib usa internamente per
      // RowToggler ecc.) rimuove l'ambiguita': c'e' una sola istanza,
      // le directive interne sono risolte correttamente.
      TableModule
    ];

    // Le frozen-left columns sono ora gestite dalla directive standalone
    // `[wuicFrozenColumn]` (wuic-frozen-column.directive.ts), passata via
    // `gridRowImports` dell'host. Applica la classe `p-datatable-frozen-column`
    // (eredita le regole CSS PrimeNG `position:sticky` + `background:inherit`)
    // e calcola `style.left` inline sommando le offsetWidth delle sibling
    // precedenti — nessuna CSS extra ne sync delle var richiesta.
    return DynamicCompilerService.compile({
      template,
      selector: 'tr',
      baseClass: DynamicRowTemplateComponent,
      imports: allImports,
      providers: [ConfirmationService],
      templateField: 'md_rowTemplate',
      route,
    }) as typeof DynamicRowTemplateComponent;
  }

  /**
* Gestisce la logica di `onRowSelect` orchestrando le chiamate `rowCustomSelect`.
* @param $event Evento UI/payload evento che innesca la logica del metodo.
* @param rowData Dato/record su cui il metodo applica trasformazioni, validazioni o aggiornamenti.
*/
  onRowSelect($event, rowData) {
    if (this.rowCustomSelect && this.dt) {
      this.dt.selection = rowData;
    }

    if (this.rowCustomSelect) {
      this.rowCustomSelect($event, rowData, this.dt);
    }
  }

  /**
   * Propaga il blur della cella editabile al chiamante.
   */
  onCellFocusOut(event: FocusEvent, rowData: any, metaColumn: any): void {
    if (!this.inlineCellEditingEnabled || typeof this.onInlineCellEditorBlur !== 'function') {
      return;
    }

    this.onInlineCellEditorBlur(event, rowData, metaColumn);
  }

  /**
 * Verifica una condizione di stato o di validita normalizzando e trasformando collezioni di record.
 * @returns Esito booleano dell'elaborazione svolta dal metodo.
 */
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

  /**
* Gestisce la logica operativa di `areSameRow` in modo coerente con l'implementazione corrente.
* @param a Parametro utilizzato dal metodo nel flusso elaborativo.
* @param b Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Esito booleano della verifica/esecuzione effettuata da `areSameRow`.
*/
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
}
