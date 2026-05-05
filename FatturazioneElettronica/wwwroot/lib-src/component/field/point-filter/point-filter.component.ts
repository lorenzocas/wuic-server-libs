import { Component, Input, ViewChild } from '@angular/core';
import { GoogleMap, GoogleMapsModule } from '@angular/google-maps';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { MetaInfo } from '../../../class/metaInfo';
import { MetadatiColonna } from '../../../class/metadati_colonna';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../../data-source/data-source.component';
import { FilterInfo } from '../../../class/filterInfo';
import { Point } from '../../../class/mapOptions';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'wuic-point-filter',
  imports: [GoogleMapsModule, DialogModule, ButtonModule, TooltipModule, TranslateModule],
  templateUrl: './point-filter.component.html',
  styleUrl: './point-filter.component.css'
})
export class PointFilterComponent {
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record?: any;
  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna = new MetadatiColonna('');
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo = new MetaInfo();
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource?: BehaviorSubject<DataSourceComponent>;

  /**
   * Riferimento a elementi o componenti figli usato dalla logica UI per map.
   */
  @ViewChild(GoogleMap, { static: false }) map?: GoogleMap;

  /**
   * Proprieta di stato del componente per dialog visible, usata dalla logica interna e dal template.
   */
  dialogVisible = false;
  /**
   * Proprieta di stato del componente per map center, usata dalla logica interna e dal template.
   */
  mapCenter: google.maps.LatLngLiteral = { lat: 41.9028, lng: 12.4964 };
  /**
   * Proprieta di stato del componente per map zoom, usata dalla logica interna e dal template.
   */
  mapZoom = 6;

  /**
   * Modalita' di disegno corrente. Sostituisce `google.maps.drawing.DrawingManager`
   * deprecato (Maps JavaScript API drawing library, deprecated 2025-08, removed
   * in versions released starting 2026-05). Implementiamo polygon + circle
   * manuali via click-handler diretti sulla mappa.
   */
  private drawingMode: 'polygon' | 'circle' | null = null;
  /**
   * Listener registrati durante una sessione di drawing: vanno rimossi quando
   * la sessione si conclude (overlaycomplete equivalente) o cambia modalita'.
   */
  private drawingListeners: google.maps.MapsEventListener[] = [];
  /**
   * Stato intermedio per il disegno polygon: vertici accumulati al click,
   * UX originale Google DrawingManager:
   *   - 1° click → punto visibile (dot)
   *   - click successivi → linea (polyline preview) + altri dot
   *   - click sul 1° dot → chiude il poligono
   *   - dblclick come alternativa di chiusura (compatibilita' con utenti
   *     che si aspettano dblclick)
   */
  private polygonVertices: google.maps.LatLng[] = [];
  /**
   * Marker visibili per ogni vertice del polygon in draw (dot rossi).
   * Tipo `any` perche' AdvancedMarkerElement non e' direttamente nei
   * tipi `google.maps.*` esposti senza importLibrary('marker').
   */
  private polygonVertexMarkers: any[] = [];
  /**
   * Polyline di preview che collega i vertici durante il disegno.
   * Si trasforma in `activePolygon` (closed shape) alla chiusura.
   */
  private polylinePreview?: google.maps.Polyline;
  /**
   * Stato intermedio per il disegno cerchio: center fissato al primo click,
   * raggio calcolato live al mousemove, fissato al secondo click.
   */
  private circleCenter?: google.maps.LatLng;
  private circleStage: 'center' | 'radius' = 'center';
  /**
   * Valore corrente selezionato per active polygon, usato dai flussi interattivi del componente.
   */
  private activePolygon?: google.maps.Polygon;
  /**
   * Valore corrente selezionato per active circle, usato dai flussi interattivi del componente.
   */
  private activeCircle?: google.maps.Circle;
  /**
   * Proprieta di stato del componente per pending operator, usata dalla logica interna e dal template.
   */
  pendingOperator: 'maparea' | 'mapdistance' | null = null;
  /**
   * Proprieta di stato del componente per pending value, usata dalla logica interna e dal template.
   */
  pendingValue: string | null = null;

