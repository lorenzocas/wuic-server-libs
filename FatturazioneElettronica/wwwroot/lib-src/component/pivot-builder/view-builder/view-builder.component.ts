import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter,
  inject, Injector, Input, OnDestroy, Output, ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import type { AutoCompleteCompleteEvent } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationManagerService } from '../../../service/translation-manager.service';

import { ClassicPreset, GetSchemes, NodeEditor } from 'rete';
import { AreaExtensions, AreaPlugin } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { AngularArea2D, AngularPlugin, Presets as AngularPresets } from 'rete-angular-plugin/21';

import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DataProviderService } from '../../../service/data-provider.service';
import { MetadataProviderService } from '../../../service/metadata-provider.service';
import { UserInfoService } from '../../../service/user-info.service';
import { WtoolboxService } from '../../../service/wtoolbox.service';

import { ViewBuilderNodeComponent, TableNodeExtraData } from './view-builder-node.component';
import { ViewBuilderConnectionComponent } from './view-builder-connection.component';
import type {
  ViewDefinition, ViewTableNode, ViewJoinEdge, ViewColumn
} from './view-builder.types';
import { ViewBuilderLayoutHelper } from './view-builder-layout.helper';

// --- Rete type plumbing ---
// Follow the same pattern as workflow-designer: define Node with explicit socket generics.

class TableNode extends ClassicPreset.Node {
  width = 280;
  height = 300;
  route = '';
  mdId: number | null = null;
  tableName = '';
  schemaName = 'dbo';
  caption = '';
  tableAlias = '';
  columns: ViewColumn[] = [];
  collapsed = false;
  connectedOutputs = new Set<string>();
  connectedInputs = new Set<string>();
  onColumnToggle?: (alias: string, selected: boolean) => void;
  onCollapseToggle?: (collapsed: boolean) => void;
  onRemoveNode?: () => void;
  onColumnFormula?: (col: ViewColumn) => void;
  onRenameAlias?: () => void;
}

// Use ClassicScheme (same approach as rete docs) to avoid
// generic constraint issues with extended node types.
type VBSchemes = GetSchemes<ClassicPreset.Node, ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>>;
type VBAreaExtra = AngularArea2D<VBSchemes>;

const fkSocket = new ClassicPreset.Socket('fk');
const pkSocket = new ClassicPreset.Socket('pk');
// Universal socket — allows connecting any column to any column
const colSocket = new ClassicPreset.Socket('col');

type RouteOption = { label: string; value: string; mdId: number | null };

@Component({
  selector: 'wuic-view-builder',
  standalone: true,
  imports: [FormsModule, AutoCompleteModule, ButtonModule, SelectModule, TooltipModule, TranslateModule],
  templateUrl: './view-builder.component.html',
  styleUrl: './view-builder.component.css'
})
export class ViewBuilderComponent implements AfterViewInit, OnDestroy {
  @Output() viewDefinitionChange = new EventEmitter<ViewDefinition | null>();
  /** Se true (default) esegue `ViewBuilderLayoutHelper.applyHorizontalLayout`
   *  dopo ogni drop di tabella. Se l'utente posiziona manualmente i nodi puo'
   *  disabilitare dal settings menu del pivot-builder cosi' il drop lascia
   *  il nodo dove e' stato rilasciato senza toccare il resto. */
  @Input() autoReflowLayout = true;
  @ViewChild('vbCanvas', { static: false }) canvasRef?: ElementRef<HTMLDivElement>;

  // Rete instances
  private editor?: NodeEditor<VBSchemes>;
  private area?: AreaPlugin<VBSchemes, VBAreaExtra>;

  // Palette
  routeOptions: RouteOption[] = [];
  filteredRouteOptions: RouteOption[] = [];
  selectedRouteOption?: RouteOption;
  private tableAliasCounter = 0;

  // "Show related" filter
  showRelatedOnly = false;
  private fkRelationships: { source: string; target: string }[] = [];

  // Join type
  joinTypeOptions = [
    { label: 'INNER JOIN', value: 'INNER' },
    { label: 'LEFT JOIN', value: 'LEFT' },
    { label: 'RIGHT JOIN', value: 'RIGHT' },
    { label: 'FULL OUTER JOIN', value: 'FULL' }
  ];

  // Join badges (visual indicators on connections)
  joinBadges: { connId: string; x: number; y: number; type: string; label: string; glyph: string }[] = [];

  // Context menu for connection join type
  contextMenuVisible = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuConnectionId: string | null = null;

  private http = inject(HttpClient);
  private userInfo = inject(UserInfoService);
  private cdr = inject(ChangeDetectorRef);

  private trslSrv = inject(TranslationManagerService);

  constructor(
    private injector: Injector,
    private dataSrv: DataProviderService,
    private metaSrv: MetadataProviderService,
  ) { }

