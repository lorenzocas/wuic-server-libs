import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { BehaviorSubject, Subscription } from 'rxjs';
import { NgStyle } from '@angular/common';
import { KanbanOptions, KanbanStatusColumn } from '../../class/kanbanOptions';
import { MetaInfo } from '../../class/metaInfo';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { DataSourceComponent } from '../data-source/data-source.component';
import { LazyDataActionButtonComponent } from '../data-action-button/data-action-button.lazy.component';
import { ArchetypeConfiguratorComponent } from '../archetype-configurator/archetype-configurator.component';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { ParametricDialogComponent } from '../parametric-dialog/parametric-dialog.component';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { DataProviderService } from '../../service/data-provider.service';
import { UserInfoService } from '../../service/user-info.service';
import { IDataBoundHostComponent } from '../../class/IDataBoundHostComponent';

interface KanbanCard {
  key: string;
  record: any;
  statusValue: any;
  title: string;
  subtitle: string;
  description: string;
  assignedUserLabel: string;
}

interface KanbanColumn {
  id: string;
  value: any;
  label: string;
  color?: string;
  order: number;
  wipLimit?: number | null;
  wipLimitHard?: boolean;
  cards: KanbanCard[];
}

interface PendingKanbanChange {
  cardKey: string;
  record: any;
  fromStatus: any;
  toStatus: any;
}

@Component({
  selector: 'wuic-kanban-list',
  imports: [DragDropModule, ButtonModule, TranslateModule, NgStyle, LazyDataActionButtonComponent, ArchetypeConfiguratorComponent],
  templateUrl: './kanban-list.component.html',
  styleUrl: './kanban-list.component.css'
})
export class KanbanListComponent implements OnInit, OnDestroy, IDataBoundHostComponent {
  @Input() hardcodedRoute: string;
  @Input() parentRecord: any;
  @Input() parentMetaInfo: MetaInfo;
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() hideToolbar: boolean = false;
  @Output() onKanbanDataBound = new EventEmitter<{ metaInfo: MetaInfo; columns: any[]; unassignedCards: any[] }>();
  @Output() onKanbanCardDrop = new EventEmitter<{ card: any; fromStatus: any; toStatus: any; targetColumn: any | null; mode: 'immediate' | 'batch' }>();
  @Output() onKanbanCardClick = new EventEmitter<{ card: any; originalEvent: MouseEvent }>();
  @Output() onKanbanBatchSave = new EventEmitter<{ savedCount: number }>();
  @Output() onKanbanBatchCancel = new EventEmitter<{ revertedCount: number }>();
  @Output() onKanbanConfigApplied = new EventEmitter<{ config: KanbanOptions }>();

  metaInfo: MetaInfo;
  kanbanOptions: KanbanOptions = new KanbanOptions();
  columns: KanbanColumn[] = [];
  unassignedCards: KanbanCard[] = [];
  readonly unassignedDropListId = 'kanban-col-unassigned';
  connectedDropListIds: string[] = [];
  showConfigDialog = false;
  warningMessage = '';
  savingBatch = false;
  private lookupDerivedStatusColumns: KanbanStatusColumn[] = [];
  private lookupColumnsLoading = false;
  private lookupColumnsLoadedKey = '';
  private readonly defaultStatusColors: string[] = [
    '#fecaca',
    '#fed7aa',
    '#fde68a',
    '#bbf7d0',
    '#a7f3d0',
    '#bfdbfe',
    '#c7d2fe',
    '#ddd6fe',
    '#f5d0fe',
    '#fbcfe8',
    '#d1fae5',
    '#e9d5ff'
  ];

  private datasourceReadySubscription?: Subscription;
  private fetchInfoSubscription?: Subscription;
  private pendingChanges = new Map<string, PendingKanbanChange>();

  constructor(private router: Router, private trslSrv: TranslationManagerService, private dataProviderSrv: DataProviderService, private userInfo: UserInfoService) { }

  private t(key: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  ngOnInit(): void {
    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedDatasource);
      this.subscribeToDatasource();
      return;
    }

    if (this.datasource?.value) {
      this.subscribeToDatasource();
      return;
    }

