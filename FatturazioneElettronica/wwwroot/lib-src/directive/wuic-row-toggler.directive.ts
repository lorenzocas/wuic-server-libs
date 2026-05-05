/**
 * WuicRowTogglerDirective — equivalente standalone di
 * `[pRowToggler]` di PrimeNG `TableModule`.
 *
 * # Perche'
 *
 * `pRowToggler` e' una directive `isStandalone:false` non visibile dallo
 * scope dei template runtime-compiled del framework (vedi commento in
 * `wuic-frozen-column.directive.ts` per la diagnosi completa).
 *
 * Soluzione: replicare il behavior come standalone owned da WUIC.
 *
 * # Cosa replica
 *
 * Comportamento osservato dal sorgente PrimeNG `primeng-table.mjs:5080`
 * (RowToggler):
 *
 *  - HostListener `click` → chiama `dataTable.toggleRow(this.data, event)`
 *    e `event.preventDefault()`.
 *  - Input `[pRowToggler]="rowData"` → bind del payload.
 *  - Input `[pRowTogglerDisabled]` → no-op se true.
 *
 * # Differenze
 *
 * Nel framework WUIC, l'host del template dinamico
 * (`DynamicRowTemplateComponent`) ha gia' `@Input() toggleRow:
 * (rowData, $event, dt) => void` come funzione passata dal parent
 * `ListGridComponent`. Quindi la nostra directive non ha bisogno di
 * inject(Table) di PrimeNG — basta accettare la funzione toggle come
 * input addizionale.
 *
 * Forme supportate:
 *  - `[wuicRowToggler]="rowData" [wuicToggleFn]="toggleRow" [wuicTable]="dt"`
 *    → click → chiama `toggleRow(rowData, $event, dt)`. Pattern allineato
 *    al workaround precedente in `list-grid.component.ts` ma incapsulato
 *    nella directive per non duplicare l'handler in ogni cell.
 */

import { Directive, HostListener, Input, inject } from '@angular/core';

@Directive({
  selector: '[wuicRowToggler]',
  standalone: true,
})
export class WuicRowTogglerDirective {
  /** Payload della row, passato all'handler toggleRow. */
  @Input('wuicRowToggler') data: any;

  /**
   * Funzione toggle gia' bound al parent ListGridComponent. Riceve
   * `(rowData, $event, dt)` come argomenti e gestisce internamente
   * l'espansione/collasso della riga + i `rowExpand` events PrimeNG.
   */
  @Input() wuicToggleFn?: (rowData: any, event: Event, dt: any) => void;

  /** Riferimento al p-table host. Necessario perche' lo handler
   * `toggleRow` di list-grid usa il dt ref per chiamare a sua volta
   * il PrimeNG `Table.toggleRow`. */
  @Input() wuicTable: any;

  /** Disabilita il click handler quando true. */
  @Input() wuicRowTogglerDisabled = false;

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    if (this.wuicRowTogglerDisabled) return;
    if (typeof this.wuicToggleFn === 'function') {
      this.wuicToggleFn(this.data, event, this.wuicTable);
    }
    event.preventDefault();
  }
}
