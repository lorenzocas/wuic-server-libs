import { AfterViewInit, Component, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { DataSourceComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

interface KpiState {
  totalCities: number;
  totalPopulation: number;
  avgPopulation: number;
  topByPopulation: Array<{ name: string; state: string; population: number }>;
  byState: Array<{ state: string; count: number }>;
}

/**
 * Pattern 2 — Framework data + Custom component / esempio 2b.
 *
 * Stesso wuic-data-source di 2a sull'entity `cities`, ma il rendering e' un
 * dashboard KPI: aggregazioni client-side (count, sum, avg, top-N, group-by)
 * mostrate in p-card con badge e mini-tabella. Sottolinea che, una volta
 * ottenuto `fetchInfo$`, lo sviluppatore puo' costruire UX completamente
 * diverse senza toccare il backend.
 */
@Component({
  selector: 'app-2b-cities-kpi-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, TagModule, DataSourceComponent],
  templateUrl: './2b-cities-kpi-dashboard.component.html',
  styleUrl: './2b-cities-kpi-dashboard.component.scss'
})
export class Pattern2bCitiesKpiDashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ds') ds!: DataSourceComponent;

  private rows = signal<any[]>([]);
  loading = signal(true);

  /**
   * Computed signal: ricalcolato automaticamente ogni volta che `rows()` cambia
   * (es. quando il datasource fa un nuovo fetch). Le aggregazioni sono fatte
   * lato client per semplicita' demo; per dataset > 10k useresti server-side
   * GROUP BY o uno stored proc dedicato.
   */
  kpi = computed<KpiState>(() => {
    const data = this.rows();
    const total = data.length;
    const populations = data
      .map(r => Number(r.latestrecordedpopulation || r.LatestRecordedPopulation || 0))
      .filter(p => p > 0);

    const totalPopulation = populations.reduce((a, b) => a + b, 0);
    const avgPopulation = populations.length ? Math.round(totalPopulation / populations.length) : 0;

    const topByPopulation = [...data]
      .map(r => ({
        name: r.cityname || r.CityName,
        state: r.stateprovincename || r.StateProvinceName,
        population: Number(r.latestrecordedpopulation || r.LatestRecordedPopulation || 0)
      }))
      .sort((a, b) => b.population - a.population)
      .slice(0, 5);

    const byStateMap = new Map<string, number>();
    for (const r of data) {
      const state = r.stateprovincename || r.StateProvinceName || '—';
      byStateMap.set(state, (byStateMap.get(state) || 0) + 1);
    }
    const byState = Array.from(byStateMap.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return { totalCities: total, totalPopulation, avgPopulation, topByPopulation, byState };
  });

  private sub?: Subscription;

  ngAfterViewInit(): void {
    this.sub = this.ds.fetchInfo$.subscribe(info => {
      this.rows.set(info?.resultInfo?.dato || []);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
