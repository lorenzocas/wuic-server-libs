import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, KanbanListComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-kanban-page',
  imports: [CommonModule, DataSourceComponent, KanbanListComponent],
  templateUrl: './cities-kanban-page.component.html',
  styleUrls: ['./cities-kanban-page.component.css']
})
export class CitiesKanbanPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(KanbanListComponent) kanban?: KanbanListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const kanban = this.kanban;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesKanbanPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesKanbanPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesKanbanPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesKanbanPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesKanbanPage] afterSync$', x)));
    }

    if (kanban) {
      this.subscriptions.add(kanban.onKanbanDataBound.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanDataBound', x)));
      this.subscriptions.add(kanban.onKanbanCardDrop.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanCardDrop', x)));
      this.subscriptions.add(kanban.onKanbanCardClick.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanCardClick', x)));
      this.subscriptions.add(kanban.onKanbanBatchSave.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanBatchSave', x)));
      this.subscriptions.add(kanban.onKanbanBatchCancel.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanBatchCancel', x)));
      this.subscriptions.add(kanban.onKanbanConfigApplied.subscribe((x) => console.debug('[CitiesKanbanPage] onKanbanConfigApplied', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
