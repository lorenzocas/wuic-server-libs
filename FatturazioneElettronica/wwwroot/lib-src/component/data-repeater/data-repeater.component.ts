import { NgTemplateOutlet, NgComponentOutlet } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { DataSourceComponent } from '../data-source/data-source.component';
import { DynamicRepeaterTemplateComponent } from '../dynamic-repeater-template/dynamic-repeater-template.component';
import { BehaviorSubject, Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import type { Table } from 'primeng/table';

import { LazyListGridComponent } from '../list-grid/list-grid.lazy.component';
import { LazyParametricDialogComponent } from '../parametric-dialog/parametric-dialog.lazy.component';
import { LazyMapListComponent } from '../map-list/map-list.lazy.component';
import { LazySchedulerListComponent } from '../scheduler-list/scheduler-list.lazy.component';
import { LazySpreadsheetListSfComponent } from '../spreadsheet-list-sf/spreadsheet-list-sf.lazy.component';
import { LazyTreeListComponent } from '../tree-list/tree-list.lazy.component';
import { LazyChartListComponent } from '../chart-list/chart-list.lazy.component';
import { LazyCarouselListComponent } from '../carousel-list/carousel-list.lazy.component';
import { LazyKanbanListComponent } from '../kanban-list/kanban-list.lazy.component';

import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

@Component({
  selector: 'wuic-data-repeater',
  imports: [NgComponentOutlet, TranslateModule, ButtonModule],
  templateUrl: './data-repeater.component.html',
  styleUrl: './data-repeater.component.css'
})
export class DataRepeaterComponent implements OnInit, OnChanges, OnDestroy {
  /**
   * Riferimento al componente archetype renderizzato dinamicamente.
   */
  @ViewChild(NgComponentOutlet) archetypeOutlet?: NgComponentOutlet;
  /**
   * Input dal componente padre per datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  /**
   * Input dal componente padre per hardcoded datasource; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedDatasource: DataSourceComponent;

  /**
   * Input dal componente padre per action; usata nella configurazione e nel rendering del componente.
   */
  @Input() action: BehaviorSubject<string>;
  /**
   * Input dal componente padre per hardcoded action; usata nella configurazione e nel rendering del componente.
   */
  @Input() hardcodedAction: string;

  /**
   * Input dal componente padre per field; usata nella configurazione e nel rendering del componente.
   */
  @Input() field: MetadatiColonna;
  /**
   * Input dal componente padre per record; usata nella configurazione e nel rendering del componente.
   */
  @Input() record: any;

  /**
   * Input dal componente padre per row custom select; usata nella configurazione e nel rendering del componente.
   */
  @Input() rowCustomSelect: (rowData: any, $event: any, dt: Table) => void;
  /**
   * Input dal componente padre per hide toolbar; quando true nasconde la toolbar
   * nei componenti archetype che la supportano.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Input dal componente padre per is edit form; quando true abilita comportamenti specifici per edit form.
   */
  @Input() isEditForm: boolean = false;
  /**
   * Quando true forza il repeater a riempire verticalmente il contenitore padre
   * e ad applicare la catena flex/min-height per archetype annidati.
   */
  @Input() fillHeight: boolean = false;
  /**
   * Evento emesso verso il componente padre per notificare cambi di stato relativi a template ready.
   */
  @Output() templateReady = new EventEmitter<string>();
  /**
   * Evento emesso quando e disponibile l'istanza dell'archetype effettivo renderizzato.
   */
  @Output() archetypeInstanceReady = new EventEmitter<{ archetype: string; instance: any }>();
  /**
   * Evento relay generico degli output emessi dal componente archetype figlio.
   */
  @Output() archetypeEvent = new EventEmitter<{ archetype: string; eventName: string; payload: any; instance: any }>();
  /**
   * Evento comune emesso quando l'archetype figlio emette un output che contiene `DataBound`.
   */
  @Output() archetypeDataBound = new EventEmitter<{ archetype: string; eventName: string; payload: any; instance: any }>();

  /**
   * Classe host applicata in modo opt-in per abilitare il layout "fill height".
   */
  @HostBinding('class.wuic-data-repeater-fill-height')
  get fillHeightClass(): boolean {
    return !!this.fillHeight;
  }

  /**
   * Proprieta di stato del componente per archetype, usata dalla logica interna e dal template.
   */
  archetype: string;
  /**
   * Proprieta di stato del componente per archetypes, usata dalla logica interna e dal template.
   */
  archetypes = MetadataProviderService.widgetDefinition.archetypes;
  /**
   * Proprieta di stato del componente per lazy archetype components, usata dalla logica interna e dal template.
   */
  private readonly lazyArchetypeComponents: { [key: string]: any } = {
    list: LazyListGridComponent,
    dialog: LazyParametricDialogComponent,
    edit: LazyParametricDialogComponent,
    detail: LazyParametricDialogComponent,
    map: LazyMapListComponent,
    scheduler: LazySchedulerListComponent,
    spreadsheet: LazySpreadsheetListSfComponent,
    tree: LazyTreeListComponent,
    chart: LazyChartListComponent,
    carousel: LazyCarouselListComponent,
    kanban: LazyKanbanListComponent
  };
  /**
   * Proprieta di stato del componente per eager archetype components, usata dalla logica interna e dal template.
   */
  private readonly eagerArchetypeComponents: { [key: string]: any } = {
    list: LazyListGridComponent,
    dialog: LazyParametricDialogComponent,
    edit: LazyParametricDialogComponent,
    detail: LazyParametricDialogComponent,
    map: LazyMapListComponent,
    scheduler: LazySchedulerListComponent,
    spreadsheet: LazySpreadsheetListSfComponent,
    tree: LazyTreeListComponent,
    chart: LazyChartListComponent,
    carousel: LazyCarouselListComponent,
    kanban: LazyKanbanListComponent
  };

  /**
   * Configurazione di presentazione per repeater template, usata nel rendering del componente.
   */
  repeaterTemplate: any;
  /**
   * Proprieta di stato del componente per repeater inputs, usata dalla logica interna e dal template.
   */
  repeaterInputs: Record<string, any> = {};
  /**
   * Proprieta di stato del componente per action subscription, usata dalla logica interna e dal template.
   */
  private actionSubscription?: Subscription;
  /**
   * Proprieta di stato del componente per pending render handle, usata dalla logica interna e dal template.
   */
  private pendingRenderHandle?: ReturnType<typeof setTimeout>;
  /**
   * Proprieta di stato del componente per archetype output subscriptions, usata dalla logica interna e dal template.
   */
  private archetypeOutputSubscriptions: Subscription[] = [];
  /**
   * Proprieta di stato del componente per archetype output wire handle, usata dalla logica interna e dal template.
   */
  private archetypeOutputWireHandle?: ReturnType<typeof setTimeout>;
  /**
   * Numero massimo di tentativi per collegare gli output quando il lazy wrapper
   * non ha ancora materializzato il componente interno.
   */
  private readonly maxOutputWireAttempts = 300;
  /**
   * Intervallo retry (ms) per il wiring output archetype lazy.
   */
  private readonly outputWireRetryDelayMs = 100;
  /**
   * Proprieta di stato del componente per rendered archetype instance, usata dalla logica interna e dal template.
   */
  public renderedArchetypeInstance: IDataBoundHostComponent | null = null;

  /**
   * Datasource effettivo usato dal template: priorita allo stream `datasource`,
   * fallback su `hardcodedDatasource` nei contesti embedded.
   */
  get effectiveDatasource(): DataSourceComponent | null {
    return this.datasource?.value || this.hardcodedDatasource || null;
  }

  /**
   * ViewChild logico del componente archetype effettivamente renderizzato.
   */
  get renderedArchetypeViewChild(): any {
    return this.renderedArchetypeInstance;
  }

  /**
   * Restituisce in modo tipizzato l'istanza archetype renderizzata.
   * @returns Istanza archetype corrente oppure `null`.
   */
  getRenderedArchetypeViewChild<T = any>(): T | null {
    return (this.renderedArchetypeInstance as T) || null;
  }

  /**
   * Costruttore vuoto: il componente viene configurato interamente tramite `@Input`
   * e tramite la sottoscrizione a `action` in `ngOnInit`.
   */
  constructor() {

  }

  /**
   * Normalizza il valore `action` ricevuto dal chiamante (anche oggetti con `value/key/id`)
   * in una chiave archetype canonica (`list`, `edit`, `chart`, ...).
   * Gestisce alias noti e rimuove il suffisso `-list`.
   * @param action Azione raw proveniente da input/stream.
   * @returns Nome archetype normalizzato.
   */
  private normalizeArchetypeAction(action: any): string {
    let value = action;
    let depth = 0;
    while (value && typeof value === 'object' && depth < 3) {
      const next = value.value
        ?? value.key
        ?? value.action
        ?? value.label
        ?? value.id
        ?? value._value
        ?? value.currentValue
        ?? value.current
        ?? value.selected;

      if (next === undefined || next === null || next === value) {
        break;
      }

      value = next;
      depth++;
    }

    let normalized = String(value || '').trim().toLowerCase();
    const aliases: { [key: string]: string } = {
      'list-grid': 'list',
      'edit-form': 'edit',
      'detail-form': 'detail',
      'chart-list': 'chart',
      'map-list': 'map',
      'carousel-list': 'carousel',
      'kanban-list': 'kanban'
    };

    if (aliases[normalized]) {
      normalized = aliases[normalized];
    }

    if (normalized.endsWith('-list')) {
      normalized = normalized.slice(0, -5);
    }

    return normalized;
  }

  /**
   * Rileva se il repeater e usato in contesto designer/dashboard per scegliere
   * componenti eager invece delle versioni lazy.
   * @returns `true` quando l'hash route indica pagine designer/dashboard.
   */
  private isDesignerLikeContext(): boolean {
    const hash = String(window?.location?.hash || '').toLowerCase();
    return hash === '#/designer'
      || hash.includes('/dashboard')
      || hash.includes('/designer?')
      || hash.includes('/designer/');
  }

  /**
 * Rileva se l'URL corrente e una route di edit (`.../edit/...`) anche in hash routing.
 * @returns `true` quando la navigazione corrente e in contesto edit.
 */
  private isEditRouteContext(): boolean {
    const hash = String(window?.location?.hash || '').toLowerCase();
    const path = String(window?.location?.pathname || '').toLowerCase();
    const combined = `${hash} ${path}`;
    return /(^|\/)edit(\/|$)/.test(combined);
  }

  /**
 * Risolve il flag `isEditForm` combinando input esplicito, archetype e URL corrente.
 * @param action Archetype correntemente renderizzato.
 * @returns Flag finale da inoltrare al componente figlio.
 */
  private resolveIsEditForm(action: string): boolean {
    return !!this.isEditForm || action === 'edit' || this.isEditRouteContext();
  }

  /**
* Risolge il valore finale in `resolveArchetype` combinando contesto runtime e regole locali.
* @param action Parametro utilizzato dal metodo nel flusso elaborativo.
* @returns Valore di tipo `{ action: string; markup: string; component?: any } | null` prodotto da `resolveArchetype`.
*/
  private resolveArchetype(action?: string): { action: string; markup?: string; component?: any } | null {
    const requestedAction = this.normalizeArchetypeAction(action);
    const fallbackAction = 'list';
    const selectedAction = requestedAction && this.archetypes?.[requestedAction]
      ? requestedAction
      : fallbackAction;
    const selected = this.archetypes?.[selectedAction];

    if (!selected?.markup && !selected?.component) {
      return null;
    }

    const archetypeComponents = this.isDesignerLikeContext()
      ? this.eagerArchetypeComponents
      : this.lazyArchetypeComponents;

    return {
      action: selectedAction,
      markup: selected.markup,
      component: selected.component || archetypeComponents[selectedAction]
    };
  }

  /**
   * Costruisce gli `@Input` da passare al componente figlio in base all'archetype selezionato.
   * `list` riceve anche `rowCustomSelect`; `dialog/edit` ricevono solo datasource;
   * `detail` e equivalente a `edit` ma forza `readOnly=true`;
   * `map/scheduler/spreadsheet/tree/chart/carousel` ricevono anche `parentRecord`;
   * gli archetype custom (default) ricevono `action`, `record`, `field` e `rowCustomSelect`.
   * @param action Archetype normalizzato per cui preparare gli input.
   * @returns Oggetto input da assegnare a `repeaterInputs`.
   */
  private buildArchetypeInputs(action: string): Record<string, any> {
    const baseInputs: Record<string, any> = {
      datasource: this.datasource,
      hardcodedDatasource: this.hardcodedDatasource
    };
    const resolvedIsEditForm = this.resolveIsEditForm(action);

    switch (action) {
      case 'list':
        return {
          ...baseInputs,
          hideToolbar: this.hideToolbar,
          rowCustomSelect: this.rowCustomSelect
        };
      case 'dialog':
      case 'edit':
        return {
          ...baseInputs,
          hideToolbar: this.hideToolbar,
          isEditForm: resolvedIsEditForm
        };
      case 'detail':
        return {
          ...baseInputs,
          hideToolbar: this.hideToolbar,
          readOnly: true
        };
      case 'map':
      case 'scheduler':
      case 'spreadsheet':
      case 'tree':
      case 'chart':
      case 'carousel':
      case 'kanban':
        return {
          ...baseInputs,
          hideToolbar: this.hideToolbar,
          hardcodedRoute: undefined,
          parentRecord: this.record,
          parentMetaInfo: undefined
        };
      default:
        return {
          ...baseInputs,
          action: this.action,
          record: this.record,
          field: this.field,
          rowCustomSelect: this.rowCustomSelect
        };
    }
  }

  /**
   * Risolve l'archetype richiesto, prepara gli input del componente figlio
   * e notifica `templateReady` con l'azione effettivamente renderizzata.
   * @param action Azione richiesta (opzionale).
   */
  private renderArchetype(action?: string): void {
    const resolved = this.resolveArchetype(action);
    if (!resolved) {
      this.repeaterTemplate = null;
      this.repeaterInputs = {};
      return;
    }

    this.archetype = resolved.action;
    this.repeaterInputs = this.buildArchetypeInputs(resolved.action);
    this.repeaterTemplate = resolved.component || DynamicRepeaterTemplateComponent.getComponentFromTemplate(resolved.markup, String(this.effectiveDatasource?.metaInfo?.tableMetadata?.md_route_name || ''), 'md_repeater_template (' + resolved.action + ')');
    queueMicrotask(() => {
      this.templateReady.emit(resolved.action);
      this.scheduleWireArchetypeOutputs(resolved.action);
    });
    // this.templateReady.emit(resolved.action)
  }

  /**
   * Pianifica il wiring degli output dell'archetype renderizzato dopo il ciclo di render.
   * @param action Archetype corrente.
   */
  private scheduleWireArchetypeOutputs(action: string): void {
    if (this.archetypeOutputWireHandle) {
      clearTimeout(this.archetypeOutputWireHandle);
      this.archetypeOutputWireHandle = undefined;
    }

    this.archetypeOutputWireHandle = setTimeout(() => {
      this.archetypeOutputWireHandle = undefined;
      this.wireArchetypeOutputs(action, 0);
    }, 0);
  }

  /**
   * Risolve l'istanza "leaf" effettivamente renderizzata, attraversando eventuali
   * wrapper lazy basati su `NgComponentOutlet`.
   * @param instance Istanza iniziale ottenuta dal data-repeater outlet.
   * @returns Istanza concreta dell'archetype renderizzato.
   */
  private resolveLeafArchetypeInstance(instance: any): any {
    let current = instance;
    let safety = 0;
    while (current && safety < 6) {
      const nested = current?.innerOutlet?.componentInstance;
      if (!nested || nested === current) {
        break;
      }
      current = nested;
      safety++;
    }
    return current;
  }

  /**
   * Esegue il retry del wiring output per archetype lazy non ancora pronti.
   * @param action Archetype corrente.
   * @param attempt Numero tentativo corrente.
   */
  private retryWireArchetypeOutputs(action: string, attempt: number): void {
    if (attempt >= this.maxOutputWireAttempts) {
      return;
    }
    if (this.archetypeOutputWireHandle) {
      clearTimeout(this.archetypeOutputWireHandle);
      this.archetypeOutputWireHandle = undefined;
    }
    this.archetypeOutputWireHandle = setTimeout(() => {
      this.archetypeOutputWireHandle = undefined;
      this.wireArchetypeOutputs(action, attempt + 1);
    }, this.outputWireRetryDelayMs);
  }

  /**
   * Collega automaticamente gli `EventEmitter` esposti dall'archetype figlio
   * e li rilancia come eventi comuni a livello data-repeater.
   * @param action Archetype corrente.
   */
  private wireArchetypeOutputs(action: string, attempt: number = 0): void {
    this.clearArchetypeOutputSubscriptions();

    const wrapperInstance = this.archetypeOutlet?.componentInstance;
    const instance = this.resolveLeafArchetypeInstance(wrapperInstance);
    this.renderedArchetypeInstance = (instance as IDataBoundHostComponent) || null;
    if (!instance) {
      this.retryWireArchetypeOutputs(action, attempt);
      return;
    }

    const candidates = Object.keys(instance).filter((eventName) => {
      const candidate = (instance as any)[eventName];
      return !!candidate && typeof candidate.subscribe === 'function' && typeof candidate.emit === 'function';
    });

    if (!candidates.length) {
      this.retryWireArchetypeOutputs(action, attempt);
      return;
    }

    this.archetypeInstanceReady.emit({ archetype: action, instance });

    candidates.forEach((eventName) => {
      const candidate = (instance as any)[eventName];
      const sub = candidate.subscribe((payload: any) => {
        const relay = { archetype: action, eventName, payload, instance };
        this.archetypeEvent.emit(relay);
        if (String(eventName).toLowerCase().includes('databound')) {
          this.archetypeDataBound.emit(relay);
        }
      });
      this.archetypeOutputSubscriptions.push(sub);
    });
  }

  /**
   * Rilascia le sottoscrizioni agli output del figlio archetype.
   */
  private clearArchetypeOutputSubscriptions(): void {
    this.archetypeOutputSubscriptions.forEach((s) => s?.unsubscribe?.());
    this.archetypeOutputSubscriptions = [];
  }

  /**
   * Riallinea gli input del componente figlio quando cambiano i binding runtime
   * (es. `hideToolbar`) senza aspettare un cambio archetype.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.repeaterTemplate) {
      return;
    }

    const datasourceChanged = !!changes['datasource'] || !!changes['hardcodedDatasource'];
    const currentAction = this.normalizeArchetypeAction(this.archetype || this.hardcodedAction || this.action?.value || 'list');

    if (datasourceChanged) {
      this.clearArchetypeOutputSubscriptions();
      this.renderedArchetypeInstance = null;
      this.repeaterTemplate = null;
      this.repeaterInputs = {};

      if (this.pendingRenderHandle) {
        clearTimeout(this.pendingRenderHandle);
      }

      this.pendingRenderHandle = setTimeout(() => {
        this.renderArchetype(currentAction || 'list');
        this.pendingRenderHandle = undefined;
      }, 0);
      return;
    }

    if (changes['hideToolbar'] || changes['isEditForm']) {
      this.repeaterInputs = this.buildArchetypeInputs(currentAction);
    }
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    if (this.hardcodedAction) {
      this.renderArchetype(this.hardcodedAction);
    } else {
      if (!this.action) {
        this.renderArchetype('list');
        return;
      }

      this.actionSubscription?.unsubscribe();
      this.actionSubscription = this.action.subscribe((action) => {
        this.clearArchetypeOutputSubscriptions();
        this.renderedArchetypeInstance = null;
        if (this.repeaterTemplate) {
          this.repeaterTemplate = null;
        }

        if (this.pendingRenderHandle) {
          clearTimeout(this.pendingRenderHandle);
          this.pendingRenderHandle = undefined;
        }

        this.pendingRenderHandle = setTimeout(() => {
          this.renderArchetype(action || 'list');
          this.pendingRenderHandle = undefined;
        }, 100);
      });
    }
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.actionSubscription?.unsubscribe();
    this.clearArchetypeOutputSubscriptions();
    this.renderedArchetypeInstance = null;
    if (this.archetypeOutputWireHandle) {
      clearTimeout(this.archetypeOutputWireHandle);
      this.archetypeOutputWireHandle = undefined;
    }
    if (this.pendingRenderHandle) {
      clearTimeout(this.pendingRenderHandle);
      this.pendingRenderHandle = undefined;
    }
  }

}
