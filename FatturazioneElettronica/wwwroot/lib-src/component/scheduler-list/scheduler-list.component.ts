import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, EmbeddedViewRef, EventEmitter, HostListener, Input, OnDestroy, Output, TemplateRef, ViewChild } from '@angular/core';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions } from '@fullcalendar/core'; // useful for typechecking
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetaInfo } from '../../class/metaInfo';
import { Title } from '@angular/platform-browser';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';
import { BehaviorSubject } from 'rxjs';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { CallbackPipe2 } from '../../pipe/callback2.pipe';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { FilterInfo } from '../../class/filterInfo';
import { FilterItem } from '../../class/filterItem';
import { IBindable } from '../../class/IBindable';
import { IDesigner } from '../../class/IDesigner';
import { SchedulerOptions } from '../../class/schedulerOptions';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

// https://fullcalendar.io/docs/initialize-globals#premium-bundle - 
// https://fullcalendar.io/docs/addResource-demo
// https://fullcalendar.io/docs/upgrading-from-v5#content-injection
@Component({
  selector: 'wuic-scheduler-list',
  imports: [FullCalendarModule, NgComponentOutlet],
  templateUrl: './scheduler-list.component.html',
  styleUrl: './scheduler-list.component.css',
  providers: [Title]
})
export class SchedulerListComponent implements AfterViewInit, OnDestroy, IBindable, IDesigner<SchedulerOptions>, IDataBoundHostComponent {
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per event content.
   */
  @ViewChild("fcEventContent") eventContent: TemplateRef<any>;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per calendar.
   */
  @ViewChild("calendar") calendar: FullCalendarComponent;

  /**
   * Input dal componente padre per hardcoded route; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedRoute: string;
  /**
   * Input dal componente padre per parent record; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentRecord: any;
  /**
   * Input dal componente padre per parent meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() parentMetaInfo: MetaInfo;

  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;
  /**
   * Input dal componente padre per hide toolbar; quando true nasconde la toolbar del calendario.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Evento emesso su dateClick full-calendar.
   */
  @Output() onSchedulerDateClick = new EventEmitter<any>();
  /**
   * Evento emesso su eventClick full-calendar.
   */
  @Output() onSchedulerEventClick = new EventEmitter<any>();
  /**
   * Evento emesso su eventDrop full-calendar.
   */
  @Output() onSchedulerEventDrop = new EventEmitter<any>();
  /**
   * Evento emesso su eventResize full-calendar.
   */
  @Output() onSchedulerEventResize = new EventEmitter<any>();
  /**
   * Evento emesso su datesSet full-calendar.
   */
  @Output() onSchedulerDatesSet = new EventEmitter<any>();
  /**
   * Evento emesso quando il wrapper completa il data-binding eventi dal datasource.
   */
  @Output() onSchedulerDataBound = new EventEmitter<{ metaInfo: MetaInfo; events: any[] }>();
  /**
   * Evento emesso dopo sync riuscita su drag/drop/resize evento.
   */
  @Output() onSchedulerEventSync = new EventEmitter<{ arg: any; datasource: DataSourceComponent }>();

  /**
   * Collezione dati per calendar options, consumata dal rendering e dalle operazioni del componente.
   */
  calendarOptions: CalendarOptions;
  /**
   * Collezione dati per archetype options, consumata dal rendering e dalle operazioni del componente.
   */
  archetypeOptions: SchedulerOptions;

  /**
   * Collezione dati per data, consumata dal rendering e dalle operazioni del componente.
   */
  data: any[] = [];

  /**
   * Configurazione di presentazione per content renderers, usata nel rendering del componente.
   */
  private readonly contentRenderers = new Map<string, EmbeddedViewRef<any>>();

  /**
   * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
   */
  metas: MetadatiColonna[];
  /**
   * Proprieta di stato del componente per cols, usata dalla logica interna e dal template.
   */
  cols: any;
  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: boolean = false;
  /**
   * Proprieta di stato del componente per from field, usata dalla logica interna e dal template.
   */
  fromField: string = 'from';
  /**
   * Proprieta di stato del componente per to field, usata dalla logica interna e dal template.
   */
  toField: string = 'to';
  /**
   * Proprieta di stato del componente per title field, usata dalla logica interna e dal template.
   */
  titleField: string = 'title';
  /**
   * Configurazione di presentazione per item template string, usata nel rendering del componente.
   */
  itemTemplateString: string;