          /**
   * Gestisce comportamento UI tramite `openDialog` orchestrando le chiamate `setTimeout` e `initDrawingTools`.
   */
  openDialog() {
    this.dialogVisible = true;
    setTimeout(() => this.initDrawingTools(), 0);
  }

          /**
   * Gestisce comportamento UI tramite `closeDialog` con il flusso specifico definito dalla sua implementazione.
   */
  closeDialog() {
    this.dialogVisible = false;
  }

  /**
   * Gestisce la logica di `initDrawingTools`. No-op nel nuovo path (i click
   * handler vengono registrati on-demand in `drawArea`/`drawCircle`); il metodo
   * resta per compatibilita' con i call site esistenti (es. `openDialog`).
   */
  async initDrawingTools() {
    // Drawing library deprecata (Maps JavaScript API, removed 2026-05) —
    // sostituita da click-handler diretti registrati on-demand. Niente da
    // inizializzare al boot.
  }

          /**
   * Avvia il disegno di un'area poligonale: ogni click aggiunge un vertice,
   * il polygon di preview si aggiorna live, il doppio click chiude la forma
   * (richiede min 3 vertici). Sostituisce
   * `drawingManager.setDrawingMode(OverlayType.POLYGON)`.
   *
   * Note: il polygon di preview viene creato LAZY al primo click sulla mappa,
   * non subito al click del bottone. Pre-creare un polygon con `paths: []`
   * intercettava gli eventi `click` della mappa anche con `clickable: false`
   * e impediva al listener di firare → l'utente cliccava i bottoni e non
   * succedeva nulla.
   */
  drawArea() {
    this.clearShapes();
    this.drawingMode = 'polygon';
    this.polygonVertices = [];
    this.polygonVertexMarkers = [];
    this.polylinePreview = undefined;
    this.applyDrawingCursor('crosshair');
    this.scheduleAttachMapListeners();
  }

          /**
   * Avvia il disegno di un cerchio: il primo click fissa il centro, il
   * mousemove successivo regola il raggio in tempo reale, il secondo click
   * lo conferma. Sostituisce `drawingManager.setDrawingMode(OverlayType.CIRCLE)`.
   */
  drawCircle() {
    this.clearShapes();
    this.drawingMode = 'circle';
    this.circleCenter = undefined;
    this.circleStage = 'center';
    this.applyDrawingCursor('crosshair');
    this.scheduleAttachMapListeners();
  }

  /**
   * Attacca i listener click/mousemove/dblclick alla mappa Google.
   * Schedule via `setTimeout` perche' alla prima apertura del dialog il
   * `<google-map>` ViewChild puo' non aver ancora popolato `googleMap`
   * (la libreria Maps si carica async). Riprova fino a 10 volte a 100ms.
   */
  private scheduleAttachMapListeners(attempt: number = 0) {
    const map = this.map?.googleMap;
    if (!map) {
      if (attempt < 10) {
        setTimeout(() => this.scheduleAttachMapListeners(attempt + 1), 100);
      }
      return;
    }
    this.attachMapListeners(map);
  }

