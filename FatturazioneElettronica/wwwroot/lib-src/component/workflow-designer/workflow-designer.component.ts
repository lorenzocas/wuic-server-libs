import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { NgClass } from '@angular/common';
import { ClassicPreset, GetSchemes, NodeEditor } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularArea2D, AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/21';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ContextMenuModule } from 'primeng/contextmenu';
import type { MenuItem } from 'primeng/api';
import type { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import type { ContextMenu } from 'primeng/contextmenu';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { DataProviderService } from '../../service/data-provider.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetadataEditorComponent } from '../metadata-editor/metadata-editor.component';
import { WorkflowDesignerLayoutHelper } from './workflow-designer-layout.helper';
import { WorkflowDesignerNodeComponent } from './workflow-designer-node.component';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import { WuicClientException } from '../../exception/WuicClientException';
import { WuicErrorCodes } from '../../exception/WuicErrorCodes';
import { GlobalHandler } from '../../handler/GlobalHandler';

type WorkflowNode = ClassicPreset.Node<{ in?: ClassicPreset.Socket }, { out?: ClassicPreset.Socket }>;
type WorkflowConnection = ClassicPreset.Connection<WorkflowNode, WorkflowNode>;
type WorkflowSchemes = GetSchemes<WorkflowNode, WorkflowConnection>;
type WorkflowAreaExtra = AngularArea2D<WorkflowSchemes>;

type PaletteNodeDefinition = {
  type: 'start' | 'route' | 'action' | 'condition' | 'end';
  label: string;
  description: string;
};

type WorkflowActionType = {
  id: number;
  description: string;
};

type WorkflowActionScope = {
  id: number;
  description: string;
};

type RouteMetadataBundle = {
  route: string;
  tableMetadata: any;
  columnMetadata: any[];
  tableActions: any[];
  columnActions: any[];
  tablePermissions: any[];
  columnPermissions: any[];
  tableStyles: any[];
  columnStyles: any[];
};

type WorkflowMenuAuthorization = {
  mmid: number;
  muamid: number;
  muamview: 0 | 1;
  ruoloid: number;
  utenteid: number;
};

type WorkflowStartMenuItem = {
  mm_id: number;
  mm_parent_id: number;
  mm_nome_menu: string;
  mm_display_string_menu: string;
  mm_tooltip_menu: string;
  mm_uri_menu: string;
  mm_ordine: number;
  mm_is_visible_by_default: boolean;
  _Metadati_Utenti_Autorizzazioni_Menus: WorkflowMenuAuthorization[];
};

type WorkflowNodeSerialized = {
  id: string;
  label: string;
  type: string;
  route: string;
  action: string;
  routeSourceType?: 'route' | 'dashboard';
  dashboardBoardcontent?: string;
  dashboardDatasources?: WorkflowDashboardDatasourceMetadata[];
  actionTypeId?: number;
  actionType?: string;
  actionScopeId?: number;
  actionScope?: string;
  routeNodeId?: string;
  metadataTargetType?: 'table_action' | 'column_button' | '';
  metadataTargetId?: number;
  x: number;
  y: number;
  routeMetadata?: RouteMetadataBundle | null;
  startMenus?: WorkflowStartMenuItem[];
  startMenuCaption?: string;
  startInheritMetadata?: boolean;
  startExclusiveMenu?: boolean;
  startShowExit?: boolean;
};

type WorkflowConnectionSerialized = {
  id: string;
  source: string;
  sourceOutput: string;
  target: string;
  targetInput: string;
};

type WorkflowDashboardDatasourceMetadata = {
  uniqueName: string;
  route: string;
  metadataBundle: RouteMetadataBundle | null;
};

@Component({
  selector: 'wuic-workflow-designer',
  standalone: true,
  imports: [NgClass, FormsModule, DialogModule, SelectModule, AutoCompleteModule, MenuModule, ContextMenuModule, TranslateModule, DataSourceComponent, MetadataEditorComponent],
  templateUrl: './workflow-designer.component.html',
  styleUrl: './workflow-designer.component.css'
})
/**
 * Designer visuale dei workflow applicativi basato su grafo nodi/connessioni (Rete).
 *
 * Scopo del componente:
 * - modellare flussi tra nodi Start/Route/Action/Condition/End,
 * - collegare ogni route/action al relativo metadata bundle (azioni, colonne button, permessi, stili),
 * - mantenere sincronizzati canvas, metadata editor e payload persistito.
 *
 * Responsabilita principali:
 * - gestione interattiva del grafo (drag&drop palette, auto-connect, auto-layout, context menu),
 * - editing contestuale di metadata route/action e menu di avvio workflow,
 * - serializzazione completa del workflow (nodi, connessioni, route metadata) e restore.
 *
 * Persistenza end-to-end:
 * - `graph_json` -> `_wuic_workflow_graph.wg_graph_json`,
 * - dettaglio route metadata -> `_wuic_workflow_graph_route_metadata`
 *   (`node_client_id`, `route_name`, `route_action`, `metadata_json`),
 * tramite API `MetaService.save/load/get/rename/deleteWorkflowGraph`.
 */
export class WorkflowDesignerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('workflowCanvas', { static: true }) workflowCanvasRef?: ElementRef<HTMLDivElement>;
  @ViewChild('primeContextMenu') primeContextMenu?: ContextMenu;
  @ViewChild('routeMetadataDs') routeMetadataDs?: DataSourceComponent;
  @ViewChild('startMenuDs') startMenuDs?: DataSourceComponent;
  @ViewChild('menuAuthDs') menuAuthDs?: DataSourceComponent;
  @ViewChild('routeMetadataEditor') routeMetadataEditor?: MetadataEditorComponent;
  @ViewChild('actionMetadataEditor') actionMetadataEditor?: MetadataEditorComponent;
  @Output() workflowChange = new EventEmitter<any>();

  readonly paletteNodes: PaletteNodeDefinition[] = [
    { type: 'start', label: 'Start', description: '' },
    { type: 'route', label: 'Route', description: '' },
    { type: 'action', label: 'Action', description: '' },
    { type: 'condition', label: 'Condition', description: '' },
    { type: 'end', label: 'End', description: '' }
  ];

  private readonly socket = new ClassicPreset.Socket('workflow');
  private editor?: NodeEditor<WorkflowSchemes>;
  private area?: AreaPlugin<WorkflowSchemes, WorkflowAreaExtra>;
  contextMenuItems: MenuItem[] = [];
  contextMenuNodeId: string | null = null;
  contextMenuNodeType = '';
  routePopupVisible = false;
  routeSourceOptions: Array<{ label: string; value: 'route' | 'dashboard' }> = [
    { label: 'Route', value: 'route' },
    { label: 'Dashboard', value: 'dashboard' }
  ];
  selectedRouteSourceType: 'route' | 'dashboard' = 'route';
  routeOptions: Array<{ label: string; value: string }> = [];
  dashboardOptions: Array<{ label: string; value: string; boardcontent: string }> = [];
  filteredRouteOptions: Array<{ label: string; value: string }> = [];
  filteredDashboardOptions: Array<{ label: string; value: string; boardcontent: string }> = [];
  routeActionOptions: Array<{ label: string; value: string }> = [
    { label: 'list', value: 'list' },
    { label: 'map', value: 'map' },
    { label: 'carousel', value: 'carousel' },
    { label: 'chart', value: 'chart' },
    { label: 'spreadsheet', value: 'spreadsheet' },
    { label: 'tree', value: 'tree' },
    { label: 'scheduler', value: 'scheduler' },
    { label: 'dashboard', value: 'dashboard' }
  ];
  selectedRouteName = '';
  selectedDashboardRoute = '';
  selectedRouteAction = 'list';
  private pendingRouteDrop: {
    x: number;
    y: number;
    sourceStartNodeId?: string;
    sourceActionNodeId?: string;
    sourceRouteNodeId?: string;
  } | null = null;
  actionPopupVisible = false;
  actionTypeOptions: Array<{ label: string; value: number }> = [];
  selectedActionTypeId: number | null = null;
  actionScopeOptions: Array<{ label: string; value: number }> = [
    { label: 'azione_tab', value: 0 },
    { label: 'azione_col', value: 1 }
  ];
  selectedActionScopeId: number | null = null;
  private pendingActionDrop: { x: number; y: number; routeNodeId: string } | null = null;
  private readonly actionTypeDictionaryValue =
    '0@@generic.navigation.action||1@@generic.method.call.action||2@@generate.file.action||3@@export.action||4@@call.stored.action||5@@approve.action||6@@parametric.dialog.action||7@@generic.client.synchronous.action||8@@generic.client.async.action||9@@workflow.route.payload.dialog.action';
  routeMetadataDialogVisible = false;
  routeMetadataRoute = '';
  workflowKey = '';
  workflowName = '';
  savingWorkflow = false;
  loadingWorkflow = false;
  savedGraphOptions: Array<{ label: string; value: string; name: string }> = [];
  selectedSavedGraphKey = '';
  reopenWorkflowDialogVisible = false;
  reopenDialogSelectedGraphKey = '';
  workflowOptionsDialogVisible = false;
  workflowOptionsStartNodeId = '';
  workflowOptionsCaption = '';
  workflowOptionsInheritMetadata = false;
  workflowOptionsExclusiveMenu = true;
  workflowOptionsShowExit = true;
  loadingSavedGraphs = false;
  graphActionsMenuItems: MenuItem[] = [];
  runnerActionsMenuItems: MenuItem[] = [];
  private routeMetadataNodeId: string | null = null;
  private routeMetadataDashboardDatasourceUniqueName: string | null = null;
  private lastCreatedRouteNodeId: string | null = null;
  private pendingMenuAuthContext: { startNodeId: string; menuId: number; mode: 'insert' | 'edit'; muamId?: number } | null = null;
  private pendingStartMenuContext: { startNodeId: string; mode: 'insert' | 'edit'; menuId?: number } | null = null;
  private localMenuIdSeed = -1;
  private autoArrangeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoArrangeDelayMs = 260;
  private readonly pendingAutoArrangeSeeds = new Set<string>();
  relayoutEnabled = true;
  private readonly startMenuRoute = ' metadati  menu';
  private readonly menuAuthRoute = ' mtdt  tnt  trizzazioni  menus';
  readonly routeMetadataSaveCallback: Function;
  readonly startMenuSaveCallback: Function;
  readonly menuAuthSaveCallback: Function;

  constructor(private injector: Injector, private dataSrv: DataProviderService) {
    this.paletteNodes[0].description = this.t('workflow.node.start_desc', 'Nodo di ingresso del workflow');
    this.paletteNodes[1].description = this.t('workflow.node.route_desc', 'Nodo route applicativa');
    this.paletteNodes[2].description = this.t('workflow.node.action_desc', 'Nodo azione applicativa');
    this.paletteNodes[3].description = this.t('workflow.node.condition_desc', 'Nodo branch condizionale');
    this.paletteNodes[4].description = this.t('workflow.node.end_desc', 'Nodo di uscita del workflow');
    this.actionScopeOptions = [
      { label: this.t('workflow.action_scope.table', 'azione_tab'), value: 0 },
      { label: this.t('workflow.action_scope.column', 'azione_col'), value: 1 }
    ];
    const owner = this;
    this.routeMetadataSaveCallback = async function routeMetadataSave(data: any, original: any, editorKey?: string) {
      await owner.handleRouteMetadataSave(data, original, editorKey);
      return data;
    };
    this.startMenuSaveCallback = function startMenuSave(data: any, original: any) {
      return owner.handleStartMenuSave(data, original);
    };
    this.menuAuthSaveCallback = function menuAuthSave(data: any, original: any) {
      return owner.handleMenuAuthorizationSave(data, original);
    };
  }

  /**
   * Inizializza il canvas Rete dopo il render:
   * crea editor/area/plugin di connessione+render Angular, collega il pipe eventi
   * per emettere `workflowChange`, carica i grafi salvati e garantisce il nodo Start iniziale.
   */
  async ngAfterViewInit(): Promise<void> {
    const canvas = this.workflowCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const editor = new NodeEditor<WorkflowSchemes>();
    const area = new AreaPlugin<WorkflowSchemes, WorkflowAreaExtra>(canvas);
    const connection = new ConnectionPlugin<WorkflowSchemes, WorkflowAreaExtra>();
    const render = new AngularPlugin<WorkflowSchemes, WorkflowAreaExtra>({ injector: this.injector });

    connection.addPreset(ConnectionPresets.classic.setup());
    render.addPreset(
      AngularPresets.classic.setup({
        customize: {
          node: () => WorkflowDesignerNodeComponent
        }
      })
    );

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl()
    });
    AreaExtensions.simpleNodesOrder(area);

    editor.use(area);
    area.use(connection);
    area.use(render);

    editor.addPipe((context) => {
      if (
        context.type === 'nodecreated'
        || context.type === 'noderemoved'
        || context.type === 'connectioncreated'
        || context.type === 'connectionremoved'
      ) {
        this.emitWorkflow();
      }
      return context;
    });

    this.editor = editor;
    this.area = area;
    this.actionTypeOptions = this.parseActionTypeOptions(this.actionTypeDictionaryValue);
    await this.refreshSavedGraphs();
    this.workflowKey = '';
    this.workflowName = '';
    this.selectedSavedGraphKey = '';
    this.reopenDialogSelectedGraphKey = '';
    this.refreshToolbarMenuItems();
    await this.ensureInitialStartNode();

    this.emitWorkflow();
  }

  /**
   * Cleanup del componente: cancella timer di auto-layout pendenti e distrugge l'area Rete.
   */
  ngOnDestroy(): void {
    if (this.autoArrangeTimer) {
      clearTimeout(this.autoArrangeTimer);
      this.autoArrangeTimer = null;
    }
    this.area?.destroy();
  }

  /**
   * Avvia il drag dalla palette impostando nel `dataTransfer` il tipo nodo
   * (`application/wuic-workflow-node-type`) usato dal drop sul canvas.
   */
  onPaletteDragStart(event: DragEvent, node: PaletteNodeDefinition): void {
    if (!this.isPaletteNodeEnabled(node)) {
      event.preventDefault();
      return;
    }

    if (!event.dataTransfer) {
      return;
    }

    event.dataTransfer.setData('application/wuic-workflow-node-type', node.type);
    event.dataTransfer.effectAllowed = 'copy';
  }

  isPaletteNodeEnabled(node: PaletteNodeDefinition): boolean {
    return node.type !== 'condition' && node.type !== 'end';
  }

  /**
   * Abilita il drop sul canvas impedendo il comportamento browser di default
   * e forzando feedback visuale `copy`.
   */
  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  /**
   * Gestisce il drop sul canvas:
   * - converte coordinate mouse in coordinate area (tenendo conto di pan/zoom),
   * - per `route`/`action` apre popup di configurazione preliminare,
   * - per altri tipi crea subito il nodo via `addNodeByType`.
   */
  async onCanvasDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    if (!this.area) {
      return;
    }

    const droppedType = event.dataTransfer?.getData('application/wuic-workflow-node-type') as PaletteNodeDefinition['type'] | '';
    if (!droppedType) {
      return;
    }

    const canvas = this.workflowCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    const transform = this.area.area.transform;
    const x = (event.clientX - bounds.left - transform.x) / transform.k;
    const y = (event.clientY - bounds.top - transform.y) / transform.k;

    if (droppedType === 'route') {
      const targetNodeId = this.getNodeIdFromDragEvent(event);
      const targetNode = this.getNodeById(targetNodeId || '');
      const sourceStartNodeId = targetNode && String((targetNode as any).workflowType || '') === 'start'
        ? String(targetNode.id)
        : '';
      const sourceActionNodeId = targetNode && String((targetNode as any).workflowType || '') === 'action'
        ? String(targetNode.id)
        : '';
      const sourceRouteNodeId = targetNode && String((targetNode as any).workflowType || '') === 'route'
        ? String(targetNode.id)
        : '';
      this.pendingRouteDrop = {
        x,
        y,
        sourceStartNodeId: sourceStartNodeId || undefined,
        sourceActionNodeId: sourceActionNodeId || undefined,
        sourceRouteNodeId: sourceRouteNodeId || undefined
      };
      await this.openRoutePopup();
      return;
    }

    if (droppedType === 'action') {
      const targetNodeId = this.getNodeIdFromDragEvent(event);
      const targetNode = this.getNodeById(targetNodeId || '');
      if (!targetNode || String((targetNode as any).workflowType || '') !== 'route') {
        return;
      }

      this.pendingActionDrop = { x, y, routeNodeId: String(targetNode.id) };
      this.openActionPopup();
      return;
    }

    await this.addNodeByType(droppedType, x, y);
  }

  /**
   * Apre il context menu del nodo sotto puntatore:
   * risolve `contextMenuNodeId/type`, costruisce le azioni disponibili e mostra Prime context menu.
   */
  onCanvasContextMenu(event: MouseEvent): void {
    if (!this.workflowCanvasRef?.nativeElement) {
      return;
    }

    const nodeId = this.getNodeIdFromEvent(event);
    if (!nodeId) {
      this.hideContextMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.contextMenuNodeId = nodeId;
    this.contextMenuNodeType = String((this.getNodeById(nodeId) as any)?.workflowType || '');
    this.contextMenuItems = this.buildContextMenuItems();
    if (!this.contextMenuItems.length) {
      this.hideContextMenu();
      return;
    }
    this.primeContextMenu?.show(event);
  }

  /**
   * Click sul canvas fuori dai menu: chiude il context menu attivo.
   */
  onCanvasClick(): void {
    this.hideContextMenu();
  }

  /**
   * Cancella il nodo selezionato dal context menu con gestione dipendenze:
   * - blocca la cancellazione del nodo Start,
   * - se il nodo e route chiede conferma e rimuove anche action collegate,
   * - se il nodo e action rimuove anche il link metadata nel bundle route.
   */
  async deleteContextNode(): Promise<void> {
    if (!this.editor || !this.contextMenuNodeId) {
      this.hideContextMenu();
      return;
    }

    const contextNode = this.getNodeById(this.contextMenuNodeId);
    if (contextNode && String((contextNode as any).workflowType || '') === 'start') {
      this.hideContextMenu();
      return;
    }
    const isActionNode = contextNode && String((contextNode as any).workflowType || '') === 'action';

    const isRouteNode = contextNode && String((contextNode as any).workflowType || '') === 'route';
    const linkedActionNodeIds = isRouteNode
      ? this.getLinkedActionNodeIdsForRoute(String((contextNode as any)?.id || this.contextMenuNodeId))
      : [];

    if (isRouteNode && linkedActionNodeIds.length > 0) {
      const ok = await WtoolboxService.confirm({
        message: this.tf(
          'workflow.route.delete_with_actions_confirm',
          'La route selezionata ha {0} nodo/i azione collegato/i. Confermi la cancellazione di route, azioni collegate e collegamenti?',
          linkedActionNodeIds.length
        )
      });
      if (!ok) {
        this.hideContextMenu();
        return;
      }
    }

    for (const actionNodeId of linkedActionNodeIds) {
      await this.removeNodeWithConnections(actionNodeId);
    }

    if (isActionNode) {
      await this.removeActionMetadataLinkFromRouteBundle(contextNode as WorkflowNode);
    }

    await this.removeNodeWithConnections(this.contextMenuNodeId);
    this.hideContextMenu();
    this.emitWorkflow();
  }

  /**
   * Rimuove dal `workflowRouteMetadataBundle` della route sorgente il target metadata
   * referenziato da un action node (`table_action` o `column_button`).
   */
  private async removeActionMetadataLinkFromRouteBundle(actionNode: WorkflowNode): Promise<void> {
    if (!actionNode) {
      return;
    }

    const metadataTargetType = String((actionNode as any).workflowMetadataTargetType || '').trim();
    const metadataTargetId = Number((actionNode as any).workflowMetadataTargetId || 0);
    if (!metadataTargetType || !Number.isFinite(metadataTargetId) || metadataTargetId <= 0) {
      return;
    }

    const routeNode = this.resolveRouteNodeForAction(actionNode);
    if (!routeNode) {
      return;
    }

    const bundle = await this.ensureRouteMetadataBundleForNode(routeNode, true);
    if (!bundle) {
      return;
    }

    if (metadataTargetType === 'table_action') {
      bundle.tableActions = (bundle.tableActions || []).filter((x: any) => Number(x?.Id || 0) !== metadataTargetId);
      (routeNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(bundle);
      return;
    }

    if (metadataTargetType === 'column_button') {
      bundle.columnMetadata = (bundle.columnMetadata || []).filter((x: any) => Number(x?.mc_id || 0) !== metadataTargetId);
      this.rebuildDerivedRouteCollections(bundle);
      (routeNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(bundle);
    }
  }

  /**
   * Restituisce gli id action collegati a una route combinando:
   * - link esplicito `workflowRouteNodeId` sul nodo action,
   * - connessioni canvas in ingresso/uscita tra route e action.
   */
  private getLinkedActionNodeIdsForRoute(routeNodeIdRaw: string | number): string[] {
    if (!this.editor) {
      return [];
    }

    const routeNodeId = String(routeNodeIdRaw || '');
    if (!routeNodeId) {
      return [];
    }

    const linked = new Set<string>();

    // Linked by explicit route reference on action nodes.
    this.editor.getNodes().forEach((node) => {
      if (String((node as any)?.workflowType || '') !== 'action') {
        return;
      }
      if (String((node as any)?.workflowRouteNodeId || '') === routeNodeId) {
        linked.add(String((node as any)?.id || ''));
      }
    });

    // Linked by canvas connections in/out between route and actions.
    this.editor.getConnections().forEach((connection) => {
      const sourceId = String((connection as any)?.source || '');
      const targetId = String((connection as any)?.target || '');

      if (sourceId === routeNodeId) {
        const targetNode = this.getNodeById(targetId);
        if (targetNode && String((targetNode as any)?.workflowType || '') === 'action') {
          linked.add(targetId);
        }
      }

      if (targetId === routeNodeId) {
        const sourceNode = this.getNodeById(sourceId);
        if (sourceNode && String((sourceNode as any)?.workflowType || '') === 'action') {
          linked.add(sourceId);
        }
      }
    });

    return Array.from(linked).filter((id) => !!id);
  }

  /**
   * Elimina un nodo dal canvas dopo aver rimosso tutte le connessioni
   * dove il nodo e source o target.
   */
  private async removeNodeWithConnections(nodeIdRaw: string | number): Promise<void> {
    if (!this.editor) {
      return;
    }

    const nodeId = String(nodeIdRaw || '');
    if (!nodeId) {
      return;
    }

    const linkedConnections = this.editor.getConnections().filter((connection) =>
      String((connection as any)?.source || '') === nodeId
      || String((connection as any)?.target || '') === nodeId
    );

    for (const connection of linkedConnections) {
      const connectionId = (connection as any)?.id;
      if (connectionId === null || connectionId === undefined || connectionId === '') {
        continue;
      }
      await this.editor.removeConnection(connectionId);
    }

    await this.editor.removeNode(nodeIdRaw as any);
  }

  /**
   * Apre l'editor metadata della route dal context menu:
   * risolve route effettiva (anche da datasource dashboard), prepara `routeMetadataDs`,
   * carica schema+dati e applica il bundle metadata corrente o un bundle iniziale.
   */
  async openRouteMetadataFromContext(dashboardDatasourceUniqueName?: string | null): Promise<void> {
    const node = this.getNodeById(this.contextMenuNodeId || '');
    const sourceType = this.getRouteSourceType(node);
    const dashboardDatasource = sourceType === 'dashboard'
      ? this.getDashboardDatasourceMetadataForNode(node, dashboardDatasourceUniqueName || undefined)
      : null;
    const route = String(
      dashboardDatasource?.route
      || dashboardDatasource?.metadataBundle?.route
      || (sourceType !== 'dashboard' ? ((node as any)?.workflowRoute || '') : '')
      || ''
    ).trim();
    if (!node || !route) {
      this.hideContextMenu();
      return;
    }

    this.routeMetadataRoute = route;
    this.routeMetadataNodeId = String((node as any)?.id || this.contextMenuNodeId || '');
    this.routeMetadataDashboardDatasourceUniqueName = dashboardDatasource?.uniqueName || null;
    this.routeMetadataDialogVisible = true;
    this.hideContextMenu();

    if (this.routeMetadataDs) {
      this.routeMetadataDs.hardcodedRoute = route;
      this.routeMetadataDs.route.next(route);
      await this.routeMetadataDs.getSchemaAndData(true);
      const nodeBundle = this.sanitizeForSerialization(
        dashboardDatasource?.metadataBundle
        || (node as any).workflowRouteMetadataBundle
        || null
      );
      if (nodeBundle) {
        this.applyRouteMetadataBundleToDatasource(nodeBundle, route);
      } else {
        (node as any).workflowRouteMetadataBundle = this.buildRouteMetadataBundle(route);
        this.emitWorkflow();
      }
    }
  }

  /**
   * Apre metadata editor puntuale dell'azione selezionata:
   * sincronizza prima il bundle route con lo stato action node,
   * poi apre editor su record target (`Id` table action o `mc_id` column button).
   */
  async openActionMetadataFromContext(): Promise<void> {
    const actionNode = this.getNodeById(this.contextMenuNodeId || '');
    if (!actionNode || String((actionNode as any).workflowType || '') !== 'action') {
      this.hideContextMenu();
      return;
    }

    const metadataTargetType = String((actionNode as any).workflowMetadataTargetType || '');
    const metadataTargetId = Number((actionNode as any).workflowMetadataTargetId);
    if (!metadataTargetType || !Number.isFinite(metadataTargetId) || metadataTargetId <= 0) {
      this.hideContextMenu();
      return;
    }

    const routeNode = this.resolveRouteNodeForAction(actionNode);
    if (!routeNode) {
      this.hideContextMenu();
      return;
    }

    // Keep metadata editor view aligned with current action-node state.
    this.syncRouteMetadataActionTypesFromLinkedNodes(routeNode);

    const bundle = await this.ensureRouteMetadataBundleForNode(routeNode, true);
    if (!bundle || !this.routeMetadataDs) {
      this.hideContextMenu();
      return;
    }

    const route = String(bundle.route || (routeNode as any)?.workflowRoute || '').trim();
    if (!route) {
      this.hideContextMenu();
      return;
    }

    this.routeMetadataRoute = route;
    this.routeMetadataNodeId = String(routeNode.id || '');
    this.routeMetadataDashboardDatasourceUniqueName = null;
    this.hideContextMenu();

    this.routeMetadataDs.hardcodedRoute = route;
    this.routeMetadataDs.route.next(route);
    await this.routeMetadataDs.getSchemaAndData(true);
    this.applyRouteMetadataBundleToDatasource(bundle, route);

    const editor = await this.waitForActionMetadataEditor();
    if (!editor) {
      return;
    }

    if (metadataTargetType === 'table_action') {
      const target = (bundle.tableActions || []).find((x: any) => Number(x?.Id) === metadataTargetId);
      if (target) {
        await editor.openEditor({
          info: this.sanitizeForSerialization(target),
          editorKey: 'Id',
          editorRoute: MetadataProviderService.metatableActionRoute || '_Metadati_Custom_Actions_Tabelle'
        });
      }
      return;
    }

    if (metadataTargetType === 'column_button') {
      const target = (bundle.columnMetadata || []).find((x: any) => Number(x?.mc_id) === metadataTargetId);
      if (target) {
        await editor.openEditor({ info: this.sanitizeForSerialization(target) });
      }
    }
  }

  get contextStartMenuItems(): WorkflowStartMenuItem[] {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      return [];
    }

    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    menus.sort((a, b) => Number(a.mm_ordine || 0) - Number(b.mm_ordine || 0));
    return menus;
  }

  /**
   * Inserisce una nuova voce menu sul nodo Start:
   * crea seed con `mm_ordine` progressivo e apre `EditFormComponent` su route menu.
   */
  async addStartMenuFromContext(): Promise<void> {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const current = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const mmOrdine = (current.length ? Math.max(...current.map((x) => Number(x.mm_ordine || 0))) : 0) + 10;
    await this.openStartMenuEditor(
      startNode,
      {
        mm_id: 0,
        mm_parent_id: 0,
        mm_nome_menu: '',
        mm_display_string_menu: '',
        mm_tooltip_menu: '',
        mm_uri_menu: '',
        mm_ordine: mmOrdine,
        mm_is_visible_by_default: true
      },
      'insert'
    );
  }

  /**
   * Modifica una voce menu esistente del nodo Start (per oggetto o id),
   * aprendo l'editor con il record seed normalizzato.
   */
  async renameStartMenuFromContext(menuInput: WorkflowStartMenuItem | number): Promise<void> {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const targetFromInput = typeof menuInput === 'object' && menuInput
      ? this.normalizeStartMenuItems([menuInput])[0]
      : null;
    const menuId = Number(typeof menuInput === 'object' ? menuInput?.mm_id : menuInput);
    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const target = targetFromInput || menus.find((x) => Number(x.mm_id) === menuId);
    if (!target) {
      return;
    }

    await this.openStartMenuEditor(
      startNode,
      {
        mm_id: target.mm_id,
        mm_parent_id: target.mm_parent_id,
        mm_nome_menu: target.mm_nome_menu,
        mm_display_string_menu: target.mm_display_string_menu,
        mm_tooltip_menu: target.mm_tooltip_menu,
        mm_uri_menu: target.mm_uri_menu,
        mm_ordine: target.mm_ordine,
        mm_is_visible_by_default: target.mm_is_visible_by_default
      },
      'edit'
    );
  }

  /**
   * Apre dialog `EditFormComponent` per inserimento/modifica voce menu Start,
   * configurando datasource route menu e il contesto temporaneo di salvataggio.
   */
  private async openStartMenuEditor(
    startNode: WorkflowNode,
    seed: any,
    mode: 'insert' | 'edit'
  ): Promise<void> {
    if (!this.startMenuDs || !startNode) {
      return;
    }

    this.startMenuDs.hardcodedRoute = this.startMenuRoute;
    this.startMenuDs.route.next(this.startMenuRoute);
    await this.startMenuDs.getSchemaAndData(true);

    if (mode === 'insert') {
      this.startMenuDs.addNewRecord(seed || {});
    } else {
      this.startMenuDs.setCurrent(seed || {});
    }

    this.pendingStartMenuContext = {
      startNodeId: String(startNode.id || ''),
      mode,
      menuId: Number(seed?.mm_id || 0) || undefined
    };

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(this.startMenuDs),
        saveCallback: this.startMenuSaveCallback,
        isEditForm: true
      },
      header: mode === 'insert'
        ? this.t('workflow.menu.insert_item', 'Inserisci voce menu')
        : this.t('workflow.menu.edit_item', 'Modifica voce menu'),
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });
    ref?.onClose.subscribe(() => {
      this.pendingStartMenuContext = null;
    });

    this.hideContextMenu();
  }

  /**
   * Callback save del dialog menu Start:
   * normalizza record, assegna id locale quando assente, fa upsert in `workflowStartMenus`
   * e propaga l'evento workflow.
   */
  private handleStartMenuSave(data: any, original: any): any {
    const ctx = this.pendingStartMenuContext;
    if (!ctx) {
      return false;
    }

    const startNode = this.getNodeById(String(ctx.startNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      return false;
    }

    const normalizedData = this.normalizeEditFormRecord(data);
    const normalizedOriginal = this.normalizeEditFormRecord(original);
    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);

    const parsedMmId = Number(normalizedData?.mm_id ?? normalizedOriginal?.mm_id ?? ctx.menuId ?? 0);
    const mmId = Number.isFinite(parsedMmId) && parsedMmId !== 0 ? parsedMmId : this.nextLocalMenuId(menus);
    const merged = Object.assign({}, normalizedOriginal || {}, normalizedData || {}, { mm_id: mmId });
    const normalizedMenu = this.normalizeStartMenuItems([merged])[0];
    if (!normalizedMenu) {
      return false;
    }

    const idx = menus.findIndex((x) => Number(x.mm_id) === Number(mmId));
    if (idx >= 0) {
      menus[idx] = Object.assign({}, menus[idx], normalizedMenu);
    } else {
      menus.push(normalizedMenu);
    }

    (startNode as any).workflowStartMenus = this.normalizeStartMenuItems(menus);
    this.emitWorkflow();
    return merged;
  }

  /**
   * Apre editor autorizzazioni menu in modalita insert per la voce selezionata.
   */
  async openInsertMenuAuthorizationFromContext(menuIdRaw: number): Promise<void> {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const menuId = Number(menuIdRaw);
    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const target = menus.find((x) => Number(x.mm_id) === menuId);
    if (!target) {
      return;
    }

    await this.openMenuAuthorizationEditor(startNode, menuId, {
      mmid: menuId,
      ruoloid: 0,
      utenteid: 0,
      muamview: 1
    }, 'insert');
  }

  /**
   * Apre editor autorizzazioni menu in modalita edit per la coppia menu/autorizzazione selezionata.
   */
  async openEditMenuAuthorizationFromContext(menuIdRaw: number, muamIdRaw: number): Promise<void> {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const menuId = Number(menuIdRaw);
    const muamId = Number(muamIdRaw);
    const menu = this.contextStartMenuItems.find((x) => Number(x.mm_id) === menuId);
    const auth = (menu?._Metadati_Utenti_Autorizzazioni_Menus || []).find((x) => Number(x.muamid) === muamId);
    if (!menu || !auth) {
      return;
    }

    await this.openMenuAuthorizationEditor(startNode, menuId, auth, 'edit');
  }

  /**
   * Elimina una autorizzazione menu dal nodo Start e ricalcola il payload normalizzato.
   */
  deleteMenuAuthorizationFromContext(menuIdRaw: number, muamIdRaw: number): void {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const menuId = Number(menuIdRaw);
    const muamId = Number(muamIdRaw);
    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const targetMenu = menus.find((x) => Number(x.mm_id) === menuId);
    if (!targetMenu) {
      return;
    }

    targetMenu._Metadati_Utenti_Autorizzazioni_Menus = this.normalizeMenuAuthorizations(
      (targetMenu._Metadati_Utenti_Autorizzazioni_Menus || []).filter((x) => Number(x.muamid) !== muamId),
      menuId
    );
    (startNode as any).workflowStartMenus = this.normalizeStartMenuItems(menus);
    this.emitWorkflow();
  }

  /**
   * Restituisce la lista autorizzazioni della voce menu in contesto ordinata per `muamid`.
   */
  getMenuAuthorizationsForContext(menuIdRaw: number): WorkflowMenuAuthorization[] {
    const menuId = Number(menuIdRaw);
    const menu = this.contextStartMenuItems.find((x) => Number(x.mm_id) === menuId);
    if (!menu) {
      return [];
    }
    return [...(menu._Metadati_Utenti_Autorizzazioni_Menus || [])]
      .sort((a, b) => Number(a.muamid || 0) - Number(b.muamid || 0));
  }

  /**
   * Compone l'etichetta UI di una autorizzazione menu usando ruolo/utente e flag visibilita.
   */
  getMenuAuthorizationLabel(auth: WorkflowMenuAuthorization): string {
    const ruolo = Number(auth?.ruoloid || 0);
    const utente = Number(auth?.utenteid || 0);
    const visible = Number(auth?.muamview || 0) === 1 ? 'Visible: Si' : 'Visible: No';
    if (ruolo > 0 && utente > 0) {
      return `Ruolo ${ruolo} / Utente ${utente} - ${visible}`;
    }
    if (ruolo > 0) {
      return `Ruolo ${ruolo} - ${visible}`;
    }
    if (utente > 0) {
      return `Utente ${utente} - ${visible}`;
    }
    return `Auth ${Number(auth?.muamid || 0)} - ${visible}`;
  }

  /**
   * Elimina una voce menu dal nodo Start previa conferma utente.
   */
  async deleteStartMenuFromContext(menuIdRaw: number): Promise<void> {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    const menuId = Number(menuIdRaw);
    const current = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const target = current.find((x) => Number(x.mm_id) === menuId);
    if (!target) {
      return;
    }

    const ok = await WtoolboxService.confirm({
      message: this.tf('workflow.menu.delete_confirm', 'Eliminare menu "{0}"?', target.mm_display_string_menu)
    });
    if (!ok) {
      return;
    }

    (startNode as any).workflowStartMenus = this.normalizeStartMenuItems(
      current.filter((x) => Number(x.mm_id) !== menuId)
    );
    this.emitWorkflow();
  }

  /**
   * Shortcut UI: apre il dialog opzioni workflow focalizzato sulle impostazioni caption menu Start.
   */
  editStartMenuCaptionFromContext(): void {
    this.openWorkflowOptionsFromContext();
  }

  /**
   * Apre il dialog opzioni del nodo Start (caption, inherit metadata, esclusivita menu, show exit)
   * inizializzando i campi dal nodo corrente.
   */
  openWorkflowOptionsFromContext(): void {
    const startNode = this.getNodeById(String(this.contextMenuNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.hideContextMenu();
      return;
    }

    this.workflowOptionsStartNodeId = String(startNode.id || '');
    this.workflowOptionsCaption = String((startNode as any).workflowStartMenuCaption || '');
    this.workflowOptionsInheritMetadata = this.toBoolean((startNode as any).workflowStartInheritMetadata, true);
    this.workflowOptionsExclusiveMenu = this.toBoolean((startNode as any).workflowStartExclusiveMenu, false);
    this.workflowOptionsShowExit = this.toBoolean((startNode as any).workflowStartShowExit, true);
    this.workflowOptionsDialogVisible = true;
    this.hideContextMenu();
  }

  /**
   * Chiude il dialog opzioni workflow senza applicare modifiche.
   */
  cancelWorkflowOptionsDialog(): void {
    this.workflowOptionsDialogVisible = false;
    this.workflowOptionsStartNodeId = '';
  }

  /**
   * Conferma il dialog opzioni workflow e persiste i flag sul nodo Start corrente.
   */
  confirmWorkflowOptionsDialog(): void {
    const startNode = this.getNodeById(String(this.workflowOptionsStartNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      this.cancelWorkflowOptionsDialog();
      return;
    }

    (startNode as any).workflowStartMenuCaption = String(this.workflowOptionsCaption || '').trim();
    (startNode as any).workflowStartInheritMetadata = !!this.workflowOptionsInheritMetadata;
    (startNode as any).workflowStartExclusiveMenu = !!this.workflowOptionsExclusiveMenu;
    (startNode as any).workflowStartShowExit = !!this.workflowOptionsShowExit;
    this.applyNodeVisualState(startNode);
    this.emitWorkflow();
    this.cancelWorkflowOptionsDialog();
  }

  /**
   * Apre l'editor autorizzazioni menu (insert/edit) su datasource dedicata,
   * preparando record seed e contesto salvataggio.
   */
  private async openMenuAuthorizationEditor(
    startNode: WorkflowNode,
    menuId: number,
    seed: WorkflowMenuAuthorization | any,
    mode: 'insert' | 'edit'
  ): Promise<void> {
    if (!this.menuAuthDs || !startNode) {
      return;
    }

    this.menuAuthDs.hardcodedRoute = this.menuAuthRoute;
    this.menuAuthDs.route.next(this.menuAuthRoute);
    await this.menuAuthDs.getSchemaAndData(true);

    this.configureMenuAuthorizationEditorMeta();

    const record = {
      mmid: Number(menuId || 0),
      muamid: Number(seed?.muamid || 0),
      muamview: Number(seed?.muamview) === 1 ? 1 : 0,
      ruoloid: Number(seed?.ruoloid || 0),
      utenteid: Number(seed?.utenteid || 0)
    };

    if (mode === 'insert') {
      this.menuAuthDs.addNewRecord(record);
    } else {
      this.menuAuthDs.setCurrent(record);
    }

    this.pendingMenuAuthContext = {
      startNodeId: String(startNode.id || ''),
      menuId: Number(menuId || 0),
      mode,
      muamId: Number(record.muamid || 0) || undefined
    };

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(this.menuAuthDs),
        saveCallback: this.menuAuthSaveCallback,
        isEditForm: true
      },
      header: mode === 'insert'
        ? this.t('workflow.menu_auth.insert', 'Inserisci autorizzazione menu')
        : this.t('workflow.menu_auth.edit', 'Modifica autorizzazione menu'),
      styleClass: 'edit-form-content',
      position: 'center',
      closable: true
    });
    ref?.onClose.subscribe(() => {
      this.pendingMenuAuthContext = null;
    });

    this.hideContextMenu();
  }

  /**
   * Rifinisce i metadati colonna dell'editor autorizzazioni nascondendo `mmid`
   * e disabilitandone edit/required nel form.
   */
  private configureMenuAuthorizationEditorMeta(): void {
    if (!this.menuAuthDs?.metaInfo?.columnMetadata?.length) {
      return;
    }

    const mmid = this.menuAuthDs.metaInfo.columnMetadata.find((col: any) => String(col?.mc_nome_colonna || '') === 'mmid');
    if (!mmid) {
      return;
    }
    mmid.mc_hide_in_edit = true;
    mmid.mc_logic_editable = false;
    mmid.mc_validation_required = false;
  }

  /**
   * Callback save autorizzazioni menu:
   * normalizza input, assegna id locale quando necessario, fa upsert su `_Metadati_Utenti_Autorizzazioni_Menus`
   * e sincronizza `workflowStartMenus`.
   */
  private handleMenuAuthorizationSave(data: any, _original: any): any {
    const ctx = this.pendingMenuAuthContext;
    if (!ctx) {
      return false;
    }

    const startNode = this.getNodeById(String(ctx.startNodeId || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      return false;
    }

    const menus = this.normalizeStartMenuItems((startNode as any).workflowStartMenus || []);
    const targetMenu = menus.find((x) => Number(x.mm_id) === Number(ctx.menuId));
    if (!targetMenu) {
      return false;
    }

    const normalizedData = this.normalizeEditFormRecord(data);
    const existing = this.normalizeMenuAuthorizations(targetMenu._Metadati_Utenti_Autorizzazioni_Menus || [], targetMenu.mm_id);
    const parsedMuamId = Number(normalizedData?.muamid ?? ctx.muamId ?? 0);
    const muamid = Number.isFinite(parsedMuamId) && parsedMuamId > 0
      ? parsedMuamId
      : this.nextLocalMenuAuthId(existing);

    const auth: WorkflowMenuAuthorization = {
      mmid: Number(targetMenu.mm_id || 0),
      muamid,
      muamview: Number(normalizedData?.muamview) === 1 ? 1 : 0,
      ruoloid: Number(normalizedData?.ruoloid || 0),
      utenteid: Number(normalizedData?.utenteid || 0)
    };

    const idx = existing.findIndex((x) => Number(x.muamid) === Number(auth.muamid));
    if (idx >= 0) {
      existing[idx] = auth;
    } else {
      existing.push(auth);
    }

    targetMenu._Metadati_Utenti_Autorizzazioni_Menus = existing;
    (startNode as any).workflowStartMenus = this.normalizeStartMenuItems(menus);
    this.emitWorkflow();
    return auth;
  }

  /**
   * Conferma la creazione di una route dal popup drag/drop:
   * crea il nodo route con source type (route/dashboard), auto-collega start/action/route sorgente,
   * costruisce/sincronizza bundle metadata e aggiorna stato popup.
   */
  async confirmRouteDrop(): Promise<void> {
    if (!this.pendingRouteDrop) {
      return;
    }

    const sourceType = this.selectedRouteSourceType === 'dashboard' ? 'dashboard' : 'route';
    const selectedRoute = sourceType === 'dashboard'
      ? String(this.selectedDashboardRoute || '').trim()
      : String(this.selectedRouteName || '').trim();
    const selectedAction = sourceType === 'dashboard'
      ? 'dashboard'
      : (String(this.selectedRouteAction || '').trim() || 'list');
    if (!selectedRoute || !selectedAction) {
      return;
    }

    const dashboardBoardcontent = sourceType === 'dashboard'
      ? String((this.dashboardOptions.find((x) => x.value === selectedRoute)?.boardcontent || '')).trim()
      : '';

    const routeNode = await this.addNodeByType('route', this.pendingRouteDrop.x, this.pendingRouteDrop.y, {
      routeName: selectedRoute,
      action: selectedAction,
      sourceType: sourceType,
      dashboardBoardcontent: dashboardBoardcontent
    });
    if (routeNode && this.pendingRouteDrop.sourceStartNodeId) {
      await this.autoConnectStartToRoute(routeNode, this.pendingRouteDrop.sourceStartNodeId);
    }
    if (routeNode && this.pendingRouteDrop.sourceActionNodeId) {
      await this.autoConnectActionToRoute(routeNode, this.pendingRouteDrop.sourceActionNodeId);
      await this.configureLinkedActionAsNavigation(routeNode, this.pendingRouteDrop.sourceActionNodeId);
    }
    if (routeNode && this.pendingRouteDrop.sourceRouteNodeId) {
      await this.insertNavigationActionBetweenRoutes(this.pendingRouteDrop.sourceRouteNodeId, routeNode);
    }
    if (routeNode && String((routeNode as any).workflowType || '') === 'route') {
      const bundle = await this.ensureRouteMetadataBundleForNode(routeNode, true);
      await this.syncTableActionNodesWithMetadata(routeNode, bundle);
      this.emitWorkflow();
    }
    this.lastCreatedRouteNodeId = routeNode ? String(routeNode.id) : this.lastCreatedRouteNodeId;

    this.routePopupVisible = false;
    this.pendingRouteDrop = null;
  }

  /**
   * Annulla il popup creazione route e resetta selezioni/filtri temporanei.
   */
  cancelRouteDrop(): void {
    this.routePopupVisible = false;
    this.pendingRouteDrop = null;
    this.selectedRouteSourceType = 'route';
    this.selectedRouteName = '';
    this.selectedDashboardRoute = '';
    this.selectedRouteAction = 'list';
    this.filteredRouteOptions = [...this.routeOptions];
    this.filteredDashboardOptions = [...this.dashboardOptions];
  }

  /**
   * Conferma la creazione action da popup:
   * crea nodo action tipizzato, aggancia metadata target nel bundle route,
   * collega route->action sul canvas e resetta stato popup.
   */
  async confirmActionDrop(): Promise<void> {
    if (
      !this.pendingActionDrop
      || this.selectedActionTypeId === null
      || this.selectedActionTypeId === undefined
      || this.selectedActionScopeId === null
      || this.selectedActionScopeId === undefined
    ) {
      return;
    }

    const selected = this.getActionTypeById(this.selectedActionTypeId);
    const selectedScope = this.getActionScopeById(this.selectedActionScopeId);
    if (!selected || !selectedScope) {
      return;
    }

    const routeNode = this.getNodeById(this.pendingActionDrop.routeNodeId || '');
    const actionNode = await this.addNodeByType('action', this.pendingActionDrop.x, this.pendingActionDrop.y, undefined, selected, selectedScope);
    if (actionNode) {
      if (routeNode && String((routeNode as any).workflowType || '') === 'route') {
        const bundle = await this.ensureRouteMetadataBundleForNode(routeNode, true);
        if (bundle) {
          const metadataLink = await this.attachActionMetadataToRouteBundle(routeNode, bundle, selected, selectedScope);
          (actionNode as any).workflowRouteNodeId = String(routeNode.id);
          (actionNode as any).workflowMetadataTargetType = metadataLink.targetType;
          (actionNode as any).workflowMetadataTargetId = metadataLink.targetId;
        }
      }
      await this.autoConnectRouteToAction(actionNode, this.pendingActionDrop.x, this.pendingActionDrop.y, this.pendingActionDrop.routeNodeId);
    }
    this.actionPopupVisible = false;
    this.pendingActionDrop = null;
    this.selectedActionTypeId = null;
    this.selectedActionScopeId = null;
  }

  /**
   * Annulla il popup creazione action e pulisce selezioni temporanee.
   */
  cancelActionDrop(): void {
    this.actionPopupVisible = false;
    this.pendingActionDrop = null;
    this.selectedActionTypeId = null;
    this.selectedActionScopeId = null;
  }

  /**
   * Factory nodi workflow:
   * inizializza socket in/out, campi custom `workflow*` e payload specifico
   * per start/route/action/condition/end.
   */
  private createNode(
    type: PaletteNodeDefinition['type'],
    routeConfig?: {
      routeName: string;
      action: string;
      sourceType?: 'route' | 'dashboard';
      dashboardBoardcontent?: string;
      dashboardDatasources?: WorkflowDashboardDatasourceMetadata[];
    },
    actionType?: WorkflowActionType,
    actionScope?: WorkflowActionScope,
    routeMetadata?: RouteMetadataBundle | null
  ): WorkflowNode {
    switch (type) {
      case 'start': {
        const node = new ClassicPreset.Node('Start');
        node.addOutput('out', new ClassicPreset.Output(this.socket, 'Out'));
        (node as any).workflowType = type;
        (node as any).workflowStartMenus = [];
        (node as any).workflowStartMenuCaption = '';
        (node as any).workflowStartInheritMetadata = false;
        (node as any).workflowStartExclusiveMenu = true;
        (node as any).workflowStartShowExit = true;
        return node;
      }
      case 'end': {
        const node = new ClassicPreset.Node('End');
        node.addInput('in', new ClassicPreset.Input(this.socket, 'In'));
        (node as any).workflowType = type;
        return node;
      }
      case 'condition': {
        const node = new ClassicPreset.Node('Condition');
        node.addInput('in', new ClassicPreset.Input(this.socket, 'In'));
        node.addOutput('out', new ClassicPreset.Output(this.socket, 'Out'));
        (node as any).workflowType = type;
        return node;
      }
      case 'action': {
        const normalizedActionType = actionType || this.getActionTypeById(1) || { id: 1, description: 'generic.method.call.action' };
        const normalizedActionScope = actionScope || this.getActionScopeById(0) || { id: 0, description: 'azione_tab' };
        const node = new ClassicPreset.Node(normalizedActionType.description);
        node.addInput('in', new ClassicPreset.Input(this.socket, 'In'));
        if (normalizedActionType.id === 0) {
          node.addOutput('out', new ClassicPreset.Output(this.socket, 'Out'));
        }
        (node as any).workflowType = type;
        (node as any).workflowActionTypeId = normalizedActionType.id;
        (node as any).workflowActionType = normalizedActionType.description;
        (node as any).workflowActionScopeId = normalizedActionScope.id;
        (node as any).workflowActionScope = normalizedActionScope.description;
        return node;
      }
      case 'route':
      default: {
        const routeName = String(routeConfig?.routeName || '').trim();
        const actionName = String(routeConfig?.action || '').trim() || 'list';
        const sourceType = routeConfig?.sourceType === 'dashboard' ? 'dashboard' : 'route';
        const dashboardBoardcontent = String(routeConfig?.dashboardBoardcontent || '').trim();
        const label = routeName ? `${routeName}/${actionName}` : 'Route';
        const node = new ClassicPreset.Node(label);
        node.addInput('in', new ClassicPreset.Input(this.socket, 'In'));
        node.addOutput('out', new ClassicPreset.Output(this.socket, 'Out'));
        (node as any).workflowType = 'route';
        (node as any).workflowRoute = routeName;
        (node as any).workflowAction = actionName;
        (node as any).workflowRouteSourceType = sourceType;
        (node as any).workflowDashboardBoardcontent = sourceType === 'dashboard' ? dashboardBoardcontent : '';
        const restoredDashboardDatasources = this.sanitizeForSerialization(routeConfig?.dashboardDatasources || []) || [];
        const dashboardDatasources = sourceType === 'dashboard'
          ? (restoredDashboardDatasources.length
            ? restoredDashboardDatasources
            : this.extractDashboardDatasourceMetadata(dashboardBoardcontent))
          : [];
        (node as any).workflowDashboardDatasources = dashboardDatasources;
        (node as any).workflowRouteMetadataBundle = routeMetadata
          || (dashboardDatasources[0]?.metadataBundle || null);
        return node;
      }
    }
  }

  /**
   * Aggiunge un nodo al canvas in coordinate assolute area,
   * applica stato visuale, emette snapshot workflow e opzionalmente pianifica auto-layout.
   */
  private async addNodeByType(
    type: PaletteNodeDefinition['type'],
    x: number,
    y: number,
    routeConfig?: {
      routeName: string;
      action: string;
      sourceType?: 'route' | 'dashboard';
      dashboardBoardcontent?: string;
      dashboardDatasources?: WorkflowDashboardDatasourceMetadata[];
    },
    actionType?: WorkflowActionType,
    actionScope?: WorkflowActionScope,
    routeMetadata?: RouteMetadataBundle | null,
    autoArrange: boolean = true
  ): Promise<WorkflowNode | null> {
    if (!this.editor || !this.area) {
      return null;
    }

    if (type === 'start' && this.findStartNode()) {
      return null;
    }

    const node = this.createNode(type, routeConfig, actionType, actionScope, routeMetadata);
    await this.editor.addNode(node);
    await this.area.translate(node.id, { x, y });
    if (autoArrange) {
      this.scheduleAutoArrange(String(node.id || ''));
    }
    this.applyNodeVisualState(node);
    this.emitWorkflow();
    return node;
  }

  /**
   * Debounce dei pass di relayout: accumula seed node id e avvia `runAutoArrangeBatch`
   * dopo `autoArrangeDelayMs`.
   */
  private scheduleAutoArrange(seedNodeId?: string): void {
    if (!this.relayoutEnabled) {
      return;
    }

    if (seedNodeId) {
      this.pendingAutoArrangeSeeds.add(String(seedNodeId));
    }

    if (this.autoArrangeTimer) {
      clearTimeout(this.autoArrangeTimer);
    }

    this.autoArrangeTimer = setTimeout(() => {
      const seeds = Array.from(this.pendingAutoArrangeSeeds.values());
      this.pendingAutoArrangeSeeds.clear();
      this.autoArrangeTimer = null;
      void this.runAutoArrangeBatch(seeds);
    }, this.autoArrangeDelayMs);
  }

  /**
   * Disattivando relayout cancella timer pendenti e svuota i seed accumulati.
   */
  onRelayoutEnabledChanged(): void {
    if (this.relayoutEnabled) {
      return;
    }

    if (this.autoArrangeTimer) {
      clearTimeout(this.autoArrangeTimer);
      this.autoArrangeTimer = null;
    }
    this.pendingAutoArrangeSeeds.clear();
  }

  /**
   * Costruisce il contesto operativo passato a `WorkflowDesignerLayoutHelper`:
   * espone editor/area e resolver di nodi/host DOM necessari ai pass di auto-layout.
   */
  private getLayoutContext() {
    return {
      editor: this.editor,
      area: this.area,
      getNodeById: (nodeId: string) => this.getNodeById(nodeId),
      findStartNode: () => this.findStartNode(),
      findNodeHostElement: (nodeId: string) => this.findNodeHostElement(nodeId)
    };
  }

  /**
   * Esegue i pass completi di layout:
   * risoluzione overlap, normalizzazione spazi orizzontali per livelli,
   * allineamento action per route, vincolo start/end estremi e zoom finale.
   */
  private async runAutoArrangeBatch(seedNodeIds: string[]): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }

    const layoutCtx = this.getLayoutContext();
    await WorkflowDesignerLayoutHelper.waitForRenderSettle();

    const seeds = (seedNodeIds || []).filter((x) => !!x);
    if (seeds.length) {
      for (const seed of seeds) {
        await WorkflowDesignerLayoutHelper.resolveNodeOverlapsFrom(layoutCtx, seed);
      }
    } else {
      for (const node of this.editor.getNodes()) {
        await WorkflowDesignerLayoutHelper.resolveNodeOverlapsFrom(layoutCtx, String(node.id || ''));
      }
    }

    await WorkflowDesignerLayoutHelper.normalizeHorizontalSpacingByGraphLevels(layoutCtx);
    await WorkflowDesignerLayoutHelper.alignActionNodesBySourceRoute(layoutCtx);
    await WorkflowDesignerLayoutHelper.ensureStartNodeLeftmost(layoutCtx);
    await WorkflowDesignerLayoutHelper.ensureEndNodeRightmost(layoutCtx);
    await WorkflowDesignerLayoutHelper.waitForRenderSettle(2);

    // Run global stabilization passes to catch residual overlaps from chained moves
    // and prevent nodes from sitting on top of edge paths.
    for (let pass = 0; pass < 3; pass++) {
      const movedFromConnections = await WorkflowDesignerLayoutHelper.avoidNodeConnectionOverlaps(layoutCtx);
      const movedFromActionAlign = await WorkflowDesignerLayoutHelper.alignActionNodesBySourceRoute(layoutCtx);
      let movedInPass = 0;
      for (const node of this.editor.getNodes()) {
        movedInPass += await WorkflowDesignerLayoutHelper.resolveNodeOverlapsFrom(layoutCtx, String(node.id || ''));
      }
      if (movedInPass === 0 && movedFromConnections === 0 && movedFromActionAlign === 0) {
        break;
      }
      await WorkflowDesignerLayoutHelper.waitForRenderSettle(1);
    }

    await WorkflowDesignerLayoutHelper.alignActionNodesBySourceRoute(layoutCtx);
    await WorkflowDesignerLayoutHelper.ensureStartNodeLeftmost(layoutCtx);
    await WorkflowDesignerLayoutHelper.ensureEndNodeRightmost(layoutCtx);
    await this.safeZoomAt();
    this.emitWorkflow();
  }

  /**
   * Crea (se assente) la connessione `route.out -> action.in` scegliendo la route
   * preferita o la route piu vicina al punto di drop.
   */
  private async autoConnectRouteToAction(
    actionNode: WorkflowNode,
    actionX: number,
    actionY: number,
    preferredRouteNodeId?: string | null
  ): Promise<void> {
    if (!this.editor) {
      return;
    }

    const routeNode = this.resolveRouteNodeForAutoConnect(actionX, actionY, preferredRouteNodeId);
    if (!routeNode) {
      return;
    }

    const routeHasOut = !!(routeNode.outputs as any)?.out;
    const actionHasIn = !!(actionNode.inputs as any)?.in;
    if (!routeHasOut || !actionHasIn) {
      return;
    }

    const alreadyConnected = this.editor.getConnections().some((connection) =>
      String(connection.source) === String(routeNode.id)
      && String(connection.target) === String(actionNode.id)
      && String(connection.sourceOutput) === 'out'
      && String(connection.targetInput) === 'in'
    );
    if (alreadyConnected) {
      return;
    }

    const connection = new ClassicPreset.Connection(routeNode as any, 'out' as any, actionNode as any, 'in' as any);
    await this.editor.addConnection(connection);
    this.emitWorkflow();
  }

  /**
   * Connette automaticamente `start.out -> route.in` evitando duplicati.
   */
  private async autoConnectStartToRoute(routeNode: WorkflowNode, startNodeIdRaw: string): Promise<void> {
    if (!this.editor || !routeNode) {
      return;
    }

    const startNode = this.getNodeById(String(startNodeIdRaw || ''));
    if (!startNode || String((startNode as any).workflowType || '') !== 'start') {
      return;
    }

    const startHasOut = !!(startNode.outputs as any)?.out;
    const routeHasIn = !!(routeNode.inputs as any)?.in;
    if (!startHasOut || !routeHasIn) {
      return;
    }

    const startNodeId = String(startNode.id || '');
    const routeNodeId = String(routeNode.id || '');
    const alreadyLinked = this.editor.getConnections().some((connection) =>
      String(connection.source || '') === startNodeId
      && String(connection.sourceOutput || '') === 'out'
      && String(connection.target || '') === routeNodeId
      && String(connection.targetInput || '') === 'in'
    );
    if (alreadyLinked) {
      return;
    }

    const connection = new ClassicPreset.Connection(startNode as any, 'out' as any, routeNode as any, 'in' as any);
    await this.editor.addConnection(connection);
    this.emitWorkflow();
  }

  /**
   * Connette automaticamente `action.out -> route.in` evitando duplicati.
   */
  private async autoConnectActionToRoute(routeNode: WorkflowNode, actionNodeIdRaw: string): Promise<void> {
    if (!this.editor || !routeNode) {
      return;
    }

    const actionNode = this.getNodeById(String(actionNodeIdRaw || ''));
    if (!actionNode || String((actionNode as any).workflowType || '') !== 'action') {
      return;
    }

    const actionHasOut = !!(actionNode.outputs as any)?.out;
    const routeHasIn = !!(routeNode.inputs as any)?.in;
    if (!actionHasOut || !routeHasIn) {
      return;
    }

    const actionNodeId = String(actionNode.id || '');
    const routeNodeId = String(routeNode.id || '');
    const alreadyLinked = this.editor.getConnections().some((connection) =>
      String(connection.source || '') === actionNodeId
      && String(connection.sourceOutput || '') === 'out'
      && String(connection.target || '') === routeNodeId
      && String(connection.targetInput || '') === 'in'
    );
    if (alreadyLinked) {
      return;
    }

    const connection = new ClassicPreset.Connection(actionNode as any, 'out' as any, routeNode as any, 'in' as any);
    await this.editor.addConnection(connection);
    this.emitWorkflow();
  }

  /**
   * Trasforma una action collegata in action di navigazione verso una route target:
   * aggiorna callback/azione nel bundle metadata sorgente e sincronizza tipo/scope del nodo action.
   */
  private async configureLinkedActionAsNavigation(targetRouteNode: WorkflowNode, actionNodeIdRaw: string): Promise<void> {
    if (!this.editor || !targetRouteNode) {
      return;
    }

    const actionNode = this.getNodeById(String(actionNodeIdRaw || ''));
    if (!actionNode || String((actionNode as any).workflowType || '') !== 'action') {
      return;
    }

    const targetRoute = String((targetRouteNode as any).workflowRoute || '').trim();
    const targetArchetype = String((targetRouteNode as any).workflowAction || '').trim() || 'list';
    if (!targetRoute) {
      return;
    }

    const metadataTargetType = String((actionNode as any).workflowMetadataTargetType || '');
    const metadataTargetId = Number((actionNode as any).workflowMetadataTargetId || 0);
    const sourceRouteNode = this.resolveRouteNodeForAction(actionNode);
    const sourceBundle = sourceRouteNode
      ? await this.ensureRouteMetadataBundleForNode(sourceRouteNode, true)
      : null;

    const callback = this.buildNavigationActionCallback(targetRoute, targetArchetype);

    let actionScopeId = Number((actionNode as any).workflowActionScopeId);
    if (metadataTargetType === 'table_action' && sourceBundle && Number.isFinite(metadataTargetId) && metadataTargetId > 0) {
      const tableAction = (sourceBundle.tableActions || []).find((x: any) => Number(x?.Id || 0) === metadataTargetId);
      if (tableAction) {
        tableAction.md_action_type = 0;
        tableAction.action_callback = callback;
        actionScopeId = 0;
      }
    } else if (metadataTargetType === 'column_button' && sourceBundle && Number.isFinite(metadataTargetId) && metadataTargetId > 0) {
      const column = (sourceBundle.columnMetadata || []).find((x: any) => Number(x?.mc_id || 0) === metadataTargetId);
      if (column) {
        column.mc_button_action_type = 0;
        column.mc_button_action = callback;
        actionScopeId = 1;
      }
    }

    if (sourceRouteNode && sourceBundle) {
      this.rebuildDerivedRouteCollections(sourceBundle);
      (sourceRouteNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(sourceBundle);
    }

    this.applyLinkedActionTypeToNode(actionNode, 0, Number.isFinite(actionScopeId) ? actionScopeId : 0);
    this.emitWorkflow();
  }

  /**
   * Inserisce un nodo action "navigation" tra due route:
   * crea il nodo a meta percorso, lo collega source->action->target
   * e persiste il relativo target metadata nel bundle della route sorgente.
   */
  private async insertNavigationActionBetweenRoutes(sourceRouteNodeIdRaw: string, targetRouteNode: WorkflowNode): Promise<void> {
    if (!this.editor || !this.area || !targetRouteNode) {
      return;
    }

    const sourceRouteNode = this.getNodeById(String(sourceRouteNodeIdRaw || ''));
    if (!sourceRouteNode || String((sourceRouteNode as any).workflowType || '') !== 'route') {
      return;
    }

    const navigationType = this.getActionTypeById(0) || { id: 0, description: 'generic.navigation.action' };
    const tableScope = this.getActionScopeById(0) || { id: 0, description: 'azione_tab' };

    const sourcePos = this.area.nodeViews.get(String(sourceRouteNode.id || ''))?.position || { x: 0, y: 0 };
    const targetPos = this.area.nodeViews.get(String(targetRouteNode.id || ''))?.position || { x: 0, y: 0 };
    const actionX = (Number(sourcePos.x || 0) + Number(targetPos.x || 0)) / 2;
    const actionY = (Number(sourcePos.y || 0) + Number(targetPos.y || 0)) / 2;

    const actionNode = await this.addNodeByType('action', actionX, actionY, undefined, navigationType, tableScope);
    if (!actionNode) {
      return;
    }

    const sourceBundle = await this.ensureRouteMetadataBundleForNode(sourceRouteNode, true);
    if (sourceBundle) {
      const metadataLink = await this.attachActionMetadataToRouteBundle(sourceRouteNode, sourceBundle, navigationType, tableScope);
      (actionNode as any).workflowRouteNodeId = String(sourceRouteNode.id || '');
      (actionNode as any).workflowMetadataTargetType = metadataLink.targetType;
      (actionNode as any).workflowMetadataTargetId = metadataLink.targetId;
    }

    await this.autoConnectRouteToAction(actionNode, actionX, actionY, String(sourceRouteNode.id || ''));
    await this.autoConnectActionToRoute(targetRouteNode, String(actionNode.id || ''));
    await this.configureLinkedActionAsNavigation(targetRouteNode, String(actionNode.id || ''));
  }

  /**
   * Genera il codice callback JavaScript della navigation action
   * che imposta `window.location.hash` verso `#/route/archetype`.
   */
  private buildNavigationActionCallback(targetRouteRaw: string, targetArchetypeRaw: string): string {
    const safeRoute = String(targetRouteRaw || '').trim().replaceAll("'", "\\'");
    const safeArchetype = String(targetArchetypeRaw || 'list').trim().replaceAll("'", "\\'") || 'list';

    return [
      `const targetRoute = '${safeRoute}';`,
      `const targetArchetype = '${safeArchetype}';`,
      `const pkName = (metaInfo?.columnMetadata || []).find(x => !!x?.mc_is_primary_key)?.mc_nome_colonna || 'Id';`,
      `const rowId = record?.[pkName].value;`,
      'const baseUrl = `/${targetRoute}/${targetArchetype}`;',
      '//const url = (rowId === undefined || rowId === null || rowId === \'\')',
      '//  ? baseUrl',
      '//  : `${baseUrl}/${pkName}||eq||${encodeURIComponent(String(rowId))}`;',
      '// Angular hash route navigation (e.g. #/customers/list/Id||eq||10)',
      "window.location.hash = '#' + baseUrl;"
    ].join('\n');
  }

  /**
   * Risolve la route da usare per auto-connect:
   * preferita esplicita, ultima route creata, altrimenti route geometricamente piu vicina.
   */
  private resolveRouteNodeForAutoConnect(actionX: number, actionY: number, preferredRouteNodeId?: string | null): WorkflowNode | null {
    if (!this.editor || !this.area) {
      return null;
    }

    if (preferredRouteNodeId) {
      const preferred = this.getNodeById(preferredRouteNodeId);
      if (preferred && String((preferred as any).workflowType || '') === 'route') {
        return preferred;
      }
    }

    if (this.lastCreatedRouteNodeId) {
      const latest = this.getNodeById(this.lastCreatedRouteNodeId);
      if (latest && String((latest as any).workflowType || '') === 'route') {
        return latest;
      }
    }

    const routeNodes = this.editor.getNodes().filter((n) => String((n as any).workflowType || '') === 'route');
    if (!routeNodes.length) {
      return null;
    }

    let best: { node: WorkflowNode; dist: number } | null = null;
    routeNodes.forEach((node) => {
      const pos = this.area?.nodeViews.get(String(node.id))?.position;
      const dx = (pos?.x ?? 0) - actionX;
      const dy = (pos?.y ?? 0) - actionY;
      const dist = (dx * dx) + (dy * dy);
      if (!best || dist < best.dist) {
        best = { node, dist };
      }
    });

    return best?.node || null;
  }

  /**
   * Emissione stato workflow verso l'esterno (`workflowChange`):
   * serializza nodi/connessioni correnti con coordinate e route metadata derivato.
   */
  private emitWorkflow(): void {
    if (!this.editor || !this.area) {
      return;
    }

    const nodes: WorkflowNodeSerialized[] = this.editor.getNodes().map((node) => {
      if (String((node as any).workflowType || '') === 'route') {
        this.syncRouteMetadataActionTypesFromLinkedNodes(node);
      }
      const view = this.area?.nodeViews.get(String(node.id));
      return {
        id: String(node.id),
        label: node.label,
        type: (node as any).workflowType || 'route',
        route: (node as any).workflowRoute || '',
        action: (node as any).workflowAction || '',
        routeSourceType: (node as any).workflowRouteSourceType || 'route',
        dashboardBoardcontent: (node as any).workflowDashboardBoardcontent || '',
        dashboardDatasources: this.sanitizeForSerialization((node as any).workflowDashboardDatasources || []),
        actionTypeId: (node as any).workflowActionTypeId,
        actionType: (node as any).workflowActionType || '',
        actionScopeId: (node as any).workflowActionScopeId,
        actionScope: (node as any).workflowActionScope || '',
        routeNodeId: (node as any).workflowRouteNodeId || '',
        metadataTargetType: (node as any).workflowMetadataTargetType || '',
        metadataTargetId: (node as any).workflowMetadataTargetId,
        x: view?.position?.x ?? 0,
        y: view?.position?.y ?? 0,
        startMenus: (node as any).workflowType === 'start'
          ? this.normalizeStartMenuItems((node as any).workflowStartMenus || [])
          : [],
        startMenuCaption: (node as any).workflowType === 'start'
          ? String((node as any).workflowStartMenuCaption || '')
          : '',
        startInheritMetadata: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartInheritMetadata, true)
          : true,
        startExclusiveMenu: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartExclusiveMenu, false)
          : false,
        startShowExit: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartShowExit, true)
          : true,
        routeMetadata: (node as any).workflowType === 'route'
          ? this.sanitizeForSerialization((node as any).workflowRouteMetadataBundle || null)
          : null
      };
    });

    const connections: WorkflowConnectionSerialized[] = this.editor.getConnections().map((connection) => ({
      id: String(connection.id),
      source: String(connection.source),
      sourceOutput: String(connection.sourceOutput),
      target: String(connection.target),
      targetInput: String(connection.targetInput)
    }));

    this.workflowChange.emit({
      nodes,
      connections,
      routeMetadata: this.extractRouteMetadataEntries(nodes)
    });
  }

  /**
   * Aggiorna label e attributi/stili visuali del nodo sul DOM host (`node-<id>`)
   * in base a tipo nodo, scope e action type.
   */
  private applyNodeVisualState(node: WorkflowNode): boolean {
    if (!node) {
      return false;
    }

    this.normalizeActionNodeVisualContext(node);
    node.label = this.computeNodeLabel(node);

    const type = String((node as any).workflowType || '');
    const actionScopeId = Number((node as any).workflowActionScopeId);
    const actionTypeId = Number((node as any).workflowActionTypeId);
    const nodeHost = this.findNodeHostElement(node.id);
    if (!nodeHost) {
      return false;
    }

    const visual = this.resolveNodeVisual(type, actionScopeId, actionTypeId);
    nodeHost.setAttribute('data-wf-node-type', type || 'route');
    nodeHost.setAttribute('data-wf-action-scope', actionScopeId === 1 ? 'col' : 'tab');
    nodeHost.setAttribute('data-wf-action-type', Number.isFinite(actionTypeId) ? String(actionTypeId) : '');
    nodeHost.style.setProperty('--wf-node-accent', visual.accent);
    nodeHost.style.setProperty('--wf-node-bg', visual.background);

    void this.area?.update('node' as any, String(node.id));
    return true;
  }

  /**
   * Completa i campi visuali mancanti di un action node
   * inferendo tipo/scope dal bundle metadata route target.
   */
  private normalizeActionNodeVisualContext(node: WorkflowNode): void {
    if (String((node as any).workflowType || '') !== 'action') {
      return;
    }

    const existingTypeId = Number((node as any).workflowActionTypeId);
    const existingScopeId = Number((node as any).workflowActionScopeId);
    const hasType = Number.isFinite(existingTypeId);
    const hasScope = Number.isFinite(existingScopeId);
    if (!hasType) {
      const inferredTypeId = this.inferActionTypeIdFromDescription(String((node as any).workflowActionType || node.label || ''));
      if (Number.isFinite(inferredTypeId)) {
        const actionType = this.getActionTypeById(inferredTypeId);
        (node as any).workflowActionTypeId = inferredTypeId;
        (node as any).workflowActionType = actionType?.description || String((node as any).workflowActionType || '');
      }
    }
    if (hasType && hasScope) {
      return;
    }

    const routeNode = this.resolveRouteNodeForAction(node);
    const bundle = this.sanitizeForSerialization((routeNode as any)?.workflowRouteMetadataBundle || null);
    if (!bundle) {
      return;
    }

    const targetType = String((node as any).workflowMetadataTargetType || '');
    const targetId = Number((node as any).workflowMetadataTargetId);
    if (!targetType || !Number.isFinite(targetId) || targetId <= 0) {
      return;
    }

    if (targetType === 'table_action') {
      const item = (bundle.tableActions || []).find((x: any) => Number(x?.Id) === targetId);
      const inferredTypeId = Number(item?.md_action_type);
      if (Number.isFinite(inferredTypeId)) {
        const actionType = this.getActionTypeById(inferredTypeId);
        (node as any).workflowActionTypeId = inferredTypeId;
        (node as any).workflowActionType = actionType?.description || String((node as any).workflowActionType || '');
      }
      (node as any).workflowActionScopeId = 0;
      (node as any).workflowActionScope = 'azione_tab';
      return;
    }

    if (targetType === 'column_button') {
      const item = (bundle.columnMetadata || []).find((x: any) => Number(x?.mc_id) === targetId);
      const inferredTypeId = Number(item?.mc_button_action_type);
      if (Number.isFinite(inferredTypeId)) {
        const actionType = this.getActionTypeById(inferredTypeId);
        (node as any).workflowActionTypeId = inferredTypeId;
        (node as any).workflowActionType = actionType?.description || String((node as any).workflowActionType || '');
      }
      (node as any).workflowActionScopeId = 1;
      (node as any).workflowActionScope = 'azione_col';
    }
  }

  /**
   * Tenta il mapping descrizione testuale -> `actionTypeId` tramite matching di keyword normalize.
   */
  private inferActionTypeIdFromDescription(raw: string): number {
    const input = String(raw || '').toLowerCase().trim();
    if (!input) {
      return NaN;
    }

    const normalized = input
      .replace(/_/g, '.')
      .replace(/\s+/g, '.')
      .replace(/-+/g, '.');

    const byNeedle = new Map<string, number>([
      ['navigation', 0],
      ['method.call', 1],
      ['generate.file', 2],
      ['export', 3],
      ['call.stored', 4],
      ['approve', 5],
      ['parametric.dialog', 6],
      ['client.sync', 7],
      ['client.async', 8],
      ['route.payload.dialog', 9]
    ]);

    for (const [needle, id] of byNeedle.entries()) {
      if (normalized.includes(needle)) {
        return id;
      }
    }

    return NaN;
  }

  /**
   * Calcola l'etichetta visuale del nodo in base a tipo e campi workflow:
   * Start caption, Route route/action, Action scope/tipo.
   */
  private computeNodeLabel(node: WorkflowNode): string {
    const type = String((node as any).workflowType || '');
    if (type === 'start') {
      const caption = String((node as any).workflowStartMenuCaption || '').trim();
      return caption ? `Start - ${caption}` : 'Start';
    }

    if (type === 'route') {
      const route = String((node as any).workflowRoute || '').trim();
      const action = String((node as any).workflowAction || '').trim();
      if (route) {
        return `Route ${route}${action ? ' [' + action + ']' : ''}`;
      }
      return 'Route';
    }

    if (type === 'action') {
      const actionTypeId = Number((node as any).workflowActionTypeId);
      const actionType = this.getActionTypeVisualLabel(actionTypeId, String((node as any).workflowActionType || ''));
      const scope = Number((node as any).workflowActionScopeId) === 1 ? 'COL' : 'TAB';
      return `Action ${scope} - ${actionType}`;
    }

    return String(node.label || type || 'Node');
  }

  /**
   * Restituisce la label user-friendly per action type,
   * con fallback su descrizione normalizzata quando l'id non e noto.
   */
  private getActionTypeVisualLabel(actionTypeId: number, fallbackDescription: string): string {
    const known = new Map<number, string>([
      [0, 'navigation'],
      [1, this.t('workflow.action_type.method_call', 'method call')],
      [2, this.t('workflow.action_type.generate_file', 'generate file')],
      [3, 'export'],
      [4, this.t('workflow.action_type.call_stored', 'call stored')],
      [5, 'approve'],
      [6, this.t('workflow.action_type.parametric_dialog', 'parametric dialog')],
      [7, this.t('workflow.action_type.client_sync', 'client sync')],
      [8, this.t('workflow.action_type.client_async', 'client async')],
      [9, this.t('workflow.action_type.route_payload_dialog', 'route payload dialog')]
    ]);
    const fromMap = known.get(actionTypeId);
    if (fromMap) {
      return fromMap;
    }

    const normalized = String(fallbackDescription || '')
      .replace(/\.action/gi, '')
      .replace(/\./g, ' ')
      .trim();
    return normalized || 'action';
  }

  private resolveNodeVisual(type: string, actionScopeId: number, actionTypeId: number): { accent: string; background: string } {
    if (type === 'route') {
      return { accent: '#2563eb', background: '#eff6ff' };
    }

    if (type === 'action') {
      const byActionType = new Map<number, { accent: string; background: string }>([
        [0, { accent: '#0f766e', background: '#ecfdf5' }],
        [1, { accent: '#7c3aed', background: '#f5f3ff' }],
        [2, { accent: '#9333ea', background: '#faf5ff' }],
        [3, { accent: '#1d4ed8', background: '#eff6ff' }],
        [4, { accent: '#334155', background: '#f8fafc' }],
        [5, { accent: '#166534', background: '#f0fdf4' }],
        [6, { accent: '#b45309', background: '#fffbeb' }],
        [7, { accent: '#be123c', background: '#fff1f2' }],
        [8, { accent: '#0e7490', background: '#ecfeff' }],
        [9, { accent: '#7c2d12', background: '#fff7ed' }]
      ]);
      const typed = byActionType.get(actionTypeId);
      if (typed) {
        return typed;
      }

      if (actionScopeId === 1) {
        return { accent: '#7c3aed', background: '#f5f3ff' };
      }
      return { accent: '#c2410c', background: '#fff7ed' };
    }

    if (type === 'start') {
      return { accent: '#15803d', background: '#f0fdf4' };
    }
    if (type === 'end') {
      return { accent: '#9f1239', background: '#fff1f2' };
    }
    if (type === 'condition') {
      return { accent: '#0f766e', background: '#f0fdfa' };
    }

    return { accent: '#475569', background: '#f8fafc' };
  }

  /**
   * Cerca l'elemento host DOM del nodo Rete (`node-<id>`) nel canvas.
   */
  private findNodeHostElement(nodeId: string): HTMLElement | null {
    const canvas = this.workflowCanvasRef?.nativeElement;
    if (!canvas) {
      return null;
    }

    const expectedTagName = `node-${String(nodeId || '').toLowerCase()}`;
    const direct = canvas.querySelector(expectedTagName) as HTMLElement | null;
    if (direct) {
      return direct;
    }

    const all = canvas.querySelectorAll('*');
    for (const element of Array.from(all)) {
      const html = element as HTMLElement;
      if (String(html.tagName || '').toLowerCase() === expectedTagName) {
        return html;
      }
    }

    return null;
  }

  /**
   * Chiude e resetta completamente il context menu corrente.
   */
  private hideContextMenu(): void {
    this.primeContextMenu?.hide();
    this.contextMenuItems = [];
    this.contextMenuNodeId = null;
    this.contextMenuNodeType = '';
  }

  /**
   * Costruisce dinamicamente le voci context menu in base al tipo nodo:
   * route metadata, action metadata, gestione menu start, cancellazione nodo.
   */
  private buildContextMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];

    if (this.contextMenuNodeType === 'route') {
      const routeNode = this.getNodeById(String(this.contextMenuNodeId || ''));
      const sourceType = this.getRouteSourceType(routeNode);
      const dashboardDatasources = sourceType === 'dashboard'
        ? this.getDashboardDatasourceMetadataEntries(routeNode)
        : [];

      if (dashboardDatasources.length) {
        dashboardDatasources.forEach((entry) => {
          items.push({
            label: `${this.t('workflow.context.metadata_dashboard_datasource', 'Proprieta route annidata nel datasource')} (${entry.uniqueName})`,
            command: () => {
              void this.openRouteMetadataFromContext(entry.uniqueName);
            }
          });
        });
      } else {
        items.push({
          label: this.t('workflow.context.metadata_route', 'Metadata route'),
          command: () => {
            void this.openRouteMetadataFromContext();
          }
        });
      }
    }

    if (this.contextMenuNodeType === 'action') {
      items.push({
        label: this.t('workflow.context.metadata_action', 'Metadata action'),
        command: () => {
          void this.openActionMetadataFromContext();
        }
      });
    }

    if (this.contextMenuNodeType === 'start') {
      items.push({
        label: this.t('workflow.context.add_menu_item', 'Aggiungi voce menu'),
        command: () => {
          void this.addStartMenuFromContext();
        }
      });
      items.push({
        label: this.t('workflow.context.workflow_options', 'Opzioni workflow'),
        command: () => {
          this.openWorkflowOptionsFromContext();
        }
      });

      for (const menu of this.contextStartMenuItems) {
        const auths = this.getMenuAuthorizationsForContext(menu.mm_id);
        const authItems: MenuItem[] = auths.map((auth) => ({
          label: this.getMenuAuthorizationLabel(auth),
          items: [
            {
              label: this.t('workflow.context.edit_auth', 'Modifica auth'),
              command: () => {
                void this.openEditMenuAuthorizationFromContext(menu.mm_id, auth.muamid);
              }
            },
            {
              label: this.t('workflow.context.delete_auth', 'Elimina auth'),
              command: () => {
                this.deleteMenuAuthorizationFromContext(menu.mm_id, auth.muamid);
              }
            }
          ]
        }));

        items.push({
          label: `${this.t('workflow.context.menu_item', 'Voce')}: ${menu.mm_display_string_menu}`,
          items: [
            {
              label: this.t('workflow.context.add_auth', 'Auth +'),
              command: () => {
                void this.openInsertMenuAuthorizationFromContext(menu.mm_id);
              }
            },
            ...(authItems.length ? [{ separator: true } as MenuItem] : []),
            ...authItems,
            { separator: true },
            {
              label: this.t('workflow.context.edit_menu_item', 'Modifica voce'),
              command: () => {
                void this.renameStartMenuFromContext(menu);
              }
            },
            {
              label: this.t('workflow.context.delete_menu_item', 'Elimina voce'),
              command: () => {
                this.deleteStartMenuFromContext(menu.mm_id);
              }
            }
          ]
        });
      }
    }

    if (this.contextMenuNodeType !== 'start') {
      items.push({
        label: this.t('workflow.context.delete_node', 'Elimina nodo'),
        command: () => {
          void this.deleteContextNode();
        }
      });
    }

    return items;
  }

  /**
   * Estrae l'id nodo dal target mouse event risalendo `composedPath`/parentElement
   * e riconoscendo i tag custom `node-<id>`.
   */
  private getNodeIdFromEvent(event: MouseEvent): string | null {
    const path = (event.composedPath?.() || []) as Array<EventTarget>;

    for (const target of path) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      const tagName = String(target.tagName || '').toLowerCase();
      if (tagName.startsWith('node-')) {
        return tagName.substring(5);
      }
    }

    let element = event.target as HTMLElement | null;
    while (element) {
      const tagName = String(element.tagName || '').toLowerCase();
      if (tagName.startsWith('node-')) {
        return tagName.substring(5);
      }
      element = element.parentElement;
    }

    return null;
  }

  /**
   * Variante drag event di risoluzione id nodo (`node-<id>`) dal path DOM.
   */
  private getNodeIdFromDragEvent(event: DragEvent): string | null {
    const path = (event.composedPath?.() || []) as Array<EventTarget>;

    for (const target of path) {
      if (!(target instanceof HTMLElement)) {
        continue;
      }

      const tagName = String(target.tagName || '').toLowerCase();
      if (tagName.startsWith('node-')) {
        return tagName.substring(5);
      }
    }

    let element = event.target as HTMLElement | null;
    while (element) {
      const tagName = String(element.tagName || '').toLowerCase();
      if (tagName.startsWith('node-')) {
        return tagName.substring(5);
      }
      element = element.parentElement;
    }

    return null;
  }

  /**
   * Apre il popup configurazione route inizializzando i campi
   * e caricando on-demand route/dashboard options.
   */
  private async openRoutePopup(): Promise<void> {
    this.selectedRouteSourceType = 'route';
    this.selectedRouteName = '';
    this.selectedDashboardRoute = '';
    this.selectedRouteAction = 'list';
    this.filteredRouteOptions = [...this.routeOptions];
    this.filteredDashboardOptions = [...this.dashboardOptions];

    if (!this.routeOptions.length) {
      await this.loadRouteOptions();
    }
    if (!this.dashboardOptions.length) {
      await this.loadDashboardOptions();
    }

    this.routePopupVisible = true;
  }

  /**
   * Sincronizza i campi popup route quando cambia la sorgente (`route` vs `dashboard`).
   */
  onRouteSourceTypeChanged(): void {
    if (this.selectedRouteSourceType === 'dashboard') {
      this.selectedRouteName = '';
      this.selectedRouteAction = 'dashboard';
      this.filteredDashboardOptions = [...this.dashboardOptions];
      return;
    }

    this.selectedDashboardRoute = '';
    this.selectedRouteAction = this.selectedRouteAction === 'dashboard' ? 'list' : this.selectedRouteAction;
    this.filteredRouteOptions = [...this.routeOptions];
  }

  /**
   * Apre il popup selezione tipo/scope action con default scope tabellare.
   */
  private openActionPopup(): void {
    this.selectedActionTypeId = null;
    this.selectedActionScopeId = 0;
    this.actionPopupVisible = true;
  }

  /**
   * Carica le route applicative da metadata table route e popola autocomplete route.
   */
  private async loadRouteOptions(): Promise<void> {
    try {
      const result = await this.dataSrv.selectByRoute(MetadataProviderService.metaTableRoute, [], [], 10000, 1);
      const rows = (result?.dato || []) as any[];
      this.routeOptions = rows
        .filter((row) => !row?.is_system_route && !!String(row?.md_route_name || '').trim())
        .map((row) => {
          const routeName = String(row.md_route_name || '').trim();
          const caption = String(row.mm_display_string || row.md_nome_tabella || routeName).trim();
          return { label: `${caption} (${routeName})`, value: routeName };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      this.filteredRouteOptions = [...this.routeOptions];
    } catch {
      this.routeOptions = [];
      this.filteredRouteOptions = [];
    }
  }

  /**
   * Carica i dashboard salvati (`loadAllDashboards`) e popola autocomplete dashboard
   * includendo `boardcontent` per estrarre metadata datasource annidati.
   */
  private async loadDashboardOptions(): Promise<void> {
    try {
      const rows = await this.dataSrv.loadAllDashboards();
      this.dashboardOptions = (Array.isArray(rows) ? rows : [])
        .map((row: any) => {
          const route = String(row?.board_route || row?.boardroute || '').trim();
          const desc = String(row?.board_des || row?.boarddes || route).trim();
          const boardcontent = String(row?.boardcontent || row?.boardContent || '').trim();
          if (!route) {
            return null;
          }
          return {
            label: `${desc} (#/${route}/dashboard)`,
            value: route,
            boardcontent
          };
        })
        .filter((x): x is { label: string; value: string; boardcontent: string } => !!x)
        .sort((a, b) => a.label.localeCompare(b.label));
      this.filteredDashboardOptions = [...this.dashboardOptions];
    } catch {
      this.dashboardOptions = [];
      this.filteredDashboardOptions = [];
    }
  }

  /**
   * Filtra client-side le opzioni route su label/value in base alla query.
   */
  filterRouteOptions(event: AutoCompleteCompleteEvent): void {
    const query = String(event?.query || '').trim().toLowerCase();
    this.filteredRouteOptions = !query
      ? [...this.routeOptions]
      : this.routeOptions.filter((item) =>
        String(item.label || '').toLowerCase().includes(query)
        || String(item.value || '').toLowerCase().includes(query)
      );
  }

  /**
   * Filtra client-side le opzioni dashboard su label/value in base alla query.
   */
  filterDashboardOptions(event: AutoCompleteCompleteEvent): void {
    const query = String(event?.query || '').trim().toLowerCase();
    this.filteredDashboardOptions = !query
      ? [...this.dashboardOptions]
      : this.dashboardOptions.filter((item) =>
        String(item.label || '').toLowerCase().includes(query)
        || String(item.value || '').toLowerCase().includes(query)
      );
  }

  /**
   * Restituisce il tipo azione configurato (`id`,`description`) a partire dalle opzioni parse-ate.
   */
  private getActionTypeById(id: number): WorkflowActionType | null {
    const match = this.actionTypeOptions.find((x) => x.value === id);
    if (!match) {
      return null;
    }

    return {
      id: match.value,
      description: match.label
    };
  }

  /**
   * Restituisce lo scope azione (`azione_tab`/`azione_col`) a partire dall'id selezionato.
   */
  private getActionScopeById(id: number): WorkflowActionScope | null {
    const match = this.actionScopeOptions.find((x) => x.value === id);
    if (!match) {
      return null;
    }
    return {
      id: match.value,
      description: match.label
    };
  }

  /**
   * Parse del dizionario action type nel formato `id@@descrizione||...`
   * usato dal componente per popolare il selettore tipi azione.
   */
  private parseActionTypeOptions(raw: string): Array<{ label: string; value: number }> {
    return String(raw || '')
      .split('||')
      .map((entry) => {
        const parts = entry.split('@@');
        const id = Number(String(parts[0] || '').trim());
        const description = String(parts[1] || '').trim();
        if (!Number.isInteger(id) || !description) {
          return null;
        }
        return { label: description, value: id };
      })
      .filter((x): x is { label: string; value: number } => !!x);
  }

  /**
   * Risolve un nodo editor per id stringa.
   */
  private getNodeById(nodeId: string): WorkflowNode | null {
    if (!this.editor || !nodeId) {
      return null;
    }

    const match = this.editor.getNodes().find((x) => String(x.id) === String(nodeId));
    return match || null;
  }

  /**
   * Normalizza un valore eterogeneo (bool/number/string) in booleano,
   * con fallback esplicito quando il valore non e interpretabile.
   */
  private toBoolean(value: any, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        return fallback;
      }
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'si') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
    }
    return fallback;
  }

  /**
   * Determina se una route node deriva da route metadata standard o da dashboard embedded,
   * usando flag espliciti e fallback su action/boardcontent/datasources presenti.
   */
  private getRouteSourceType(input: any): 'route' | 'dashboard' {
    if (!input || typeof input !== 'object') {
      return 'route';
    }

    const explicit = String(input?.workflowRouteSourceType ?? input?.routeSourceType ?? '').trim().toLowerCase();
    if (explicit === 'dashboard') {
      return 'dashboard';
    }
    if (explicit === 'route') {
      return 'route';
    }

    const action = String(input?.workflowAction ?? input?.action ?? '').trim().toLowerCase();
    if (action === 'dashboard') {
      return 'dashboard';
    }

    const boardcontent = String(input?.workflowDashboardBoardcontent ?? input?.dashboardBoardcontent ?? '').trim();
    if (boardcontent) {
      return 'dashboard';
    }

    const datasources = input?.workflowDashboardDatasources ?? input?.dashboardDatasources;
    if (Array.isArray(datasources) && datasources.length) {
      return 'dashboard';
    }

    return 'route';
  }

  /**
   * Risolve la route sorgente di una action:
   * prima da `workflowRouteNodeId`, fallback dalla connessione in ingresso `*.out -> action.in`.
   */
  private resolveRouteNodeForAction(actionNode: WorkflowNode): WorkflowNode | null {
    const routeNodeId = String((actionNode as any).workflowRouteNodeId || '').trim();
    if (routeNodeId) {
      const direct = this.getNodeById(routeNodeId);
      if (direct && String((direct as any).workflowType || '') === 'route') {
        return direct;
      }
    }

    const actionId = String(actionNode.id || '');
    const incoming = this.editor?.getConnections().find((connection) =>
      String(connection.target) === actionId && String(connection.targetInput) === 'in'
    );
    if (!incoming) {
      return null;
    }

    const source = this.getNodeById(String(incoming.source || ''));
    if (source && String((source as any).workflowType || '') === 'route') {
      return source;
    }

    return null;
  }

  /**
   * Garantisce un `workflowRouteMetadataBundle` valido sul nodo route:
   * riusa bundle esistente, altrimenti lo costruisce da datasource route metadata
   * (se richiesto) o crea un bundle vuoto.
   */
  private async ensureRouteMetadataBundleForNode(routeNode: WorkflowNode, serializeFromDatasourceIfMissing: boolean): Promise<RouteMetadataBundle | null> {
    if (!routeNode || String((routeNode as any).workflowType || '') !== 'route') {
      return null;
    }

    const route = String((routeNode as any).workflowRoute || '').trim();
    if (!route) {
      return null;
    }

    const existing = this.sanitizeForSerialization((routeNode as any).workflowRouteMetadataBundle || null);
    if (existing) {
      (routeNode as any).workflowRouteMetadataBundle = existing;
      return existing;
    }

    let built: RouteMetadataBundle | null = null;
    if (serializeFromDatasourceIfMissing && this.routeMetadataDs) {
      this.routeMetadataDs.hardcodedRoute = route;
      this.routeMetadataDs.route.next(route);
      await this.routeMetadataDs.getSchemaAndData(true);
      built = this.buildRouteMetadataBundle(route);
    }

    if (!built) {
      built = this.createEmptyRouteBundle(route);
    }

    (routeNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(built);
    return (routeNode as any).workflowRouteMetadataBundle;
  }

  /**
   * Inserisce nel bundle route il target metadata associato a una nuova action:
   * - scope tabella: aggiunge una riga in `tableActions`,
   * - scope colonna: aggiunge una colonna button in `columnMetadata`.
   * Ritorna la coppia (`targetType`,`targetId`) da salvare sul nodo action.
   */
  private async attachActionMetadataToRouteBundle(
    routeNode: WorkflowNode,
    bundle: RouteMetadataBundle,
    actionType: WorkflowActionType,
    actionScope: WorkflowActionScope
  ): Promise<{ targetType: 'table_action' | 'column_button'; targetId: number }> {
    const mdId = Number(bundle?.tableMetadata?.md_id);
    const suggestedCallback = await this.fetchSuggestedTableActionCallback(actionType.id);
    if (actionScope.id === 0) {
      const newId = this.nextLocalNumericId(bundle.tableActions || [], 'Id');
      const maxOrder = this.maxNumericField(bundle.tableActions || [], 'ordine');
      const tableAction = {
        Id: newId,
        md_id: Number.isFinite(mdId) ? mdId : undefined,
        md_action_type: actionType.id,
        ordine: maxOrder + 10,
        button_caption: 'Azione',
        button_image: 'pi pi-cog',
        button_template: '',
        action_callback: suggestedCallback,
        disable_callback: ''
      };
      bundle.tableActions = Array.isArray(bundle.tableActions) ? bundle.tableActions : [];
      bundle.tableActions.push(tableAction);
      (routeNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(bundle);
      this.emitWorkflow();
      return { targetType: 'table_action', targetId: newId };
    }

    const newMcId = this.nextLocalNumericId(bundle.columnMetadata || [], 'mc_id');
    const baseName = this.toMetadataSafeName(`wf_action_${actionType.description}`) || 'wf_action_button';
    const usedNames = new Set(
      (bundle.columnMetadata || [])
        .map((x: any) => String(x?.mc_nome_colonna || '').trim().toLowerCase())
        .filter((x: string) => !!x)
    );
    let name = baseName;
    let seq = 1;
    while (usedNames.has(name.toLowerCase())) {
      name = `${baseName}_${seq++}`;
    }

    const maxOrder = this.maxNumericField(bundle.columnMetadata || [], 'mc_ordine');
    const columnButton = {
      mc_id: newMcId,
      md_id: Number.isFinite(mdId) ? mdId : undefined,
      mc_nome_colonna: name,
      mc_real_column_name: name,
      ang_name: name,
      mc_ui_column_type: 'button',
      mc_display_string_in_view: 'Azione',
      mc_display_string_in_edit: 'Azione',
      mc_ordine: maxOrder + 10,
      mc_button_caption: 'Azione',
      mc_button_image: 'pi pi-cog',
      mc_button_template: '',
      mc_button_action: suggestedCallback,
      mc_button_action_type: actionType.id,
      mc_button_confirm_message: '',
      mc_button_executed_message: '',
      mc_button_tooltip: '',
      mc_button_visibility_condition: '',
      _Metadati_UI_Stili_Colonnes: [],
      _Metadati_Utenti_Autorizzazioni_Colonnes: []
    };

    bundle.columnMetadata = Array.isArray(bundle.columnMetadata) ? bundle.columnMetadata : [];
    bundle.columnMetadata.push(columnButton);
    this.rebuildDerivedRouteCollections(bundle);
    (routeNode as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(bundle);
    this.emitWorkflow();
    return { targetType: 'column_button', targetId: newMcId };
  }

  /**
   * Richiede al server un callback suggerito (`MetaService.suggestTableActionCallback`)
   * per il tipo azione; fallback locale su `debugger;` in caso di errore.
   */
  private async fetchSuggestedTableActionCallback(actionTypeIdRaw: number): Promise<string> {
    const fallback = 'debugger;';
    const actionTypeId = Number(actionTypeIdRaw);
    if (!Number.isFinite(actionTypeId) || actionTypeId < 0) {
      return fallback;
    }

    const rootUrl = String(WtoolboxService.appSettings?.global_root_url || '').trim();
    const http = WtoolboxService.http;
    if (!rootUrl || !http?.post) {
      return fallback;
    }

    try {
      const response = await http.post<any>(`${rootUrl}MetaService.suggestTableActionCallback`, {
        md_action_type: actionTypeId,
        target_route: '',
        target_archetype: '',
        target_class: '',
        target_method: '',
        target_export_format: ''
      }).toPromise();
      const suggested = String(response?.res ?? response ?? '').trim();
      return suggested || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Genera un id numerico locale (max+1) o seed timestamp se la collezione e vuota.
   */
  private nextLocalNumericId(list: any[], field: string): number {
    const max = this.maxNumericField(list, field);
    if (max > 0) {
      return max + 1;
    }
    const seed = Date.now();
    return seed > 0 ? seed : 1;
  }

  /**
   * Estrae il massimo valore numerico presente nel campo indicato.
   */
  private maxNumericField(list: any[], field: string): number {
    let max = 0;
    (Array.isArray(list) ? list : []).forEach((row: any) => {
      const value = Number(row?.[field]);
      if (Number.isFinite(value) && value > max) {
        max = value;
      }
    });
    return max;
  }

  /**
   * Normalizza una stringa in nome metadata-safe (`a-z0-9_`) per campi tecnici.
   */
  private toMetadataSafeName(raw: string): string {
    return String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Attende la disponibilita del `routeMetadataEditor` (render async dialog),
   * con numero massimo tentativi.
   */
  private async waitForRouteMetadataEditor(maxAttempts: number = 20): Promise<MetadataEditorComponent | null> {
    for (let i = 0; i < maxAttempts; i++) {
      if (this.routeMetadataEditor) {
        return this.routeMetadataEditor;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return null;
  }

  /**
   * Attende la disponibilita del `actionMetadataEditor` (render async dialog),
   * con numero massimo tentativi.
   */
  private async waitForActionMetadataEditor(maxAttempts: number = 20): Promise<MetadataEditorComponent | null> {
    for (let i = 0; i < maxAttempts; i++) {
      if (this.actionMetadataEditor) {
        return this.actionMetadataEditor;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return null;
  }

  /**
   * Salva il grafo workflow corrente via `MetaService.saveWorkflowGraph`.
   * Mapping payload persistito verificato lato server (`Services/MetaService.cs`):
   * - `graph_key` -> `_wuic_workflow_graph.wg_key`
   * - `graph_name` -> `_wuic_workflow_graph.wg_name`
   * - `graph_json` -> `_wuic_workflow_graph.wg_graph_json`
   * - `route_metadata_json[]` -> righe `_wuic_workflow_graph_route_metadata`
   *   (`wg_id`, `node_client_id`, `route_name`, `route_action`, `metadata_json`).
   * Il server esegue upsert su `_wuic_workflow_graph` e replace completo del dettaglio route metadata.
   */
  async saveWorkflow(): Promise<void> {
    if (this.savingWorkflow) {
      return;
    }

    const currentKey = String(this.selectedSavedGraphKey || this.workflowKey || '').trim();
    const hasCurrentSavedGraph = !!currentKey
      && this.savedGraphOptions.some((x) => String(x?.value || '').trim() === currentKey);
    if (hasCurrentSavedGraph) {
      const ok = await WtoolboxService.confirm({
        message: this.tf('workflow.graph.overwrite_confirm', 'Sovrascrivere il grafo corrente "{0}"?', currentKey)
      });
      if (!ok) {
        return;
      }
    }

    if (!hasCurrentSavedGraph) {
      const suggested = String(this.workflowName || '').trim();
      const promptResult = await WtoolboxService.promptDialog(
        this.t('workflow.graph.name_prompt', 'Nome grafo'),
        [{
          name: 'workflowName',
          caption: this.t('workflow.graph.name_prompt', 'Nome grafo'),
          type: 'text',
          value: suggested,
          required: true
        }]
      );
      if (!promptResult) {
        return;
      }
      const entered = promptResult?.workflowName?.value;
      const normalized = String(entered || '').trim();
      if (!normalized) {
        WtoolboxService.messageNotificationService.add({
          severity: 'warn',
          summary: this.t('warning', 'Warning'),
          detail: this.t('workflow.graph.name_required', 'Nome grafo obbligatorio')
        });
        return;
      }
      this.workflowName = normalized;
    }

    const key = hasCurrentSavedGraph ? currentKey : this.generateWorkflowKey();
    this.workflowKey = key;

    const payload = this.serializeGraphPayload();
    this.savingWorkflow = true;
    try {
      await this.dataSrv.saveWorkflowGraph({
        user_id: '',
        graph_key: key,
        graph_name: String(this.workflowName || '').trim(),
        graph_json: JSON.stringify(payload.graph),
        route_metadata_json: JSON.stringify(payload.routeMetadata)
      });
      await this.refreshSavedGraphs(key);
      this.refreshToolbarMenuItems();
    } finally {
      this.savingWorkflow = false;
      this.refreshToolbarMenuItems();
    }
  }

  /**
   * Genera una chiave workflow client-side nel formato `wf_<timestampUTC>_<rand>`,
   * usata come candidato `wg_key` per nuovi grafi.
   */
  private generateWorkflowKey(): string {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.random().toString(36).slice(2, 8);
    return `wf_${stamp}_${rand}`;
  }

  /**
   * Carica un grafo da `MetaService.loadWorkflowGraph` usando `workflowKey`,
   * normalizza i formati di risposta (`graph_json` + `route_metadata`) e ricostruisce il canvas.
   * Se la chiave non esiste, il server ritorna un grafo vuoto (`nodes/connections` vuoti).
   */
  async loadWorkflow(): Promise<void> {
    if (this.loadingWorkflow) {
      return;
    }

    const key = String(this.workflowKey || '').trim();
    if (!key) {
      return;
    }

    this.loadingWorkflow = true;
    try {
      const raw = await this.dataSrv.loadWorkflowGraph({
        user_id: '',
        graph_key: key
      });
      const normalized = this.normalizeLoadedWorkflow(raw);
      await this.restoreGraph(normalized.graph, normalized.routeMetadata);
      this.workflowName = normalized.graphName;
      this.selectedSavedGraphKey = key;
      this.refreshToolbarMenuItems();
    } finally {
      this.loadingWorkflow = false;
      this.refreshToolbarMenuItems();
    }
  }

  /**
   * Rilegge l'elenco grafi salvati tramite `MetaService.getWorkflowGraphs`
   * (query su `_wuic_workflow_graph` ordinata per `wg_updated_on DESC, wg_key ASC`)
   * e aggiorna `savedGraphOptions` per dropdown/dialog con eventuale preselezione.
   */
  async refreshSavedGraphs(preselectKey: string = ''): Promise<void> {
    this.loadingSavedGraphs = true;
    try {
      const raw = await this.dataSrv.getWorkflowGraphs({ user_id: '' });
      const rows = this.normalizeSavedGraphs(raw);
      this.savedGraphOptions = rows.map((row: any) => {
        const key = String(this.pickFirstDefined(row, ['graph_key', 'wg_key']) || '').trim();
        const name = String(this.pickFirstDefined(row, ['graph_name', 'wg_name']) || '').trim();
        const updatedOn = String(this.pickFirstDefined(row, ['wg_updated_on', 'updated_on']) || '').trim();
        const label = name
          ? `${name} (${key})`
          : key;
        return {
          value: key,
          name,
          label: updatedOn ? `${label} - ${updatedOn}` : label
        };
      }).filter((x) => !!x.value);

      const targetKey = String(preselectKey || '').trim();
      if (targetKey && this.savedGraphOptions.some((x) => x.value === targetKey)) {
        this.selectedSavedGraphKey = targetKey;
      } else if (!this.savedGraphOptions.some((x) => x.value === this.selectedSavedGraphKey)) {
        this.selectedSavedGraphKey = '';
      }
      this.refreshToolbarMenuItems();
    } finally {
      this.loadingSavedGraphs = false;
      this.refreshToolbarMenuItems();
    }
  }

  /**
   * Sincronizza `workflowKey/workflowName` quando l'utente seleziona un grafo dalla lista salvati.
   */
  onSavedGraphSelectionChange(): void {
    const selected = this.savedGraphOptions.find((x) => x.value === this.selectedSavedGraphKey);
    if (!selected) {
      return;
    }

    this.workflowKey = selected.value;
    this.workflowName = selected.name || '';
    this.refreshToolbarMenuItems();
  }

  /**
   * Apre il dialog "Riapri workflow" ricaricando prima la lista grafi disponibili.
   */
  async openReopenWorkflowDialog(): Promise<void> {
    this.reopenDialogSelectedGraphKey = String(this.currentSavedGraphKey || this.selectedSavedGraphKey || '').trim();
    this.reopenWorkflowDialogVisible = true;
    try {
      await this.refreshSavedGraphs();
      if (!this.reopenDialogSelectedGraphKey) {
        this.reopenDialogSelectedGraphKey = String(this.currentSavedGraphKey || this.selectedSavedGraphKey || '').trim();
      }
    } catch {
      // Keep dialog open with current in-memory options even if refresh fails.
    }
  }

  /**
   * Conferma il dialog di riapertura e carica il grafo selezionato.
   */
  async confirmReopenWorkflowDialog(): Promise<void> {
    const selected = this.savedGraphOptions.find((x) => x.value === this.reopenDialogSelectedGraphKey);
    if (!selected) {
      return;
    }

    this.workflowKey = selected.value;
    this.selectedSavedGraphKey = selected.value;
    this.reopenWorkflowDialogVisible = false;
    await this.loadWorkflow();
  }

  /**
   * Chiude il dialog di riapertura senza modificare il workflow corrente.
   */
  cancelReopenWorkflowDialog(): void {
    this.reopenWorkflowDialogVisible = false;
  }

  /**
   * Carica il grafo attualmente selezionato nel dropdown principale.
   */
  async openSelectedGraph(): Promise<void> {
    const selected = this.savedGraphOptions.find((x) => x.value === this.selectedSavedGraphKey);
    if (!selected) {
      return;
    }

    this.workflowKey = selected.value;
    await this.loadWorkflow();
  }

  /**
   * Rinominazione del grafo selezionato tramite `renameWorkflowGraph`,
   * seguita da refresh lista grafi.
   */
  async renameSelectedGraph(): Promise<void> {
    const key = String(this.workflowKey || this.selectedSavedGraphKey || '').trim();
    if (!key) {
      return;
    }

    await this.dataSrv.renameWorkflowGraph({
      user_id: '',
      graph_key: key,
      graph_name: String(this.workflowName || '').trim()
    });
    await this.refreshSavedGraphs(key);
    this.refreshToolbarMenuItems();
  }

  /**
   * Elimina il grafo selezionato via `deleteWorkflowGraph`, resetta stato corrente
   * e reinizializza il canvas con un nuovo workflow vuoto.
   */
  async deleteSelectedGraph(): Promise<void> {
    const key = String(this.workflowKey || this.selectedSavedGraphKey || '').trim();
    if (!key) {
      return;
    }

    const ok = await WtoolboxService.confirm({
      message: this.tf('workflow.graph.delete_confirm', 'Eliminare il grafo "{0}"?', key)
    });
    if (!ok) {
      return;
    }

    await this.dataSrv.deleteWorkflowGraph({
      user_id: '',
      graph_key: key
    });
    await this.refreshSavedGraphs();
    await this.createNewWorkflow();
  }

  /**
   * Crea un nuovo workflow locale svuotando chiave/nome/selezione,
   * cancellando il canvas e ricreando il nodo Start iniziale.
   */
  async createNewWorkflow(): Promise<void> {
    await this.clearGraph();
    this.workflowKey = '';
    this.workflowName = '';
    this.selectedSavedGraphKey = '';
    this.reopenDialogSelectedGraphKey = '';
    await this.ensureInitialStartNode();
    await this.safeZoomAt();
    this.refreshToolbarMenuItems();
    this.emitWorkflow();
  }

  get currentSavedGraphKey(): string {
    const key = String(this.selectedSavedGraphKey || this.workflowKey || '').trim();
    if (!key) {
      return '';
    }
    const exists = this.savedGraphOptions.some((x) => String(x?.value || '').trim() === key);
    return exists ? key : '';
  }

  get canOpenWorkflowRunner(): boolean {
    return !!this.currentSavedGraphKey;
  }

  get currentGraphCaption(): string {
    const key = this.currentSavedGraphKey;
    if (!key) {
      return 'Nuovo grafo non salvato';
    }

    const selected = this.savedGraphOptions.find((x) => String(x?.value || '').trim() === key);
    const name = String(selected?.name || this.workflowName || '').trim();
    if (name) {
      return `Grafo aperto: ${name}`;
    }
    return `Grafo aperto: ${key}`;
  }

  /**
   * Rigenera i menu toolbar (azioni grafo e runner) con stato enabled/disabled
   * coerente con salvataggio/caricamento corrente.
   */
  private refreshToolbarMenuItems(): void {
    this.graphActionsMenuItems = [
      {
        label: 'Riapri',
        icon: 'pi pi-folder-open',
        command: () => {
          void this.openReopenWorkflowDialog();
        },
        disabled: this.loadingWorkflow
      },
      { separator: true },
      {
        label: 'Nuovo grafo',
        icon: 'pi pi-file',
        command: () => {
          void this.createNewWorkflow();
        }
      },
      {
        label: 'Salva grafo',
        icon: 'pi pi-save',
        command: () => {
          void this.saveWorkflow();
        },
        disabled: this.savingWorkflow
      },
      {
        label: 'Elimina',
        icon: 'pi pi-trash',
        command: () => {
          void this.deleteSelectedGraph();
        },
        disabled: !(this.workflowKey || this.selectedSavedGraphKey)
      },
      { separator: true },
      {
        label: `Re-layout automatico: ${this.relayoutEnabled ? 'ON' : 'OFF'}`,
        icon: this.relayoutEnabled ? 'pi pi-check-square' : 'pi pi-square',
        command: () => {
          this.relayoutEnabled = !this.relayoutEnabled;
          this.onRelayoutEnabledChanged();
          this.refreshToolbarMenuItems();
        }
      }
    ];

    this.runnerActionsMenuItems = [
      {
        label: 'Apri runner in nuova tab',
        icon: 'pi pi-external-link',
        command: () => this.openWorkflowRunnerInNewTab(),
        disabled: !this.canOpenWorkflowRunner
      }
    ];
  }

  /**
   * Apre il runner workflow in una nuova tab su `#/workflow-runner/<graphKey>`.
   */
  openWorkflowRunnerInNewTab(): void {
    const key = this.currentSavedGraphKey;
    if (!key) {
      return;
    }

    const encodedKey = encodeURIComponent(key);
    const base = new URL(document.baseURI || window.location.origin);
    const target = new URL(`#/workflow-runner/${encodedKey}`, base);
    window.open(target.toString(), '_blank');
  }

  /**
   * Serializza lo stato editor in due payload:
   * 1) `graph` (nodi/connessioni + coordinate) da salvare in `wg_graph_json`,
   * 2) `routeMetadata` dettaglio per route-node da salvare nella tabella `_wuic_workflow_graph_route_metadata`.
   * Prima della serializzazione sincronizza `md_action_type` dei `tableActions` nel bundle route
   * con gli action node effettivamente collegati.
   */
  private serializeGraphPayload(): { graph: { nodes: WorkflowNodeSerialized[]; connections: WorkflowConnectionSerialized[] }; routeMetadata: any[] } {
    if (!this.editor || !this.area) {
      return { graph: { nodes: [], connections: [] }, routeMetadata: [] };
    }

    const nodes = this.editor.getNodes().map((node) => {
      if (String((node as any).workflowType || '') === 'route') {
        this.syncRouteMetadataActionTypesFromLinkedNodes(node);
      }
      const view = this.area?.nodeViews.get(String(node.id));
      return {
        id: String(node.id),
        label: String(node.label || ''),
        type: String((node as any).workflowType || 'route'),
        route: String((node as any).workflowRoute || ''),
        action: String((node as any).workflowAction || ''),
        actionTypeId: (node as any).workflowActionTypeId,
        actionType: String((node as any).workflowActionType || ''),
        actionScopeId: (node as any).workflowActionScopeId,
        actionScope: String((node as any).workflowActionScope || ''),
        routeSourceType: String((node as any).workflowType || '') === 'route'
          ? this.getRouteSourceType(node)
          : undefined,
        dashboardBoardcontent: String((node as any).workflowType || '') === 'route'
          ? String((node as any).workflowDashboardBoardcontent || '')
          : undefined,
        dashboardDatasources: String((node as any).workflowType || '') === 'route'
          ? this.sanitizeForSerialization((node as any).workflowDashboardDatasources || [])
          : undefined,
        routeNodeId: String((node as any).workflowRouteNodeId || ''),
        metadataTargetType: String((node as any).workflowMetadataTargetType || '') as 'table_action' | 'column_button' | '',
        metadataTargetId: (node as any).workflowMetadataTargetId,
        x: view?.position?.x ?? 0,
        y: view?.position?.y ?? 0,
        startMenus: (node as any).workflowType === 'start'
          ? this.normalizeStartMenuItems((node as any).workflowStartMenus || [])
          : [],
        startMenuCaption: (node as any).workflowType === 'start'
          ? String((node as any).workflowStartMenuCaption || '')
          : '',
        startInheritMetadata: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartInheritMetadata, true)
          : true,
        startExclusiveMenu: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartExclusiveMenu, false)
          : false,
        startShowExit: (node as any).workflowType === 'start'
          ? this.toBoolean((node as any).workflowStartShowExit, true)
          : true,
        routeMetadata: (node as any).workflowType === 'route'
          ? this.sanitizeForSerialization((node as any).workflowRouteMetadataBundle || null)
          : null
      } as WorkflowNodeSerialized;
    });

    const connections = this.editor.getConnections().map((connection) => ({
      id: String(connection.id),
      source: String(connection.source),
      sourceOutput: String(connection.sourceOutput),
      target: String(connection.target),
      targetInput: String(connection.targetInput)
    })) as WorkflowConnectionSerialized[];

    return {
      graph: { nodes, connections },
      routeMetadata: this.extractRouteMetadataEntries(nodes)
    };
  }

  /**
   * Allinea nel bundle route il campo `md_action_type` delle table action
   * con il `workflowActionTypeId` dei nodi action effettivamente collegati.
   */
  private syncRouteMetadataActionTypesFromLinkedNodes(routeNode: WorkflowNode): void {
    if (!this.editor || !routeNode || String((routeNode as any).workflowType || '') !== 'route') {
      return;
    }

    const routeNodeId = String(routeNode.id || '');
    const bundle = this.sanitizeForSerialization((routeNode as any).workflowRouteMetadataBundle || null);
    if (!bundle || !Array.isArray(bundle.tableActions)) {
      return;
    }

    const actionNodes = this.editor.getNodes().filter((node) =>
      String((node as any)?.workflowType || '') === 'action'
      && String((node as any)?.workflowRouteNodeId || '') === routeNodeId
      && String((node as any)?.workflowMetadataTargetType || '') === 'table_action'
    );
    if (!actionNodes.length) {
      return;
    }

    actionNodes.forEach((actionNode) => {
      const targetId = Number((actionNode as any)?.workflowMetadataTargetId || 0);
      const actionTypeId = Number((actionNode as any)?.workflowActionTypeId);
      if (!Number.isFinite(targetId) || targetId === 0 || !Number.isFinite(actionTypeId)) {
        return;
      }
      const row = (bundle.tableActions || []).find((x: any) => Number(x?.Id || 0) === targetId);
      if (!row) {
        return;
      }
      row.md_action_type = actionTypeId;
    });

    (routeNode as any).workflowRouteMetadataBundle = bundle;
  }

  /**
   * Estrae le righe dettaglio route da nodi di tipo `route` nel formato atteso dal backend:
   * `{ node_id, route_name, route_action, metadata_json }`.
   * `metadata_json` e serializzato come string JSON per persistenza in `wgrm.metadata_json`.
   */
  private extractRouteMetadataEntries(nodes: WorkflowNodeSerialized[]): any[] {
    return (nodes || [])
      .filter((node) => node.type === 'route')
      .map((node) => ({
        node_id: String(node.id || ''),
        route_name: String(node.route || ''),
        route_action: String(node.action || ''),
        metadata_json: JSON.stringify(this.sanitizeForSerialization(node.routeMetadata || null))
      }));
  }

  /**
   * Ricostruisce editor/canvas da payload serializzato:
   * - ricrea nodi con mapping oldId->newId,
   * - ripristina metadata route/start/action fields,
   * - ricrea connessioni valide (`sourceOutput`/`targetInput` esistenti),
   * - reintegra stato visuale e zoom.
   * Se presente, privilegia `routeMetadataEntries` rispetto al metadata embedded nel nodo.
   */
  private async restoreGraph(
    graph: { nodes: WorkflowNodeSerialized[]; connections: WorkflowConnectionSerialized[] },
    routeMetadataEntries: any[]
  ): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }

    const routeMetadataByNodeId = new Map<string, RouteMetadataBundle | null>();
    (routeMetadataEntries || []).forEach((entry: any) => {
      const nodeId = String(entry?.node_id || '');
      if (!nodeId) {
        return;
      }
      const parsedMetadata = this.parseMaybeJson(entry?.metadata_json);
      routeMetadataByNodeId.set(nodeId, this.sanitizeForSerialization(parsedMetadata));
    });

    await this.clearGraph();

    const mapOldToNew = new Map<string, WorkflowNode>();
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph?.connections) ? graph.connections : [];

    for (const item of nodes) {
      const type = String(item?.type || '') as PaletteNodeDefinition['type'];
      if (type === 'start' && this.findStartNode()) {
        continue;
      }
      const routeConfig = type === 'route'
        ? {
          routeName: String(item?.route || ''),
          action: String(item?.action || '') || 'list',
          sourceType: this.getRouteSourceType(item),
          dashboardBoardcontent: String(item?.dashboardBoardcontent || ''),
          dashboardDatasources: this.sanitizeForSerialization(item?.dashboardDatasources || []) || []
        }
        : undefined;
      const actionType = type === 'action' && Number.isInteger(Number(item?.actionTypeId))
        ? this.getActionTypeById(Number(item?.actionTypeId))
        : undefined;
      const actionScope = type === 'action' && Number.isInteger(Number(item?.actionScopeId))
        ? this.getActionScopeById(Number(item?.actionScopeId))
        : undefined;
      const metadataFromDetail = routeMetadataByNodeId.get(String(item?.id || ''));
      const routeMetadata = metadataFromDetail
        || this.sanitizeForSerialization(item?.routeMetadata || null);

      const node = this.createNode(
        (type || 'route') as PaletteNodeDefinition['type'],
        routeConfig,
        actionType || undefined,
        actionScope || undefined,
        routeMetadata
      );
      if (type === 'action') {
        (node as any).workflowRouteNodeId = String(item?.routeNodeId || '');
        (node as any).workflowMetadataTargetType = String(item?.metadataTargetType || '');
        (node as any).workflowMetadataTargetId = Number(item?.metadataTargetId || 0);
      } else if (type === 'start') {
        (node as any).workflowStartMenus = this.normalizeStartMenuItems(item?.startMenus || []);
        (node as any).workflowStartMenuCaption = String(item?.startMenuCaption || '');
        (node as any).workflowStartInheritMetadata = this.toBoolean(item?.startInheritMetadata, true);
        (node as any).workflowStartExclusiveMenu = this.toBoolean(item?.startExclusiveMenu, false);
        (node as any).workflowStartShowExit = this.toBoolean(item?.startShowExit, true);
      }
      await this.editor.addNode(node);
      await this.area.translate(node.id, { x: Number(item?.x || 0), y: Number(item?.y || 0) });
      this.applyNodeVisualState(node);
      mapOldToNew.set(String(item?.id || ''), node);
    }

    mapOldToNew.forEach((newNode) => {
      if (String((newNode as any).workflowType || '') !== 'action') {
        return;
      }
      const oldRouteNodeId = String((newNode as any).workflowRouteNodeId || '');
      const mappedRouteNode = oldRouteNodeId ? mapOldToNew.get(oldRouteNodeId) : null;
      if (mappedRouteNode) {
        (newNode as any).workflowRouteNodeId = String(mappedRouteNode.id);
      }
      this.applyNodeVisualState(newNode);
    });

    mapOldToNew.forEach((newNode) => {
      this.applyNodeVisualState(newNode);
    });

    for (const item of connections) {
      const sourceNode = mapOldToNew.get(String(item?.source || ''));
      const targetNode = mapOldToNew.get(String(item?.target || ''));
      if (!sourceNode || !targetNode) {
        continue;
      }

      const sourceOutput = String(item?.sourceOutput || 'out');
      const targetInput = String(item?.targetInput || 'in');
      const sourceHasOutput = !!(sourceNode.outputs as any)?.[sourceOutput];
      const targetHasInput = !!(targetNode.inputs as any)?.[targetInput];
      if (!sourceHasOutput || !targetHasInput) {
        continue;
      }

      const connection = new ClassicPreset.Connection(sourceNode as any, sourceOutput as any, targetNode as any, targetInput as any);
      await this.editor.addConnection(connection);
    }

    await this.ensureInitialStartNode();
    await this.rehydrateNodeVisualStateAfterRestore();

    if (this.relayoutEnabled) {
      await this.runAutoArrangeBatch([]);
    } else {
      await this.safeZoomAt();
      this.emitWorkflow();
    }
  }

  /**
   * Esegue zoom-to-fit dei nodi correnti ignorando errori in ambienti non visual/test.
   */
  private async safeZoomAt(): Promise<void> {
    if (!this.area || !this.editor) {
      return;
    }

    try {
      await AreaExtensions.zoomAt(this.area, this.editor.getNodes());
    } catch {
      // Ignore zoom failures in non-visual/test environments.
    }
  }

  /**
   * Restituisce il nodo Start presente nel grafo, se esiste.
   */
  private findStartNode(): WorkflowNode | null {
    if (!this.editor) {
      return null;
    }

    return this.editor.getNodes().find((node) => String((node as any).workflowType || '') === 'start') || null;
  }

  /**
   * Garantisce l'esistenza del nodo Start dopo restore/clear.
   */
  private async ensureInitialStartNode(): Promise<void> {
    if (!this.editor || !this.area) {
      return;
    }

    if (this.findStartNode()) {
      return;
    }

    await this.addNodeByType('start', 120, 220);
  }

  /**
   * Forza il refresh dello stato visuale di tutti i nodi (doppio pass immediato+deferred).
   */
  private refreshAllNodeVisualState(): void {
    if (!this.editor) {
      return;
    }

    this.editor.getNodes().forEach((node) => this.applyNodeVisualState(node));
    setTimeout(() => {
      this.editor?.getNodes().forEach((node) => this.applyNodeVisualState(node));
    }, 50);
  }

  /**
   * Reidrata ripetutamente lo stato visuale dopo restore per sincronizzare label/style con il renderer.
   */
  private async rehydrateNodeVisualStateAfterRestore(): Promise<void> {
    if (!this.editor) {
      return;
    }

    const attempts = 4;
    for (let i = 0; i < attempts; i++) {
      this.editor.getNodes().forEach((node) => this.applyNodeVisualState(node));
      await Promise.all(
        this.editor.getNodes().map((node) => this.area?.update('node' as any, String(node.id)) || Promise.resolve())
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }

  /**
   * Svuota il canvas rimuovendo prima tutte le connessioni e poi tutti i nodi.
   */
  private async clearGraph(): Promise<void> {
    if (!this.editor) {
      return;
    }

    const connections = [...this.editor.getConnections()];
    for (const connection of connections) {
      await this.editor.removeConnection(connection.id);
    }

    const nodes = [...this.editor.getNodes()];
    for (const node of nodes) {
      await this.editor.removeNode(node.id);
    }
  }

  /**
   * Normalizza la risposta `loadWorkflowGraph` supportando alias server legacy/nuovi:
   * - grafo da `graph_json|wg_graph_json|graphjson`
   * - metadata da `route_metadata|routeMetadata`
   * - nome da `graph_name|wg_name|graphname`.
   */
  private normalizeLoadedWorkflow(raw: any): { graph: { nodes: WorkflowNodeSerialized[]; connections: WorkflowConnectionSerialized[] }, routeMetadata: any[], graphName: string } {
    const normalizedRaw = this.parseMaybeJson(raw);
    const root = Array.isArray(normalizedRaw) ? (normalizedRaw[0] || {}) : (normalizedRaw || {});
    const graphJson = this.pickFirstDefined(root, ['graph_json', 'wg_graph_json', 'graphjson']) || '{}';
    // skills/typed-localized-exceptions: detect graph_json parse failure
    // ed emit typed envelope. Senza questa guard il silent fall-back mostrava
    // un canvas vuoto col solo Start node senza dire all'utente che il grafo
    // salvato e' corrotto (DB row con JSON malformato).
    let graph: any = null;
    let parseError: any = null;
    if (typeof graphJson === 'string' && graphJson.trim().length > 0 && graphJson.trim() !== '{}') {
      try {
        graph = JSON.parse(graphJson);
      } catch (err) {
        parseError = err;
        graph = {};
      }
    } else {
      graph = this.parseMaybeJson(graphJson) || {};
    }
    if (parseError) {
      const exc = new WuicClientException(
        WuicErrorCodes.MetadataPropsBagMalformed,
        {
          route:         String(this.pickFirstDefined(root, ['graph_name', 'wg_name', 'graphname']) || 'workflow'),
          field:         'wg_graph_json',
          parserMessage: (parseError instanceof Error ? parseError.message : String(parseError)).slice(0, 500),
          phase:         'workflow.normalizeLoadedWorkflow',
        },
        { surface: 'component', targetName: 'WorkflowDesignerComponent.normalizeLoadedWorkflow', cause: parseError }
      );
      GlobalHandler.emitClientException(exc);
    }
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph?.connections) ? graph.connections : [];
    const routeMetadata = Array.isArray(root?.route_metadata)
      ? root.route_metadata
      : Array.isArray(root?.routeMetadata)
        ? root.routeMetadata
        : [];
    const graphName = String(this.pickFirstDefined(root, ['graph_name', 'wg_name', 'graphname']) || '');

    return {
      graph: { nodes, connections },
      routeMetadata,
      graphName
    };
  }

  /**
   * Uniforma la risposta `getWorkflowGraphs` ad array righe,
   * gestendo sia array diretto sia envelope `{ results: [...] }`.
   */
  private normalizeSavedGraphs(raw: any): any[] {
    const parsed = this.parseMaybeJson(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.results)) {
      return parsed.results;
    }
    return [];
  }

  /**
   * Effettua parse JSON tollerante: ritorna oggetto originale se gia object,
   * `null` su input vuoto/parse error.
   */
  private parseMaybeJson(value: any): any {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'object') {
      return value;
    }

    const input = String(value || '').trim();
    if (!input) {
      return null;
    }

    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  /**
   * Recupera il primo campo valorizzato tra possibili alias (case-insensitive).
   */
  private pickFirstDefined(obj: any, keys: string[]): any {
    if (!obj || !keys?.length) {
      return undefined;
    }

    const map = new Map<string, string>();
    Object.keys(obj).forEach((k) => map.set(String(k || '').toLowerCase(), k));

    for (const key of keys) {
      const direct = obj[key];
      if (direct !== undefined) {
        return direct;
      }

      const mapped = map.get(String(key || '').toLowerCase());
      if (mapped && obj[mapped] !== undefined) {
        return obj[mapped];
      }
    }

    return undefined;
  }

  /**
   * Normalizza ricorsivamente un payload rendendolo serializzabile:
   * rimuove funzioni, evita cicli, converte date e scarta chiavi pericolose.
   */
  private sanitizeForSerialization(value: any): any {
    const seen = new WeakSet<object>();
    const transientSerializationKeys = new Set([
      '_tView',
      '_declarationTContainer',
      '_injector',
      '_lView',
      '_views',
      'appRef',
      '_zoneDelegate',
      'db',
      'zone',
      'suggestions',
      'nestedSource',
      'editor',
      'validationsRules',
      'blueprint',
      'extraProps'
    ]);

    const walk = (input: any): any => {
      if (input === null || input === undefined) {
        return input;
      }
      if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
        return input;
      }
      if (input instanceof Date) {
        return input.toISOString();
      }
      if (Array.isArray(input)) {
        return input.map((x) => walk(x)).filter((x) => x !== undefined);
      }
      if (typeof input !== 'object') {
        return undefined;
      }
      if (seen.has(input)) {
        return undefined;
      }

      seen.add(input);
      const output: any = {};
      Object.keys(input).forEach((key) => {
        if (!key || key === '__proto__' || key === 'constructor' || transientSerializationKeys.has(key)) {
          return;
        }
        const field = (input as any)[key];
        if (typeof field === 'function') {
          return;
        }
        const normalized = walk(field);
        if (normalized !== undefined) {
          output[key] = normalized;
        }
      });
      return output;
    };

    return walk(value);
  }

  /**
   * Genera id locale per menu Start (positivo progressivo se presenti id reali,
   * altrimenti sequenza negativa temporanea).
   */
  private nextLocalMenuId(menus: WorkflowStartMenuItem[]): number {
    const maxPositive = Math.max(
      0,
      ...(menus || []).map((x) => Number(x?.mm_id || 0)).filter((x) => Number.isFinite(x) && x > 0)
    );
    if (maxPositive > 0) {
      return maxPositive + 1;
    }
    this.localMenuIdSeed -= 1;
    return this.localMenuIdSeed;
  }

  /**
   * Normalizza la collezione menu Start in shape coerente (`WorkflowStartMenuItem`),
   * includendo default/ordini/id locali e normalizzazione autorizzazioni figlie.
   */
  private normalizeStartMenuItems(input: any): WorkflowStartMenuItem[] {
    const rows = Array.isArray(input) ? input : [];
    const normalized = rows
      .map((row: any, idx: number) => {
        const mmId = Number(row?.mm_id);
        const normalizedId = Number.isFinite(mmId) && mmId !== 0 ? mmId : this.localMenuIdSeed - idx - 1;
        return {
          mm_id: normalizedId,
          mm_parent_id: Number(row?.mm_parent_id || 0),
          mm_nome_menu: String(row?.mm_nome_menu || row?.mm_display_string_menu || `menu_${Math.abs(normalizedId)}`).trim(),
          mm_display_string_menu: String(row?.mm_display_string_menu || row?.mm_nome_menu || this.t('menu', 'Menu')).trim(),
          mm_tooltip_menu: String(row?.mm_tooltip_menu || row?.mm_display_string_menu || row?.mm_nome_menu || this.t('menu', 'Menu')).trim(),
          mm_uri_menu: String(row?.mm_uri_menu || '').trim(),
          mm_ordine: Number.isFinite(Number(row?.mm_ordine)) ? Number(row?.mm_ordine) : ((idx + 1) * 10),
          mm_is_visible_by_default: row?.mm_is_visible_by_default !== false,
          _Metadati_Utenti_Autorizzazioni_Menus: this.normalizeMenuAuthorizations(
            row?._Metadati_Utenti_Autorizzazioni_Menus || [],
            normalizedId
          )
        } as WorkflowStartMenuItem;
      })
      .filter((row) => !!row.mm_display_string_menu && !!row.mm_uri_menu);

    const minNegativeId = normalized
      .map((x) => Number(x.mm_id))
      .filter((x) => Number.isFinite(x) && x < 0)
      .reduce((acc, curr) => Math.min(acc, curr), 0);
    if (minNegativeId < this.localMenuIdSeed) {
      this.localMenuIdSeed = minNegativeId;
    }

    return normalized;
  }

  /**
   * Normalizza le autorizzazioni menu supportando alias campo multipli (`muamid`, `muam_id`, ...).
   */
  private normalizeMenuAuthorizations(input: any, mmid: number): WorkflowMenuAuthorization[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
      .map((row: any, idx: number) => {
        const muamid = Number(
          this.pickFirstDefined(row, ['muamid', 'muam_id', 'muamId', 'muamID'])
        );
        return {
          mmid: Number(
            this.pickFirstDefined(row, ['mmid', 'mm_id', 'mmId']) ?? mmid ?? 0
          ),
          muamid: Number.isFinite(muamid) && muamid > 0 ? muamid : (idx + 1),
          muamview: Number(this.pickFirstDefined(row, ['muamview', 'muam_view', 'muamView'])) === 1 ? 1 : 0,
          ruoloid: Number(this.pickFirstDefined(row, ['ruoloid', 'ruolo_id', 'role_id']) || 0),
          utenteid: Number(this.pickFirstDefined(row, ['utenteid', 'utente_id', 'user_id']) || 0)
        } as WorkflowMenuAuthorization;
      })
      .filter((row) => Number.isFinite(Number(row.muamid)) && Number(row.muamid) !== 0);
  }

  /**
   * Restituisce il prossimo id autorizzazione menu locale (max `muamid` + 1).
   */
  private nextLocalMenuAuthId(auths: WorkflowMenuAuthorization[]): number {
    const maxId = Math.max(
      0,
      ...(auths || []).map((x) => Number(x?.muamid || 0)).filter((x) => Number.isFinite(x) && x > 0)
    );
    return maxId > 0 ? (maxId + 1) : 1;
  }

  /**
   * Costruisce un `RouteMetadataBundle` leggendo `routeMetadataDs.metaInfo`
   * (tabella, colonne, azioni, permessi, stili e collezioni derivate su colonna).
   */
  private buildRouteMetadataBundle(route: string): RouteMetadataBundle | null {
    const metaInfo = this.routeMetadataDs?.metaInfo;
    if (!metaInfo || !metaInfo.tableMetadata) {
      return null;
    }

    const tableMetadata = this.sanitizeForSerialization(metaInfo.tableMetadata || {});
    const columnMetadata = this.sanitizeForSerialization(metaInfo.columnMetadata || []) || [];
    const tableActions = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_Custom_Actions_Tabelles || []) || [];
    const tablePermissions = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_Utenti_Autorizzazioni_Tabelles || []) || [];
    const tableStyles = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_UI_Stili_Tabelles || []) || [];
    const columnActions = (columnMetadata || []).filter((x: any) => String(x?.mc_ui_column_type || '') === 'button');
    const columnPermissions = (columnMetadata || []).flatMap((x: any) => Array.isArray(x?._Metadati_Utenti_Autorizzazioni_Colonnes) ? x._Metadati_Utenti_Autorizzazioni_Colonnes : []);
    const columnStyles = (columnMetadata || []).flatMap((x: any) => Array.isArray(x?._Metadati_UI_Stili_Colonnes) ? x._Metadati_UI_Stili_Colonnes : []);

    return {
      route: String(route || ''),
      tableMetadata,
      columnMetadata,
      tableActions,
      columnActions,
      tablePermissions,
      columnPermissions,
      tableStyles,
      columnStyles
    };
  }

  /**
   * Variante builder da metaInfo esterno (non dal datasource live),
   * usata per reidratare bundle da payload dashboard/metaInfo.
   */
  private buildRouteMetadataBundleFromMetaInfo(metaInfo: any, routeFallback?: string): RouteMetadataBundle | null {
    if (!metaInfo || !metaInfo.tableMetadata) {
      return null;
    }

    const route = String(metaInfo?.tableMetadata?.md_route_name || routeFallback || '').trim();
    const tableMetadata = this.sanitizeForSerialization(metaInfo.tableMetadata || {});
    const columnMetadata = this.sanitizeForSerialization(metaInfo.columnMetadata || []) || [];
    const tableActions = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_Custom_Actions_Tabelles || []) || [];
    const tablePermissions = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_Utenti_Autorizzazioni_Tabelles || []) || [];
    const tableStyles = this.sanitizeForSerialization((metaInfo.tableMetadata as any)?._Metadati_UI_Stili_Tabelles || []) || [];
    const columnActions = (columnMetadata || []).filter((x: any) => String(x?.mc_ui_column_type || '') === 'button');
    const columnPermissions = (columnMetadata || []).flatMap((x: any) => Array.isArray(x?._Metadati_Utenti_Autorizzazioni_Colonnes) ? x._Metadati_Utenti_Autorizzazioni_Colonnes : []);
    const columnStyles = (columnMetadata || []).flatMap((x: any) => Array.isArray(x?._Metadati_UI_Stili_Colonnes) ? x._Metadati_UI_Stili_Colonnes : []);

    return {
      route,
      tableMetadata,
      columnMetadata,
      tableActions,
      columnActions,
      tablePermissions,
      columnPermissions,
      tableStyles,
      columnStyles
    };
  }

  /**
   * Estrae dal `boardcontent` dashboard i datasource annidati e per ciascuno
   * compone route + metadata bundle serializzabile.
   */
  private extractDashboardDatasourceMetadata(boardcontentRaw: string): WorkflowDashboardDatasourceMetadata[] {
    const parsed = this.parseMaybeJson(boardcontentRaw);
    const roots = Array.isArray(parsed) ? parsed : [];
    const entries: WorkflowDashboardDatasourceMetadata[] = [];

    const walk = (items: any[]) => {
      (Array.isArray(items) ? items : []).forEach((item: any) => {
        if (!item || typeof item !== 'object') {
          return;
        }

        const name = String(item?.name || '').trim().toUpperCase();
        if (name === 'DATASOURCE') {
          const uniqueName = String(item?.uniqueName || '').trim();
          const metaInfo = item?.inputs?.metaInfo || null;
          const rawRoute = item?.inputs?.route;
          const routeFromInput = typeof rawRoute === 'string'
            ? rawRoute
            : String(rawRoute?.md_route_name || rawRoute?.value || '');
          const route = String(metaInfo?.tableMetadata?.md_route_name || routeFromInput || '').trim();
          const metadataBundle = this.buildRouteMetadataBundleFromMetaInfo(metaInfo, route);
          if (uniqueName && route) {
            entries.push({
              uniqueName,
              route,
              metadataBundle: metadataBundle || null
            });
          }
        }

        if (Array.isArray(item?.nestedComponents) && item.nestedComponents.length) {
          walk(item.nestedComponents);
        }
      });
    };

    walk(roots);
    return entries;
  }

  /**
   * Restituisce la lista datasource metadata associata a una route dashboard node,
   * con fallback a estrazione runtime dal boardcontent.
   */
  private getDashboardDatasourceMetadataEntries(node: WorkflowNode | null): WorkflowDashboardDatasourceMetadata[] {
    if (!node) {
      return [];
    }

    const fromBoardcontent = this.extractDashboardDatasourceMetadata(String((node as any)?.workflowDashboardBoardcontent || ''));
    if (fromBoardcontent.length) {
      (node as any).workflowDashboardDatasources = fromBoardcontent;
      return fromBoardcontent;
    }

    return this.sanitizeForSerialization((node as any)?.workflowDashboardDatasources || []) || [];
  }

  /**
   * Seleziona un datasource metadata specifico per `uniqueName` o, in fallback, il primo disponibile.
   */
  private getDashboardDatasourceMetadataForNode(node: WorkflowNode | null, uniqueName?: string | null): WorkflowDashboardDatasourceMetadata | null {
    const entries = this.getDashboardDatasourceMetadataEntries(node);
    if (!entries.length) {
      return null;
    }

    if (!uniqueName) {
      return entries[0] || null;
    }

    return entries.find((entry) => String(entry.uniqueName || '').trim() === String(uniqueName || '').trim()) || null;
  }

  /**
   * Callback save dell'editor metadata route:
   * applica insert/update/delete al bundle, sincronizza datasource editor,
   * propaga eventuale update su boardcontent dashboard e riallinea nodi action derivati.
   */
  private async handleRouteMetadataSave(data: any, original: any, editorKey?: string): Promise<void> {
    const node = this.getNodeById(String(this.routeMetadataNodeId || ''));
    if (!node) {
      return;
    }

    const dashboardDatasourceUniqueName = String(this.routeMetadataDashboardDatasourceUniqueName || '').trim();
    const sourceType = this.getRouteSourceType(node);
    const dashboardDatasource = sourceType === 'dashboard' && dashboardDatasourceUniqueName
      ? this.getDashboardDatasourceMetadataForNode(node, dashboardDatasourceUniqueName)
      : null;
    const route = String(
      dashboardDatasource?.route
      || dashboardDatasource?.metadataBundle?.route
      || this.routeMetadataRoute
      || (node as any)?.workflowRoute
      || ''
    ).trim();
    const normalizedData = this.normalizeEditFormRecord(data);
    const normalizedOriginal = this.normalizeEditFormRecord(original);
    const bundle = this.sanitizeForSerialization(
      dashboardDatasource?.metadataBundle
      || (node as any).workflowRouteMetadataBundle
      || this.buildRouteMetadataBundle(route)
      || this.createEmptyRouteBundle(route)
    );
    const isDeleted = this.toBoolean(normalizedData?.__deleted ?? normalizedOriginal?.__deleted, false);
    if (isDeleted) {
      this.removeRecordFromBundle(bundle, normalizedData, normalizedOriginal, editorKey);
    } else {
      this.applyRecordToBundle(bundle, normalizedData, normalizedOriginal, editorKey);
    }

    if (sourceType === 'dashboard' && dashboardDatasourceUniqueName) {
      const nextBoardcontent = this.updateDashboardBoardcontentMetadata(
        String((node as any).workflowDashboardBoardcontent || ''),
        dashboardDatasourceUniqueName,
        route,
        bundle
      );
      (node as any).workflowDashboardBoardcontent = nextBoardcontent;
      const dashboardDatasources = this.extractDashboardDatasourceMetadata(nextBoardcontent);
      (node as any).workflowDashboardDatasources = dashboardDatasources;
      const selectedDatasource = dashboardDatasources.find((entry) => entry.uniqueName === dashboardDatasourceUniqueName) || null;
      (node as any).workflowRouteMetadataBundle = this.sanitizeForSerialization(selectedDatasource?.metadataBundle || bundle);
    } else {
      (node as any).workflowRouteMetadataBundle = bundle;
    }

    this.applyRouteMetadataBundleToDatasource(bundle, route);
    await this.syncLinkedActionNodesFromMetadataSave(node, bundle, normalizedData, normalizedOriginal);
    this.emitWorkflow();
  }

  private async syncLinkedActionNodesFromMetadataSave(
    routeNode: WorkflowNode,
    bundle: RouteMetadataBundle,
    normalizedData: any,
    normalizedOriginal: any
  ): Promise<void> {
    if (!this.editor || !routeNode || !bundle) {
      return;
    }

    await this.syncTableActionNodesWithMetadata(routeNode, bundle);

    const columnId = Number(normalizedData?.mc_id ?? normalizedOriginal?.mc_id);
    if (Number.isFinite(columnId) && columnId > 0) {
      const column = (bundle.columnMetadata || []).find((x: any) => Number(x?.mc_id) === columnId);
      if (!column || String(column?.mc_ui_column_type || '') !== 'button') {
        return;
      }

      this.editor.getNodes()
        .filter((n) => this.isLinkedActionNode(n, String(routeNode.id), 'column_button', columnId))
        .forEach((actionNode) => {
          this.applyLinkedActionTypeToNode(actionNode, Number(column?.mc_button_action_type), 1);
        });
    }
  }

  /**
   * Sincronizza i nodi action con `tableActions` del bundle route:
   * crea nodi mancanti, rimuove orfani e deduplica nodi duplicati per stesso target.
   */
  private async syncTableActionNodesWithMetadata(routeNode: WorkflowNode, bundleInput: RouteMetadataBundle | null): Promise<void> {
    if (!this.editor || !this.area || !routeNode) {
      return;
    }

    const routeNodeId = String(routeNode.id || '');
    const bundle = this.sanitizeForSerialization(bundleInput || null) || this.createEmptyRouteBundle(String((routeNode as any)?.workflowRoute || ''));
    const tableActions = Array.isArray(bundle.tableActions) ? bundle.tableActions : [];
    const targetIds = new Set<number>();
    tableActions.forEach((row: any) => {
      const id = Number(row?.Id);
      if (Number.isFinite(id) && id !== 0) {
        targetIds.add(id);
      }
    });

    const linkedNodes = this.editor.getNodes().filter((n) =>
      String((n as any)?.workflowType || '') === 'action'
      && String((n as any)?.workflowRouteNodeId || '') === routeNodeId
      && String((n as any)?.workflowMetadataTargetType || '') === 'table_action'
    );

    const nodeByTarget = new Map<number, WorkflowNode[]>();
    linkedNodes.forEach((node) => {
      const targetId = Number((node as any)?.workflowMetadataTargetId || 0);
      if (!Number.isFinite(targetId) || targetId === 0) {
        return;
      }
      if (!nodeByTarget.has(targetId)) {
        nodeByTarget.set(targetId, []);
      }
      nodeByTarget.get(targetId)!.push(node);
    });

    // Remove action nodes whose metadata target no longer exists.
    for (const node of linkedNodes) {
      const targetId = Number((node as any)?.workflowMetadataTargetId || 0);
      if (!targetIds.has(targetId)) {
        await this.removeNodeWithConnections(node.id);
      }
    }

    // If duplicates exist for same table action id, keep only the first one.
    for (const [targetId, nodes] of nodeByTarget.entries()) {
      if (!targetIds.has(targetId) || nodes.length <= 1) {
        continue;
      }
      for (let i = 1; i < nodes.length; i++) {
        await this.removeNodeWithConnections(nodes[i].id);
      }
    }

    const routePos = this.area.nodeViews.get(routeNodeId)?.position || { x: 0, y: 0 };
    let spawnIndex = 0;
    for (const tableAction of tableActions) {
      const targetId = Number(tableAction?.Id);
      if (!Number.isFinite(targetId) || targetId === 0) {
        continue;
      }

      const existing = this.editor.getNodes().find((n) =>
        this.isLinkedActionNode(n, routeNodeId, 'table_action', targetId)
      ) || null;

      if (existing) {
        this.applyLinkedActionTypeToNode(existing, Number(tableAction?.md_action_type), 0);
        continue;
      }

      const actionTypeId = Number(tableAction?.md_action_type);
      const actionType = this.getActionTypeById(actionTypeId) || this.getActionTypeById(1) || { id: 1, description: 'generic.method.call.action' };
      const actionScope = this.getActionScopeById(0) || { id: 0, description: 'azione_tab' };
      const actionNode = this.createNode('action', undefined, actionType, actionScope);
      (actionNode as any).workflowRouteNodeId = routeNodeId;
      (actionNode as any).workflowMetadataTargetType = 'table_action';
      (actionNode as any).workflowMetadataTargetId = targetId;
      await this.editor.addNode(actionNode);
      const posX = Number(routePos.x || 0) + 280;
      const posY = Number(routePos.y || 0) + (spawnIndex * 110);
      spawnIndex += 1;
      await this.area.translate(actionNode.id, { x: posX, y: posY });
      this.applyLinkedActionTypeToNode(actionNode, actionType.id, 0);
      await this.autoConnectRouteToAction(actionNode, posX, posY, routeNodeId);
    }
  }

  /**
   * Rimuove dal bundle la riga corretta in base a `editorKey`/id presenti
   * (table action, permessi/stili tabella e colonna).
   */
  private removeRecordFromBundle(bundle: RouteMetadataBundle, record: any, original: any, editorKey?: string): void {
    if (!bundle) {
      return;
    }

    const normalized = this.sanitizeForSerialization(record) || {};
    const originalNormalized = this.sanitizeForSerialization(original) || {};
    const normalizeKey = (key: string) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const forcedEditorKey = normalizeKey(String(editorKey || ''));
    const readNumeric = (keys: string[]): number => {
      const source = this.pickFirstDefined(normalized, keys) ?? this.pickFirstDefined(originalNormalized, keys);
      return Number(source);
    };

    const tableActionId = readNumeric(['Id', 'id']);
    if (
      forcedEditorKey === normalizeKey('Id')
      || (Number.isFinite(tableActionId) && tableActionId !== 0)
    ) {
      bundle.tableActions = (bundle.tableActions || []).filter((x: any) => Number(x?.Id || 0) !== Number(tableActionId || 0));
      return;
    }

    const tablePermissionId = readNumeric(['muat_id', 'muatid']);
    if (forcedEditorKey === normalizeKey('muat_id') || (Number.isFinite(tablePermissionId) && tablePermissionId !== 0)) {
      bundle.tablePermissions = (bundle.tablePermissions || []).filter((x: any) => Number(x?.muat_id || 0) !== Number(tablePermissionId || 0));
      return;
    }

    const columnPermissionId = readNumeric(['muac_id', 'muacid']);
    if (forcedEditorKey === normalizeKey('muac_id') || (Number.isFinite(columnPermissionId) && columnPermissionId !== 0)) {
      bundle.columnPermissions = (bundle.columnPermissions || []).filter((x: any) => Number(x?.muac_id || 0) !== Number(columnPermissionId || 0));
      return;
    }

    const tableStyleId = readNumeric(['must_id', 'mustid']);
    if (forcedEditorKey === normalizeKey('must_id') || (Number.isFinite(tableStyleId) && tableStyleId !== 0)) {
      bundle.tableStyles = (bundle.tableStyles || []).filter((x: any) => Number(x?.must_id || 0) !== Number(tableStyleId || 0));
      return;
    }

    const columnStyleId = readNumeric(['musc_id', 'muscid']);
    if (forcedEditorKey === normalizeKey('musc_id') || (Number.isFinite(columnStyleId) && columnStyleId !== 0)) {
      bundle.columnStyles = (bundle.columnStyles || []).filter((x: any) => Number(x?.musc_id || 0) !== Number(columnStyleId || 0));
      return;
    }
  }

  private isLinkedActionNode(
    node: WorkflowNode,
    routeNodeId: string,
    targetType: 'table_action' | 'column_button',
    targetId: number
  ): boolean {
    return String((node as any)?.workflowType || '') === 'action'
      && String((node as any)?.workflowRouteNodeId || '') === String(routeNodeId || '')
      && String((node as any)?.workflowMetadataTargetType || '') === targetType
      && Number((node as any)?.workflowMetadataTargetId || 0) === Number(targetId || 0);
  }

  /**
   * Applica tipo/scope a un nodo action e riallinea socket out:
   * navigation (type=0) richiede output `out`, altri tipi lo rimuovono.
   */
  private applyLinkedActionTypeToNode(actionNode: WorkflowNode, actionTypeIdRaw: number, actionScopeId: number): void {
    const actionTypeId = Number(actionTypeIdRaw);
    if (!Number.isFinite(actionTypeId)) {
      return;
    }

    const actionType = this.getActionTypeById(actionTypeId) || {
      id: actionTypeId,
      description: String((actionNode as any)?.workflowActionType || 'action')
    };

    (actionNode as any).workflowActionTypeId = actionType.id;
    (actionNode as any).workflowActionType = actionType.description;
    (actionNode as any).workflowActionScopeId = actionScopeId;
    (actionNode as any).workflowActionScope = actionScopeId === 1 ? 'azione_col' : 'azione_tab';

    const hasOut = !!(actionNode.outputs as any)?.out;
    if (actionType.id === 0 && !hasOut) {
      actionNode.addOutput('out' as any, new ClassicPreset.Output(this.socket, 'Out'));
    } else if (actionType.id !== 0 && hasOut) {
      actionNode.removeOutput('out' as any);
      void this.removeInvalidOutgoingConnections(actionNode);
    }

    this.applyNodeVisualState(actionNode);
    void this.area?.update('node' as any, String(actionNode.id));
  }

  /**
   * Rimuove tutte le connessioni uscenti `out` del nodo action (usato quando cambia tipologia).
   */
  private async removeInvalidOutgoingConnections(actionNode: WorkflowNode): Promise<void> {
    if (!this.editor) {
      return;
    }

    const actionNodeId = String(actionNode.id || '');
    const outgoing = this.editor.getConnections().filter((connection) =>
      String(connection.source || '') === actionNodeId
      && String(connection.sourceOutput || '') === 'out'
    );
    for (const connection of outgoing) {
      await this.editor.removeConnection(connection.id);
    }
  }

  /**
   * Converte il payload `EditFormComponent` in plain object unwrap-pando eventuali wrapper/soggetti.
   */
  private normalizeEditFormRecord(raw: any): any {
    const result: any = {};
    if (!raw || typeof raw !== 'object') {
      return result;
    }

    Object.keys(raw).forEach((key) => {
      result[key] = this.unwrapEditorFieldValue((raw as any)[key]);
    });

    return result;
  }

  /**
   * Estrae il valore effettivo da field editor (`BehaviorSubject`, wrapper `{ value }`, scalari).
   */
  private unwrapEditorFieldValue(input: any): any {
    if (input === null || input === undefined) {
      return input;
    }

    if (typeof input !== 'object') {
      return input;
    }

    const maybeSubject = input as any;
    if (typeof maybeSubject.next === 'function') {
      if (typeof maybeSubject.getValue === 'function') {
        try {
          return maybeSubject.getValue();
        } catch {
        }
      }

      if ('value' in maybeSubject) {
        try {
          return maybeSubject.value;
        } catch {
        }
      }
    }

    if ('value' in maybeSubject && Object.keys(maybeSubject).length <= 2) {
      return maybeSubject.value;
    }

    return input;
  }

  /**
   * Crea un route metadata bundle vuoto inizializzato per la route indicata.
   */
  private createEmptyRouteBundle(route: string): RouteMetadataBundle {
    return {
      route: String(route || ''),
      tableMetadata: {},
      columnMetadata: [],
      tableActions: [],
      columnActions: [],
      tablePermissions: [],
      columnPermissions: [],
      tableStyles: [],
      columnStyles: []
    };
  }

  /**
   * Applica (upsert) un record editor nel segmento corretto del bundle route
   * inferendo il target da `editorKey`, id e shape dei campi.
   */
  private applyRecordToBundle(bundle: RouteMetadataBundle, record: any, original: any, editorKey?: string): void {
    if (!bundle || !record) {
      return;
    }

    const normalized = this.sanitizeForSerialization(record) || {};
    const originalNormalized = this.sanitizeForSerialization(original) || {};
    const normalizeKey = (key: string) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const keySet = new Set<string>([
      ...Object.keys(normalized || {}).map((k) => normalizeKey(k)),
      ...Object.keys(originalNormalized || {}).map((k) => normalizeKey(k))
    ]);
    const hasAnyKey = (keys: string[]) => keys.some((k) => keySet.has(normalizeKey(k)));
    const hasKeyPrefix = (prefix: string) => {
      const normalizedPrefix = normalizeKey(prefix);
      for (const key of keySet.values()) {
        if (key.startsWith(normalizedPrefix)) {
          return true;
        }
      }
      return false;
    };
    const readNumeric = (keys: string[]): number => {
      const source = this.pickFirstDefined(normalized, keys) ?? this.pickFirstDefined(originalNormalized, keys);
      return Number(source);
    };

    const mcId = readNumeric(['mc_id', 'mcid']);
    const tableActionId = readNumeric(['Id', 'id']);
    const tablePermissionId = readNumeric(['muat_id', 'muatid']);
    const columnPermissionId = readNumeric(['muac_id', 'muacid']);
    const tableStyleId = readNumeric(['must_id', 'mustid']);
    const columnStyleId = readNumeric(['musc_id', 'muscid']);
    const mdId = readNumeric(['md_id', 'mdid']);
    const looksLikeTablePermission =
      hasAnyKey(['muat_view', 'muat_edit', 'muat_insert', 'muat_delete', 'muat_override_record_restriction'])
      || hasKeyPrefix('muat');
    const looksLikeColumnPermission =
      hasAnyKey(['muac_view', 'muac_editable', 'muac_validation_required'])
      || hasKeyPrefix('muac');
    const looksLikeTableStyle =
      hasAnyKey(['must_attribute_name', 'must_attribute_value', 'must_when_condition'])
      || hasKeyPrefix('must');
    const looksLikeColumnStyle =
      hasAnyKey(['musc_attribute_name', 'musc_attribute_value', 'musc_when_condition'])
      || hasKeyPrefix('musc');
    const looksLikeTableAction =
      hasAnyKey(['button_caption', 'md_action_type', 'md_action_scope'])
      || hasAnyKey(['buttoncaption', 'mdactiontype', 'mdactionscope']);
    const forcedEditorKey = normalizeKey(String(editorKey || ''));

    if (forcedEditorKey === normalizeKey('must_id')) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(tableStyleId) && tableStyleId !== 0)) {
        row.must_id = this.nextLocalBundleItemId(bundle.tableStyles, 'must_id');
      }
      this.upsertById(bundle.tableStyles, row, 'must_id');
      return;
    }

    if (forcedEditorKey === normalizeKey('musc_id')) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(columnStyleId) && columnStyleId !== 0)) {
        row.musc_id = this.nextLocalBundleItemId(bundle.columnStyles, 'musc_id');
      }
      this.upsertById(bundle.columnStyles, row, 'musc_id');
      return;
    }

    if (forcedEditorKey === normalizeKey('muat_id')) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(tablePermissionId) && tablePermissionId !== 0)) {
        row.muat_id = this.nextLocalBundleItemId(bundle.tablePermissions, 'muat_id');
      }
      this.upsertById(bundle.tablePermissions, row, 'muat_id');
      return;
    }

    if (forcedEditorKey === normalizeKey('muac_id')) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(columnPermissionId) && columnPermissionId !== 0)) {
        row.muac_id = this.nextLocalBundleItemId(bundle.columnPermissions, 'muac_id');
      }
      this.upsertById(bundle.columnPermissions, row, 'muac_id');
      return;
    }

    if ((Number.isFinite(tableActionId) && tableActionId !== 0) || looksLikeTableAction) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(tableActionId) && tableActionId !== 0)) {
        row.Id = this.nextLocalBundleItemId(bundle.tableActions, 'Id');
      }
      this.upsertById(bundle.tableActions, row, 'Id');
      return;
    }

    if ((Number.isFinite(tablePermissionId) && tablePermissionId !== 0) || looksLikeTablePermission) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(tablePermissionId) && tablePermissionId !== 0)) {
        row.muat_id = this.nextLocalBundleItemId(bundle.tablePermissions, 'muat_id');
      }
      this.upsertById(bundle.tablePermissions, row, 'muat_id');
      return;
    }

    if ((Number.isFinite(columnPermissionId) && columnPermissionId !== 0) || looksLikeColumnPermission) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(columnPermissionId) && columnPermissionId !== 0)) {
        row.muac_id = this.nextLocalBundleItemId(bundle.columnPermissions, 'muac_id');
      }
      this.upsertById(bundle.columnPermissions, row, 'muac_id');
      return;
    }

    if ((Number.isFinite(tableStyleId) && tableStyleId !== 0) || looksLikeTableStyle) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(tableStyleId) && tableStyleId !== 0)) {
        row.must_id = this.nextLocalBundleItemId(bundle.tableStyles, 'must_id');
      }
      this.upsertById(bundle.tableStyles, row, 'must_id');
      return;
    }

    if ((Number.isFinite(columnStyleId) && columnStyleId !== 0) || looksLikeColumnStyle) {
      const row = Object.assign({}, normalized);
      if (!(Number.isFinite(columnStyleId) && columnStyleId !== 0)) {
        row.musc_id = this.nextLocalBundleItemId(bundle.columnStyles, 'musc_id');
      }
      this.upsertById(bundle.columnStyles, row, 'musc_id');
      return;
    }

    if (Number.isFinite(mcId) && mcId > 0) {
      this.upsertById(bundle.columnMetadata, normalized, 'mc_id');
      this.rebuildDerivedRouteCollections(bundle);
      return;
    }

    if (Number.isFinite(mdId) && mdId > 0) {
      bundle.tableMetadata = Object.assign({}, bundle.tableMetadata || {}, normalized);
    }
  }

  /**
   * Genera id locale negativo progressivo per nuove righe bundle non ancora persistite.
   */
  private nextLocalBundleItemId(target: any[], idKey: string): number {
    const list = Array.isArray(target) ? target : [];
    const ids = list
      .map((x) => Number(x?.[idKey]))
      .filter((x) => Number.isFinite(x)) as number[];

    if (!ids.length) {
      return -1;
    }

    const minId = Math.min(...ids);
    return minId <= 0 ? (minId - 1) : -1;
  }

  /**
   * Esegue upsert in una collezione per chiave id stringificata.
   */
  private upsertById(target: any[], record: any, idKey: string): void {
    const list = Array.isArray(target) ? target : [];
    const targetId = String(record?.[idKey] || '').trim();
    if (!targetId) {
      list.push(record);
      return;
    }

    const idx = list.findIndex((x) => String(x?.[idKey] || '').trim() === targetId);
    if (idx >= 0) {
      list[idx] = Object.assign({}, list[idx] || {}, record);
    } else {
      list.push(record);
    }
  }

  /**
   * Ricostruisce le collezioni derivate da `columnMetadata`
   * (`columnActions`, `columnPermissions`, `columnStyles`).
   */
  private rebuildDerivedRouteCollections(bundle: RouteMetadataBundle): void {
    const columns = Array.isArray(bundle?.columnMetadata) ? bundle.columnMetadata : [];
    bundle.columnActions = columns.filter((x: any) => String(x?.mc_ui_column_type || '') === 'button');
    bundle.columnPermissions = columns.flatMap((x: any) => Array.isArray(x?._Metadati_Utenti_Autorizzazioni_Colonnes) ? x._Metadati_Utenti_Autorizzazioni_Colonnes : []);
    bundle.columnStyles = columns.flatMap((x: any) => Array.isArray(x?._Metadati_UI_Stili_Colonnes) ? x._Metadati_UI_Stili_Colonnes : []);
  }

  /**
   * Applica il bundle metadata corrente alla datasource route metadata editor
   * aggiornando `metaInfo`, record corrente e `fetchInfo$`.
   */
  private applyRouteMetadataBundleToDatasource(bundleInput: RouteMetadataBundle | null, route: string): void {
    const ds = this.routeMetadataDs;
    if (!ds || !bundleInput || !ds.metaInfo?.tableMetadata) {
      return;
    }

    const nextMetaInfo = this.buildMetaInfoFromRouteMetadataBundle(bundleInput, route, ds.metaInfo);
    ds.metaInfo.tableMetadata = nextMetaInfo.tableMetadata;
    ds.metaInfo.columnMetadata = nextMetaInfo.columnMetadata;

    if (ds.resultInfo?.current) {
      Object.keys(ds.resultInfo.current).forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(ds.metaInfo.tableMetadata, field) && ds.resultInfo.current[field]?.next) {
          ds.resultInfo.current[field].next(ds.metaInfo.tableMetadata[field]);
        }
      });
    }

    ds.fetchInfo$.next({
      resultInfo: ds.resultInfo,
      metaInfo: ds.metaInfo,
      filterDescriptor: ds.filterDescriptor
    });
  }

  /**
   * Materializza un oggetto `metaInfo` coerente a partire da route bundle,
   * riallacciando permessi/stili alle rispettive colonne per id/nome.
   */
  private buildMetaInfoFromRouteMetadataBundle(bundleInput: RouteMetadataBundle | null, route: string, seedMetaInfo?: any): any {
    const bundle = this.sanitizeForSerialization(bundleInput) || this.createEmptyRouteBundle(route);
    const metaInfo = this.sanitizeForSerialization(seedMetaInfo || {}) || {};
    const tableMetadata = Object.assign({}, metaInfo.tableMetadata || {}, bundle.tableMetadata || {});
    tableMetadata.md_route_name = route;
    tableMetadata._Metadati_Custom_Actions_Tabelles = this.sanitizeForSerialization(bundle.tableActions || []);
    tableMetadata._Metadati_Utenti_Autorizzazioni_Tabelles = this.sanitizeForSerialization(bundle.tablePermissions || []);
    tableMetadata._Metadati_UI_Stili_Tabelles = this.sanitizeForSerialization(bundle.tableStyles || []);

    const columnPermissions = Array.isArray(bundle.columnPermissions) ? bundle.columnPermissions : [];
    const columnStyles = Array.isArray(bundle.columnStyles) ? bundle.columnStyles : [];
    const permissionByColId = new Map<string, any[]>();
    const permissionByColName = new Map<string, any[]>();
    const styleByColId = new Map<string, any[]>();
    const styleByColName = new Map<string, any[]>();
    const pushMap = (map: Map<string, any[]>, key: any, value: any) => {
      const normalized = String(key || '').trim().toLowerCase();
      if (!normalized) {
        return;
      }
      if (!map.has(normalized)) {
        map.set(normalized, []);
      }
      map.get(normalized)!.push(this.sanitizeForSerialization(value));
    };

    columnPermissions.forEach((row: any) => {
      pushMap(permissionByColId, this.pickFirstDefined(row, ['mc_id', 'mcid']), row);
      pushMap(permissionByColName, this.pickFirstDefined(row, ['__column_name', 'mc_nome_colonna']), row);
    });
    columnStyles.forEach((row: any) => {
      pushMap(styleByColId, this.pickFirstDefined(row, ['mc_id', 'mcid']), row);
      pushMap(styleByColName, this.pickFirstDefined(row, ['__column_name', 'mc_nome_colonna']), row);
    });

    const columnMetadata = (Array.isArray(bundle.columnMetadata) ? bundle.columnMetadata : []).map((col: any) => {
      const cloned = this.sanitizeForSerialization(col) || {};
      const idKey = String(cloned?.mc_id || '').trim().toLowerCase();
      const nameKey = String(cloned?.mc_nome_colonna || '').trim().toLowerCase();
      cloned._Metadati_Utenti_Autorizzazioni_Colonnes = this.sanitizeForSerialization([
        ...(permissionByColId.get(idKey) || []),
        ...(permissionByColName.get(nameKey) || [])
      ]);
      cloned._Metadati_UI_Stili_Colonnes = this.sanitizeForSerialization([
        ...(styleByColId.get(idKey) || []),
        ...(styleByColName.get(nameKey) || [])
      ]);
      return cloned;
    });

    return Object.assign({}, metaInfo, {
      tableMetadata,
      columnMetadata
    });
  }

  private updateDashboardBoardcontentMetadata(
    boardcontentRaw: string,
    uniqueName: string,
    route: string,
    bundleInput: RouteMetadataBundle | null
  ): string {
    const parsed = this.parseMaybeJson(boardcontentRaw);
    const roots = Array.isArray(parsed) ? parsed : [];
    let changed = false;
    const bundle = this.sanitizeForSerialization(bundleInput) || this.createEmptyRouteBundle(route);

    const walk = (items: any[]) => {
      (Array.isArray(items) ? items : []).forEach((item: any) => {
        if (!item || typeof item !== 'object') {
          return;
        }

        const name = String(item?.name || '').trim().toUpperCase();
        const itemUniqueName = String(item?.uniqueName || '').trim();
        if (name === 'DATASOURCE' && itemUniqueName === uniqueName) {
          item.inputs = item.inputs || {};
          item.inputs.route = route;
          item.inputs.metaInfo = this.buildMetaInfoFromRouteMetadataBundle(bundle, route, item.inputs.metaInfo || {});
          changed = true;
        }

        if (Array.isArray(item?.nestedComponents) && item.nestedComponents.length) {
          walk(item.nestedComponents);
        }
      });
    };

    walk(roots);
    return changed ? JSON.stringify(roots) : String(boardcontentRaw || '');
  }

  /**
   * Traduzione istantanea con fallback locale quando la resource non e risolta.
   */
  private t(resource: string, fallback: string): string {
    const svc = WtoolboxService.translationService;
    const translated = svc?.instant(resource);
    if (!translated || translated === resource) {
      return fallback;
    }
    return translated;
  }

  /**
   * Traduzione formattata con placeholder `{0}`, `{1}`, ... sostituiti da argomenti runtime.
   */
  private tf(resource: string, fallback: string, ...args: any[]): string {
    const template = this.t(resource, fallback);
    return template.replace(/\{(\d+)\}/g, (match, idx) => {
      const value = args[Number(idx)];
      return value !== undefined && value !== null ? String(value) : match;
    });
  }
}

