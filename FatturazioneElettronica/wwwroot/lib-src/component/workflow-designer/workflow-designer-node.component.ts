import { CommonModule, KeyValue } from '@angular/common';
import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges } from '@angular/core';
import { ClassicPreset as Classic } from 'rete';
import { ImpureKeyvaluePipe, RefDirective } from 'rete-angular-plugin/21';

type NodeExtraData = { width?: number; height?: number; [key: string]: any };
type SortValue<N extends Classic.Node> = (N['controls'] | N['inputs'] | N['outputs'])[string];
type NodeShape = { width: number; titlePadX: number; titleInsetX: number; path: string; kind: string };

@Component({
  selector: 'wuic-workflow-designer-node',
  standalone: true,
  imports: [CommonModule, RefDirective, ImpureKeyvaluePipe],
  templateUrl: './workflow-designer-node.component.html',
  styleUrl: './workflow-designer-node.component.css',
  host: {
    'data-testid': 'node'
  }
})
export class WorkflowDesignerNodeComponent implements OnChanges {
  /**
   * Input dal componente padre per data; usata nella configurazione e nel rendering del componente.
   */
  @Input() data!: Classic.Node & NodeExtraData;
  /**
   * Input dal componente padre per emit; usata nella configurazione e nel rendering del componente.
   */
  @Input() emit!: (data: any) => void;
  /**
   * Input dal componente padre per rendered; usata nella configurazione e nel rendering del componente.
   */
  @Input() rendered!: () => void;

  /**
   * Proprieta di stato del componente per seed, usata dalla logica interna e dal template.
   */
  seed = 0;

