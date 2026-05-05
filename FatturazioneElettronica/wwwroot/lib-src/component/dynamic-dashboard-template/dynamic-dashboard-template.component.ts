import { AsyncPipe, JsonPipe, NgClass, NgComponentOutlet, NgFor, NgIf, NgStyle } from '@angular/common';
import { Component, Input } from '@angular/core';
import { DynamicCompilerService } from '../../service/dynamic-compiler.service';
import { PropConverterPipe } from '../../pipe/prop-converter.pipe';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DataSourceComponent } from '../data-source/data-source.component';
import { BehaviorSubject } from 'rxjs';
import { DataRepeaterComponent } from '../data-repeater/data-repeater.component';
import { NgxDraggableDomDirective } from "../../directive/ngx-draggable-dom.directive";
import { AngularResizableDirective } from '../../directive/angular-resizable.directive';
import { DataBoundDirective } from '../../directive/data-bound.directive';
import { TabPanelWrapperComponent } from '../tab-panel-wrapper/tab-panel-wrapper.component';
import { TabViewWrapperComponent } from '../tab-view-wrapper/tab-view-wrapper.component';
import { SplitAreaComponent } from '../split-area/split-area.component';
import { SplitComponent } from '../split/split.component';
import { CdkAccordion, CdkAccordionItem, CdkAccordionModule } from '@angular/cdk/accordion';
import { DesignerTool } from '../../class/designerTool';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { FilterBarComponent } from '../filter-bar/filter-bar.component';
import { PagerComponent } from '../pager/pager.component';
import { LazyParametricDialogComponent } from '../parametric-dialog/parametric-dialog.lazy.component';
import { MetadataProviderService } from '../../service/metadata-provider.service';

@Component({
  selector: 'wuic-dynamic-dashboard-template',
  template: '',
  styleUrl: './dynamic-dashboard-template.component.css',
  standalone: false
})
export class DynamicDashboardTemplateComponent {
  /**
   * Timestamp (Date.now()) of the most recent designer drag/resize gesture step.
   * Set continuously by `onResizing`/`onMoving` while the user manipulates an
   * element. Read by DesignerComponent.onWindowMouseup/onWindowTouchend to decide
   * whether the just-ended pointer release closed a designer mutation worth
   * pushing onto the undo stack. Static so a single global signal works regardless
   * of which template instance handled the gesture (every dashboard element has
   * its own DynamicDashboardTemplateComponent instance).
   *
   * Why not bind `(rzStop)`/`(stopped)` on every element template? There are 22
   * generated tag strings in designer.component.ts that would each need both
   * extra bindings, and the bindings would still need to call into the designer.
   * The mouseup/touchend hook already exists and runs in the designer — using a
   * shared timestamp reuses that path with two two-line writes.
   *
   * The 0 sentinel means "no pending gesture". The DesignerComponent consumes
   * the value (resets it to 0) after committing so a follow-up unrelated mouseup
   * does not trigger a spurious commit.
   */
  static lastDesignerGestureTimestamp = 0;
  /**
   * Input dal componente padre per inputs; usata nella configurazione e nel rendering del componente.
   */
  @Input() inputs: any;
  /**
   * Input dal componente padre per input props; usata nella configurazione e nel rendering del componente.
   */
  @Input() inputProps: any;
  /**
   * Input dal componente padre per tool props; usata nella configurazione e nel rendering del componente.
   */
  @Input() toolProps: any[];

  /**
   * Input dal componente padre per suggestions; usata nella configurazione e nel rendering del componente.
   */
  @Input() suggestions: any[];
  /**
   * Input dal componente padre per tool id; usata nella configurazione e nel rendering del componente.
   */
  @Input() toolId: number;
  /**
   * Input dal componente padre per component id; usata nella configurazione e nel rendering del componente.
   */
  @Input() componentId: number;
  /**
   * Input dal componente padre per unique name; usata nella configurazione e nel rendering del componente.
   */
  @Input() uniqueName: string;

  /**
   * Input dal componente padre per name; usata nella configurazione e nel rendering del componente.
   */
  @Input() name: string;
  /**
   * Input dal componente padre per tag; usata nella configurazione e nel rendering del componente.
   */
  @Input() tag: string;
  /**
   * Input dal componente padre per icon; usata nella configurazione e nel rendering del componente.
   */
  @Input() icon: string;
  /**
   * Input dal componente padre per group; usata nella configurazione e nel rendering del componente.
   */
  @Input() group: string;
  /**
   * Input dal componente padre per nested components; usata nella configurazione e nel rendering del componente.
   */
  @Input() nestedComponents: any[];
  /**
   * Input dal componente padre per allowed children; usata nella configurazione e nel rendering del componente.
   */
  @Input() allowedChildren: string[];

  /**
   * Input dal componente padre per hide; usata nella configurazione e nel rendering del componente.
   */
  @Input() hide: boolean;
  /**
   * Input dal componente padre per component ref; usata nella configurazione e nel rendering del componente.
   */
  @Input() componentRef: { component: BehaviorSubject<any>, id: number, name: string, uniqueName: string };

