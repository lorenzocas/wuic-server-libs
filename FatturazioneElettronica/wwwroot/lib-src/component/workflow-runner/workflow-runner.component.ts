
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import type { MenuItem } from 'primeng/api';
import { Subscription } from 'rxjs';
import { DataProviderService } from '../../service/data-provider.service';
import { WorkflowRuntimeMetadataService } from '../../service/workflow-runtime-metadata.service';
import { WorkflowRuntimeMenuService } from '../../service/workflow-runtime-menu.service';
import { UserInfoService } from '../../service/user-info.service';
import { TranslationManagerService } from '../../service/translation-manager.service';

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
  routePayload?: any;
  routeSourceType?: 'route' | 'dashboard';
  dashboardDatasources?: Array<{ uniqueName: string; route: string; metadataBundle: any | null }>;
  actionTypeId?: number;
  actionType?: string;
  routeNodeId?: string;
  metadataTargetType?: 'table_action' | 'column_button' | '';
  metadataTargetId?: number;
  startMenus?: WorkflowStartMenuItem[];
  startMenuCaption?: string;
  startExclusiveMenu?: boolean;
  startShowExit?: boolean;
  routeMetadata?: any;
};

type WorkflowConnectionSerialized = {
  id?: string;
  source: string;
  sourceOutput: string;
  target: string;
  targetInput: string;
};

@Component({
  selector: 'wuic-workflow-runner',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  templateUrl: './workflow-runner.component.html',
  styleUrl: './workflow-runner.component.css'
})
/**
 * Runtime executor del workflow salvato.
 *
 * Scopo del componente:
 * - caricare un grafo workflow persistito (`graph_json` + `route_metadata`),
 * - valutare i nodi di start/route/action nel contesto utente corrente,
 * - esporre all'utente le voci menu iniziali e gli step eseguibili.
 *
 * Responsabilita principali:
 * - parsing e normalizzazione payload proveniente da `loadWorkflowGraph`,
 * - filtro runtime delle voci Start in base a autorizzazioni ruolo/utente,
 * - pubblicazione metadati runtime per route/action tramite servizi dedicati
 *   (`WorkflowRuntimeMetadataService`, `WorkflowRuntimeMenuService`).
 *
 * Output funzionale:
 * stato runtime del workflow (nodi, connessioni, metadata route) pronto
 * per navigazione/esecuzione nel runner.
 */
export class WorkflowRunnerComponent implements OnInit, OnDestroy {
  /**
   * Identificativo tecnico per graph id, usato in matching, lookup o routing interno.
   */
  graphId = '';
  /**
   * Proprieta di stato del componente per graph name, usata dalla logica interna e dal template.
   */
  graphName = '';
  /**
   * Proprieta di stato del componente per loading, usata dalla logica interna e dal template.
   */
  loading = false;
  /**
   * Messaggio o stato diagnostico per load error, usato nel feedback UX del componente.
   */
  loadError = '';
  /**
   * Collezione dati per nodes, consumata dal rendering e dalle operazioni del componente.
   */
  nodes: WorkflowNodeSerialized[] = [];
  /**
   * Collezione dati per connections, consumata dal rendering e dalle operazioni del componente.
   */
  connections: WorkflowConnectionSerialized[] = [];
  /**
   * Identificativo tecnico per route metadata by node id, usato in matching, lookup o routing interno.
   */
  routeMetadataByNodeId = new Map<string, any>();

  /**
   * Proprieta di stato del componente per param sub, usata dalla logica interna e dal template.
   */
  private paramSub?: Subscription;

  /**
   * Inietta le dipendenze runtime del runner:
   * route param source, provider dati workflow e servizi stato runtime (metadata/menu).
   */
  constructor(
    private route: ActivatedRoute,
    private dataSrv: DataProviderService,
    private runtimeMetadataSrv: WorkflowRuntimeMetadataService,
    private runtimeMenuSrv: WorkflowRuntimeMenuService,
    private userInfo: UserInfoService,
    private trslSrv: TranslationManagerService
  ) {
  }