  t(key: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** True when at least one table is on the canvas */
  get hasCanvasNodes(): boolean {
    return (this.editor?.getNodes()?.length ?? 0) > 0;
  }

  /**
   * Routes shown in the palette. Le route gia' presenti sul canvas NON vengono
   * rimosse dalla palette (2026-04-24 — scelta UX: la stessa tabella puo'
   * essere droppata piu' volte con alias diversi; vedi `onCanvasDrop`). Invece
   * vengono marcate via `isRouteOnCanvas()` per il template che le evidenzia.
   * Il filtro `showRelatedOnly` agisce solo sul criterio FK.
   */
  get displayedRouteOptions(): RouteOption[] {
    if (!this.showRelatedOnly || !this.hasCanvasNodes) return this.routeOptions;
    const nodes = this.editor!.getNodes() as TableNode[];
    const canvasRoutes = new Set(nodes.map(n => n.route.toLowerCase()));

    // Derive FK targets from canvas nodes' lookupByID columns
    const canvasFkTargets = new Set<string>();
    for (const node of nodes) {
      for (const col of node.columns) {
        if (col.uiType === 'lookupByID' && col.lookupEntityName) {
          canvasFkTargets.add(col.lookupEntityName.toLowerCase());
        }
      }
    }

    return this.routeOptions.filter(opt => {
      const r = opt.value.toLowerCase();
      // Le route gia' sul canvas restano visibili (possono essere ri-droppate).
      if (canvasRoutes.has(r)) return true;
      // canvas node has FK → this route
      if (canvasFkTargets.has(r)) return true;
      // global FK data: route has FK → canvas table
      if (this.fkRelationships.some(fk => fk.source.toLowerCase() === r && canvasRoutes.has(fk.target.toLowerCase()))) return true;
      // global FK data: canvas table has FK → route
      if (this.fkRelationships.some(fk => fk.target.toLowerCase() === r && canvasRoutes.has(fk.source.toLowerCase()))) return true;
      return false;
    });
  }

  /**
   * True se la route e' gia' presente sul canvas (almeno una istanza). Usato
   * dal template per evidenziare la palette-item corrispondente.
   */
  isRouteOnCanvas(route: string): boolean {
    if (!this.editor) return false;
    const r = String(route || '').toLowerCase();
    if (!r) return false;
    const nodes = this.editor.getNodes() as TableNode[];
    return nodes.some(n => String(n.route || '').toLowerCase() === r);
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  async ngAfterViewInit(): Promise<void> {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const editor = new NodeEditor<VBSchemes>();
    const area = new AreaPlugin<VBSchemes, VBAreaExtra>(canvas);
    const connection = new ConnectionPlugin<VBSchemes, VBAreaExtra>();
    const render = new AngularPlugin<VBSchemes, VBAreaExtra>({ injector: this.injector });

    connection.addPreset(ConnectionPresets.classic.setup() as any);

    // Toast di errore quando l'utente inizia un drag da un socket di INPUT
    // (2026-04-24). In questo domain la convenzione e' sempre output→input:
    // l'utente deve partire dal socket di OUTPUT (destra della tabella, es. FK)
    // e rilasciare su un socket di INPUT (sinistra della tabella target, PK).
    // Partendo da INPUT, rete accetterebbe solo un drop su un OUTPUT (backward
    // connection), che in questo UI non e' il flow atteso. Mostriamo subito
    // il toast al `connectionpick` (= inizio drag) invece di aspettare il drop
    // silenziosamente fallito.
    (connection as any).addPipe((context: any) => {
      if (context?.type === 'connectionpick' && context?.data?.socket?.side === 'input') {
        WtoolboxService.messageNotificationService?.add?.({
          severity: 'warn',
          summary: WtoolboxService.translationService?.instant?.('view_builder.connection_direction_invalid.summary') || 'Invalid direction',
          detail: WtoolboxService.translationService?.instant?.('view_builder.connection_direction_invalid.detail') || 'Drag from an OUTPUT socket (right, FK) to an INPUT socket (left, PK).',
          life: 4000
        });
      }
      return context;
    });
    render.addPreset(
      AngularPresets.classic.setup({
        customize: {
          node: () => ViewBuilderNodeComponent
        }
      }) as any
    );

    AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
      accumulating: AreaExtensions.accumulateOnCtrl()
    });
    AreaExtensions.simpleNodesOrder(area);

    editor.use(area);
    area.use(connection);
    area.use(render);

    // Validate connections: target must be PK-like, compatible data types, no self-joins
    editor.addPipe((context) => {
      if (context.type === 'connectioncreate') {
        const { data } = context as any;
        const srcNode = editor.getNode(data.source) as TableNode;
        const tgtNode = editor.getNode(data.target) as TableNode;
        if (!srcNode || !tgtNode) {
          this.showDropRejection('Invalid connection: node not found.');
          return undefined;
        }

        if (srcNode.id === tgtNode.id) {
          this.showDropRejection('Self-join not allowed.');
          return undefined;
        }

        const srcCol = srcNode.columns.find(c => c.alias === data.sourceOutput);
        const tgtCol = tgtNode.columns.find(c => c.alias === data.targetInput);
        if (!srcCol || !tgtCol) {
          this.showDropRejection('Column not found.');
          return undefined;
        }

        const isPkLike = /^id$/i.test(tgtCol.alias) || /^.*id$/i.test(tgtCol.alias) || tgtCol === tgtNode.columns[0];
        if (!isPkLike) {
          this.showDropRejection(`"${tgtCol.label || tgtCol.alias}" is not a primary key column. Drop onto a PK/ID column.`);
          return undefined;
        }

        const srcType = (srcCol.dbType || '').toLowerCase();
        const tgtType = (tgtCol.dbType || '').toLowerCase();

        // Both columns must have a known db type
        if (!srcType) {
          this.showDropRejection(`"${srcCol.label}" has no database type defined — join not allowed.`);
          return undefined;
        }
        if (!tgtType) {
          this.showDropRejection(`"${tgtCol.label}" has no database type defined — join not allowed.`);
          return undefined;
        }

        // Geographic/spatial types cannot be join keys
        const isGeo = (t: string) => /geography|geometry|hierarchyid|point/.test(t);
        if (isGeo(srcType)) {
          this.showDropRejection(`"${srcCol.label}" (${srcType}) is a geographic column — cannot be used in a join.`);
          return undefined;
        }
        if (isGeo(tgtType)) {
          this.showDropRejection(`"${tgtCol.label}" (${tgtType}) is a geographic column — cannot be used in a join.`);
          return undefined;
        }

        // Data type compatibility
        const isNumeric = (t: string) => /int|numeric|decimal|float|real|money|bit/.test(t);
        const isString = (t: string) => /char|text|xml/.test(t);
        const isDate = (t: string) => /date|time/.test(t);
        const compatible = (isNumeric(srcType) && isNumeric(tgtType))
          || (isString(srcType) && isString(tgtType))
          || (isDate(srcType) && isDate(tgtType))
          || srcType === tgtType;
        if (!compatible) {
          this.showDropRejection(`Incompatible types: "${srcCol.label}" (${srcType}) → "${tgtCol.label}" (${tgtType}).`);
          return undefined;
        }
      }
      return context;
    });

    // Emit view changes on graph mutations (skip nodecreated — addTableNode emits after autoDetectJoins)
    editor.addPipe((context) => {
      if (context.type === 'connectioncreated') {
        // Set default join type on new connections.
        // INNER JOIN e' il default sensato per un View Builder: evita NULL
        // sulle colonne del lato "many" quando la tabella driving e' il lato
        // "one" (es. Countries LEFT JOIN StateProvinces produceva righe
        // con `t1.StateProvinceID = NULL` per ogni country senza state).
        // L'utente puo' cambiare manualmente LEFT/RIGHT/FULL via context
        // menu sulla connessione (vedi joinTypeOptions).
        const conn = (context as any).data;
        if (conn && !(conn as any)._joinType) {
          (conn as any)._joinType = this.connectionJoinTypes.get(conn.id) || 'INNER';
        }
        this.refreshConnectedSockets();
        this.emitViewDefinition();
      } else if (['noderemoved', 'connectionremoved'].includes(context.type)) {
        this.refreshConnectedSockets();
        this.emitViewDefinition();
      } else if (context.type === 'nodecreated') {
        this.refreshConnectedSockets();
      }
      return context;
    });

    this.editor = editor;
    this.area = area;

    // Update join glyphs when nodes are dragged
    area.addPipe((context) => {
      if (context.type === 'nodetranslated') {
        requestAnimationFrame(() => this.updateJoinGlyphs());
      }
      return context;
    });

    // Right-click on connections (SVG paths) → show join type context menu
    canvas.addEventListener('contextmenu', (e: MouseEvent) => {
      const target = e.target as Element;
      // Rete renders connections as SVG <path> inside the canvas
      const pathEl = target?.closest?.('path') || (target?.tagName === 'path' ? target : null);
      if (pathEl) {
        // Find which connection this SVG belongs to
        const connId = this.findConnectionIdFromSvg(pathEl);
        if (connId) {
          e.preventDefault();
          this.showConnectionContextMenu(e.clientX, e.clientY, connId);
        }
      }
    });

    await this.loadRouteOptions();
    await this.loadForeignKeys();
  }

