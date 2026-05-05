import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClassicPreset as Classic } from 'rete';
import { RefDirective } from 'rete-angular-plugin/21';
import type { ViewColumn } from './view-builder.types';

export type TableNodeExtraData = {
  width?: number;
  height?: number;
  route: string;
  mdId: number | null;
  tableName: string;
  schemaName: string;
  caption: string;
  tableAlias: string;
  columns: ViewColumn[];
  onColumnToggle?: (alias: string, selected: boolean) => void;
  onCollapseToggle?: (collapsed: boolean) => void;
  onRemoveNode?: () => void;
  onColumnFormula?: (col: ViewColumn) => void;
  /** Callback invocato dal context-menu dell'header per rinominare il tableAlias.
   *  Implementato in view-builder.component.ts: apre promptDialog, valida unicita'
   *  e pattern SQL identifier, aggiorna node.tableAlias + cascade su col.tableAlias. */
  onRenameAlias?: () => void;
};

@Component({
  selector: 'wuic-view-builder-node',
  standalone: true,
  imports: [CommonModule, FormsModule, RefDirective, TooltipModule],
  template: `
    <div class="vb-node" [class.vb-node--selected]="selected">
      <div class="vb-node__header" [title]="nodeData?.route || ''"
        (pointerdown)="onHeaderPointerDown($event)"
        (pointerup)="onHeaderPointerUp($event)"
        (contextmenu)="onHeaderContextMenu($event)"
        style="cursor:pointer;">
        <i class="pi" [ngClass]="collapsed ? 'pi-chevron-right' : 'pi-chevron-down'" style="font-size:0.7rem;"></i>
        <i class="pi pi-table"></i>
        <!-- Toggle-all checkbox: seleziona/deseleziona tutte le colonne non-virtuali. stopPropagation su pointerdown/pointerup/click isola dal listener dell'header (collapse toggle) senza rompere il comportamento default del checkbox. -->
        <input type="checkbox" class="vb-node__toggle-all"
          [checked]="allSelectableSelected"
          title="Seleziona/deseleziona tutti i campi"
          (pointerdown)="$event.stopPropagation()"
          (pointerup)="$event.stopPropagation()"
          (click)="onToggleAllClick($event)" />
        <span class="vb-node__title">{{ nodeData?.caption || nodeData?.route || 'Table' }}</span>
        <span class="vb-node__alias">({{ nodeData?.tableAlias }})</span>
        <span class="vb-node__col-count">({{ selectedCount }})</span>
        <i class="pi pi-times vb-node__remove-btn" title="Remove table"
          (pointerdown)="$event.stopPropagation()"
          (click)="removeNode($event)"></i>
      </div>
      <!-- Collapsed: show sockets on the header row -->
      <div *ngIf="collapsed" class="vb-node__collapsed-sockets">
        <ng-container *ngFor="let col of nodeData?.columns || []">
          <div class="vb-node__socket-out vb-node__socket-collapsed"
            [class.vb-node__socket--connected]="$any(data).connectedOutputs?.has(col.alias)"
            *ngIf="$any(data).outputs[col.alias]"
            refComponent
            [data]="{type: 'socket', side: 'output', key: col.alias, nodeId: data.id, payload: $any(data).outputs[col.alias]?.socket, seed: seed}"
            [emit]="emit"></div>
          <div class="vb-node__socket-in vb-node__socket-collapsed"
            [class.vb-node__socket--connected]="$any(data).connectedInputs?.has(col.alias)"
            *ngIf="$any(data).inputs[col.alias]"
            refComponent
            [data]="{type: 'socket', side: 'input', key: col.alias, nodeId: data.id, payload: $any(data).inputs[col.alias]?.socket, seed: seed}"
            [emit]="emit"></div>
        </ng-container>
      </div>
      <!-- wheel stop: the column list is scrollable, rete-area on canvas must not eat the wheel gesture.
           pointerdown stop ONLY when target is the scrollable container itself (scrollbar track click).
           Child clicks (socket for connection drag, checkbox, label) must bubble freely so rete-connection-plugin
           can start the drag. Without the target === currentTarget guard, stopping every pointerdown breaks
           the connect-by-drag flow between two nodes (observed 2026-04-24 on self-join same-route). -->
      <div class="vb-node__columns" *ngIf="!collapsed"
        (wheel)="$event.stopPropagation()"
        (pointerdown)="onColumnsPointerDown($event)">
        <div *ngFor="let col of nodeData?.columns || []" class="vb-node__col-row"
          [class.vb-node__col-row--virtual]="col.virtual"
          [class.vb-node__col-row--has-formula]="col.formula"
          (contextmenu)="onColumnContextMenu($event, col)">
          <label class="vb-node__col-label" (pointerdown)="$event.stopPropagation()"
            [pTooltip]="col.formula ? 'Formula: ' + col.formula + (col.formulaAlias ? ' AS ' + col.formulaAlias : '') : col.alias + ' | ui: ' + (col.uiType || '-') + ' | db: ' + (col.dbType || '-')"
            tooltipPosition="left">
            <input type="checkbox" [(ngModel)]="col.selected"
              [disabled]="col.virtual"
              (ngModelChange)="toggleColumn(col, $event)" />
            <i *ngIf="col.formula || col.formulaAlias" class="pi pi-bolt vb-node__formula-icon" title="Custom formula"></i>
            <span [class.vb-node__col-fk]="col.uiType === 'lookupByID'"
              [class.vb-node__col-formula]="col.formula || col.formulaAlias">{{ col.formulaAlias || col.label || col.alias }}<ng-container *ngIf="col.uiType === 'lookupByID' && col.alias !== col.label"> ({{ col.alias }})</ng-container></span>
            <i *ngIf="col.uiType === 'lookupByID'" class="pi pi-link vb-node__fk-icon"
              [title]="'FK → ' + col.lookupEntityName"></i>
          </label>
          <div class="vb-node__socket-out"
            [class.vb-node__socket--connected]="$any(data).connectedOutputs?.has(col.alias)"
            *ngIf="$any(data).outputs[col.alias]"
            refComponent
            [data]="{type: 'socket', side: 'output', key: col.alias, nodeId: data.id, payload: $any(data).outputs[col.alias]?.socket, seed: seed}"
            [emit]="emit"></div>
          <div class="vb-node__socket-in"
            [class.vb-node__socket--connected]="$any(data).connectedInputs?.has(col.alias)"
            *ngIf="$any(data).inputs[col.alias]"
            refComponent
            [data]="{type: 'socket', side: 'input', key: col.alias, nodeId: data.id, payload: $any(data).inputs[col.alias]?.socket, seed: seed}"
            [emit]="emit"></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .vb-node {
      background: var(--surface-card, #fff);
      border: 2px solid var(--surface-border, #dee2e6);
      border-radius: 8px;
      min-width: 240px;
      max-width: 320px;
      font-size: 0.85rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    .vb-node--selected { border-color: var(--primary-color, #3B82F6); }
    .vb-node__header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--primary-color, #3B82F6);
      color: #fff;
      font-weight: 600;
    }
    .vb-node__alias { opacity: 0.7; font-size: 0.75rem; }
    .vb-node__col-count { margin-left: auto; opacity: 0.8; font-size: 0.75rem; }
    .vb-node__remove-btn { font-size: 0.7rem; opacity: 0.6; padding: 2px 4px; cursor: pointer; }
    .vb-node__remove-btn:hover { opacity: 1; }
    .vb-node__toggle-all {
      margin: 0 4px 0 2px;
      cursor: pointer;
      vertical-align: middle;
    }
    .vb-node__columns {
      max-height: 260px;
      overflow-y: auto;
      padding: 4px 0;
    }
    .vb-node__col-row {
      display: flex;
      align-items: center;
      padding: 2px 10px;
      position: relative;
      user-select: none;
    }
    .vb-node__col-row:hover { background: var(--surface-hover, #f4f4f4); }
    .vb-node__col-row--virtual { opacity: 0.45; }
    .vb-node__col-row--has-formula { background: #eff6ff; border-left: 2px solid var(--primary-color, #3B82F6); }
    .vb-node__col-row--virtual .vb-node__col-label { cursor: default; }
    .vb-node__col-label {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      cursor: pointer;
      font-size: 0.8rem;
    }
    .vb-node__col-fk { font-style: italic; }
    .vb-node__col-formula { color: var(--primary-color, #3B82F6); font-weight: 600; }
    .vb-node__formula-icon { font-size: 0.65rem; color: #f59e0b; margin-right: 1px; }
    .vb-node__fk-icon { font-size: 0.7rem; color: var(--primary-color, #3B82F6); }
    .vb-node__socket-out, .vb-node__socket-in {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--primary-color, #3B82F6);
      background: #fff;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      cursor: crosshair;
      z-index: 10;
    }
    .vb-node__socket-out { right: -8px; }
    .vb-node__socket-out:hover { background: var(--primary-color, #3B82F6); border-color: #1d4ed8; }
    .vb-node__socket-in { left: -8px; }
    .vb-node__socket-in:hover { background: #4ade80; border-color: #16a34a; }
    /* Rete internal socket: fill the visual socket area and stay interactive for drag */
    .vb-node__socket-out ::ng-deep > *,
    .vb-node__socket-in ::ng-deep > * {
      opacity: 0;
      width: 16px !important;
      height: 16px !important;
      margin: 0 !important;
      border-radius: 50%;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      cursor: crosshair;
    }
    .vb-node__collapsed-sockets {
      position: relative;
      height: 0;
      overflow: visible;
    }
    .vb-node__socket-collapsed {
      position: absolute !important;
      top: -16px !important;
    }
    .vb-node__socket-collapsed.vb-node__socket-out { right: -6px !important; pointer-events: none !important; cursor: default !important; }
    .vb-node__socket-collapsed.vb-node__socket-in { left: -6px !important; pointer-events: none !important; cursor: default !important; }
    .vb-node__socket-collapsed ::ng-deep > * { pointer-events: none !important; }
    .vb-node__socket--connected ::ng-deep > * {
      opacity: 1;
      background: #4ade80 !important;
      border: 2px solid #16a34a !important;
    }
  `],
  host: { 'data-testid': 'vb-node' }
})
export class ViewBuilderNodeComponent implements OnChanges {
  @Input() data!: Classic.Node & TableNodeExtraData;
  @Input() emit!: (data: any) => void;
  @Input() rendered!: () => void;

