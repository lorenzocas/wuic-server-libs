import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit, ViewChild  } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';

/**
 * Cache module-scope della promise di import dinamico di `ChartListComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let chartListComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-chart-list-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyChartListComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;
  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;
  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per hide toolbar; inoltrato al componente reale.
   */
  @Input() hideToolbar: boolean = false;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    chartListComponentPromise ??= import('./chart-list.component').then((m) => m.ChartListComponent);
    this.loadedComponent = await chartListComponentPromise;
    this.cdr.markForCheck();
  }

          /**
   * Gestisce la logica di `componentInputs` con il flusso specifico definito dalla sua implementazione.
   * @returns Oggetto risultato costruito dal metodo per il passo successivo del flusso.
   */
  componentInputs() {
    return {
      hardcodedRoute: this.hardcodedRoute,
      parentRecord: this.parentRecord,
      parentMetaInfo: this.parentMetaInfo,
      datasource: this.datasource,
      hardcodedDatasource: this.hardcodedDatasource,
      hideToolbar: this.hideToolbar
    };
  }
}


