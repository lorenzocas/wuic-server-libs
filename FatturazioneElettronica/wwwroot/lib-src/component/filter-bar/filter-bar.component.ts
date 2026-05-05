import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { MetaInfo } from '../../class/metaInfo';
import { MetadataProviderService } from '../../service/metadata-provider.service';
import { DeviceAwarenessService } from '../../service/device-awareness.service';
import { AsyncPipe } from '@angular/common';
import { BehaviorSubject, Subscription } from 'rxjs';
import { DataSourceComponent } from '../data-source/data-source.component';
import { MetadatiColonna } from '../../class/metadati_colonna';
import { ButtonModule } from 'primeng/button';
import { TranslateModule } from '@ngx-translate/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location, NgClass, NgTemplateOutlet } from '@angular/common';
import { GroupInfo } from '../../class/groupInfo';
import { AggregationInfo } from '../../class/aggregationInfo';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { FormsModule } from '@angular/forms';
import { FieldFilterComponent } from '../field/field-filter/field-filter.component';
import { SortInfo } from '../../class/sortInfo';
import { FilterInfo } from '../../class/filterInfo';
import { DialogModule } from 'primeng/dialog';
import { AvailableOperatorsPipe } from '../../pipe/available-operators.pipe';
import { TranslationManagerService } from '../../service/translation-manager.service';

type AdvancedLogic = 'AND' | 'OR';

interface AdvancedFilterGroup {
  logic: AdvancedLogic;
  filters: AdvancedFilterNode[];
}

interface AdvancedFilterRule {
  field: string;
  operatore: string;
  value: any;
  fixed?: boolean;
  __metaColumn?: MetadatiColonna;
  __extra?: boolean;
  __descriptorManaged?: boolean;
  __querystring?: boolean;
  __advRuleId?: number;
}

type AdvancedFilterNode = AdvancedFilterRule | { nestedFilters: AdvancedFilterGroup };

export interface MultiDatasourceMeta {
  tableAlias: string;
  tableCaption: string;
  metaInfo: MetaInfo;
}

@Component({
  selector: 'wuic-filter-bar',
  imports: [FieldFilterComponent, ButtonModule, TranslateModule, Tabs, TabList, Tab, TabPanels, TabPanel, SelectModule, FormsModule, NgTemplateOutlet, NgClass, DialogModule, AvailableOperatorsPipe, AsyncPipe],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.css'
})
export class FilterBarComponent implements OnInit, OnChanges, OnDestroy {
  @Input() datasource: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedDatasource: DataSourceComponent;
  @Input() multiDatasourceMetas: MultiDatasourceMeta[] = [];
  /**
   * When true, skip writing `filterInfo` / `sortInfo` / `pageInfo` to the URL
   * query string (via `syncGridStateQueryString`). Use in contexts where the
   * filter-bar is embedded inside another route (e.g. pivot-builder View
   * Builder / Pivot Config) and pushing its state to `?filterInfo=...` is
   * undesirable — it would collide with the host's own URL state and lead to
   * a bloated, unreadable URL with duplicated filter serializations.
   */
  @Input() skipUrlSync = false;
  /**
   * Quando true, il filter-bar non lancia `datasource.value.fetchData()` (e
   * quindi nessuna `MetaService.getFlatRecordData`) sugli apply* — emette solo
   * gli output. Usato dal pivot-builder dove il `nestedSource` non rappresenta
   * una grid visibile: la SQL preview viene rigenerata via
   * `previewViewDefinition` come reazione agli output, niente fetch sul route.
   */
  @Input() skipFetch = false;
  @Output() filterApplied = new EventEmitter<void>();
  @Output() onFilterApplied = new EventEmitter<{ mode: 'basic' | 'advanced' | 'clear'; filterInfo: FilterInfo | null }>();
  @Output() onSortingApplied = new EventEmitter<{ sortInfo: SortInfo[] }>();
  @Output() onPageSizeApplied = new EventEmitter<{ pageSize: number; currentPage: number }>();
  @Output() onGroupingChanged = new EventEmitter<{ groupInfo: GroupInfo[]; aggregationInfo: AggregationInfo[]; action: 'addGroup' | 'addAggregate' | 'clear' }>();
  @Output() onFilterBarCollapseChanged = new EventEmitter<{ collapsed: boolean }>();

  filterDescriptor: { [key: string]: BehaviorSubject<any> };
  metas: MetadatiColonna[];
  metaInfo: MetaInfo;

  selectedGroupColumn: MetadatiColonna;
  selectedAggregateColumn: MetadatiColonna;
  aggregations: { label: string; value: string; }[];
  selectedAggregation: string;
  selectedSortColumn: MetadatiColonna;
  selectedSortDir: 'asc' | 'desc' = 'asc';
  sortDirections: { label: string; value: 'asc' | 'desc'; }[];
  pageSize: number = 10;
  pageSizeOptions: { label: string; value: number; }[] = [];
  cursorMode: boolean = false;
  isCollapsed = true;
  hasExpandedOnce = false;

  activeTab = 0;
  advancedFilterPopupVisible = false;
  advancedFilter: AdvancedFilterGroup = { logic: 'AND', filters: [] };
  appliedAdvancedFilterDescription = '';
  private readonly noAppliedFilterResource = 'advanced_filter.none_applied';
  advancedOperators: any[];
  advancedLogicOptions: { label: string; value: AdvancedLogic; }[] = [
    { label: 'AND', value: 'AND' },
    { label: 'OR', value: 'OR' }
  ];

