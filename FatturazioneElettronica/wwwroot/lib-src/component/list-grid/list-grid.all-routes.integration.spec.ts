import { ensureIntegrationSession } from '../../testing/integration-auth';
import { BehaviorSubject, Subject } from 'rxjs';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Location } from '@angular/common';

import { ListGridComponent } from './list-grid.component';
import { DynamicRowTemplateComponent } from '../dynamic-template/dynamic-template.component';

type ListGridAllRoutesConfig = {
    baseUrl: string;
    userId: number;
    pageSize?: number;
    maxRoutes?: number;
    includeRoutes?: string[];
    excludeRoutes?: string[];
};

class ActivatedRouteStub {
    snapshot = {
        paramMap: convertToParamMap({ route: 'integration', action: 'list' })
    };
}

class RouterStub {
    readonly events = new Subject<any>();
    private currentPath = '/integration/list';

    setCurrentPath(path: string) {
        this.currentPath = path;
    }

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

function getAllRoutesConfig(): ListGridAllRoutesConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.listGridAllRoutes as ListGridAllRoutesConfig | undefined;
    if (!cfg?.baseUrl || !Number.isFinite(Number(cfg?.userId))) {
        return null;
    }

    return {
        baseUrl: cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`,
        userId: Number(cfg.userId),
        pageSize: Number(cfg.pageSize || 10),
        maxRoutes: Number(cfg.maxRoutes || 0),
        includeRoutes: Array.isArray(cfg.includeRoutes) ? cfg.includeRoutes : [],
        excludeRoutes: Array.isArray(cfg.excludeRoutes) ? cfg.excludeRoutes : []
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

function normalizeRouteName(raw: any): string | null {
    const value = String(raw ?? '').trim();
    if (!value) {
        return null;
    }

    // Exclude technical metadata routes by default.
    if (value.startsWith('__')) {
        return null;
    }

    const lowered = value.toLowerCase();
    if (lowered.includes('metadati')) {
        return null;
    }

    return value;
}

async function discoverScaffoldedRoutes(cfg: ListGridAllRoutesConfig): Promise<string[]> {
    const payload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
        user_id: cfg.userId,
        route: ' metadati  tabelle',
        lookup_table_id: 0,
        SortInfo: [],
        GroupInfo: [],
        PageInfo: { pageSize: 1000, currentPage: 1 },
        filterInfo: { logic: 'AND', filters: [] },
        logicOperator: 'AND',
        has_server_operation: true,
        aggregates: [],
        columnRestrictionList: [],
        formula_lookup: '',
        mc_id: 0
    });

    const rows = payload?.results || [];
    const set = new Set<string>();

    rows.forEach((row: any) => {
        const route = normalizeRouteName(row?.md_route_name);
        if (route) {
            set.add(route);
        }
    });

    let routes = [...set];
    if (cfg.includeRoutes && cfg.includeRoutes.length > 0) {
        const include = new Set(cfg.includeRoutes.map(r => r.trim()));
        routes = routes.filter(r => include.has(r));
    }

    if (cfg.excludeRoutes && cfg.excludeRoutes.length > 0) {
        const exclude = new Set(cfg.excludeRoutes.map(r => r.trim()));
        routes = routes.filter(r => !exclude.has(r));
    }

    if (cfg.maxRoutes && cfg.maxRoutes > 0) {
        routes = routes.slice(0, cfg.maxRoutes);
    }

    return routes;
}

describe('ListGridComponent Integration (all scaffolded routes)', () => {
    it.skip('loads metadata and first-page data for every discovered scaffolded route', async () => {
        const cfg = getAllRoutesConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.listGridAllRoutes = { baseUrl, userId, pageSize?, maxRoutes?, includeRoutes?, excludeRoutes? } to run this integration test.');
            ;
            return;
        }
        if ((!cfg.includeRoutes || cfg.includeRoutes.length === 0) && (!cfg.excludeRoutes || cfg.excludeRoutes.length === 0)) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('listGridAllRoutes skipped: set includeRoutes or excludeRoutes to run all-routes integration.');
            ;
            return;
        }

        vi.setConfig({ testTimeout: 300000 });

        const routes = await discoverScaffoldedRoutes(cfg);
        expect(routes.length).toBeGreaterThan(0);

        vi.spyOn(DynamicRowTemplateComponent, 'getComponentFromTemplate').mockReturnValue(class {
        } as any);

        const failures: string[] = [];

        for (const route of routes) {
            try {
                const metadataRows = await postJson(`${cfg.baseUrl}MetaService.getTableMetadata`, {
                    route,
                    md_id: '',
                    lookup_table_id: 0,
                    user_id: cfg.userId,
                    dm: 1
                });

                expect(Array.isArray(metadataRows), `metadata shape for route ${route}`).toBe(true);
                expect(metadataRows.length, `metadata rows for route ${route}`).toBeGreaterThan(0);

                const dataPayload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
                    user_id: cfg.userId,
                    route,
                    lookup_table_id: 0,
                    SortInfo: [],
                    GroupInfo: [],
                    PageInfo: { pageSize: cfg.pageSize || 10, currentPage: 1 },
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
                expect(Array.isArray(resultRows), `data shape for route ${route}`).toBe(true);
                expect(totalRows, `total rows for route ${route}`).toBeGreaterThanOrEqual(0);

                const routeStub = new ActivatedRouteStub();
                const routerStub = new RouterStub();
                routerStub.setCurrentPath(`/${route}/list`);
                const locationStub: any = {
                    go: vi.fn().mockName("Location.go"),
                    path: vi.fn().mockName("Location.path")
                };
                locationStub.path.mockReturnValue(`/${route}/list`);

                const titleStub = { setTitle: vi.fn() };
                const trslStub = { instant: (k: string) => k };
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

                const tableMetadata = metadataRows[0]?._Metadati_Tabelle || {};
                const metaInfo = {
                    columnMetadata: metadataRows,
                    tableMetadata,
                    operators: {}
                } as any;

                dsMock.metaInfo = metaInfo;
                dsMock.fetchInfo$.next({
                    resultInfo: { dato: resultRows, totalRowCount: totalRows, Agg: [] },
                    metaInfo
                });

                expect(component.cols.length, `columns for route ${route}`).toBeGreaterThan(0);
                expect(component.records.length, `records projection for route ${route}`).toBe(resultRows.length);
                expect(component.totalRecords, `total records projection for route ${route}`).toBe(totalRows);

                component.ngOnDestroy();
            }
            catch (err: any) {
                failures.push(`${route}: ${err?.message || err}`);
            }
        }

        expect(failures, failures.join('\n')).toEqual([]);
    });
});


