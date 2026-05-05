import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { StimulsoftDesignerComponent, StimulsoftDesignerModule } from 'stimulsoft-designer-angular';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { ensureWuicStimulsoftLicenseRegistered } from '../../service/stimulsoft-license.service';

@Component({
    selector: 'wuic-report-designer',
    imports: [StimulsoftDesignerModule],
    templateUrl: './report-designer.component.html',
    styleUrl: './report-designer.component.css'
})
export class ReportDesignerComponent implements OnInit, AfterViewInit, OnDestroy {

  /**
   * Vedi commento equivalente in `report-viewer.component.ts`: registra la
   * Stimulsoft license al primo mount del designer (lazy-load del chunk
   * `stimulsoft-reports-js` che pesa ~5.4 MB / 12.7 MB raw).
   */
  ngOnInit(): void {
    void ensureWuicStimulsoftLicenseRegistered();
  }


  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per designer.
   */
  @ViewChild(StimulsoftDesignerComponent) designer: StimulsoftDesignerComponent;

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
   * Valore corrente selezionato per current report, usato dai flussi interattivi del componente.
   */
  currentReport: string;
  /**
   * Proprieta di stato del componente per router events subscription, usata dalla logica interna e dal template.
   */
  private routerEventsSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per designer bootstrap interval, usata dalla logica interna e dal template.
   */
  private designerBootstrapInterval?: ReturnType<typeof setInterval>;
  private reportCacheInvalidationTimer?: ReturnType<typeof setTimeout>;

    /**
   * function Object() { [native code] }
   * @param router Informazioni di routing usate per comporre o risolvere la navigazione.
   * @param aRoute Informazioni di routing usate per comporre o risolvere la navigazione.
   */
  constructor(private router: Router, private aRoute: ActivatedRoute, private metaSrv: MetadataProviderService) {
    this.baseRequestUrl = WtoolboxService.appSettings.api_url + 'ReportDesigner';
    this.requestUrl = WtoolboxService.appSettings.api_url + 'ReportDesigner';
    this.syncRequestUrl();

    this.routerEventsSubscription = this.router.events.subscribe((val) => {
      if (val instanceof NavigationEnd) {
        this.syncRequestUrl();
      }
    });
  }

          /**
   * Esegue operazioni di persistenza/sincronizzazione in `syncRequestUrl` allineando lo stato con parametri route/query.
   */
  private syncRequestUrl() {
    this.route = this.aRoute.snapshot.paramMap.get('route');
    const reportName = this.aRoute.snapshot.queryParamMap.get('reportName');
    this.currentReport = reportName || '';
    this.requestUrl = this.baseRequestUrl + '?route=' + this.route
      + (reportName ? '&reportName=' + encodeURIComponent(reportName) : '');
  }

          /**
   * Gestisce la logica di `fix` con il flusso specifico definito dalla sua implementazione.
   */
  fix() {
    let designer = this.designer;
    debugger;
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   *
   * NOTE: <stimulsoft-designer-angular> is now wrapped in @defer (on immediate)
   * in the template — so the @ViewChild reference (`this.designer`) may not be
   * resolved yet when ngAfterViewInit first fires. The bootstrap interval below
   * already polls for readiness, but we guard the initial access too.
   */
  ngAfterViewInit(): void {

    let self = this;

    this.designerBootstrapInterval = setInterval(() => {
      if (!this.designer) {
        return; // @defer block hasn't rendered yet
      }
      if (this.designer.designerEl?.nativeElement && this.designer.designerEl.nativeElement.style.height !== "100%") {
        this.designer.designerEl.nativeElement.style.height = "100%";
      }
      if (this.designer.designer) {

        if (this.designer.designerEl.nativeElement.getElementsByClassName("stiChildWorkPanel stiWorkPanelScrollContainer").length > 0) {
          if (this.designer.designerEl.nativeElement.getElementsByClassName("stiChildWorkPanel stiWorkPanelScrollContainer")[0].getElementsByTagName("table").length > 0) {
            if (this.designerBootstrapInterval) {
              clearInterval(this.designerBootstrapInterval);
              this.designerBootstrapInterval = undefined;
            }

            let tr = this.designer.designerEl.nativeElement.getElementsByClassName("stiChildWorkPanel stiWorkPanelScrollContainer")[0].getElementsByTagName("table")[0].getElementsByTagName("tr")[0];

            let saveBtn: HTMLDivElement = tr.children[0] as HTMLDivElement;
            saveBtn.addEventListener("click", () => {
              if (this.reportCacheInvalidationTimer) {
                clearTimeout(this.reportCacheInvalidationTimer);
              }

              // Delay breve per lasciare al designer il tempo di completare la save lato backend.
              this.reportCacheInvalidationTimer = setTimeout(() => {
                this.metaSrv.invalidateReportListCache(this.route);
              }, 400);
            });

            let cloned = saveBtn.cloneNode(true) as HTMLDivElement;
            cloned.id = "saveAsBtn";

            saveBtn.parentElement.prepend(cloned);
            (<HTMLDivElement>cloned).getElementsByTagName("table")[0].getElementsByTagName("tr")[2].getElementsByTagName("td")[0].innerText = "Save As";

            setTimeout(() => {
              cloned.className = "stiDesignerStandartBigButton stiDesignerStandartBigButton_Mouse stiDesignerStandartBigButtonDefault"
            }, 200);

            cloned.onclick = () => {
              debugger;

              //ask name -> save copy of current
              //change requestUrl and reload
            }

            let td = document.createElement("td");
            td.className = "stiDesignerClearAllStyles";
            let div = document.createElement("div");
            div.className = "stiDesignerGroupBlock";
            let div2 = document.createElement("div");
            div2.className = "stiDesignerGroupBlockContainer";

            let formElement = document.createElement("select");
            formElement.className = "stiDesignerTextBox stiDesignerTextBoxDefault";
            let optionElement = document.createElement("option");

            optionElement.value = "foo";
            optionElement.text = "foo"
            optionElement.selected = true;
            formElement.appendChild(optionElement);

            optionElement = document.createElement("option");

            optionElement.value = "foo2";
            optionElement.text = "foo2"
            optionElement.selected = false;

            formElement.appendChild(optionElement);
            formElement.id = "bar";

            td.appendChild(div);
            div.appendChild(div2);

            div2.appendChild(formElement);

            formElement.onchange = () => {
              debugger;
              //set current report
              self.currentReport = formElement.value;

              //change requestUrl and reload
              this.requestUrl = this.baseRequestUrl + '?route=' + this.route + '&reportName=' + self.currentReport;
            }

            tr.prepend(td);

          }
        }


      }
    }, 500);

  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.routerEventsSubscription?.unsubscribe();
    if (this.designerBootstrapInterval) {
      clearInterval(this.designerBootstrapInterval);
      this.designerBootstrapInterval = undefined;
    }
    if (this.reportCacheInvalidationTimer) {
      clearTimeout(this.reportCacheInvalidationTimer);
      this.reportCacheInvalidationTimer = undefined;
    }
  }
}


