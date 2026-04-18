import { AfterViewInit, Component, OnDestroy, ViewChild, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { DataSourceComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 2 — Framework data + Custom component / esempio 2a.
 *
 * Usa <wuic-data-source> per ottenere i dati `cities` dal backend WUIC
 * (route metadata, filtri, paging, CRUD inclusi), ma sostituisce la list-grid
 * standard con una grid di p-card responsive. La sottoscrizione a `fetchInfo$`
 * e' il punto di contatto: ogni volta che il datasource fa fetch (init, filtro,
 * paging, refresh post-CRUD) il signal `rows()` viene aggiornato e l'UI
 * ri-renderizza automaticamente.
 */
@Component({
  selector: 'app-2a-cities-cards',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, InputTextModule, ButtonModule, DataSourceComponent],
  templateUrl: './2a-cities-cards.component.html',
  styleUrl: './2a-cities-cards.component.scss'
})
export class Pattern2aCitiesCardsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('ds') ds!: DataSourceComponent;

  rows = signal<any[]>([]);
  search = signal('');
  loading = signal(true);

  private sub?: Subscription;

  ngAfterViewInit(): void {
    // Subscribe ai dati pubblicati da DataSourceComponent. La prima emissione
    // arriva all'autoload (vedi flag [autoload]="true" nel template).
    this.sub = this.ds.fetchInfo$.subscribe(info => {
      const data = info?.resultInfo?.dato || [];
      this.rows.set(data);
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /**
   * Filtro client-side semplice per dimostrare che, una volta avuti i dati
   * dal datasource, il componente custom puo' fare quello che vuole.
   * Per dataset grandi useresti il filtro server-side via `ds.applyFilter(...)`.
   */
  filteredRows() {
    const q = this.search().toLowerCase().trim();
    if (!q) return this.rows();
    return this.rows().filter(r =>
      String(r.cityname || r.CityName || '').toLowerCase().includes(q) ||
      String(r.stateprovincename || r.StateProvinceName || '').toLowerCase().includes(q)
    );
  }

  refresh() {
    this.loading.set(true);
    this.ds.fetchData();
  }
}
