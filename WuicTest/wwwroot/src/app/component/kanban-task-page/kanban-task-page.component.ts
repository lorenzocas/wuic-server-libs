import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, KanbanListComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-kanban-task-page',
  imports: [CommonModule, DataSourceComponent, KanbanListComponent],
  templateUrl: './kanban-task-page.component.html',
  styleUrls: ['./kanban-task-page.component.css']
})
export class KanbanTaskPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(KanbanListComponent) kanban?: KanbanListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const kanban = this.kanban;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[KanbanTaskPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[KanbanTaskPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[KanbanTaskPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[KanbanTaskPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[KanbanTaskPage] afterSync$', x)));
    }

    if (kanban) {
      this.subscriptions.add(kanban.onKanbanDataBound.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanDataBound', x)));
      this.subscriptions.add(kanban.onKanbanCardDrop.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanCardDrop', x)));
      this.subscriptions.add(kanban.onKanbanCardClick.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanCardClick', x)));
      this.subscriptions.add(kanban.onKanbanBatchSave.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanBatchSave', x)));
      this.subscriptions.add(kanban.onKanbanBatchCancel.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanBatchCancel', x)));
      this.subscriptions.add(kanban.onKanbanConfigApplied.subscribe((x) => console.debug('[KanbanTaskPage] onKanbanConfigApplied', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
