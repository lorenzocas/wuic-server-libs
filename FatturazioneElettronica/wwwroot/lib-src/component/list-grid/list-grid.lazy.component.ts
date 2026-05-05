import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, AfterViewInit, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild  } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import type { Table } from 'primeng/table';

/**
 * Cache module-scope della promise di import dinamico di `ListGridComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let listGridComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-list-grid-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  styles: [`
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }
  `],
  template: `
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
  `
})
export class LazyListGridComponent implements OnInit, AfterViewInit, OnDestroy {
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
   * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
  /**
   * Input dal componente padre per hide toolbar; inoltrato al list-grid reale.
   */
  @Input() hideToolbar: boolean = false;
  @Output() onBeforeRowRender = new EventEmitter<any>();
  @Output() onAfterRowRender = new EventEmitter<any>();
  @Output() onAfterRender = new EventEmitter<any>();
  @Output() onPaging = new EventEmitter<any>();
  @Output() onSorting = new EventEmitter<any>();
  @Output() onFiltering = new EventEmitter<any>();
  @Output() onPTableSelectionChange = new EventEmitter<any>();
  @Output() onPTableRowExpand = new EventEmitter<any>();
  @Output() onPTableRowCollapse = new EventEmitter<any>();
  @Output() onPTableColumnResize = new EventEmitter<any>();
  @Output() onPTableColumnReorder = new EventEmitter<any>();

  /**
   * Proprieta di stato del componente per loaded component, usata dalla logica interna e dal template.
   */
  loadedComponent: any = null;

  constructor(private readonly cdr: ChangeDetectorRef) { }
  private outputSubscriptions: Subscription[] = [];
  private wireHandle?: ReturnType<typeof setTimeout>;

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit(): Promise<void> {
    listGridComponentPromise ??= import('./list-grid.component').then((m) => m.ListGridComponent);
    this.loadedComponent = await listGridComponentPromise;
    this.cdr.markForCheck();
    this.scheduleWireInnerOutputs();
  }

  ngAfterViewInit(): void {
    this.scheduleWireInnerOutputs();
  }

  ngOnDestroy(): void {
    this.clearOutputSubscriptions();
    if (this.wireHandle) {
      clearTimeout(this.wireHandle);
      this.wireHandle = undefined;
    }
  }

  private scheduleWireInnerOutputs(): void {
    if (this.wireHandle) {
      clearTimeout(this.wireHandle);
    }
    this.wireHandle = setTimeout(() => {
      this.wireHandle = undefined;
      this.wireInnerOutputs();
    }, 0);
  }

  private wireInnerOutputs(): void {
    this.clearOutputSubscriptions();

    const instance = this.innerOutlet?.componentInstance as any;
    if (!instance) {
      return;
    }

    const outputNames = [
      'onBeforeRowRender',
      'onAfterRowRender',
      'onAfterRender',
      'onPaging',
      'onSorting',
      'onFiltering',
      'onPTableSelectionChange',
      'onPTableRowExpand',
      'onPTableRowCollapse',
      'onPTableColumnResize',
      'onPTableColumnReorder'
    ];

    outputNames.forEach((eventName) => {
      const source = instance[eventName];
      const target = (this as any)[eventName];
      if (!source || typeof source.subscribe !== 'function' || !target || typeof target.emit !== 'function') {
        return;
      }
      const sub = source.subscribe((payload: any) => target.emit(payload));
      this.outputSubscriptions.push(sub);
    });
  }

  private clearOutputSubscriptions(): void {
    this.outputSubscriptions.forEach((s) => s?.unsubscribe?.());
    this.outputSubscriptions = [];
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
      rowCustomSelect: this.rowCustomSelect,
      hideToolbar: this.hideToolbar
    };
  }
}


