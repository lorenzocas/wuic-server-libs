import { MetadataProviderService } from './metadata-provider.service';

describe('MetadataProviderService static contracts', () => {
    it('isMetaRoute recognizes metadata routes', () => {
        expect(MetadataProviderService.isMetaRoute(' metadati  colonne')).toBe(true);
        expect(MetadataProviderService.isMetaRoute('Autorizzazioni tabelle')).toBe(true);
        expect(MetadataProviderService.isMetaRoute('cities')).toBe(false);
    });

    it('getPKeys returns only primary key metadata columns', () => {
        const cols: any[] = [
            { mc_nome_colonna: 'id', mc_is_primary_key: true },
            { mc_nome_colonna: 'name', mc_is_primary_key: false },
            { mc_nome_colonna: 'tenant_id', mc_is_primary_key: true }
        ];

        const pks = MetadataProviderService.getPKeys(cols as any);
        expect(pks.map((c: any) => c.mc_nome_colonna)).toEqual(['id', 'tenant_id']);
    });

    it('getAggregates expands mc_aggregation tokens into field aggregate descriptors', () => {
        const metas: any[] = [
            { ang_name: 'amount', mc_aggregation: 'sum,avg' },
            { ang_name: 'id', mc_aggregation: '' },
            { ang_name: 'qty', mc_aggregation: 'count' }
        ];

        const aggs = MetadataProviderService.getAggregates(metas as any);
        expect(aggs).toEqual([
            { field: 'amount', aggregate: 'sum' },
            { field: 'amount', aggregate: 'avg' },
            { field: 'qty', aggregate: 'count' }
        ]);
    });

    it('getSchemaFromClass builds indexed schema preserving keys and skipping function fields', () => {
        const schema = MetadataProviderService.getSchemaFromClass({ id: 0, route: '', callback__fn: null, name: '' }, 'id', false, ['route']);

        expect(schema).toContain('[route]');
        expect(schema).toContain('name');
        expect(schema).not.toContain('callback__fn');
    });

    it('getTSTypeFromMetaColumn maps UI types to expected TS types', () => {
        expect(MetadataProviderService.getTSTypeFromMetaColumn({ mc_ui_column_type: 'number' } as any)).toBe('number');
        expect(MetadataProviderService.getTSTypeFromMetaColumn({ mc_ui_column_type: 'boolean' } as any)).toBe('boolean');
        expect(MetadataProviderService.getTSTypeFromMetaColumn({ mc_ui_column_type: 'date' } as any)).toBe('Date');
        expect(MetadataProviderService.getTSTypeFromMetaColumn({ mc_ui_column_type: 'unknown' } as any)).toBe('string');
    });

    it('mapMenu normalizes hash routes and preserves tree structure', () => {
        const service = Object.create(MetadataProviderService.prototype) as MetadataProviderService;
        const items: any[] = [];

        service.mapMenu([
            {
                mm_display_string_menu: 'Cities',
                mm_icon: 'pi pi-table',
                mm_uri_menu: '#/cities/list',
                mm_id: 1,
                _Metadati_Menus_Ordered: [
                    {
                        mm_display_string_menu: 'Details',
                        mm_icon: '',
                        mm_uri_menu: '#/cities/detail',
                        mm_id: 2,
                        _Metadati_Menus_Ordered: []
                    }
                ]
            }
        ] as any, items as any);

        expect(items.length).toBe(1);
        expect(items[0].route).toBe('/cities/list');
        expect(items[0].items[0].route).toBe('/cities/detail');
    });

    it('sorts root _Metadati_Custom_Actions_Tabelles by ordine ascending', () => {
        const tableMetadata: any = {
            _Metadati_Custom_Actions_Tabelles: [
                { button_caption: 'late', ordine: 30 },
                { button_caption: 'first', ordine: 10 },
                { button_caption: 'no-order' },
                { button_caption: 'mid', ordine: 20 }
            ]
        };

        (MetadataProviderService as any).sortTableCustomActionsByOrdine(tableMetadata);

        expect(tableMetadata._Metadati_Custom_Actions_Tabelles.map((x: any) => x.button_caption)).toEqual([
            'first',
            'mid',
            'late',
            'no-order'
        ]);
    });
});
