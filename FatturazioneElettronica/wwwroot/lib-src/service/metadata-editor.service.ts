import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DataSourceComponent } from '../component/data-source/data-source.component';
import { MetadatiColonna } from '../class/metadati_colonna';
import { DataProviderService } from './data-provider.service';
import { TranslationManagerService } from './translation-manager.service';
import { UserInfoService } from './user-info.service';
import { WtoolboxService } from './wtoolbox.service';
import { WorkflowRuntimeMetadataService } from './workflow-runtime-metadata.service';
import { ParametricDialogComponent } from '../component/parametric-dialog/parametric-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class MetadataEditorService {
  constructor(
    private dataSrv: DataProviderService,
    private trslSrv: TranslationManagerService,
    private userInfo: UserInfoService,
    private workflowRuntimeMetadata: WorkflowRuntimeMetadataService
  ) { }

  /**
   * Apre il metadata editor di colonna predisponendo le liste lookup richieste dall'UI (rotte, chiavi, relazioni)
   * e allineando il contesto runtime con i servizi metadata correnti.
   * @param field Metadato colonna/campo coinvolto nell'elaborazione.
   * @param metaSrv Servizio/metacontesto usato dal dialog editor.
   */
  async openMetadataColumnEditor(field: MetadatiColonna, metaSrv: any): Promise<void> {
    if (!this.userInfo.isCurrentUserAdmin()) {
      return;
    }

    const mcId = Number(field?.mc_id || 0);
    if (!Number.isFinite(mcId) || mcId <= 0 || !metaSrv) {
      return;
    }

    const routeName = String((metaSrv?.constructor as any)?.metaColumnRoute || ' metadati  colonne');
    const dummyRoute: any = {
      snapshot: {
        queryParamMap: { get: (_: string) => null },
        paramMap: { get: (_: string) => null }
      }
    };

    const ds = new DataSourceComponent(metaSrv, this.dataSrv, this.trslSrv, this.workflowRuntimeMetadata, {} as any, dummyRoute, this.userInfo);
    ds.hardcodedRoute = routeName;
    ds.route.next(routeName);
    await ds.getSchemaAndData(true);

    ds.filterInfo = {
      logic: 'AND',
      filters: [{ field: 'mc_id', value: String(mcId), operatore: 'eq', fixed: true }]
    } as any;
    ds.pageSize = 0;
    ds.currentPage = 1;

    const payload = await ds.fetchData();
    const rows = payload?.resultInfo?.dato || [];
    const record = rows.find((x: any) => Number.parseInt(String(x?.mc_id ?? ''), 10) === mcId);
    if (!record) {
      ds.ngOnDestroy();
      return;
    }
    ds.setCurrent(record);

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(ds),
        saveCallback: null,
        isEditForm: true
      },
      header: `${this.trslSrv.instant('edit')} ${this.trslSrv.instant('column')}: ${field?.mc_display_string_in_edit || field?.mc_nome_colonna || mcId}`,
      styleClass: 'edit-form-content',
      position: 'center',
      duplicate: true
    });

    ref?.onClose?.subscribe(() => {
      ds.ngOnDestroy();
    });
  }

  /**
   * Apre l'editor metadata colonna in contesto locale (designer/runtime in-memory):
   * il salvataggio aggiorna solo `hostDatasource.metaInfo.columnMetadata` senza sync DB.
   * @param field Metadato colonna da modificare.
   * @param metaSrv Servizio metadata corrente usato per costruire il datasource editor.
   * @param hostDatasource Datasource host da aggiornare in memoria dopo il salvataggio.
   */
  async openMetadataColumnEditorInContext(
    field: MetadatiColonna,
    metaSrv: any,
    hostDatasource?: DataSourceComponent | BehaviorSubject<DataSourceComponent> | null
  ): Promise<void> {
    if (!this.userInfo.isCurrentUserAdmin()) {
      return;
    }

    const mcId = Number(field?.mc_id || 0);
    if (!Number.isFinite(mcId) || mcId <= 0 || !metaSrv) {
      return;
    }

    const resolvedHostDs = hostDatasource instanceof BehaviorSubject
      ? hostDatasource.value
      : hostDatasource || null;
    const routeName = String((metaSrv?.constructor as any)?.metaColumnRoute || ' metadati  colonne');
    const dummyRoute: any = {
      snapshot: {
        queryParamMap: { get: (_: string) => null },
        paramMap: { get: (_: string) => null }
      }
    };

    const ds = new DataSourceComponent(metaSrv, this.dataSrv, this.trslSrv, this.workflowRuntimeMetadata, {} as any, dummyRoute, this.userInfo);
    ds.hardcodedRoute = routeName;
    ds.route.next(routeName);
    await ds.getSchemaAndData(true);

    // Modalita memory-only: usa esclusivamente il valore serializzato in memoria.
    const hostColumnSnapshot = resolvedHostDs?.metaInfo?.columnMetadata
      ?.find((col: any) => Number(col?.mc_id || 0) === mcId) || null;

    if (!hostColumnSnapshot) {
      ds.ngOnDestroy();
      return;
    }

    const normalizeKey = (v: any) => String(v || '').replace(/[_\s]/g, '').toLowerCase();
    const editorAssociatedTabKey = (() => {
      const cols = ds?.metaInfo?.columnMetadata || [];
      const exact = cols.find((c: any) => String(c?.mc_nome_colonna || '').trim() === 'mc_edit_associated_tab');
      if (exact) {
        return 'mc_edit_associated_tab';
      }
      const match = cols.find((c: any) => normalizeKey(c?.mc_nome_colonna) === 'mceditassociatedtab');
      return match ? String(match?.mc_nome_colonna || '').trim() : '';
    })();

    const hostAssociatedTab = String(
      (hostColumnSnapshot as any)?.mc_edit_associated_tab
      ?? ''
    ).trim();

    const localSnapshot: any = { ...hostColumnSnapshot };
    if (hostAssociatedTab) {
      localSnapshot.mc_edit_associated_tab = hostAssociatedTab;
      if (editorAssociatedTabKey) {
        localSnapshot[editorAssociatedTabKey] = hostAssociatedTab;
      }
    }

    ds.setCurrent(localSnapshot);

    const unwrapEntry = (value: any): any => {
      if (value instanceof BehaviorSubject) {
        return unwrapEntry(value.value);
      }
      if (Array.isArray(value)) {
        return value.map((x) => unwrapEntry(x));
      }
      if (value && typeof value === 'object') {
        const obj: any = {};
        Object.keys(value).forEach((k) => {
          obj[k] = unwrapEntry(value[k]);
        });
        return obj;
      }
      return value;
    };

    const publishHostDatasource = () => {
      if (!resolvedHostDs?.fetchInfo$?.next) {
        return;
      }

      resolvedHostDs.fetchInfo$.next({
        resultInfo: resolvedHostDs.resultInfo,
        metaInfo: resolvedHostDs.metaInfo,
        filterDescriptor: resolvedHostDs.filterDescriptor,
        groupInfo: resolvedHostDs.groupInfo,
        sortInfo: resolvedHostDs.sortInfo,
        aggregationInfo: resolvedHostDs.aggregationInfo
      } as any);
    };

    const saveCallback = (data: any) => {
      const normalized = unwrapEntry(data) || {};
      const targetId = Number(normalized?.mc_id || mcId);
      const normalizedAssociatedTab = String(
        (editorAssociatedTabKey ? normalized?.[editorAssociatedTabKey] : undefined)
        ?? normalized?.mc_edit_associated_tab
        ?? ''
      ).trim();

      normalized.mc_edit_associated_tab = normalizedAssociatedTab;
      if (editorAssociatedTabKey) {
        normalized[editorAssociatedTabKey] = normalizedAssociatedTab;
      }

      const hostColumns = resolvedHostDs?.metaInfo?.columnMetadata || [];
      const hostCol = hostColumns.find((col: any) => Number(col?.mc_id || 0) === targetId);
      if (hostCol) {
        Object.assign(hostCol, normalized);
        hostCol.mc_edit_associated_tab = normalizedAssociatedTab;
      }
      publishHostDatasource();
      return normalized;
    };

    const ref = WtoolboxService.dialogService.open(ParametricDialogComponent, {
      data: {
        datasource: new BehaviorSubject<DataSourceComponent>(ds),
        saveCallback,
        isEditForm: true
      },
      header: `${this.trslSrv.instant('edit')} ${this.trslSrv.instant('column')}: ${field?.mc_display_string_in_edit || field?.mc_nome_colonna || mcId}`,
      styleClass: 'edit-form-content',
      position: 'center',
      duplicate: true
    });

    ref?.onClose?.subscribe(() => {
      ds.ngOnDestroy();
    });
  }
}

