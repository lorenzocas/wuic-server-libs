import { ensureIntegrationSession } from '../../testing/integration-auth';
import { BehaviorSubject, Subject } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';

import { ListGridComponent } from './list-grid.component';
import { DynamicRowTemplateComponent } from '../dynamic-template/dynamic-template.component';

type ListGridIntegrationConfig = {
    baseUrl: string;
    route: string;
    userId: number;
    pageSize?: number;
};

class ActivatedRouteStub {
    snapshot = {
        paramMap: convertToParamMap({ route: 'integration', action: 'list' })
    };

    setParams(params: {
        route?: string;
        action?: string;
    }) {
        this.snapshot.paramMap = convertToParamMap(params);
    }
}

class RouterStub {
    readonly events = new Subject<any>();
    private currentPath = '/integration/list';

    createUrlTree(_commands: any[], options: any) {
        return { path: this.currentPath, queryParams: options?.queryParams || {} };
    }

    serializeUrl(tree: any): string {
        const params = tree?.queryParams || {};
        const entries = Object.entries(params).filter(([, value]) => value !== null && value !== undefined);
        if (!entries.length) {
            return tree?.path || this.currentPath;
        }

        const qs = new URLSearchParams();
        entries.forEach(([key, value]) => qs.set(key, `${value}`));
        return `${tree?.path || this.currentPath}?${qs.toString()}`;
    }

    parseUrl(url: string) {
        const [pathPart, queryPart = ''] = url.split('?');
        const path = (pathPart || '').replace(/^\/+/, '');
        const segments = path ? path.split('/').filter(Boolean).map(part => ({ path: part })) : [];

        const queryParams: Record<string, any> = {};
        const params = new URLSearchParams(queryPart);
        params.forEach((value, key) => {
            if (queryParams[key] === undefined) {
                queryParams[key] = value;
            }
            else {
                queryParams[key] = Array.isArray(queryParams[key]) ? [...queryParams[key], value] : [queryParams[key], value];
            }
        });

        return {
            root: { children: { primary: { segments } } },
            queryParams
        };
    }
}

