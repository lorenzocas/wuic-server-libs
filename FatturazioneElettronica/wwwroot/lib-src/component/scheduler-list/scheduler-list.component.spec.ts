import { SchedulerListComponent } from './scheduler-list.component';

describe('SchedulerListComponent', () => {
    const createComponent = () => {
        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const trslStub = { instant: (k: string) => k };

        return new SchedulerListComponent(titleStub as any, cdStub as any, trslStub as any);
    };

    it('parseData maps rows to calendar events and computes allDay for date fields', () => {
        const component = createComponent();
        component.fromField = 'startAt';
        component.toField = 'endAt';
        component.titleField = 'name';
        component.metaInfo = {
            tableMetadata: { md_editable: true },
            columnMetadata: [
                { mc_nome_colonna: 'id', mc_is_primary_key: true, mc_ui_column_type: 'number' },
                { mc_nome_colonna: 'startAt', mc_ui_column_type: 'date' },
                { mc_nome_colonna: 'endAt', mc_ui_column_type: 'date' },
                { mc_nome_colonna: 'name', mc_ui_column_type: 'text' }
            ]
        } as any;

        const events = component.parseData([
            { id: 1, startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-02T00:00:00Z', name: 'Event A' },
            { id: 2, startAt: null, endAt: '2026-01-02T00:00:00Z', name: 'Event B' }
        ]);

        expect(events.length).toBe(1);
        expect(events[0].id).toBe(1);
        expect(events[0].title).toBe('Event A');
        expect(events[0].allDay).toBe(true);
        expect(events[0].editable).toBe(true);
    });

    it('parseData uses titleFunction when provided', () => {
        const component = createComponent();
        component.fromField = 'from';
        component.toField = 'to';
        component.titleField = 'ignored';
        component.titleFunction = (row: any) => `#${row.code}`;
        component.metaInfo = {
            tableMetadata: { md_editable: false },
            columnMetadata: [
                { mc_nome_colonna: 'pk', mc_is_primary_key: true, mc_ui_column_type: 'number' },
                { mc_nome_colonna: 'from', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'to', mc_ui_column_type: 'datetime' }
            ]
        } as any;

        const events = component.parseData([{ pk: 11, from: '2026-01-01T10:00:00Z', to: '2026-01-01T11:00:00Z', code: 'A1' }]);
        expect(events[0].title).toBe('#A1');
        expect(events[0].allDay).toBe(false);
    });

    it('parseDate returns null when date or column metadata is missing', () => {
        const component = createComponent();

        expect(component.parseDate(null, { mc_ui_column_type: 'date' } as any)).toBeNull();
        expect(component.parseDate('2026-01-01', null as any)).toBeNull();
    });

    it('parseData sets editable and durationEditable from table metadata', () => {
        const component = createComponent();
        component.fromField = 'startAt';
        component.toField = 'endAt';
        component.titleField = 'name';
        component.metaInfo = {
            tableMetadata: { md_editable: false },
            columnMetadata: [
                { mc_nome_colonna: 'id', mc_is_primary_key: true, mc_ui_column_type: 'number' },
                { mc_nome_colonna: 'startAt', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'endAt', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'name', mc_ui_column_type: 'text' }
            ]
        } as any;

        const events = component.parseData([{ id: 1, startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z', name: 'Event A' }]);

        expect(events[0].editable).toBe(false);
        expect(events[0].durationEditable).toBe(false);
    });

    it('parseData excludes rows missing either start or end date', () => {
        const component = createComponent();
        component.fromField = 'from';
        component.toField = 'to';
        component.titleField = 'title';
        component.metaInfo = {
            tableMetadata: { md_editable: true },
            columnMetadata: [
                { mc_nome_colonna: 'id', mc_is_primary_key: true, mc_ui_column_type: 'number' },
                { mc_nome_colonna: 'from', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'to', mc_ui_column_type: 'datetime' }
            ]
        } as any;

        const events = component.parseData([
            { id: 1, from: '2026-01-01T10:00:00Z', to: null, title: 'A' },
            { id: 2, from: null, to: '2026-01-01T11:00:00Z', title: 'B' },
            { id: 3, from: '2026-01-01T10:00:00Z', to: '2026-01-01T11:00:00Z', title: 'C' }
        ]);

        expect(events.length).toBe(1);
        expect(events[0].id).toBe(3);
    });

    it('e2e scheduler workflow maps multiple backend-like rows to draggable calendar events', () => {
        const component = createComponent();
        component.fromField = 'from_at';
        component.toField = 'to_at';
        component.titleField = 'subject';
        component.metaInfo = {
            tableMetadata: { md_editable: true },
            columnMetadata: [
                { mc_nome_colonna: 'event_id', mc_is_primary_key: true, mc_ui_column_type: 'number' },
                { mc_nome_colonna: 'from_at', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'to_at', mc_ui_column_type: 'datetime' },
                { mc_nome_colonna: 'subject', mc_ui_column_type: 'text' }
            ]
        } as any;

        const mapped = component.parseData([
            { event_id: 100, from_at: '2026-02-01T09:00:00Z', to_at: '2026-02-01T10:00:00Z', subject: 'Planning' },
            { event_id: 101, from_at: '2026-02-01T11:00:00Z', to_at: '2026-02-01T12:30:00Z', subject: 'Review' }
        ]);

        expect(mapped.length).toBe(2);
        expect(mapped.every((e) => e.start instanceof Date && e.end instanceof Date)).toBe(true);
        expect(mapped.every((e) => e.editable === true && e.durationEditable === true)).toBe(true);
        expect(mapped.map((e) => e.title)).toEqual(['Planning', 'Review']);
    });
});