  private t(resource: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(resource);
    return translated && translated !== resource ? translated : fallback;
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   */
  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe((params) => {
      const graphId = String(params.get('graph-id') || '').trim();
      void this.loadGraph(graphId);
    });
  }

  /**
   * Rilascia risorse e sottoscrizioni per evitare leak e stati pendenti.
   */
  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  /**
   * Restituisce il nodo `start` corrente del grafo caricato.
   */
  get startNode(): WorkflowNodeSerialized | null {
    return this.nodes.find((n) => String(n?.type || '') === 'start') || null;
  }

  /**
   * Restituisce i nodi route direttamente collegati all'output del nodo Start.
   */
  get routeNodesConnectedToStart(): WorkflowNodeSerialized[] {
    const start = this.startNode;
    if (!start) {
      return [];
    }

    const directTargetIds = new Set(
      (this.connections || [])
        .filter((c) => String(c?.source || '') === String(start.id || ''))
        .map((c) => String(c?.target || ''))
        .filter((x) => !!x)
    );

    return (this.nodes || [])
      .filter((n) => String(n?.type || '') === 'route' && directTargetIds.has(String(n?.id || '')));
  }

  /**
   * Conteggio entry metadata route indicizzate per `nodeId`.
   */
  get routeMetadataCount(): number {
    return this.routeMetadataByNodeId.size;
  }

  /**
   * Carica un workflow dal backend (`loadWorkflowGraph`), normalizza nodi/connessioni/metadata
   * e pubblica lo stato runtime su `WorkflowRuntimeMetadataService` e `WorkflowRuntimeMenuService`.
   * @param graphId Chiave workflow (`graph_key`) letta dalla route.
   */
  private async loadGraph(graphId: string): Promise<void> {
    this.graphId = graphId;
    this.graphName = '';
    this.nodes = [];
    this.connections = [];
    this.routeMetadataByNodeId.clear();
    this.loadError = '';
    this.runtimeMenuSrv.clearRuntimeMenus();
    this.runtimeMetadataSrv.clear();

    if (!graphId) {
      this.loadError = this.t('workflow_runner.error.invalid_graph_id', 'Graph id non valido.');
      return;
    }

    this.loading = true;
    try {
      const raw = await this.dataSrv.loadWorkflowGraph({
        user_id: '',
        graph_key: graphId
      });
      const normalized = this.normalizeLoadedWorkflow(raw);
      this.graphName = normalized.graphName;
      this.nodes = normalized.graph.nodes;
      this.connections = normalized.graph.connections;
      this.routeMetadataByNodeId = normalized.routeMetadataByNodeId;
      this.runtimeMetadataSrv.setRouteNodePayloadEntries(
        (this.nodes || [])
          .filter((n) => String(n?.type || '') === 'route')
          .map((n) => ({
            nodeId: String(n?.id || ''),
            route: String(n?.route || ''),
            action: String(n?.action || ''),
            payload: n?.routePayload ?? null
          }))
      );
      this.runtimeMetadataSrv.setPreviousRouteNodeEntries(this.buildPreviousRouteNodeEntries());
      this.applyRuntimeMenus();
    } catch (err: any) {
      this.loadError = String(err?.message || err || this.t('workflow_runner.error.load_graph', 'Errore nel caricamento del workflow.'));
    } finally {
      this.loading = false;
    }
  }