  /**
   * Effettiva attach dei listener. Chiamato da scheduleAttachMapListeners
   * quando `googleMap` e' pronto.
   */
  private attachMapListeners(map: google.maps.Map) {
    // Pulisci listener precedenti senza cambiare la modalita' attiva.
    for (const l of this.drawingListeners) { l.remove(); }
    this.drawingListeners = [];

    this.drawingListeners.push(
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        if (this.drawingMode === 'polygon') {
          // Aggiungi vertice + dot visibile.
          this.polygonVertices.push(e.latLng);
          const isFirst = this.polygonVertices.length === 1;
          const dot = this.createVertexMarker(e.latLng, map, isFirst);
          this.polygonVertexMarkers.push(dot);

          // Polyline preview: linee tra i vertici accumulati.
          if (!this.polylinePreview) {
            this.polylinePreview = new google.maps.Polyline({
              path: [e.latLng],
              strokeColor: '#FF5733',
              strokeOpacity: 1.0,
              strokeWeight: 3,
              clickable: false,
              map
            });
          } else {
            this.polylinePreview.setPath(this.polygonVertices);
          }
        } else if (this.drawingMode === 'circle') {
          if (this.circleStage === 'center') {
            this.circleCenter = e.latLng;
            this.activeCircle = new google.maps.Circle({
              center: e.latLng,
              radius: 1,
              fillColor: '#0ea5e9',
              fillOpacity: 0.2,
              strokeWeight: 3,
              strokeColor: '#0ea5e9',
              editable: false,
              draggable: false,
              clickable: false,
              zIndex: 1,
              map
            });
            this.circleStage = 'radius';
          } else {
            if (!this.activeCircle || !this.circleCenter) return;
            this.activeCircle.setRadius(this.haversineMeters(this.circleCenter, e.latLng));
            this.activeCircle.setOptions({ editable: true });
            this.pendingOperator = 'mapdistance';
            this.pendingValue = this.toCircleExpression(this.activeCircle);
            this.exitDrawingMode();
          }
        }
      }),
      map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        if (this.drawingMode !== 'circle' || this.circleStage !== 'radius') return;
        if (!this.activeCircle || !this.circleCenter || !e.latLng) return;
        this.activeCircle.setRadius(this.haversineMeters(this.circleCenter, e.latLng));
      }),
      map.addListener('dblclick', () => {
        // Alternativa di chiusura — riusa la stessa logica del click sul
        // primo vertice (build polygon finale + apply filter).
        this.closePolygonFromFirstVertex();
      })
    );
  }

  /**
   * Cambia il cursore della mappa per dare feedback visivo che la modalita'
   * di disegno e' attiva (sostituisce il cursore drawingManager-managed).
   */
  private applyDrawingCursor(cursor: string) {
    const map = this.map?.googleMap;
    if (!map) return;
    try { (map as any).setOptions({ draggableCursor: cursor }); } catch { /* ignore */ }
  }

  /**
   * Crea un AdvancedMarkerElement che rappresenta visivamente un vertice
   * del polygon in fase di disegno (un piccolo dot rosso).
   * Se `isFirst=true`, aggiunge un click handler per chiudere il polygon
   * quando l'utente cliccher sul primo vertice (UX classica DrawingManager).
   */
  private createVertexMarker(latLng: google.maps.LatLng, map: google.maps.Map, isFirst: boolean): any {
    // PinElement classico avrebbe un anchor in basso e un'area cliccabile
    // grande; qui vogliamo solo un dot. Usiamo un HTMLElement custom.
    const dot = document.createElement('div');
    dot.style.cssText = [
      'width: 12px',
      'height: 12px',
      'background: #FF5733',
      'border: 2px solid white',
      'border-radius: 50%',
      'box-shadow: 0 0 0 1px rgba(0,0,0,0.3)',
      'transform: translate(0, 0)',
      'cursor: ' + (isFirst ? 'pointer' : 'default')
    ].join(';');
    if (isFirst) {
      // Visualmente piu' grande per indicare "click qui per chiudere"
      dot.style.width = '14px';
      dot.style.height = '14px';
      dot.title = 'Click per chiudere il poligono';
    }

    // AdvancedMarkerElement: tipo non-statico in google.maps namespace
    // (vive in importLibrary('marker') ma e' gia' caricato a run-time).
    const AMElement = (google.maps as any).marker?.AdvancedMarkerElement;
    if (!AMElement) {
      // Fallback molto improbabile: marker library non caricata. Logghiamo.
      console.warn('[point-filter] AdvancedMarkerElement not available — vertex dots not visible');
      return null;
    }

    const marker = new AMElement({ position: latLng, map, content: dot });
    if (isFirst) {
      // gmp-click sul dot iniziale → chiude il polygon (richiede ≥3 vertici).
      marker.addEventListener('gmp-click', () => this.closePolygonFromFirstVertex());
    }
    return marker;
  }

  /**
   * Chiude il polygon: trasforma la polyline preview + i dot vertex in un
   * Polygon chiuso editabile e applica il filtro `maparea`.
   */
  private closePolygonFromFirstVertex() {
    if (this.drawingMode !== 'polygon') return;
    if (this.polygonVertices.length < 3) return;

    const map = this.map?.googleMap;
    if (!map) return;

    // Cleanup preview overlays (polyline + vertex dots).
    if (this.polylinePreview) {
      this.polylinePreview.setMap(null);
      this.polylinePreview = undefined;
    }
    for (const m of this.polygonVertexMarkers) {
      try { if (m) { m.map = null; } } catch { /* ignore */ }
    }
    this.polygonVertexMarkers = [];

    // Crea il polygon finale (closed shape, editabile per refinement).
    this.activePolygon = new google.maps.Polygon({
      paths: this.polygonVertices,
      fillColor: '#FF5733',
      fillOpacity: 0.25,
      strokeWeight: 3,
      strokeColor: '#FF5733',
      editable: true,
      draggable: false,
      clickable: false,
      zIndex: 1,
      map
    });
    this.pendingOperator = 'maparea';
    this.pendingValue = this.toPolygonWkt(this.activePolygon);
    this.exitDrawingMode();
  }

  /**
   * Rimuove i listener registrati nella sessione di drawing corrente e
   * resetta lo stato. Idempotente.
   */
  private exitDrawingMode() {
    for (const l of this.drawingListeners) {
      l.remove();
    }
    this.drawingListeners = [];
    this.drawingMode = null;
    this.circleCenter = undefined;
    this.circleStage = 'center';
    // Ripristina cursore default della mappa.
    const map = this.map?.googleMap;
    if (map) {
      try { (map as any).setOptions({ draggableCursor: null }); } catch { /* ignore */ }
    }
    // polygonVertices resta valorizzato finche' clearShapes non lo azzera —
    // serve a `toPolygonWkt` se l'utente conferma il polygon.
  }

  /**
   * Distanza Haversine in metri tra due `LatLng`. Replica
   * `google.maps.geometry.spherical.computeDistanceBetween` senza forzare
   * il caricamento della geometry library (che non e' importata da
   * questo componente).
   */
  private haversineMeters(a: google.maps.LatLng, b: google.maps.LatLng): number {
    const R = 6371000; // metri
    const lat1 = a.lat() * Math.PI / 180;
    const lat2 = b.lat() * Math.PI / 180;
    const dlat = (b.lat() - a.lat()) * Math.PI / 180;
    const dlng = (b.lng() - a.lng()) * Math.PI / 180;
    const h = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

          /**
   * Applica aggiornamenti di stato tramite `applyFilter` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), preparando/aggiornando il dataset visualizzato.
   *
   * Se l'utente ha disegnato una shape ma non l'ha chiusa esplicitamente
   * (dblclick per polygon, 2° click per circle) prima di premere "Usa
   * filtro", finalizziamo qui la shape corrente — altrimenti il bottone
   * sembra non fare nulla. Il legacy `DrawingManager` chiudeva
   * automaticamente al click sul primo vertice (polygon) / drag-release
   * (circle); il path manual richiede una gesture esplicita che l'utente
   * non sempre conosce.
   */
  async applyFilter() {
    if (!this.datasource?.value) {
      return;
    }

    // Auto-finalize della shape in corso se non gia' completata.
    if (!this.pendingOperator || !this.pendingValue) {
      if (this.drawingMode === 'polygon' && this.polygonVertices.length >= 3) {
        // Riusa lo stesso path di chiusura del click sul primo vertice:
        // build del polygon finale + cleanup preview overlays.
        this.closePolygonFromFirstVertex();
      } else if (this.drawingMode === 'circle' && this.activeCircle && this.circleCenter) {
        this.activeCircle.setOptions({ editable: true });
        this.pendingOperator = 'mapdistance';
        this.pendingValue = this.toCircleExpression(this.activeCircle);
        this.exitDrawingMode();
      }
    }

    if (!this.pendingOperator || !this.pendingValue) {
      // Non c'e' shape valida da applicare (utente ha aperto il dialog senza
      // disegnare). Chiudi senza side-effect.
      this.dialogVisible = false;
      return;
    }

    const ds = this.datasource.value;
    if (!ds.filterInfo) {
      ds.filterInfo = new FilterInfo('AND', []);
    }

    const existing = ds.filterInfo.filters.find((f) => f.field === this.field.mc_nome_colonna && (f.__extra || f.fixed));
    if (existing) {
      existing.operatore = this.pendingOperator;
      existing.value = this.pendingValue;
    } else {
      ds.filterInfo.filters.push({
        field: this.field.mc_nome_colonna,
        operatore: this.pendingOperator,
        value: this.pendingValue,
        __extra: true,
        fixed: false
      } as any);
    }

    this.metaInfo.operators[this.field.mc_nome_colonna] = this.pendingOperator;

    const center = this.extractCenterFromFilterValue(this.pendingOperator, this.pendingValue);
    if (center) {
      const dsMeta = ds.metaInfo?.tableMetadata;
      if (dsMeta) {
        if (!dsMeta.extraProps) {
          dsMeta.extraProps = {} as any;
        }
        if (!dsMeta.extraProps.archetypes) {
          dsMeta.extraProps.archetypes = {} as any;
        }
        if (!dsMeta.extraProps.archetypes.map) {
          dsMeta.extraProps.archetypes.map = {} as any;
        }
        const mapCenter = new Point();
        mapCenter.lat = center.lat;
        mapCenter.lng = center.lng;
        dsMeta.extraProps.archetypes.map.center = mapCenter;

        const currentZoom = Number(this.map?.googleMap?.getZoom?.());
        if (Number.isFinite(currentZoom) && currentZoom > 0) {
          dsMeta.extraProps.archetypes.map.zoom = currentZoom;
        }
      }
    }

    this.dialogVisible = false;
    await ds.fetchData();
  }

          /**
   * Gestisce la logica di `clearFilter` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), trasformando e filtrando collezioni dati.
   *
   * - Rimuove il filtro maparea/mapdistance dal `filterInfo.filters` per il
   *   campo corrente (match field-name case-insensitive per evitare
   *   mismatch di casing client/server).
   * - Resetta l'override `metaInfo.operators[<field>]` lasciato da
   *   `applyFilter` — altrimenti la UI continua a mostrare lo status
   *   "Filtro area pronto".
   * - Triggera `fetchData()` cosi' la query si rigenera senza il filtro:
   *   pre-fix il filtro spariva dalla UI ma il prossimo payload (e quindi
   *   l'SQL server-side) includeva ancora `operatore: 'maparea'`.
   */
  async clearFilter() {
    this.clearShapes();
    const fieldName = this.field?.mc_nome_colonna || '';
    const fieldNameLc = fieldName.toLowerCase();
    const ds = this.datasource?.value;
    if (!ds) return;
    if (ds.filterInfo?.filters?.length) {
      ds.filterInfo.filters = ds.filterInfo.filters.filter((f) =>
        !((f.field || '').toLowerCase() === fieldNameLc && (f.operatore === 'maparea' || f.operatore === 'mapdistance')));
    }
    if (this.metaInfo?.operators && fieldName in this.metaInfo.operators) {
      delete this.metaInfo.operators[fieldName];
    }
    try { await ds.fetchData(); } catch { /* best-effort: la UI ha gia' clearato lo stato locale */ }
  }

          /**
   * Gestisce la logica di `clearShapes` orchestrando le chiamate `setMap`.
   * Rimuove polygon + circle dalla mappa, esce da eventuale modalita' di
   * disegno attiva e svuota lo stato dei vertici accumulati.
   */
  clearShapes() {
    this.exitDrawingMode();

    if (this.activePolygon) {
      this.activePolygon.setMap(null);
      this.activePolygon = undefined;
    }

    if (this.activeCircle) {
      this.activeCircle.setMap(null);
      this.activeCircle = undefined;
    }

    // Cleanup preview overlays (in caso di interruzione mid-draw).
    if (this.polylinePreview) {
      this.polylinePreview.setMap(null);
      this.polylinePreview = undefined;
    }
    for (const m of this.polygonVertexMarkers) {
      try { if (m) { m.map = null; } } catch { /* ignore */ }
    }
    this.polygonVertexMarkers = [];

    this.polygonVertices = [];
    this.pendingOperator = null;
    this.pendingValue = null;
  }

            /**
   * Gestisce la logica operativa di `toPolygonWkt` in modo coerente con l'implementazione corrente.
   * @param polygon Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `toPolygonWkt` per chiavi/label o valori testuali.
   */
  private toPolygonWkt(polygon: google.maps.Polygon): string {
    const path = polygon.getPath();
    const points: string[] = [];

    for (let i = 0; i < path.getLength(); i++) {
      const p = path.getAt(i);
      points.push(`${p.lng()} ${p.lat()}`);
    }

    if (points.length > 0) {
      points.push(points[0]);
    }

    return `POLYGON ((${points.join(',')}))`;
  }

            /**
   * Gestisce la logica operativa di `toCircleExpression` in modo coerente con l'implementazione corrente.
   * @param circle Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Stringa risultante calcolata da `toCircleExpression` per chiavi/label o valori testuali.
   */
  private toCircleExpression(circle: google.maps.Circle): string {
    const center = circle.getCenter();
    const lat = center?.lat() ?? 0;
    const lng = center?.lng() ?? 0;
    const radius = Math.round(circle.getRadius());
    return `CIRCLE((${lat} ${lng}),${radius})`;
  }

              /**
   * Gestisce la logica operativa di `extractCenterFromFilterValue` in modo coerente con l'implementazione corrente.
   * @param operator Parametro utilizzato dal metodo nel flusso elaborativo.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Valore di tipo `{ lat: number; lng: number } | null` prodotto da `extractCenterFromFilterValue`.
   */
  private extractCenterFromFilterValue(
    operator: 'maparea' | 'mapdistance',
    value: string
  ): { lat: number; lng: number } | null {
    if (!value) {
      return null;
    }

    if (operator === 'mapdistance') {
      const match = /^CIRCLE\(\(([-\d.]+)\s+([-\d.]+)\),([-\d.]+)\)$/.exec(value.trim());
      if (!match) {
        return null;
      }

      return {
        lat: Number(match[1]),
        lng: Number(match[2])
      };
    }

    // maparea: use polygon centroid from vertices
    const polyMatch = /^POLYGON\s*\(\((.+)\)\)$/i.exec(value.trim());
    if (!polyMatch) {
      return null;
    }

    const coords = polyMatch[1]
      .split(',')
      .map((s) => s.trim().split(/\s+/))
      .filter((p) => p.length >= 2)
      .map((p) => ({ lng: Number(p[0]), lat: Number(p[1]) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    if (!coords.length) {
      return null;
    }

    const sum = coords.reduce((acc, p) => {
      acc.lat += p.lat;
      acc.lng += p.lng;
      return acc;
    }, { lat: 0, lng: 0 });

    return {
      lat: sum.lat / coords.length,
      lng: sum.lng / coords.length
    };
  }
}


