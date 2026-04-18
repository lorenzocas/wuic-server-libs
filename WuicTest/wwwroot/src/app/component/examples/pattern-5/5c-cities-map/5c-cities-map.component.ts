import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, MapListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5c.
 *
 * Monta `<wuic-map-list>` + `<wuic-data-source>` con `hardcodedRoute="cities"`.
 * Ogni Cities row viene plottata sulla mappa via lat/long — riferimento per
 * l'archetype map dei metadati.
 */
@Component({
  selector: 'app-5c-cities-map',
  imports: [CommonModule, DataSourceComponent, MapListComponent],
  templateUrl: './5c-cities-map.component.html',
  styleUrls: ['./5c-cities-map.component.css']
})
export class Pattern5cCitiesMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(MapListComponent) mapList?: MapListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const mapList = this.mapList;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesMapPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesMapPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesMapPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesMapPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesMapPage] afterSync$', x)));
    }

    if (mapList) {
      this.subscriptions.add(mapList.onMapClick.subscribe((x) => console.debug('[CitiesMapPage] onMapClick', x)));
      this.subscriptions.add(mapList.onMarkerClick.subscribe((x) => console.debug('[CitiesMapPage] onMarkerClick', x)));
      this.subscriptions.add(mapList.onMarkerDragStart.subscribe((x) => console.debug('[CitiesMapPage] onMarkerDragStart', x)));
      this.subscriptions.add(mapList.onMarkerDragEnd.subscribe((x) => console.debug('[CitiesMapPage] onMarkerDragEnd', x)));
      this.subscriptions.add(mapList.onPolygonClick.subscribe((x) => console.debug('[CitiesMapPage] onPolygonClick', x)));
      this.subscriptions.add(mapList.onPolygonShapeChangedEvent.subscribe((x) => console.debug('[CitiesMapPage] onPolygonShapeChangedEvent', x)));
      this.subscriptions.add(mapList.onMapDataBound.subscribe((x) => console.debug('[CitiesMapPage] onMapDataBound', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

