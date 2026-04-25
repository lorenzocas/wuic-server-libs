import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, LazySpreadsheetListSfComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5d.
 *
 * Monta `<wuic-spreadsheet-list-sf-lazy>` + `<wuic-data-source>` con
 * `hardcodedRoute="cities"`. Archetype spreadsheet (inline editing a griglia,
 * tipo Excel). Usa il wrapper lazy: il componente Syncfusion vero e' caricato
 * via dynamic import al primo mount → impedisce che le ~16 MB raw di Syncfusion
 * (charts + grids + dropdowns + ...) finiscano nel main initial chunk del
 * bundle prod. Il chunk lazy `chunk-XXXX.js` (Syncfusion) viene scaricato
 * solo quando l'utente naviga a questa pagina.
 *
 * @ViewChild: il wrapper lazy (`LazySpreadsheetListSfComponent`) NON espone
 * gli output del componente interno (`onSpreadsheetDataBound`,
 * `onSpreadsheetPageChange`, ecc.). Per accedere agli output, l'host dovrebbe
 * usare il deep dev path `wuic-framework-lib-src/.../spreadsheet-list-sf.component`
 * (non disponibile nel package npm) o estendere il wrapper per re-emettere
 * gli eventi del child via `(eventName)` template binding. Per ora le sub a
 * console.debug sono commentate — non bloccano il caso d'uso showcase.
 */
@Component({
  selector: 'app-5d-cities-spreadsheet',
  imports: [CommonModule, DataSourceComponent, LazySpreadsheetListSfComponent],
  templateUrl: './5d-cities-spreadsheet.component.html',
  styleUrls: ['./5d-cities-spreadsheet.component.css']
})
export class Pattern5dCitiesSpreadsheetComponent implements AfterViewInit, OnDestroy {
  @ViewChild(DataSourceComponent) datasource?: DataSourceComponent;
  @ViewChild(LazySpreadsheetListSfComponent) spreadsheet?: LazySpreadsheetListSfComponent;

  private readonly subscriptions = new Subscription();

  ngAfterViewInit(): void {
    const ds = this.datasource;
    // const spreadsheet = this.spreadsheet; // accesso al wrapper lazy, non al componente interno

    if (ds) {
      this.subscriptions.add(ds.datasourceReady$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] datasourceReady$', x)));
      this.subscriptions.add(ds.fetchInfo$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] fetchInfo$', x)));
      this.subscriptions.add(ds.afterFirstLoad$.subscribe((x) => console.debug('[CitiesSpreadsheetPage] afterFirstLoad$', x)));
      this.subscriptions.add(ds.beforeSync$.subscribe((x: DataSourceBeforeSyncEvent) => console.debug('[CitiesSpreadsheetPage] beforeSync$', x)));
      this.subscriptions.add(ds.afterSync$.subscribe((x: DataSourceAfterSyncEvent) => console.debug('[CitiesSpreadsheetPage] afterSync$', x)));
    }

    // TODO: ri-abilitare gli event handler dello spreadsheet quando il
    // wrapper `LazySpreadsheetListSfComponent` esporra' Output relay (es.
    // `(onSpreadsheetDataBound)="..."` ri-emessi via @Output del wrapper).
    // Originali (riferimento):
    //   spreadsheet.onSpreadsheetDataBound.subscribe(...)
    //   spreadsheet.onSpreadsheetBeforePageChange.subscribe(...)
    //   spreadsheet.onSpreadsheetPageChange.subscribe(...)
    //   spreadsheet.onSpreadsheetRowInserted.subscribe(...)
    //   spreadsheet.onSpreadsheetRowsDeleted.subscribe(...)
    //   spreadsheet.onSpreadsheetBatchSaved.subscribe(...)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}
