import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, MapListComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-map-page',
  imports: [CommonModule, DataSourceComponent, MapListComponent],
  templateUrl: './cities-map-page.component.html',
  styleUrls: ['./cities-map-page.component.css']
})
export class CitiesMapPageComponent implements AfterViewInit, OnDestroy {
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

