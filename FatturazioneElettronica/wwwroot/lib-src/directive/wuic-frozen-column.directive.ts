/**
 * WuicFrozenColumnDirective — equivalente standalone di
 * `[pFrozenColumn]` di PrimeNG `TableModule`.
 *
 * # Perche'
 *
 * `pFrozenColumn` e' una directive `isStandalone:false` di `TableModule`.
 * Quando il framework WUIC compila a runtime un template di row dinamico
 * (via `DynamicCompilerService.compile` con l'API pubblica
 * `Compiler.compileModuleAndAllComponentsSync` di Angular 21 deprecated),
 * le directive `isStandalone:false` AOT-compiled (come `pFrozenColumn`,
 * `pRowToggler`) NON vengono propagate allo scope del child component
 * JIT-compilato — verificato sperimentalmente in prod su /cities/list,
 * 2026-04-25, dopo aver provato 4 strategie diverse (declarations puro,
 * flatten ricorsivo di NgModule.exports, patch post-compile dei
 * directiveDefs, shadow class subclass).
 *
 * Soluzione: replicare il comportamento di `pFrozenColumn` come directive
 * **standalone** owned dal framework. Le standalone funzionano in scope
 * via `imports: [...]` di un Component standalone — pattern che il
 * Compiler pubblico runtime SUPPORTA correttamente.
 *
 * # Cosa replica
 *
 * Comportamento osservato dal sorgente PrimeNG `primeng-table.mjs:4420`
 * (FrozenColumn) + verifica DOM su un header `<th pFrozenColumn>` in prod
 * su /cities/list:
 *
 *  - Applica la classe **`p-datatable-frozen-column`** (originariamente
 *    `cx("frozenColumn")`) — cosi' eredita gli stili PrimeNG esistenti
 *    (position:sticky, background, z-index dei selettori CSS PrimeNG
 *    .p-datatable .p-datatable-frozen-column).
 *  - Calcola `style.left` (alignFrozen='left') o `style.right`
 *    (alignFrozen='right') sommando dinamicamente le `offsetWidth` delle
 *    sibling cell precedenti / successive nello stesso `<tr>`.
 *  - Re-calcola su window resize + ResizeObserver del proprio elemento.
 *  - Se il parent ha un `<tr>` filterRow successivo, propaga gli offset
 *    alla cella di filtro corrispondente per indice.
 *
 * # Differenze rispetto a `pFrozenColumn`
 *
 *  - `selector: '[wuicFrozenColumn]'` invece di `[pFrozenColumn]` — diverso
 *    nome per evitare collisioni con il selettore originale e rendere
 *    l'origine WUIC esplicita nei devtools.
 *  - **Standalone:true** (vs PrimeNG isStandalone:false).
 *  - Non e' subclass di `BaseComponent` PrimeNG → no DI di `platformId`,
 *    `el`, `renderer`. Inietta direttamente `ElementRef`. Niente impatto
 *    funzionale per il client.
 */

import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  NgZone,
  OnDestroy,
  inject,
} from '@angular/core';

@Directive({
  selector: '[wuicFrozenColumn]',
  standalone: true,
  host: {
    'class': 'p-datatable-frozen-column',
  },
})
export class WuicFrozenColumnDirective implements AfterViewInit, OnDestroy {
  /**
   * Direzione di align. `'left'` (default) calcola lo sticky offset dalla
   * sinistra sommando le sibling precedenti; `'right'` somma le sibling
   * successive e setta `style.right`.
   */
  @Input() alignFrozen: 'left' | 'right' = 'left';

  /**
   * Frozen flag. Falsy (false / undefined / "") disattiva il calcolo
   * dell'offset (no `style.left` impostato). Truthy attiva.
   *
   * Compatibile col binding `[wuicFrozenColumn]="true"` (alias `frozen`)
   * usato nel template della row dinamica.
   */
  @Input('wuicFrozenColumn') set frozen(val: any) {
    this._frozen = val !== false && val !== 'false';
    Promise.resolve(null).then(() => this.update());
  }
  get frozen(): boolean { return this._frozen; }
  private _frozen = true;

