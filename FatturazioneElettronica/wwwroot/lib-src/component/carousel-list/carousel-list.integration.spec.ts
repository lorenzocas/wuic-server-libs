import { ensureIntegrationSession } from '../../testing/integration-auth';
import { BehaviorSubject } from 'rxjs';
import { CarouselListComponent } from './carousel-list.component';

type CarouselIntegrationConfig = {
    baseUrl: string;
    route: string;
    userId: number;
    pageSize?: number;
};

function getConfig(): CarouselIntegrationConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.carouselList as CarouselIntegrationConfig | undefined;
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

describe('CarouselListComponent Integration', () => {
    it.skip('loads scaffolded route metadata/data and maps carousel state', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.carouselList = { baseUrl, route, userId, pageSize }');
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
        const totalRows = Number(dataPayload?.totalRowCount ?? rows.length ?? 0);

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
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
            resultInfo: {
                dato: rows,
                totalRowCount: totalRows
            }
        });

        expect(component.metaInfo).toBeTruthy();
        expect(component.archetypeOptions, `Carousel options should be initialized for route '${cfg.route}'`).toBeTruthy();
        expect(Array.isArray(component.data)).toBe(true);
        expect(component.data.length).toBe(rows.length);
        if (rows.length > 0) {
            expect(component.data[0]).toEqual(rows[0]);
        }
    });

    it.skip('e2e applies runtime carousel page-size/config interaction on scaffolded data', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.carouselList = { baseUrl, route, userId, pageSize }');
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
            // pending(`Route '${cfg.route}' has no rows.`);
            ;
            return;
        }

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: () => cfg.route } } };
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
            tableMetadata: metadataRows?.[0]?._Metadati_Tabelle || { extraProps: {}, md_props_bag: '{}' }
        } as any;

        dsMock.fetchInfo$.next({
            metaInfo,
            resultInfo: {
                dato: rows,
                totalRowCount: Number(dataPayload?.totalRowCount ?? rows.length)
            }
        });

        expect(component.data.length).toBe(rows.length);

        const nextPageSize = Math.max(1, Math.min(5, rows.length));
        component.applyPageSizeChange(nextPageSize);
        expect(dsMock.pageSize).toBe(nextPageSize);
        expect(dsMock.currentPage).toBe(1);
        expect(dsMock.fetchData).toHaveBeenCalled();
    });
});




