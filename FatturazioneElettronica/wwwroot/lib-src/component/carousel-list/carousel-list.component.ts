import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EmbeddedViewRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetaInfo } from '../../class/metaInfo';
// import { ResultInfo } from '../../class/resultInfo';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { DataSourceComponent } from '../data-source/data-source.component';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';
import { CarouselModule } from 'primeng/carousel';
import { GetSrcUploadPreviewPipe } from '../../pipe/get-src-upload-preview.pipe';
import { ImageModule } from 'primeng/image';
import { IBindable } from '../../class/IBindable';
import { IDesigner } from '../../class/IDesigner';
import { CarouselOptions } from '../../class/carouselOptions';
import { ButtonModule } from 'primeng/button';
import { ImageWrapperComponent } from '../image-wrapper/image-wrapper.component';
import { NgComponentOutlet } from '@angular/common';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute } from '@angular/router';
import { ArchetypeConfiguratorComponent } from '../archetype-configurator/archetype-configurator.component';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

@Component({
  selector: 'wuic-carousel-list',
  imports: [CarouselModule, GetSrcUploadPreviewPipe, ImageModule, ButtonModule, ImageWrapperComponent, NgComponentOutlet, TranslateModule, ArchetypeConfiguratorComponent],
  templateUrl: './carousel-list.component.html',
  styleUrl: './carousel-list.component.css'
})
export class CarouselListComponent implements IBindable, IDesigner<CarouselOptions>, OnInit, AfterViewInit, OnDestroy, IDataBoundHostComponent {
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
   * Input dal componente padre per hide toolbar; quando true nasconde la toolbar carousel.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Evento emesso quando cambia pagina del p-carousel.
   */
  @Output() onCarouselPage = new EventEmitter<any>();
  /**
   * Evento emesso al click su un item del carousel.
   */
  @Output() onCarouselItemClick = new EventEmitter<{ item: any; originalEvent: Event }>();
  /**
   * Evento emesso quando il datasource aggiorna i record visualizzati dal carousel.
   */
  @Output() onCarouselDataBound = new EventEmitter<{ metaInfo: MetaInfo; data: any[] }>();

  // @ViewChild("fcEventContent") eventContent: TemplateRef<any>;
  // @ViewChild("calendar") calendar: FullCalendarComponent;

  /**
   * Collezione dati per archetype options, consumata dal rendering e dalle operazioni del componente.
   */
  archetypeOptions: CarouselOptions;

  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo;
  /**
   * Collezione dati per data, consumata dal rendering e dalle operazioni del componente.
   */
  data: any[];
  /**
   * Configurazione di presentazione per item template string, usata nel rendering del componente.
   */
  itemTemplateString: string;
  /**
   * Configurazione di presentazione per item template, usata nel rendering del componente.
   */
  itemTemplate: typeof DynamicGenericTemplateComponent;

  /**
   * Proprieta di stato del componente per title field, usata dalla logica interna e dal template.
   */
  titleField: string = 'title';

  /**
   * Proprieta di stato del componente per image column, usata dalla logica interna e dal template.
   */
  imageColumn: MetadatiColonna | undefined;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a show config dialog.
   */
  showConfigDialog: boolean = false;
  /**
   * Proprieta di stato del componente per page size max, usata dalla logica interna e dal template.
   */
  pageSizeMax: number = 200;
  /**
   * Collezione dati per image field candidates, consumata dal rendering e dalle operazioni del componente.
   */
  imageFieldCandidates: MetadatiColonna[] = [];
  /**
   * Collezione dati per description field candidates, consumata dal rendering e dalle operazioni del componente.
   */
  descriptionFieldCandidates: MetadatiColonna[] = [];
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a config draft.
   */
  configDraft: {
    imageFieldName: string;
    descriptionFieldName: string;
    imageWidth: number;
    pageSize: number;
    itemTemplateString: string;
    numVisible: number;
    numScroll: number;
    usePreview: boolean;
  } = {
      imageFieldName: '',
      descriptionFieldName: '',
      imageWidth: 300,
      pageSize: 10,
      itemTemplateString: '',
      numVisible: 1,
      numScroll: 1,
      usePreview: false
    };
  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: any;
  /**
   * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
   */
  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;
  private itemVisibilityObserver?: IntersectionObserver;
  private visibilitySyncTimer?: ReturnType<typeof setTimeout>;
  @ViewChild('carouselContent') private carouselContentRef?: ElementRef<HTMLElement>;

