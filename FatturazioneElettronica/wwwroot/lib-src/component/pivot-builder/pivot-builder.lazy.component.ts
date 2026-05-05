import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `PivotBuilderComponent`.
 * Stesso pattern dei vari Lazy*Component (chart-list, scheduler-list,
 * spreadsheet-list-sf, report-viewer, report-designer): con la cache, il
 * primo arrivato innesca l'import; i successivi attendono la stessa promise
 * gia risolta evitando CD extra.
 */
let pivotBuilderComponentPromise: Promise<any> | null = null;

/**
 * Lazy wrapper di `<wuic-pivot-builder>`. Selector dedicato
 * `<wuic-pivot-builder-lazy>` per essere mountabile da template Angular
 * senza importare il componente reale staticamente.
 *
 * Razionale: `PivotBuilderComponent` importa staticamente molti moduli
 * `primeng/*` (autocomplete, splitbutton, accordion, dialog, splitter, ecc.)
 * + utility metadata e visualizzazione (~215 KB raw del solo componente).
 * Esportandolo direttamente dal barrel `wuic-framework-lib`, esbuild non
 * riesce a tree-shake l'import via grafo statico → finisce nel main chunk
 * iniziale anche per consumer che non aprono mai il pivot builder.
 *
 * Esportiamo SOLO questo lazy wrapper dal barrel: il chunk lazy del vero
 * componente viene scaricato SOLO quando il wrapper monta a runtime
 * (route `:route/pivot-builder` o `pivot-builder`).
 *
 * Il componente non ha @Input: i parametri (es. `route`) sono letti via
 * `ActivatedRoute` dal componente reale.
 */
@Component({
  selector: 'wuic-pivot-builder-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent" />
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }
  `]
})
export class LazyPivotBuilderComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;

  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    pivotBuilderComponentPromise ??= import('./pivot-builder.component').then(
      (m) => m.PivotBuilderComponent
    );
    this.loadedComponent = await pivotBuilderComponentPromise;
    this.cdr.markForCheck();
  }
}