    this.datasourceReadySubscription?.unsubscribe();
    this.datasourceReadySubscription = this.datasource?.subscribe((ds) => {
      if (ds) {
        this.datasourceReadySubscription?.unsubscribe();
        this.datasourceReadySubscription = undefined;
        this.subscribeToDatasource();
      }
    });
  }

  ngOnDestroy(): void {
    this.datasourceReadySubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
  }

  get hasPendingChanges(): boolean {
    return this.pendingChanges.size > 0;
  }

  get canRenderBoard(): boolean {
    return !!this.metaInfo && !!this.kanbanOptions?.statusField && (this.columns.length > 0 || this.unassignedCards.length > 0);
  }

  get isAdmin(): boolean {
    return this.userInfo.isCurrentUserAdmin();
  }

  openKanbanConfig(): void {
    if (!this.isAdmin) {
      return;
    }
    this.showConfigDialog = true;
  }

  get canAddCard(): boolean {
    return !!this.metaInfo?.tableMetadata?.md_insertable;
  }

  addRecord(): void {
    const ds = this.datasource?.value;
    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    if (!ds || !this.metaInfo) {
      return;
    }

    const newSeed: any = {};
    if (statusField) {
      newSeed[statusField] = null;
      newSeed[`${statusField}__lookup_obj`] = null;
    }

    const defaulted = ds.addNewRecord(newSeed);
    const header = `${this.trslSrv.instant('insert')} ${this.metaInfo.tableMetadata.md_display_string}`;
    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        record: defaulted,
        pristine: ds.pristine,
        metaInfo: this.metaInfo,
        datasource: this.datasource,
        isEditForm: true
      },
      header,
      styleClass: 'edit-form-content',
      position: 'center'
    });

    ref.onClose.subscribe((added: any) => {
      if (added) {
        ds.fetchData();
      }
    });
  }

  applyKanbanConfig(nextConfig: any): void {
    this.kanbanOptions = this.normalizeKanbanOptions(Object.assign({}, this.kanbanOptions || {}, nextConfig || {}));

    if (this.metaInfo?.tableMetadata) {
      const extraProps = this.ensureMergedExtraProps();
      extraProps.archetypes = extraProps.archetypes || {};
      extraProps.archetypes.kanban = Object.assign({}, extraProps.archetypes.kanban || {}, this.kanbanOptions);
      this.metaInfo.tableMetadata.extraProps = extraProps;
      (this.metaInfo.tableMetadata as any).md_props_bag = JSON.stringify(extraProps);
    }

    void this.ensureLookupStatusColumnsLoaded();
    this.rebuildBoard();
    this.onKanbanConfigApplied.emit({ config: this.kanbanOptions });
  }

  async onDrop(event: CdkDragDrop<KanbanCard[]>, targetColumn: KanbanColumn | null): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    if (targetColumn && this.isWipExceeded(targetColumn, 1) && targetColumn.wipLimitHard) {
      WtoolboxService.messageNotificationService.add({
        severity: 'warn',
        summary: this.t('kanban.summary', 'Kanban'),
        detail: this.trslSrv.format(
          this.t('kanban.wip_limit_hard_exceeded_{0}', 'WIP hard limit exceeded for {0}'),
          targetColumn.label
        )
      });
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex
    );

    const movedCard = event.container.data[event.currentIndex];
    if (!movedCard) {
      return;
    }

    const previousStatus = movedCard.statusValue;
    const nextStatus = targetColumn ? targetColumn.value : null;
    this.applyCardStatus(movedCard, nextStatus);
    this.onKanbanCardDrop.emit({
      card: movedCard,
      fromStatus: previousStatus,
      toStatus: nextStatus,
      targetColumn,
      mode: this.kanbanOptions.persistMode
    });
    if (targetColumn) {
      this.checkWipLimit(targetColumn);
    }

    if (this.kanbanOptions.persistMode === 'batch') {
      this.registerPendingChange(movedCard, previousStatus, nextStatus);
      return;
    }

    const ok = await this.persistCardStatusChange(movedCard, previousStatus, nextStatus);
    if (!ok) {
      this.applyCardStatus(movedCard, previousStatus);
      this.rebuildBoard();
    }
  }

  async saveBatchChanges(): Promise<void> {
    if (this.savingBatch || !this.hasPendingChanges) {
      return;
    }

    this.savingBatch = true;
    try {
      for (const pending of [...this.pendingChanges.values()]) {
        const card = this.findCardByKey(pending.cardKey);
        if (!card) {
          continue;
        }

        const ok = await this.persistCardStatusChange(card, pending.fromStatus, pending.toStatus);
        if (!ok) {
          this.rebuildBoard();
          return;
        }
      }

      const savedCount = this.pendingChanges.size;
      this.pendingChanges.clear();
      this.onKanbanBatchSave.emit({ savedCount });
      WtoolboxService.messageNotificationService.add({
        severity: 'success',
        summary: this.t('kanban.summary', 'Kanban'),
        detail: this.t('kanban.changes_saved', 'Changes saved')
      });
    } finally {
      this.savingBatch = false;
    }
  }

  cancelBatchChanges(): void {
    const revertedCount = this.pendingChanges.size;
    for (const pending of this.pendingChanges.values()) {
      pending.record[this.kanbanOptions.statusField] = pending.fromStatus;
    }

    this.pendingChanges.clear();
    this.rebuildBoard();
    this.onKanbanBatchCancel.emit({ revertedCount });
  }

  onCardClick(card: KanbanCard, event: MouseEvent): void {
    if (!card || !this.datasource?.value) {
      return;
    }
    this.onKanbanCardClick.emit({ card, originalEvent: event });

    const target = event?.target as HTMLElement;
    if (target?.closest('.kanban-card-actions')) {
      return;
    }

    const clickAction = String(this.kanbanOptions?.clickAction || 'detail').trim().toLowerCase();
    if (clickAction === 'none') {
      return;
    }

    const route = String(this.datasource.value?.route?.value || this.metaInfo?.tableMetadata?.md_route_name || '').trim();
    const pkeyName = String(this.metaInfo?.pKey?.mc_nome_colonna || '').trim();
    const pkeyValue = pkeyName ? card.record?.[pkeyName] : undefined;

    if (!route || !pkeyName || pkeyValue === undefined || pkeyValue === null) {
      return;
    }

    this.datasource.value.setCurrent(card.record);
    const nextAction = clickAction === 'edit' ? 'edit' : 'detail';
    void this.router.navigate(['/', route, nextAction, String(pkeyValue)]);
  }

  getColumnStyle(column: KanbanColumn): any {
    if (!column?.color) {
      return null;
    }

    return {
      '--kanban-column-color': column.color
    };
  }

  trackColumn = (_idx: number, col: KanbanColumn) => col.id;
  trackCard = (_idx: number, card: KanbanCard) => card.key;

  private subscribeToDatasource(): void {
    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = this.datasource.value.fetchInfo$.subscribe((info) => {
      const dataSourceRoute = this.datasource?.value?.route?.value || this.hardcodedRoute;
      if (!info?.metaInfo || (dataSourceRoute && info.metaInfo?.tableMetadata?.md_route_name && dataSourceRoute !== info.metaInfo.tableMetadata.md_route_name)) {
        return;
      }

      this.metaInfo = info.metaInfo;
      this.kanbanOptions = this.resolveKanbanOptions();
      void this.ensureLookupStatusColumnsLoaded();
      this.rebuildBoard();
      this.onKanbanDataBound.emit({
        metaInfo: this.metaInfo,
        columns: this.columns,
        unassignedCards: this.unassignedCards
      });
    });
  }

  subscribeToDS(): void {
    this.subscribeToDatasource();
  }

  private resolveKanbanOptions(): KanbanOptions {
    const current = this.metaInfo?.tableMetadata?.extraProps?.archetypes?.kanban || {};
    return this.normalizeKanbanOptions(current);
  }

  private normalizeKanbanOptions(raw: any): KanbanOptions {
    const options = Object.assign(new KanbanOptions(), raw || {});
    options.statusField = String(options.statusField || '').trim() || this.pickDefaultStatusField();
    options.colorField = String(options.colorField || '').trim();
    options.wipLimitField = String(options.wipLimitField || '').trim();
    options.wipLimitHardField = String(options.wipLimitHardField || '').trim();
    options.assignedUserIdField = String(options.assignedUserIdField || '').trim();
    options.titleField = String(options.titleField || '').trim() || this.pickDefaultTitleField();
    options.descriptionField = String(options.descriptionField || '').trim();
    options.cardSubtitleField = String(options.cardSubtitleField || '').trim();
    options.clickAction = (String(options.clickAction || 'detail').trim().toLowerCase() === 'edit') ? 'edit' : (String(options.clickAction || 'detail').trim().toLowerCase() === 'none' ? 'none' : 'detail');
    options.persistMode = String(options.persistMode || 'immediate').trim().toLowerCase() === 'batch' ? 'batch' : 'immediate';
    options.statusColumns = this.normalizeStatusColumns(options.statusColumns);
    return options;
  }

  private normalizeStatusColumns(raw: any): KanbanStatusColumn[] {
    const input = Array.isArray(raw) ? raw : [];
    return input
      .map((x: any, idx: number) => ({
        value: x?.value,
        label: String(x?.label || '').trim(),
        color: String(x?.color || '').trim(),
        order: Number.isFinite(Number(x?.order)) ? Number(x.order) : idx,
        wipLimit: Number.isFinite(Number(x?.wipLimit)) ? Number(x.wipLimit) : null,
        wipLimitHard: this.toBooleanLoose(x?.wipLimitHard)
      }))
      .filter((x) => x.value !== undefined && x.value !== null && String(x.value).trim() !== '');
  }

  private pickDefaultStatusField(): string {
    const columns = this.metaInfo?.columnMetadata || [];
    const byName = columns.find((c) => /status|state|stato/i.test(String(c?.mc_nome_colonna || '')));
    if (byName?.mc_nome_colonna) {
      return byName.mc_nome_colonna;
    }

    const preferred = columns.find((c) => ['dictionary', 'lookupByID', 'text'].includes(String(c?.mc_ui_column_type || '')));
    return String(preferred?.mc_nome_colonna || '');
  }

  private pickDefaultTitleField(): string {
    const columns = this.metaInfo?.columnMetadata || [];
    const byName = columns.find((c) => /title|name|nome|descr/i.test(String(c?.mc_nome_colonna || '')));
    if (byName?.mc_nome_colonna) {
      return byName.mc_nome_colonna;
    }

    const text = columns.find((c) => ['text', 'txt_area', 'textarea'].includes(String(c?.mc_ui_column_type || '').toLowerCase()));
    return String(text?.mc_nome_colonna || this.metaInfo?.pKey?.mc_nome_colonna || '');
  }

  private rebuildBoard(): void {
    this.warningMessage = '';
    this.columns = [];
    this.unassignedCards = [];

    void this.ensureLookupStatusColumnsLoaded();
    const data = Array.isArray(this.datasource?.value?.resultInfo?.dato)
      ? this.datasource.value.resultInfo.dato
      : [];

    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    if (!statusField) {
      this.warningMessage = this.t('kanban.error.status_field_required', 'Kanban: statusField is required');
      this.connectedDropListIds = [];
      return;
    }

    // ── Race-condition guard sotto lookup-driven mode (fix 2026-05-04). ──
    // Quando il payload NON ha `statusColumns` configurati e la colonna
    // statusField e' un `lookupByID`, le colonne vanno derivate dalla route
    // lookup (es. `wuic_kanban_status` → 4 status). Il caricamento e' async
    // (`ensureLookupStatusColumnsLoaded`).
    //
    // Se questo `rebuildBoard()` parte PRIMA che la lookup sia caricata
    // (race fra `getFlatRecordData` per i task e per la lookup), il fallback
    // auto-add a riga 470+ crea colonne basate sui SOLI status presenti nei
    // task attuali, "perdendo" gli status del catalog lookup che non hanno
    // alcun task corrispondente (tipico: status "In Progress" con 0 card al
    // primo render quando i task hanno solo {To Do, Review, Done}).
    //
    // Quando la lookup arriva, `ensureLookupStatusColumnsLoaded` chiama
    // di nuovo `rebuildBoard()` — ma in alcune circostanze l'Angular CD
    // (con `eventCoalescing:true` configurato in app.config.ts) non rifa il
    // diff completo del @for sulla nuova `this.columns`, lasciando il DOM
    // con la configurazione precedente (3 colonne invece di 4). Repro
    // deterministico: Playwright headless con context ephemeral
    // (`kanban-list--lookup-driven-status.mjs`).
    //
    // Fix: in lookup-driven mode marchiamo il flag e lo controlleremo nel
    // data.forEach a riga 470+: invece di auto-add columns dai task statuses,
    // mettiamo TUTTI i cards in unassigned. La lookup-completion handler
    // chiama `rebuildBoard()` esplicitamente (vedi linea 971), che produrra'
    // il render finale con le colonne corrette + cards ricollocate.
    // Non si esce early da rebuildBoard: il kanban-board deve renderizzare
    // l'unassigned column subito (canRender richiede columns.length>0 OR
    // unassignedCards.length>0).
    const configuredStatusColumns = Array.isArray(this.kanbanOptions?.statusColumns)
      ? this.kanbanOptions.statusColumns
      : [];
    const isLookupDrivenMode = configuredStatusColumns.length === 0
      && this.getStatusMeta()?.mc_ui_column_type === 'lookupByID';
    const lookupColumnsReady = (this.lookupDerivedStatusColumns?.length ?? 0) > 0;
    const skipAutoAddFromTasks = isLookupDrivenMode && !lookupColumnsReady;

    const columnByKey = new Map<string, KanbanColumn>();

    this.getEffectiveStatusColumns()
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .forEach((cfg, idx) => {
        const key = this.toStatusKey(cfg.value);
        columnByKey.set(key, {
          id: `kanban-col-${idx}-${key}`,
          value: cfg.value,
          label: String(cfg.label || cfg.value),
          color: cfg.color || '',
          order: Number(cfg.order || idx),
          wipLimit: cfg.wipLimit,
          wipLimitHard: !!(cfg as any)?.wipLimitHard,
          cards: []
        });
      });

    data.forEach((record, idx) => {
      const statusValue = record?.[statusField];
      const statusKey = this.toStatusKey(statusValue);
      const isUnassigned = statusKey === '__empty__';
      // skipAutoAddFromTasks: lookup-driven mode + lookup non ancora caricato
      // → niente auto-add fallback (rischio di "perdere" status del catalog
      // lookup non rappresentati nei task → race fix). Mettiamo i card in
      // unassigned; il rebuild post-lookup li ricollochera' nella colonna
      // corretta (anche se solo 50ms dopo).
      const shouldAutoAdd = !isUnassigned && !skipAutoAddFromTasks && !columnByKey.has(statusKey);
      if (shouldAutoAdd) {
        columnByKey.set(statusKey, {
          id: `kanban-col-auto-${columnByKey.size}-${statusKey}`,
          value: statusValue,
          label: this.resolveStatusLabel(record, statusValue),
          color: '',
          order: 1000 + columnByKey.size,
          wipLimit: null,
          wipLimitHard: false,
          cards: []
        });
      }

      const card: KanbanCard = {
        key: this.getCardKey(record, idx),
        record,
        statusValue,
        title: this.getCardFieldValue(record, this.kanbanOptions.titleField),
        subtitle: this.getCardFieldValue(record, this.kanbanOptions.cardSubtitleField),
        description: this.getCardFieldValue(record, this.kanbanOptions.descriptionField),
        assignedUserLabel: this.resolveAssignedUserLabel(record)
      };

      // In skipAutoAddFromTasks mode, i card con status non-null che NON
      // hanno gia' una colonna (perche' il lookup non c'e' ancora) finiscono
      // temporaneamente in unassigned. Il rebuild post-lookup li sposta.
      if (isUnassigned || (skipAutoAddFromTasks && !columnByKey.has(statusKey))) {
        this.unassignedCards.push(card);
      } else {
        columnByKey.get(statusKey)!.cards.push(card);
      }
    });

    this.columns = [...columnByKey.values()].sort((a, b) => a.order - b.order);
    this.connectedDropListIds = [this.unassignedDropListId, ...this.columns.map((c) => c.id)];
  }

  private toStatusKey(value: any): string {
    if (value === undefined || value === null || String(value).trim() === '') {
      return '__empty__';
    }
    return String(value);
  }

  private getCardKey(record: any, index: number): string {
    const pkeyName = String(this.metaInfo?.pKey?.mc_nome_colonna || '').trim();
    const pkey = pkeyName ? record?.[pkeyName] : null;
    if (pkey !== undefined && pkey !== null && String(pkey).trim() !== '') {
      return String(pkey);
    }

    if (record?.__guid) {
      return String(record.__guid);
    }

    return `row-${index}`;
  }

  private getCardFieldValue(record: any, fieldName: string): string {
    const key = String(fieldName || '').trim();
    if (!key) {
      return '';
    }
    const raw = record?.[key];
    return raw === undefined || raw === null ? '' : String(raw);
  }

  private resolveStatusLabel(record: any, statusValue: any): string {
    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    const statusMeta = this.getStatusMeta();

    if (statusMeta?.mc_ui_column_type === 'lookupByID') {
      const lookupObj = record?.[`${statusField}__lookup_obj`];
      const textField = String(statusMeta?.mc_ui_lookup_dataTextField || statusMeta?.mc_ui_grid_display_field || '').trim();
      if (lookupObj && typeof lookupObj === 'object') {
        const text = textField ? lookupObj?.[textField] : (lookupObj?.label || lookupObj?.name || lookupObj?.description);
        if (text !== undefined && text !== null && String(text).trim() !== '') {
          return String(text);
        }
      }

      const aliasKey = `${String(statusMeta?.mc_ui_lookup_entity_name || '').replaceAll(' ', '_')}___${String(statusMeta?.mc_ui_lookup_dataTextField || '').trim()}__${statusField}`;
      const alias = record?.[aliasKey];
      if (alias !== undefined && alias !== null && String(alias).trim() !== '') {
        return String(alias);
      }
    }

    if (statusMeta?.mc_ui_column_type === 'dictionary' || statusMeta?.mc_ui_column_type === 'dictionary_radio') {
      const map = this.parseDictionaryMap(statusMeta?.mc_dictionary_value);
      const hit = map.get(String(statusValue));
      if (hit) {
        return hit;
      }
    }

    return statusValue === undefined || statusValue === null || String(statusValue).trim() === ''
      ? this.t('kanban.empty', '(empty)')
      : String(statusValue);
  }

  private resolveAssignedUserLabel(record: any): string {
    const fieldName = String(this.kanbanOptions?.assignedUserIdField || '').trim();
    if (!fieldName) {
      return '';
    }

    const meta = (this.metaInfo?.columnMetadata || []).find((c) => c?.mc_nome_colonna === fieldName);
    if (!meta) {
      const raw = record?.[fieldName];
      return raw === undefined || raw === null || String(raw).trim() === '' ? '' : String(raw);
    }

    if (String(meta?.mc_ui_column_type || '') === 'lookupByID') {
      const lookupObj = record?.[`${fieldName}__lookup_obj`];
      const textField = String(meta?.mc_ui_lookup_dataTextField || meta?.mc_ui_grid_display_field || '').trim();
      if (lookupObj && typeof lookupObj === 'object') {
        const text = textField ? lookupObj?.[textField] : (lookupObj?.label || lookupObj?.name || lookupObj?.description);
        if (text !== undefined && text !== null && String(text).trim() !== '') {
          return String(text);
        }
      }

      const aliasKey = `${String(meta?.mc_ui_lookup_entity_name || '').replaceAll(' ', '_')}___${String(meta?.mc_ui_lookup_dataTextField || '').trim()}__${fieldName}`;
      const alias = record?.[aliasKey];
      if (alias !== undefined && alias !== null && String(alias).trim() !== '') {
        return String(alias);
      }
    }

    const raw = record?.[fieldName];
    return raw === undefined || raw === null || String(raw).trim() === '' ? '' : String(raw);
  }

  private parseDictionaryMap(dictionaryValue: any): Map<string, string> {
    const map = new Map<string, string>();
    const raw = String(dictionaryValue || '').trim();
    if (!raw) {
      return map;
    }

    raw.split('||').forEach((chunk) => {
      const parts = chunk.split('@@');
      const key = String(parts[0] || '').trim();
      const value = String(parts[1] || parts[0] || '').trim();
      if (key) {
        map.set(key, value);
      }
    });

    return map;
  }

  private getStatusMeta(): MetadatiColonna | undefined {
    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    return (this.metaInfo?.columnMetadata || []).find((c) => c?.mc_nome_colonna === statusField);
  }

  private applyCardStatus(card: KanbanCard, statusValue: any): void {
    card.statusValue = statusValue;
    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    if (statusField) {
      card.record[statusField] = statusValue;
    }
  }

  private registerPendingChange(card: KanbanCard, fromStatus: any, toStatus: any): void {
    const existing = this.pendingChanges.get(card.key);
    if (existing) {
      existing.toStatus = toStatus;
      if (String(existing.fromStatus) === String(existing.toStatus)) {
        this.pendingChanges.delete(card.key);
      }
      return;
    }

    this.pendingChanges.set(card.key, {
      cardKey: card.key,
      record: card.record,
      fromStatus,
      toStatus
    });
  }

  private async persistCardStatusChange(card: KanbanCard, previousStatus: any, nextStatus: any): Promise<boolean> {
    const ds = this.datasource?.value;
    const statusField = String(this.kanbanOptions?.statusField || '').trim();
    if (!ds || !statusField) {
      return true;
    }

    try {
      // Use datasource current-record flow so changeTracking can produce __changes payload.
      ds.setCurrent(card.record);
      const observable = ds.resultInfo?.current || ds.getObservable(card.record);
      const pristine = ds.pristine ? { ...ds.pristine } : this.buildPristineRow(card.record);
      pristine[statusField] = previousStatus;

      if (observable?.[statusField]) {
        observable[statusField].next(nextStatus);
      }

      const result = await ds.syncData(observable, pristine, false);
      if (!result) {
        throw new Error(this.t('kanban.error.sync_data_null', 'syncData returned null'));
      }

      return true;
    } catch (err) {
      WtoolboxService.errorHandler.handleError(err);
      return false;
    }
  }

  private buildPristineRow(record: any): any {
    const out: any = {};
    (this.metaInfo?.columnMetadata || []).forEach((col) => {
      out[col.mc_nome_colonna] = record?.[col.mc_nome_colonna];
    });
    return out;
  }

  private findCardByKey(cardKey: string): KanbanCard | null {
    for (const col of this.columns) {
      const match = col.cards.find((c) => c.key === cardKey);
      if (match) {
        return match;
      }
    }
    return null;
  }

  private checkWipLimit(column: KanbanColumn): void {
    const limit = Number(column?.wipLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      return;
    }

    if (!this.isWipExceeded(column, 0)) {
      return;
    }

    const mode = column?.wipLimitHard ? 'hard' : 'soft';
    WtoolboxService.messageNotificationService.add({
      severity: 'warn',
      summary: this.t('kanban.summary', 'Kanban'),
      detail: this.trslSrv.format(
        this.t('kanban.wip_limit_exceeded_{0}_{1}', 'WIP {0} limit exceeded for {1}'),
        mode,
        column.label
      )
    });
  }

  private isWipExceeded(column: KanbanColumn, additionalCards: number): boolean {
    const limit = Number(column?.wipLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      return false;
    }

    const current = Number(column?.cards?.length || 0);
    return (current + Math.max(0, additionalCards)) > limit;
  }

  private toBooleanLoose(value: any): boolean {
    if (value === true || value === false) {
      return value;
    }

    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
  }

  private getLookupFieldValue(row: any, fieldName: string): any {
    if (!row || typeof row !== 'object') {
      return undefined;
    }

    const wanted = String(fieldName || '').trim();
    if (!wanted) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(row, wanted)) {
      return row[wanted];
    }

    const keys = Object.keys(row);
    const wantedLower = wanted.toLowerCase();
    const byCase = keys.find((k) => String(k).toLowerCase() === wantedLower);
    if (byCase) {
      return row[byCase];
    }

    const normalize = (v: string) => String(v || '').replace(/[\s_\-]/g, '').toLowerCase();
    const wantedNormalized = normalize(wanted);
    const byNormalized = keys.find((k) => normalize(k) === wantedNormalized);
    if (byNormalized) {
      return row[byNormalized];
    }

    return undefined;
  }

  private normalizeColorValue(value: any): string {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'object') {
      const hasHsbShape =
        value?.h !== undefined &&
        value?.s !== undefined &&
        value?.b !== undefined;
      if (hasHsbShape) {
        return this.hsbToRgbaCss(value?.h, value?.s, value?.b, value?.a);
      }

      const candidate =
        value?.hex ??
        value?.Hex ??
        value?.color ??
        value?.Color ??
        value?.value ??
        value?.Value ??
        null;
      if (candidate !== undefined && candidate !== null) {
        return String(candidate).trim();
      }
    }

    return String(value).trim();
  }

  private hsbToRgbaCss(hRaw: any, sRaw: any, bRaw: any, aRaw: any): string {
    const h = Number(hRaw);
    const s = Number(sRaw);
    const v = Number(bRaw);
    let a = Number(aRaw);

    if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(v)) {
      return '';
    }

    const hh = ((h % 360) + 360) % 360;
    const ss = Math.max(0, Math.min(100, s)) / 100;
    const vv = Math.max(0, Math.min(100, v)) / 100;
    if (!Number.isFinite(a)) {
      a = 1;
    }
    a = Math.max(0, Math.min(1, a));

    const c = vv * ss;
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
    const m = vv - c;

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;

    if (hh < 60) {
      r1 = c; g1 = x; b1 = 0;
    } else if (hh < 120) {
      r1 = x; g1 = c; b1 = 0;
    } else if (hh < 180) {
      r1 = 0; g1 = c; b1 = x;
    } else if (hh < 240) {
      r1 = 0; g1 = x; b1 = c;
    } else if (hh < 300) {
      r1 = x; g1 = 0; b1 = c;
    } else {
      r1 = c; g1 = 0; b1 = x;
    }

    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  private ensureMergedExtraProps(): any {
    const currentExtra: any = this.metaInfo?.tableMetadata?.extraProps || {};
    let propsFromBag: any = {};
    try {
      propsFromBag = JSON.parse(this.metaInfo?.tableMetadata?.md_props_bag || '{}') || {};
    } catch {
      propsFromBag = {};
    }

    const merged = Object.assign({}, propsFromBag, currentExtra);
    const bagArch = propsFromBag?.archetypes || {};
    const curArch = currentExtra?.archetypes || {};
    merged.archetypes = Object.assign({}, bagArch, curArch);

    return merged;
  }

  private getEffectiveStatusColumns(): KanbanStatusColumn[] {
    const configured = Array.isArray(this.kanbanOptions?.statusColumns) ? this.kanbanOptions.statusColumns : [];
    if (configured.length > 0) {
      return configured;
    }

    return this.lookupDerivedStatusColumns || [];
  }

  private async ensureLookupStatusColumnsLoaded(): Promise<void> {
    const configured = Array.isArray(this.kanbanOptions?.statusColumns) ? this.kanbanOptions.statusColumns : [];
    if (configured.length > 0) {
      this.lookupDerivedStatusColumns = [];
      this.lookupColumnsLoadedKey = '';
      return;
    }

    const statusMeta = this.getStatusMeta();
    if (statusMeta?.mc_ui_column_type !== 'lookupByID') {
      this.lookupDerivedStatusColumns = [];
      this.lookupColumnsLoadedKey = '';
      return;
    }

    const lookupRoute = String(statusMeta?.mc_ui_lookup_entity_name || '').trim();
    const valueField = String(statusMeta?.mc_ui_lookup_dataValueField || '').trim();
    const textField = String(statusMeta?.mc_ui_lookup_dataTextField || '').trim();
    const colorField = String(this.kanbanOptions?.colorField || '').trim();
    const wipLimitField = String(this.kanbanOptions?.wipLimitField || '').trim();
    const wipLimitHardField = String(this.kanbanOptions?.wipLimitHardField || '').trim();
    const cacheKey = `${String(this.kanbanOptions?.statusField || '').trim()}|${lookupRoute}|${valueField}|${textField}|${colorField}|${wipLimitField}|${wipLimitHardField}`;

    if (!lookupRoute || !valueField) {
      this.lookupDerivedStatusColumns = [];
      this.lookupColumnsLoadedKey = '';
      return;
    }

    if (this.lookupColumnsLoadedKey === cacheKey || this.lookupColumnsLoading) {
      return;
    }

    this.lookupColumnsLoading = true;
    try {
      const rows: any[] = [];
      let currentPage = 1;
      const pageSize = 1000;
      while (true) {
        const page = await this.dataProviderSrv.selectByRoute(lookupRoute, [], [], pageSize, currentPage);
        const data = Array.isArray(page?.dato) ? page.dato : [];
        rows.push(...data);

        const total = Number(page?.totalRowCount || 0);
        if (!data.length || data.length < pageSize || (total > 0 && rows.length >= total)) {
          break;
        }
        currentPage += 1;
      }

      const seen = new Set<string>();
      const normalized = rows
        .map((row: any, idx: number) => {
          const value = this.getLookupFieldValue(row, valueField);
          if (value === undefined || value === null || String(value).trim() === '') {
            return null;
          }

          const valueKey = String(value);
          if (seen.has(valueKey)) {
            return null;
          }
          seen.add(valueKey);

          const labelCandidate = textField ? this.getLookupFieldValue(row, textField) : undefined;
          const label = labelCandidate === undefined || labelCandidate === null || String(labelCandidate).trim() === ''
            ? String(value)
            : String(labelCandidate);

          const colorFromLookup = colorField ? this.getLookupFieldValue(row, colorField) : null;
          const normalizedColor = this.normalizeColorValue(colorFromLookup);
          const color = normalizedColor === ''
            ? this.defaultStatusColors[idx % this.defaultStatusColors.length]
            : normalizedColor;
          const rawWipLimit = wipLimitField ? this.getLookupFieldValue(row, wipLimitField) : null;
          const parsedWipLimit = Number(rawWipLimit);
          const wipLimit = Number.isFinite(parsedWipLimit) && parsedWipLimit > 0 ? Math.trunc(parsedWipLimit) : null;
          const rawWipLimitHard = wipLimitHardField ? this.getLookupFieldValue(row, wipLimitHardField) : null;
          const wipLimitHard = this.toBooleanLoose(rawWipLimitHard);

          return {
            value,
            label,
            color,
            order: idx,
            wipLimit,
            wipLimitHard
          } as KanbanStatusColumn;
        })
        .filter((x): x is KanbanStatusColumn => !!x);

      this.lookupDerivedStatusColumns = normalized;
      this.lookupColumnsLoadedKey = cacheKey;
      this.rebuildBoard();
    } catch (err) {
      this.lookupDerivedStatusColumns = [];
      this.lookupColumnsLoadedKey = '';
      WtoolboxService.errorHandler.handleError(err);
    } finally {
      this.lookupColumnsLoading = false;
    }
  }
}

