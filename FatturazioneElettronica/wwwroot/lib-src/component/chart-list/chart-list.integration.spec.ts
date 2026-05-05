import { ensureIntegrationSession } from '../../testing/integration-auth';
import { ChartListComponent } from './chart-list.component';

type ChartIntegrationConfig = {
    baseUrl: string;
    route: string;
    userId: number;
    pageSize?: number;
};

function getConfig(): ChartIntegrationConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.chartList as ChartIntegrationConfig | undefined;
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
        pageSize: Number(cfg.pageSize || 20)
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

describe('ChartListComponent Integration', () => {
    it.skip('loads scaffolded route data and builds chart dataset', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.chartList = { baseUrl, route, userId, pageSize }');
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

        const rows = dataPayload?.results || [];
        if (!Array.isArray(rows) || rows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has no rows to chart.`);
            ;
            return;
        }

        const numericField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'number' || c?.mc_db_column_type === 'int' || c?.mc_db_column_type === 'decimal');
        const labelField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || metadataRows[0];
        if (!numericField || !labelField) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' does not expose suitable label/value fields.`);
            ;
            return;
        }

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
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

        expect(chartData).toBeTruthy();
        expect(Array.isArray(chartData.labels)).toBe(true);
        expect(Array.isArray(chartData.datasets)).toBe(true);
        expect(chartData.datasets.length).toBeGreaterThan(0);
        expect(chartData.datasets.every((ds: any) => Array.isArray(ds?.data))).toBe(true);
        if (chartData.datasets.length > 0) {
            expect(chartData.datasets[0].data.length, `First chart dataset must match labels length for route '${cfg.route}'`).toBe(chartData.labels.length);
        }
    });

    it.skip('e2e applies runtime chart interactions (cutoff + type switch) on scaffolded data', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.chartList = { baseUrl, route, userId, pageSize }');
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

        const rows = dataPayload?.results || [];
        if (!Array.isArray(rows) || rows.length < 2) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' needs at least 2 rows for interaction assertions.`);
            ;
            return;
        }

        const numericField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'number' || c?.mc_db_column_type === 'int' || c?.mc_db_column_type === 'decimal');
        const labelField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || metadataRows[0];
        if (!numericField || !labelField) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' does not expose suitable label/value fields.`);
            ;
            return;
        }

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
        const trslStub = { instant: (k: string) => k };
        const userInfoStub = { isCurrentUserAdmin: () => true, getuserInfo: () => ({ user_id: cfg.userId }) };
        const component = new ChartListComponent(titleStub as any, cdStub as any, routeStub as any, trslStub as any, userInfoStub as any);

        component.metaInfo = {
            tableMetadata: {
                extraProps: {
                    archetypes: {
                        chart: {
                            type: 'bar',
                            dataOptions: {
                                dataProperty: 'dato',
                                cutOffCount: rows.length,
                                datasets: [{
                                        label: 'Integration dataset',
                                        labelField: labelField.mc_nome_colonna,
                                        dataField: numericField.mc_nome_colonna
                                    }]
                            }
                        }
                    }
                },
                md_props_bag: '{}'
            }
        } as any;
        component.totalRecords = rows.length;
        component.lastResultInfo = { dato: rows, totalRowCount: rows.length } as any;
        component.data = component.parseData(component.lastResultInfo as any, rows.length);

        component.onCutoffValueChanged(1);
        expect(component.cutoffValue).toBe(1);
        expect(component.data.labels.length).toBe(1);

        component.selectedChartType = 'line';
        component.onChartTypeChanged();
        expect(component.chartOptions.type).toBe('line');
        expect(component.data.labels.length).toBe(1);
    });
});