  /**
   * Input dal componente padre per on drop; usata nella configurazione e nel rendering del componente.
   */
  @Input() onDrop: any;
  /**
   * Input dal componente padre per ctx items; usata nella configurazione e nel rendering del componente.
   */
  @Input() ctxItems: any;
  /**
   * Proprieta di stato del componente per select display formula fns, usata dalla logica interna e dal template.
   */
  private selectDisplayFormulaFns: { [formula: string]: Function } = {};

  /**
   * Input dal componente padre per component; usata nella configurazione e nel rendering del componente.
   */
  @Input() component: any;

  /**
* Gestisce la logica operativa di `stringify` in modo coerente con l'implementazione corrente.
* @param obj Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Risultato elaborato da `stringify` e restituito al chiamante.
*/
  stringify(obj) {
    let cache: any[] = [];
    let str = JSON.stringify(obj, function (key, value: any) {
      if (typeof value === "object" && value !== null) {
        if (cache.indexOf(value) !== -1) {
          // Circular reference found, discard key
          return;
        }
        // Store value in our collection
        cache.push(value);
      }
      return value;
    });
    cache = []; // reset the cache
    return str;
  }

  /**
* Gestisce la logica operativa di `onResizing` in modo coerente con l'implementazione corrente.
* @param event Evento che innesca il comportamento del metodo.
* @param element Parametro utilizzato dal metodo nel flusso elaborativo.
* @param parentElement Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  onResizing(event, element, parentElement) {
    if (parentElement) {
    } else {

    }

    element.inputs.width = event.size.width + 'px';
    element.inputs.height = event.size.height + 'px';

    // Mark "designer mutation in progress" so the next window:mouseup in
    // DesignerComponent commits a history snapshot. See the field doc.
    DynamicDashboardTemplateComponent.lastDesignerGestureTimestamp = Date.now();
  }

  /**
* Gestisce la logica operativa di `onMoving` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param element Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  onMoving($event, element) {
    // debugger;
    // element.inputs.left = $event.position.x + 'px';
    // element.inputs.top = $event.position.y + 'px';

    // element.inputs.position = 'absolute';
    let scaleX = 1, skewY = 0, skewX = 0, scaleY = 1;

    if (element.inputs.transform) {
      let matrix = element.inputs.transform.replace('matrix(', '').replace(')', '').split(',').map(x => parseFloat(x));

      if (matrix.length >= 1) {
        scaleX = matrix[0];
      }

      if (matrix.length >= 2) {
        skewY = matrix[1];
      }

      if (matrix.length >= 3) {
        skewX = matrix[2];
      }

      if (matrix.length >= 4) {
        scaleY = matrix[3];
      }
    }

    element.inputs.transform = `matrix(${scaleX}, ${skewY}, ${skewX}, ${scaleY}, ${$event.position.x}, ${$event.position.y})`;

    // Mark "designer mutation in progress" so the next window:mouseup in
    // DesignerComponent commits a history snapshot. See the field doc.
    DynamicDashboardTemplateComponent.lastDesignerGestureTimestamp = Date.now();
  }

  /**
* Gestisce la logica operativa di `onDragEnter` in modo coerente con l'implementazione corrente.
* @param $event Evento che innesca il comportamento del metodo.
* @param th Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  onDragEnter($event, th) {
    debugger;
  }

  /**
* Recupera e prepara i dati richiesti dal chiamante allineando i record al formato atteso dal framework.
* @param inputs Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param opt Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
*/
  getSelectOptionLabel(inputs: any, opt: any): string {
    const fallback = this.getSelectOptionFallbackLabel(inputs, opt);
    const formula = String(inputs?.displayFormula || '').trim();
    if (!formula) {
      return fallback;
    }

    try {
      const fn = this.getSelectDisplayFormulaFn(formula);
      if (!fn) {
        return fallback;
      }

      const datasource = inputs?.datasource?.component?.value || null;
      const record = datasource?.resultInfo?.current || {};
      const result = fn(opt, record, datasource, inputs, WtoolboxService);
      if (result === null || result === undefined || result === '') {
        return fallback;
      }

      return String(result);
    } catch {
      return fallback;
    }
  }

  /**
* Recupera e prepara i dati richiesti dal chiamante allineando i record al formato atteso dal framework.
* @param inputs Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param rowData Record/elemento su cui vengono applicate elaborazioni o aggiornamenti.
* @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
*/
  getUlItemDisplayValue(inputs: any, rowData: any): string {
    const formula = String(inputs?.displayFormula || '').trim();
    if (!formula) {
      return '';
    }

    try {
      const fn = this.getSelectDisplayFormulaFn(formula);
      if (!fn) {
        return '';
      }

      const datasource = inputs?.datasource?.component?.value || null;
      const record = datasource?.resultInfo?.current || {};
      const result = fn(rowData, record, datasource, inputs, WtoolboxService);
      return result === null || result === undefined ? '' : String(result);
    } catch {
      return '';
    }
  }

