import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { MetaInfo } from '../../class/metaInfo';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { Title } from '@angular/platform-browser';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';
import { TreeModule } from 'primeng/tree';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { FilterInfo } from '../../class/filterInfo';
import { FilterItem } from '../../class/filterItem';
import type { TreeNode } from 'primeng/api';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { DataProviderService } from '../../service/data-provider.service';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import type { MenuItem } from 'primeng/api';

@Component({
  selector: 'wuic-tree-list',
  imports: [TreeModule, NgComponentOutlet, ButtonModule, TranslateModule, CommonModule],
  templateUrl: './tree-list.component.html',
  styleUrl: './tree-list.component.css'
})
export class TreeListComponent implements OnInit, OnDestroy, IDataBoundHostComponent {

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
   * Input dal componente padre per hide toolbar; supportato per coerenza con il data-repeater.
   */
  @Input() hideToolbar: boolean = false;
  /**
   * Evento emesso quando il datasource aggiorna l'albero.
   */
  @Output() onTreeDataBound = new EventEmitter<{ metaInfo: MetaInfo; records: TreeNode[] }>();
  /**
   * Evento emesso prima del caricamento lazy dei figli di un nodo.
   */
  @Output() onTreeNodeExpand = new EventEmitter<any>();
  /**
   * Evento emesso dopo il caricamento lazy dei figli di un nodo.
   */
  @Output() onTreeNodeExpanded = new EventEmitter<{ node: any; childrenCount: number }>();
  /**
   * Evento emesso quando l'utente seleziona un nodo.
   */
  @Output() onTreeNodeSelect = new EventEmitter<any>();
  /**
   * Evento emesso quando l'utente deseleziona un nodo.
   */
  @Output() onTreeNodeUnselect = new EventEmitter<any>();
  /**
   * Evento emesso al collapse di un nodo.
   */
  @Output() onTreeNodeCollapse = new EventEmitter<any>();

  /**
   * Collezione dati per records, consumata dal rendering e dalle operazioni del componente.
   */
  records: any[] = [];
  /**
   * Collezione dati per cols, consumata dal rendering e dalle operazioni del componente.
   */
  cols: any[] = [];
  /**
   * Collezione dati per metas, consumata dal rendering e dalle operazioni del componente.
   */
  metas: MetadatiColonna[] = [];
  /**
   * Metadati completi della route corrente (tabella, colonne, regole) usati per costruire UI e logica runtime.
   */
  metaInfo: MetaInfo = new MetaInfo();
  /**
   * Proprieta di stato del componente per route name, usata dalla logica interna e dal template.
   */
  routeName: string = '';
  /**
   * Proprieta di stato del componente per total records, usata dalla logica interna e dal template.
   */
  totalRecords: number;
  /**
   * Proprieta di stato del componente per page size, usata dalla logica interna e dal template.
   */
  pageSize: number = 10;
  /**
   * Proprieta di stato del componente per row number, usata dalla logica interna e dal template.
   */
  rowNumber: number = 0;
  /**
   * Proprieta di stato del componente per order column, usata dalla logica interna e dal template.
   */
  orderColumn: string = '';
  /**
   * Proprieta di stato del componente per order dir, usata dalla logica interna e dal template.
   */
  orderDir: string = '';
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a loading.
   */
  loading: boolean = false;
  /**
   * Indice corrente per page index, usato per posizionamento o navigazione nel componente.
   */
  pageIndex: number;

  /**
   * Configurazione di presentazione per item template string, usata nel rendering del componente.
   */
  itemTemplateString: string;
  /**
   * Configurazione di presentazione per item template, usata nel rendering del componente.
   */
  itemTemplate: typeof DynamicGenericTemplateComponent;
  /**
   * Proprieta di stato del componente per title function, usata dalla logica interna e dal template.
   */
  titleFunction: Function;
  /**
   * Flag di stato che governa il comportamento UI/logico relativo a init completed.
   */
  initCompleted: boolean;
  /**
   * Collezione dati per tree options, consumata dal rendering e dalle operazioni del componente.
   */
  treeOptions: any;