  selected = false;
  collapsed = false;
  seed = 0;

  @HostBinding('style.width.px')
  get width() { return this.data?.width ?? 280; }

  @HostBinding('style.height.px')
  get height() { return this.data?.height ?? null; }

  get nodeData(): TableNodeExtraData | null {
    return this.data ?? null;
  }

  get selectedCount(): number {
    return this.nodeData?.columns?.filter(c => c.selected)?.length ?? 0;
  }

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnChanges(): void {
    // Sync collapsed state from node data (for restore from saved definition)
    if ((this.data as any)?.collapsed !== undefined) {
      this.collapsed = !!(this.data as any).collapsed;
    }
    this.cdr.detectChanges();
    requestAnimationFrame(() => this.rendered?.());
    this.seed++;
  }

  private headerPointerDownTime = 0;
  /** True quando il pointerdown sull'header e' stato fatto col tasto destro.
   *  In quel caso onHeaderPointerUp NON deve fare collapse toggle — il right
   *  click e' gestito da `onHeaderContextMenu` (rename alias dialog). */
  private headerPointerDownIsRightClick = false;

  onHeaderPointerDown(e: PointerEvent): void {
    this.headerPointerDownTime = Date.now();
    // e.button: 0=left, 2=right, 1=middle. Su destro non vogliamo che il
    // successivo pointerup triggeri il collapse.
    this.headerPointerDownIsRightClick = e.button === 2;
    // Don't stop propagation — let Rete handle drag if user drags.
  }

