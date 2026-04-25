import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, LazySchedulerListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5j.
 *
 * Monta `<wuic-scheduler-list-lazy>` + `<wuic-data-source>` su route schedules.
 * Usa il wrapper lazy: il componente Scheduler vero (con FullCalendar core +
 * plugin dayGrid/timeGrid/interaction + preact ~490 KB raw) e' caricato via
 * dynamic import al primo mount → impedisce che FullCalendar finisca nel
 * main initial chunk.
 *
 * @ViewChild: il wrapper lazy NON espone gli output del componente interno
 * (`onSchedulerDateClick`, `onSchedulerEventClick`, ecc.). Le sub a
 * console.debug dello scheduler sono commentate — non bloccano lo showcase.
 */
@Component({
  selector: 'app-5j-schedules-scheduler',
  imports: [CommonModule, DataSourceComponent, LazySchedulerListComponent],
  templateUrl: './5j-schedules-scheduler.component.html',
  styleUrls: ['./5j-schedules-scheduler.component.css']
})
export class Pattern5jSchedulesSchedulerComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(LazySchedulerListComponent) scheduler?: LazySchedulerListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[SchedulesSchedulerPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[SchedulesSchedulerPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[SchedulesSchedulerPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[SchedulesSchedulerPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[SchedulesSchedulerPage] afterSync$', x)));
    }

    // TODO: ri-abilitare gli event handler dello scheduler quando il wrapper
    // `LazySchedulerListComponent` esporra' Output relay verso il child.
    // Originali:
    //   scheduler.onSchedulerDateClick.subscribe(...)
    //   scheduler.onSchedulerEventClick.subscribe(...)
    //   scheduler.onSchedulerEventDrop.subscribe(...)
    //   scheduler.onSchedulerEventResize.subscribe(...)
    //   scheduler.onSchedulerDatesSet.subscribe(...)
    //   scheduler.onSchedulerDataBound.subscribe(...)
    //   scheduler.onSchedulerEventSync.subscribe(...)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
