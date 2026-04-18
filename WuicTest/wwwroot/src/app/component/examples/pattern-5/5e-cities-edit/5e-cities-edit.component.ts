import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, ParametricDialogComponent } from 'wuic-framework-lib-dev';
import { PagerComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5e.
 *
 * Monta `<wuic-parametric-dialog>` + `<wuic-pager>` + `<wuic-data-source>`
 * con `hardcodedRoute="cities"`. Il parametric-dialog renderizza il form
 * edit della riga corrente basato sul `columnMetadata` della route.
 * Esempio di focus sul dettaglio record (not list).
 */
@Component({
  selector: 'app-5e-cities-edit',
  imports: [CommonModule, DataSourceComponent, ParametricDialogComponent, PagerComponent],
  templateUrl: './5e-cities-edit.component.html',
  styleUrls: ['./5e-cities-edit.component.css']
})
export class Pattern5eCitiesEditComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(ParametricDialogComponent) dialog?: ParametricDialogComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const dialog = this.dialog;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesEditPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesEditPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesEditPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesEditPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesEditPage] afterSync$', x)));
    }

    if (dialog) {
      this.subscriptions.add(dialog.onDialogDataBound.subscribe((x) => console.debug('[CitiesEditPage] onDialogDataBound', x)));
      this.subscriptions.add(dialog.onDialogTabChange.subscribe((x) => console.debug('[CitiesEditPage] onDialogTabChange', x)));
      this.subscriptions.add(dialog.onDialogCustomAction.subscribe((x) => console.debug('[CitiesEditPage] onDialogCustomAction', x)));
      this.subscriptions.add(dialog.onDialogSubmit.subscribe((x) => console.debug('[CitiesEditPage] onDialogSubmit', x)));
      this.subscriptions.add(dialog.onDialogRollback.subscribe((x) => console.debug('[CitiesEditPage] onDialogRollback', x)));
      this.subscriptions.add(dialog.onDialogCloseRequested.subscribe((x) => console.debug('[CitiesEditPage] onDialogCloseRequested', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