  private el = inject(ElementRef) as ElementRef<HTMLElement>;
  private zone = inject(NgZone);
  private resizeListener?: () => void;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.update();
    this.bindResizeListener();
    this.observeChanges();
  }

  ngOnDestroy(): void {
    this.unbindResizeListener();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  }

  private bindResizeListener(): void {
    if (typeof window === 'undefined' || this.resizeListener) return;
    this.zone.runOutsideAngular(() => {
      this.resizeListener = () => this.update();
      window.addEventListener('resize', this.resizeListener!);
    });
  }

  private unbindResizeListener(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }
  }

  /**
   * Strategia di stabilita': osserviamo l'header row (`<thead><tr>`) come
   * single source of truth per le column widths. Il browser layouta prima
   * il `<colgroup>`/headers e poi forza le body cells ad allinearsi a quei
   * widths. Quindi:
   *
   *  - L'`offsetLeft` dell'header `<th>` corrispondente alla nostra colonna
   *    e' STABILE non appena il primo paint del thead e' completo, anche
   *    se le body cells stanno ancora reflowando per content async.
   *  - Quando un header cell cambia width (column resize, font load,
   *    container resize), tutto il body si riallinea simultaneamente: noi
   *    osserviamo il `<thead><tr>` e ricalcoliamo TUTTE le frozen body
   *    cell di colpo, evitando glitch di transizione.
   *  - Un solo ResizeObserver per cella (osservando un set finito di
   *    elementi: thead row + suoi child) e' piu' efficiente del walking
   *    di sibling per ogni cell.
   *
   * Fallback: se non c'e' un `<thead>` (table senza header) o non troviamo
   * il `<th>` corrispondente, ripieghiamo sul walk delle sibling precedenti
   * (comportamento originale).
   */
  private observeChanges(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.update());
      this.resizeObserver.observe(this.el.nativeElement);
      const headerRow = this.findHeaderRow();
      if (headerRow) {
        this.resizeObserver.observe(headerRow);
        // Osserva ogni header cell: ResizeObserver del row non scatta se
        // un singolo th cambia width senza che il totale del row cambi
        // (es. resize che redistribuisce widths tra colonne).
        for (let i = 0; i < headerRow.children.length; i++) {
          this.resizeObserver.observe(headerRow.children[i] as HTMLElement);
        }
      }
    });
  }

  /** Trova il `<thead><tr>` del table ancestor della nostra cella. */
  private findHeaderRow(): HTMLTableRowElement | null {
    const table = this.el.nativeElement.closest('table') as HTMLTableElement | null;
    if (!table) return null;
    return table.querySelector('thead tr') as HTMLTableRowElement | null;
  }

  /**
   * Calcolo l'offset left del nostro `<td>` leggendolo dal corrispondente
   * `<th>` header (stesso `cellIndex`). Il header e' laid out per primo
   * dal browser ed e' la sorgente di verita' delle column widths.
   *
   * Ritorna `null` se non c'e' header o cellIndex non e' risolvibile —
   * il chiamante usa il fallback sibling-walk.
   */
  private computeLeftFromHeader(): number | null {
    const td = this.el.nativeElement as HTMLTableCellElement;
    const cellIndex = td.cellIndex;
    if (typeof cellIndex !== 'number' || cellIndex < 0) return null;
    const headerRow = this.findHeaderRow();
    const th = headerRow?.children[cellIndex] as HTMLElement | undefined;
    if (!th) return null;
    return th.offsetLeft;
  }

  /** Idem per align='right': somma offsetWidth degli `<th>` successivi. */
  private computeRightFromHeader(): number | null {
    const td = this.el.nativeElement as HTMLTableCellElement;
    const cellIndex = td.cellIndex;
    if (typeof cellIndex !== 'number' || cellIndex < 0) return null;
    const headerRow = this.findHeaderRow();
    if (!headerRow) return null;
    let right = 0;
    for (let i = cellIndex + 1; i < headerRow.children.length; i++) {
      right += (headerRow.children[i] as HTMLElement).offsetWidth;
    }
    return right;
  }

  private update(): void {
    const node = this.el.nativeElement;
    if (!this._frozen) {
      node.style.left = '';
      node.style.right = '';
      return;
    }
    if (this.alignFrozen === 'right') {
      let right = this.computeRightFromHeader();
      if (right === null) {
        // Fallback: somma sibling successive
        right = 0;
        let sib = node.nextElementSibling as HTMLElement | null;
        while (sib) {
          right += sib.offsetWidth;
          sib = sib.nextElementSibling as HTMLElement | null;
        }
      }
      node.style.right = right + 'px';
    } else {
      let left = this.computeLeftFromHeader();
      if (left === null) {
        // Fallback: somma sibling precedenti
        left = 0;
        let sib = node.previousElementSibling as HTMLElement | null;
        while (sib) {
          left += sib.offsetWidth;
          sib = sib.previousElementSibling as HTMLElement | null;
        }
      }
      node.style.left = left + 'px';
    }

    // Propaga al filterRow se presente come parent.nextElementSibling.tr,
    // matchando per indice colonna nel tr corrente.
    const filterRow = node.parentElement?.nextElementSibling as HTMLElement | null;
    if (filterRow && filterRow.children) {
      const cellIndex = (node as HTMLTableCellElement).cellIndex;
      const filterCell = (cellIndex >= 0 ? filterRow.children[cellIndex] : null) as HTMLElement | null;
      if (filterCell) {
        filterCell.style.left = node.style.left;
        filterCell.style.right = node.style.right;
      }
    }
  }
}
