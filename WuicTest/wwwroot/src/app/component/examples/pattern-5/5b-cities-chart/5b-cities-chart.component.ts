import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5b.
 *
 * Monta `<wuic-chart-list>` + `<wuic-data-source>` con `hardcodedRoute="cities"`.
 * Dimostra la sottoscrizione agli eventi del datasource
 * (datasourceReady$, fetchInfo$, afterFirstLoad$, beforeSync$, afterSync$)
 * oltre agli eventi chart-specific.
 */
@Component({
  selector: 'app-5b-cities-chart',
  imports: [CommonModule, DataSourceComponent, ChartListComponent],
  templateUrl: './5b-cities-chart.component.html',
  styleUrls: ['./5b-cities-chart.component.css']
})
export class Pattern5bCitiesChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(ChartListComponent) chart?: ChartListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const chart = this.chart;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesChartPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesChartPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesChartPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesChartPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesChartPage] afterSync$', x)));
    }

    if (chart) {
      this.subscriptions.add(chart.onChartDataSelect.subscribe((x) => console.debug('[CitiesChartPage] onChartDataSelect', x)));
      this.subscriptions.add(chart.onChartDrillDown.subscribe((x) => console.debug('[CitiesChartPage] onChartDrillDown', x)));
      this.subscriptions.add(chart.onChartDataBound.subscribe((x) => console.debug('[CitiesChartPage] onChartDataBound', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

