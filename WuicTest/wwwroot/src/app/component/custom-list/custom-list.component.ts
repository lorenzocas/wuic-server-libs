import { Component, Input, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Title } from '@angular/platform-browser';
import type { DataSourceComponent } from 'wuic-framework-lib-src/component/data-source/data-source.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-custom-list',
  imports: [CommonModule],
  templateUrl: './custom-list.component.html',
  styleUrl: './custom-list.component.css'
})
export class CustomListComponent implements OnDestroy {

  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string = '';

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent> = null as any;

  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent | null = null;

  /**
   * Collezione dati per records, consumata dal rendering e dalle operazioni del componente.
   */
  records: any[] = [];

  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: any;

  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: string = '';

  /**
   * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
   */
  totalRecords: number = 0;

  /**
   * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
   */
  pageSize: number = 10;

  /**
   * Proprieta di stato del componente per row number, usata dalla logica interna e dal template.
   */
  rowNumber: number = 0;

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: boolean = false;

  /**
   * Indice corrente per page index, usato per posizionamento o navigazione nel componente.
   */
  pageIndex: number = 0;

  initCompleted: boolean = false;


  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;

  /**
* function Object() { [native code] }
* @param titleService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param dataSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private titleService: Title) {

  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit() {
    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource && this.datasource.value) {
      this.subscribeToDS();
    }
  }

  /**
* Gestisce la logica di `subscribeToDS` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, preparando/aggiornando il dataset visualizzato.
*/
  async subscribeToDS() {
    var self = this;

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = self.datasource.value.fetchInfo.subscribe(async (info) => {
      if (info) {
        self.metaInfo = info.metaInfo;

        if (!self.initCompleted) {

          var title = self.metaInfo.tableMetadata.md_display_string;

          self.titleService.setTitle(title);

          // this.treeOptions = info.metaInfo.tableMetadata.extraProps?.archetypes?.tree || {};

          await self.datasource.value.fetchData();

          self.initCompleted = true;
        } else {

          self.records = self.parseData(info.resultInfo.dato);
        }
      }
    });
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(data: any) {

    return data;
  }

}