  /**
* Recupera i dati/valori richiesti da `getLabelDisplayValue`.
* @param inputs Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Stringa risultante calcolata da `getLabelDisplayValue` per chiavi/label o valori testuali.
*/
  getLabelDisplayValue(inputs: any): string {
    const datasource = inputs?.datasource?.component?.value || null;
    const rowData = datasource?.resultInfo?.current || null;
    const displayField = String(inputs?.displayField || '').trim();
    const directValue = displayField ? rowData?.[displayField] : inputs?.innerText;
    const fallbackRaw = directValue instanceof BehaviorSubject ? directValue.value : directValue;
    const fallback = String(fallbackRaw ?? inputs?.innerText ?? '');
    const formula = String(inputs?.displayFormula || '').trim();
    if (!formula) {
      return fallback;
    }

    try {
      const fn = this.getSelectDisplayFormulaFn(formula);
      if (!fn) {
        return fallback;
      }

      const record = datasource?.resultInfo?.current || {};
      const result = fn(rowData, record, datasource, inputs, WtoolboxService);
      if (result === null || result === undefined || result === '') {
        return fallback;
      }

      return String(result);
    } catch {
      return fallback;
    }
  }

  /**
* Recupera i dati/valori richiesti da `getSelectOptionFallbackLabel`.
* @param inputs Parametro utilizzato dal metodo nel flusso elaborativo.
* @param opt Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Stringa risultante calcolata da `getSelectOptionFallbackLabel` per chiavi/label o valori testuali.
*/
  private getSelectOptionFallbackLabel(inputs: any, opt: any): string {
    if (inputs?.datasource?.component?.value?.resultInfo?.dato) {
      return String(opt?.[inputs?.textField] ?? opt?.[inputs?.valueField] ?? '');
    }

    return typeof opt === 'string' ? opt.trim() : String(opt ?? '');
  }

  /**
* Recupera i dati/valori richiesti da `getSelectDisplayFormulaFn`.
* @param formula Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore di tipo `Function | null` prodotto da `getSelectDisplayFormulaFn`.
*/
  private getSelectDisplayFormulaFn(formula: string): Function | null {
    if (this.selectDisplayFormulaFns[formula]) {
      return this.selectDisplayFormulaFns[formula];
    }

    try {
      this.selectDisplayFormulaFns[formula] = new Function('dataItem', 'record', 'datasource', 'inputs', 'wtoolbox', formula);
      return this.selectDisplayFormulaFns[formula];
    } catch {
      return null;
    }
  }

  /**
   * Abilita drag/drop solo in contesto designer.
   */
  isDesignerMode(): boolean {
    const hash = String(window?.location?.hash || '').toLowerCase();
    return hash.includes('/designer');
  }

  /**
   * Compila un template dashboard dinamico via `DynamicCompilerService`.
   * Refactor 2026-04-23: API pubblica `Compiler` sostituisce `ɵcompileComponent`
   * privata. Vedi skills/angular-jit-compiler-migration/SKILL.md.
   *
   * Nota: il precedente `styles: ['./dynamic-dashboard-template.component.css']`
   * era dead: `styles` del decorator `@Component` accetta CSS **inline**
   * stringhe, non path relativi. Il CSS del componente base e' gia' applicato
   * via `styleUrl` sulla classe originale; le subclass ereditano il nodo
   * Shadow DOM/Emulated del componente padre quando usate via NgComponentOutlet.
   */
  static getComponentFromTemplate(template: string, route?: string, templateField?: string): typeof DynamicDashboardTemplateComponent {
    const normalizedTemplate = String(template || '')
      .replace(/wuic-parametric-dialog(?!-lazy)/g, 'wuic-parametric-dialog-lazy')
      .replace(/ngxDraggableDom\s*=\s*\"true\"/g, '[ngxDraggableDom]="isDesignerMode()"')
      .replace(/ngxDraggableDom\s*=\s*\'true\'/g, '[ngxDraggableDom]="isDesignerMode()"');

    return DynamicCompilerService.compile({
      template: normalizedTemplate,
      baseClass: DynamicDashboardTemplateComponent,
      imports: [
        AsyncPipe, JsonPipe, NgFor, NgIf, PropConverterPipe, NgStyle, NgClass,
        NgxDraggableDomDirective, AngularResizableDirective,
        DashboardComponent, DataSourceComponent, DataRepeaterComponent,
        DataBoundDirective, NgComponentOutlet,
        TabViewWrapperComponent, TabPanelWrapperComponent,
        SplitComponent, SplitAreaComponent,
        CdkAccordionModule, CdkAccordion, CdkAccordionItem,
        FilterBarComponent, LazyParametricDialogComponent, PagerComponent,
        ...MetadataProviderService.customDesignerComponents,
      ],
      templateField: templateField || 'dom_board.boardcontent',
      route,
    }) as typeof DynamicDashboardTemplateComponent;
  }
}