  /**
   * Inietta servizi usati dal componente per titolo pagina, change detection,
   * route corrente, traduzioni e controllo ruolo admin.
   * @param titleService Servizio Angular `Title`.
   * @param cd `ChangeDetectorRef` per aggiornamenti UI espliciti.
   * @param route Route attiva da cui ricavare il nome route quando non hardcoded.
   * @param trslSrv Servizio traduzioni per messaggi di conferma/successo.
   * @param userInfo Servizio utente per verificare privilegi amministrativi.
   */
  constructor(private titleService: Title, private cd: ChangeDetectorRef, private route: ActivatedRoute, private trslSrv: TranslationManagerService, private userInfo: UserInfoService) { // , private cd: ChangeDetectorRef

    // this.archetypeOptions = new CarouselOptions();
  }

  /**
   * Espone se l'utente corrente ha privilegi amministrativi.
   * @returns `true` se l'utente e admin.
   */

  get isAdmin(): boolean {
    return this.userInfo.isCurrentUserAdmin();
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.routeName = this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '';

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDS();
    } else if (this.datasource && this.datasource.value) {
      this.subscribeToDS();
    } else {
      this.datasourceReadySubscription?.unsubscribe();
      this.datasourceReadySubscription = this.datasource.subscribe((ds) => {
        if (ds) {
          this.datasourceReadySubscription?.unsubscribe();
          this.datasourceReadySubscription = undefined;
          this.subscribeToDS();
        } else {

          // //FOR Designer
        }
      });
    }
  }

  ngAfterViewInit(): void {
    this.scheduleVisibilitySync();
  }

  /**
   * Si sottoscrive a `fetchInfo$` del datasource, inizializza opzioni carousel dai metadati,
   * seleziona i campi immagine/descrizione e carica i record da mostrare.
   * In assenza dati, richiede `fetchData()`.
   */
  subscribeToDS() {
    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = this.datasource.value.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = this.datasource?.value?.route?.value || this.routeName;
      if (info && dataSourceRoute == info.metaInfo?.tableMetadata?.md_route_name) {
        this.metaInfo = info.metaInfo;

        let carouselOptions: any = Object.assign(new CarouselOptions(), info.metaInfo.tableMetadata.extraProps?.archetypes?.carousel || {});

        if (!carouselOptions.imageFieldName) {
          this.imageColumn = info.metaInfo.columnMetadata.find((col) => col.mc_ui_column_type == 'upload' && col.isImageUpload);
          carouselOptions.imageFieldName = this.imageColumn?.mc_nome_colonna;
        } else {
          this.imageColumn = info.metaInfo.columnMetadata.find((col) => col.mc_nome_colonna == carouselOptions.imageFieldName);
        }

        if (!this.imageColumn) {
          // notifica mancanza colonna immagine e esce (non ha senso un carousel senza immagine)
          WtoolboxService.messageNotificationService.add({
            severity: 'error',
            summary: this.trslSrv.instant('error'),
            detail: this.trslSrv.instant('carousel_list.no_image_column')
          });
          return;
        } else if (this.imageColumn.mc_ui_column_type != 'upload' || !this.imageColumn.isImageUpload) {
          // notifica colonna immagine configurata non valida e esce (non ha senso un carousel senza immagine)
          WtoolboxService.messageNotificationService.add({
            severity: 'error',
            summary: this.trslSrv.instant('error'),
            detail: this.trslSrv.instant('carousel_list.invalid_image_column')
          });
          return;
        }

        if (!carouselOptions.descriptionFieldName) {
          carouselOptions.descriptionFieldName = info.metaInfo.columnMetadata.find((col) => col.mc_ui_column_type == 'text')?.mc_nome_colonna;
        }

        if (!carouselOptions.imageWidth) {
          carouselOptions.imageWidth = 300;
        }

        if (!carouselOptions.numScroll) {
          carouselOptions.numScroll = 1;
        }

        if (carouselOptions.itemTemplateString || this.metaInfo.tableMetadata.md_gallery_html_template) {
          this.itemTemplateString = carouselOptions.itemTemplateString || this.metaInfo.tableMetadata.md_gallery_html_template;
          this.itemTemplate = DynamicGenericTemplateComponent.getComponentFromTemplate(this.itemTemplateString || '', 'md_gallery_html_template (carousel item)', String(this.metaInfo?.tableMetadata?.md_route_name || ''));
        } else {
          this.itemTemplateString = '';
          this.itemTemplate = null!;
        }

        carouselOptions.usePreview = carouselOptions.usePreview;

        this.archetypeOptions = carouselOptions;
        this.imageFieldCandidates = info.metaInfo.columnMetadata.filter((col) => col.mc_ui_column_type == 'upload' && col.isImageUpload);
        this.descriptionFieldCandidates = info.metaInfo.columnMetadata.filter((col) => col.mc_ui_column_type == 'text' || col.mc_ui_column_type == 'txt_area');
        this.pageSizeMax = Math.max(1, Number(info.resultInfo?.totalRowCount) || 1);
        this.syncConfigDraftFromOptions();

        let title = this.metaInfo.tableMetadata.md_display_string;

        this.titleService.setTitle(title);

        if (info.resultInfo.dato) {
          if (!carouselOptions.numVisible) {
            carouselOptions.numVisible = Math.min(info.resultInfo.dato.length, Math.floor(document.body.clientWidth / carouselOptions.imageWidth));
          }

          if (!carouselOptions.responsiveOptions || carouselOptions.responsiveOptions.length == 0) {
            carouselOptions.responsiveOptions = [];

            carouselOptions.responsiveOptions.push({
              breakpoint: "1023px",
              numVisible: Math.max(1, Math.min(info.resultInfo.dato.length, Math.floor(1023 / carouselOptions.imageWidth) - 1)),
              numScroll: 1
            });

            carouselOptions.responsiveOptions.push({
              breakpoint: "1279px",
              numVisible: Math.max(1, Math.min(info.resultInfo.dato.length, Math.floor(1279 / carouselOptions.imageWidth) - 1)),
              numScroll: 1
            });

            carouselOptions.responsiveOptions.push({
              breakpoint: "1919px",
              numVisible: Math.max(1, Math.min(info.resultInfo.dato.length, Math.floor(1919 / carouselOptions.imageWidth) - 1)),
              numScroll: 1
            });
          }

          this.data = this.parseData(info.resultInfo.dato);
          this.onCarouselDataBound.emit({
            metaInfo: this.metaInfo,
            data: this.data
          });
          this.scheduleVisibilitySync();
        } else {
          this.datasource.value.fetchData();
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
    this.itemVisibilityObserver?.disconnect();
    if (this.visibilitySyncTimer) {
      clearTimeout(this.visibilitySyncTimer);
      this.visibilitySyncTimer = undefined;
    }
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param dato Collezione in ingresso processata dal metodo.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(dato: any[]) {
    return dato;
  }

  /**
   * Apre il popup di configurazione caricando prima i valori correnti dal `md_props_bag`
   * e sincronizzando la bozza `configDraft`.
   */
  openConfigDialog() {
    if (!this.isAdmin) {
      return;
    }
    this.syncArchetypeOptionsFromPropsBag();
    this.syncConfigDraftFromOptions();
    this.showConfigDialog = true;
  }

  /**
* Applica aggiornamenti di stato tramite `applyConfig` mantenendo coerenti UI e dati.
* @param nextConfig Parametro utilizzato dal metodo nel flusso elaborativo.
*/
  applyConfig(nextConfig?: any) {
    if (!this.archetypeOptions) {
      return;
    }

    const draftConfig = nextConfig || this.configDraft || {};
    const mergedConfig = Object.assign({}, this.archetypeOptions || {}, draftConfig);
    this.archetypeOptions = Object.assign(new CarouselOptions(), mergedConfig);

    this.archetypeOptions.imageWidth = Number(this.archetypeOptions.imageWidth) || 300;
    this.archetypeOptions.pageSize = Number(this.archetypeOptions.pageSize) || this.datasource?.value?.pageSize || 10;
    this.archetypeOptions.itemTemplateString = (this.archetypeOptions.itemTemplateString || '').trim();
    this.archetypeOptions.numVisible = Number(this.archetypeOptions.numVisible) || 1;
    this.archetypeOptions.numScroll = Number(this.archetypeOptions.numScroll) || 1;
    this.archetypeOptions.usePreview = !!this.archetypeOptions.usePreview;

    this.imageColumn = this.metaInfo?.columnMetadata?.find((col) => col.mc_nome_colonna == this.archetypeOptions.imageFieldName);

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {} as any;
    extraProps.archetypes.carousel = Object.assign(
      {},
      extraProps.archetypes.carousel || {},
      this.archetypeOptions
    );
    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);

    if (this.archetypeOptions.itemTemplateString) {
      this.itemTemplateString = this.archetypeOptions.itemTemplateString;
      this.itemTemplate = DynamicGenericTemplateComponent.getComponentFromTemplate(this.itemTemplateString, 'md_gallery_html_template (carousel item)', String(this.metaInfo?.tableMetadata?.md_route_name || ''));
    } else {
      this.itemTemplateString = '';
      this.itemTemplate = null!;
    }

    this.applyPageSizeChange(this.archetypeOptions.pageSize);
    this.showConfigDialog = false;
    this.cd.detectChanges();
    this.scheduleVisibilitySync();
  }

  /**
   * Salva nel metadata tabella (`md_props_bag`) la configurazione carousel corrente
   * e invalida la cache metadata della route.
   * Esegue il salvataggio solo per utenti admin.
   */
  async saveCarouselMetadataPropsBag() {
    if (!this.isAdmin) {
      return;
    }

    this.applyConfig();

    if (!this.metaInfo?.tableMetadata?.md_id) {
      return;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!userId) {
      return;
    }

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {} as any;
    extraProps.archetypes.carousel = Object.assign({}, extraProps.archetypes.carousel || {}, this.archetypeOptions || {});

    const mdPropsBag = JSON.stringify(extraProps);
    const currentTableMetadata = await this.loadCurrentTableMetadataRecord(userId);
    if (!currentTableMetadata) {
      return;
    }

    const entity = Object.assign({}, currentTableMetadata, {
      md_props_bag: mdPropsBag,
      __original: currentTableMetadata
    });

    await WtoolboxService.http.post(MetadataProviderService.updateUri, {
      route: MetadataProviderService.metaTableRoute,
      user_id: userId,
      entity: entity
    }).toPromise();

    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = mdPropsBag;

    await WtoolboxService.http.post(MetadataProviderService.flushCacheUri, {
      route: this.metaInfo.tableMetadata.md_route_name
    }).toPromise();

    WtoolboxService.messageNotificationService.add({
      severity: 'success',
      summary: this.trslSrv.instant('success'),
      detail: this.trslSrv.instant('metadata.table_saved')
    });
  }

  /**
   * Handler della slider page-size: applica il nuovo valore e ricarica il datasource.
   * @param event Evento slider PrimeNG con `value`.
   */
  onPageSizeSlideEnd(event: any) {
    this.applyPageSizeChange(event?.value);
  }

  /**
   * Relay evento pagina p-carousel per sottoscrizione host-side.
   * @param event Payload PrimeNG onPage.
   */
  handleCarouselPage(event: any) {
    this.onCarouselPage.emit(event);
    this.scheduleVisibilitySync();
  }

  /**
   * Relay click item carousel per sottoscrizione host-side.
   * @param item Record item cliccato.
   * @param originalEvent Evento DOM originale.
   */
  handleCarouselItemClick(item: any, originalEvent: Event) {
    this.onCarouselItemClick.emit({ item, originalEvent });
  }

  /**
   * Compila `configDraft.itemTemplateString` con un template HTML suggerito
   * che mostra immagine (preview) e descrizione usando i campi configurati.
   */
  suggestItemTemplate() {
    this.configDraft.itemTemplateString = `<div style="text-align:center;">
  <wuic-image-wrapper
    [preview]="true"
    appendTo="body"
    [src]="getFieldValue(rowData, metaInfo.tableMetadata.extraProps.archetypes.carousel.imageFieldName) | getSrcUploadPreview : findColumn(metaInfo.tableMetadata.extraProps.archetypes.carousel.imageFieldName) : metaInfo : rowData"
    [previewImageSrc]="getFieldValue(rowData, metaInfo.tableMetadata.extraProps.archetypes.carousel.imageFieldName) | getSrcUploadPreview : findColumn(metaInfo.tableMetadata.extraProps.archetypes.carousel.imageFieldName) : metaInfo : rowData"
    [alt]="getFieldValue(rowData, metaInfo.tableMetadata.extraProps.archetypes.carousel.descriptionFieldName)"
    [width]="metaInfo.tableMetadata.extraProps.archetypes.carousel.imageWidth + ''">
  </wuic-image-wrapper>

  <div style="margin-top:8px;">
    {{ getFieldValue(rowData, metaInfo.tableMetadata.extraProps.archetypes.carousel.descriptionFieldName) }}
  </div>
</div>`;
  }

  /**
* Applica aggiornamenti di stato tramite `applyPageSizeChange` preparando/aggiornando il dataset visualizzato.
* @param value Valore in ingresso elaborato o normalizzato dal metodo.
*/
  applyPageSizeChange(value?: number) {
    const ds = this.datasource?.value;
    if (!ds) {
      return;
    }

    const nextPageSize = Math.min(this.pageSizeMax, Math.max(1, Number(value ?? this.configDraft.pageSize) || 10));
    this.configDraft.pageSize = nextPageSize;
    this.archetypeOptions.pageSize = nextPageSize;

    ds.pageSize = nextPageSize;
    ds.currentPage = 1;
    ds.fetchData();
  }

  /**
   * Allinea la bozza `configDraft` alle opzioni effettive del carousel,
   * applicando default e limiti numerici (page size, numVisible, numScroll).
   */
  private syncConfigDraftFromOptions() {
    if (!this.archetypeOptions) {
      return;
    }

    this.configDraft = {
      imageFieldName: this.archetypeOptions.imageFieldName || '',
      descriptionFieldName: this.archetypeOptions.descriptionFieldName || '',
      imageWidth: Number(this.archetypeOptions.imageWidth) || 300,
      pageSize: Math.min(this.pageSizeMax, Math.max(1, Number(this.archetypeOptions.pageSize) || this.datasource?.value?.pageSize || 10)),
      itemTemplateString: this.archetypeOptions.itemTemplateString || '',
      numVisible: Number(this.archetypeOptions.numVisible) || 1,
      numScroll: Number(this.archetypeOptions.numScroll) || 1,
      usePreview: !!this.archetypeOptions.usePreview
    };
  }

  /**
   * Rilegge le opzioni carousel dal `md_props_bag` e le mergea nello stato runtime;
   * aggiorna anche il riferimento alla colonna immagine selezionata.
   */
  private syncArchetypeOptionsFromPropsBag() {
    const carouselFromBag = this.getCarouselPropsFromPropsBag();
    if (!carouselFromBag) {
      return;
    }

    this.archetypeOptions = Object.assign(new CarouselOptions(), this.archetypeOptions || {}, carouselFromBag);
    this.imageColumn = this.metaInfo?.columnMetadata?.find((col) => col.mc_nome_colonna == this.archetypeOptions.imageFieldName);
  }

  /**
   * Estrae la sezione `archetypes.carousel` dal JSON `md_props_bag`.
   * @returns Oggetto configurazione carousel o `null` se assente/non valido.
   */
  private getCarouselPropsFromPropsBag(): any | null {
    try {
      const parsed = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}');
      return parsed?.archetypes?.carousel || null;
    } catch {
      return null;
    }
  }

  /**
   * Mergea le extra props parseate da `md_props_bag` con le `extraProps` correnti in memoria
   * preservando la sezione `archetypes`.
   * @returns Oggetto extraProps mergeato.
   */
  private ensureMergedExtraProps(): any {
    let propsFromBag: any = {};

    try {
      propsFromBag = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}') || {};
    } catch {
      propsFromBag = {};
    }

    const current: any = this.metaInfo?.tableMetadata?.extraProps || {};
    const merged: any = Object.assign({}, propsFromBag, current);
    merged.archetypes = Object.assign({}, propsFromBag?.archetypes || {}, current?.archetypes || {});
    return merged;
  }

  /**
* Carica dati e li armonizza per l'uso nel componente usando i metadati per determinare campi, chiavi e comportamento runtime, allineando i record al formato atteso dal framework, coordinando chiamate verso servizi applicativi.
* @param userId Identificativo tecnico usato per lookup, confronto o aggiornamento mirato.
* @returns Promise che completa il flusso asincrono e restituisce un risultato di tipo `Promise<any | null>`.
*/
  private async loadCurrentTableMetadataRecord(userId: number): Promise<any | null> {
    const payload: any = await WtoolboxService.http.post(
      MetadataProviderService.readUri,
      {
        user_id: userId,
        route: MetadataProviderService.metaTableRoute,
        lookup_table_id: 0,
        SortInfo: [],
        GroupInfo: [],
        PageInfo: { pageSize: 1, currentPage: 1 },
        filterInfo: {
          logic: 'AND',
          filters: [{ field: 'md_id', operatore: 'eq', value: this.metaInfo.tableMetadata.md_id.toString(), fixed: true }]
        },
        logicOperator: 'AND',
        has_server_operation: true,
        aggregates: [],
        columnRestrictionList: [],
        formula_lookup: '',
        mc_id: 0
      }
    ).toPromise();

    return payload?.results?.[0] || null;
  }

  private scheduleVisibilitySync() {
    if (this.visibilitySyncTimer) {
      clearTimeout(this.visibilitySyncTimer);
    }

    this.visibilitySyncTimer = setTimeout(() => {
      this.refreshItemVisibilityObserver();
    }, 0);
  }

  private refreshItemVisibilityObserver() {
    const host = this.carouselContentRef?.nativeElement;
    if (!host) {
      return;
    }

    const viewport = host.querySelector('.p-carousel-viewport') as HTMLElement | null;
    const items = host.querySelectorAll('.p-carousel-item');
    if (!viewport || items.length === 0) {
      this.itemVisibilityObserver?.disconnect();
      return;
    }

    this.itemVisibilityObserver?.disconnect();
    this.itemVisibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          const isVisible = entry.isIntersecting
            && entry.intersectionRect.width > 0
            && entry.intersectionRect.height > 0;
          this.applyItemVisibilityState(element, isVisible);
        }
      },
      {
        root: viewport,
        threshold: [0, 0.0001]
      }
    );

    this.applyImmediateVisibilityState(viewport, items);
    items.forEach((item) => this.itemVisibilityObserver!.observe(item));
  }

  private applyImmediateVisibilityState(viewport: HTMLElement, items: NodeListOf<Element>) {
    const viewportRect = viewport.getBoundingClientRect();
    items.forEach((item) => {
      const element = item as HTMLElement;
      const rect = element.getBoundingClientRect();
      const isVisible =
        rect.right > viewportRect.left &&
        rect.left < viewportRect.right &&
        rect.bottom > viewportRect.top &&
        rect.top < viewportRect.bottom;
      this.applyItemVisibilityState(element, isVisible);
    });
  }

  private applyItemVisibilityState(element: HTMLElement, isVisible: boolean) {
    element.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    element.style.visibility = isVisible ? 'visible' : 'hidden';
  }

}



