import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';

/**
 * Cache module-scope della promise di import dinamico di `ReportViewerComponent`.
 * Stesso pattern dei vari Lazy*Component (chart-list, scheduler-list,
 * spreadsheet-list-sf): con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta evitando CD extra.
 */
let reportViewerComponentPromise: Promise<any> | null = null;

/**
 * Lazy wrapper di `<wuic-report-viewer>`. Selector dedicato
 * `<wuic-report-viewer-lazy>` per essere mountabile da template Angular
 * senza importare il componente reale staticamente.
 *
 * Razionale: `ReportViewerComponent` importa staticamente
 * `stimulsoft-viewer-angular` (~540 KB raw del wrapper Angular + Stimulsoft
 * runtime intero ~12.7 MB raw nel chunk dedicato). Esportando solo questo
 * lazy wrapper dal barrel `wuic-framework-lib`, esbuild crea un chunk lazy
 * separato che viene caricato SOLO quando il viewer monta a runtime
 * (route docs `/reports/{id}/view`, click "Apri report", ecc.). Senza il
 * wrapper, ogni consumer del barrel finisce per trascinare il viewer +
 * tutto Stimulsoft nel suo main initial chunk.
 *
 * Il componente non ha @Input: i parametri (es. `reportId`) sono letti
 * via `ActivatedRoute` dal componente reale.
 */
@Component({
  selector: 'wuic-report-viewer-lazy',
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
export class LazyReportViewerComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;

  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }

  async ngOnInit(): Promise<void> {
    reportViewerComponentPromise ??= import('./report-viewer.component').then(
      (m) => m.ReportViewerComponent
    );
    this.loadedComponent = await reportViewerComponentPromise;
    this.cdr.markForCheck();
  }
}
