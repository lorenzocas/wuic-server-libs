import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';

import { BehaviorSubject, Subscription } from 'rxjs';
import { DataSourceComponent } from '../data-source/data-source.component';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'wuic-pager',
  imports: [ButtonModule, FormsModule],
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.css'
})
export class PagerComponent implements OnInit, OnChanges, OnDestroy {
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per page size; usata nella configurazione e nel rendering del componente.
   */
  @Input() pageSize: number = 10;
  /**
   * Input dal componente padre per current page; usata nella configurazione e nel rendering del componente.
   */
  @Input() currentPage: number = 1;

  /**
   * Input dal componente padre per forced page size; usata nella configurazione e nel rendering del componente.
   */
  @Input() forcedPageSize: number;
  /**
   * Evento emesso quando il pager riallinea il proprio stato dal datasource.
   */
  @Output() onPagerDataBound = new EventEmitter<{ currentPage: number; pageSize: number; totalPages: number; totalRecords: number; cursorMode: boolean }>();
  /**
   * Evento emesso al cambio pagina completato (page mode o cursor mode).
   */
  @Output() onPagerPageChange = new EventEmitter<{ currentPage: number; pageSize: number; totalPages: number; cursorMode: boolean; direction?: 'next' | 'prev' | 'first' | 'last' | 'goto' }>();
  /**
   * Evento emesso quando cambia il page size.
   */
  @Output() onPagerPageSizeChange = new EventEmitter<{ pageSize: number; currentPage: number }>();
  /**
   * Evento emesso quando il pager entra/esce da stato busy.
   */
  @Output() onPagerBusyChange = new EventEmitter<boolean>();

  /**
   * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
   */
  totalRecords: number = 0;
  /**
   * Proprieta di stato del componente per total pages, usata dalla logica interna e dal template.
   */
  totalPages: number = 1;
  /**
   * Flag runtime che indica l'uso di paging cursor-based.
   */
  cursorMode: boolean = false;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a busy.
   */
  busy: boolean = false;

