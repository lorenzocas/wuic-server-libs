import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, SchedulerListComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-scheduler-page',
  imports: [CommonModule, DataSourceComponent, SchedulerListComponent],
  templateUrl: './cities-scheduler-page.component.html',
  styleUrls: ['./cities-scheduler-page.component.css']
})
export class CitiesSchedulerPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(SchedulerListComponent) scheduler?: SchedulerListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const scheduler = this.scheduler;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesSchedulerPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesSchedulerPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesSchedulerPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesSchedulerPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesSchedulerPage] afterSync$', x)));
    }

    if (scheduler) {
      this.subscriptions.add(scheduler.onSchedulerDateClick.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerDateClick', x)));
      this.subscriptions.add(scheduler.onSchedulerEventClick.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerEventClick', x)));
      this.subscriptions.add(scheduler.onSchedulerEventDrop.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerEventDrop', x)));
      this.subscriptions.add(scheduler.onSchedulerEventResize.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerEventResize', x)));
      this.subscriptions.add(scheduler.onSchedulerDatesSet.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerDatesSet', x)));
      this.subscriptions.add(scheduler.onSchedulerDataBound.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerDataBound', x)));
      this.subscriptions.add(scheduler.onSchedulerEventSync.subscribe((x) => console.debug('[CitiesSchedulerPage] onSchedulerEventSync', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