  ngOnDestroy(): void {
    this.area?.destroy();
  }

  // ------------------------------------------------------------------
  // Palette: load scaffolded routes
  // ------------------------------------------------------------------

  private async loadRouteOptions(): Promise<void> {
    try {
      const tabRoute = MetadataProviderService.metaTableRoute;
      const result: any = await this.dataSrv.selectByRoute(tabRoute, [], [], 10000, 1);
      const rows = (result?.dato || []) as any[];
      this.routeOptions = rows
        .filter((row: any) => !row?.is_system_route && !!String(row?.md_route_name || '').trim())
        .map((row: any) => {
          const routeName = String(row.md_route_name || '').trim();
          const caption = String(row.mm_display_string || row.md_nome_tabella || routeName).trim();
          const mdId = Number(row.md_id);
          return {
            label: `${caption} (${routeName})`,
            value: routeName,
            mdId: Number.isFinite(mdId) && mdId > 0 ? mdId : null
          };
        })
        .sort((a: RouteOption, b: RouteOption) => a.label.localeCompare(b.label));
      this.filteredRouteOptions = [...this.routeOptions];
    } catch {
      this.routeOptions = [];
      this.filteredRouteOptions = [];
    }
  }

  private async loadForeignKeys(): Promise<void> {
    try {
      this.fkRelationships = await this.metaSrv.getViewBuilderForeignKeys();
      console.log('[ViewBuilder] FK relationships loaded:', this.fkRelationships.length);
    } catch (err) {
      console.warn('[ViewBuilder] loadForeignKeys failed, relying on canvas-derived FK data', err);
      this.fkRelationships = [];
    }
  }

  filterRouteOptions(event: AutoCompleteCompleteEvent): void {
    const query = (event.query || '').toLowerCase();
    this.filteredRouteOptions = this.routeOptions.filter(o => o.label.toLowerCase().includes(query));
  }

  // ------------------------------------------------------------------
  // Drop table from palette
  // ------------------------------------------------------------------