  private datasourceSubscription?: Subscription;
  private fetchInfoSubscription?: Subscription;
  private boundDatasource?: DataSourceComponent;
  private advancedStateHydrated = false;
  private advancedRuleFieldStateById = new Map<number, {
    fieldName: string;
    record: { [key: string]: BehaviorSubject<any>; };
    field: MetadatiColonna;
    sub: Subscription;
    sourceField: string;
  }>();
  private nextAdvancedRuleId = 0;

  constructor(
    private router: Router,
    private aroute: ActivatedRoute,
    private location: Location,
    private trnsl: TranslationManagerService,
    public deviceAwareness: DeviceAwarenessService
  ) { }

  ngOnInit(): void {
    if (this.multiDatasourceMetas?.length) {
      this.mergeMultiDatasourceColumns();
    } else {
      this.bindToDatasource();
    }
    if (!this.isCollapsed) {
      this.hasExpandedOnce = true;
    }

    this.aggregations = [
      { label: 'SUM', value: 'SUM' },
      { label: 'AVG', value: 'AVG' },
      { label: 'MIN', value: 'MIN' },
      { label: 'MAX', value: 'MAX' },
      { label: 'COUNT', value: 'COUNT' }
    ];

    this.sortDirections = [
      { label: 'ASC', value: 'asc' },
      { label: 'DESC', value: 'desc' }
    ];

    this.advancedOperators = MetadataProviderService.widgetDefinition.filterOperators;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.multiDatasourceMetas?.length) {
      this.mergeMultiDatasourceColumns();
      return;
    }
    if (changes['datasource'] || changes['hardcodedDatasource']) {
      this.bindToDatasource();
    }
  }

  private mergeMultiDatasourceColumns(): void {
    const merged: MetadatiColonna[] = [];
    const mergedFilterDescriptor: { [key: string]: BehaviorSubject<any> } = {};
    const mergedOperators: { [key: string]: string } = {};

    for (const dsMeta of this.multiDatasourceMetas) {
      for (const col of dsMeta.metaInfo.columnMetadata) {
        if (!this.isFilterable(col)) continue;

        const qualifiedField = `${dsMeta.tableAlias}.${col.mc_nome_colonna}`;
        const qualifiedLabel = `${dsMeta.tableCaption}.${col.mc_display_string_in_view || col.mc_nome_colonna}`;

        const cloned = new MetadatiColonna(qualifiedField);
        Object.assign(cloned, col);
        cloned.mc_nome_colonna = qualifiedField;
        cloned.mc_display_string_in_view = qualifiedLabel;
        cloned.mc_show_in_filters = true;

        merged.push(cloned);
        mergedFilterDescriptor[qualifiedField] = new BehaviorSubject<any>(null);

        const opKey = col.mc_nome_colonna;
        if (dsMeta.metaInfo.operators?.[opKey]) {
          mergedOperators[qualifiedField] = dsMeta.metaInfo.operators[opKey];
        }
      }
    }

    this.metas = merged;
    this.filterDescriptor = mergedFilterDescriptor;

    const syntheticMetaInfo = new MetaInfo();
    if (this.multiDatasourceMetas.length > 0) {
      syntheticMetaInfo.tableMetadata = this.multiDatasourceMetas[0].metaInfo.tableMetadata;
    }
    syntheticMetaInfo.columnMetadata = merged;
    syntheticMetaInfo.operators = mergedOperators;
    this.metaInfo = syntheticMetaInfo;
  }

  get isMultiDatasourceMode(): boolean {
    return this.multiDatasourceMetas?.length > 0;
  }

  ngOnDestroy(): void {
    this.datasourceSubscription?.unsubscribe();
    this.fetchInfoSubscription?.unsubscribe();
    this.clearAllAdvancedRuleFieldStates();
  }

  private bindToDatasource(): void {
    this.datasourceSubscription?.unsubscribe();
    this.datasourceSubscription = undefined;

    if (this.hardcodedDatasource) {
      this.datasource = new BehaviorSubject(this.hardcodedDatasource);
      this.subscribeToDatasource();
      return;
    }

    if (this.datasource?.value) {
      this.subscribeToDatasource();
      return;
    }

    this.datasourceSubscription = this.datasource?.subscribe((ds) => {
      if (ds) {
        this.subscribeToDatasource();
      }
    });
  }

  private subscribeToDatasource(): void {
    if (!this.datasource?.value) {
      return;
    }

    if (!this.datasource.value.fetchInfo$ && this.datasource.value['value']?.fetchInfo$) {
      this.datasource.next(this.datasource.value['value']);
    }

    const currentDs = this.datasource.value;
    if (!currentDs?.fetchInfo$ || this.boundDatasource === currentDs) {
      return;
    }

    this.boundDatasource = currentDs;
    this.advancedStateHydrated = false;
    this.fetchInfoSubscription?.unsubscribe();
    this.fetchInfoSubscription = currentDs.fetchInfo$.subscribe((info) => {
      if (info && info.metaInfo && info.metaInfo.columnMetadata.length > 0) {
        this.filterDescriptor = info.filterDescriptor;
        this.metas = info.metaInfo.columnMetadata.filter((col) => this.isFilterable(col));
        this.metaInfo = info.metaInfo;
        this.cursorMode = !!this.datasource?.value?.cursorMode;
        this.pageSize = Math.max(1, Number(this.datasource?.value?.pageSize || this.metaInfo.tableMetadata?.md_pagesize || 10));
        this.pageSizeOptions = this.buildPageSizeOptions(this.getTotalForPageSize(info.resultInfo), this.pageSize);
        if (!this.advancedStateHydrated) {
          this.ensureAdvancedStateFromDatasource();
          this.advancedStateHydrated = true;
        }
      }
    });
  }

  private isFilterable(col: MetadatiColonna & { isfilterable?: boolean; isFilterable?: boolean; }): boolean {
    return !!(col?.mc_show_in_filters || col?.isfilterable || col?.isFilterable);
  }

  async filter() {
    // Multi-datasource mode: build FilterInfo from merged descriptor and emit
    if (this.isMultiDatasourceMode) {
      const filterInfo = this.buildMultiDatasourceFilterInfo();
      this.onFilterApplied.emit({ mode: 'basic', filterInfo });
      this.filterApplied.emit();
      return;
    }

    this.switchToBasicFilterMode();

    // Re-iniettare i valori basic typed dall'utente DENTRO `filterInfo` PRIMA
    // della fetchData. Senza, fetchData rileva il ref di filterInfo cambiato
    // (switchToBasicFilterMode ha appena assegnato un new FilterInfo) e chiama
    // `applyFilterInfoToFilterDescriptor`, che resetta TUTTI i descriptor a null
    // e ri-applica solo da filterInfo (che a quel punto ha solo geoFilters).
    // Risultato senza questo blocco: CityName/StateProvinceID/... vengono persi
    // e il filtro non viene mai applicato. Vedi data-source.component.ts:1948 +
    // applyFilterInfoToFilterDescriptor (550-573).
    if (this.metas && this.filterDescriptor && this.datasource?.value?.filterInfo) {
      for (const meta of this.metas) {
        const fieldName = meta.mc_nome_colonna;
        const val = this.filterDescriptor[fieldName]?.value;
        if (val !== null && val !== undefined && val !== '') {
          const op = this.metaInfo?.operators?.[fieldName] || 'contains';
          (this.datasource.value.filterInfo.filters as any[]).push({
            field: fieldName,
            operatore: op,
            value: val,
            __descriptorManaged: true
          });
        }
      }
    }

    this.resetCursorPagingState();
    this.datasource.value.currentPage = 1;

    const hasGeoCustomFilter = !!this.datasource?.value?.filterInfo?.filters?.some(f => f?.operatore === 'maparea' || f?.operatore === 'mapdistance');

    if (hasGeoCustomFilter || this.datasource.value.metaInfo.tableMetadata.preventNavigateOnFilter) {
      if (!this.skipFetch) await this.datasource.value.fetchData();
      this.syncGridStateQueryString();
      this.filterApplied.emit();
      this.autoCollapseOnMobileAfterApply();
      return;
    }

    if (!this.skipFetch) await this.datasource.value.fetchData();
    this.syncGridStateQueryString();
    this.filterApplied.emit();
    this.onFilterApplied.emit({
      mode: 'basic',
      filterInfo: this.datasource.value.filterInfo || null
    });
    this.autoCollapseOnMobileAfterApply();
  }

  private buildMultiDatasourceFilterInfo(): FilterInfo {
    const filters: any[] = [];
    for (const meta of this.metas) {
      const qualifiedField = meta.mc_nome_colonna;
      const val = this.filterDescriptor?.[qualifiedField]?.value;
      if (val !== null && val !== undefined && val !== '') {
        const op = this.metaInfo?.operators?.[qualifiedField] || 'contains';
        filters.push({ field: qualifiedField, operatore: op, value: val });
      }
    }
    return new FilterInfo('AND', filters);
  }

  async clearFilter() {
    Object.keys(this.filterDescriptor).forEach((key) => {
      this.filterDescriptor[key].next(null);
    });

    if (this.datasource?.value?.filterInfo?.filters?.length) {
      this.datasource.value.filterInfo.filters = this.datasource.value.filterInfo.filters.filter((f) =>
        !(f.operatore === 'maparea' || f.operatore === 'mapdistance'));
    }

    this.advancedFilter = this.createEmptyAdvancedGroup();
    await this.filter();
    this.autoCollapseOnMobileAfterApply();
  }

  addGroupField() {
    this.datasource.value.groupInfo.push(new GroupInfo(this.selectedGroupColumn.mc_nome_colonna));
    this.onGroupingChanged.emit({
      groupInfo: this.datasource.value.groupInfo || [],
      aggregationInfo: this.datasource.value.aggregationInfo || [],
      action: 'addGroup'
    });
  }

  addAggregateField() {
    this.datasource.value.aggregationInfo.push(new AggregationInfo(this.selectedAggregateColumn.mc_nome_colonna, this.selectedAggregation));
    this.onGroupingChanged.emit({
      groupInfo: this.datasource.value.groupInfo || [],
      aggregationInfo: this.datasource.value.aggregationInfo || [],
      action: 'addAggregate'
    });
  }

  clearGroups() {
    this.datasource.value.groupInfo = [];
    this.datasource.value.aggregationInfo = [];
    this.onGroupingChanged.emit({
      groupInfo: [],
      aggregationInfo: [],
      action: 'clear'
    });
  }

  getSortLabel(sort: SortInfo): string {
    const col = this.metas?.find(x => x.mc_nome_colonna === sort.field);
    const caption = col?.mc_display_string_in_view || sort.field;
    return `${caption} (${(sort.dir || 'asc').toUpperCase()})`;
  }

  addSortField() {
    if (!this.datasource?.value || !this.selectedSortColumn?.mc_nome_colonna) {
      return;
    }

    if (!this.datasource.value.sortInfo) {
      this.datasource.value.sortInfo = [];
    }

    const field = this.selectedSortColumn.mc_nome_colonna;
    const existing = this.datasource.value.sortInfo.find(x => x.field === field);
    if (existing) {
      existing.dir = this.selectedSortDir || 'asc';
      return;
    }

    this.datasource.value.sortInfo.push({
      field,
      dir: this.selectedSortDir || 'asc',
      mc_id: this.selectedSortColumn.mc_id
    });
  }

  removeSortField(index: number) {
    if (!this.datasource?.value?.sortInfo || index < 0 || index >= this.datasource.value.sortInfo.length) {
      return;
    }

    this.datasource.value.sortInfo.splice(index, 1);
  }

  clearSorting() {
    this.datasource.value.sortInfo = [];
  }

  async applySorting() {
    this.resetCursorPagingState();
    this.datasource.value.currentPage = 1;
    if (!this.skipFetch) await this.datasource.value.fetchData();
    this.syncGridStateQueryString();
    this.onSortingApplied.emit({
      sortInfo: this.datasource.value.sortInfo || []
    });
  }

  isAdvancedGroup(node: AdvancedFilterNode): node is { nestedFilters: AdvancedFilterGroup } {
    return !!(node as any)?.nestedFilters && Array.isArray((node as any).nestedFilters.filters);
  }

  getRuleFields(): { label: string; value: string; }[] {
    const fields = Array.isArray(this.metas) ? this.metas : [];
    return fields.map((m) => ({
      label: m?.mc_display_string_in_view || m?.mc_nome_colonna,
      value: m?.mc_nome_colonna
    }));
  }

  addAdvancedRule(path: number[] = []): void {
    const group = this.getAdvancedGroupByPath(path);
    if (!group) {
      return;
    }

    const firstMeta = this.metas?.[0];
    const fieldName = firstMeta?.mc_nome_colonna || '';
    group.filters.push({
      field: fieldName,
      operatore: this.getDefaultOperatorForField(fieldName),
      value: null,
      __metaColumn: this.resolveMetaByField(fieldName)
    });
  }

  addAdvancedGroup(path: number[] = []): void {
    const group = this.getAdvancedGroupByPath(path);
    if (!group) {
      return;
    }

    group.filters.push({
      nestedFilters: this.createEmptyAdvancedGroup()
    });
  }

  removeAdvancedNode(path: number[], index: number): void {
    const group = this.getAdvancedGroupByPath(path);
    if (!group || index < 0 || index >= group.filters.length) {
      return;
    }
    this.releaseAdvancedNodeState(group.filters[index]);
    group.filters.splice(index, 1);
  }

  removeAdvancedGroup(path: number[]): void {
    if (!path.length) {
      this.advancedFilter = this.createEmptyAdvancedGroup();
      return;
    }

    const parentPath = path.slice(0, -1);
    const index = path[path.length - 1];
    this.removeAdvancedNode(parentPath, index);
  }

  getChildPath(path: number[], index: number): number[] {
    return [...path, index];
  }

  trackAdvancedNode(node: AdvancedFilterNode, index: number, path: number[]): string {
    const p = path.join('_');
    const field = this.isAdvancedGroup(node) ? '' : String(node?.field || '');
    const marker = this.isAdvancedGroup(node) ? 'g' : 'r';
    return `${p}_${index}_${marker}_${field}`;
  }

  onAdvancedRuleFieldChange(rule: AdvancedFilterRule | AdvancedFilterNode): void {
    if (!rule) {
      return;
    }
    if (this.isAdvancedGroup(rule as AdvancedFilterNode)) {
      return;
    }
    const typedRule = rule as AdvancedFilterRule;
    typedRule.__metaColumn = this.resolveMetaByField(typedRule.field);

    typedRule.operatore = this.getDefaultOperatorForField(typedRule.field);

    typedRule.value = null;
    this.releaseAdvancedRuleFieldState(typedRule);
  }

  getAdvancedRuleRecord(rule: AdvancedFilterRule): { [key: string]: BehaviorSubject<any>; } {
    return this.ensureAdvancedRuleFieldState(rule).record;
  }

  getAdvancedRuleMetaField(rule: AdvancedFilterRule): MetadatiColonna {
    const ensured = this.ensureAdvancedRuleFieldState(rule);
    return ensured.field;
  }

  async applyAdvancedFilter(): Promise<void> {
    if (this.isMultiDatasourceMode) {
      const filterInfo = this.toFilterInfo(this.advancedFilter);
      this.appliedAdvancedFilterDescription = this.describeAdvancedGroup(this.advancedFilter);
      this.onFilterApplied.emit({ mode: 'advanced', filterInfo });
      this.filterApplied.emit();
      return;
    }

    if (!this.datasource?.value) {
      return;
    }

    this.clearFilterDescriptorValues();
    this.datasource.value.filterInfo = this.toFilterInfo(this.advancedFilter);
    this.appliedAdvancedFilterDescription = this.describeAdvancedGroup(this.advancedFilter);

    this.resetCursorPagingState();
    this.datasource.value.currentPage = 1;
    if (!this.skipFetch) await this.datasource.value.fetchData();
    this.syncGridStateQueryString();
    this.filterApplied.emit();
    this.onFilterApplied.emit({
      mode: 'advanced',
      filterInfo: this.datasource.value.filterInfo || null
    });
  }

  async applyAdvancedFilterFromPopup(): Promise<void> {
    await this.applyAdvancedFilter();
    this.advancedFilterPopupVisible = false;
  }

  async clearAdvancedFilter(): Promise<void> {
    this.advancedFilter = this.createEmptyAdvancedGroup();
    this.appliedAdvancedFilterDescription = '';
    this.clearAllAdvancedRuleFieldStates();
    if (this.datasource?.value) {
      this.datasource.value.filterInfo = new FilterInfo('AND', []);
    }
    this.clearFilterDescriptorValues();

    this.resetCursorPagingState();
    this.datasource.value.currentPage = 1;
    if (!this.skipFetch) await this.datasource.value.fetchData();
    this.syncGridStateQueryString();
    this.filterApplied.emit();
    this.onFilterApplied.emit({
      mode: 'clear',
      filterInfo: this.datasource.value.filterInfo || null
    });
  }

  openAdvancedFilterPopup(): void {
    this.advancedFilterPopupVisible = true;
  }

  getAppliedAdvancedFilterDescription(): string {
    if (this.appliedAdvancedFilterDescription) {
      return this.appliedAdvancedFilterDescription;
    }

    const filterInfo: any = this.datasource?.value?.filterInfo;
    const hasFilters = Array.isArray(filterInfo?.filters) && filterInfo.filters.length > 0;
    if (!hasFilters) {
      return this.trnsl.instant(this.noAppliedFilterResource);
    }

    return this.describeAdvancedGroup(filterInfo);
  }

  private describeAdvancedGroup(raw: any): string {
    const logic = String(raw?.logic || raw?.logicOperator || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const nodes = Array.isArray(raw?.filters) ? raw.filters : [];
    const parts = nodes
      .map((node: any) => this.describeAdvancedNode(node))
      .filter((x: string) => !!x);

    if (!parts.length) {
      return this.trnsl.instant(this.noAppliedFilterResource);
    }

    if (parts.length === 1) {
      return parts[0];
    }

    return `(${parts.join(` ${logic} `)})`;
  }

  private describeAdvancedNode(node: any): string {
    if (!node) {
      return '';
    }

    if (node?.nestedFilters) {
      return this.describeAdvancedGroup(node.nestedFilters);
    }

    const fieldName = String(node.field || '').trim();
    const operator = String(node.operatore || node.operator || '').trim();
    const operatorLabel = this.getOperatorDisplayValue(operator);
    const value = node.value;

    const fieldLabel = this.getFieldLabelByName(fieldName);
    if (!operator) {
      return fieldLabel;
    }

    if (operator === 'isnull' || operator === 'isnotnull') {
      return `${fieldLabel} ${operatorLabel}`;
    }

    const valueLabel = this.resolveAdvancedNodeValueLabel(node, value);

    return `${fieldLabel} ${operatorLabel} ${valueLabel}`;
  }

  private getOperatorDisplayValue(operatorKey: string): string {
    const key = String(operatorKey || '').trim();
    if (!key) {
      return '';
    }

    const operators = Array.isArray(this.advancedOperators) ? this.advancedOperators : [];
    const match = operators.find((op: any) => String(op?.key || '').trim().toLowerCase() === key.toLowerCase());
    const display = String(match?.value || '').trim();
    return display || key;
  }

  private resolveAdvancedNodeValueLabel(node: any, value: any): string {
    const empty = value === null || value === undefined || String(value).trim() === '';
    if (empty) {
      return '(empty)';
    }

    const fieldMeta = this.resolveMetaByField(String(node?.field || ''));
    const fieldType = String(fieldMeta?.mc_ui_column_type || '').trim().toLowerCase();
    const isLookupLike = fieldType === 'lookupbyid' || fieldType === 'multiple_check';
    if (!isLookupLike) {
      return String(value);
    }

    const textField = String(
      fieldMeta?.mc_ui_lookup_dataTextField
      || fieldMeta?.mc_ui_grid_display_field
      || ''
    ).trim();

    const state = this.advancedRuleFieldStateById.get(Number(node?.__advRuleId || 0));
    const fieldName = state?.fieldName;
    const lookupObj = fieldName ? state?.record?.[`${fieldName}__lookup_obj`]?.value : null;

    const getText = (item: any): string => {
      if (!item || typeof item !== 'object') {
        return '';
      }
      if (textField) {
        const raw = item[textField];
        return raw === undefined || raw === null ? '' : String(raw);
      }

      const idField = String(fieldMeta?.mc_ui_lookup_dataValueField || fieldMeta?.mc_ui_grid_related_id_field || '').trim();
      const keys = Object.keys(item);

      const bySemanticKey = keys.find((k) => /name$|description$|label$|title$/i.test(k));
      if (bySemanticKey) {
        const raw = item[bySemanticKey];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
          return String(raw);
        }
      }

      const byStringValue = keys.find((k) => {
        if (k === idField || k.startsWith('__')) {
          return false;
        }
        const raw = item[k];
        return typeof raw === 'string' && raw.trim() !== '';
      });
      if (byStringValue) {
        return String(item[byStringValue]);
      }

      const byNonId = keys.find((k) => k !== idField && !k.startsWith('__'));
      if (byNonId) {
        const raw = item[byNonId];
        return raw === undefined || raw === null ? '' : String(raw);
      }

      return '';
    };

    if (Array.isArray(lookupObj)) {
      const labels = lookupObj
        .filter((x) => !(x && x.___deleted))
        .map((x) => getText(x))
        .filter((x) => !!x);
      if (labels.length) {
        return labels.join(', ');
      }
    } else {
      const label = getText(lookupObj);
      if (label) {
        return label;
      }
    }

    if (Array.isArray(value)) {
      const labels = value
        .map((x) => getText(x))
        .filter((x) => !!x);
      if (labels.length) {
        return labels.join(', ');
      }
      return value.map((x) => String(x)).join(', ');
    }

    if (value && typeof value === 'object') {
      const label = getText(value);
      if (label) {
        return label;
      }
    }

    return String(value);
  }

  private getFieldLabelByName(fieldName: string): string {
    if (!fieldName) {
      return '(field)';
    }

    const meta = (this.metas || []).find((m) => m?.mc_nome_colonna === fieldName);
    return String(meta?.mc_display_string_in_view || fieldName);
  }

  private switchToBasicFilterMode(): void {
    if (!this.datasource?.value) {
      return;
    }

    const existing = Array.isArray(this.datasource.value.filterInfo?.filters) ? this.datasource.value.filterInfo.filters : [];
    const geoFilters = existing
      .filter((f: any) => !f?.nestedFilters && (f?.operatore === 'maparea' || f?.operatore === 'mapdistance'))
      .map((f: any) => this.deepClone(f));

    this.datasource.value.filterInfo = new FilterInfo('AND', geoFilters as any);
    this.advancedFilter = this.createEmptyAdvancedGroup();
    this.clearAllAdvancedRuleFieldStates();
  }

  private ensureAdvancedStateFromDatasource(): void {
    if (!this.datasource?.value?.filterInfo) {
      this.advancedFilter = this.createEmptyAdvancedGroup();
      this.clearAllAdvancedRuleFieldStates();
      return;
    }

    const normalized = this.normalizeAdvancedGroup(this.datasource.value.filterInfo);
    this.advancedFilter = normalized;
    this.appliedAdvancedFilterDescription = this.describeAdvancedGroup(this.advancedFilter);
    this.clearAllAdvancedRuleFieldStates();
  }

  private createEmptyAdvancedGroup(): AdvancedFilterGroup {
    return { logic: 'AND', filters: [] };
  }

  private normalizeAdvancedGroup(raw: any): AdvancedFilterGroup {
    const logic: AdvancedLogic = String(raw?.logic || raw?.logicOperator || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
    const filtersRaw = Array.isArray(raw?.filters) ? raw.filters : [];
    const filters = filtersRaw
      .map((node: any) => this.normalizeAdvancedNode(node))
      .filter((node: AdvancedFilterNode | null) => !!node) as AdvancedFilterNode[];
    return { logic, filters };
  }

  private normalizeAdvancedNode(raw: any): AdvancedFilterNode | null {
    if (!raw) {
      return null;
    }

    if (raw?.nestedFilters && Array.isArray(raw.nestedFilters.filters)) {
      return {
        nestedFilters: this.normalizeAdvancedGroup(raw.nestedFilters)
      };
    }

    if (typeof raw?.field !== 'string') {
      return null;
    }

    const fieldName = String(raw.field);
    return {
      field: fieldName,
      operatore: String(raw.operatore ?? raw.operator ?? this.getDefaultOperatorForField(fieldName)),
      value: raw.value ?? null,
      fixed: !!raw.fixed,
      __metaColumn: this.resolveMetaByField(fieldName),
      __extra: !!raw.__extra,
      __descriptorManaged: !!raw.__descriptorManaged,
      __querystring: !!raw.__querystring
    };
  }

  private ensureAdvancedRuleFieldState(rule: AdvancedFilterRule): {
    fieldName: string;
    record: { [key: string]: BehaviorSubject<any>; };
    field: MetadatiColonna;
    sub: Subscription;
    sourceField: string;
  } {
    const sourceMeta = this.resolveMetaByField(rule?.field);
    rule.__metaColumn = sourceMeta;
    const sourceFieldName = String(rule?.field || '');
    const ruleId = this.getAdvancedRuleId(rule);

    let state = this.advancedRuleFieldStateById.get(ruleId);
    if (state && state.sourceField === sourceFieldName && sourceMeta) {
      const subject = state.record[state.fieldName];
      if (subject && subject.value !== rule.value) {
        subject.next(rule.value ?? null);
      }
      return state;
    }

    if (state) {
      state.sub?.unsubscribe();
      this.advancedRuleFieldStateById.delete(ruleId);
    }

    const fieldName = `__advanced_rule_value_${ruleId}`;
    const record: { [key: string]: BehaviorSubject<any>; } = {};
    record[fieldName] = new BehaviorSubject<any>(rule.value ?? null);
    const isLookupLike = sourceMeta?.mc_ui_column_type === 'lookupByID' || sourceMeta?.mc_ui_column_type === 'multiple_check';
    if (isLookupLike) {
      const lookupObjKey = `${fieldName}__lookup_obj`;
      const operator = String(rule?.operatore || '').toLowerCase();
      const initialLookupValue = operator === 'eqor' || sourceMeta?.mc_ui_column_type === 'multiple_check' ? [] : null;
      record[lookupObjKey] = new BehaviorSubject<any>(initialLookupValue);
    }

    const cloned = new MetadatiColonna(fieldName);
    if (sourceMeta) {
      Object.assign(cloned, sourceMeta);
    }
    cloned.mc_nome_colonna = fieldName;
    cloned.mc_display_string_in_edit = '';
    cloned.mc_display_string_in_view = '';
    cloned.mc_filter_hide_operator = true;

    const sub = record[fieldName].subscribe((v) => {
      rule.value = v;
    });

    state = {
      fieldName,
      record,
      field: cloned,
      sub,
      sourceField: sourceFieldName
    };

    this.advancedRuleFieldStateById.set(ruleId, state);
    return state;
  }

  private getAdvancedRuleId(rule: AdvancedFilterRule): number {
    if (!rule.__advRuleId) {
      this.nextAdvancedRuleId += 1;
      rule.__advRuleId = this.nextAdvancedRuleId;
    }
    return rule.__advRuleId;
  }

  private releaseAdvancedNodeState(node: AdvancedFilterNode | null | undefined): void {
    if (!node) {
      return;
    }

    if (this.isAdvancedGroup(node)) {
      for (const child of node.nestedFilters?.filters || []) {
        this.releaseAdvancedNodeState(child);
      }
      return;
    }

    this.releaseAdvancedRuleFieldState(node as AdvancedFilterRule);
  }

  private releaseAdvancedRuleFieldState(rule: AdvancedFilterRule | null | undefined): void {
    if (!rule?.__advRuleId) {
      return;
    }

    const state = this.advancedRuleFieldStateById.get(rule.__advRuleId);
    state?.sub?.unsubscribe();
    this.advancedRuleFieldStateById.delete(rule.__advRuleId);
  }

  private clearAllAdvancedRuleFieldStates(): void {
    for (const state of this.advancedRuleFieldStateById.values()) {
      state?.sub?.unsubscribe();
    }
    this.advancedRuleFieldStateById.clear();
  }

  private getAdvancedGroupByPath(path: number[]): AdvancedFilterGroup | null {
    let current = this.advancedFilter;
    for (const index of path) {
      const node = current?.filters?.[index];
      if (!node || !this.isAdvancedGroup(node)) {
        return null;
      }
      current = node.nestedFilters;
    }
    return current;
  }

  private getDefaultOperatorForField(fieldName: string): string {
    if (!fieldName) {
      return 'eq';
    }

    const col = this.resolveMetaByField(fieldName);
    if (!col) {
      return 'eq';
    }

    if (col.mc_ui_column_type === 'text' || col.mc_ui_column_type === 'txt_area' || col.mc_ui_column_type === 'textarea') {
      return 'contains';
    }

    if (col.mc_ui_column_type === 'multiple_check' || (col.mc_ui_column_type === 'lookupByID' && !!col.mc_is_multicheck_filter)) {
      return 'eq';
    }

    return 'eq';
  }

  private toFilterInfo(group: AdvancedFilterGroup): FilterInfo {
    const normalized = this.normalizeAdvancedGroup(group);
    return new FilterInfo(normalized.logic, this.serializeAdvancedFiltersForServer(normalized.filters) as any);
  }

  private serializeAdvancedFiltersForServer(nodes: AdvancedFilterNode[]): any[] {
    const list = Array.isArray(nodes) ? nodes : [];
    return list
      .map((node) => {
        if (this.isAdvancedGroup(node)) {
          return {
            nestedFilters: {
              logic: String(node.nestedFilters?.logic || 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND',
              filters: this.serializeAdvancedFiltersForServer(node.nestedFilters?.filters || [])
            }
          };
        }

        const rule = node as AdvancedFilterRule;
        return {
          field: String(rule.field || ''),
          operatore: String(rule.operatore || ''),
          value: rule.value ?? null,
          fixed: !!rule.fixed,
          __extra: !!rule.__extra,
          __descriptorManaged: !!rule.__descriptorManaged,
          __querystring: !!rule.__querystring
        };
      })
      .filter((node: any) => {
        if (node?.nestedFilters) {
          return Array.isArray(node.nestedFilters.filters) && node.nestedFilters.filters.length > 0;
        }
        return !!String(node?.field || '').trim();
      });
  }

  private resolveMetaByField(fieldName: string): MetadatiColonna | undefined {
    const key = String(fieldName || '').trim();
    if (!key) {
      return undefined;
    }
    return (this.metas || []).find((m) => m?.mc_nome_colonna === key);
  }

  private clearFilterDescriptorValues(): void {
    const descriptor = this.filterDescriptor || {};
    Object.keys(descriptor).forEach((key) => {
      if (!descriptor[key] || typeof descriptor[key].next !== 'function') {
        return;
      }
      descriptor[key].next(null);
    });
  }

  private deepClone<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  private buildPageSizeOptions(totalRows: number, current: number): { label: string; value: number; }[] {
    const base = [10, 25, 50, 100, 200, 500];
    const candidates = new Set<number>(base.filter(x => x > 0));
    if (current > 0) {
      candidates.add(current);
    }
    if (totalRows > 0 && !this.cursorMode) {
      candidates.add(totalRows);
    }

    const values = [...candidates]
      .filter(x => x > 0)
      .sort((a, b) => a - b);

    const opts = values.map(v => ({ label: String(v), value: v }));

    // "Unlimited" option (value=0): in cursor-mode il backend non puo' produrre
    // output deterministico senza paginazione → la nascondiamo. In server-side
    // o client-side normale, value=0 fa fluire pageSize=0 fino al fetch e il
    // backend (vedi `MetaService.previewViewDefinition`) salta TOP/LIMIT.
    if (!this.cursorMode) {
      opts.push({ label: this.trnsl.instant('page_size.unlimited'), value: 0 });
    }
    return opts;
  }

  private hasGroupingApplied(): boolean {
    return Array.isArray(this.datasource?.value?.groupInfo) && this.datasource.value.groupInfo.length > 0;
  }

  private getTotalForPageSize(resultInfo?: { totalRowCount?: number; totalGroups?: number; }): number {
    if (!resultInfo) {
      return 0;
    }

    const total = this.hasGroupingApplied()
      ? Number(resultInfo.totalGroups || 0)
      : Number(resultInfo.totalRowCount || 0);

    return Math.max(0, total);
  }

  async applyPageSize() {
    if (!this.datasource?.value) {
      return;
    }

    // pageSize=0 e' sentinel "unlimited" → niente clamp a 1. Il datasource e
    // i consumer (preview pivot, ecc.) interpretano 0 come "no cap".
    const raw = Math.trunc(Number(this.pageSize || 0));
    const next = raw <= 0 ? 0 : Math.max(1, raw);
    this.pageSize = next;
    this.datasource.value.pageSize = next;
    this.resetCursorPagingState();
    this.datasource.value.currentPage = 1;
    if (!this.skipFetch) await this.datasource.value.fetchData();
    this.syncGridStateQueryString();
    this.onPageSizeApplied.emit({
      pageSize: this.pageSize,
      currentPage: this.datasource.value.currentPage || 1
    });

    const totalRows = this.getTotalForPageSize(this.datasource.value.resultInfo);
    this.pageSizeOptions = this.buildPageSizeOptions(totalRows, next);
  }

  async resetPageSize() {
    const fallback = Math.max(1, Number(this.metaInfo?.tableMetadata?.md_pagesize || 10));
    this.pageSize = fallback;
    await this.applyPageSize();
  }

  toggleCollapse(): void {
    const willExpand = this.isCollapsed;
    this.isCollapsed = !this.isCollapsed;
    this.onFilterBarCollapseChanged.emit({ collapsed: this.isCollapsed });
    if (willExpand) {
      this.hasExpandedOnce = true;
    }
    // Notify sibling components (chart, map, etc.) that the available
    // vertical space changed. Multiple synthetic resize events at different
    // delays cover both the immediate DOM change and the CSS transition end.
    for (const delay of [50, 200, 400]) {
      setTimeout(() => window.dispatchEvent(new Event('resize')), delay);
    }
  }

  /**
   * Su mobile, dopo apply o clear filter, chiude automaticamente l'overlay
   * (UX: l'utente vuole vedere subito i risultati senza dover chiudere a mano).
   * Su desktop il pannello inline resta aperto come prima.
   */
  private autoCollapseOnMobileAfterApply(): void {
    if (this.deviceAwareness?.isMobile && !this.isCollapsed) {
      this.isCollapsed = true;
      this.onFilterBarCollapseChanged.emit({ collapsed: true });
    }
  }

  private syncGridStateQueryString() {
    if (this.skipUrlSync) {
      return;
    }
    if (!this.datasource?.value) {
      return;
    }

    const filterInfo = this.datasource.value.filterInfo;
    const hasFilters = !!filterInfo?.filters?.length;
    const sortInfo = this.datasource.value.sortInfo;
    const hasSort = !!sortInfo?.length;
    const pageSize = Number(this.datasource.value.pageSize || this.pageSize || 0);
    const currentPage = Number(this.datasource.value.currentPage || 1);
    const hasPaging = Number.isFinite(pageSize) && pageSize > 0 && Number.isFinite(currentPage) && currentPage > 0;

    const tree = this.router.createUrlTree([], {
      relativeTo: this.aroute,
      queryParams: {
        filterInfo: hasFilters ? JSON.stringify(filterInfo) : null,
        filterinfo: null,
        sortInfo: hasSort ? JSON.stringify(sortInfo.map(s => ({ field: s.field, dir: s.dir }))) : null,
        sortinfo: null,
        pageInfo: hasPaging ? JSON.stringify({ currentPage: Math.trunc(currentPage), pageSize: Math.trunc(pageSize) }) : null,
        pageinfo: null
      },
      queryParamsHandling: 'merge'
    });

    const nextUrl = this.router.serializeUrl(tree);
    const currentUrl = this.location.path(true);
    if (nextUrl !== currentUrl) {
      this.location.go(nextUrl);
    }
  }

  private resetCursorPagingState(): void {
    if (!this.datasource?.value?.cursorMode) {
      return;
    }

    this.datasource.value.pageCursor = null;
    this.datasource.value.pageDirection = 'next';
    this.datasource.value.nextPageCursor = null;
    this.datasource.value.prevPageCursor = null;
    this.datasource.value.prevCursors = [];
  }
}

