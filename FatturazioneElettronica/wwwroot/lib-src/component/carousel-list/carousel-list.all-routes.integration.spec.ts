import { ensureIntegrationSession } from '../../testing/integration-auth';
import { BehaviorSubject } from 'rxjs';
import { CarouselListComponent } from './carousel-list.component';

type CarouselListAllRoutesConfig = {
    baseUrl: string;
    userId: number;
    pageSize?: number;
    maxRoutes?: number;
    includeRoutes?: string[];
    excludeRoutes?: string[];
};

function getConfig(): CarouselListAllRoutesConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.carouselListAllRoutes as CarouselListAllRoutesConfig | undefined;
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
    if (!value || value.startsWith('__') || value.toLowerCase().includes('metadati')) {
        return null;
    }

    return value;
}

async function discoverScaffoldedRoutes(cfg: CarouselListAllRoutesConfig): Promise<string[]> {
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

    const set = new Set<string>();
    (payload?.results || []).forEach((row: any) => {
        const route = normalizeRouteName(row?.md_route_name);
        if (route) {
            set.add(route);
        }
    });

    let routes = [...set];
    if (cfg.includeRoutes?.length) {
        const include = new Set(cfg.includeRoutes.map(r => r.trim()));
        routes = routes.filter(r => include.has(r));
    }

    if (cfg.excludeRoutes?.length) {
        const exclude = new Set(cfg.excludeRoutes.map(r => r.trim()));
        routes = routes.filter(r => !exclude.has(r));
    }

    if (cfg.maxRoutes && cfg.maxRoutes > 0) {
        routes = routes.slice(0, cfg.maxRoutes);
    }

    return routes;
}

describe('CarouselListComponent Integration (all scaffolded routes)', () => {
    it.skip('loads metadata/data and maps carousel items for discovered routes', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.carouselListAllRoutes = { baseUrl, userId, pageSize?, maxRoutes?, includeRoutes?, excludeRoutes? }.');
            ;
            return;
        }
        if ((!cfg.includeRoutes || cfg.includeRoutes.length === 0) && (!cfg.excludeRoutes || cfg.excludeRoutes.length === 0)) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('carouselListAllRoutes skipped: set includeRoutes or excludeRoutes to run all-routes integration.');
            ;
            return;
        }

        vi.setConfig({ testTimeout: 300000 });

        const routes = await discoverScaffoldedRoutes(cfg);
        expect(routes.length).toBeGreaterThan(0);

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

                const rows = dataPayload?.results || [];
                const totalRows = Number(dataPayload?.totalRowCount ?? rows.length ?? 0);

                const titleStub = { setTitle: vi.fn() };
                const cdStub = { detectChanges: vi.fn() };
                const routeStub = { snapshot: { paramMap: { get: () => route } } };
                const trslStub = { instant: (k: string) => k };
                const userInfoStub = { isCurrentUserAdmin: () => true, getuserInfo: () => ({ user_id: cfg.userId }) };
                const dsMock = {
                    fetchInfo$: new BehaviorSubject<any>(null),
                    pageSize: cfg.pageSize,
                    currentPage: 1,
                    fetchData: vi.fn()
                };

                const component = new CarouselListComponent(titleStub as any, cdStub as any, routeStub as any, trslStub as any, userInfoStub as any);
                component.datasource = new BehaviorSubject<any>(dsMock);
                component.ngOnInit();

                const metaInfo = {
                    columnMetadata: metadataRows,
                    tableMetadata: metadataRows?.[0]?._Metadati_Tabelle || { extraProps: {} }
                } as any;

                dsMock.fetchInfo$.next({
                    metaInfo,
                    resultInfo: { dato: rows, totalRowCount: totalRows }
                });

                expect(Array.isArray(component.data), `carousel data for ${route}`).toBe(true);
                expect(component.data.length, `carousel data length for ${route}`).toBe(rows.length);
            }
            catch (err: any) {
                failures.push(`${route}: ${err?.message || err}`);
            }
        }

        expect(failures, failures.join('\n')).toEqual([]);
    });
});



