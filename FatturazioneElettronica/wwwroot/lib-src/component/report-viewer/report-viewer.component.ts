import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StimulsoftViewerModule, StimulsoftViewerComponent } from 'stimulsoft-viewer-angular';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { ensureWuicStimulsoftLicenseRegistered } from '../../service/stimulsoft-license.service';
import { Subscription, firstValueFrom } from 'rxjs';

@Component({
  selector: 'wuic-report-viewer',
  imports: [CommonModule, StimulsoftViewerModule],
  templateUrl: './report-viewer.component.html',
  styleUrl: './report-viewer.component.css'
})
export class ReportViewerComponent implements OnInit, OnDestroy {

  /**
   * Registra la chiave Stimulsoft prima di lasciare istanziare il viewer.
   * E' fire-and-forget perche' il viewer puo' iniziare a renderizzare anche
   * senza license (con watermark "Unlicensed"); la promise risolve quando
   * la chiave e' caricata e applicata, eliminando il watermark al successivo
   * change detection. Necessario qui (e in report-designer) perche' la
   * registrazione e' stata spostata fuori dal main.ts dell'host per non
   * scaricare 5.4 MB di Stimulsoft al boot della SPA — vedi commento in
   * `service/stimulsoft-license.service.ts`.
   */
  ngOnInit(): void {
    void ensureWuicStimulsoftLicenseRegistered();
    // Trigger iniziale: il subscribe a `router.events` nel constructor cattura
    // SOLO le NavigationEnd successive — su deep-link / reload con la route
    // gia' attiva, la NavigationEnd e' gia' stata emessa prima che la
    // subscription esistesse. Forziamo il preflight qui.
    this.updateRequestUrl();
  }


  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per viewer.
   */
  @ViewChild(StimulsoftViewerComponent) viewer: StimulsoftViewerComponent;

  /**
   * Proprieta di stato del componente per request url, usata dalla logica interna e dal template.
   */
  requestUrl: string;
  /**
   * Proprieta di stato del componente per base request url, usata dalla logica interna e dal template.
   */
  baseRequestUrl: string;
  /**
   * Proprieta di stato del componente per route, usata dalla logica interna e dal template.
   */
  route: string;
  /**
   * Proprieta di stato del componente per action, usata dalla logica interna e dal template.
   */
  action: string;
  /**
   * Valore corrente selezionato per current report, usato dai flussi interattivi del componente.
   */
  currentReport: string;
  /**
   * Opzioni viewer lato client per rendere affidabile l'export in ambiente Angular/dev-server.
   * Evita il flusso con popup/new-window che in alcuni browser blocca il submit del form export.
   */
  viewerProperties: any;
  /**
   * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
   */
  private routerEventsSubscription?: Subscription;
  private readonly diagnosticPrefix = '[WUIC][ReportViewer]';

  /**
   * Gate `*ngIf` del template: se `false` lo Stimulsoft viewer NON viene
   * montato. Settato a `false` quando il preflight `CheckReport` fallisce
   * (404 con `errors.report.not_found` o altro errore tipizzato), cosi'
   * evitiamo che la libreria Stimulsoft riceva la response error envelope
   * e crashi su `Cannot read properties of null (reading 'reportFileName')`.
   * La dialog localizzata e' gia' mostrata dal `WuicErrorInterceptor` →
   * `GlobalHandler` standard pipeline.
   */
  canRenderViewer: boolean = false;
  /** Token incrementale per evitare race su preflight concorrenti. */
  private preflightSeq = 0;

  /**
 * function Object() { [native code] }
 * @param router Informazioni di routing usate per comporre o risolvere la navigazione.
 * @param aRoute Informazioni di routing usate per comporre o risolvere la navigazione.
 */
  constructor(private router: Router, private aRoute: ActivatedRoute, private http: HttpClient) {
    this.action = 'InitViewer';
    this.baseRequestUrl = WtoolboxService.appSettings.api_url + 'ReportViewer/{action}';
    this.requestUrl = WtoolboxService.appSettings.api_url + 'ReportViewer/{action}';
    this.viewerProperties = {
      replaceHtmlFormWithRequest: true,
      appearance: {
        openExportedReportWindow: '_self',
        printToPdfMode: 'Popup'
      },
      exports: {
        openAfterExport: false,
        showExportDialog: false
      }
    };

    this.routerEventsSubscription = this.router.events.subscribe((val) => {
      if (val instanceof NavigationEnd) {
        this.updateRequestUrl();
      }
    });

  }

