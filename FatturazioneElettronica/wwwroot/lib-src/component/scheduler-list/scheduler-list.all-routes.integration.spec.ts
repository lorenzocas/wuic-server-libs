import { ensureIntegrationSession } from '../../testing/integration-auth';
import { SchedulerListComponent } from './scheduler-list.component';

type SchedulerListAllRoutesConfig = {
    baseUrl: string;
    userId: number;
    pageSize?: number;
    maxRoutes?: number;
    includeRoutes?: string[];
    excludeRoutes?: string[];
};

function getConfig(): SchedulerListAllRoutesConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.schedulerListAllRoutes as SchedulerListAllRoutesConfig | undefined;
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

async function discoverScaffoldedRoutes(cfg: SchedulerListAllRoutesConfig): Promise<string[]> {
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

describe('SchedulerListComponent Integration (all scaffolded routes)', () => {
    it.skip('loads scheduler-compatible routes and maps calendar events', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.schedulerListAllRoutes = { baseUrl, userId, pageSize?, maxRoutes?, includeRoutes?, excludeRoutes? }.');
            ;
            return;
        }
        if ((!cfg.includeRoutes || cfg.includeRoutes.length === 0) && (!cfg.excludeRoutes || cfg.excludeRoutes.length === 0)) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('schedulerListAllRoutes skipped: set includeRoutes or excludeRoutes to run all-routes integration.');
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

                const dateFields = (metadataRows || []).filter((c: any) => c?.mc_ui_column_type === 'date' || c?.mc_ui_column_type === 'datetime' || c?.mc_ui_column_type === 'time');
                if (dateFields.length < 2) {
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
                const titleStub = { setTitle: vi.fn() };
                const cdStub = { detectChanges: vi.fn() };
                const trslStub = { instant: (k: string) => k };
                const component = new SchedulerListComponent(titleStub as any, cdStub as any, trslStub as any);

                const primaryKey = metadataRows.find((c: any) => !!c?.mc_is_primary_key) || metadataRows[0];
                const titleField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || primaryKey;

                component.metaInfo = {
                    tableMetadata: { md_editable: true },
                    columnMetadata: [{ ...primaryKey, mc_is_primary_key: true }, ...metadataRows.filter((c: any) => c !== primaryKey)]
                } as any;
                component.fromField = dateFields[0].mc_nome_colonna;
                component.toField = dateFields[1].mc_nome_colonna;
                component.titleField = titleField.mc_nome_colonna;

                const mapped = component.parseData(rows);
                expect(Array.isArray(mapped), `scheduler events for ${route}`).toBe(true);
                executedRoutes++;
            }
            catch (err: any) {
                failures.push(`${route}: ${err?.message || err}`);
            }
        }

        if (executedRoutes === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('No scaffolded routes expose at least 2 date/datetime/time fields.');
            ;
            return;
        }

        expect(failures, failures.join('\n')).toEqual([]);
    });
});


