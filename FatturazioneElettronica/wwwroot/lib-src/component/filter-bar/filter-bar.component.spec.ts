import { BehaviorSubject } from 'rxjs';
import { FilterBarComponent } from './filter-bar.component';

describe('filter-bar.component.spec', () => {
    function createComponent() {
        const router: any = {
            createUrlTree: vi.fn().mockReturnValue({}),
            serializeUrl: vi.fn().mockReturnValue('/next')
        };
        const aroute: any = {};
        const location: any = {
            path: vi.fn().mockReturnValue('/current'),
            go: vi.fn()
        };

        const trnslStub: any = { instant: (k: string) => k };
        const component = new FilterBarComponent(router, aroute, location, trnslStub);
        const ds: any = {
            filterInfo: { logic: 'AND', filters: [] },
            fetchData: vi.fn().mockResolvedValue({}),
            currentPage: 1,
            pageSize: 10,
            cursorMode: false,
            sortInfo: [],
            groupInfo: [],
            aggregationInfo: [],
            metaInfo: { tableMetadata: { preventNavigateOnFilter: false } }
        };

        component.datasource = new BehaviorSubject<any>(ds);
        component.filterDescriptor = {
            name: new BehaviorSubject<any>('Rome'),
            name__lookup_obj: new BehaviorSubject<any>(null)
        } as any;
        component.metas = [{ mc_nome_colonna: 'name', mc_display_string_in_view: 'Name', mc_ui_column_type: 'text' } as any];
        component.metaInfo = {
            operators: { name: 'contains' },
            tableMetadata: {},
            columnMetadata: component.metas
        } as any;

        return { component, ds };
    }

    it('applyAdvancedFilter writes nested filterInfo to datasource', async () => {
        const { component, ds } = createComponent();
        component.advancedFilter = {
            logic: 'OR',
            filters: [
                { field: 'name', operatore: 'contains', value: 'Rom' },
                {
                    nestedFilters: {
                        logic: 'AND',
                        filters: [
                            { field: 'country', operatore: 'eq', value: 'IT' },
                            {
                                nestedFilters: {
                                    logic: 'OR',
                                    filters: [
                                        { field: 'status', operatore: 'eq', value: 'OPEN' },
                                        { field: 'status', operatore: 'eq', value: 'PENDING' }
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        } as any;

        await component.applyAdvancedFilter();

        expect(ds.fetchData).toHaveBeenCalled();
        expect(ds.filterInfo.logic).toBe('OR');
        expect(ds.filterInfo.filters[1].nestedFilters.logic).toBe('AND');
        expect(ds.filterInfo.filters[1].nestedFilters.filters[1].nestedFilters.logic).toBe('OR');
    });

    it('basic filter resets advanced structure (mutually exclusive mode)', async () => {
        const { component, ds } = createComponent();
        ds.filterInfo = {
            logic: 'OR',
            filters: [
                {
                    nestedFilters: {
                        logic: 'AND',
                        filters: [{ field: 'country', operatore: 'eq', value: 'IT' }]
                    }
                }
            ]
        };

        await component.filter();

        expect(ds.fetchData).toHaveBeenCalled();
        expect(ds.filterInfo.logic).toBe('AND');
        expect(Array.isArray(ds.filterInfo.filters)).toBe(true);
        expect(ds.filterInfo.filters.some((x: any) => !!x?.nestedFilters)).toBe(false);
        expect(component.advancedFilter.filters.length).toBe(0);
    });
});