  /**
 * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale coordinando chiamate verso servizi applicativi.
 */
  private updateRequestUrl(): void {
    this.route = this.aRoute.snapshot.paramMap.get('route');
    const queryParamMap = this.aRoute.snapshot.queryParamMap;
    const reportName = queryParamMap.get('reportName');
    const parameters = queryParamMap.get('parameters');
    const explicitFilters = queryParamMap.get('filters');
    const filterInfo = queryParamMap.get('filterInfo') ?? queryParamMap.get('filterinfo');
    const filters = explicitFilters || this.buildFiltersQueryString(filterInfo);

    const queryParts: string[] = ['route=' + encodeURIComponent(this.route || '')];
    if (reportName) {
      queryParts.push('reportName=' + encodeURIComponent(reportName));
    }
    if (parameters) {
      queryParts.push('parameters=' + encodeURIComponent(parameters));
    }
    if (filters) {
      queryParts.push('filters=' + encodeURIComponent(filters));
    }

    const computedUrl = this.baseRequestUrl + '?' + queryParts.join('&');
    this.logDiag('updateRequestUrl:start', {
      route: this.route,
      reportName,
      requestUrl: computedUrl
    });

    // Preflight: chiama `/api/ReportViewer/CheckReport` (vedi commento in
    // ReportViewerController.CheckReport per il razionale completo). Il
    // viewer Stimulsoft NON va montato se il file non esiste, perche'
    // la sua callback di parse della response e' sincrona e non passa
    // attraverso la nostra pipeline interceptor → GlobalHandler.
    // Sequenziamo via `preflightSeq` per evitare che un preflight piu'
    // vecchio (es. utente ha gia' navigato a un report diverso) sovrascriva
    // lo stato del piu' recente.
    const seq = ++this.preflightSeq;
    this.canRenderViewer = false;
    this.requestUrl = '';

    void this.runPreflight(this.route || '', reportName || 'Report.mrt', seq, computedUrl);
  }

  /**
   * Esegue il GET preflight a `CheckReport`. Su 200 → monta il viewer.
   * Su 4xx/5xx → l'envelope tipizzato e' gia' stato dispatchato a
   * GlobalHandler dal WuicErrorInterceptor, qui ci limitiamo a non
   * inizializzare lo Stimulsoft viewer.
   */
  private async runPreflight(route: string, reportName: string, seq: number, computedUrl: string): Promise<void> {
    const checkUrl = WtoolboxService.appSettings.api_url
      + 'ReportViewer/CheckReport'
      + '?route=' + encodeURIComponent(route)
      + '&reportName=' + encodeURIComponent(reportName);

    try {
      await firstValueFrom(this.http.get(checkUrl));
      // Race-guard: scarta se nel mentre e' partito un preflight piu' nuovo.
      if (seq !== this.preflightSeq) {
        this.logDiag('preflight:stale-success', { seq, current: this.preflightSeq });
        return;
      }
      this.requestUrl = computedUrl;
      this.canRenderViewer = true;
      this.logDiag('preflight:ok', { route, reportName });
    } catch (err) {
      if (seq !== this.preflightSeq) {
        this.logDiag('preflight:stale-error', { seq, current: this.preflightSeq });
        return;
      }
      // Niente notify manuale: l'interceptor (`wuicErrorInterceptor`) ha
      // gia' dispatchato l'envelope tipizzato a GlobalHandler.handleErrorStatic
      // → dialog localizzata mostrata. Qui solo lockdown del viewer.
      this.canRenderViewer = false;
      this.requestUrl = '';
      this.logDiag('preflight:ko', { route, reportName, err });
    }
  }

  /**
 * Costruisce una struttura di output a partire dal contesto corrente normalizzando e trasformando collezioni di record.
 * @param rawFilterInfo Criteri di filtro applicati per limitare il dataset o aggiornare la query visualizzata.
 * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
 */
  private buildFiltersQueryString(rawFilterInfo: string | null): string {
    if (!rawFilterInfo) {
      return '';
    }

    try {
      const filterInfo = JSON.parse(rawFilterInfo);
      const filters = this.flattenFilters(filterInfo);
      return filters
        .map((item) => this.mapFilterToControllerFormat(item))
        .filter((item) => !!item)
        .join(',,');
    } catch {
      return '';
    }
  }

