import { ensureIntegrationSession } from '../../testing/integration-auth';
import { BehaviorSubject } from 'rxjs';
import { MapListComponent } from './map-list.component';

type MapListIntegrationConfig = {
    baseUrl: string;
    route: string;
    userId: number;
    pageSize?: number;
};

function getConfig(): MapListIntegrationConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.mapList as MapListIntegrationConfig | undefined;
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

describe('MapListComponent Integration', () => {
    it.skip('loads scaffolded route data and parses geo records', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.mapList = { baseUrl, route, userId, pageSize }');
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
        expect(metadataRows.length).toBeGreaterThan(0);

        const geoColumns = metadataRows.filter((c: any) => c?.mc_ui_column_type === 'point' || c?.mc_ui_column_type === 'polygon');
        if (geoColumns.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has no geo columns (point/polygon).`);
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

        const rows = dataPayload?.results || [];
        expect(Array.isArray(rows)).toBe(true);

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
        const userInfoStub = { isCurrentUserAdmin: () => true, getuserInfo: () => ({ user_id: cfg.userId }) };
        const trslStub = { instant: (k: string) => k };

        const component = new MapListComponent(titleStub as any, cdStub as any, routeStub as any, userInfoStub as any, trslStub as any);
        component.bounds = { extend: vi.fn() } as any;
        component.MARKER_LIB = { CollisionBehavior: { REQUIRED: 'required' } } as any;
        component.metaInfo = { columnMetadata: metadataRows } as any;
        component.archetypeOptions = { titleField: metadataRows[0]?.mc_nome_colonna, infoField: metadataRows[1]?.mc_nome_colonna } as any;

        const parsed = component.parseData(rows);
        expect(Array.isArray(parsed)).toBe(true);
        const markerField = geoColumns.find((c: any) => c?.mc_ui_column_type === 'point')?.mc_nome_colonna;
        const polygonField = geoColumns.find((c: any) => c?.mc_ui_column_type === 'polygon')?.mc_nome_colonna;
        const geoInputRows = rows.filter((r: any) => (!!markerField && !!r[markerField]) || (!!polygonField && !!r[polygonField]));
        if (geoInputRows.length > 0) {
            const mappedGeoRows = parsed.filter((r: any) => r?.__marker || r?.__polygon);
            expect(mappedGeoRows.length, `Rows with geo payload should map to __marker/__polygon for route '${cfg.route}'`).toBeGreaterThan(0);
        }
    });

    it.skip('e2e applies map-boundary filter and pushes maparea condition into datasource', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.mapList = { baseUrl, route, userId, pageSize }');
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

        const pointColumn = metadataRows.find((c: any) => c?.mc_ui_column_type === 'point');
        if (!pointColumn) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has no point column for maparea filtering.`);
            ;
            return;
        }

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
        const userInfoStub = { isCurrentUserAdmin: () => true, getuserInfo: () => ({ user_id: cfg.userId }) };
        const trslStub = { instant: (k: string) => k };

        const dsMock = {
            filterInfo: null as any,
            fetchData: vi.fn()
        };

        const component = new MapListComponent(titleStub as any, cdStub as any, routeStub as any, userInfoStub as any, trslStub as any);
        component.metaInfo = { columnMetadata: metadataRows } as any;
        component.datasource = new BehaviorSubject<any>(dsMock);
        component.map = {
            googleMap: {
                getBounds: () => ({})
            }
        } as any;
        vi.spyOn(component, 'boundsToPolyline').mockReturnValue('POLYGON ((0 0,1 0,1 1,0 1,0 0))');

        component.filterByBoundaries();

        expect(dsMock.filterInfo).toBeTruthy();
        expect(dsMock.filterInfo.filters.length).toBeGreaterThan(0);
        expect(dsMock.filterInfo.filters[0].field).toBe(pointColumn.mc_nome_colonna);
        expect(dsMock.filterInfo.filters[0].operatore).toBe('maparea');
        expect(dsMock.fetchData).toHaveBeenCalled();
    });
});