      /**
   * Gestisce la logica operativa di `width` orchestrando le chiamate `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.width.px')
  get width() {
    return this.data?.width ?? this.resolveShape().width;
  }

        /**
   * Gestisce la logica di `height` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  @HostBinding('style.height.px')
  get height() {
    return this.data?.height ?? 96;
  }

        /**
   * Gestisce la logica di `selected` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  @HostBinding('class.selected')
  get selected() {
    return !!this.data?.selected;
  }

      /**
   * Gestisce la logica operativa di `nodeType` orchestrando le chiamate `String`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('attr.data-wf-node-type')
  get nodeType(): string {
    return String((this.data as any)?.workflowType || '');
  }

      /**
   * Gestisce la logica operativa di `actionScope` orchestrando le chiamate `Number`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('attr.data-wf-action-scope')
  get actionScope(): string {
    const scopeId = Number((this.data as any)?.workflowActionScopeId);
    return scopeId === 1 ? 'col' : 'tab';
  }

      /**
   * Gestisce la logica operativa di `actionType` orchestrando le chiamate `Number` e `isFinite`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('attr.data-wf-action-type')
  get actionType(): string {
    const typeId = Number((this.data as any)?.workflowActionTypeId);
    return Number.isFinite(typeId) ? String(typeId) : '';
  }

      /**
   * Gestisce la logica operativa di `accentColor` orchestrando le chiamate `String` e `Number`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.--wf-node-accent')
  get accentColor(): string {
    const type = String((this.data as any)?.workflowType || '');
    const scopeId = Number((this.data as any)?.workflowActionScopeId);
    const actionTypeId = Number((this.data as any)?.workflowActionTypeId);
    return this.resolveVisual(type, scopeId, actionTypeId).accent;
  }

      /**
   * Gestisce la logica operativa di `backgroundColor` orchestrando le chiamate `String` e `Number`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  @HostBinding('style.--wf-node-bg')
  get backgroundColor(): string {
    const type = String((this.data as any)?.workflowType || '');
    const scopeId = Number((this.data as any)?.workflowActionScopeId);
    const actionTypeId = Number((this.data as any)?.workflowActionTypeId);
    return this.resolveVisual(type, scopeId, actionTypeId).background;
  }

      /**
   * function Object() { [native code] }
   * @param cdr Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  constructor(private cdr: ChangeDetectorRef) {
    this.cdr.detach();
  }

  /**
   * Reagisce ai cambiamenti degli input aggiornando stato e comportamento del componente.
   */
  ngOnChanges(): void {
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered?.());
    this.seed++;
  }

            /**
   * Gestisce la logica operativa di `sortByIndex` in modo coerente con l'implementazione corrente.
   * @param a Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param b Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore numerico prodotto da `sortByIndex` (indice, conteggio o misura operativa).
   */





  sortByIndex<N extends Classic.Node, I extends KeyValue<string, SortValue<N>>>(a: I, b: I): number {
    const ai = a.value?.index || 0;
    const bi = b.value?.index || 0;
    return ai - bi;
  }

      /**
   * Gestisce la logica operativa di `shapePath` orchestrando le chiamate `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get shapePath(): string {
    return this.resolveShape().path;
  }

      /**
   * Gestisce la logica operativa di `shapeKind` orchestrando le chiamate `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get shapeKind(): string {
    return this.resolveShape().kind;
  }

        /**
   * Gestisce la logica di `svgViewBox` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  get svgViewBox(): string {
    return `0 0 ${this.effectiveWidth} ${this.effectiveHeight}`;
  }

      /**
   * Gestisce la logica operativa di `titleBandX` orchestrando le chiamate `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get titleBandX(): number {
    return 2 + this.resolveShape().titleInsetX;
  }

      /**
   * Gestisce la logica operativa di `titleBandWidth` orchestrando le chiamate `resolveShape` e `max`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get titleBandWidth(): number {
    const inset = 2 + this.resolveShape().titleInsetX;
    return Math.max(40, this.effectiveWidth - (inset * 2));
  }

      /**
   * Gestisce la logica operativa di `titleTextX` orchestrando le chiamate `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get titleTextX(): number {
    return 2 + this.resolveShape().titleInsetX + this.resolveShape().titlePadX;
  }

        /**
   * Gestisce la logica di `titleBandHeight` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  get titleBandHeight(): number {
    return this.titleLines.length > 1 ? 34 : 30;
  }

        /**
   * Gestisce la logica di `titleTextY` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  get titleTextY(): number {
    return this.titleLines.length > 1 ? 7 : 8;
  }

        /**
   * Gestisce la logica di `titleLineDy` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */



  get titleLineDy(): number {
    return 11;
  }

      /**
   * Gestisce la logica operativa di `titleLines` orchestrando le chiamate `String` e `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get titleLines(): string[] {
    const raw = String(this.data?.label || '').trim();
    if (!raw) {
      return [];
    }

    const inset = 2 + this.resolveShape().titleInsetX + this.resolveShape().titlePadX;
    const usableWidthPx = Math.max(40, this.effectiveWidth - (inset * 2));
    const maxCharsPerLine = Math.max(10, Math.floor(usableWidthPx / 7.1));
    return this.wrapLabel(raw, maxCharsPerLine, 2);
  }

      /**
   * Gestisce la logica operativa di `dashedStroke` orchestrando le chiamate `String` e `Number`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get dashedStroke(): string | null {
    const type = String((this.data as any)?.workflowType || '');
    const scopeId = Number((this.data as any)?.workflowActionScopeId);
    return type === 'action' && scopeId === 1 ? '4 3' : null;
  }

              /**
   * Risolge il valore finale in `resolveVisual` combinando contesto runtime e regole locali.
   * @param type Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param actionScopeId Identificativo tecnico usato per lookup o confronto.
   * @param actionTypeId Identificativo tecnico usato per lookup o confronto.
   * @returns Valore di tipo `{ accent: string; background: string }` prodotto da `resolveVisual`.
   */
  private resolveVisual(type: string, actionScopeId: number, actionTypeId: number): { accent: string; background: string } {
    if (type === 'route') {
      return { accent: '#2563eb', background: '#eff6ff' };
    }

    if (type === 'action') {
      const byActionType = new Map<number, { accent: string; background: string }>([
        [0, { accent: '#0f766e', background: '#ecfdf5' }], // navigation
        [1, { accent: '#4c1d95', background: '#f5f3ff' }], // method call
        [2, { accent: '#7c2d12', background: '#fff7ed' }], // generate file
        [3, { accent: '#0f4c81', background: '#eff6ff' }], // export
        [4, { accent: '#374151', background: '#f3f4f6' }], // stored call
        [5, { accent: '#166534', background: '#f0fdf4' }], // approve
        [6, { accent: '#9a3412', background: '#fff7ed' }], // parametric dialog
        [7, { accent: '#9f1239', background: '#fff1f2' }], // client sync
        [8, { accent: '#0e7490', background: '#ecfeff' }]  // client async
      ]);
      const typed = byActionType.get(actionTypeId);
      if (typed) {
        return typed;
      }
      return actionScopeId === 1
        ? { accent: '#7c3aed', background: '#f5f3ff' }
        : { accent: '#c2410c', background: '#fff7ed' };
    }

    if (type === 'start') {
      return { accent: '#15803d', background: '#f0fdf4' };
    }
    if (type === 'end') {
      return { accent: '#9f1239', background: '#fff1f2' };
    }
    if (type === 'condition') {
      return { accent: '#0f766e', background: '#f0fdfa' };
    }

    return { accent: '#475569', background: '#f8fafc' };
  }

      /**
   * Gestisce la logica operativa di `effectiveWidth` orchestrando le chiamate `Number` e `resolveShape`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */
  private get effectiveWidth(): number {
    return Number(this.data?.width || this.resolveShape().width);
  }

      /**
   * Gestisce la logica operativa di `effectiveHeight` orchestrando le chiamate `Number`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */
  private get effectiveHeight(): number {
    return Number(this.data?.height || 96);
  }

          /**
   * Recupera informazioni tramite `resolveShape` orchestrando le chiamate `String` e `Number`.
   * @returns Valore di tipo `NodeShape` restituito dal metodo.
   */
  private resolveShape(): NodeShape {
    const type = String((this.data as any)?.workflowType || '');
    const actionTypeId = Number((this.data as any)?.workflowActionTypeId);

    if (type === 'start' || type === 'end') {
      const width = 210;
      return { width, titlePadX: 14, titleInsetX: 12, path: this.roundedRectPath(18, width, this.effectiveHeight), kind: 'pill' };
    }
    if (type === 'route') {
      const width = 240;
      return { width, titlePadX: 14, titleInsetX: 2, path: this.roundedRectPath(14, width, this.effectiveHeight), kind: 'route' };
    }
    if (type === 'condition') {
      const width = 228;
      return { width, titlePadX: 12, titleInsetX: 28, path: this.polygonPath([[50, 0], [100, 50], [50, 100], [0, 50]], width, this.effectiveHeight), kind: 'diamond' };
    }
    if (type !== 'action') {
      const width = 220;
      return { width, titlePadX: 10, titleInsetX: 2, path: this.roundedRectPath(10, width, this.effectiveHeight), kind: 'default' };
    }

    switch (actionTypeId) {
      case 0: // navigation
      {
        const width = 238;
        return { width, titlePadX: 12, titleInsetX: 18, path: this.polygonPath([[0, 0], [90, 0], [100, 50], [90, 100], [0, 100], [10, 50]], width, this.effectiveHeight), kind: 'tag-right' };
      }
      case 1: // method.call
      {
        const width = 232;
        return { width, titlePadX: 14, titleInsetX: 10, path: this.polygonPath([[6, 0], [94, 0], [100, 18], [100, 100], [0, 100], [0, 18]], width, this.effectiveHeight), kind: 'bevel' };
      }
      case 2: // generate.file
      {
        const width = 248;
        return { width, titlePadX: 12, titleInsetX: 22, path: this.polygonPath([[8, 0], [92, 0], [100, 50], [92, 100], [8, 100], [0, 50]], width, this.effectiveHeight), kind: 'hexagon' };
      }
      case 3: // export
      {
        const width = 236;
        return { width, titlePadX: 12, titleInsetX: 24, path: this.polygonPath([[10, 0], [100, 0], [90, 100], [0, 100]], width, this.effectiveHeight), kind: 'parallelogram' };
      }
      case 4: // call.stored
      {
        const width = 238;
        return { width, titlePadX: 14, titleInsetX: 8, path: this.polygonPath([[0, 0], [100, 0], [92, 100], [8, 100]], width, this.effectiveHeight), kind: 'trapezoid' };
      }
      case 5: // approve
      {
        const width = 230;
        return { width, titlePadX: 14, titleInsetX: 2, path: this.roundedRectPath(14, width, this.effectiveHeight), kind: 'rounded' };
      }
      case 6: // parametric.dialog
      {
        const width = 246;
        return { width, titlePadX: 12, titleInsetX: 20, path: this.polygonPath([[8, 0], [92, 0], [100, 10], [100, 90], [92, 100], [8, 100], [0, 90], [0, 10]], width, this.effectiveHeight), kind: 'octagon' };
      }
      case 7: // client sync
      {
        const width = 240;
        return { width, titlePadX: 16, titleInsetX: 12, path: this.roundedRectPath(22, width, this.effectiveHeight), kind: 'pill' };
      }
      case 8: // client async
      {
        const width = 240;
        return { width, titlePadX: 12, titleInsetX: 20, path: this.polygonPath([[10, 0], [90, 0], [100, 20], [100, 80], [90, 100], [10, 100], [0, 80], [0, 20]], width, this.effectiveHeight), kind: 'cut-corners' };
      }
      default:
      {
        const width = 228;
        return { width, titlePadX: 14, titleInsetX: 2, path: this.roundedRectPath(10, width, this.effectiveHeight), kind: 'rounded' };
      }
    }
  }

            /**
   * Gestisce la logica operativa di `roundedRectPath` in modo coerente con l'implementazione corrente.
   * @param radius Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param w Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param h Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `roundedRectPath` per chiavi/label o valori testuali.
   */
  private roundedRectPath(radius: number, w: number, h: number): string {
    const rr = Math.max(0, Math.min(Math.min(w, h) / 2, Number(radius || 0)));
    return `M ${rr} 0 H ${w - rr} Q ${w} 0 ${w} ${rr} V ${h - rr} Q ${w} ${h} ${w - rr} ${h} H ${rr} Q 0 ${h} 0 ${h - rr} V ${rr} Q 0 0 ${rr} 0 Z`;
  }

            /**
   * Gestisce la logica operativa di `polygonPath` in modo coerente con l'implementazione corrente.
   * @param points Collezione in ingresso processata dal metodo.
   * @param w Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param h Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `polygonPath` per chiavi/label o valori testuali.
   */
  private polygonPath(points: Array<[number, number]>, w: number, h: number): string {
    if (!points.length) {
      return this.roundedRectPath(10, w, h);
    }

    const toPx = ([x, y]: [number, number]) => [x / 100 * w, y / 100 * h] as [number, number];
    const [firstX, firstY] = toPx(points[0]);
    const rest = points.slice(1).map((p) => {
      const [x, y] = toPx(p);
      return `L ${x} ${y}`;
    }).join(' ');
    return `M ${firstX} ${firstY} ${rest} Z`;
  }

              /**
   * Gestisce la logica operativa di `wrapLabel` in modo coerente con l'implementazione corrente.
   * @param raw Valore in ingresso elaborato o normalizzato dal metodo.
   * @param maxCharsPerLine Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param maxLines Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Collezione `string[]` derivata dalla trasformazione dei dati nel metodo `wrapLabel`.
   */
  private wrapLabel(raw: string, maxCharsPerLine: number, maxLines: number): string[] {
    const words = raw.split(/\s+/).filter((x) => !!x);
    if (!words.length) {
      return [];
    }

    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
        continue;
      }

      if (!current) {
        const shortened = this.truncateWithEllipsis(word, maxCharsPerLine);
        lines.push(shortened);
        current = '';
      } else {
        lines.push(current);
        current = word.length > maxCharsPerLine
          ? this.truncateWithEllipsis(word, maxCharsPerLine)
          : word;
      }

      if (lines.length >= maxLines) {
        break;
      }
    }

    if (lines.length < maxLines && current) {
      lines.push(current.length > maxCharsPerLine ? this.truncateWithEllipsis(current, maxCharsPerLine) : current);
    }

    if (lines.length > maxLines) {
      lines.splice(maxLines);
    }

    if (lines.length === maxLines) {
      const consumed = lines.join(' ').replace(/\u2026/g, '').length;
      if (raw.length > consumed && !lines[maxLines - 1].endsWith('…')) {
        lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(1, maxCharsPerLine - 1)).trimEnd() + '…';
      }
    }

    return lines;
  }

            /**
   * Gestisce la logica operativa di `truncateWithEllipsis` in modo coerente con l'implementazione corrente.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @param maxCharsPerLine Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `truncateWithEllipsis` per chiavi/label o valori testuali.
   */
  private truncateWithEllipsis(value: string, maxCharsPerLine: number): string {
    const limit = Math.max(2, Number(maxCharsPerLine || 0));
    if (value.length <= limit) {
      return value;
    }

    return value.slice(0, Math.max(1, limit - 1)) + '…';
  }
}


