import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, SpreadsheetListComponent, SpreadsheetListSfComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5d.
 *
 * Monta `<wuic-spreadsheet-list>` + `<wuic-data-source>` con
 * `hardcodedRoute="cities"`. Archetype spreadsheet (inline editing a griglia,
 * tipo Excel). Utile quando serve bulk-edit senza dover passare per l'edit
 * dialog per ogni record.
 */
@Component({
  selector: 'app-5d-cities-spreadsheet',
  imports: [CommonModule, DataSourceComponent, SpreadsheetListSfComponent],
  templateUrl: './5d-cities-spreadsheet.component.html',
  styleUrls: ['./5d-cities-spreadsheet.component.css']
})
export class Pattern5dCitiesSpreadsheetComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(SpreadsheetListComponent) spreadsheet?: SpreadsheetListComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    const spreadsheet = this.spreadsheet;

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesSpreadsheetPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesSpreadsheetPage] afterSync$', x)));
    }

    if (spreadsheet) {
      this.subscriptions.add(spreadsheet.onSpreadsheetDataBound.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetDataBound', x)));
      this.subscriptions.add(spreadsheet.onSpreadsheetBeforePageChange.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetBeforePageChange', x)));
      this.subscriptions.add(spreadsheet.onSpreadsheetPageChange.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetPageChange', x)));
      this.subscriptions.add(spreadsheet.onSpreadsheetRowInserted.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetRowInserted', x)));
      this.subscriptions.add(spreadsheet.onSpreadsheetRowsDeleted.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetRowsDeleted', x)));
      this.subscriptions.add(spreadsheet.onSpreadsheetBatchSaved.subscribe((x) => console.debug('[CitiesSpreadsheetPage] onSpreadsheetBatchSaved', x)));
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