  /**
   * Proprieta di stato del componente per counter, usata dalla logica interna e dal template.
   */
  counter: number = 0;
  /**
   * Configurazione di presentazione per item template, usata nel rendering del componente.
   */
  itemTemplate: typeof DynamicGenericTemplateComponent;
  /**
   * Proprieta di stato del componente per title function, usata dalla logica interna e dal template.
   */
  titleFunction: Function;
  /**
   * Proprieta di stato del componente per fetch info sub, usata dalla logica interna e dal template.
   */
  private fetchInfoSub: any;
  /**
   * Proprieta di stato del componente per datasource sub, usata dalla logica interna e dal template.
   */
  private datasourceSub: any;

  /**
   * Inietta i servizi usati dal planner per titolo pagina, change detection e traduzioni.
   * @param titleService Servizio Angular `Title`.
   * @param cd `ChangeDetectorRef` per refresh espliciti del calendario.
   * @param trslSrv Servizio traduzioni per caption/dialog.
   */
  constructor(private titleService: Title, private cd: ChangeDetectorRef, private trslSrv: TranslationManagerService) { // , private cd: ChangeDetectorRef
  }

  /**
   * Completa inizializzazione dopo il rendering della view e collega riferimenti UI.
   */
  ngAfterViewInit(): void {
    let self = this;

    let calOpts: CalendarOptions = {
      initialView: 'dayGridMonth',
      plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      views: {
        dayGrid: {
          // options apply to dayGridMonth, dayGridWeek, and dayGridDay views
        },
        timeGrid: {
          // options apply to timeGridWeek and timeGridDay views
        },
        week: {
          // options apply to dayGridWeek and timeGridWeek views
        },
        day: {
          // options apply to dayGridDay and timeGridDay views
        }
      },
      editable: true,
      // eventDurationEditable: true,
      selectable: false,
      unselectAuto: true,
      dateClick: function (info) {
        self.onSchedulerDateClick.emit(info);
        if (self.datasource && self.datasource.value && self.datasource.value.metaInfo && self.datasource.value.metaInfo.tableMetadata.md_insertable) {
          let header = self.trslSrv.instant('insert') + ' ' + self.metaInfo.tableMetadata.md_display_string;

          let defaulted = self.datasource.value.addNewRecord();
          const fromCol = self.getColumnMetadata(self.fromField);
          const toCol = self.getColumnMetadata(self.toField);
          defaulted[self.fromField].next(self.serializeDateForColumn(info.date, fromCol));
          let toDate = new Date(info.date);
          const toType = String(toCol?.mc_ui_column_type || '').trim().toLowerCase();
          // For all-day date fields we persist inclusive end date.
          if (toType !== 'date') {
            toDate.setDate(toDate.getDate() + 1);
          }

          defaulted[self.toField].next(self.serializeDateForColumn(toDate, toCol));

          const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
            data: {
              record: defaulted,
              pristine: self.datasource.value.pristine,
              metaInfo: self.metaInfo,
              datasource: self.datasource,
              isEditForm: true
            },
            header: header,
            styleClass: 'edit-form-content',
            position: 'center'
          });

          if (!ref?.onClose) {
            console.warn('Scheduler dialog open returned null reference.');
            return;
          }

          ref.onClose.subscribe(async (savedRecord: any) => {
            if (savedRecord && self.datasource?.value) {
              await self.datasource.value.fetchData();
            }
          });
        }
      },
      eventDrop: async (arg) => {
        self.onSchedulerEventDrop.emit(arg);
        await self.updateEvent(arg);
      },
      eventResize: async (arg) => {
        self.onSchedulerEventResize.emit(arg);
        await self.updateEvent(arg);
      },
      datesSet: async (dateInfo: any) => {
        self.onSchedulerDatesSet.emit(dateInfo);
        dateInfo.end.setHours(23);
        dateInfo.end.setMinutes(59);
        dateInfo.end.setSeconds(59);

        if (self.datasource && self.datasource.value) {
          self.datasource.value.filterInfo = new FilterInfo('AND', [
            new FilterItem({ operator: 'gte', field: self.toField, value: dateInfo.start }),
            new FilterItem({ operator: 'lte', field: self.fromField, value: dateInfo.end })
          ]);

          if (self.datasource && self.datasource.value && self.datasource.value.metaInfo && self.datasource.value.metaInfo.columnMetadata.length > 0) {
            await self.datasource.value.fetchData();
          }
        }
      },
      eventClick: (arg) => {
        self.onSchedulerEventClick.emit(arg);
      }
    };

    if (this.hideToolbar) {
      calOpts.headerToolbar = false as any;
    }

    // Defer the @if(calendarOptions) toggle until after the current change-detection
    // pass: assigning during ngAfterViewInit triggers NG0100 because the
    // SchedulerListComponent_Template conditional view goes from `-1` (no view)
    // to `0` (view created) within the same CD cycle.
    queueMicrotask(() => {
      self.calendarOptions = calOpts; // error in prod

      if (this.hardcodedDatasource) {
        this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
        this.subscribeToDS();
      } else if (this.datasource && this.datasource.value) {
        this.subscribeToDS();
      } else {
        this.datasourceSub?.unsubscribe?.();
        this.datasourceSub = this.datasource.subscribe((ds) => {
          if (ds) {
            this.subscribeToDS();
          }
        });
      }

      this.cd.detectChanges();
      this.refreshCalendarView();

    });

  }

  /**
   * Sottoscrive lo stream `fetchInfo$` del datasource, applica le opzioni scheduler
   * dai metadati tabella e aggiorna gli eventi mostrati nel calendario.
   */
  subscribeToDS() {
    this.fetchInfoSub?.unsubscribe?.();
    this.fetchInfoSub = this.datasource.value.fetchInfo$.subscribe((info) => {
      if (info) {
        this.metaInfo = info.metaInfo;

        let schedOptions = info.metaInfo.tableMetadata.extraProps?.archetypes?.scheduler;
        this.calendarOptions.editable = info.metaInfo.tableMetadata.md_editable;

        if (schedOptions) {
          this.fromField = schedOptions.fromField;
          this.toField = schedOptions.toField;
          this.titleField = schedOptions.titleField;

          if (schedOptions.itemTemplateString || this.metaInfo.tableMetadata.md_book_html_template) {
            this.itemTemplateString = schedOptions.itemTemplateString || this.metaInfo.tableMetadata.md_book_html_template;
          } else {
            if (schedOptions.titleFunction) {
              // skills/typed-localized-exceptions: cached compiled fn → wrap il
              // call-site (non la compile) cosi' ogni invocazione runtime e' protetta
              // (titleFunction(record) viene chiamata per ogni evento renderizzato).
              const compiledTitleFn = new Function('record', schedOptions.titleFunction);
              const route = this.metaInfo?.tableMetadata?.md_route_name;
              this.titleFunction = (record: any) => WtoolboxService.runUserCallbackSync(
                'archetypes.scheduler.titleFunction',
                () => compiledTitleFn(record),
                [],
                { archetype: 'scheduler', route }
              );
            }
          }
        } else {
          let dateFields = this.metaInfo.columnMetadata.filter(c => c.mc_ui_column_type == 'date' || c.mc_ui_column_type == 'datetime');

          if (dateFields.length >= 2) {
            let fromCandidates = dateFields.filter(c => c.mc_nome_colonna.toLowerCase().includes('from'));
            let toCandidates = dateFields.filter(c => c.mc_nome_colonna.toLowerCase().includes('to'));

            if (fromCandidates.length > 0 && toCandidates.length > 0) {
              this.fromField = fromCandidates[0].mc_nome_colonna;
              this.toField = toCandidates[0].mc_nome_colonna;
            }
            else {
              this.fromField = dateFields[0].mc_nome_colonna;
              this.toField = dateFields[1].mc_nome_colonna;
            }
          } else {

            this.fromField = this.toField = this.metaInfo.columnMetadata.find(c => c.mc_ui_column_type == 'date' || c.mc_ui_column_type == 'datetime')?.mc_nome_colonna;
          }

          this.titleField = this.metaInfo.columnMetadata.find(c => c.mc_ui_column_type == 'text' || c.mc_ui_column_type == 'txt_area')?.mc_nome_colonna;
        }

        let title = this.metaInfo.tableMetadata.md_display_string;

        this.titleService.setTitle(title);

        const template = this.itemTemplateString || MetadataProviderService.widgetDefinition.schedulerEventTemplate;

        const component = DynamicGenericTemplateComponent.getComponentFromTemplate(template || '', 'md_props_bag.archetypes.scheduler.itemTemplate', String(this.metaInfo?.tableMetadata?.md_route_name || ''));

        this.itemTemplate = component;

        if (info.resultInfo.dato) {
          this.data = this.parseData(info.resultInfo.dato);
          this.onSchedulerDataBound.emit({
            metaInfo: this.metaInfo,
            events: this.data
          });
          this.refreshCalendarView();
        } else {
          this.datasource.value.fetchData();
        }

        // this.totalRecords = info.resultInfo.totalRowCount || 0;
        // this.aggregates = info.resultInfo.Agg || [];

        // this.filter();
      }
    });
  }

  /**
   * Evita la propagazione dell'evento DOM dal contenuto custom dell'evento calendario.
   * @param $event Evento da fermare.
   */
  fix($event) {
    $event.stopPropagation();
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(data: any) {
    return WtoolboxService.wrapArchetypeLifecycleSync(
      'scheduler', 'parseData',
      () => this._parseDataInternal(data),
      { route: this.metaInfo?.tableMetadata?.md_route_name },
      { fallback: [] }
    );
  }

  private _parseDataInternal(data: any) {
    let startcol = this.metaInfo.columnMetadata.find(c => c.mc_nome_colonna == this.fromField);
    let endcol = this.metaInfo.columnMetadata.find(c => c.mc_nome_colonna == this.toField);
    const allDay = String(startcol?.mc_ui_column_type || '').trim().toLowerCase() === 'date';

    return data.filter(x => x[this.fromField] && x[this.toField]).map((x: any) => {
      const startDate = this.parseDate(x[this.fromField], startcol!);
      let endDate = this.parseDate(x[this.toField], endcol!);
      // FullCalendar treats all-day `end` as exclusive; our metadata stores inclusive end date.
      if (allDay && endDate) {
        endDate = this.addDays(endDate, 1);
      }

      return {
        id: x[MetadataProviderService.getPKeys(this.metaInfo.columnMetadata)[0].mc_nome_colonna],
        title: !this.titleFunction ? x[this.titleField] : this.titleFunction(x),
        start: startDate,
        end: endDate,
        editable: this.metaInfo.tableMetadata.md_editable,
        durationEditable: this.metaInfo.tableMetadata.md_editable,
        extendedProps: x,
        allDay: allDay
        //classNames: x['FK_ASM'] ? ['simulation'] : []
      }
    });
  }

  /**
* Interpreta e normalizza input/configurazione in `parseDate` per l'utilizzo nel componente.
* @param date Parametro utilizzato dal metodo nel flusso elaborativo.
* @param col Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Struttura dati prodotta da `parseDate` dopo normalizzazione/elaborazione.
*/
  parseDate(date: any, col: MetadatiColonna) {
    if (date && col) {
      if (col.mc_ui_column_type == 'date') {
        if (typeof date === 'string') {
          const raw = date.trim();
          const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (m) {
            return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          }
        }
        return new Date(date);
      } else if (col.mc_ui_column_type == 'datetime') {
        return new Date(date);
      } else if (col.mc_ui_column_type == 'time') {
        return new Date(date);
      } else if (col.mc_ui_column_type == 'number') {
        return new Date(date);
      } else {
        return new Date(date);
      }
    }

    return null;
  }

  /**
* Applica aggiornamenti di stato tramite `updateEvent` mantenendo coerenti UI e dati.
* @param arg Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  private async updateEvent(arg: any) {
    // var instance = this.datasource.value.getObservable(arg.event.extendedProps);
    // this.datasource.value.pristine = arg.event.extendedProps;
    // this.datasource.value.resultInfo.current = instance;

    const originalRecord = JSON.parse(JSON.stringify(arg?.event?.extendedProps || {}));
    this.datasource.value.setCurrent(originalRecord);

    let instance = this.datasource.value.resultInfo.current;
    const startDate: Date | null = arg?.event?.start ?? null;
    const endDate: Date | null = arg?.event?.end ?? startDate;
    const sameField = String(this.fromField || '').trim().toLowerCase() === String(this.toField || '').trim().toLowerCase();
    const fromCol = this.getColumnMetadata(this.fromField);
    const toCol = this.getColumnMetadata(this.toField);
    const allDay = String(fromCol?.mc_ui_column_type || '').trim().toLowerCase() === 'date';

    if (!startDate) {
      return;
    }

    if (sameField) {
      instance[this.fromField]?.next?.(this.serializeDateForColumn(startDate, fromCol));
    } else {
      instance[this.fromField]?.next?.(this.serializeDateForColumn(startDate, fromCol));
      if (endDate) {
        const endToPersist = allDay ? this.addDays(endDate, -1) : endDate;
        instance[this.toField]?.next?.(this.serializeDateForColumn(endToPersist, toCol));
      }
    }

    let res = await this.datasource.value.syncData(instance, originalRecord);

    if (!res) {
      arg?.revert?.();
      return;
    }

    // Keep datasource in-memory state aligned with DB after drag/drop update.
    await this.datasource.value.fetchData();
    this.onSchedulerEventSync.emit({
      arg,
      datasource: this.datasource.value
    });
  }

  private getColumnMetadata(fieldName: string): MetadatiColonna | undefined {
    const key = String(fieldName || '').trim().toLowerCase();
    if (!key) {
      return undefined;
    }

    return (this.metaInfo?.columnMetadata || []).find((c) => String(c?.mc_nome_colonna || '').trim().toLowerCase() === key);
  }

  private serializeDateForColumn(date: Date, col?: MetadatiColonna): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }

    const type = String(col?.mc_ui_column_type || '').trim().toLowerCase();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');

    if (type === 'date') {
      return `${yyyy}-${mm}-${dd}`;
    }

    if (type === 'time') {
      return `${hh}:${mi}:${ss}`;
    }

    if (type === 'number') {
      return String(date.getTime());
    }

    // datetime/default: local timestamp (no UTC conversion).
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
  }

  private addDays(date: Date, delta: number): Date {
    if (!(date instanceof Date) || isNaN(date.getTime()) || !Number.isFinite(delta)) {
      return date;
    }

    const clone = new Date(date.getTime());
    clone.setDate(clone.getDate() + delta);
    return clone;
  }

  /**
   * Forza un re-render asincrono di FullCalendar dopo il refresh Angular,
   * utile quando il calendario viene inizializzato prima che il layout sia stabile.
   */
  private refreshCalendarView() {
    // Some navigations initialize FullCalendar before layout settles; a queued
    // re-render avoids the "empty until click" behavior.
    queueMicrotask(() => {
      this.cd.detectChanges();

      setTimeout(() => {
        const api = this.calendar?.getApi?.();
        if (api) {
          this.updateCalendarHeight();
          api.render();
          api.updateSize();
        }
      }, 0);
    });
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateCalendarHeight();
  }

  private updateCalendarHeight(): void {
    const api = this.calendar?.getApi?.();
    const calendarEl = (api as any)?.el as HTMLElement | undefined;
    if (!api || !calendarEl) {
      return;
    }

    const rect = calendarEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const bottomPadding = 12;
    const minHeight = 420;
    const computedHeight = Math.max(minHeight, Math.floor(viewportHeight - rect.top - bottomPadding));

    api.setOption('height', computedHeight);
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.fetchInfoSub?.unsubscribe?.();
    this.fetchInfoSub = null;
    this.datasourceSub?.unsubscribe?.();
    this.datasourceSub = null;
  }

}

