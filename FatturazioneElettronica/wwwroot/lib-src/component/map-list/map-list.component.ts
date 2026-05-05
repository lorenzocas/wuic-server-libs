import { NgComponentOutlet } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { GoogleMap, GoogleMapsModule, MapInfoWindow, MapPolygon, MapPolyline } from "@angular/google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { FilterInfo } from '../../class/filterInfo';
import { BehaviorSubject, Subscription } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { MapOptions, Point } from '../../class/mapOptions';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { FilterItem } from '../../class/filterItem';
import { IBindable } from '../../class/IBindable';
import { IDesigner } from '../../class/IDesigner';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { UserInfoService } from '../../service/user-info.service';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { ActivatedRoute } from '@angular/router';
import { ArchetypeConfiguratorComponent } from '../archetype-configurator/archetype-configurator.component';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

// https://developers.google.com/maps/documentation/javascript/examples/style-selector
// https://developers.google.com/maps/documentation/javascript/examples/geocoding-simple
// https://developers.google.com/maps/documentation/javascript/examples/geocoding-reverse
// https://developers.google.com/maps/documentation/javascript/examples/distance-matrix
// https://developers.google.com/maps/documentation/javascript/examples/place-autocomplete-map

// https://developers.google.com/maps/documentation/javascript/examples/drawing-tools
// https://developers.google.com/maps/documentation/javascript/examples/polyline-complex
// https://developers.google.com/maps/documentation/javascript/examples/polygon-arrays
// https://developers.google.com/maps/documentation/javascript/examples/circle-simple
// https://developers.google.com/maps/documentation/javascript/examples/polygon-draggable
// https://developers.google.com/maps/documentation/javascript/examples/user-editable-shapes
// https://developers.google.com/maps/documentation/javascript/examples/maptype-styled-simple
// https://developers.google.com/maps/documentation/javascript/examples/hiding-features#maps_hiding_features-typescript
// https://developers.google.com/maps/documentation/javascript/examples/layer-traffic
// https://developers.google.com/maps/documentation/javascript/examples/directions-complex
// https://developers.google.com/maps/documentation/javascript/examples/geometry-headings
// https://developers.google.com/maps/documentation/javascript/examples/place-text-search

@Component({
  selector: 'wuic-map-list',
  imports: [GoogleMapsModule, NgComponentOutlet, ButtonModule, TranslateModule, ArchetypeConfiguratorComponent],
  templateUrl: './map-list.component.html',
  styleUrl: './map-list.component.css'
})
export class MapListComponent implements OnInit, AfterViewInit, OnDestroy, IBindable, IDesigner<MapOptions>, IDataBoundHostComponent {
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per map.
   */
  @ViewChild(GoogleMap, { static: false }) map: GoogleMap;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per info.
   */
  @ViewChild(MapInfoWindow, { static: false }) info: MapInfoWindow;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per marker elements.
   */
  @ViewChildren('markerElem') markerElements: QueryList<any>;
  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per map host ref.
   */
  @ViewChild('mapHostRef') mapHostRef?: ElementRef<HTMLElement>;

  /**
   * Proprieta di stato del componente per map lib, usata dalla logica interna e dal template.
   */
  MAP_LIB: google.maps.MapsLibrary;
  /**
   * Proprieta di stato del componente per marker lib, usata dalla logica interna e dal template.
   */
  MARKER_LIB: google.maps.MarkerLibrary;
  /**
   * Proprieta di stato del componente per place lib, usata dalla logica interna e dal template.
   */
  PLACE_LIB: google.maps.PlacesLibrary;
  // DRAWING_LIB rimossa 2026-05-03: la drawing library di Maps JavaScript API
  // e' deprecata (announced 2025-08, removed in versions released 2026-05) e
  // gli handler `*complete` di questo componente erano comunque solo
  // `console.log` stub (nessuna logica di feature reale). Vedi
  // PointFilterComponent per un esempio di sostituzione manuale (click+
  // mousemove handler) quando la drawing UX serve davvero.

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
   * Input dal componente padre per hide toolbar; quando true nasconde i controlli toolbar mappa.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Evento emesso su click mappa (google-map mapClick).
   */
  @Output() onMapClick = new EventEmitter<any>();
  /**
   * Evento emesso al drag start di un marker.
   */
  @Output() onMarkerDragStart = new EventEmitter<{ marker: any; event: any }>();
  /**
   * Evento emesso al drag end di un marker.
   */
  @Output() onMarkerDragEnd = new EventEmitter<{ marker: any; event: any; position?: { lat: number; lng: number } }>();
  /**
   * Evento emesso al click su marker.
   */
  @Output() onMarkerClick = new EventEmitter<any>();
  /**
   * Evento emesso al click su poligono.
   */
  @Output() onPolygonClick = new EventEmitter<any>();
  /**
   * Evento emesso quando cambia la shape di un poligono in edit mode.
   */
  @Output() onPolygonShapeChangedEvent = new EventEmitter<{ record: any; polygonIndex: number; vertices: { lat: number; lng: number; }[] }>();
  /**
   * Evento emesso quando il wrapper completa il data-binding marker/poligoni dal datasource.
   */
  @Output() onMapDataBound = new EventEmitter<{ metaInfo: MetaInfo; data: any[] }>();
  /**
   * Evento emesso quando cambiano i bounds correnti della mappa.
   */
  @Output() onMapBoundsChanged = new EventEmitter<{ bounds?: google.maps.LatLngBoundsLiteral | null; center?: google.maps.LatLngLiteral | null; zoom?: number | null }>();
  /**
   * Evento emesso quando cambia il centro mappa.
   */
  @Output() onMapCenterChanged = new EventEmitter<{ center?: google.maps.LatLngLiteral | null; zoom?: number | null }>();
  /**
   * Evento emesso su contextmenu (right click) mappa.
   */
  @Output() onMapContextMenu = new EventEmitter<any>();
  /**
   * Evento emesso durante il drag mappa.
   */
  @Output() onMapDrag = new EventEmitter<any>();
  /**
   * Evento emesso a fine drag mappa.
   */
  @Output() onMapDragEnd = new EventEmitter<any>();
  /**
   * Evento emesso all'avvio drag mappa.
   */
  @Output() onMapDragStart = new EventEmitter<any>();
  /**
   * Evento emesso su movimento mouse sulla mappa.
   */
  @Output() onMapMouseMove = new EventEmitter<any>();
  /**
   * Evento emesso su mouseout dalla mappa.
   */
  @Output() onMapMouseOut = new EventEmitter<any>();
  /**
   * Evento emesso su mouseover sulla mappa.
   */
  @Output() onMapMouseOver = new EventEmitter<any>();
  /**
   * Evento emesso quando viene effettuato un resize logico della mappa.
   */
  @Output() onMapResize = new EventEmitter<{ source: 'window' | 'internal'; heightPx?: number; center?: google.maps.LatLngLiteral | null; zoom?: number | null }>();
  /**
   * Evento emesso quando cambia il livello di zoom mappa.
   */
  @Output() onMapZoomChanged = new EventEmitter<{ zoom?: number | null; center?: google.maps.LatLngLiteral | null }>();

  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo = new MetaInfo();

  /**
   * Collezione dati per archetype options, consumata dal rendering e dalle operazioni del componente.
   */
  archetypeOptions: MapOptions; //google.maps.MapOptions;
  /**
   * Collezione dati per data, consumata dal rendering e dalle operazioni del componente.
   */
  data: any[] = [];

  /**
   * Configurazione di presentazione per item template string, usata nel rendering del componente.
   */
  itemTemplateString: string;
  /**
   * Configurazione di presentazione per item template, usata nel rendering del componente.
   */
  itemTemplate: typeof DynamicGenericTemplateComponent;

  /**
   * Proprieta di stato del componente per center, usata dalla logica interna e dal template.
   */
  center: Point;

  /**
   * Collezione dati per markers, consumata dal rendering e dalle operazioni del componente.
   */
  markers: any[];
  /**
   * Collezione dati per vertex array, consumata dal rendering e dalle operazioni del componente.
   */
  vertexArray: { lat: number; lng: number; }[][];
  /**
   * Collezione dati per circles, consumata dal rendering e dalle operazioni del componente.
   */
  circles: { center: { lat: number; lng: number; }, radius: number }[];