  nodeActions: MenuItem[];

  /**
   * Proprieta di stato del componente per datasource ready subscription, usata dalla logica interna e dal template.
   */
  private datasourceReadySubscription?: Subscription;
  /**
   * Proprieta di stato del componente per fetch info subscription, usata dalla logica interna e dal template.
   */
  private fetchInfoSubscription?: Subscription;


  /**
* function Object() { [native code] }
* @param titleService Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
* @param dataSrv Parametro in ingresso utilizzato per determinare il flusso operativo del metodo.
*/
  constructor(private titleService: Title, private dataSrv: DataProviderService, private cd: ChangeDetectorRef, private trslSrv: TranslationManagerService) {
  }

  /**
   * Inizializza il componente preparando stato, sottoscrizioni e primi caricamenti richiesti.
   *
   * Fire-and-forget: Angular `OnInit.ngOnInit` deve ritornare void; deleghiamo
   * la logica async a `initAsync()` per evitare Promise floating tipizzata void.
   */
  ngOnInit(): void {
    void this.initAsync();
  }

  private async initAsync(): Promise<void> {
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
        }
      });
    }
  }

  /**
* Gestisce la logica di `subscribeToDS` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), gestendo esplicitamente il ciclo di vita delle subscription RxJS, preparando/aggiornando il dataset visualizzato.
*/
  async subscribeToDS() {
    let self = this;

    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = self.datasource.value.fetchInfo$.subscribe(async (info) => {
      if (info) {
        self.metaInfo = info.metaInfo;

        if (!self.initCompleted) {

          let title = self.metaInfo.tableMetadata.md_display_string;

          self.titleService.setTitle(title);

          this.treeOptions = this.resolveTreeOptions(info.metaInfo);

          if (this.treeOptions.itemTemplateString || this.metaInfo.tableMetadata.md_treeview_template) {
            this.itemTemplateString = this.treeOptions.itemTemplateString || this.metaInfo.tableMetadata.md_treeview_template;
          }

          const template = this.itemTemplateString || MetadataProviderService.widgetDefinition.treeItemTemplate;

          const component = DynamicGenericTemplateComponent.getComponentFromTemplate(template || '', 'md_props_bag.archetypes.tree.itemTemplate', String(this.metaInfo?.tableMetadata?.md_route_name || ''));

          this.itemTemplate = component;

          if (this.metaInfo.tableMetadata.md_server_side_operations) {
            this.datasource.value.filterInfo = new FilterInfo('AND', [
              new FilterItem({ field: this.treeOptions.parentField, operator: 'isnull', value: '' })
            ]);
          }

          await self.datasource.value.fetchData();

          self.initCompleted = true;
        } else {

          // CRUD operations (add/edit/delete) trigger fetchData() which re-publishes
          // fetchInfo$. Naively re-running parseData rebuilds the whole records tree
          // from scratch — dropping every `expanded: true` flag and, for server-side
          // ops, also dropping lazy-loaded children (the refetch with `parentField isnull`
          // only returns root rows). Preserve expansion state across the rebuild so
          // the UI feels stable after post-CRUD refresh.
          const serverSide = !!self.metaInfo?.tableMetadata?.md_server_side_operations;
          const preservedExpansion = self.captureExpansionState(self.records);
          const rebuilt = self.parseData(info.resultInfo.dato);
          self.records = preservedExpansion.size
            ? self.restoreExpansionState(rebuilt, preservedExpansion, serverSide)
            : rebuilt;
          self.onTreeDataBound.emit({
            metaInfo: self.metaInfo,
            records: self.records
          });
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
  }

  /**
* Interpreta e normalizza input/configurazione in `parseData` per l'utilizzo nel componente.
* @param data Dato/record su cui il metodo applica elaborazioni o aggiornamenti.
* @returns Struttura dati prodotta da `parseData` dopo normalizzazione/elaborazione.
*/
  parseData(data: any) {
    return WtoolboxService.wrapArchetypeLifecycleSync(
      'tree', 'parseData',
      () => this._parseDataInternal(data),
      { route: this.metaInfo?.tableMetadata?.md_route_name },
      { fallback: [] }
    );
  }

  private _parseDataInternal(data: any) {
    let items: TreeNode[] = [];

    // skills/typed-localized-exceptions: cached compiled fn → wrap il
    // call-site (non la compile) cosi' ogni invocazione runtime e' protetta.
    let labelFunction: ((record: any) => any) | undefined = undefined;
    if (this.treeOptions?.labelFunction) {
      const compiledLabelFn = new Function('record', this.treeOptions.labelFunction);
      const route = this.metaInfo?.tableMetadata?.md_route_name;
      labelFunction = (record: any) => WtoolboxService.runUserCallbackSync(
        'archetypes.tree.labelFunction',
        () => compiledLabelFn(record),
        [],
        { archetype: 'tree', route }
      );
    }

    if (data) {
      data.forEach((record) => {
        const recordKey = this.getRecordPrimaryKeyValue(record);
        const recordLabel = labelFunction ? labelFunction(record) : this.getRecordFieldValue(record, this.treeOptions?.labelField);
        const recordIcon = this.getRecordFieldValue(record, this.treeOptions?.iconField);
        const recordLeaf = this.getRecordFieldValue(record, this.treeOptions?.leafField);
        const parentKey = this.getRecordFieldValue(record, this.treeOptions?.parentField);

        let item = {
          key: recordKey,
          label: recordLabel ?? '',
          data: record,
          icon: recordIcon,
          leaf: recordLeaf,
          // children: []
        }

        if (this.hasTreeParentValue(parentKey)) {
          let parent = this.recursiveTreeSearch(items, parentKey);
          if (parent) {
            if (!parent.children) {
              parent.children = [];
            }
            parent.children.push(item);
          } else {
            console.error('Parent not found for record', record);
          }
        } else {
          items.push(item);
        }

      });
    }

    return items;
  }

  /**
* Gestisce la logica operativa di `recursiveTreeSearch` in modo coerente con l'implementazione corrente.
* @param node Collezione in ingresso processata dal metodo.
* @param key Identificativo tecnico usato per lookup o confronto.
* @returns Risultato elaborato da `recursiveTreeSearch` e restituito al chiamante.
*/
  recursiveTreeSearch(node: TreeNode[], key: string) {
    let found: TreeNode;
    const normalizedKey = this.normalizeTreeKeyValue(key);

    node.forEach((item) => {
      if (this.normalizeTreeKeyValue(item.key) === normalizedKey) {
        found = item;
      } else {
        if (item.children) {
          let child = this.recursiveTreeSearch(item.children, key);
          if (child) {
            found = child;
          }
        }
      }
    });

    return found;
  }

  /**
* Gestisce la logica di `onNodeExpand` con regole guidate dai metadati server `_Metadati_*` (tabella/colonna), trasformando e filtrando collezioni dati, preparando/aggiornando il dataset visualizzato.
* @param event Evento UI/payload evento che innesca la logica del metodo.
*/
  async onNodeExpand(event) {
    this.onTreeNodeExpand.emit(event);
    if (!event.node.children) {
      event.node.loading = true;

      try {
        const currentNodeKey = this.getRecordPrimaryKeyValue(event.node?.data);

        this.datasource.value.filterInfo = new FilterInfo('AND', [
          new FilterItem({ field: this.treeOptions.parentField, operator: 'eq', value: currentNodeKey })
        ]);

        const res = await this.dataSrv.select(this.datasource.value, true);
        const records = Array.isArray(res?.dato) ? res.dato : [];

        const children = records.map((record) => {
          const recordKey = this.getRecordPrimaryKeyValue(record);
          const recordLabel = this.getRecordFieldValue(record, this.treeOptions?.labelField);
          const recordIcon = this.getRecordFieldValue(record, this.treeOptions?.iconField);
          const recordLeaf = this.getRecordFieldValue(record, this.treeOptions?.leafField);

          return {
            key: recordKey,
            label: recordLabel ?? '',
            data: record,
            icon: recordIcon,
            leaf: recordLeaf,
          };
        });

        const normalizedNodeKey = this.normalizeTreeKeyValue(event.node?.key ?? currentNodeKey);
        event.node.children = children;
        event.node.expanded = true;
        this.records = this.updateTreeNode(this.records, normalizedNodeKey, (node) => ({
          ...node,
          children: children,
          expanded: true,
          loading: false
        }));
        this.onTreeNodeExpanded.emit({
          node: event.node,
          childrenCount: children.length
        });
      } finally {
        event.node.loading = false;
        this.cd.detectChanges();
      }
    }
  }

  onNodeSelect(event: any) {
    this.onTreeNodeSelect.emit(event);
  }

  onNodeUnselect(event: any) {
    this.onTreeNodeUnselect.emit(event);
  }

  onNodeCollapse(event: any) {
    this.onTreeNodeCollapse.emit(event);
  }

  private getRecordPrimaryKeyValue(record: any): any {
    const pKeyName = MetadataProviderService.getPKeys(this.metaInfo?.columnMetadata || []).map((x) => x.mc_nome_colonna)[0];
    return this.getRecordFieldValue(record, pKeyName);
  }

  private getRecordFieldValue(record: any, fieldName: string | undefined): any {
    if (!record || !fieldName) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(record, fieldName)) {
      return this.unwrapTreeFieldValue(record[fieldName]);
    }

    const normalizedFieldName = String(fieldName).toLowerCase();
    const matchedKey = Object.keys(record).find((k) => String(k).toLowerCase() === normalizedFieldName);
    if (!matchedKey) {
      return undefined;
    }

    return this.unwrapTreeFieldValue(record[matchedKey]);
  }

  private resolveTreeOptions(metaInfo: MetaInfo): any {
    const tree = { ...(metaInfo?.tableMetadata?.extraProps?.archetypes?.tree || {}) };
    const columns = metaInfo?.columnMetadata || [];

    const resolveFieldName = (configuredName: string | undefined, candidates: RegExp[]): string | undefined => {
      const normalizedConfigured = String(configuredName || '').trim();
      if (normalizedConfigured) {
        const exactMetadataMatch = columns.find((c) =>
          String(c?.mc_nome_colonna || '').toLowerCase() === normalizedConfigured.toLowerCase()
          || String(c?.mc_real_column_name || '').toLowerCase() === normalizedConfigured.toLowerCase()
        );

        if (exactMetadataMatch?.mc_nome_colonna) {
          return exactMetadataMatch.mc_nome_colonna;
        }
      }

      const matched = columns.find((c) => {
        const names = [String(c?.mc_nome_colonna || ''), String(c?.mc_real_column_name || '')].filter(Boolean);
        return names.some((n) => candidates.some((rx) => rx.test(n)));
      });

      return matched?.mc_nome_colonna || normalizedConfigured || undefined;
    };

    tree.parentField = resolveFieldName(tree.parentField, [/^parentid$/i, /parent/i]);
    tree.labelField = resolveFieldName(tree.labelField, [/treedescription/i, /description/i, /display/i, /name/i, /title/i, /label/i]);
    tree.leafField = resolveFieldName(tree.leafField, [/^isleaf$/i, /leaf/i]);
    tree.iconField = resolveFieldName(tree.iconField, [/icon/i]);

    return tree;
  }

  private unwrapTreeFieldValue(raw: any): any {
    if (raw == null) {
      return raw;
    }

    if (raw instanceof BehaviorSubject) {
      return raw.value;
    }

    if (typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value')) {
      return raw.value;
    }

    return raw;
  }

  private hasTreeParentValue(value: any): boolean {
    return value !== null && value !== undefined && String(value).trim() !== '';
  }

  private normalizeTreeKeyValue(value: any): string {
    const unwrapped = this.unwrapTreeFieldValue(value);
    if (unwrapped === null || unwrapped === undefined) {
      return '';
    }
    return String(unwrapped).trim();
  }

  /**
   * Walk the current records tree and collect a snapshot of which node keys are
   * expanded (and, for lazy/server-side trees, which children they already loaded).
   * Used right before rebuilding `records` from a refreshed fetchInfo payload so
   * the expansion state can be restored on the new node instances.
   */
  private captureExpansionState(nodes: TreeNode[] | undefined): Map<string, { children: TreeNode[] }> {
    const snapshot = new Map<string, { children: TreeNode[] }>();
    const walk = (list: TreeNode[] | undefined) => {
      if (!Array.isArray(list)) return;
      for (const node of list) {
        if (node?.expanded) {
          const key = this.normalizeTreeKeyValue(node.key);
          if (key) {
            snapshot.set(key, { children: Array.isArray(node.children) ? node.children : [] });
          }
        }
        if (Array.isArray(node?.children) && node.children.length) {
          walk(node.children);
        }
      }
    };
    walk(nodes);
    return snapshot;
  }

  /**
   * Re-apply the pre-refresh expansion snapshot to the rebuilt records tree.
   * - For client-side trees, `parseData` already produced full child subtrees from
   *   the new dataset; we only need to flip `expanded` back on.
   * - For server-side trees, the refreshed dataset contains only the root rows
   *   (filterInfo pins `parentField isnull`), so we re-attach the previously
   *   lazy-loaded children from the snapshot. Stale children for records whose
   *   subtree changed due to the CRUD are accepted as a trade-off — the next user
   *   collapse+expand cycle re-fetches fresh data via `onNodeExpand`.
   */
  private restoreExpansionState(
    nodes: TreeNode[] | undefined,
    snapshot: Map<string, { children: TreeNode[] }>,
    serverSide: boolean
  ): TreeNode[] {
    if (!Array.isArray(nodes) || !snapshot.size) {
      return Array.isArray(nodes) ? nodes : [];
    }

    const walk = (list: TreeNode[]): TreeNode[] => list.map((node) => {
      const key = this.normalizeTreeKeyValue(node?.key);
      const preserved = key ? snapshot.get(key) : undefined;

      // Recurse into current children first so nested expansions get restored too.
      const currentChildren = Array.isArray(node?.children) && node.children.length
        ? walk(node.children)
        : node?.children;

      if (preserved) {
        if (serverSide) {
          // Use preserved subtree and recurse into it to restore deeper expansions.
          const preservedChildren = walk(preserved.children);
          return { ...node, expanded: true, children: preservedChildren };
        }
        return { ...node, expanded: true, children: currentChildren };
      }

      if (currentChildren !== node?.children) {
        return { ...node, children: currentChildren };
      }
      return node;
    });

    return walk(nodes);
  }

  private updateTreeNode(nodes: TreeNode[] | undefined, key: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
    const list = Array.isArray(nodes) ? nodes : [];
    if (!key || !list.length) {
      return list;
    }

    let changed = false;
    const mapped = list.map((node) => {
      const nodeKey = this.normalizeTreeKeyValue(node?.key);
      if (nodeKey === key) {
        changed = true;
        return updater(node);
      }

      if (Array.isArray(node?.children) && node.children.length) {
        const newChildren = this.updateTreeNode(node.children, key, updater);
        if (newChildren !== node.children) {
          changed = true;
          return { ...node, children: newChildren };
        }
      }

      return node;
    });

    return changed ? mapped : list;
  }

  private translateLabel(key: string, fallback?: string): string {
    const translated = String(this.trslSrv.instant(key) || '').trim();
    if (!translated || translated.toLowerCase() === key.toLowerCase()) {
      return fallback ?? key;
    }
    return translated;
  }

  addRecord() {
    let header = this.trslSrv.instant('insert') + ' ' + this.metaInfo.tableMetadata.md_display_string;

    let defaulted = this.datasource.value.addNewRecord();

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        record: defaulted,
        pristine: this.datasource.value.pristine,
        metaInfo: this.metaInfo,
        datasource: this.datasource,
        isEditForm: true
      },
      header: header,
      styleClass: 'edit-form-content',
      position: 'center'
    });

    ref.onClose.subscribe((added: any) => {
      if (added) {
        this.datasource.value.fetchData();
      }
    });
  }

}

