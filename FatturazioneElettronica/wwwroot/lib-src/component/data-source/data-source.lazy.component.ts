import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit  } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';

/**
 * Cache module-scope della promise di import dinamico di `DataSourceComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let dataSourceComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-data-source-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyDataSourceComponent implements OnInit {
  /**
   * Input dal componente padre per route; usata nella configurazione e nel rendering del componente.
   */
  @Input() route: BehaviorSubject<string>;
  /**
   * Input dal componente padre per route from routing; usata nella configurazione e nel rendering del componente.
   */
  @Input() routeFromRouting: boolean = false;
  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;
  /**
   * Input dal componente padre per autoload; usata nella configurazione e nel rendering del componente.
   */
  @Input() autoload?: boolean;
  /**
   * Input dal componente padre per loading; usata nella configurazione e nel rendering del componente.
   */
  @Input() loading: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  /**
   * Input dal componente padre per change tracking; usata nella configurazione e nel rendering del componente.
   */
  @Input() changeTracking?: boolean;
  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;
  /**
   * Input dal componente padre per parent datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentDatasource: any;
  /**
   * Input dal componente padre per component ref; usata nella configurazione e nel rendering del componente.
   */
  @Input() componentRef: BehaviorSubject<{ component: any; id: number; name: string; uniqueName: string }>;

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    dataSourceComponentPromise ??= import('./data-source.component').then((m) => m.DataSourceComponent);
    this.loadedComponent = await dataSourceComponentPromise;
    this.cdr.markForCheck();
  }

  /**
   * Costruisce l'oggetto `inputs` passato al `NgComponentOutlet`, inoltrando al componente reale tutti i binding ricevuti dal wrapper lazy.
   * @returns Mappa `nomeInput -> valore` usata per istanziare `DataSourceComponent` in modalità lazy.
   */
  componentInputs() {
    return {
      route: this.route,
      routeFromRouting: this.routeFromRouting,
      hardcodedRoute: this.hardcodedRoute,
      autoload: this.autoload,
      loading: this.loading,
      changeTracking: this.changeTracking,
      parentRecord: this.parentRecord,
      parentMetaInfo: this.parentMetaInfo,
      parentDatasource: this.parentDatasource,
      componentRef: this.componentRef
    };
  }
}