  /**
   * Configurazione di presentazione per info content, usata nel rendering del componente.
   */
  infoContent: string;
  /**
   * Configurazione runtime della info window (es. posizione quando non c'e un anchor marker).
   */
  infoWindowOptions?: google.maps.InfoWindowOptions;
  /**
   * Proprieta di stato del componente per zoom, usata dalla logica interna e dal template.
   */
  zoom: number;
  /**
   * Proprieta di stato del componente per parser, usata dalla logica interna e dal template.
   */
  parser: DOMParser;

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a dragging.
   */
  dragging: boolean = false;
  /**
   * Proprieta di stato del componente per mc, usata dalla logica interna e dal template.
   */
  mc: MarkerClusterer;

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: boolean = false;

  /**
   * Proprieta di stato del componente per bounds, usata dalla logica interna e dal template.
   */
  bounds: google.maps.LatLngBounds;
  /**
   * Valore corrente selezionato per current marker, usato dai flussi interattivi del componente.
   */
  currentMarker: any;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a show config dialog.
   */
  showConfigDialog = false;
  /**
   * Collezione dati per field candidates, consumata dal rendering e dalle operazioni del componente.
   */
  fieldCandidates: MetadatiColonna[] = [];

  /**
   * Flag di stato che governa il comportamento UI/logico relativo a init completed.
   */
  initCompleted: boolean;
  /**
   * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
   */
  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per destroyed, usata dalla logica interna e dal template.
   */
  private destroyed = false;
  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: string;
  /**
   * Proprieta di stato del componente per map host height px, usata dalla logica interna e dal template.
   */
  mapHostHeightPx?: number;
  /**
   * Proprieta di stato del componente per map resize observer, usata dalla logica interna e dal template.
   */
  private mapResizeObserver?: ResizeObserver;
  /**
   * Proprieta di stato del componente per pending map resize handle, usata dalla logica interna e dal template.
   */
  private pendingMapResizeHandle?: number;
  /**
   * Collezione dati per pending map measure timeouts, consumata dal rendering e dalle operazioni del componente.
   */
  private pendingMapMeasureTimeouts: number[] = [];
  /**
   * Proprieta di stato del componente per map host min height, usata dalla logica interna e dal template.
   */
  private readonly mapHostMinHeight = 220;
  /**
   * Proprieta di stato del componente per map bottom padding, usata dalla logica interna e dal template.
   */
  private readonly mapBottomPadding = 16;
  /**
   * Proprieta di stato del componente per map resize pass delays ms, usata dalla logica interna e dal template.
   */
  private readonly mapResizePassDelaysMs = [60, 220];
  /**
   * Proprieta di stato del componente per polygon edit mode, usata dalla logica interna e dal template.
   */
  polygonEditMode = false;
  /**
   * Proprieta di stato del componente per polygon save in progress, usata dalla logica interna e dal template.
   */
  private polygonSaveInProgress = false;
  /**
   * Proprieta di stato del componente per edited polygon keys, usata dalla logica interna e dal template.
   */
  private editedPolygonKeys = new Set<string>();

  /**
   * Proprieta di stato del componente per on window resize, usata dalla logica interna e dal template.
   */
  private readonly onWindowResize = () => {
    this.measureAndResizeMap();
  };

  /**
   * Proprieta di stato del componente per on window scroll, usata dalla logica interna e dal template.
   */
  private readonly onWindowScroll = () => {
    this.updateMapHostHeight();
  };

  // svgString = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#FF5733" stroke="#FFFFFF" viewBox="0 0 24 24">
  // <path fill-rule="evenodd" d="M11.293 3.293a1 1 0 0 1 1.414 0l6 6 2 2a1 1 0 0 1-1.414 1.414L19 12.414V19a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1v-3h-2v3a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2v-6.586l-.293.293a1 1 0 0 1-1.414-1.414l2-2 6-6Z" clip-rule="evenodd"/>
  // </svg>`;
  // beachFlag = "assets/images/beachflag.png";

      /**
       * Inietta i servizi usati dal componente mappa (titolo pagina, change detection, route, ruolo utente e traduzioni).
       * @param titleService Servizio Angular Title usato per aggiornare il titolo pagina con `md_display_string`.
       * @param cd ChangeDetectorRef usato per forzare il refresh dopo update asincroni mappa/dati.
       * @param route Route attiva da cui ricava il nome metadata quando non arriva un datasource hardcoded.
       * @param userInfo Servizio profilo utente usato per verificare privilegi admin.
       * @param trslSrv Servizio traduzioni usato per label e messaggi UI.
       */
  constructor(private titleService: Title, private cd: ChangeDetectorRef, private route: ActivatedRoute, private userInfo: UserInfoService, private trslSrv: TranslationManagerService) {
    this.parser = new DOMParser();
  }

