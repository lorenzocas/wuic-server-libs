
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MetaInfo } from '../../class/metaInfo';

@Component({
  selector: 'wuic-archetype-configurator',
  imports: [FormsModule, DialogModule, ButtonModule, TranslateModule],
  templateUrl: './archetype-configurator.component.html',
  styleUrl: './archetype-configurator.component.css'
})
export class ArchetypeConfiguratorComponent implements OnChanges {
  /**
   * Input dal componente padre per visible; usata nella configurazione e nel rendering del componente.
   */
  @Input() visible = false;
  /**
   * Evento emesso verso il componente padre per notificare cambi di stato relativi a visible change.
   */
  @Output() visibleChange = new EventEmitter<boolean>();

  /**
   * Input dal componente padre per archetype; usata nella configurazione e nel rendering del componente.
   */
  @Input() archetype = '';
  /**
   * Input dal componente padre per meta info; usata nella configurazione e nel rendering del componente.
   */
  @Input() metaInfo: MetaInfo | null = null;
  /**
   * Input dal componente padre per value; usata nella configurazione e nel rendering del componente.
   */
  @Input() value: any;

  /**
   * Evento emesso verso il componente padre per notificare cambi di stato relativi a apply config.
   */
  @Output() applyConfig = new EventEmitter<any>();

  /**
   * Collezione dati per chart types, consumata dal rendering e dalle operazioni del componente.
   */
  readonly chartTypes: string[] = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter'];
  /**
   * Collezione dati per legend positions, consumata dal rendering e dalle operazioni del componente.
   */
  readonly legendPositions: string[] = ['top', 'right', 'bottom', 'left'];
  /**
   * Collezione dati per animation easings, consumata dal rendering e dalle operazioni del componente.
   */
  readonly animationEasings: string[] = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeOutQuart'];

  /**
   * Proprieta di stato del componente per map draft, usata dalla logica interna e dal template.
   */
  mapDraft: any = {};
  /**
   * Proprieta di stato del componente per carousel draft, usata dalla logica interna e dal template.
   */
  carouselDraft: any = {};
  /**
   * Proprieta di stato del componente per chart draft, usata dalla logica interna e dal template.
   */
  chartDraft: any = {};
  /**
   * Proprieta di stato del componente per kanban draft, usata dalla logica interna e dal template.
   */
  kanbanDraft: any = {};

      /**
   * Gestisce i cambiamenti degli input aggiornando lo stato derivato e le dipendenze del componente.
   * @param changes Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const visibleChange = changes['visible'];
    const becameVisible = !!visibleChange && visibleChange.currentValue === true && visibleChange.previousValue !== true;
    const archetypeChanged = !!changes['archetype'];
    const hidden = !this.visible;
    const inputChangedWhileHidden = hidden && (!!changes['value'] || !!changes['metaInfo']);

    // Avoid resetting user edits while the dialog is open (value bindings can
    // change reference on every CD cycle in parent templates).
    if (becameVisible || archetypeChanged || inputChangedWhileHidden) {
      this.syncDraftFromValue();
    }
  }

      /**
   * Gestisce la logica operativa di `close` orchestrando le chiamate `emit`.
   */
  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