  /**
 * Trasforma i dati in una forma coerente con il rendering o con il payload richiesto orchestrando le chiamate `String`.
 * @param filter Criteri di filtro applicati per limitare il dataset o aggiornare la query visualizzata.
 * @returns Stringa calcolata dal metodo (chiave, etichetta o frammento testuale) in base al contesto corrente.
 */
  private mapFilterToControllerFormat(filter: any): string {
    const field = filter?.field;
    if (!field) {
      return '';
    }

    const operator = filter?.operatore ?? filter?.operator ?? 'eq';
    const value = filter?.value == null ? '' : String(filter.value);
    return `${field}||${operator}||${value}`;
  }

  private flattenFilters(filterInfo: any): any[] {
    const result: any[] = [];
    const visit = (group: any) => {
      const filters = Array.isArray(group?.filters) ? group.filters : [];
      filters.forEach((node: any) => {
        if (!node) {
          return;
        }
        if (node?.nestedFilters && Array.isArray(node.nestedFilters.filters)) {
          visit(node.nestedFilters);
          return;
        }
        if (typeof node?.field === 'string') {
          result.push(node);
        }
      });
    };

    if (Array.isArray(filterInfo)) {
      visit({ filters: filterInfo });
    } else {
      visit(filterInfo);
    }
    return result;
  }

  /**
* Gestisce la logica di `fix` orchestrando le chiamate `dashboardRefresh`.
*/
  fix() {
    this.viewer.api.dashboardRefresh();
  }