  /**
   * Proprieta di stato del componente per datasource subscription, usata dalla logica interna e dal template.
   */
  private datasourceSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per bound datasource, usata dalla logica interna e dal template.
   */
  private boundDatasource?: DataSourceComponent;
  /**
   * Proprieta di stato del componente per syncing from datasource, usata dalla logica interna e dal template.
   */
  private syncingFromDatasource = false;
  /**
   * Proprieta di stato del componente per preferred paging applied, usata dalla logica interna e dal template.
   */
  private preferredPagingApplied = false;
  /**
   * Proprieta di stato del componente per applying preferred paging, usata dalla logica interna e dal template.
   */
  private applyingPreferredPaging = false;

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.bindToDatasource();
  }

      /**
   * Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
   * @param changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datasource'] || changes['hardcodedDatasource']) {
      this.bindToDatasource();
      return;
    }

    if ((changes['pageSize'] || changes['currentPage']) && !this.syncingFromDatasource) {
      void this.applyExternalPagingInputs();
    }
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.datasourceSubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
  }

      /**
   * Gestisce la logica operativa di `prevPage` orchestrando le chiamate `goToPage`.
   */
  async prevPage(): Promise<void> {
    if (this.cursorMode) {
      await this.applyCursorPaging('prev');
      return;
    }

    if (this.currentPage <= 1) {
      return;
    }

    await this.goToPage(this.currentPage - 1);
  }

      /**
   * Gestisce la logica operativa di `nextPage` orchestrando le chiamate `goToPage`.
   */
  async nextPage(): Promise<void> {
    if (this.cursorMode) {
      await this.applyCursorPaging('next');
      return;
    }

    if (this.currentPage >= this.totalPages) {
      return;
    }

    await this.goToPage(this.currentPage + 1);
  }

      /**
   * Gestisce la logica operativa di `firstPage` orchestrando le chiamate `goToPage`.
   */
  async firstPage(): Promise<void> {
    if (this.cursorMode) {
      return;
    }

    await this.goToPage(1);
  }

      /**
   * Gestisce la logica operativa di `lastPage` orchestrando le chiamate `goToPage`.
   */
  async lastPage(): Promise<void> {
    if (this.cursorMode) {
      return;
    }

    await this.goToPage(this.totalPages);
  }

      /**
   * Applica aggiornamenti di stato tramite `applyPageSize` orchestrando le chiamate `normalizeInt` e `getCurrentDatasource`.
   */
  async applyPageSize(): Promise<void> {
    const nextSize = this.normalizeInt(this.pageSize, this.getCurrentDatasource()?.pageSize || 10);
    await this.applyPaging(1, nextSize);
  }

      /**
   * Applica aggiornamenti di stato tramite `applyCurrentPage` orchestrando le chiamate `normalizeInt` e `getCurrentDatasource`.
   */
  async applyCurrentPage(): Promise<void> {
    if (this.cursorMode) {
      return;
    }

    const nextPage = this.normalizeInt(this.currentPage, this.getCurrentDatasource()?.currentPage || 1);
    await this.goToPage(nextPage);
  }

            /**
   * Gestisce la logica operativa di `goToPage` in modo coerente con l'implementazione corrente.
   * @param page Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private async goToPage(page: number): Promise<void> {
    const ds = this.getCurrentDatasource();
    if (!ds) {
      return;
    }

    const nextPage = Math.max(1, this.normalizeInt(page, ds.currentPage || 1));
    const nextSize = Math.max(1, this.normalizeInt(this.pageSize || ds.pageSize || 10, ds.pageSize || 10));
    await this.applyPaging(nextPage, nextSize);
  }

      /**
   * Applica aggiornamenti di stato tramite `applyExternalPagingInputs` orchestrando le chiamate `getCurrentDatasource` e `max`.
   */
  private async applyExternalPagingInputs(): Promise<void> {
    const ds = this.getCurrentDatasource();
    if (!ds || this.busy) {
      return;
    }

    if (this.cursorMode) {
      return;
    }

    const nextSize = Math.max(1, this.normalizeInt(this.pageSize, ds.pageSize || 10));
    const nextPage = Math.max(1, this.normalizeInt(this.currentPage, ds.currentPage || 1));

    if (nextSize === Number(ds.pageSize || 0) && nextPage === Number(ds.currentPage || 0)) {
      return;
    }

    await this.applyPaging(nextPage, nextSize);
  }

      /**
   * Gestisce la logica operativa di `bindToDatasource` gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
   */
  private bindToDatasource(): void {
    this.datasourceSubscription?.unsubscribe();
    this.datasourceSubscription = undefined;

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject(this.hardcodedDatasource);
      this.subscribeToDatasource();
      return;
    }

    if (this.datasource?.value) {
      this.subscribeToDatasource();
      return;
    }

    this.datasourceSubscription = this.datasource?.subscribe((ds) => {
      if (ds) {
        this.subscribeToDatasource();
      }
    });
  }

      /**
   * Gestisce la logica operativa di `subscribeToDatasource` gestendo subscription RxJS in modo esplicito, propagando aggiornamenti sui flussi reattivi usati dalla UI.
   */
  private subscribeToDatasource(): void {
    if (!this.datasource?.value) {
      return;
    }

    if (!this.datasource.value.fetchInfo$ && this.datasource.value['value']?.fetchInfo$) {
      this.datasource.next(this.datasource.value['value']);
    }

    const currentDs = this.datasource.value;
    if (!currentDs?.fetchInfo$ || this.boundDatasource === currentDs) {
      return;
    }

    this.boundDatasource = currentDs;
    this.preferredPagingApplied = false;
    this.syncFromDatasource();
    this.recomputeTotals(currentDs.resultInfo);
    void this.applyPreferredPagingFromInputs();

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = currentDs.fetchInfo$.subscribe((info) => {
      if (!info) {
        return;
      }

      this.syncFromDatasource();
      this.recomputeTotals(info.resultInfo);
      void this.applyPreferredPagingFromInputs();
    });
  }

      /**
   * Applica aggiornamenti di stato tramite `applyPreferredPagingFromInputs` orchestrando le chiamate `getCurrentDatasource` e `max`.
   */
  private async applyPreferredPagingFromInputs(): Promise<void> {
    if (this.preferredPagingApplied || this.applyingPreferredPaging || this.busy) {
      return;
    }

    const ds = this.getCurrentDatasource();
    if (!ds) {
      return;
    }

    const preferredSize = Math.max(1, this.normalizeInt(this.pageSize, ds.pageSize || 10));
    const preferredPage = Math.max(1, this.normalizeInt(this.currentPage, ds.currentPage || 1));
    if (preferredSize === Number(ds.pageSize || 0) && preferredPage === Number(ds.currentPage || 0)) {
      this.preferredPagingApplied = true;
      return;
    }

    this.applyingPreferredPaging = true;
    this.preferredPagingApplied = true;
    try {
      await this.applyPaging(preferredPage, preferredSize);
    } finally {
      this.applyingPreferredPaging = false;
    }
  }

    /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale orchestrando le chiamate `getCurrentDatasource` e `max`.
   */
  private syncFromDatasource(): void {
    const ds = this.getCurrentDatasource();
    if (!ds) {
      return;
    }

    this.syncingFromDatasource = true;

    if (!this.forcedPageSize) {
      this.pageSize = Math.max(1, this.normalizeInt(ds.pageSize, this.pageSize || 10));
    } else {
      this.pageSize = this.forcedPageSize;
    }
    this.currentPage = Math.max(1, this.normalizeInt(ds.currentPage, this.currentPage || 1));
    this.cursorMode = !!ds.cursorMode;
    this.onPagerDataBound.emit({
      currentPage: this.currentPage,
      pageSize: this.pageSize,
      totalPages: this.totalPages,
      totalRecords: this.totalRecords,
      cursorMode: this.cursorMode
    });
    this.syncingFromDatasource = false;
  }

            /**
   * Gestisce la logica operativa di `recomputeTotals` in modo coerente con l'implementazione corrente.
   * @param resultInfo Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private recomputeTotals(resultInfo?: { totalRowCount?: number; totalGroups?: number; }): void {
    const ds = this.getCurrentDatasource();
    this.cursorMode = !!ds?.cursorMode;

    if (this.cursorMode) {
      this.totalRecords = -1;
      this.totalPages = Math.max(1, this.currentPage || 1);
      return;
    }

    const groupCount = Array.isArray(ds?.groupInfo) ? ds.groupInfo.length : 0;
    const total = groupCount > 0 ? Number(resultInfo?.totalGroups || 0) : Number(resultInfo?.totalRowCount || 0);
    this.totalRecords = Math.max(0, Number.isFinite(total) ? total : 0);
    this.totalPages = Math.max(1, Math.ceil(this.totalRecords / Math.max(1, this.pageSize || 1)));

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

            /**
   * Applica aggiornamenti di stato tramite `applyPaging` mantenendo coerenti UI e dati.
   * @param nextPage Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param nextSize Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private async applyPaging(nextPage: number, nextSize: number): Promise<void> {
    const ds = this.getCurrentDatasource();
    if (!ds || this.busy) {
      return;
    }

    const prevPage = this.currentPage;
    const prevSize = this.pageSize;
    this.busy = true;
    this.onPagerBusyChange.emit(true);
    try {
      ds.pageSize = Math.max(1, this.normalizeInt(nextSize, ds.pageSize || 10));
      ds.currentPage = Math.max(1, this.normalizeInt(nextPage, ds.currentPage || 1));

      this.syncFromDatasource();
      await ds.fetchData();
      this.setCurrentToFirstRow(ds);
      this.recomputeTotals(ds.resultInfo);
      if (prevSize !== this.pageSize) {
        this.onPagerPageSizeChange.emit({
          pageSize: this.pageSize,
          currentPage: this.currentPage
        });
      }
      if (prevPage !== this.currentPage || prevSize !== this.pageSize) {
        this.onPagerPageChange.emit({
          currentPage: this.currentPage,
          pageSize: this.pageSize,
          totalPages: this.totalPages,
          cursorMode: this.cursorMode,
          direction: 'goto'
        });
      }
    } finally {
      this.busy = false;
      this.onPagerBusyChange.emit(false);
    }
  }

  /**
   * Applica la navigazione cursor-based usando i token restituiti dall'ultima risposta.
   */
  private async applyCursorPaging(direction: 'next' | 'prev'): Promise<void> {
    const ds = this.getCurrentDatasource();
    if (!ds || this.busy) {
      return;
    }

    const token = direction === 'next' ? ds.nextPageCursor : ds.prevPageCursor;
    if (!token) {
      return;
    }

    this.busy = true;
    this.onPagerBusyChange.emit(true);
    try {
      ds.pageDirection = direction;
      ds.pageCursor = token;

      if (direction === 'next') {
        ds.currentPage = Math.max(1, this.normalizeInt(ds.currentPage, 1) + 1);
      } else {
        ds.currentPage = Math.max(1, this.normalizeInt(ds.currentPage, 1) - 1);
      }

      this.syncFromDatasource();
      await ds.fetchData();
      this.setCurrentToFirstRow(ds);
      this.recomputeTotals(ds.resultInfo);
      this.onPagerPageChange.emit({
        currentPage: this.currentPage,
        pageSize: this.pageSize,
        totalPages: this.totalPages,
        cursorMode: this.cursorMode,
        direction
      });
    } finally {
      this.busy = false;
      this.onPagerBusyChange.emit(false);
    }
  }

            /**
   * Applica aggiornamenti di stato tramite `setCurrentToFirstRow` mantenendo coerenti UI e dati.
   * @param ds Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private setCurrentToFirstRow(ds: DataSourceComponent): void {
    const first = ds?.resultInfo?.dato?.[0];
    if (first) {
      ds.setCurrent(first);
    }
  }

            /**
   * Recupera informazioni tramite `getCurrentDatasource` con il flusso specifico definito dalla sua implementazione.
   * @returns Valore di tipo `DataSourceComponent | null` costruito o risolto dal metodo.
   */
  private getCurrentDatasource(): DataSourceComponent | null {
    return this.datasource?.value || null;
  }

            /**
   * Gestisce la logica operativa di `normalizeInt` in modo coerente con l'implementazione corrente.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @param fallback Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore numerico prodotto da `normalizeInt` (indice, conteggio o misura operativa).
   */
  private normalizeInt(value: any, fallback: number): number {
    const parsed = Math.trunc(Number(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : Math.max(1, Math.trunc(Number(fallback) || 1));
  }
}