  onHeaderPointerUp(e: PointerEvent): void {
    // Right-click: niente collapse (gestito da contextmenu separato).
    if (this.headerPointerDownIsRightClick || e.button === 2) {
      this.headerPointerDownIsRightClick = false;
      return;
    }
    const elapsed = Date.now() - this.headerPointerDownTime;
    // Only toggle if it was a quick click (not a drag)
    if (elapsed < 300) {
      this.collapsed = !this.collapsed;
      this.cdr.detectChanges();
      requestAnimationFrame(() => {
        this.rendered?.();
        this.nodeData?.onCollapseToggle?.(this.collapsed);
      });
    }
  }

  /** Right-click sull'header apre il dialog "Rinomina alias tabella".
   *  preventDefault blocca il context menu nativo del browser; stopPropagation
   *  isola l'evento dal canvas (che altrimenti tratterebbe il right-click come
   *  pan gesture). */
  onHeaderContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.nodeData?.onRenameAlias?.();
  }

  onColumnContextMenu(e: MouseEvent, col: ViewColumn): void {
    e.preventDefault();
    e.stopPropagation();
    this.nodeData?.onColumnFormula?.(col);
  }

  removeNode(e: Event): void {
    e.stopPropagation();
    this.nodeData?.onRemoveNode?.();
  }

  toggleColumn(col: ViewColumn, checked: boolean): void {
    col.selected = checked;
    this.nodeData?.onColumnToggle?.(col.alias, checked);
  }

  /**
   * Stop pointerdown propagation **only** when the user clicks the scrollable
   * container itself (scrollbar track drag) — so the browser-native scrollbar
   * drag works without rete-area-plugin (attached on canvas) consuming the
   * event as a pan gesture.
   * Quando invece il target e' un figlio (socket, label, checkbox) lasciamo
   * bubble-are liberamente, altrimenti rete-connection-plugin non vede
   * l'evento e il drag per creare connessioni tra nodi non parte.
   */
  onColumnsPointerDown(e: PointerEvent): void {
    if (e.target === e.currentTarget) {
      e.stopPropagation();
    }
  }

  /**
   * True se TUTTE le colonne non-virtuali sono selezionate. Usato per lo stato
   * `[checked]` del toggle-all nell'header. Le colonne virtuali (readonly per
   * regola esistente `[disabled]="col.virtual"`) sono escluse dal calcolo.
   */
  get allSelectableSelected(): boolean {
    const cols = (this.nodeData?.columns || []).filter(c => !c.virtual);
    return cols.length > 0 && cols.every(c => c.selected);
  }

  /**
   * Toggle-all handler. Se almeno una colonna non-virtuale e' deselezionata,
   * seleziona tutte; altrimenti deseleziona tutte. Riusa `onColumnToggle` del
   * nodeData per notificare ogni cambio al view-builder (mantiene coerenza con
   * il path del toggle singolo). `stopPropagation` sull'evento blocca che il
   * click risalga all'header e triggeri il collapse toggle.
   */
  onToggleAllClick(e: Event): void {
    e.stopPropagation();
    const cols = (this.nodeData?.columns || []).filter(c => !c.virtual);
    if (!cols.length) return;
    const nextState = !this.allSelectableSelected;
    cols.forEach(c => {
      if (c.selected !== nextState) {
        c.selected = nextState;
        this.nodeData?.onColumnToggle?.(c.alias, nextState);
      }
    });
    this.cdr.detectChanges();
  }
}