  /**
   * Costruisce il menu runtime effettivo a partire dal nodo Start:
   * applica filtro visibilita/autorizzazioni, integra route collegate e voce uscita,
   * poi pubblica il risultato su `runtimeMenuSrv`.
   */
  private applyRuntimeMenus(): void {
    const start = this.startNode;
    if (!start) {
      this.runtimeMenuSrv.clearRuntimeMenus();
      return;
    }

    const startCaption = String(start.startMenuCaption || '').trim() || this.t('workflow', 'Workflow');
    const startExclusiveMenu = this.toBoolean(start.startExclusiveMenu, false);
    const startShowExit = this.toBoolean(start.startShowExit, true);
    const startMenus = this.normalizeStartMenus(start.startMenus || []).filter((m) => this.isStartMenuVisible(m));
    const startMenuItems = this.buildStartMenuTree(startMenus);

    const routeMenuItems = this.routeNodesConnectedToStart
      .map((node) => {
        const routeName = String(node.route || '').trim();
        if (!routeName) {
          return null;
        }
        const action = String(node.action || '').trim() || 'list';
        return {
          label: `${routeName} [${action}]`,
          route: this.normalizeRoutePath(`/${routeName}/${action}`)
        } as MenuItem;
      })
      .filter((x): x is MenuItem => !!(x as any)?.route);

    const runtimeRouteMetadata = this.routeNodesConnectedToStart
      .flatMap((node) => {
        if (node.routeSourceType === 'dashboard') {
          const datasources = Array.isArray(node.dashboardDatasources) ? node.dashboardDatasources : [];
          return datasources
            .filter((ds) => !!String(ds?.route || '').trim())
            .map((ds) => ({
              route: String(ds.route).trim(),
              action: 'list',
              metadata: ds.metadataBundle ?? null
            }));
        }
        const routeName = String(node?.route || '').trim();
        if (!routeName) {
          return [];
        }
        const action = String(node?.action || '').trim() || 'list';
        return [{
          route: routeName,
          action,
          metadata: this.routeMetadataByNodeId.get(String(node?.id || '')) ?? null
        }];
      })
      .filter((x): x is { route: string; action: string; metadata: any } => !!(x as any)?.route);
    this.runtimeMetadataSrv.setRouteMetadata(runtimeRouteMetadata);
    this.runtimeMetadataSrv.setLinkedActionRouteMetadata(this.buildLinkedActionRouteMetadataEntries());

    const exitItem: MenuItem = {
      label: this.t('workflow_runner.menu.exit', 'Esci'),
      icon: 'pi pi-sign-out',
      route: '/',
      command: () => {
        this.runtimeMetadataSrv.clear();
        this.runtimeMenuSrv.clearRuntimeMenus();
      }
    };

    const dedupe = new Set<string>();
    const exclusiveChildren = startMenuItems.length
      ? [...startMenuItems]
      : [...routeMenuItems];
    const baseChildren = startExclusiveMenu
      ? exclusiveChildren
      : [...startMenuItems, ...routeMenuItems];
    if (startShowExit) {
      baseChildren.push(exitItem);
    }
    const mergedChildren = baseChildren.filter((x) => {
      const key = `${String(x.label || '').trim().toLowerCase()}|${String((x as any).route || '').trim().toLowerCase()}`;
      if (!key || dedupe.has(key)) {
        return false;
      }
      dedupe.add(key);
      return true;
    });

    if (!mergedChildren.length) {
      this.runtimeMenuSrv.clearRuntimeMenus();
      return;
    }

    this.runtimeMenuSrv.setRuntimeMenus([
      {
        label: startCaption,
        icon: 'pi pi-sitemap',
        items: mergedChildren
      }
    ], startExclusiveMenu);
  }

