import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `ReportDesignerComponent`.
 * Stesso pattern dei vari Lazy*Component: il primo arrivato innesca l'import,
 * i successivi attendono la stessa promise gia risolta evitando CD extra.
 */
let reportDesignerComponentPromise: Promise<any> | null = null;

/**
 * Lazy wrapper di `<wuic-report-designer>`. Selector dedicato
 * `<wuic-report-designer-lazy>` per essere mountabile da template Angular
 * senza importare il componente reale staticamente.
 *
 * Razionale: `ReportDesignerComponent` importa staticamente
 * `stimulsoft-designer-angular` (wrapper + Stimulsoft Designer runtime,
 * ancora piu' pesante del viewer perche' include UI editing). Esportando
 * solo questo lazy wrapper dal barrel `wuic-framework-lib`, esbuild crea
 * un chunk lazy separato caricato SOLO quando il designer monta a runtime
 * (route `/reports/{id}/edit`, click "Modifica report", ecc.).
 *
 * Il componente non ha @Input: i parametri sono letti via `ActivatedRoute`.
 */
@Component({
  selector: 'wuic-report-designer-lazy',
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
export class LazyReportDesignerComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;

  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    reportDesignerComponentPromise ??= import('./report-designer.component').then(
      (m) => m.ReportDesignerComponent
    );
    this.loadedComponent = await reportDesignerComponentPromise;
    this.cdr.markForCheck();
  }
}