function getIntegrationConfig(): ListGridIntegrationConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.listGrid as ListGridIntegrationConfig | undefined;
    if (!cfg?.baseUrl || !cfg?.route || !Number.isFinite(Number(cfg?.userId))) {
        return null;
    }

    if (cfg.route === 'la_tua_route_scaffoldata') {
        return null;
    }

    return {
        baseUrl: cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`,
        route: cfg.route,
        userId: Number(cfg.userId),
        pageSize: Number(cfg.pageSize || 10)
    };
}

async function postJson(url: string, body: any): Promise<any> {
    await ensureIntegrationSession(url);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        credentials: 'include',
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
    }

    return response.json();
}

describe('ListGridComponent Integration (backend scaffolded route)', () => {
    it.skip('loads metadata and records from scaffolded route and populates grid state', async () => {
        const cfg = getIntegrationConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.listGrid = { baseUrl, route, userId, pageSize } to run this integration test.');
            ;
            return;
        }

        const metadataRows = await postJson(`${cfg.baseUrl}MetaService.getTableMetadata`, {
            route: cfg.route,
            md_id: '',
            lookup_table_id: 0,
            user_id: cfg.userId,
            dm: 1
        });

        expect(Array.isArray(metadataRows)).toBe(true);
        if (!Array.isArray(metadataRows) || metadataRows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' returned no column metadata.`);
            ;
            return;
        }
        const primaryKey = metadataRows.find((c: any) => !!c?.mc_is_primary_key);
        expect(primaryKey, `Primary key metadata for route '${cfg.route}'`).toBeTruthy();

        const dataPayload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
            user_id: cfg.userId,
            route: cfg.route,
            lookup_table_id: 0,
            SortInfo: [],
            GroupInfo: [],
            PageInfo: { pageSize: cfg.pageSize, currentPage: 1 },
            filterInfo: { logic: 'AND', filters: [] },
            logicOperator: 'AND',
            has_server_operation: true,
            aggregates: [],
            columnRestrictionList: [],
            formula_lookup: '',
            mc_id: 0
        });

        const resultRows = dataPayload?.results || dataPayload?.dato || [];
        const totalRows = Number(dataPayload?.totalRowCount ?? resultRows.length ?? 0);

        expect(Array.isArray(resultRows)).toBe(true);
        expect(totalRows).toBeGreaterThanOrEqual(0);

        const routeStub = new ActivatedRouteStub();
        routeStub.setParams({ route: cfg.route, action: 'list' });
        const routerStub = new RouterStub();
        const locationStub: any = {
            go: vi.fn().mockName("Location.go"),
            path: vi.fn().mockName("Location.path")
        };
        locationStub.path.mockReturnValue(`/${cfg.route}/list`);

        const titleStub = { setTitle: vi.fn() };
        const trslStub = { instant: (key: string) => key };
        const cdStub = { detectChanges: vi.fn() };

        const dsMock = {
            fetchInfo$: new BehaviorSubject<any>(null),
            filterInfo: { filters: [] as any[] },
            filterDescriptor: {},
            metaInfo: null,
            loading: new BehaviorSubject<boolean>(false),
            pageSize: cfg.pageSize || 10,
            currentPage: 1,
            sortInfo: [] as any[],
            clearColumnFilter: vi.fn(),
            fetchData: vi.fn().mockResolvedValue(undefined),
            exportXls: vi.fn().mockResolvedValue(null),
            canUseClientSideCrud: vi.fn().mockReturnValue(false),
            enableClientSideCrud: vi.fn().mockResolvedValue(undefined),
            disableClientSideCrud: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 }),
            disableClientSideCrudWithoutSync: vi.fn().mockResolvedValue(undefined)
        };

        const component = new ListGridComponent({
            getCustomSettingFromLocalStorage: () => null,
            readCustomSettings: () => Promise.resolve(null),
            setCustomSettingInLocalStorage: () => undefined,
            saveCustomSettings: () => Promise.resolve('1')
        } as any, {} as any, routeStub as unknown as ActivatedRoute, routerStub as any, locationStub, titleStub as any, trslStub as any, cdStub as any, { getuserInfo: () => ({ user_id: cfg.userId }) } as any, { nativeElement: document.createElement('div') } as any);

        vi.spyOn(DynamicRowTemplateComponent, 'getComponentFromTemplate').mockReturnValue(class {
        } as any);

        component.datasource = new BehaviorSubject<any>(dsMock);
        component.ngOnInit();

        const mappedColumns = metadataRows;
        const tableMetadata = mappedColumns[0]?._Metadati_Tabelle || {};
        const metaInfo = {
            columnMetadata: mappedColumns,
            tableMetadata,
            operators: {}
        } as any;

        dsMock.metaInfo = metaInfo;
        dsMock.fetchInfo$.next({
            resultInfo: {
                dato: resultRows,
                totalRowCount: totalRows,
                Agg: []
            },
            metaInfo
        });

        expect(component.metaInfo).toBeTruthy();
        const renderedCols = component.cols.length;
        console.log(`[ListGrid Integration] route=${cfg.route} renderedCols=${renderedCols} rows=${resultRows.length} totalRows=${totalRows}`);

        // if (renderedCols === 0) {
        //   pending(`Route '${cfg.route}' produced no visible grid columns.`);
        //   component.ngOnDestroy();
        //   return;
        // }

        if (renderedCols === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' produced no visible grid columns.`);
            ;
            component.ngOnDestroy();
            return;
        }
        expect(component.cols.every((c: any) => !!c?.mc_nome_colonna || !!c?.field), `Rendered columns should expose a field name for route '${cfg.route}'`).toBe(true);
        expect(component.records.length).toBe(resultRows.length);
        expect(component.totalRecords).toBe(totalRows);
        if (resultRows.length > 0 && primaryKey) {
            const pkName = primaryKey.mc_nome_colonna;
            expect(component.records.every((r: any) => r[pkName] !== undefined), `Projected records should preserve primary key '${pkName}' for route '${cfg.route}'`).toBe(true);
        }

        component.ngOnDestroy();
    });

    it.skip('e2e applies page/sort interaction on scaffolded route and syncs query state', async () => {
        const cfg = getIntegrationConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.listGrid = { baseUrl, route, userId, pageSize } to run this integration test.');
            ;
            return;
        }

        const metadataRows = await postJson(`${cfg.baseUrl}MetaService.getTableMetadata`, {
            route: cfg.route,
            md_id: '',
            lookup_table_id: 0,
            user_id: cfg.userId,
            dm: 1
        });
        if (!Array.isArray(metadataRows) || metadataRows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' returned no column metadata.`);
            ;
            return;
        }

        const dataPayload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
            user_id: cfg.userId,
            route: cfg.route,
            lookup_table_id: 0,
            SortInfo: [],
            GroupInfo: [],
            PageInfo: { pageSize: cfg.pageSize, currentPage: 1 },
            filterInfo: { logic: 'AND', filters: [] },
            logicOperator: 'AND',
            has_server_operation: true,
            aggregates: [],
            columnRestrictionList: [],
            formula_lookup: '',
            mc_id: 0
        });

        const resultRows = dataPayload?.results || dataPayload?.dato || [];
        if (!Array.isArray(resultRows) || resultRows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' returned no rows.`);
            ;
            return;
        }

        const routeStub = new ActivatedRouteStub();
        routeStub.setParams({ route: cfg.route, action: 'list' });
        const routerStub = new RouterStub();
        const locationStub: any = {
            go: vi.fn().mockName("Location.go"),
            path: vi.fn().mockName("Location.path")
        };
        locationStub.path.mockReturnValue(`/${cfg.route}/list`);

        const titleStub = { setTitle: vi.fn() };
        const trslStub = { instant: (key: string) => key };
        const cdStub = { detectChanges: vi.fn() };

        const dsMock = {
            fetchInfo$: new BehaviorSubject<any>(null),
            filterInfo: { filters: [] as any[] },
            filterDescriptor: {},
            metaInfo: null,
            loading: new BehaviorSubject<boolean>(false),
            pageSize: cfg.pageSize || 10,
            currentPage: 1,
            sortInfo: [] as any[],
            clearColumnFilter: vi.fn(),
            fetchData: vi.fn().mockResolvedValue(undefined),
            exportXls: vi.fn().mockResolvedValue(null),
            canUseClientSideCrud: vi.fn().mockReturnValue(false),
            enableClientSideCrud: vi.fn().mockResolvedValue(undefined),
            disableClientSideCrud: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 }),
            disableClientSideCrudWithoutSync: vi.fn().mockResolvedValue(undefined)
        };

        const component = new ListGridComponent({
            getCustomSettingFromLocalStorage: () => null,
            readCustomSettings: () => Promise.resolve(null),
            setCustomSettingInLocalStorage: () => undefined,
            saveCustomSettings: () => Promise.resolve('1')
        } as any, {} as any, routeStub as unknown as ActivatedRoute, routerStub as any, locationStub, titleStub as any, trslStub as any, cdStub as any, { getuserInfo: () => ({ user_id: cfg.userId }) } as any, { nativeElement: document.createElement('div') } as any);

        component.datasource = new BehaviorSubject<any>(dsMock);
        component.ngOnInit();

        const metaInfo = {
            columnMetadata: metadataRows,
            tableMetadata: metadataRows[0]?._Metadati_Tabelle || {},
            operators: {}
        } as any;
        dsMock.metaInfo = metaInfo;
        dsMock.fetchInfo$.next({
            resultInfo: { dato: resultRows, totalRowCount: Number(dataPayload?.totalRowCount ?? resultRows.length), Agg: [] },
            metaInfo
        });

        const sortable = metadataRows.find((c: any) => !!c?.mc_nome_colonna);
        if (!sortable) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has no sortable columns.`);
            ;
            component.ngOnDestroy();
            return;
        }

        vi.useFakeTimers();
        try {
            await component.pageFilterChange({ field: sortable.mc_nome_colonna, order: -1, rows: 5, first: 0 });
            vi.advanceTimersByTime(30);

            expect(dsMock.fetchData).toHaveBeenCalled();
            expect(dsMock.sortInfo.length).toBeGreaterThan(0);
            expect(locationStub.go).toHaveBeenCalled();
            const syncedUrl = String(vi.mocked(locationStub.go).mock.lastCall[0] || '');
            expect(syncedUrl).toContain('sortInfo=');
            expect(syncedUrl).toContain('pageInfo=');
        }
        finally {
            vi.useRealTimers();
            component.ngOnDestroy();
        }
    });

    it.skip('e2e saved-state roundtrip restores grid state on scaffolded route', async () => {
        const cfg = getIntegrationConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.listGrid = { baseUrl, route, userId, pageSize } to run this integration test.');
            ;
            return;
        }

        const metadataRows = await postJson(`${cfg.baseUrl}MetaService.getTableMetadata`, {
            route: cfg.route,
            md_id: '',
            lookup_table_id: 0,
            user_id: cfg.userId,
            dm: 1
        });
        if (!Array.isArray(metadataRows) || metadataRows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' returned no column metadata.`);
            ;
            return;
        }

        const dataPayload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
            user_id: cfg.userId,
            route: cfg.route,
            lookup_table_id: 0,
            SortInfo: [],
            GroupInfo: [],
            PageInfo: { pageSize: cfg.pageSize, currentPage: 1 },
            filterInfo: { logic: 'AND', filters: [] },
            logicOperator: 'AND',
            has_server_operation: true,
            aggregates: [],
            columnRestrictionList: [],
            formula_lookup: '',
            mc_id: 0
        });

        const resultRows = dataPayload?.results || dataPayload?.dato || [];
        if (!Array.isArray(resultRows) || resultRows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' returned no rows.`);
            ;
            return;
        }

        const routeStub = new ActivatedRouteStub();
        routeStub.setParams({ route: cfg.route, action: 'list' });
        const routerStub = new RouterStub();
        const locationStub: any = {
            go: vi.fn().mockName("Location.go"),
            path: vi.fn().mockName("Location.path")
        };
        locationStub.path.mockReturnValue(`/${cfg.route}/list`);

        const titleStub = { setTitle: vi.fn() };
        const trslStub = { instant: (key: string) => key, format: (tpl: string, ...args: any[]) => tpl.replace('{0}', `${args[0] ?? ''}`).replace('{1}', `${args[1] ?? ''}`) };
        const cdStub = { detectChanges: vi.fn() };

        const metaSrvStub = {
            getCustomSettingFromLocalStorage: vi.fn().mockReturnValue(null),
            readCustomSettings: vi.fn().mockResolvedValue(null),
            setCustomSettingInLocalStorage: vi.fn(),
            saveCustomSettings: vi.fn().mockResolvedValue('1')
        };

        const dsMock = {
            fetchInfo$: new BehaviorSubject<any>(null),
            filterInfo: { logicOperator: 'AND', filters: [] as any[] },
            filterDescriptor: {},
            metaInfo: null,
            loading: new BehaviorSubject<boolean>(false),
            pageSize: cfg.pageSize || 10,
            currentPage: 1,
            sortInfo: [] as any[],
            clearColumnFilter: vi.fn(),
            fetchData: vi.fn().mockResolvedValue(undefined),
            exportXls: vi.fn().mockResolvedValue(null),
            canUseClientSideCrud: vi.fn().mockReturnValue(false),
            enableClientSideCrud: vi.fn().mockResolvedValue(undefined),
            disableClientSideCrud: vi.fn().mockResolvedValue({ inserted: 0, updated: 0, deleted: 0 }),
            disableClientSideCrudWithoutSync: vi.fn().mockResolvedValue(undefined)
        };

        const component = new ListGridComponent(metaSrvStub as any, {} as any, routeStub as unknown as ActivatedRoute, routerStub as any, locationStub, titleStub as any, trslStub as any, cdStub as any, { getuserInfo: () => ({ user_id: cfg.userId }) } as any, { nativeElement: document.createElement('div') } as any);

        component.datasource = new BehaviorSubject<any>(dsMock);
        component.ngOnInit();

        const firstField = String(metadataRows[0]?.mc_nome_colonna || 'id');
        dsMock.filterDescriptor[firstField] = { next: vi.fn() };

        const metaInfo = {
            columnMetadata: metadataRows,
            tableMetadata: metadataRows[0]?._Metadati_Tabelle || {},
            operators: {}
        } as any;
        dsMock.metaInfo = metaInfo;
        dsMock.fetchInfo$.next({
            resultInfo: { dato: resultRows, totalRowCount: Number(dataPayload?.totalRowCount ?? resultRows.length), Agg: [] },
            metaInfo
        });

        dsMock.filterInfo = { logicOperator: 'AND', filters: [{ field: firstField, operator: 'contains', value: String(resultRows[0]?.[firstField] ?? '') }] };
        dsMock.sortInfo = [{ field: firstField, dir: 'desc' }];
        dsMock.currentPage = 2;
        dsMock.pageSize = 5;

        component.saveGridStateDialogSelectedId = component.NEW_GRID_STATE_OPTION_ID;
        component.saveGridStateDialogNewName = 'integration state';
        component.saveGridStateDialogSetAsDefault = true;
        await component.saveCurrentRouteGridState();

        const savedId = component.selectedSavedStateId;
        expect(savedId).toBeTruthy();
        expect(metaSrvStub.saveCustomSettings).toHaveBeenCalled();

        dsMock.filterInfo = { logicOperator: 'AND', filters: [] };
        dsMock.sortInfo = [];
        dsMock.currentPage = 1;
        dsMock.pageSize = 10;
        dsMock.fetchData.mockClear();

        await component.applySelectedGridState(savedId);

        expect(dsMock.fetchData).toHaveBeenCalled();
        expect(dsMock.currentPage).toBe(2);
        expect(dsMock.pageSize).toBe(5);
        expect(dsMock.sortInfo.length).toBeGreaterThan(0);
        expect(locationStub.go).toHaveBeenCalled();
        const syncedUrl = String(vi.mocked(locationStub.go).mock.lastCall[0] || '');
        expect(syncedUrl).toContain('filterInfo=');
        expect(syncedUrl).toContain('sortInfo=');
        expect(syncedUrl).toContain('pageInfo=');

        component.ngOnDestroy();
    });
});