  /**
   * Valuta la visibilita di una voce Start menu in base alle autorizzazioni:
   * priorita `utente+ruolo` > `utente` > `ruolo` > `globale`; fallback al default della voce.
   */
  private isStartMenuVisible(menu: WorkflowStartMenuItem): boolean {
    const visibleByDefault = menu?.mm_is_visible_by_default !== false;
    const auths = this.normalizeMenuAuthorizations(menu?._Metadati_Utenti_Autorizzazioni_Menus, Number(menu?.mm_id || 0));
    if (!auths.length) {
      return visibleByDefault;
    }

    const user = (this.userInfo.getuserInfo() || {}) as any;
    const userId = Number(user?.user_id || 0);
    const roleId = Number(user?.role_id || 0);
    const score = (row: WorkflowMenuAuthorization): number => {
      const rowUser = Number(row?.utenteid || 0);
      const rowRole = Number(row?.ruoloid || 0);
      if (rowUser > 0 && rowRole > 0 && rowUser === userId && rowRole === roleId) {
        return 4;
      }
      if (rowUser > 0 && rowUser === userId) {
        return 3;
      }
      if (rowRole > 0 && rowRole === roleId) {
        return 2;
      }
      if (rowUser <= 0 && rowRole <= 0) {
        return 1;
      }
      return 0;
    };

    const candidates = auths
      .map((row) => ({ row, score: score(row) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) {
      return visibleByDefault;
    }
    return Number(candidates[0].row?.muamview || 0) === 1;
  }

  /**
   * Normalizza l'array Start menu in shape `WorkflowStartMenuItem` coerente per runtime:
   * coercizione tipi, default etichette/ordine e normalizzazione autorizzazioni figlie.
   */
  private normalizeStartMenus(input: any[]): WorkflowStartMenuItem[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
      .map((row: any, idx: number) => ({
        mm_id: Number(row?.mm_id || -(idx + 1)),
        mm_parent_id: Number(row?.mm_parent_id || 0),
        mm_nome_menu: String(row?.mm_nome_menu || '').trim(),
        mm_display_string_menu: String(row?.mm_display_string_menu || row?.mm_nome_menu || this.t('menu', 'Menu')).trim(),
        mm_tooltip_menu: String(row?.mm_tooltip_menu || row?.mm_display_string_menu || row?.mm_nome_menu || '').trim(),
        mm_uri_menu: String(row?.mm_uri_menu || '').trim(),
        mm_ordine: Number.isFinite(Number(row?.mm_ordine)) ? Number(row.mm_ordine) : ((idx + 1) * 10),
        mm_is_visible_by_default: row?.mm_is_visible_by_default !== false,
        _Metadati_Utenti_Autorizzazioni_Menus: this.normalizeMenuAuthorizations(
          row?._Metadati_Utenti_Autorizzazioni_Menus,
          Number(row?.mm_id || 0)
        )
      }))
      .filter((x) => !!x.mm_display_string_menu);
  }

  /**
   * Normalizza le righe autorizzazione menu supportando alias campo (`muam_id`, `ruolo_id`, ...).
   * @param fallbackMmId Id menu di fallback quando assente nella riga.
   */
  private normalizeMenuAuthorizations(input: any, fallbackMmId: number): WorkflowMenuAuthorization[] {
    const rows = Array.isArray(input) ? input : [];
    return rows
      .map((row: any) => {
        const muamview = Number(this.pickFirstDefined(row, ['muamview', 'muam_view']) || 0) === 1 ? 1 : 0;
        return {
          mmid: Number(this.pickFirstDefined(row, ['mmid', 'mm_id']) || fallbackMmId || 0),
          muamid: Number(this.pickFirstDefined(row, ['muamid', 'muam_id']) || 0),
          muamview: muamview as 0 | 1,
          ruoloid: Number(this.pickFirstDefined(row, ['ruoloid', 'ruolo_id']) || 0),
          utenteid: Number(this.pickFirstDefined(row, ['utenteid', 'utente_id']) || 0)
        };
      })
      .filter((x) => Number.isFinite(x.muamview));
  }

  /**
   * Costruisce il tree PrimeNG `MenuItem[]` dalle voci start menu,
   * ricostruendo la gerarchia `mm_parent_id` e normalizzando le route.
   */
  private buildStartMenuTree(startMenus: WorkflowStartMenuItem[]): MenuItem[] {
    const byId = new Map<number, WorkflowStartMenuItem>();
    const childrenByParent = new Map<number, WorkflowStartMenuItem[]>();
    startMenus.forEach((menu) => {
      const menuId = Number(menu.mm_id || 0);
      const parentId = Number(menu.mm_parent_id || 0);
      byId.set(menuId, menu);
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId)!.push(menu);
    });

    const toItem = (menu: WorkflowStartMenuItem): MenuItem => {
      const route = this.normalizeRoutePath(menu.mm_uri_menu);
      const children = (childrenByParent.get(Number(menu.mm_id || 0)) || [])
        .sort((a, b) => Number(a.mm_ordine || 0) - Number(b.mm_ordine || 0))
        .map((child) => toItem(child));
      const item: MenuItem = {
        label: menu.mm_display_string_menu
      };
      if (route) {
        (item as any).route = route;
      }
      if (children.length) {
        item.items = children;
      }
      return item;
    };

    const roots = startMenus
      .filter((menu) => {
        const parentId = Number(menu.mm_parent_id || 0);
        return !parentId || !byId.has(parentId);
      })
      .sort((a, b) => Number(a.mm_ordine || 0) - Number(b.mm_ordine || 0))
      .map((menu) => toItem(menu));

    return roots;
  }

  /**
   * Normalizza una route in formato router-link:
   * `#/x` -> `/x`, `x` -> `/x`, stringa vuota -> `''`.
   */
  private normalizeRoutePath(route: string): string {
    const raw = String(route || '').trim();
    if (!raw) {
      return '';
    }
    if (raw.startsWith('#/')) {
      return raw.substring(1);
    }
    if (raw.startsWith('/')) {
      return raw;
    }
    return '/' + raw;
  }

  /**
   * Calcola per ogni route la route precedente nel grafo (diretta o via action intermedia)
   * e produce una mappa lineare usata dal runtime metadata service.
   */
  private buildPreviousRouteNodeEntries(): Array<{ routeNodeId: string; previousRouteNodeId: string; previousRoute: string; previousAction: string; }> {
    const routeNodeById = new Map<string, WorkflowNodeSerialized>();
    (this.nodes || [])
      .filter((n) => String(n?.type || '') === 'route')
      .forEach((node) => routeNodeById.set(String(node?.id || ''), node));

    const incomingByTarget = new Map<string, WorkflowConnectionSerialized[]>();
    (this.connections || []).forEach((connection) => {
      const targetId = String(connection?.target || '');
      if (!targetId) {
        return;
      }
      if (!incomingByTarget.has(targetId)) {
        incomingByTarget.set(targetId, []);
      }
      incomingByTarget.get(targetId)!.push(connection);
    });

    const resolvePreviousRouteNode = (nodeId: string): WorkflowNodeSerialized | null => {
      const incoming = incomingByTarget.get(nodeId) || [];
      for (const link of incoming) {
        const sourceId = String(link?.source || '');
        if (!sourceId) {
          continue;
        }

        const sourceRoute = routeNodeById.get(sourceId);
        if (sourceRoute) {
          return sourceRoute;
        }

        const actionIncoming = incomingByTarget.get(sourceId) || [];
        for (const actionLink of actionIncoming) {
          const actionSourceId = String(actionLink?.source || '');
          const actionSourceRoute = routeNodeById.get(actionSourceId);
          if (actionSourceRoute) {
            return actionSourceRoute;
          }
        }
      }

      return null;
    };

    return Array.from(routeNodeById.values())
      .map((routeNode) => {
        const previous = resolvePreviousRouteNode(String(routeNode?.id || ''));
        if (!previous) {
          return null;
        }
        return {
          routeNodeId: String(routeNode?.id || ''),
          previousRouteNodeId: String(previous?.id || ''),
          previousRoute: String(previous?.route || ''),
          previousAction: String(previous?.action || '')
        };
      })
      .filter((x): x is { routeNodeId: string; previousRouteNodeId: string; previousRoute: string; previousAction: string; } => !!x);
  }

  /**
   * Estrae le navigation action collegate a una table action:
   * risolve route sorgente/target dal grafo e allega metadata route target.
   */
  private buildLinkedActionRouteMetadataEntries(): Array<{ sourceRoute: string; tableActionId: number; targetRoute: string; targetAction?: string; metadata: any; }> {
    const routeNodeById = new Map<string, WorkflowNodeSerialized>();
    (this.nodes || [])
      .filter((n) => String(n?.type || '') === 'route')
      .forEach((node) => routeNodeById.set(String(node.id || ''), node));

    const incomingByTarget = new Map<string, WorkflowConnectionSerialized[]>();
    const outgoingBySource = new Map<string, WorkflowConnectionSerialized[]>();
    (this.connections || []).forEach((connection) => {
      const sourceId = String(connection?.source || '');
      const targetId = String(connection?.target || '');
      if (sourceId) {
        if (!outgoingBySource.has(sourceId)) {
          outgoingBySource.set(sourceId, []);
        }
        outgoingBySource.get(sourceId)!.push(connection);
      }
      if (targetId) {
        if (!incomingByTarget.has(targetId)) {
          incomingByTarget.set(targetId, []);
        }
        incomingByTarget.get(targetId)!.push(connection);
      }
    });

    const entries: Array<{ sourceRoute: string; tableActionId: number; targetRoute: string; targetAction?: string; metadata: any; }> = [];
    (this.nodes || [])
      .filter((node) => String(node?.type || '') === 'action')
      .forEach((actionNode) => {
        const actionTypeId = Number(actionNode?.actionTypeId);
        const actionTypeText = String(actionNode?.actionType || '').toLowerCase();
        const isNavigation = actionTypeId === 0 || actionTypeText.includes('navigation');
        if (!isNavigation) {
          return;
        }

        const targetType = String(actionNode?.metadataTargetType || '').trim().toLowerCase();
        const tableActionId = Number(actionNode?.metadataTargetId || 0);
        if (targetType !== 'table_action' || !Number.isFinite(tableActionId) || tableActionId <= 0) {
          return;
        }

        const explicitSourceRouteNodeId = String(actionNode?.routeNodeId || '').trim();
        let sourceRouteNode = explicitSourceRouteNodeId ? routeNodeById.get(explicitSourceRouteNodeId) : undefined;
        if (!sourceRouteNode) {
          const incoming = incomingByTarget.get(String(actionNode?.id || '')) || [];
          const fromRoute = incoming
            .map((c) => routeNodeById.get(String(c?.source || '')))
            .find((x) => !!x);
          sourceRouteNode = fromRoute;
        }

        const sourceRoute = String(sourceRouteNode?.route || '').trim();
        if (!sourceRoute) {
          return;
        }

        const outgoing = (outgoingBySource.get(String(actionNode?.id || '')) || [])
          .filter((c) => String(c?.sourceOutput || 'out').toLowerCase() === 'out');
        outgoing.forEach((connection) => {
          const targetNode = routeNodeById.get(String(connection?.target || ''));
          if (!targetNode) {
            return;
          }
          const targetRoute = String(targetNode.route || '').trim();
          if (!targetRoute) {
            return;
          }
          const targetAction = String(targetNode.action || '').trim() || 'list';
          entries.push({
            sourceRoute,
            tableActionId,
            targetRoute,
            targetAction,
            metadata: this.routeMetadataByNodeId.get(String(targetNode.id || '')) ?? null
          });
        });
      });

    return entries;
  }

  /**
   * Normalizza il payload `loadWorkflowGraph` (string/object, alias legacy/nuovi):
   * produce nodi/connessioni tipizzati, metadata route per node id e nome workflow.
   */
  private normalizeLoadedWorkflow(raw: any): {
    graph: { nodes: WorkflowNodeSerialized[]; connections: WorkflowConnectionSerialized[] };
    routeMetadataByNodeId: Map<string, any>;
    graphName: string;
  } {
    const normalizedRaw = this.parseMaybeJson(raw);
    const root = Array.isArray(normalizedRaw) ? (normalizedRaw[0] || {}) : (normalizedRaw || {});
    const graphJson = this.pickFirstDefined(root, ['graph_json', 'wg_graph_json', 'graphjson']) || '{}';
    const graph = this.parseMaybeJson(graphJson) || {};
    const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : [])
      .map((node: any) => ({
        id: String(node?.id || ''),
        label: String(node?.label || ''),
        type: String(node?.type || ''),
        route: String(node?.route || ''),
        action: String(node?.action || ''),
        routePayload: node?.routePayload ?? node?.payload ?? null,
        routeSourceType: node?.routeSourceType === 'dashboard' ? 'dashboard' : 'route',
        dashboardDatasources: Array.isArray(node?.dashboardDatasources) ? node.dashboardDatasources : [],
        actionTypeId: Number.isFinite(Number(node?.actionTypeId))
          ? Number(node.actionTypeId)
          : Number.isFinite(Number(node?.workflowActionTypeId))
            ? Number(node.workflowActionTypeId)
            : undefined,
        actionType: String(node?.actionType || node?.workflowActionType || ''),
        routeNodeId: String(node?.routeNodeId || node?.workflowRouteNodeId || ''),
        metadataTargetType: String(node?.metadataTargetType || node?.workflowMetadataTargetType || '') as any,
        metadataTargetId: Number.isFinite(Number(node?.metadataTargetId))
          ? Number(node.metadataTargetId)
          : Number.isFinite(Number(node?.workflowMetadataTargetId))
            ? Number(node.workflowMetadataTargetId)
            : undefined,
        startMenus: this.normalizeStartMenus(node?.startMenus || []),
        startMenuCaption: String(node?.startMenuCaption || ''),
        startExclusiveMenu: this.toBoolean(node?.startExclusiveMenu, false),
        startShowExit: this.toBoolean(node?.startShowExit, true),
        routeMetadata: node?.routeMetadata || null
      } as WorkflowNodeSerialized))
      .filter((node: WorkflowNodeSerialized) => !!node.id);
    const connections = (Array.isArray(graph?.connections) ? graph.connections : [])
      .map((connection: any) => ({
        id: String(connection?.id || ''),
        source: String(connection?.source || ''),
        sourceOutput: String(connection?.sourceOutput || 'out'),
        target: String(connection?.target || ''),
        targetInput: String(connection?.targetInput || 'in')
      } as WorkflowConnectionSerialized))
      .filter((connection: WorkflowConnectionSerialized) => !!connection.source && !!connection.target);
    const routeMetadataRows = Array.isArray(root?.route_metadata)
      ? root.route_metadata
      : Array.isArray(root?.routeMetadata)
        ? root.routeMetadata
        : [];
    const routeMetadataByNodeId = new Map<string, any>();
    routeMetadataRows.forEach((entry: any) => {
      const nodeId = String(entry?.node_id || '').trim();
      if (!nodeId) {
        return;
      }
      routeMetadataByNodeId.set(nodeId, this.parseMaybeJson(entry?.metadata_json) || null);
    });
    nodes
      .filter((node: WorkflowNodeSerialized) => String(node.type || '') === 'route')
      .forEach((node: WorkflowNodeSerialized) => {
        if (!routeMetadataByNodeId.has(node.id)) {
          routeMetadataByNodeId.set(node.id, node.routeMetadata || null);
        }
      });
    const graphName = String(this.pickFirstDefined(root, ['graph_name', 'wg_name', 'graphname']) || '');

    return {
      graph: { nodes, connections },
      routeMetadataByNodeId,
      graphName
    };
  }

  /**
   * Parse JSON tollerante: ritorna `null` su input vuoto/invalid JSON, oppure oggetto parse-ato.
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
   * Restituisce il primo valore definito tra una lista di chiavi,
   * con matching case-insensitive su proprietà oggetto.
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
   * Converte valori eterogenei (boolean/number/string) in boolean con fallback esplicito.
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
}


