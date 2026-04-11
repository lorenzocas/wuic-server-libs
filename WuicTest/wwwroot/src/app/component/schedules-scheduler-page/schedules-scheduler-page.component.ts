import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, SchedulerListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-schedules-scheduler-page',
  imports: [CommonModule, DataSourceComponent, SchedulerListComponent],
  templateUrl: './schedules-scheduler-page.component.html',
  styleUrls: ['./schedules-scheduler-page.component.css']
})
export class SchedulesSchedulerPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(SchedulerListComponent) scheduler?: SchedulerListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const scheduler = this.scheduler;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[SchedulesSchedulerPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[SchedulesSchedulerPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[SchedulesSchedulerPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[SchedulesSchedulerPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[SchedulesSchedulerPage] afterSync$', x)));
    }

    if (scheduler) {
      this.subscriptions.add(scheduler.onSchedulerDateClick.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerDateClick', x)));
      this.subscriptions.add(scheduler.onSchedulerEventClick.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerEventClick', x)));
      this.subscriptions.add(scheduler.onSchedulerEventDrop.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerEventDrop', x)));
      this.subscriptions.add(scheduler.onSchedulerEventResize.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerEventResize', x)));
      this.subscriptions.add(scheduler.onSchedulerDatesSet.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerDatesSet', x)));
      this.subscriptions.add(scheduler.onSchedulerDataBound.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerDataBound', x)));
      this.subscriptions.add(scheduler.onSchedulerEventSync.subscribe((x) => console.debug('[SchedulesSchedulerPage] onSchedulerEventSync', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