  /**
   * Allinea opzioni runtime del viewer per evitare flussi print/export su frame cross-origin.
   */
  onViewerLoaded(): void {
    this.logDiag('onViewerLoaded:start');
    const viewerAny = this.viewer as any;
    const internalModel = viewerAny?.model;
    const options = internalModel?.options;
    if (!options) {
      this.logDiag('onViewerLoaded:no-options');
      return;
    }

    options.replaceHtmlFormWithRequest = true;
    options.appearance = options.appearance || {};
    options.appearance.openExportedReportWindow = '_self';
    options.appearance.printToPdfMode = 'Popup';
    options.exports = options.exports || {};
    options.exports.openAfterExport = false;
    options.exports.showExportDialog = false;

    const controller = viewerAny?.controller;
    if (controller && !controller.__wuicActionPatched && typeof controller.action === 'function') {
      const originalAction = controller.action.bind(controller);
      controller.action = (event: any) => {
        this.logDiag('controller.action', event);
        return originalAction(event);
      };
      controller.__wuicActionPatched = true;
      this.logDiag('onViewerLoaded:controller-action-patched');
    }

    const exportService = viewerAny?.exportService;
    if (exportService && !exportService.__wuicExportServicePatched) {
      if (typeof exportService.export === 'function') {
        const originalExport = exportService.export.bind(exportService);
        exportService.export = (format: any, update = false, sendMail = false) => {
          this.logDiag('exportService.export', { format, update, sendMail });
          return originalExport(format, update, sendMail);
        };
      }
      if (typeof exportService.postExport === 'function') {
        const originalPostExport = exportService.postExport.bind(exportService);
        exportService.postExport = () => {
          this.logDiag('exportService.postExport', {
            format: exportService?.format,
            sendMail: exportService?.sendMail
          });
          return originalPostExport();
        };
      }
      exportService.__wuicExportServicePatched = true;
      this.logDiag('onViewerLoaded:export-service-patched');
    }

    // Workaround Stimulsoft Angular flow:
    // for Save/Export the default branch may request onlyFileName first.
    // In our setup this pre-step can fail silently while Print works.
    // We force retrieveFileName=false only for export calls, keeping default behavior elsewhere.
    const httpClientService = viewerAny?.controller?.httpClient;
    const exportAction = options?.actions?.exportReport;
    if (!httpClientService || httpClientService.__wuicExportPatched || !exportAction) {
      this.logDiag('onViewerLoaded:skip-patch', {
        hasHttpClient: !!httpClientService,
        alreadyPatched: !!httpClientService?.__wuicExportPatched,
        exportAction
      });
      return;
    }

    const originalPostForm = httpClientService.postForm?.bind(httpClientService);
    if (!originalPostForm) {
      this.logDiag('onViewerLoaded:no-originalPostForm');
      return;
    }

    this.logDiag('onViewerLoaded:apply-patch', { exportAction });
    httpClientService.postForm = (url: string, data: any, doc: any, postOnlyData = false, retrieveFileName = true) => {
      this.logDiag('postForm:called', {
        url,
        action: data?.action,
        exportFormat: data?.exportFormat,
        postOnlyData,
        retrieveFileName
      });

      const isExportCall = typeof url === 'string' && url.toLowerCase().includes(`/${String(exportAction).toLowerCase()}`);
      const isSaveExport = isExportCall && String(data?.action || '').toLowerCase() === 'exportreport';
      this.logDiag('postForm:classified', {
        isExportCall,
        isSaveExport,
        exportAction
      });
      if (!isSaveExport) {
        this.logDiag('postForm:passthrough', {
          forcedRetrieveFileName: isExportCall ? false : retrieveFileName
        });
        return originalPostForm(url, data, doc, postOnlyData, isExportCall ? false : retrieveFileName);
      }

      const model = viewerAny?.model;
      const params = postOnlyData ? data : model.createPostParameters(data, true);
      const format = String(data?.exportFormat || 'pdf').toLowerCase();
      const extensionMap: Record<string, string> = {
        pdf: 'pdf',
        xps: 'xps',
        html: 'html',
        html5: 'html',
        mht: 'mht',
        text: 'txt',
        rtf: 'rtf',
        word: 'docx',
        odt: 'odt',
        excel: 'xlsx',
        excelbiff: 'xls',
        excelxml: 'xml',
        ods: 'ods',
        csv: 'csv',
        dbf: 'dbf',
        dif: 'dif',
        sylk: 'slk',
        xml: 'xml',
        json: 'json'
      };
      const fileName = `report.${extensionMap[format] || format || 'bin'}`;
      this.logDiag('postForm:save-export-direct-download', {
        format,
        fileName
      });

      if (model?.controls?.navigatePanel) {
        model.controls.navigatePanel.enabled = false;
      }
      if (model?.controls?.toolbar) {
        model.controls.toolbar.enabled = false;
      }
      if (model) {
        model.showProgress = true;
      }

      const rawHttp = httpClientService?.httpClient;
      if (!rawHttp || typeof rawHttp.post !== 'function') {
        this.logDiag('postForm:raw-http-missing', {
          hasRawHttp: !!rawHttp
        });
        return originalPostForm(url, data, doc, postOnlyData, false);
      }

      const formData = new FormData();
      Object.keys(params || {}).forEach((key) => formData.append(key, params[key]));

      return rawHttp.post(url, formData, { responseType: 'blob' }).subscribe((blob: any) => {
        this.logDiag('postForm:getData:success', {
          fileName,
          blobType: blob?.type,
          blobSize: blob?.size
        });
        if (model?.controls?.navigatePanel) {
          model.controls.navigatePanel.enabled = true;
        }
        if (model?.controls?.toolbar) {
          model.controls.toolbar.enabled = true;
        }
        if (model) {
          model.showProgress = false;
        }
        const fileSaver = httpClientService?.fileSaver;
        if (fileSaver && typeof fileSaver.saveAs === 'function') {
          fileSaver.saveAs(blob, fileName);
        } else {
          this.logDiag('postForm:fileSaver-missing-fallback', { fileName });
          this.downloadBlob(blob, fileName);
        }
      }, (error: any) => {
        this.logDiag('postForm:getData:error', error);
        if (model?.controls?.navigatePanel) {
          model.controls.navigatePanel.enabled = true;
        }
        if (model?.controls?.toolbar) {
          model.controls.toolbar.enabled = true;
        }
        if (model) {
          model.showProgress = false;
        }
      });
    };
    httpClientService.__wuicExportPatched = true;
    this.logDiag('onViewerLoaded:patched');
  }

  onExportEvent(event: any): void {
    this.logDiag('output.export', event);
  }

  onPrintEvent(event: any): void {
    this.logDiag('output.print', event);
  }

  onViewerError(event: any): void {
    this.logDiag('output.error', event);
  }

  private logDiag(message: string, payload?: any): void {
    // if (payload !== undefined) {
    //   console.log(`${this.diagnosticPrefix} ${message}`, payload);
    //   return;
    // }
    // console.log(`${this.diagnosticPrefix} ${message}`);
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    if (!blob) {
      this.logDiag('downloadBlob:no-blob');
      return;
    }

    const safeFileName = fileName || 'report.bin';
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = safeFileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.routerEventsSubscription?.unsubscribe();
  }
}