      /**
   * Gestisce la logica operativa di `apply` orchestrando le chiamate `String` e `unwrapValue`.
   */
  apply(): void {
    const action = String(this.archetype || '').trim();
    let nextConfig: any = {};

    if (action === 'map') {
      const current = this.unwrapValue(this.value) || {};
      nextConfig = Object.assign({}, current, {
        mapId: String(this.mapDraft.mapId || '').trim(),
        zoom: this.toNumber(this.mapDraft.zoom, current.zoom || 10),
        minZoom: this.toNumber(this.mapDraft.minZoom, current.minZoom || 1),
        maxZoom: this.toNumber(this.mapDraft.maxZoom, current.maxZoom || 20),
        center: {
          lat: this.toNullableNumber(this.mapDraft.centerLat),
          lng: this.toNullableNumber(this.mapDraft.centerLng)
        },
        useCurrentLocation: !!this.mapDraft.useCurrentLocation,
        useClusterer: !!this.mapDraft.useClusterer,
        filterByBoundaries: !!this.mapDraft.filterByBoundaries,
        titleField: String(this.mapDraft.titleField || '').trim(),
        infoField: String(this.mapDraft.infoField || '').trim(),
        customMarkerImageSrcField: String(this.mapDraft.customMarkerImageSrcField || '').trim(),
        customMarkerImageSrc: String(this.mapDraft.customMarkerImageSrc || '').trim(),
        markerContentCallback: this.mapDraft.markerContentCallback || '',
        infoFunction: this.mapDraft.infoFunction || '',
        itemTemplateString: this.mapDraft.itemTemplateString || ''
      });
    } else if (action === 'carousel') {
      const current = this.unwrapValue(this.value) || {};
      nextConfig = Object.assign({}, current, {
        imageFieldName: String(this.carouselDraft.imageFieldName || '').trim(),
        descriptionFieldName: String(this.carouselDraft.descriptionFieldName || '').trim(),
        imageWidth: this.toNumber(this.carouselDraft.imageWidth, 300),
        pageSize: Math.max(1, this.toNumber(this.carouselDraft.pageSize, 10)),
        numVisible: Math.max(1, this.toNumber(this.carouselDraft.numVisible, 1)),
        numScroll: Math.max(1, this.toNumber(this.carouselDraft.numScroll, 1)),
        usePreview: !!this.carouselDraft.usePreview,
        itemTemplateString: this.carouselDraft.itemTemplateString || ''
      });
    } else if (action === 'chart') {
      const current = this.unwrapValue(this.value) || {};
      const existingDataOptions = current.dataOptions || {};
      nextConfig = Object.assign({}, current, {
        type: this.chartDraft.type || 'bar',
        options: this.buildChartOptionsFromDraft(),
        dataOptions: Object.assign({}, existingDataOptions, {
          cutOffCount: Math.max(0, this.toNumber(this.chartDraft.cutOffCount, 0))
        })
      });
    } else if (action === 'kanban') {
      const current = this.unwrapValue(this.value) || {};
      nextConfig = Object.assign({}, current, {
        statusField: String(this.kanbanDraft.statusField || '').trim(),
        colorField: String(this.kanbanDraft.colorField || '').trim(),
        wipLimitField: String(this.kanbanDraft.wipLimitField || '').trim(),
        wipLimitHardField: String(this.kanbanDraft.wipLimitHardField || '').trim(),
        assignedUserIdField: String(this.kanbanDraft.assignedUserIdField || '').trim(),
        titleField: String(this.kanbanDraft.titleField || '').trim(),
        descriptionField: String(this.kanbanDraft.descriptionField || '').trim(),
        cardSubtitleField: String(this.kanbanDraft.cardSubtitleField || '').trim(),
        clickAction: String(this.kanbanDraft.clickAction || 'detail').trim(),
        persistMode: String(this.kanbanDraft.persistMode || 'immediate').trim(),
        statusColumns: (Array.isArray(this.kanbanDraft.statusColumns) ? this.kanbanDraft.statusColumns : [])
          .map((x: any, idx: number) => ({
            value: x?.value,
            label: String(x?.label || '').trim(),
            color: String(x?.color || '').trim(),
            order: this.toNumber(x?.order, idx),
            wipLimit: this.toNullableNumber(x?.wipLimit),
            wipLimitHard: !!x?.wipLimitHard
          }))
          .filter((x: any) => x.value !== undefined && x.value !== null && String(x.value).trim() !== '')
      });
    }

    this.applyConfig.emit(nextConfig);
    this.close();
  }

      /**
   * Gestisce la logica operativa di `fieldCandidates` usando metadati di tabella/colonna allineati al modello server `_Metadati_*`.
   * @returns Valore calcolato dinamicamente a partire dallo stato corrente del componente.
   */


  get fieldCandidates(): any[] {
    return this.metaInfo?.columnMetadata || [];
  }

