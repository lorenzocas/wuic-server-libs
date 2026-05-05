import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnInit, ViewChild  } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';

/**
 * Cache module-scope della promise di import dinamico di `KanbanListComponent`.
 * Senza questa cache, ogni istanza di questo lazy wrapper chiama `import(...)` separatamente
 * (microtask + change detection extra). Con la cache, il primo arrivato innesca l'import;
 * i successivi attendono la stessa promise gia risolta.
 */
let kanbanListComponentPromise: Promise<any> | null = null;

@Component({
  selector: 'wuic-kanban-list-lazy',
  standalone: true,
  imports: [NgComponentOutlet],
  template: `
    <div class="kanban-lazy-host">
    @if (loadedComponent) {
      <ng-container *ngComponentOutlet="loadedComponent; inputs: componentInputs()" />
    }
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .kanban-lazy-host {
      display: flex;
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .kanban-lazy-host > * {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }
  `]
})
export class LazyKanbanListComponent implements OnInit {
  @ViewChild(NgComponentOutlet) innerOutlet?: NgComponentOutlet;
  @Input() hardcodedRoute: string;
  @Input() parentRecord: any;
  @Input() parentMetaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() hideToolbar: boolean = false;

  loadedComponent: any = null;


  constructor(private readonly cdr: ChangeDetectorRef) { }
  async ngOnInit(): Promise<void> {
    kanbanListComponentPromise ??= import('./kanban-list.component').then((m) => m.KanbanListComponent);
    this.loadedComponent = await kanbanListComponentPromise;
    this.cdr.markForCheck();
  }

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
