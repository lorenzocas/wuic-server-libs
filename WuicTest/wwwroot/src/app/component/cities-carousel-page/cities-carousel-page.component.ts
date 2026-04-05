import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarouselListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-cities-carousel-page',
  imports: [CommonModule, DataSourceComponent, CarouselListComponent],
  templateUrl: './cities-carousel-page.component.html',
  styleUrls: ['./cities-carousel-page.component.css']
})
export class CitiesCarouselPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(CarouselListComponent) carousel?: CarouselListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const carousel = this.carousel;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesCarouselPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesCarouselPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesCarouselPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesCarouselPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesCarouselPage] afterSync$', x)));
    }

    if (carousel) {
      this.subscriptions.add(carousel.onCarouselPage.subscribe((x) => console.debug('[CitiesCarouselPage] onCarouselPage', x)));
      this.subscriptions.add(carousel.onCarouselItemClick.subscribe((x) => console.debug('[CitiesCarouselPage] onCarouselItemClick', x)));
      this.subscriptions.add(carousel.onCarouselDataBound.subscribe((x) => console.debug('[CitiesCarouselPage] onCarouselDataBound', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