    /**
   * Esegue una operazione di persistenza/sincronizzazione mantenendo coerente lo stato locale orchestrando le chiamate `trim` e `String`.
   */
  private syncDraftFromValue(): void {
    const action = String(this.archetype || '').trim();
    const current = this.unwrapValue(this.value) || {};

    if (action === 'map') {
      this.mapDraft = {
        mapId: current.mapId || '',
        zoom: this.toNumber(current.zoom, 10),
        minZoom: this.toNumber(current.minZoom, 1),
        maxZoom: this.toNumber(current.maxZoom, 20),
        centerLat: this.toNullableNumber(current.center?.lat),
        centerLng: this.toNullableNumber(current.center?.lng),
        useCurrentLocation: !!current.useCurrentLocation,
        useClusterer: !!current.useClusterer,
        filterByBoundaries: !!current.filterByBoundaries,
        customMarkerImageSrc: current.customMarkerImageSrc || '',
        customMarkerImageSrcField: current.customMarkerImageSrcField || '',
        markerContentCallback: current.markerContentCallback || '',
        titleField: current.titleField || '',
        infoField: current.infoField || '',
        infoFunction: current.infoFunction || '',
        itemTemplateString: current.itemTemplateString || ''
      };
      return;
    }

    if (action === 'carousel') {
      this.carouselDraft = {
        imageFieldName: current.imageFieldName || '',
        descriptionFieldName: current.descriptionFieldName || '',
        imageWidth: this.toNumber(current.imageWidth, 300),
        pageSize: Math.max(1, this.toNumber(current.pageSize, 10)),
        numVisible: Math.max(1, this.toNumber(current.numVisible, 1)),
        numScroll: Math.max(1, this.toNumber(current.numScroll, 1)),
        usePreview: !!current.usePreview,
        itemTemplateString: current.itemTemplateString || ''
      };
      return;
    }

    if (action === 'chart') {
      const options = current.options || {};
      const plugins = options.plugins || {};
      const scales = options.scales || {};
      const x = scales.x || {};
      const y = scales.y || {};
      const cutout = String(options.cutout ?? '').replace('%', '').trim();
      const cutoutNum = Number(cutout);

      this.chartDraft = {
        type: current.type || 'bar',
        legendDisplay: !!(plugins.legend?.display ?? true),
        legendPosition: plugins.legend?.position || 'top',
        titleDisplay: !!(plugins.title?.display ?? false),
        titleText: plugins.title?.text || '',
        tooltipEnabled: !!(plugins.tooltip?.enabled ?? true),
        maintainAspectRatio: !!(options.maintainAspectRatio ?? false),
        animationDuration: this.toNumber(options.animation?.duration, 700),
        animationEasing: options.animation?.easing || 'easeOutQuart',
        stacked: !!(x.stacked ?? y.stacked ?? false),
        showGridX: !!(x.grid?.display ?? true),
        showGridY: !!(y.grid?.display ?? true),
        beginAtZero: !!(y.beginAtZero ?? false),
        indexAxis: options.indexAxis || 'x',
        cutout: Number.isFinite(cutoutNum) ? cutoutNum : 50,
        cutOffCount: this.toNumber(current.dataOptions?.cutOffCount, 0)
      };
      return;
    }

    if (action === 'kanban') {
      this.kanbanDraft = {
        statusField: current.statusField || '',
        colorField: current.colorField || '',
        wipLimitField: current.wipLimitField || '',
        wipLimitHardField: current.wipLimitHardField || '',
        assignedUserIdField: current.assignedUserIdField || '',
        titleField: current.titleField || '',
        descriptionField: current.descriptionField || '',
        cardSubtitleField: current.cardSubtitleField || '',
        clickAction: current.clickAction || 'detail',
        persistMode: current.persistMode || 'immediate',
        statusColumns: Array.isArray(current.statusColumns)
          ? current.statusColumns.map((x: any, idx: number) => ({
              value: x?.value,
              label: x?.label || '',
              color: x?.color || '',
              order: this.toNumber(x?.order, idx),
              wipLimit: this.toNullableNumber(x?.wipLimit),
              wipLimitHard: !!x?.wipLimitHard
            }))
          : []
      };
    }
  }

