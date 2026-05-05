import { ensureIntegrationSession } from '../../testing/integration-auth';
import { SchedulerListComponent } from './scheduler-list.component';

type SchedulerIntegrationConfig = {
    baseUrl: string;
    route: string;
    userId: number;
    pageSize?: number;
};

function getConfig(): SchedulerIntegrationConfig | null {
    const cfg = (window as any).__WUIC_INTEGRATION__?.schedulerList as SchedulerIntegrationConfig | undefined;
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

function stringifySafe(value: any): string {
    try {
        return JSON.stringify(value);
    }
    catch {
        return '[unserializable]';
    }
}

describe('SchedulerListComponent Integration', () => {
    it.skip('loads scaffolded route data and maps scheduler events', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.schedulerList = { baseUrl, route, userId, pageSize }');
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

        const dateFields = metadataRows.filter((c: any) => c?.mc_ui_column_type === 'date' || c?.mc_ui_column_type === 'datetime' || c?.mc_ui_column_type === 'time');
        if (dateFields.length < 2) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has less than 2 date/datetime/time fields.`);
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
        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const trslStub = { instant: (k: string) => k };
        const component = new SchedulerListComponent(titleStub as any, cdStub as any, trslStub as any);

        const primaryKey = metadataRows.find((c: any) => !!c?.mc_is_primary_key) || metadataRows[0];
        const titleField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || primaryKey;

        component.metaInfo = {
            tableMetadata: { md_editable: true },
            columnMetadata: [
                { ...primaryKey, mc_is_primary_key: true },
                ...metadataRows.filter((c: any) => c !== primaryKey)
            ]
        } as any;
        component.fromField = dateFields[0].mc_nome_colonna;
        component.toField = dateFields[1].mc_nome_colonna;
        component.titleField = titleField.mc_nome_colonna;

        const mappedEvents = component.parseData(rows);
        expect(Array.isArray(mappedEvents)).toBe(true);
        if (mappedEvents.length > 0) {
            expect(mappedEvents.every((e: any) => e?.id !== undefined && e?.start instanceof Date && e?.end instanceof Date), `Scheduler mapped events should expose id/start/end for route '${cfg.route}'`).toBe(true);
        }
    });

    it.skip('e2e enforces scheduler event contract (id/start/end/editable) for scaffolded route', async () => {
        const cfg = getConfig();
        if (!cfg) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending('Set window.__WUIC_INTEGRATION__.schedulerList = { baseUrl, route, userId, pageSize }');
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

        const dateFields = metadataRows.filter((c: any) => c?.mc_ui_column_type === 'date' || c?.mc_ui_column_type === 'datetime' || c?.mc_ui_column_type === 'time');
        if (dateFields.length < 2) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has less than 2 date/datetime/time fields.`);
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
        if (!Array.isArray(rows) || rows.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' has no rows.`);
            ;
            return;
        }

        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const trslStub = { instant: (k: string) => k };
        const component = new SchedulerListComponent(titleStub as any, cdStub as any, trslStub as any);

        const primaryKey = metadataRows.find((c: any) => !!c?.mc_is_primary_key) || metadataRows[0];
        const titleField = metadataRows.find((c: any) => c?.mc_ui_column_type === 'text') || primaryKey;
        const editable = true;

        component.metaInfo = {
            tableMetadata: { md_editable: editable },
            columnMetadata: [
                { ...primaryKey, mc_is_primary_key: true },
                ...metadataRows.filter((c: any) => c !== primaryKey)
            ]
        } as any;
        component.fromField = dateFields[0].mc_nome_colonna;
        component.toField = dateFields[1].mc_nome_colonna;
        component.titleField = titleField.mc_nome_colonna;

        const mappedEvents = component.parseData(rows);
        if (mappedEvents.length === 0) {
            // TODO: vitest-migration: The pending() function was converted to a skipped test (`it.skip`). See: https://vitest.dev/api/vi.html#it-skip
            // pending(`Route '${cfg.route}' rows cannot be mapped into valid scheduler events.`);
            ;
            return;
        }

        expect(mappedEvents.every((e: any) => e?.id !== undefined)).toBe(true);
        expect(mappedEvents.every((e: any) => e?.start instanceof Date && e?.end instanceof Date)).toBe(true);
        expect(mappedEvents.every((e: any) => e?.editable === editable && e?.durationEditable === editable)).toBe(true);

        const titleDiagnostics = mappedEvents.map((e: any, idx: number) => ({
            index: idx,
            type: e?.title === null ? 'null' : typeof e?.title,
            isNull: e?.title == null,
            isString: typeof e?.title === 'string',
            isNonEmptyString: typeof e?.title === 'string' && e.title.trim().length > 0
        }));
        console.log(`[Scheduler Integration] route=${cfg.route} titleDiagnostics=${stringifySafe(titleDiagnostics)}`);

        const nonStringTitleEvent = mappedEvents.find((e: any) => e?.title != null && typeof e?.title !== 'string');
        expect(nonStringTitleEvent, nonStringTitleEvent
            ? `Title is non-null and non-string. titleType=${typeof nonStringTitleEvent.title}; event=${stringifySafe(nonStringTitleEvent)}`
            : 'All non-null titles are strings').toBeUndefined();

        expect(mappedEvents.every((e: any) => e?.title == null || (typeof e?.title === 'string' && e.title.trim().length > 0)), `Expected title null or non-empty string; diagnostics=${stringifySafe(titleDiagnostics)}`).toBe(true);
    });
});



