import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LazyChartListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5b.
 *
 * Monta `<wuic-chart-list-lazy>` + `<wuic-data-source>` con `hardcodedRoute="cities"`.
 * Usa il wrapper lazy: il componente Chart vero (con FullCalendar + chart.js
 * + preact ~1 MB raw) e' caricato via dynamic import al primo mount → impedisce
 * che quelle dipendenze finiscano nel main initial chunk del bundle prod.
 *
 * @ViewChild: il wrapper lazy NON espone gli output del componente interno
 * (`onChartDataSelect`, `onChartDrillDown`, `onChartDataBound`). Le sub a
 * console.debug del chart sono commentate — non bloccano lo showcase.
 */
@Component({
  selector: 'app-5b-cities-chart',
  imports: [CommonModule, DataSourceComponent, LazyChartListComponent],
  templateUrl: './5b-cities-chart.component.html',
  styleUrls: ['./5b-cities-chart.component.css']
})
export class Pattern5bCitiesChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(LazyChartListComponent) chart?: LazyChartListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesChartPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesChartPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesChartPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesChartPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesChartPage] afterSync$', x)));
    }

    // TODO: ri-abilitare gli event handler del chart quando il wrapper
    // `LazyChartListComponent` esporra' Output relay verso il child.
    // Originali:
    //   chart.onChartDataSelect.subscribe(...)
    //   chart.onChartDrillDown.subscribe(...)
    //   chart.onChartDataBound.subscribe(...)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