  onPaletteDragStart(event: DragEvent, option: RouteOption): void {
    event.dataTransfer?.setData('application/vb-route', JSON.stringify(option));
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onCanvasDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types?.includes('application/vb-route')) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  }

  async onCanvasDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const raw = event.dataTransfer?.getData('application/vb-route');
    if (!raw || !this.editor || !this.area) return;

    const option: RouteOption = JSON.parse(raw);

    // Duplicate drops are allowed (2026-04-24): la stessa route puo' essere
    // droppata N volte — ogni istanza riceve un `tableAlias` distinto
    // (`t0`, `t1`, ...) via `tableAliasCounter++` in `addTableNode`. Utile per
    // self-join o per includere la stessa tabella con ruoli diversi nella view.

    // Convert DOM coords to area coords
    const canvasRect = this.canvasRef!.nativeElement.getBoundingClientRect();
    const areaTransform = this.area.area.transform;
    const x = (event.clientX - canvasRect.left - areaTransform.x) / areaTransform.k;
    const y = (event.clientY - canvasRect.top - areaTransform.y) / areaTransform.k;

    await this.addTableNode(option, x, y);
  }

  /** Adds a table via the autocomplete "Add" button (positioned at center) */
  async addSelectedRoute(): Promise<void> {
    if (!this.selectedRouteOption || !this.editor) return;
    await this.addTableNode(this.selectedRouteOption, 100 + this.tableAliasCounter * 340, 50);
    this.selectedRouteOption = undefined;
  }

  // ------------------------------------------------------------------
  // Node creation
  // ------------------------------------------------------------------

  private async addTableNode(option: RouteOption, x: number, y: number): Promise<void> {
    if (!this.editor || !this.area) return;

    // Fetch table + column metadata via the raw HTTP endpoint (returns both
    // tableMetadata and columnMetadata in one call, unlike getMetadati which
    // goes through Dexie cache and returns only the column array).
    let metaInfo: any;
    try {
      const apiUrl = this.buildApiBaseUrl() + 'MetaService.getTableMetadata';
      const userId = this.userInfo.getuserInfo()?.user_id ?? '';
      const resp = await firstValueFrom(
        this.http.post<any>(apiUrl, { user_id: String(userId), route: option.value }, { withCredentials: true })
      );
      metaInfo = typeof resp === 'string' ? JSON.parse(resp) : resp;
    } catch (err) {
      WtoolboxService.messageNotificationService?.add({
        severity: 'error', summary: 'Metadata Error',
        detail: `Cannot load metadata for "${option.value}": ${(err as any)?.message || err}`, life: 5000
      });
      return;
    }

    const tableAlias = `t${this.tableAliasCounter++}`;
    const tableMeta = metaInfo?.tableMetadata || {};
    const columnsMeta: any[] = metaInfo?.columnMetadata || [];

    const virtualUiTypes = new Set(['button']);
    const viewColumns: ViewColumn[] = columnsMeta.map((c: any) => {
      const uiType = c.mc_ui_column_type || '';
      const isVirtual = virtualUiTypes.has(uiType);
      return {
        alias: c.mc_nome_colonna || c.mc_real_column_name,
        realName: c.mc_real_column_name || c.mc_nome_colonna,
        label: c.mc_display_string_in_view || c.mc_nome_colonna,
        dbType: c.mc_db_column_type || '',
        uiType,
        tableRoute: option.value,
        tableAlias,
        qualifiedLabel: `${tableMeta.mdroutename || option.value}.${c.mc_display_string_in_view || c.mc_nome_colonna}`,
        selected: !isVirtual,
        virtual: isVirtual || undefined,
        lookupEntityName: uiType === 'lookupByID' ? (c.mc_ui_lookup_entity_name || '') : undefined,
        lookupDataValueField: uiType === 'lookupByID' ? (c.mc_ui_lookup_dataValueField || '') : undefined,
        lookupDataTextField: uiType === 'lookupByID' ? (c.mc_ui_lookup_dataTextField || '') : undefined,
        showInFilters: !!c.mc_show_in_filters,
      };
    });

    // Create Rete node
    const node = new TableNode(tableMeta.mdroutename || option.value);
    node.route = option.value;
    node.mdId = option.mdId;
    node.tableName = tableMeta.md_nome_tabella || option.value;
    node.schemaName = tableMeta.mdschemaname || 'dbo';
    node.caption = tableMeta.mdroutename || option.value;
    node.tableAlias = tableAlias;
    node.columns = viewColumns;
    node.width = 280;
    node.height = Math.min(40 + viewColumns.length * 28, 340);

    // Callback for column checkbox toggle
    node.onColumnToggle = (_alias: string, _selected: boolean) => {
      this.emitViewDefinition();
    };

    // Callback for collapse toggle — update Rete node + all its connections
    node.onCollapseToggle = (_collapsed: boolean) => {
      node.collapsed = _collapsed;
      if (!this.area || !this.editor) return;
      this.area.update('node', node.id);
      // Update all connections attached to this node
      for (const conn of this.editor.getConnections()) {
        if (conn.source === node.id || conn.target === node.id) {
          this.area.update('connection', conn.id);
        }
      }
    };

    // Callback for remove button
    node.onRemoveNode = async () => {
      if (!this.editor) return;
      // Remove all connections first
      for (const conn of this.editor.getConnections()) {
        if (conn.source === node.id || conn.target === node.id) {
          await this.editor.removeConnection(conn.id);
        }
      }
      await this.editor.removeNode(node.id);
      this.emitViewDefinition();
    };

    // Callback for column formula (right-click)
    node.onColumnFormula = async (col: ViewColumn) => {
      const result = await WtoolboxService.promptDialog(
        `Column formula: ${col.label || col.alias}`,
        [
          { name: 'formula', caption: 'SQL Formula', value: col.formula || col.realName || col.alias, type: 'text' },
          { name: 'alias', caption: 'Output Alias', value: col.formulaAlias || col.realName || col.alias, type: 'text' }
        ],
        '500px', '400px'
      );
      if (result) {
        const formulaVal = result.formula?.value ?? result.formula;
        const aliasVal = result.alias?.value ?? result.alias;
        const defaultName = col.realName || col.alias;
        // Set formula only if different from default column name
        col.formula = (formulaVal && formulaVal !== defaultName) ? formulaVal : undefined;
        col.formulaAlias = (aliasVal && aliasVal !== defaultName) ? aliasVal : undefined;
        this.cdr.detectChanges();
        this.area?.update('node', node.id);
        this.emitViewDefinition();
      }
    };

    // Callback rinomina alias tabella (right-click sull'header).
    node.onRenameAlias = () => this.promptRenameAlias(node);

    // Add sockets: output on every column (drag from), input only on PK-like columns (drop onto)
    for (const col of viewColumns) {
      if (col.virtual) continue;
      // Output: any column can be a FK source
      node.addOutput(col.alias, new ClassicPreset.Output(colSocket, col.alias));
      // Input: only PK-like columns accept incoming connections (like SSMS)
      const isPk = /^id$/i.test(col.alias) || /^.*id$/i.test(col.alias) || col === viewColumns[0];
      if (isPk) {
        node.addInput(col.alias, new ClassicPreset.Input(colSocket, col.alias, true));
      }
    }

    await this.editor.addNode(node);
    await this.area.translate(node.id, { x, y });

    // Phase 3: Auto-detect JOINs with existing nodes
    await this.autoDetectJoins(node);

    this.emitViewDefinition();
    this.cdr.detectChanges();

    // Phase 4: reflow layout (opt-out via `autoReflowLayout=false` dal
    // settings menu) — applica layout orizzontale + anti-overlap + zoom-fit.
    if (this.autoReflowLayout) {
      await this.reflowLayoutAfterDrop(node.id);
    }
  }

  /**
   * Reflow layout post-drop di un nodo tabella usando `ViewBuilderLayoutHelper`
   * dedicato: flusso orizzontale left→right via topological sort delle
   * connessioni, anti-overlap link↔tabelle, zoom-to-fit finale.
   */
  private async reflowLayoutAfterDrop(_seedNodeId: string): Promise<void> {
    if (!this.editor || !this.area) return;
    const layoutCtx = {
      editor: this.editor,
      area: this.area,
      findNodeHostElement: (id: string) => this.findNodeHostElement(id)
    };
    try {
      await ViewBuilderLayoutHelper.applyHorizontalLayout(layoutCtx);
      this.emitViewDefinition();
    } catch (err) {
      console.warn('[ViewBuilder] reflowLayoutAfterDrop failed', err);
    }
  }

  /**
   * Locator del DOM host di un nodo rete, usato da LayoutHelper per leggere
   * rect reali (bounding box) e calcolare overlaps. Convenzione
   * rete-angular-plugin: il nodo viene renderizzato come `<node-<id>>`
   * custom element dentro il canvas.
   */
  private findNodeHostElement(nodeId: string): HTMLElement | null {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return null;
    const expectedTagName = `node-${String(nodeId || '').toLowerCase()}`;
    const direct = canvas.querySelector(expectedTagName) as HTMLElement | null;
    if (direct) return direct;
    for (const el of Array.from(canvas.querySelectorAll('*'))) {
      const html = el as HTMLElement;
      if (String(html.tagName || '').toLowerCase() === expectedTagName) return html;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Connected-socket tracking (drives visual indicators on nodes)
  // ------------------------------------------------------------------

  private refreshConnectedSockets(): void {
    if (!this.editor) return;
    const nodes = this.editor.getNodes() as TableNode[];
    for (const n of nodes) {
      n.connectedOutputs.clear();
      n.connectedInputs.clear();
    }
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const conn of this.editor.getConnections()) {
      const src = nodeMap.get(conn.source);
      const tgt = nodeMap.get(conn.target);
      if (src) src.connectedOutputs.add(conn.sourceOutput as string);
      if (tgt) tgt.connectedInputs.add(conn.targetInput as string);
    }
    // Force re-render of all nodes so the template picks up the change
    if (this.area) {
      for (const n of nodes) this.area.update('node', n.id);
    }
  }

  // ------------------------------------------------------------------
  // Phase 3: Auto-join detection
  // ------------------------------------------------------------------

  private routeMatch(a: string, b: string): boolean {
    return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
  }

  private async autoDetectJoins(newNode: TableNode): Promise<void> {
    if (!this.editor) return;

    const allNodes = this.editor.getNodes() as TableNode[];

    for (const existingNode of allNodes) {
      if (existingNode.id === newNode.id) continue;

      // Check: does the NEW node have FK columns pointing to existing node's route?
      for (const col of newNode.columns) {
        if (col.uiType === 'lookupByID' && col.lookupEntityName) {
          console.log(`[VB-AutoJoin] FK "${col.alias}" lookupEntity="${col.lookupEntityName}" vs existingRoute="${existingNode.route}" → match=${this.routeMatch(col.lookupEntityName, existingNode.route)}`);
        }
        if (col.uiType === 'lookupByID' && col.lookupEntityName && this.routeMatch(col.lookupEntityName, existingNode.route)) {
          const sourceOutput = newNode.outputs[col.alias];
          // Find the PK/target column on the existing node (prefer lookupDataValueField, fallback to id-like)
          const targetKey = col.lookupDataValueField
            || existingNode.columns.find(c => /^id$/i.test(c.alias))?.alias
            || existingNode.columns[0]?.alias;
          const targetInput = targetKey ? existingNode.inputs[targetKey] : null;
          if (sourceOutput && targetInput && targetKey) {
            try {
              const conn = new ClassicPreset.Connection(newNode, col.alias, existingNode, targetKey);
              await this.editor.addConnection(conn as any);
            } catch { /* connection might already exist or be invalid */ }
          }
        }
      }

      // Check: does an EXISTING node have FK columns pointing to the NEW node's route?
      for (const col of existingNode.columns) {
        if (col.uiType === 'lookupByID' && col.lookupEntityName) {
          console.log(`[VB-AutoJoin] EXISTING FK "${col.alias}" lookupEntity="${col.lookupEntityName}" vs newRoute="${newNode.route}" → match=${this.routeMatch(col.lookupEntityName, newNode.route)}`);
        }
        if (col.uiType === 'lookupByID' && col.lookupEntityName && this.routeMatch(col.lookupEntityName, newNode.route)) {
          const sourceOutput = existingNode.outputs[col.alias];
          const targetKey = col.lookupDataValueField
            || newNode.columns.find(c => /^id$/i.test(c.alias))?.alias
            || newNode.columns[0]?.alias;
          const targetInput = targetKey ? newNode.inputs[targetKey] : null;
          if (sourceOutput && targetInput && targetKey) {
            try {
              const conn = new ClassicPreset.Connection(existingNode, col.alias, newNode, targetKey);
              await this.editor.addConnection(conn as any);
              console.log(`[VB-AutoJoin] Connection created OK`);
            } catch (connErr) {
              console.error(`[VB-AutoJoin] Connection FAILED:`, connErr);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Node removal
  // ------------------------------------------------------------------

  async removeNode(nodeId: string): Promise<void> {
    if (!this.editor) return;

    // Remove all connections to/from this node first
    const connections = this.editor.getConnections();
    for (const conn of connections) {
      if (conn.source === nodeId || conn.target === nodeId) {
        await this.editor.removeConnection(conn.id);
      }
    }
    await this.editor.removeNode(nodeId);
    this.emitViewDefinition();
    this.cdr.detectChanges();
  }

  /**
   * Rinomina l'alias di una tabella via `promptDialog`. Condiviso tra il path
   * di drop iniziale (`addTableNode`) e quello di restore da viewDefinition
   * persistita. Validazione:
   *  - non vuoto;
   *  - pattern SQL identifier `[A-Za-z_][A-Za-z0-9_]*`;
   *  - unicita' cross-node (case-insensitive).
   * Cascade update: `node.tableAlias` + ogni `col.tableAlias`/`qualifiedLabel`
   * delle colonne → emitViewDefinition → serializer usa i nuovi alias in
   * FROM clause + SELECT qualifications del SQL generato.
   */
  private async promptRenameAlias(node: TableNode): Promise<void> {
    if (!this.editor) return;
    const result = await WtoolboxService.promptDialog(
      `Rinomina alias tabella (${node.tableAlias})`,
      [
        { name: 'alias', caption: 'Nuovo alias', value: node.tableAlias, type: 'string' }
      ],
      '420px', '260px'
    );
    if (!result) return;
    const rawAliasInput = String(result.alias?.value ?? result.alias ?? '').trim();
    if (!rawAliasInput) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn', summary: 'Alias invalido', detail: "L'alias non puo' essere vuoto.", life: 3000
      });
      return;
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawAliasInput)) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn', summary: 'Alias invalido',
        detail: 'Usa solo lettere, numeri e underscore; primo carattere non numerico.',
        life: 3500
      });
      return;
    }
    const sameAlias = (this.editor.getNodes() as TableNode[]).find(n =>
      n.id !== node.id && String(n.tableAlias || '').toLowerCase() === rawAliasInput.toLowerCase()
    );
    if (sameAlias) {
      WtoolboxService.messageNotificationService?.add?.({
        severity: 'warn', summary: 'Alias duplicato',
        detail: `L'alias "${rawAliasInput}" e' gia' usato da un'altra tabella.`, life: 3500
      });
      return;
    }
    node.tableAlias = rawAliasInput;
    for (const col of node.columns) {
      col.tableAlias = rawAliasInput;
      col.qualifiedLabel = `${node.route}.${col.label || col.alias}`;
    }
    this.cdr.detectChanges();
    this.area?.update('node', node.id);
    this.emitViewDefinition();
  }

  // ------------------------------------------------------------------
  // Serialization → ViewDefinition
  // ------------------------------------------------------------------

  // --- Connection context menu ---

  /** Map connection ID → join type (default LEFT) */
  private connectionJoinTypes = new Map<string, string>();

  private findConnectionIdFromSvg(pathEl: Element): string | null {
    if (!this.area || !this.editor) return null;
    // Walk up from the SVG path to find the connection container
    // Rete's connection views are stored in area.connectionViews map
    const connections = this.editor.getConnections();
    const connViews = (this.area as any).connectionViews as Map<string, any> | undefined;
    if (connViews) {
      for (const [id, view] of connViews) {
        if (view?.element?.contains(pathEl)) {
          return id;
        }
      }
    }
    // Fallback: if only one connection, assume it
    if (connections.length === 1) return connections[0].id;
    return null;
  }

  private findConnectionIdFromElement(el: Element | null): string | null {
    if (!el || !this.editor) return null;
    // Rete renders each connection in a container. Walk up to find a connection wrapper.
    // The connection containers are direct children of the area viewport.
    // Match by checking all connections and their DOM positions.
    const connections = this.editor.getConnections();
    const rect = el.getBoundingClientRect();
    // Simple heuristic: find the connection whose SVG container overlaps this element
    for (const conn of connections) {
      const connEl = document.querySelector(`[data-testid="connection-${conn.id}"]`);
      if (connEl?.contains(el) || el?.contains(connEl as Node)) {
        return conn.id;
      }
    }
    // Fallback: if only one connection exists, use it
    if (connections.length === 1) return connections[0].id;
    return null;
  }

  showConnectionContextMenu(x: number, y: number, connId: string): void {
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuConnectionId = connId;
    this.contextMenuVisible = true;
    this.cdr.detectChanges();
  }

  setJoinType(type: string): void {
    if (this.contextMenuConnectionId && this.editor && this.area) {
      this.connectionJoinTypes.set(this.contextMenuConnectionId, type);
      const conn = this.editor.getConnections().find(c => c.id === this.contextMenuConnectionId);
      if (conn) {
        (conn as any)._joinType = type;
        this.area.update('connection', conn.id);
      }
      this.emitViewDefinition();
      requestAnimationFrame(() => this.updateJoinGlyphs());
    }
    this.contextMenuVisible = false;
    this.cdr.detectChanges();
  }

  getJoinType(connId: string): string {
    return this.connectionJoinTypes.get(connId) || 'LEFT';
  }

  async removeConnection(): Promise<void> {
    if (this.contextMenuConnectionId && this.editor) {
      await this.editor.removeConnection(this.contextMenuConnectionId);
      this.connectionJoinTypes.delete(this.contextMenuConnectionId);
      this.emitViewDefinition();
    }
    this.contextMenuVisible = false;
    this.cdr.detectChanges();
  }

  private showDropRejection(detail: string): void {
    WtoolboxService.messageNotificationService?.add?.({
      severity: 'warn',
      summary: 'Join not allowed',
      detail,
      life: 3000
    });
  }

  hideContextMenu(): void {
    this.contextMenuVisible = false;
    this.cdr.detectChanges();
  }

  private emitDebounceTimer: any = null;

  private emitViewDefinition(): void {
    // Debounce: wait 500ms for all graph mutations to settle (e.g. rapid column toggles, auto-joins)
    clearTimeout(this.emitDebounceTimer);
    this.emitDebounceTimer = setTimeout(() => this.emitViewDefinitionNow(), 500);
  }

  private updateJoinGlyphs(): void {
    if (!this.editor || !this.area) return;
    const connViews = (this.area as any).connectionViews as Map<string, any> | undefined;
    if (!connViews) return;

    for (const [connId, view] of connViews) {
      const el = view?.element as HTMLElement;
      if (!el) continue;
      const svg = el.querySelector('svg') || el.closest('svg');
      if (!svg) continue;
      const path = svg.querySelector('path');
      if (!path) continue;

      // Remove existing glyph
      svg.querySelector('.vb-join-glyph')?.remove();

      const joinType = this.connectionJoinTypes.get(connId) || 'INNER';

      // Calculate midpoint from path
      const d = path.getAttribute('d') || '';
      const nums = d.match(/-?[\d.]+/g)?.map(Number);
      if (!nums || nums.length < 8) continue;
      const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = nums;
      const t = 0.5, mt = 0.5;
      const mx = mt * mt * mt * x0 + 3 * mt * mt * t * cx1 + 3 * mt * t * t * cx2 + t * t * t * x1;
      const my = mt * mt * mt * y0 + 3 * mt * mt * t * cy1 + 3 * mt * t * t * cy2 + t * t * t * y1;

      const ns = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', 'vb-join-glyph');
      g.setAttribute('transform', `translate(${mx},${my})`);
      g.style.cursor = 'pointer';
      g.style.pointerEvents = 'all';

      if (joinType === 'LEFT') {
        // Arrow pointing left ◄
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', '-20,-14 8,0 -20,14');
        poly.setAttribute('fill', '#22c55e');
        poly.setAttribute('stroke', '#fff');
        poly.setAttribute('stroke-width', '2');
        g.appendChild(poly);
      } else if (joinType === 'RIGHT') {
        // Arrow pointing right ►
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', '20,-14 -8,0 20,14');
        poly.setAttribute('fill', '#f59e0b');
        poly.setAttribute('stroke', '#fff');
        poly.setAttribute('stroke-width', '2');
        g.appendChild(poly);
      } else if (joinType === 'FULL') {
        // Filled circle ●
        const circle = document.createElementNS(ns, 'circle');
        circle.setAttribute('r', '14');
        circle.setAttribute('fill', '#8b5cf6');
        circle.setAttribute('stroke', '#fff');
        circle.setAttribute('stroke-width', '2');
        g.appendChild(circle);
      } else if (joinType === 'INNER') {
        // Diamond ◆
        const poly = document.createElementNS(ns, 'polygon');
        poly.setAttribute('points', '0,-14 14,0 0,14 -14,0');
        poly.setAttribute('fill', '#3B82F6');
        poly.setAttribute('stroke', '#fff');
        poly.setAttribute('stroke-width', '2');
        g.appendChild(poly);
      }

      // Right-click on glyph opens context menu
      g.addEventListener('contextmenu', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.showConnectionContextMenu((e as MouseEvent).clientX, (e as MouseEvent).clientY, connId);
      });

      svg.appendChild(g);
    }
  }

  private emitViewDefinitionNow(): void {
    requestAnimationFrame(() => this.updateJoinGlyphs());
    const def = this.serializeViewDefinition();
    this.viewDefinitionChange.emit(def);
  }

  serializeViewDefinition(): ViewDefinition | null {
    if (!this.editor) return null;

    const nodes = this.editor.getNodes() as TableNode[];
    if (nodes.length === 0) return null;

    const tables: ViewTableNode[] = nodes.map(n => {
      const areaNode = this.area?.nodeViews?.get(n.id);
      return {
        nodeId: n.id,
        route: n.route,
        mdId: n.mdId,
        tableName: n.tableName,
        schemaName: n.schemaName,
        caption: n.caption,
        tableAlias: n.tableAlias,
        columns: n.columns,
        x: areaNode?.position?.x ?? 0,
        y: areaNode?.position?.y ?? 0,
        collapsed: n.collapsed || undefined,
      };
    });

    const connections = this.editor.getConnections();
    const joins: ViewJoinEdge[] = connections.map(conn => {
      const sourceNode = nodes.find(n => n.id === conn.source) as TableNode | undefined;
      const targetNode = nodes.find(n => n.id === conn.target) as TableNode | undefined;
      return {
        edgeId: conn.id,
        sourceNodeId: conn.source,
        sourceRoute: sourceNode?.route || '',
        sourceColumn: String(conn.sourceOutput),
        targetNodeId: conn.target,
        targetRoute: targetNode?.route || '',
        targetColumn: String(conn.targetInput),
        joinType: (this.connectionJoinTypes.get(conn.id) || 'INNER') as ViewJoinEdge['joinType'],
        autoDetected: true,
      };
    });

    return { tables, joins };
  }

  // ------------------------------------------------------------------
  // Restore from ViewDefinition (for load/reopen)
  // ------------------------------------------------------------------

  /**
   * Svuota completamente il canvas (rimuove tutte le connessioni e tutti
   * i nodi) e resetta il contatore alias. Usato quando l'utente cancella
   * la view definition corrente dal menu "Definition". Idempotente.
   */
  async clearDefinition(): Promise<void> {
    if (!this.editor || !this.area) return;
    for (const conn of this.editor.getConnections()) {
      await this.editor.removeConnection(conn.id);
    }
    for (const node of this.editor.getNodes()) {
      await this.editor.removeNode(node.id);
    }
    this.tableAliasCounter = 0;
    this.connectionJoinTypes.clear();
    this.emitViewDefinition();
  }

  async restoreFromDefinition(def: ViewDefinition): Promise<void> {
    if (!this.editor || !this.area) return;

    // Clear canvas
    for (const conn of this.editor.getConnections()) {
      await this.editor.removeConnection(conn.id);
    }
    for (const node of this.editor.getNodes()) {
      await this.editor.removeNode(node.id);
    }
    this.tableAliasCounter = 0;

    // Recreate nodes
    for (const t of def.tables) {
      const node = new TableNode(t.caption);
      node.id = t.nodeId;
      node.route = t.route;
      node.mdId = t.mdId;
      node.tableName = t.tableName;
      node.schemaName = t.schemaName;
      node.caption = t.caption;
      node.tableAlias = t.tableAlias;
      node.columns = t.columns;
      node.width = 280;
      node.height = Math.min(40 + t.columns.length * 28, 340);
      node.collapsed = !!t.collapsed;
      node.onColumnToggle = () => this.emitViewDefinition();
      node.onCollapseToggle = (_collapsed?: boolean) => {
        node.collapsed = !!_collapsed;
        if (!this.area || !this.editor) return;
        this.area.update('node', node.id);
        for (const conn of this.editor.getConnections()) {
          if (conn.source === node.id || conn.target === node.id) {
            this.area.update('connection', conn.id);
          }
        }
      };
      node.onRemoveNode = async () => {
        if (!this.editor) return;
        for (const conn of this.editor.getConnections()) {
          if (conn.source === node.id || conn.target === node.id) {
            await this.editor.removeConnection(conn.id);
          }
        }
        await this.editor.removeNode(node.id);
        this.emitViewDefinition();
      };
      node.onColumnFormula = async (col: ViewColumn) => {
        const result = await WtoolboxService.promptDialog(
          `Column formula: ${col.label || col.alias}`,
          [
            { name: 'formula', caption: 'SQL Formula', value: col.formula || col.realName || col.alias, type: 'text' },
            { name: 'alias', caption: 'Output Alias', value: col.formulaAlias || col.realName || col.alias, type: 'text' }
          ],
          '500px', '320px'
        );
        if (result) {
          const formulaVal = result.formula?.value ?? result.formula;
          const aliasVal = result.alias?.value ?? result.alias;
          const defaultName = col.realName || col.alias;
          col.formula = (formulaVal && formulaVal !== defaultName) ? formulaVal : undefined;
          col.formulaAlias = (aliasVal && aliasVal !== defaultName) ? aliasVal : undefined;
          this.cdr.detectChanges();
          this.area?.update('node', node.id);
          this.emitViewDefinition();
        }
      };
      node.onRenameAlias = () => this.promptRenameAlias(node);

      for (const col of t.columns) {
        if (col.virtual) continue;
        node.addOutput(col.alias, new ClassicPreset.Output(colSocket, col.alias));
        const isPk = /^id$/i.test(col.alias) || /^.*id$/i.test(col.alias) || col === t.columns[0];
        if (isPk) {
          node.addInput(col.alias, new ClassicPreset.Input(colSocket, col.alias, true));
        }
      }

      await this.editor.addNode(node);
      await this.area.translate(node.id, { x: t.x, y: t.y });
      this.tableAliasCounter = Math.max(this.tableAliasCounter, parseInt(t.tableAlias.replace('t', '')) + 1);
    }

    // Recreate connections
    for (const j of def.joins) {
      try {
        const srcNode = this.editor.getNodes().find(n => n.id === j.sourceNodeId);
        const tgtNode = this.editor.getNodes().find(n => n.id === j.targetNodeId);
        if (srcNode && tgtNode) {
          const conn = new ClassicPreset.Connection(srcNode, j.sourceColumn, tgtNode, j.targetColumn);
          await this.editor.addConnection(conn as any);
          // Restore join type (se != default). Nota: default attuale e'
          // INNER, ma i vecchi ViewDefinition salvati potrebbero avere
          // `joinType` undefined (equivalenti al vecchio default LEFT) —
          // in quel caso lasciamo che il pipe `connectioncreated` applichi
          // il nuovo default INNER. Chi vuole mantenere LEFT deve salvarlo
          // esplicitamente dopo questo upgrade.
          if (j.joinType) {
            this.connectionJoinTypes.set(conn.id, j.joinType);
          }
        }
      } catch { /* skip invalid connections */ }
    }

    this.emitViewDefinition();
    requestAnimationFrame(() => this.updateJoinGlyphs());
    this.cdr.detectChanges();
  }

  // ------------------------------------------------------------------
  // Zoom to fit
  // ------------------------------------------------------------------

  private buildApiBaseUrl(): string {
    const configured = String((WtoolboxService as any).appSettings?.global_root_url || '').trim();
    if (configured) return configured.endsWith('/') ? configured : `${configured}/`;
    const apiUrl = String((WtoolboxService as any).appSettings?.api_url || '').trim();
    if (apiUrl) return (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) + 'Meta/AsmxProxy/';
    return `${window.location.origin}/api/Meta/AsmxProxy/`;
  }

  async zoomToFit(): Promise<void> {
    if (this.area) {
      await AreaExtensions.zoomAt(this.area, this.editor!.getNodes());
    }
  }
}
