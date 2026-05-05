import { ensureIntegrationSession } from '../../testing/integration-auth';
import { ChartListComponent } from './chart-list.component';

type ChartListAllRoutesConfig = {
    baseUrl: string;
    userId: number;
    pageSize?: number;
    maxRoutes?: number;
    includeRoutes?: string[];
    excludeRoutes?: string[];
};

function getConfig(): ChartListAllRoutesConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.chartListAllRoutes as ChartListAllRoutesConfig | undefined;
    if (!cfg?.baseUrl || !Number.isFinite(Number(cfg?.userId))) {
        return null;
    }

    return {
        baseUrl: cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`,
        userId: Number(cfg.userId),
        pageSize: Number(cfg.pageSize || 20),
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

async function discoverScaffoldedRoutes(cfg: ChartListAllRoutesConfig): Promise<string[]> {
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

describe('ChartListComponent Integration (all scaffolded routes)', () => {
    it.skip('loads chart-compatible routes and builds datasets', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.chartListAllRoutes = { baseUrl, userId, pageSize?, maxRoutes?, includeRoutes?, excludeRoutes? }.');
            ;
            return;
        }
        if ((!cfg.includeRoutes || cfg.includeRoutes.length === 0) && (!cfg.excludeRoutes || cfg.excludeRoutes.length === 0)) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('chartListAllRoutes skipped: set includeRoutes or excludeRoutes to run all-routes integration.');
            ;
            return;
        }

        vi.setConfig({ testTimeout: 300000 });

        const routes = await discoverScaffoldedRoutes(cfg);
        expect(routes.length).toBeGreaterThan(0);

        const failures: string[] = [];
        let executedRoutes = 0;

        for (const route of routes) {
            try {
                const metadataRows = await postJson(`${cfg.baseUrl}MetaService.getTableMetadata`, {
                    route,
                    md_id: '',
                    lookup_table_id: 0,
                    user_id: cfg.userId,
                    dm: 1
                });

                const numericField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'number' || c?.mc_db_column_type === 'int' || c?.mc_db_column_type === 'decimal');
                const labelField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || metadataRows[0];
                if (!numericField || !labelField) {
                    continue;
                }

                const dataPayload = await postJson(`${cfg.baseUrl}MetaService.getFlatRecordData`, {
                    user_id: cfg.userId,
                    route,
                    lookup_table_id: 0,
                    SortInfo: [],
                    GroupInfo: [],
                    PageInfo: { pageSize: cfg.pageSize || 20, currentPage: 1 },
                    filterInfo: { logic: 'AND', filters: [] },
                    logicOperator: 'AND',
                    has_server_operation: true,
                    aggregates: [],
                    columnRestrictionList: [],
                    formula_lookup: '',
                    mc_id: 0
                });

                const rows = dataPayload?.results || [];
                if (!rows.length) {
                    continue;
                }

                const titleStub = { setTitle: vi.fn() };
                const cdStub = { detectChanges: vi.fn() };
                const routeStub = { snapshot: { paramMap: { get: () => route } } };
                const trslStub = { instant: (k: string) => k };
                const userInfoStub = { isCurrentUserAdmin: () => true, getuserInfo: () => ({ user_id: cfg.userId }) };
                const component = new ChartListComponent(titleStub as any, cdStub as any, routeStub as any, trslStub as any, userInfoStub as any);

                component.metaInfo = {
                    tableMetadata: {
                        extraProps: {
                            archetypes: {
                                chart: {
                                    dataOptions: {
                                        dataProperty: 'dato',
                                        cutOffCount: cfg.pageSize,
                                        datasets: [{
                                                label: 'Integration dataset',
                                                labelField: labelField.mc_nome_colonna,
                                                dataField: numericField.mc_nome_colonna
                                            }]
                                    }
                                }
                            }
                        }
                    }
                } as any;

                const chartData = component.parseData({
                    dato: rows,
                    totalRowCount: Number(dataPayload?.totalRowCount ?? rows.length ?? 0)
                } as any, cfg.pageSize);

                expect(Array.isArray(chartData?.labels), `chart labels for ${route}`).toBe(true);
                expect(Array.isArray(chartData?.datasets), `chart datasets for ${route}`).toBe(true);
                expect(chartData.datasets.length, `chart datasets count for ${route}`).toBeGreaterThan(0);
                executedRoutes++;
            }
            catch (err: any) {
                failures.push(`${route}: ${err?.message || err}`);
            }
        }

        if (executedRoutes === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('No scaffolded routes expose chart-compatible fields and rows.');
            ;
            return;
        }

        expect(failures, failures.join('\n')).toEqual([]);
    });
});