  /**
   * Aggiunge una nuova colonna status nella bozza kanban.
   */
  addKanbanStatusColumn(): void {
    this.kanbanDraft.statusColumns = Array.isArray(this.kanbanDraft.statusColumns) ? this.kanbanDraft.statusColumns : [];
    this.kanbanDraft.statusColumns.push({
      value: '',
      label: '',
      color: '',
      order: this.kanbanDraft.statusColumns.length,
      wipLimit: null,
      wipLimitHard: false
    });
  }

  /**
   * Rimuove una colonna status dalla bozza kanban.
   */
  removeKanbanStatusColumn(index: number): void {
    if (!Array.isArray(this.kanbanDraft.statusColumns) || index < 0 || index >= this.kanbanDraft.statusColumns.length) {
      return;
    }
    this.kanbanDraft.statusColumns.splice(index, 1);
  }

          /**
   * Costruisce il payload/struttura dati prodotto da `buildChartOptionsFromDraft` orchestrando le chiamate `max` e `toNumber`.
   * @returns Valore di tipo `any` restituito dal metodo.
   */
  private buildChartOptionsFromDraft(): any {
    const options: any = {
      maintainAspectRatio: !!this.chartDraft.maintainAspectRatio,
      responsive: true,
      animation: {
        duration: Math.max(0, this.toNumber(this.chartDraft.animationDuration, 700)),
        easing: this.chartDraft.animationEasing || 'easeOutQuart'
      },
      plugins: {
        legend: {
          display: !!this.chartDraft.legendDisplay,
          position: this.chartDraft.legendPosition || 'top'
        },
        title: {
          display: !!this.chartDraft.titleDisplay,
          text: this.chartDraft.titleText || ''
        },
        tooltip: {
          enabled: !!this.chartDraft.tooltipEnabled
        }
      }
    };

    if (['bar', 'line', 'scatter', 'bubble'].includes(this.chartDraft.type)) {
      options.scales = {
        x: {
          stacked: !!this.chartDraft.stacked,
          grid: { display: !!this.chartDraft.showGridX }
        },
        y: {
          stacked: !!this.chartDraft.stacked,
          beginAtZero: !!this.chartDraft.beginAtZero,
          grid: { display: !!this.chartDraft.showGridY }
        }
      };
    }

    if (this.chartDraft.type === 'bar') {
      options.indexAxis = this.chartDraft.indexAxis || 'x';
    }

    if (['doughnut', 'pie'].includes(this.chartDraft.type)) {
      const cutout = Math.max(0, Math.min(95, this.toNumber(this.chartDraft.cutout, 50)));
      options.cutout = `${cutout}%`;
    }

    return options;
  }

            /**
   * Gestisce la logica operativa di `toNumber` in modo coerente con l'implementazione corrente.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @param fallback Parametro utilizzato dal metodo nel flusso elaborativo.
   * @returns Valore numerico prodotto da `toNumber` (indice, conteggio o misura operativa).
   */
  private toNumber(value: any, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

            /**
   * Gestisce la logica di `toNullableNumber` orchestrando le chiamate `Number` e `isFinite`.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Valore di tipo `number | null` costruito o risolto dal metodo.
   */
  private toNullableNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

              /**
   * Gestisce la logica operativa di `unwrapValue` in modo coerente con l'implementazione corrente.
   * @param value Valore in ingresso elaborato o normalizzato dal metodo.
   * @returns Risultato elaborato da `unwrapValue` e restituito al chiamante.
   */
  private unwrapValue(value: any): any {
    if (!value) {
      return value;
    }

    if (typeof value === 'object' && 'value' in value && typeof value.subscribe === 'function') {
      return this.unwrapValue((value as any).value);
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.unwrapValue(v));
    }

    if (typeof value === 'object') {
      const out: any = {};
      Object.keys(value).forEach((k) => {
        out[k] = this.unwrapValue(value[k]);
      });
      return out;
    }

    return value;
  }
}


