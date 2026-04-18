import { AfterViewInit, Component, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataSourceComponent, ListGridAfterRenderEvent, ListGridAfterRowRenderEvent, ListGridBeforeRowRenderEvent, ListGridComponent } from 'wuic-framework-lib-dev';
import { Subscription } from 'rxjs';

/**
 * Pattern 5 — Framework component + Framework data (manual mount) / esempio 5a.
 *
 * Monta manualmente `<wuic-list-grid>` + `<wuic-data-source>` con
 * `hardcodedRoute="cities"` (metadata WUIC route `cities`). Dimostra la
 * sottoscrizione a tutti gli @Output eventi emessi dalla list-grid
 * (onAfterRender, onBeforeRowRender, onAfterRowRender, onPaging, onSorting,
 * onFiltering, onPTableSelectionChange, onPTableRowExpand/Collapse,
 * onPTableColumnResize/Reorder) — utile come riferimento quando serve
 * intercettare eventi UI per logica custom host-side.
 */
@Component({
  selector: 'app-5a-cities-list-grid',
  imports: [CommonModule, DataSourceComponent, ListGridComponent],
  templateUrl: './5a-cities-list-grid.component.html',
  styleUrls: ['./5a-cities-list-grid.component.css']
})
export class Pattern5aCitiesListGridComponent implements AfterViewInit, OnDestroy {
  @ViewChild(ListGridComponent) listGrid?: ListGridComponent;

  private readonly listGridSubscriptions = new Subscription();

  ngAfterViewInit(): void {
    const grid = this.listGrid;
    if (!grid) {
      return;
    }

    this.listGridSubscriptions.add(
      grid.onAfterRender.subscribe((event: ListGridAfterRenderEvent) => this.handleAfterRender(event))
    );

    this.listGridSubscriptions.add(
      grid.onBeforeRowRender.subscribe((event: ListGridBeforeRowRenderEvent) => this.handleBeforeRowRender(event))
    );

    this.listGridSubscriptions.add(
      grid.onAfterRowRender.subscribe((event: ListGridAfterRowRenderEvent) => this.handleAfterRowRender(event))
    );

    this.listGridSubscriptions.add(
      grid.onPaging.subscribe((event: any) => this.handlePaging(event))
    );

    this.listGridSubscriptions.add(
      grid.onSorting.subscribe((event: any) => this.handleSorting(event))
    );

    this.listGridSubscriptions.add(
      grid.onFiltering.subscribe((event: any) => this.handleFiltering(event))
    );

    this.listGridSubscriptions.add(
      grid.onPTableSelectionChange.subscribe((selection: any[]) => this.handleSelectionChange(selection))
    );

    this.listGridSubscriptions.add(
      grid.onPTableRowExpand.subscribe((event: any) => this.handleRowExpand(event))
    );

    this.listGridSubscriptions.add(
      grid.onPTableRowCollapse.subscribe((event: any) => this.handleRowCollapse(event))
    );

    this.listGridSubscriptions.add(
      grid.onPTableColumnResize.subscribe((event: any) => this.handleColumnResize(event))
    );

    this.listGridSubscriptions.add(
      grid.onPTableColumnReorder.subscribe((event: any) => this.handleColumnReorder(event))
    );
  }

  ngOnDestroy(): void {
    this.listGridSubscriptions.unsubscribe();
  }

  private handleAfterRender(event: ListGridAfterRenderEvent): void {
    console.debug('[CitiesListGridPage] afterRender', event);
  }

  private handleBeforeRowRender(event: ListGridBeforeRowRenderEvent): void {
    // Esempio: blocca rendering riga per regole host.
    // if (event.row?.deleted === true) {
    //   event.cancelRender();
    // }
    console.debug('[CitiesListGridPage] beforeRowRender', event.rowIndex, event.row);
  }

  private handleAfterRowRender(event: ListGridAfterRowRenderEvent): void {
    console.debug('[CitiesListGridPage] afterRowRender', event.rowIndex, event.row);
  }

  private handlePaging(event: any): void {
    console.debug('[CitiesListGridPage] onPaging', event);
  }

  private handleSorting(event: any): void {
    console.debug('[CitiesListGridPage] onSorting', event);
  }

  private handleFiltering(event: any): void {
    console.debug('[CitiesListGridPage] onFiltering', event);
  }

  private handleSelectionChange(selection: any[]): void {
    console.debug('[CitiesListGridPage] onPTableSelectionChange', selection);
  }

  private handleRowExpand(event: any): void {
    console.debug('[CitiesListGridPage] onPTableRowExpand', event);
  }

  private handleRowCollapse(event: any): void {
    console.debug('[CitiesListGridPage] onPTableRowCollapse', event);
  }

  private handleColumnResize(event: any): void {
    console.debug('[CitiesListGridPage] onPTableColumnResize', event);
  }

  private handleColumnReorder(event: any): void {
    console.debug('[CitiesListGridPage] onPTableColumnReorder', event);
  }
}