    /**
     * Espone al template se l'utente corrente ha privilegi amministrativi.
     * @returns `true` quando `UserInfoService` identifica l'utente come admin.
     */
  get isAdmin(): boolean {
    return this.userInfo.isCurrentUserAdmin();
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  async ngOnInit() {
    this.loading = true;
    this.routeName = this.hardcodedRoute ? this.hardcodedRoute : this.route.snapshot.paramMap.get('route') || '';
    this.attachLayoutListeners();

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
          this.cd.detectChanges();
        }
      });
    }
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.destroyed = true;
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
    this.mapResizeObserver?.disconnect();
    this.detachLayoutListeners();
    if (typeof window !== 'undefined' && this.pendingMapResizeHandle) {
      window.cancelAnimationFrame(this.pendingMapResizeHandle);
      this.pendingMapResizeHandle = undefined;
    }
    this.clearPendingMapMeasureTimeouts();
    this.markerElementsChangesSub?.unsubscribe();
    this.detachAllMarkerGmpClick();
  }

  // === gmp-click wiring (manual replacement of `(mapClick)`) =================
  // Background — 2026-05-03: @angular/google-maps@21.x espone l'output
  // `mapClick` su `<map-advanced-marker>` come `getLazyEmitter('click')`,
  // che corrisponde all'evento `click` del Google Maps event bus. Su
  // AdvancedMarkerElement, Google ha deprecato `click` in favore del custom
  // event DOM `gmp-click`. Finche' `@angular/google-maps` non fa la migrazione
  // (segnalato upstream), bypassiamo `(mapClick)` nel template e ci attacchiamo
  // direttamente all'evento `gmp-click` sull'elemento sottostante.

  /** Cleanup function per ogni listener gmp-click attivo. */
  private markerGmpClickCleanups: Array<() => void> = [];
  /** Subscription a `markerElements.changes`. */
  private markerElementsChangesSub?: { unsubscribe: () => void };

  ngAfterViewInit(): void {
    if (!this.markerElements) { return; }
    // Wire iniziale (marker gia' presenti al view init).
    this.wireMarkerGmpClick();
    // Re-wire ad ogni cambiamento del set di marker (data refresh).
    this.markerElementsChangesSub = this.markerElements.changes.subscribe(() => {
      this.wireMarkerGmpClick();
    });
  }

  /**
   * Iterazione `markerElements` ↔ `data.filter(__marker)` in parallelo
   * (stesso ordine di rendering). Per ogni AdvancedMarkerElement:
   *  - removeEventListener su quello vecchio (cleanup);
   *  - addEventListener('gmp-click', ...) sul nuovo, capturando record/marker
   *    nello scope per chiamare `openInfo` esattamente come faceva
   *    `(mapClick)="openInfo(markerElem, record.__marker)"`.
   */
  private wireMarkerGmpClick(): void {
    this.detachAllMarkerGmpClick();
    if (!this.markerElements || !this.data) { return; }

    const markersInOrder = this.markerElements.toArray();
    const recordsWithMarker = this.data.filter((r: any) => r && r.__marker);

    const n = Math.min(markersInOrder.length, recordsWithMarker.length);
    for (let i = 0; i < n; i++) {
      const markerElem = markersInOrder[i];
      const record = recordsWithMarker[i];
      const advancedMarker: any = markerElem?.advancedMarker;
      if (!advancedMarker || typeof advancedMarker.addEventListener !== 'function') { continue; }

      const handler = () => this.openInfo(markerElem, record.__marker);
      advancedMarker.addEventListener('gmp-click', handler);
      this.markerGmpClickCleanups.push(() => {
        try { advancedMarker.removeEventListener('gmp-click', handler); } catch { /* DOM gone */ }
      });
    }
  }

  private detachAllMarkerGmpClick(): void {
    for (const cleanup of this.markerGmpClickCleanups) {
      try { cleanup(); } catch { /* swallow */ }
    }
    this.markerGmpClickCleanups = [];
  }
  // === end gmp-click wiring ==================================================

          /**
           * Si sottoscrive a `fetchInfo$` del datasource, aggiorna metadati/viewport e inizializza Google Maps al primo caricamento.
           * Nei caricamenti successivi ripopola marker/poligoni e aggiorna clusterer e resize pass.
           */
  async subscribeToDS() {
    let self = this;

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = self.datasource.value.fetchInfo$.subscribe(async (info) => {
      if (this.destroyed) {
        return;
      }

      const dataSourceRoute = this.datasource?.value?.route?.value || this.routeName;
      if (info && dataSourceRoute == info.metaInfo?.tableMetadata?.md_route_name) {
        if (!this.initCompleted) {
          this.loading = true;
        }
        this.startMapResizeObserver();
        this.scheduleMapResizePasses();
        self.metaInfo = info.metaInfo;
        this.fieldCandidates = info.metaInfo.columnMetadata || [];
        this.syncMapViewportFromMeta(info.metaInfo);

        let title = self.metaInfo.tableMetadata.md_display_string;

        self.titleService.setTitle(title);

        if (!self.initCompleted) {
          // Drawing library NON piu' importata: deprecata da Maps JavaScript
          // API (annunciato 2025-08, rimossa in versioni rilasciate 2026-05).
          // Gli handler `*complete` su `drawingManager` di sotto erano solo
          // `console.log` stub — nessuna feature reale persa.
          const [mapsLib, markerLib, placeLib] = await Promise.all([
            google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
            google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
            google.maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>
          ]);
          this.MAP_LIB = mapsLib;
          this.MARKER_LIB = markerLib;
          this.PLACE_LIB = placeLib;

          await this.initMap(info.metaInfo);
          this.scheduleMapResizePasses();

          self.datasource.value.fetchData();
        } else {
          this.syncMapViewportFromMeta(info.metaInfo);

          self.bounds = new google.maps.LatLngBounds();

          if (!self.center && !self.zoom && !this.archetypeOptions.filterByBoundaries) {
            self.map.fitBounds(self.bounds);
          }

          self.data = self.parseData(info.resultInfo.dato);
          this.onMapDataBound.emit({
            metaInfo: self.metaInfo,
            data: self.data
          });

          if (this.archetypeOptions.useClusterer) {
            setTimeout(() => {
              // Clear previous clusterer to remove old markers from the map
              if (self.mc) {
                self.mc.clearMarkers();
                self.mc.setMap(null);
              }
              self.mc = new MarkerClusterer({ markers: self.markerElements.toArray().map(x => x.advancedMarker), map: self.map.googleMap });
              this.scheduleMapResizePasses();
              this.loading = false;
              self.cd.detectChanges();
            }, 1000);
          } else {
            this.scheduleMapResizePasses();
            this.loading = false;
            self.cd.detectChanges();
          }

        }
      }
    });
  }

            /**
             * Converte i bounds correnti della mappa in una geometria WKT `POLYGON` (ordine SW->NE).
             * @param bounds Bounding box Google Maps da serializzare.
             * @returns Stringa WKT usata nei filtri spaziali lato datasource.
             */
  boundsToPolyline(bounds: google.maps.LatLngBounds) {
    let ne = bounds.getNorthEast();
    let sw = bounds.getSouthWest();

    return `POLYGON ((${sw.lng()} ${sw.lat()}, ${ne.lng()} ${sw.lat()}, ${ne.lng()} ${ne.lat()}, ${sw.lng()} ${ne.lat()}, ${sw.lng()} ${sw.lat()}))`;
  }

            /**
   * Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
   * @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
   */
  parseData(data: any) {
    let self = this;

    let metaInfo = self.metaInfo;
    let bounds = self.bounds;

    let vertexArray = [];

    let geoFields = metaInfo.columnMetadata.filter(col => col.mc_ui_column_type == 'point' || col.mc_ui_column_type == 'polygon');
    if (geoFields.length > 0) {
      let markerfield = geoFields.find(col => col.mc_ui_column_type == 'point');
      let polygonfield = geoFields.find(col => col.mc_ui_column_type == 'polygon');

      let position;

      data.forEach((record) => {

        if (markerfield) {
          if (record[markerfield.mc_nome_colonna]) {
            position = JSON.parse(record[markerfield.mc_nome_colonna]);

            bounds.extend(position);

            record.__marker = {
              position: position,
              draggable: false,
              label: {
                color: 'red',
                text: 'label'
              },
              title: self.getRecordFieldValue(record, self.archetypeOptions.titleField),
              info: self.getRecordFieldValue(record, self.archetypeOptions.infoField),
              record: JSON.parse(JSON.stringify(record)),
              content: self.getMarkerContent(record),//this.parser.parseFromString(this.svgString, "image/svg+xml").documentElement,
              options: {
                collisionBehavior: self.MARKER_LIB.CollisionBehavior.REQUIRED,
              }
            }

          }
        }

        if (polygonfield) {
          if (record[polygonfield.mc_nome_colonna]) {
            const rings = this.parsePolygonRings(record[polygonfield.mc_nome_colonna]);
            if (rings.length > 0) {
              // Extend bounds with every vertex of every ring so the auto-fit
              // viewport keeps including disjoint sub-polygons (islands, exclaves).
              for (const ring of rings) {
                for (const p of ring) {
                  bounds.extend(p);
                }
              }

              record.__polygon = {
                // `paths` is the canonical multi-ring shape consumed by
                // <map-polygon [paths]>: a LatLngLiteral[][] supports both
                // disjoint sub-polygons and holes natively.
                paths: rings,
                // `vertices` is preserved as the FIRST ring only, for backward
                // compatibility with the polygon edit mode (which operates on
                // single-ring polygons via getPath()).
                vertices: rings[0],
                title: self.getRecordFieldValue(record, self.archetypeOptions.titleField),
                info: self.getRecordFieldValue(record, self.archetypeOptions.infoField),
                record: JSON.parse(JSON.stringify(record)),
                options: {
                  fillColor: '#FF5733',
                  geodesic: true,
                  editable: this.polygonEditMode,
                  draggable: this.polygonEditMode
                }
              }
            }
          }
        }
      });

      return data;
    }
  }

            /**
   * Recupera i dati/valori richiesti da `getMarkerContent`.
   * @param record Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @returns Valore risolto da `getMarkerContent` in base ai criteri implementati.
   */
  getMarkerContent(record: any) {
    if (this.archetypeOptions && record) {
      if (this.archetypeOptions.customMarkerImageSrcField) {
        let imgTag = document.createElement("img");
        imgTag.src = record[this.archetypeOptions.customMarkerImageSrcField];
        return imgTag;
      } else if (this.archetypeOptions.customMarkerImageSrc) {
        //va istanziato un elemento img per ogni marker
        let imgTag = document.createElement("img");
        imgTag.src = this.archetypeOptions.customMarkerImageSrc;
        return imgTag;
      } else if (this.archetypeOptions.markerContentCallback) {
        // skills/typed-localized-exceptions: user-supplied JS dal metadata
        // → typed `errors.client.user_callback.failed` su throw, niente
        // silent fail (marker mancanti senza dialog).
        return WtoolboxService.runUserCallbackSync(
          'archetypes.map.markerContentCallback',
          () => new Function('record', this.archetypeOptions.markerContentCallback)(record),
          [],
          { archetype: 'map', route: this.metaInfo?.tableMetadata?.md_route_name }
        );
      }
    }
    return undefined;
  }

          /**
           * Restituisce una Promise che wrappa `navigator.geolocation.getCurrentPosition`.
           * @returns Posizione geolocalizzata del browser oppure errore se non disponibile/negata.
           */
  async getCurrentPositionAsync(): Promise<GeolocationPosition | null> {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position);
        },
        () => {
          resolve(null);
        },
        { timeout: 5000, maximumAge: 60000, enableHighAccuracy: false }
      );
    });
  }

      /**
       * Inizializza opzioni mappa/overlay partendo dai metadati tabella e prepara callback di interazione marker/poligoni.
       * @param metaInfo Metadati della route usati per leggere `md_props_bag` e campi geografici.
       */
  async initMap(metaInfo: MetaInfo): Promise<void> {

    let mapOptions = Object.assign(new MapOptions(), metaInfo.tableMetadata.extraProps?.archetypes?.map || {});

    if (!mapOptions.mapId) {
      mapOptions.mapId = WtoolboxService.uuidv4();
    }

    if (mapOptions.filterByBoundaries && !mapOptions.minZoom) {
      mapOptions.minZoom = 3;
    }

    if (mapOptions.itemTemplateString || this.metaInfo.tableMetadata.md_map_html_template) {
      this.itemTemplateString = mapOptions.itemTemplateString || this.metaInfo.tableMetadata.md_map_html_template;
    }

    const template = this.itemTemplateString || MetadataProviderService.widgetDefinition.mapEventTemplate;

    const component = DynamicGenericTemplateComponent.getComponentFromTemplate(template || '', 'md_props_bag.archetypes.map.itemTemplate', String(this.metaInfo?.tableMetadata?.md_route_name || ''));

    this.itemTemplate = component;

    this.infoContent = '';
    this.zoom = mapOptions.zoom || 10;
    const fallbackCenter = {
      lat: 41.9028,
      lng: 12.4964
    };
    let currentPositionCenter = fallbackCenter;
    if (mapOptions.useCurrentLocation) {
      const position = await this.getCurrentPositionAsync();
      if (position) {
        currentPositionCenter = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      }
    }

    if (mapOptions.useCurrentLocation) {
      this.center = currentPositionCenter as any;
    } else {
      this.center = (mapOptions.center?.lat && mapOptions.center?.lng) ? mapOptions.center : {
        lat: currentPositionCenter.lat,
        lng: currentPositionCenter.lng,
      } as any;
    }

    mapOptions.center = this.center;

    // this.markers = [];

    // this.addMarker();

    this.vertexArray = [];

    // this.vertexArray = [
    //   [
    //     { lat: 13, lng: 13 },
    //     { lat: -13, lng: 0 },
    //     { lat: 13, lng: -13 },
    //   ]
    // ];

    // this.circles = [
    //   { center: { lat: 24, lng: 22 }, radius: 300000 },
    //   { center: { lat: 13, lng: 13 }, radius: 100000 }
    // ];

    this.archetypeOptions = mapOptions;

    let self = this;

    return new Promise(async (resolve) => {
      this.cd.detectChanges();
      const ready = await this.waitForGoogleMapReady();
      if (!ready) {
        this.loading = false;
        this.cd.detectChanges();
        resolve();
        return;
      }

      self.bounds = new google.maps.LatLngBounds();

      const debouncedHandler = self.debounce(self.filterByBoundaries.bind(self), 1000);

      if (this.archetypeOptions.filterByBoundaries) {
        google.maps.event.addListener(self.map.googleMap, 'dragend', debouncedHandler.bind(self));

        google.maps.event.addListener(self.map.googleMap, 'zoom_changed', debouncedHandler.bind(self));
      }

      // 2026-05-03: rimossa la drawing toolbar. Era basata su
      // `google.maps.drawing.DrawingManager` (libreria Maps JavaScript API
      // deprecata 2025-08, rimossa in versioni rilasciate 2026-05) e tutti i
      // suoi event handler (circlecomplete / polygoncomplete / rectanglecomplete
      // / polylinecomplete / markercomplete) erano solo `console.log` stub —
      // niente feature reale dietro. La rimozione elimina il warning
      // "Drawing library functionality in the Maps JavaScript API is
      // deprecated" e non rompe nessun flusso utente esistente.
      // Per filtri spaziali (polygon area / circle distance) interattivi vedi
      // `PointFilterComponent` che implementa il drawing manualmente con
      // listener click/mousemove/dblclick sulla mappa.

      if (self.archetypeOptions.filterByBoundaries) {
        // google.maps.Map.getBounds() can return null/undefined until the map fires
        // its first 'idle' event. Skip the initial filter apply in that case: the
        // dragend/zoom_changed listeners installed above will re-apply the filter
        // as soon as a usable bounds becomes available.
        let boundaries = self.map.getBounds();

        if (boundaries) {
          let pointField = self.metaInfo.columnMetadata.find(col => col.mc_ui_column_type == 'point' || col.mc_ui_column_type == 'polygon');
          if (pointField) {
            self.datasource.value.filterInfo = new FilterInfo('AND', [
              new FilterItem({ field: pointField.mc_nome_colonna, operator: 'maparea', value: self.boundsToPolyline(boundaries), fixed: true }),
            ]);
          }
        }
      }

      this.initCompleted = true;
      google.maps.event.addListenerOnce(this.map.googleMap, 'idle', () => {
        this.loading = false;
        this.cd.detectChanges();
      });

      self.cd.detectChanges();
      this.scheduleMapResizePasses();

      resolve();
    });
  }

          /**
           * Apre il dialog di configurazione mappa pre-caricando i valori correnti da `md_props_bag`.
           * All'applicazione salva e ricarica le opzioni per riflettere subito la configurazione in UI.
           */
  openMapConfig() {
    if (!this.isAdmin) {
      return;
    }
    this.syncArchetypeOptionsFromPropsBag();
    this.showConfigDialog = true;
  }

            /**
   * Applica aggiornamenti di stato tramite `applyMapConfig` mantenendo coerenti UI e dati.
   * @param nextConfig Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  async applyMapConfig(nextConfig?: any) {
    if (!this.archetypeOptions || !this.metaInfo?.tableMetadata) {
      return;
    }

    const incoming = nextConfig || {};
    const mergedConfig: any = Object.assign({}, this.archetypeOptions || {}, incoming || {});

    mergedConfig.mapId = (mergedConfig.mapId || '').trim() || this.archetypeOptions.mapId;
    mergedConfig.zoom = Number(mergedConfig.zoom) || this.archetypeOptions.zoom || 10;
    mergedConfig.minZoom = Number(mergedConfig.minZoom) || this.archetypeOptions.minZoom || 1;
    mergedConfig.maxZoom = Number(mergedConfig.maxZoom) || this.archetypeOptions.maxZoom || 20;
    mergedConfig.center = mergedConfig.center || this.archetypeOptions.center || new Point();

    this.archetypeOptions = Object.assign(new MapOptions(), mergedConfig);

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {} as any;
    extraProps.archetypes.map = Object.assign(
      {},
      extraProps.archetypes.map || {},
      this.archetypeOptions
    );
    this.metaInfo.tableMetadata.extraProps = extraProps;
    (this.metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);

    console.log('[MapList] Injected archetype.map JSON:', JSON.stringify(extraProps.archetypes.map, null, 2));
    console.log('[MapList] md_props_bag JSON snapshot:', (this.metaInfo.tableMetadata as any).md_props_bag);

    this.zoom = this.archetypeOptions.zoom;
    if (this.archetypeOptions.center?.lat && this.archetypeOptions.center?.lng) {
      this.center = {
        lat: this.archetypeOptions.center.lat,
        lng: this.archetypeOptions.center.lng
      } as any;
    }

    if (this.archetypeOptions.itemTemplateString || this.metaInfo.tableMetadata.md_map_html_template) {
      this.itemTemplateString = this.archetypeOptions.itemTemplateString || this.metaInfo.tableMetadata.md_map_html_template;
    } else {
      this.itemTemplateString = '';
    }

    const template = this.itemTemplateString || MetadataProviderService.widgetDefinition.mapEventTemplate;
    this.itemTemplate = DynamicGenericTemplateComponent.getComponentFromTemplate(template || '', 'md_props_bag.archetypes.map.itemTemplate', String(this.metaInfo?.tableMetadata?.md_route_name || ''));

    this.showConfigDialog = false;
    await this.datasource?.value?.fetchData();
  }

          /**
           * Persiste in `_Metadati_Tabelle.md_props_bag` le opzioni mappa correnti (zoom, center, cluster, campi marker/polygon).
           * @returns `true` se il salvataggio metadata va a buon fine.
           */
  async saveMapMetadataPropsBag() {
    if (!this.isAdmin) {
      return;
    }

    await this.applyMapConfig();

    if (!this.metaInfo?.tableMetadata?.md_id) {
      return;
    }

    const userId = this.userInfo.getuserInfo()?.user_id;
    if (!userId) {
      return;
    }

    const extraProps = this.ensureMergedExtraProps();
    extraProps.archetypes = extraProps.archetypes || {} as any;
    extraProps.archetypes.map = Object.assign({}, extraProps.archetypes.map || {}, this.archetypeOptions || {});

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
           * Legge `md_props_bag`, estrae le chiavi mappa e le mergea in `archetypeOptions` mantenendo default runtime.
           */
  private syncArchetypeOptionsFromPropsBag() {
    const mapFromBag = this.getMapPropsFromPropsBag();
    if (!mapFromBag) {
      return;
    }

    this.archetypeOptions = Object.assign(new MapOptions(), this.archetypeOptions || {}, mapFromBag);
  }

  /**
   * Estrae da `md_props_bag` il nodo configurazione mappa (`archetypes.map`) usato per viewport/opzioni runtime.
   * @returns Props mappa deserializzate oppure `null` se assenti/non valide.
   */
  private getMapPropsFromPropsBag(): any | null {
    try {
      const parsed = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}');
      return parsed?.archetypes?.map || null;
    } catch {
      return null;
    }
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

          /**
           * Unisce proprieta extra (input parent + props bag) in un unico oggetto opzioni usato dal renderer mappa.
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
           * Allinea `center` e `zoom` del componente ai valori metadata quando presenti e validi.
           */
  private syncMapViewportFromMeta(metaInfo: MetaInfo) {
    const mapOptions = metaInfo?.tableMetadata?.extraProps?.archetypes?.map;
    if (!mapOptions) {
      return;
    }

    const center = mapOptions.center;
    if (center) {
      const lat = Number(center.lat);
      const lng = Number(center.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        this.center = { lat, lng } as any;
        if (this.archetypeOptions) {
          this.archetypeOptions.center = this.center as any;
        }
        if (this.map?.googleMap) {
          this.map.googleMap.setCenter(this.center as any);
        }
      }
    }

    const zoom = Number(mapOptions.zoom);
    if (Number.isFinite(zoom) && zoom > 0) {
      this.zoom = zoom;
      if (this.archetypeOptions) {
        this.archetypeOptions.zoom = zoom;
      }
      if (this.map?.googleMap) {
        this.map.googleMap.setZoom(zoom);
      }
    }
  }

            /**
             * Restituisce una funzione debounced che posticipa l'esecuzione finche non scade l'intervallo.
             * @param fn Callback da ritardare.
             * @param delay Ritardo in millisecondi.
             */
  debounce(callback, waitTime) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        callback(...args);
      }, waitTime);
    };
  }

          /**
           * Applica al datasource un filtro spaziale usando il poligono dei bounds correnti, poi ricarica i dati mappa.
           */
  filterByBoundaries() {
    if (this.destroyed) {
      return;
    }

    // Defensive: getBounds() can return null/undefined if the map is not ready yet
    // (e.g. invoked from a deferred handler before any 'idle' event). Skip the
    // refetch instead of crashing on bounds.getNorthEast() inside boundsToPolyline.
    let bounds = this.map?.googleMap?.getBounds?.();
    if (!bounds) {
      return;
    }

    let pointField = this.metaInfo.columnMetadata.find(col => col.mc_ui_column_type == 'point' || col.mc_ui_column_type == 'polygon');
    if (pointField) {

      this.datasource.value.filterInfo = new FilterInfo('AND', [
        new FilterItem({ field: pointField.mc_nome_colonna, operator: 'maparea', value: this.boundsToPolyline(bounds), fixed: true }),
      ]);
      this.datasource.value.fetchData();
    }
  }

          /**
           * Incrementa lo zoom della mappa di uno step.
           */
  zoomIn() {
    if (this.zoom < this.archetypeOptions.maxZoom) this.zoom++;
  }

          /**
           * Decrementa lo zoom della mappa di uno step.
           */
  zoomOut() {
    if (this.zoom > this.archetypeOptions.minZoom) this.zoom--;
  }

          /**
           * Scrive in console il centro mappa corrente per debug configurazione viewport.
           */
  logCenter() {
    console.log(JSON.stringify(this.map.getCenter()));
  }

          /**
           * Utility di debug rapido richiamata da azioni sviluppo.
           */
  hello($event: any) {
    this.onMapClick.emit($event);
    console.log("Hello, you are dragging the marker");
  }

  /**
   * Relay evento bounds changed della mappa.
   */
  handleMapBoundsChanged(): void {
    const mapRef = this.map?.googleMap;
    const center = mapRef?.getCenter?.();
    const bounds = mapRef?.getBounds?.();
    this.onMapBoundsChanged.emit({
      bounds: bounds ? bounds.toJSON() : null,
      center: center ? center.toJSON() : null,
      zoom: mapRef?.getZoom?.() ?? null
    });
  }

  /**
   * Relay evento center changed della mappa.
   */
  handleMapCenterChanged(): void {
    const mapRef = this.map?.googleMap;
    const center = mapRef?.getCenter?.();
    this.onMapCenterChanged.emit({
      center: center ? center.toJSON() : null,
      zoom: mapRef?.getZoom?.() ?? null
    });
  }

  /**
   * Relay evento contextmenu (right click) della mappa.
   */
  handleMapContextMenu($event: any): void {
    this.onMapContextMenu.emit($event);
  }

  /**
   * Relay evento drag della mappa.
   */
  handleMapDrag($event: any): void {
    this.onMapDrag.emit($event);
  }

  /**
   * Relay evento dragend della mappa.
   */
  handleMapDragEnd($event: any): void {
    this.onMapDragEnd.emit($event);
  }

  /**
   * Relay evento dragstart della mappa.
   */
  handleMapDragStart($event: any): void {
    this.onMapDragStart.emit($event);
  }

  /**
   * Relay evento mousemove della mappa.
   */
  handleMapMouseMove($event: any): void {
    this.onMapMouseMove.emit($event);
  }

  /**
   * Relay evento mouseout della mappa.
   */
  handleMapMouseOut($event: any): void {
    this.onMapMouseOut.emit($event);
  }

  /**
   * Relay evento mouseover della mappa.
   */
  handleMapMouseOver($event: any): void {
    this.onMapMouseOver.emit($event);
  }

  /**
   * Relay evento zoom changed della mappa.
   */
  handleMapZoomChanged(): void {
    const mapRef = this.map?.googleMap;
    const center = mapRef?.getCenter?.();
    this.onMapZoomChanged.emit({
      zoom: mapRef?.getZoom?.() ?? null,
      center: center ? center.toJSON() : null
    });
  }

          /**
           * Aggiunge/aggiorna il marker del record corrente nel punto cliccato e propaga il nuovo valore nel datasource.
           */
  addMarkerOnClick(event: any) {
    if (!this.dragging) {

      //// HTML IMAGE
      // let imgTag = document.createElement("img");
      // imgTag.src = this.beachFlag;
      // var content = imgTag;

      //// HTML DIV
      // const priceTag = document.createElement('div');
      // priceTag.className = 'price-tag';
      // priceTag.textContent = '$2.5M';
      // var content = priceTag;

      //// SVG
      // var content = this.parser.parseFromString(this.svgString, "image/svg+xml").documentElement;

      //// A marker with a custom SVG glyph.
      // const glyphImg = document.createElement('img');
      // glyphImg.src = 'https://developers.google.com/maps/documentation/javascript/examples/full/images/google_logo_g.svg';
      // const glyphSvgPinElement = new PinElement({
      //     glyph: glyphImg,
      // });
      // var content = glyphSvgPinElement.element;

      //// A marker customized using a place icon and color, name, and geometry.
      // const place = new Place({
      //   id: 'ChIJN5Nz71W3j4ARhx5bwpTQEGg',
      // });
      // // Call fetchFields, passing the desired data fields.
      // await place.fetchFields({ fields: ['location', 'displayName', 'svgIconMaskURI', 'iconBackgroundColor'] });
      // const pinElement = new PinElement({
      //   background: place.iconBackgroundColor,
      //   glyph: new URL(String(place.svgIconMaskURI)),
      // });
      // var content = pinElement.element;

      // // A marker using a Font Awesome icon for the glyph.
      // const icon = document.createElement('div');
      // icon.innerHTML = '<i class="fa fa-pizza-slice fa-lg"></i>';
      // const faPin = new PinElement({
      //   glyph: icon,
      //   glyphColor: '#ff8300',
      //   background: '#FFD514',
      //   borderColor: '#ff8300',
      // });
      // var content = faPin.element;

      // PIN ELEMENT
      // 2026-05-03: `glyph` deprecato (Maps JavaScript API). Per stringhe di
      // testo va usato `glyphText`; per URL/HTMLElement va usato `glyphSrc` o
      // si costruisce direttamente un `PinElement` con il content. Qui passiamo
      // un singolo carattere → `glyphText`.
      const pinModded = new google.maps.marker.PinElement({
        scale: 2,
        background: '#FBBC04',
        borderColor: '#137333',
        glyphColor: 'white',
        glyphText: 'T',
      } as google.maps.marker.PinElementOptions);
      // 2026-05-03: `<gmp-pin>.element` deprecato. Per assegnare il PinElement
      // come content di un AdvancedMarkerElement non serve estrarre `.element`:
      // si passa direttamente l'istanza del PinElement (la libreria la
      // converte internamente). Manteniamo la variabile `content` come
      // HTMLElement-compatibile (PinElement implementa il contract necessario).
      let content = pinModded as unknown as HTMLElement;

      this.markers.push(
        {
          position: event.latLng.toJSON(),
          draggable: false,
          label: {
            color: 'red',
            text: 'Marker label ' + (this.markers.length + 1),
          },
          title: 'Marker title ' + (this.markers.length + 1),
          info: 'Marker info ' + (this.markers.length + 1),
          // content: this.parser.parseFromString(this.svgString, "image/svg+xml").documentElement,
          content: content,
          options: {
            collisionBehavior: this.MARKER_LIB.CollisionBehavior.REQUIRED,
          },
        });

      setTimeout(() => {
        this.mc.addMarker(this.markerElements.last.advancedMarker);
      }, 1000);
    }
  }

            /**
             * Imposta il flag di trascinamento per evitare collisioni con altre interazioni UI durante il drag.
             */
  mapDragstart(markerElem, marker, $event) {
    this.dragging = true;
    this.onMarkerDragStart.emit({ marker, event: $event });
    console.log("mapDragstart", $event.latLng.toJSON());
  }

            /**
             * Rimuove il flag di trascinamento e, se necessario, sincronizza lo stato dopo il rilascio.
             */
  async mapDragend(markerElem, marker, $event) {
    const draggedPosition = $event?.latLng?.toJSON ? $event.latLng.toJSON() : null;
    this.onMarkerDragEnd.emit({
      marker,
      event: $event,
      position: draggedPosition || undefined
    });
    console.log("mapDragend", draggedPosition);
    $event?.domEvent?.stopPropagation?.();
    $event?.domEvent?.preventDefault?.();
    if ($event?.domEvent) {
      $event.domEvent.cancelBubble = true;
    }

    if (draggedPosition) {
      await this.saveDraggedMarkerPosition(marker, draggedPosition);
    }

    setTimeout(() => {
      this.dragging = false;
    }, 100);
  }

          /**
           * Helper di debug che stampa in console i dati marker correnti.
           */
  testMarker() {
    this.markerElements.forEach((marker) => {
      console.log(marker);
    });
  }

          /**
   * Applica aggiornamenti di stato tramite `setAllDraggable` con il flusso specifico definito dalla sua implementazione.
   */
  setAllDraggable() {
    this.markerElements.forEach((marker) => {
      marker.advancedMarker.gmpDraggable = true;
    });
  }

  /**
   * Verifica se la route corrente espone almeno una colonna metadata di tipo `polygon`.
   * @returns `true` se il layer poligoni e disponibile.
   */
  hasPolygonField(): boolean {
    return !!this.getPolygonMetadataColumn();
  }

      /**
       * Mostra il comando di drag marker solo quando esiste un campo `point` modificabile.
       */
  showMarkerDragButton(): boolean {
    return !!this.getPointMetadataColumn() && !this.hasPolygonField();
  }

      /**
       * Mostra il comando edit poligoni solo quando e presente una colonna `polygon`.
       */
  showPolygonEditButton(): boolean {
    return this.hasPolygonField() && !this.getPointMetadataColumn();
  }

          /**
           * Attiva/disattiva l'edit mode dei poligoni aggiornando opzioni `editable/draggable` sugli overlay.
           */
  async togglePolygonEditing() {
    if (!this.hasPolygonField()) {
      return;
    }

    if (!this.polygonEditMode) {
      this.polygonEditMode = true;
      this.editedPolygonKeys.clear();
      this.setPolygonEditability(true);
      this.cd.detectChanges();
      return;
    }

    await this.saveEditedPolygons();
    this.polygonEditMode = false;
    this.editedPolygonKeys.clear();
    this.setPolygonEditability(false);
    this.cd.detectChanges();
  }

            /**
             * Marca il poligono come modificato e aggiorna la geometria record dopo edit/drag vertici.
             */
  onPolygonShapeChanged(polygonElem: MapPolygon, record: any, polygonIndex: number) {
    if (!this.polygonEditMode || !polygonElem || !record?.__polygon) {
      return;
    }

    // Edit mode currently supports single-ring polygons only: we re-read the
    // first ring via getPath() and serialize it back as POLYGON((...)). For
    // multi-ring inputs (MULTIPOLYGON, polygons with holes) the rendered shape
    // is correct but a save would collapse it to the outer ring of the first
    // sub-polygon. The polygon edit toolbar is hidden by getPolygonEditButton
    // when this would be lossy; this guard is just defensive.
    const vertices = this.getVerticesFromMapPolygon(polygonElem);
    if (!vertices.length) {
      return;
    }

    record.__polygon.vertices = vertices;
    record.__polygon.paths = [vertices];
    record.__polygon.record = record.__polygon.record || {};
    const polygonField = this.getPolygonMetadataColumn();
    if (polygonField?.mc_nome_colonna) {
      record.__polygon.record[polygonField.mc_nome_colonna] = this.verticesToPolygonWkt(vertices);
    }

    this.editedPolygonKeys.add(this.getPolygonEditKey(record, polygonIndex));
    this.onPolygonShapeChangedEvent.emit({
      record,
      polygonIndex,
      vertices
    });
  }

            /**
             * Apre l'info window del marker selezionato valorizzando `infoContent` con il template record.
             */
  openInfo(markerElem, marker) {
    ////se il marker ha com content un HTML element -> marker.content per accedere al dom

    this.currentMarker = marker;
    this.onMarkerClick.emit(marker);
    this.infoWindowOptions = undefined;

    this.info.open(markerElem);

    this.cd.detectChanges();
  }

  /**
   * Apre la stessa info window usata dai marker quando l'utente clicca un poligono.
   * Se non e disponibile un anchor marker, usa la posizione click o il centro geometrico del poligono.
   */
  openPolygonInfo(polygonData: any, $event?: google.maps.PolyMouseEvent) {
    if (!polygonData) {
      return;
    }
    this.onPolygonClick.emit({ polygon: polygonData, event: $event });

    const position = this.resolvePolygonInfoPosition(polygonData, $event);
    this.currentMarker = polygonData;
    this.infoWindowOptions = position ? { position } : undefined;

    // No anchor: open using explicit position in options.
    this.info.open();
    this.cd.detectChanges();
  }

            /**
             * Renderizza il contenuto informativo marker usando template configurato e fallback sui campi record.
             */
  renderMarkerInfo(selectedMarker: any) {
    if (!selectedMarker) {
      return '';
    }

    if (this.archetypeOptions?.infoFunction) {
      const rawInfoFunction = String(this.archetypeOptions.infoFunction || '').trim();

      // Allow raw HTML directly in the config field (not only JS body).
      if (rawInfoFunction.startsWith('<')) {
        return rawInfoFunction;
      }

      // skills/typed-localized-exceptions: passa per runUserCallbackSync
      // → typed envelope visibile via GlobalHandler (al posto del solo
      // console.warn che restava silenzioso per l'utente). Il fallback
      // a default info resta invariato (return undefined del helper).
      const customInfo = WtoolboxService.runUserCallbackSync(
        'archetypes.map.infoFunction',
        () => new Function('record, marker', rawInfoFunction)(selectedMarker.record, selectedMarker),
        [],
        { archetype: 'map', route: this.metaInfo?.tableMetadata?.md_route_name }
      );
      if (customInfo !== undefined && customInfo !== null && String(customInfo).trim() !== '') {
        return customInfo;
      }
    }

    if (selectedMarker.info !== undefined && selectedMarker.info !== null && String(selectedMarker.info).trim() !== '') {
      return selectedMarker.info;
    }

    if (selectedMarker.title !== undefined && selectedMarker.title !== null && String(selectedMarker.title).trim() !== '') {
      return selectedMarker.title;
    }

    const pKeyField = this.metaInfo?.pKey?.mc_nome_colonna;
    if (pKeyField && selectedMarker.record && selectedMarker.record[pKeyField] !== undefined && selectedMarker.record[pKeyField] !== null) {
      return String(selectedMarker.record[pKeyField]);
    }

    return this.trslSrv.instant('map.marker_default');
  }

              /**
   * Recupera i dati/valori richiesti da `getRecordFieldValue`.
   * @param record Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
   * @param fieldName Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore risolto da `getRecordFieldValue` in base ai criteri implementati.
   */
  private getRecordFieldValue(record: any, fieldName?: string): any {
    if (!record || !fieldName) {
      return undefined;
    }

    return record[fieldName];
  }

  /**
   * Attende che il riferimento `GoogleMap` esponga l'istanza nativa prima di agganciare listener e overlay.
   */
  private async waitForGoogleMapReady(timeoutMs: number = 4000): Promise<boolean> {
    const start = Date.now();

    while (!this.destroyed && (Date.now() - start) < timeoutMs) {
      if (this.map?.googleMap) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return !!this.map?.googleMap;
  }

  /**
   * Determina la posizione della info window per poligoni: priorita al punto cliccato, fallback al centro dei vertici.
   */
  private resolvePolygonInfoPosition(
    polygonData: any,
    $event?: google.maps.PolyMouseEvent
  ): google.maps.LatLngLiteral | null {
    const clickLat = Number($event?.latLng?.lat?.());
    const clickLng = Number($event?.latLng?.lng?.());
    if (Number.isFinite(clickLat) && Number.isFinite(clickLng)) {
      return { lat: clickLat, lng: clickLng };
    }

    const vertices = Array.isArray(polygonData?.vertices) ? polygonData.vertices : [];
    if (!vertices.length) {
      return null;
    }

    const valid = vertices.filter((v: any) => Number.isFinite(Number(v?.lat)) && Number.isFinite(Number(v?.lng)));
    if (!valid.length) {
      return null;
    }

    const sum = valid.reduce((acc: { lat: number; lng: number }, v: any) => {
      acc.lat += Number(v.lat);
      acc.lng += Number(v.lng);
      return acc;
    }, { lat: 0, lng: 0 });

    return {
      lat: sum.lat / valid.length,
      lng: sum.lng / valid.length
    };
  }

  /**
   * Recupera la definizione metadata della colonna geometrica `polygon`.
   * @returns Metadato colonna polygon oppure `undefined`.
   */
  private getPolygonMetadataColumn(): MetadatiColonna | undefined {
    return this.metaInfo?.columnMetadata?.find((col) => col?.mc_ui_column_type == 'polygon');
  }

          /**
           * Applica in blocco lo stato editabile ai poligoni caricati e sincronizza il set dei record modificati.
           */
  private setPolygonEditability(enabled: boolean) {
    (this.data || []).forEach((row, index) => {
      if (!row?.__polygon) {
        return;
      }

      row.__polygon.options = Object.assign({}, row.__polygon.options || {}, {
        editable: enabled,
        draggable: enabled
      });

      if (!enabled) {
        const key = this.getPolygonEditKey(row, index);
        if (this.editedPolygonKeys.has(key)) {
          row.__polygon.options = Object.assign({}, row.__polygon.options || {}, { fillColor: '#FF5733' });
        }
      }
    });
  }

  private getVerticesFromMapPolygon(polygonElem: MapPolygon): { lat: number; lng: number; }[] {
    const path = polygonElem.getPath();
    if (!path) {
      return [];
    }

    return path.getArray().map((point) => ({ lat: point.lat(), lng: point.lng() }));
  }

  /**
   * Converte una geometria WKT polygon (`POLYGON((lng lat,...))`,
   * `POLYGON((outer),(hole))`) o multi-polygon
   * (`MULTIPOLYGON(((p1)),((p2),(hole)))`) in un array di RING di vertici
   * Google Maps (`LatLngLiteral[][]`), scartando coordinate invalide.
   *
   * Ogni ring e' una sequenza chiusa: outer, holes e sub-polygon vengono
   * appiattiti a livello di array di array, in modo che possa essere passato
   * direttamente a `<map-polygon [paths]>`. Cosi' una singola istanza di
   * map-polygon disegna correttamente sub-polygon disgiunti (es. esclavi,
   * isole) e holes, senza tracciare linee diagonali "ponte" tra i ring.
   *
   * Compatibile con output MySQL/SQLServer e con prefisso opzionale `SRID=...;`.
   */
  private parsePolygonRings(rawPolygon: any): { lat: number; lng: number; }[][] {
    const raw = String(rawPolygon || '').trim();
    if (!raw) {
      return [];
    }

    const noSrid = raw.replace(/^SRID=\d+;/i, '').trim();
    if (/^(MULTI)?POLYGON\s+EMPTY$/i.test(noSrid)) {
      return [];
    }

    // Match every innermost (...) group: each is a ring as a comma-separated
    // list of "lng lat" pairs. Works uniformly for POLYGON / MULTIPOLYGON and
    // for polygons with holes, since rings never contain nested parentheses.
    const ringMatches = noSrid.match(/\(([^()]+)\)/g);
    if (!ringMatches || ringMatches.length === 0) {
      return [];
    }

    const rings: { lat: number; lng: number; }[][] = [];
    for (const ringChunk of ringMatches) {
      const inner = ringChunk.slice(1, -1).trim();
      if (!inner) {
        continue;
      }

      const ring = inner
        .split(',')
        .map((chunk) => chunk.trim())
        .filter((chunk) => !!chunk)
        .map((chunk) => chunk.split(/\s+/).filter((part) => !!part))
        .map((parts) => {
          const lng = Number(parts[0]);
          const lat = Number(parts[1]);
          return { lat, lng };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

      if (ring.length > 0) {
        rings.push(ring);
      }
    }

    return rings;
  }

      /**
       * Serializza una lista vertici `{lat,lng}` nel formato WKT `POLYGON` usato per il salvataggio.
       * @param vertices Vertici del poligono in ordine di percorrenza.
       * @returns Stringa WKT completa pronta per persistenza.
       */
  private verticesToPolygonWkt(vertices: { lat: number; lng: number; }[]): string {
    if (!vertices?.length) {
      return 'POLYGON EMPTY';
    }

    const ring = [...vertices];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!last || first.lat !== last.lat || first.lng !== last.lng) {
      ring.push({ lat: first.lat, lng: first.lng });
    }

    const serializedRing = ring
      .map((p) => `${Number(p.lng)} ${Number(p.lat)}`)
      .join(', ');
    return `POLYGON ((${serializedRing}))`;
  }

  /**
   * Costruisce una chiave stabile per tracciare i poligoni modificati: preferisce PK record, fallback indice riga.
   * @param record Record sorgente.
   * @param index Indice riga fallback.
   * @returns Chiave univoca edit set.
   */
  private getPolygonEditKey(record: any, index: number): string {
    const pKeyName = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0]?.mc_nome_colonna;
    if (pKeyName && record?.[pKeyName] !== undefined && record?.[pKeyName] !== null) {
      return `${pKeyName}:${record[pKeyName]}`;
    }

    return `idx:${index}`;
  }

          /**
           * Salva sul datasource solo i record con poligoni modificati e resetta lo stato edit al termine.
           */
  private async saveEditedPolygons() {
    if (this.polygonSaveInProgress) {
      return;
    }

    const ds = this.datasource?.value;
    const polygonField = this.getPolygonMetadataColumn();
    if (!ds || !polygonField?.mc_nome_colonna) {
      return;
    }

    if (!this.metaInfo?.tableMetadata?.md_editable) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('warning'),
        detail: this.trslSrv.instant('route_not_editable')
      });
      return;
    }

    this.polygonSaveInProgress = true;
    try {
      for (let i = 0; i < (this.data || []).length; i++) {
        const row = this.data[i];
        if (!row?.__polygon?.vertices?.length) {
          continue;
        }

        const editKey = this.getPolygonEditKey(row, i);
        if (!this.editedPolygonKeys.has(editKey)) {
          continue;
        }

        const serializedPolygon = this.verticesToPolygonWkt(row.__polygon.vertices);

        const originalRecord = JSON.parse(JSON.stringify(row));
        delete originalRecord.__marker;
        delete originalRecord.__polygon;

        ds.setCurrent(originalRecord);
        if (!ds.resultInfo?.current?.[polygonField.mc_nome_colonna]) {
          continue;
        }

        ds.resultInfo.current[polygonField.mc_nome_colonna].next(serializedPolygon);
        const updated = await ds.syncData(ds.resultInfo.current, originalRecord, false);
        if (!updated) {
          continue;
        }

        row[polygonField.mc_nome_colonna] = serializedPolygon;
        row.__polygon.record = Object.assign({}, row.__polygon.record || {}, { [polygonField.mc_nome_colonna]: serializedPolygon });
      }
    } finally {
      this.polygonSaveInProgress = false;
    }
  }

  /**
   * Recupera la definizione metadata della colonna geometrica `point`.
   * @returns Metadato colonna point oppure `undefined`.
   */
  private getPointMetadataColumn(): MetadatiColonna | undefined {
    return this.metaInfo?.columnMetadata?.find((col) => col?.mc_ui_column_type == 'point');
  }

            /**
   * Applica aggiornamenti di stato tramite `updateMarkerRecordPositionInMemory` mantenendo coerenti UI e dati.
   * @param marker Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param pointFieldName Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param serializedPosition Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param position Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private updateMarkerRecordPositionInMemory(marker: any, pointFieldName: string, serializedPosition: string, position: { lat: number; lng: number; }) {
    if (!marker) {
      return;
    }

    marker.position = position;
    marker.record = marker.record || {};
    marker.record[pointFieldName] = serializedPosition;

    const pKey = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || [])[0];
    const pKeyName = pKey?.mc_nome_colonna;
    if (!pKeyName) {
      return;
    }

    const markerPkValue = marker.record?.[pKeyName];
    const targetRow = (this.data || []).find((row) => row?.[pKeyName] == markerPkValue);
    if (!targetRow) {
      return;
    }

    targetRow[pointFieldName] = serializedPosition;
    if (targetRow.__marker) {
      targetRow.__marker.position = position;
      targetRow.__marker.record = targetRow.__marker.record || {};
      targetRow.__marker.record[pointFieldName] = serializedPosition;
    }
  }

            /**
   * Esegue l'operazione di persistenza/sincronizzazione in `saveDraggedMarkerPosition` aggiornando lo stato locale quando necessario.
   * @param marker Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param position Parametro utilizzato dal metodo nel flusso elaborativo.
   */
  private async saveDraggedMarkerPosition(marker: any, position: { lat: number; lng: number; }) {
    const ds = this.datasource?.value;
    if (!ds || !marker?.record || !position) {
      return;
    }

    const pointField = this.getPointMetadataColumn();
    if (!pointField?.mc_nome_colonna) {
      return;
    }

    if (!this.metaInfo?.tableMetadata?.md_editable) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.trslSrv.instant('warning'),
        detail: this.trslSrv.instant('route_not_editable')
      });
      return;
    }

    const normalizedPosition = {
      lat: Number(position.lat),
      lng: Number(position.lng)
    };
    const serializedPosition = JSON.stringify(normalizedPosition);

    const originalRecord = JSON.parse(JSON.stringify(marker.record));
    delete originalRecord.__marker;
    delete originalRecord.__polygon;

    try {
      ds.setCurrent(originalRecord);

      if (!ds.resultInfo?.current?.[pointField.mc_nome_colonna]) {
        return;
      }

      ds.resultInfo.current[pointField.mc_nome_colonna].next(serializedPosition);

      const updated = await ds.syncData(ds.resultInfo.current, originalRecord, false);
      if (!updated) {
        return;
      }

      const syncedModel = ds.getModelFromObservable(ds.resultInfo.current);
      marker.record = Object.assign({}, marker.record || {}, syncedModel || {});
      marker.record[pointField.mc_nome_colonna] = serializedPosition;
      this.updateMarkerRecordPositionInMemory(marker, pointField.mc_nome_colonna, serializedPosition, normalizedPosition);
      this.cd.detectChanges();
    } catch (err) {
      console.error('Error while saving dragged marker position', err);
      WtoolboxService.messageNotificationService.add({
        severity: 'error',
        summary: this.trslSrv.instant('error'),
        detail: this.trslSrv.instant('save_error')
      });
    }
  }

          /**
           * Aggancia un `ResizeObserver` al contenitore mappa per mantenere viewport e canvas sincronizzati al layout.
           */
  private startMapResizeObserver() {
    if (this.mapResizeObserver || !this.mapHostRef?.nativeElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    const mapHost = this.mapHostRef.nativeElement;
    const observedElements = new Set<HTMLElement>();
    observedElements.add(mapHost);
    let ancestor: HTMLElement | null = mapHost.parentElement;
    while (ancestor) {
      observedElements.add(ancestor);
      ancestor = ancestor.parentElement;
    }

    if (typeof document !== 'undefined') {
      observedElements.add(document.documentElement);
      if (document.body) {
        observedElements.add(document.body);
      }
    }

    this.mapResizeObserver = new ResizeObserver(() => {
      this.scheduleMapResizePasses();
    });
    observedElements.forEach((el) => this.mapResizeObserver?.observe(el));
  }

          /**
           * Programma piu pass di resize differiti per intercettare transizioni/layout tardivi.
           */
  private scheduleMapResizePasses() {
    if (typeof window === 'undefined') {
      return;
    }

    this.clearPendingMapMeasureTimeouts();
    this.measureAndResizeMap();

    this.mapResizePassDelaysMs.forEach((delay) => {
      const handle = window.setTimeout(() => {
        this.measureAndResizeMap();
      }, delay);
      this.pendingMapMeasureTimeouts.push(handle);
    });
  }

          /**
           * Ricalcola altezza host mappa e richiede il resize del canvas Google Maps.
           */
  private measureAndResizeMap() {
    this.updateMapHostHeight();
    this.scheduleMapResize();
  }

          /**
           * Schedula un resize su `requestAnimationFrame` cancellando l'eventuale richiesta precedente.
           */
  private scheduleMapResize() {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.pendingMapResizeHandle) {
      window.cancelAnimationFrame(this.pendingMapResizeHandle);
    }

    this.pendingMapResizeHandle = window.requestAnimationFrame(() => {
      this.pendingMapResizeHandle = undefined;
      if (this.map?.googleMap) {
        google.maps.event.trigger(this.map.googleMap, 'resize');
        const center = this.map.googleMap.getCenter?.();
        this.onMapResize.emit({
          source: 'internal',
          heightPx: this.mapHostHeightPx,
          center: center ? center.toJSON() : null,
          zoom: this.map.googleMap.getZoom?.() ?? null
        });
      }
    });
  }

          /**
           * Calcola l'altezza disponibile nel viewport e aggiorna `mapHostHeightPx` rispettando il minimo configurato.
           */
  private updateMapHostHeight() {
    if (typeof window === 'undefined' || !this.mapHostRef?.nativeElement) {
      return;
    }

    const mapHost = this.mapHostRef.nativeElement;
    const fillHeightRepeater = mapHost.closest('wuic-data-repeater.wuic-data-repeater-fill-height') as HTMLElement | null;
    if (fillHeightRepeater) {
      // In fill-height mode let flex layout drive map height, avoiding stale inline px values.
      this.mapHostHeightPx = undefined;
      return;
    }

    // Temporarily clear the inline height so the layout reflects the true
    // available space. Without this, when the filter-bar collapses the
    // ancestor rects stay limited by the old (smaller) map height —
    // creating a circular dependency that prevents the map from growing.
    const prevHeight = mapHost.style.height;
    const prevMaxHeight = mapHost.style.maxHeight;
    mapHost.style.height = '';
    mapHost.style.maxHeight = '';

    const hostRect = mapHost.getBoundingClientRect();
    const hostTop = hostRect.top;
    const layoutBottom = this.getLayoutViewportBottom(mapHost);
    const viewportAvailable = Math.floor(layoutBottom - hostTop - this.mapBottomPadding);

    // Clamp against every ancestor bottom edge to avoid overflowing flex containers
    // (especially custom host shells like .repeater-shell).
    let containerAvailable = Number.POSITIVE_INFINITY;
    let ancestor: HTMLElement | null = mapHost.parentElement;
    while (ancestor) {
      const rect = ancestor.getBoundingClientRect();
      if (rect.height > 0) {
        const availableFromAncestor = Math.floor(rect.bottom - hostTop);
        containerAvailable = Math.min(containerAvailable, availableFromAncestor);
      }
      ancestor = ancestor.parentElement;
    }

    const repeaterAvailable = fillHeightRepeater
      ? Math.floor(fillHeightRepeater.getBoundingClientRect().bottom - hostTop)
      : Number.POSITIVE_INFINITY;

    const available = Math.min(viewportAvailable, containerAvailable, repeaterAvailable);
    const newHeight = Math.max(this.mapHostMinHeight, Math.max(0, available));

    // Restore inline styles (they'll be overwritten by Angular binding on next CD)
    mapHost.style.height = prevHeight;
    mapHost.style.maxHeight = prevMaxHeight;

    this.mapHostHeightPx = newHeight;
  }

            /**
   * Recupera i dati/valori richiesti da `getLayoutViewportBottom`.
   * @param startElement Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore numerico prodotto da `getLayoutViewportBottom` (indice, conteggio o misura operativa).
   */
  private getLayoutViewportBottom(startElement: HTMLElement): number {
    let node: HTMLElement | null = startElement.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY || '';
      if ((overflowY.includes('auto') || overflowY.includes('scroll') || overflowY.includes('overlay')) && node.clientHeight > 0) {
        return node.getBoundingClientRect().bottom;
      }
      node = node.parentElement;
    }
    return window.innerHeight;
  }

          /**
           * Annulla tutti i timeout di misura/resize ancora pendenti.
           */
  private clearPendingMapMeasureTimeouts() {
    if (typeof window === 'undefined') {
      return;
    }
    this.pendingMapMeasureTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    this.pendingMapMeasureTimeouts = [];
  }

          /**
           * Registra listener globali (`resize`/`scroll`) che innescano il ricalcolo layout della mappa.
           */
  private attachLayoutListeners() {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('scroll', this.onWindowScroll, true);
  }

          /**
           * Rimuove i listener layout registrati in init per evitare leak su destroy.
           */
  private detachLayoutListeners() {
    if (typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('scroll', this.onWindowScroll, true);
  }

}




