import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CarouselListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-uploadsample-carousel-page',
  imports: [CommonModule, DataSourceComponent, CarouselListComponent],
  templateUrl: './uploadsample-carousel-page.component.html',
  styleUrls: ['./uploadsample-carousel-page.component.css']
})
export class UploadsampleCarouselPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(CarouselListComponent) carousel?: CarouselListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const carousel = this.carousel;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[UploadsampleCarouselPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[UploadsampleCarouselPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[UploadsampleCarouselPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[UploadsampleCarouselPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[UploadsampleCarouselPage] afterSync$', x)));
    }

    if (carousel) {
      this.subscriptions.add(carousel.onCarouselPage.subscribe((x) => console.debug('[UploadsampleCarouselPage] onCarouselPage', x)));
      this.subscriptions.add(carousel.onCarouselItemClick.subscribe((x) => console.debug('[UploadsampleCarouselPage] onCarouselItemClick', x)));
      this.subscriptions.add(carousel.onCarouselDataBound.subscribe((x) => console.debug('[UploadsampleCarouselPage] onCarouselDataBound', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

