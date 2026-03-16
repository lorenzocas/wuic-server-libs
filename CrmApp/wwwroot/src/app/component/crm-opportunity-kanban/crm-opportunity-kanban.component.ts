import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DragDropModule } from 'primeng/dragdrop';
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DataSourceComponent, WtoolboxService } from 'wuic-framework-lib';

interface KanbanCard {
  opportunityId: number;
  stageId: number | null;
  title: string;
  accountName: string;
  amount: number;
  ownerDisplayName: string;
  expectedCloseDate: string;
}

interface KanbanColumn {
  stageId: number;
  stageName: string;
  stageCode: string;
  winProbability: number;
  cards: KanbanCard[];
}

@Component({
  selector: 'app-crm-opportunity-kanban',
  standalone: true,
  imports: [CommonModule, DragDropModule, ButtonModule, DataSourceComponent],
  templateUrl: './crm-opportunity-kanban.component.html',
  styleUrl: './crm-opportunity-kanban.component.scss'
})
export class CrmOpportunityKanbanComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() stagesDatasource?: BehaviorSubject<DataSourceComponent>;
  @Input() opportunitiesDatasource?: BehaviorSubject<DataSourceComponent>;
  @Input() hardcodedStagesDatasource?: DataSourceComponent;
  @Input() hardcodedOpportunitiesDatasource?: DataSourceComponent;

  @ViewChild('stagesSource') stagesSource?: DataSourceComponent;
  @ViewChild('opportunitiesSource') opportunitiesSource?: DataSourceComponent;

  loading = true;
  saving = false;
  movingCardId: number | null = null;
  roleName = '';
  canDragCards = false;
  columns: KanbanColumn[] = [];
  draggedCard: KanbanCard | null = null;
  draggedFromStageId: number | null = null;

  private stageRows: any[] = [];
  private opportunityRows: any[] = [];

  private stagesReadySubscription?: Subscription;
  private opportunitiesReadySubscription?: Subscription;
  private stagesFetchInfoSubscription?: Subscription;
  private opportunitiesFetchInfoSubscription?: Subscription;

  constructor(private readonly http: HttpClient) {}

  ngOnInit(): void {
    const role = this.resolveRoleName();
    this.roleName = role;
    this.canDragCards = /^(Admin|Amministratore|CRM Manager|CRM Sales)$/i.test(role);
  }

  ngAfterViewInit(): void {
    if (!this.hardcodedStagesDatasource && this.stagesSource) {
      this.hardcodedStagesDatasource = this.stagesSource;
    }

    if (!this.hardcodedOpportunitiesDatasource && this.opportunitiesSource) {
      this.hardcodedOpportunitiesDatasource = this.opportunitiesSource;
    }

    this.ensureDatasourceBindings();
  }

  ngOnDestroy(): void {
    this.stagesReadySubscription?.unsubscribe();
    this.opportunitiesReadySubscription?.unsubscribe();
    this.stagesFetchInfoSubscription?.unsubscribe();
    this.opportunitiesFetchInfoSubscription?.unsubscribe();
  }

  async reload(): Promise<void> {
    const stagesDs = this.stagesDatasource?.value;
    const opportunitiesDs = this.opportunitiesDatasource?.value;

    if (!stagesDs || !opportunitiesDs) {
      this.notify('error', 'Errore', 'Datasource kanban non inizializzati.');
      return;
    }

    this.loading = true;
    stagesDs.pageSize = 200;
    opportunitiesDs.pageSize = 500;

    try {
      await Promise.all([
        this.fetchDataSafely(stagesDs),
        this.fetchDataSafely(opportunitiesDs)
      ]);
    } catch (err: any) {
      this.notify('error', 'Errore', err?.message || 'Impossibile caricare il kanban opportunita.');
      this.loading = false;
    }
  }

  async onDrop(target: KanbanColumn): Promise<void> {
    if (!this.canDragCards || this.saving) {
      return;
    }

    const card = this.draggedCard;
    const sourceStageId = Number(this.draggedFromStageId);
    const destinationStageId = Number(target?.stageId);
    const opportunityId = Number(card?.opportunityId);

    if (!card || !Number.isFinite(sourceStageId) || !Number.isFinite(opportunityId) || !Number.isFinite(destinationStageId)) {
      return;
    }

    if (sourceStageId === destinationStageId) {
      this.onCardDragEnd();
      return;
    }

    this.saving = true;
    this.movingCardId = opportunityId;

    try {
      const apiBase = this.resolveApiBase();
      const payload = {
        routeName: 'crm_opportunities',
        currentRecord: {
          opportunity_id: opportunityId,
          stage_id: destinationStageId
        },
        selectedRecordKeys: {}
      };

      const response: any = await firstValueFrom(
        this.http.post(`${apiBase}CrmActions/execute/crm_opportunity_move_stage`, payload)
      );

      if (response?.ok !== true) {
        throw new Error(response?.message || 'Aggiornamento fase non riuscito.');
      }

      this.moveCardLocally(opportunityId, sourceStageId, destinationStageId);
      this.notify('success', 'Kanban', 'Opportunita spostata con successo.');
      await this.refreshOpportunitiesSafely();
    } catch (err: any) {
      this.notify('error', 'Errore', err?.message || 'Spostamento card non riuscito.');
    } finally {
      this.saving = false;
      this.movingCardId = null;
      this.onCardDragEnd();
    }
  }

  onCardDragStart(card: KanbanCard, column: KanbanColumn): void {
    if (!this.canDragCards || this.saving) {
      return;
    }

    this.draggedCard = card;
    this.draggedFromStageId = Number(column?.stageId);
  }

  onCardDragEnd(): void {
    this.draggedCard = null;
    this.draggedFromStageId = null;
  }

  trackColumn(_: number, column: KanbanColumn): number {
    return column.stageId;
  }

  trackCard(_: number, card: KanbanCard): number {
    return card.opportunityId;
  }

  private moveCardLocally(opportunityId: number, sourceStageId: number, destinationStageId: number): void {
    const sourceColumn = this.columns.find((c) => Number(c.stageId) === sourceStageId);
    const targetColumn = this.columns.find((c) => Number(c.stageId) === destinationStageId);

    if (!sourceColumn || !targetColumn) {
      return;
    }

    const sourceIndex = sourceColumn.cards.findIndex((c) => Number(c.opportunityId) === opportunityId);
    if (sourceIndex < 0) {
      return;
    }

    const [movedCard] = sourceColumn.cards.splice(sourceIndex, 1);
    movedCard.stageId = destinationStageId;
    targetColumn.cards.push(movedCard);
  }

  private async refreshOpportunitiesSafely(): Promise<void> {
    const opportunitiesDs = this.opportunitiesDatasource?.value;
    if (!opportunitiesDs) {
      return;
    }

    await this.fetchDataSafely(opportunitiesDs);
  }

  private async fetchDataSafely(ds: DataSourceComponent): Promise<void> {
    try {
      await ds.fetchData();
      return;
    } catch (err: any) {
      if (!this.isDatasourceOperatorsError(err)) {
        throw err;
      }
    }

    await this.delay(120);

    try {
      await ds.fetchData();
    } catch (err: any) {
      if (this.isDatasourceOperatorsError(err)) {
        return;
      }

      throw err;
    }
  }

  private isDatasourceOperatorsError(err: any): boolean {
    const message = String(err?.message || err || '').toLowerCase();
    return message.includes("setting 'operators'") || message.includes('setting "operators"');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private ensureDatasourceBindings(): void {
    if (this.hardcodedStagesDatasource) {
      this.stagesDatasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedStagesDatasource);
    }

    if (this.hardcodedOpportunitiesDatasource) {
      this.opportunitiesDatasource = new BehaviorSubject<DataSourceComponent>(this.hardcodedOpportunitiesDatasource);
    }

    this.bindStagesDatasource();
    this.bindOpportunitiesDatasource();
  }

  private bindStagesDatasource(): void {
    if (!this.stagesDatasource) {
      return;
    }

    if (this.stagesDatasource.value) {
      this.subscribeToStagesDS();
      return;
    }

    this.stagesReadySubscription?.unsubscribe();
    this.stagesReadySubscription = this.stagesDatasource.subscribe((ds) => {
      if (!ds) {
        return;
      }

      this.stagesReadySubscription?.unsubscribe();
      this.stagesReadySubscription = undefined;
      this.subscribeToStagesDS();
    });
  }

  private bindOpportunitiesDatasource(): void {
    if (!this.opportunitiesDatasource) {
      return;
    }

    if (this.opportunitiesDatasource.value) {
      this.subscribeToOpportunitiesDS();
      return;
    }

    this.opportunitiesReadySubscription?.unsubscribe();
    this.opportunitiesReadySubscription = this.opportunitiesDatasource.subscribe((ds) => {
      if (!ds) {
        return;
      }

      this.opportunitiesReadySubscription?.unsubscribe();
      this.opportunitiesReadySubscription = undefined;
      this.subscribeToOpportunitiesDS();
    });
  }

  private subscribeToStagesDS(): void {
    const ds = this.stagesDatasource?.value;
    if (!ds?.fetchInfo?.subscribe) {
      return;
    }

    this.stagesFetchInfoSubscription?.unsubscribe();
    this.stagesFetchInfoSubscription = ds.fetchInfo.subscribe((info: any) => {
      const dataSourceRoute = String(ds.route?.value || 'crm_opportunity_stage').trim().toLowerCase();
      const payloadRoute = String(info?.metaInfo?.tableMetadata?.md_route_name || '').trim().toLowerCase();
      const routeMatches = !payloadRoute || !dataSourceRoute || dataSourceRoute === payloadRoute;

      if (!info || !routeMatches) {
        return;
      }

      if (!Array.isArray(info?.resultInfo?.dato)) {
        return;
      }

      this.stageRows = info.resultInfo.dato;
      this.rebuildColumns();
    });
  }

  private subscribeToOpportunitiesDS(): void {
    const ds = this.opportunitiesDatasource?.value;
    if (!ds?.fetchInfo?.subscribe) {
      return;
    }

    this.opportunitiesFetchInfoSubscription?.unsubscribe();
    this.opportunitiesFetchInfoSubscription = ds.fetchInfo.subscribe((info: any) => {
      const dataSourceRoute = String(ds.route?.value || 'vw_crm_opportunities_kanban').trim().toLowerCase();
      const payloadRoute = String(info?.metaInfo?.tableMetadata?.md_route_name || '').trim().toLowerCase();
      const routeMatches = !payloadRoute || !dataSourceRoute || dataSourceRoute === payloadRoute;

      if (!info || !routeMatches) {
        return;
      }

      if (!Array.isArray(info?.resultInfo?.dato)) {
        return;
      }

      this.opportunityRows = info.resultInfo.dato;
      this.rebuildColumns();
    });
  }

  private rebuildColumns(): void {
    const stageColumns = this.stageRows
      .map((r: any) => ({
        stageId: Number(r?.stage_id || 0),
        stageName: String(r?.stage_name || r?.status_name || 'Fase'),
        stageCode: String(r?.stage_code || ''),
        winProbability: Number(r?.win_probability || 0),
        cards: [] as KanbanCard[]
      }))
      .filter((c: KanbanColumn) => Number.isFinite(c.stageId) && c.stageId > 0)
      .sort((a: KanbanColumn, b: KanbanColumn) => a.stageId - b.stageId);

    const byStage = new Map<number, KanbanCard[]>();
    for (const col of stageColumns) {
      byStage.set(col.stageId, []);
    }

    for (const row of this.opportunityRows) {
      const stageId = Number(row?.stage_id || 0);
      if (!byStage.has(stageId)) {
        continue;
      }

      byStage.get(stageId)!.push({
        opportunityId: Number(row?.opportunity_id || 0),
        stageId,
        title: String(row?.title || `Opportunita #${row?.opportunity_id || ''}`),
        accountName: String(row?.account_name || ''),
        amount: Number(row?.amount || 0),
        ownerDisplayName: String(row?.owner_display_name || ''),
        expectedCloseDate: String(row?.expected_close_date || '')
      });
    }

    for (const col of stageColumns) {
      col.cards = (byStage.get(col.stageId) || []).sort((a, b) => b.amount - a.amount);
    }

    this.columns = stageColumns;
    this.loading = false;
  }

  private resolveRoleName(): string {
    const fromCookie = this.readCookie('k-user');
    const raw = decodeURIComponent(fromCookie || localStorage.getItem('k-user') || sessionStorage.getItem('k-user') || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const parsed: any = JSON.parse(raw);
      return String(parsed?.role || parsed?.ruolo_des || parsed?.role_name || '').trim();
    } catch {
      return '';
    }
  }

  private readCookie(name: string): string {
    const cookieName = `${name}=`;
    const chunks = String(document?.cookie || '').split(';');
    for (const chunkRaw of chunks) {
      const chunk = chunkRaw.trim();
      if (chunk.startsWith(cookieName)) {
        return chunk.substring(cookieName.length);
      }
    }
    return '';
  }

  private resolveApiBase(): string {
    const configured = String((WtoolboxService as any)?.appSettings?.api_url || '').trim();
    if (configured.length > 0) {
      return configured.endsWith('/') ? configured : `${configured}/`;
    }

    const fallback = `${window.location.origin}/api/`;
    return fallback.endsWith('/') ? fallback : `${fallback}/`;
  }

  private notify(severity: 'success' | 'error', summary: string, detail: string): void {
    WtoolboxService.messageNotificationService?.add({ severity, summary, detail });
  }
}
