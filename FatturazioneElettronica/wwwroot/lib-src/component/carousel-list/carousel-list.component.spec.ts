import { BehaviorSubject } from 'rxjs';
import { CarouselListComponent } from './carousel-list.component';
import { DynamicGenericTemplateComponent } from '../dynamic-generic-template/dynamic-generic-template.component';

describe('CarouselListComponent', () => {
    const createComponent = () => {
        const titleStub = { setTitle: vi.fn() };
        const cdStub = { detectChanges: vi.fn() };
        const routeStub = { snapshot: { paramMap: { get: (key: string) => key === 'route' ? 'carousel' : null } } };
        const trslStub = { instant: (k: string) => k };
        const userInfoStub = {
            isCurrentUserAdmin: vi.fn().mockReturnValue(true),
            getuserInfo: vi.fn().mockReturnValue({ user_id: 1 })
        };

        return new CarouselListComponent(titleStub as any, cdStub as any, routeStub as any, trslStub as any, userInfoStub as any);
    };

    it('applyPageSizeChange clamps value, resets page and fetches data', () => {
        const component = createComponent();
        const ds = {
            pageSize: 10,
            currentPage: 5,
            fetchData: vi.fn()
        };

        component.datasource = new BehaviorSubject<any>(ds);
        component.pageSizeMax = 30;
        component.configDraft.pageSize = 10;
        component.archetypeOptions = {} as any;

        component.applyPageSizeChange(100);

        expect(component.configDraft.pageSize).toBe(30);
        expect(ds.pageSize).toBe(30);
        expect(ds.currentPage).toBe(1);
        expect(ds.fetchData).toHaveBeenCalled();
    });

    it('applyConfig updates archetype options and persists md_props_bag', () => {
        const component = createComponent();
        const ds = {
            pageSize: 10,
            currentPage: 1,
            fetchData: vi.fn()
        };

        component.datasource = new BehaviorSubject<any>(ds);
        component.pageSizeMax = 50;
        component.metaInfo = {
            columnMetadata: [
                { mc_nome_colonna: 'img', mc_ui_column_type: 'upload', isImageUpload: true },
                { mc_nome_colonna: 'desc', mc_ui_column_type: 'text' }
            ],
            tableMetadata: {
                extraProps: {},
                md_props_bag: '{}'
            }
        } as any;
        component.archetypeOptions = {} as any;
        component.configDraft = {
            imageFieldName: 'img',
            descriptionFieldName: 'desc',
            imageWidth: 320,
            pageSize: 12,
            itemTemplateString: '<div>item</div>',
            numVisible: 2,
            numScroll: 1,
            usePreview: true
        };

        vi.spyOn(DynamicGenericTemplateComponent, 'getComponentFromTemplate').mockReturnValue(class {
        } as any);

        component.applyConfig();

        expect(component.archetypeOptions.imageFieldName).toBe('img');
        expect(component.archetypeOptions.imageWidth).toBe(320);
        expect(component.metaInfo.tableMetadata.extraProps.archetypes.carousel).toBeTruthy();
        expect(component.metaInfo.tableMetadata.md_props_bag).toContain('carousel');
    });

    it('parseData returns the original dataset reference', () => {
        const component = createComponent();
        const source = [{ id: 1 }, { id: 2 }];

        expect(component.parseData(source as any)).toBe(source as any);
    });

    it('suggestItemTemplate injects a default carousel template snippet', () => {
        const component = createComponent();
        component.suggestItemTemplate();

        expect(component.configDraft.itemTemplateString).toContain('<wuic-image-wrapper');
        expect(component.configDraft.itemTemplateString).toContain('descriptionFieldName');
    });

    it('openConfigDialog hydrates options from md_props_bag and opens popup', () => {
        const component = createComponent();
        component.metaInfo = {
            columnMetadata: [{ mc_nome_colonna: 'img', mc_ui_column_type: 'upload', isImageUpload: true }],
            tableMetadata: {
                md_props_bag: JSON.stringify({ archetypes: { carousel: { imageFieldName: 'img', pageSize: 25 } } }),
                extraProps: {}
            }
        } as any;
        component.archetypeOptions = {} as any;

        component.openConfigDialog();

        expect(component.showConfigDialog).toBe(true);
        expect(component.archetypeOptions.imageFieldName).toBe('img');
        expect(component.configDraft.pageSize).toBe(25);
    });

    it('applyPageSizeChange is a no-op when datasource is missing', () => {
        const component = createComponent();
        component.datasource = undefined as any;
        component.archetypeOptions = {} as any;
        component.configDraft.pageSize = 10;

        expect(() => component.applyPageSizeChange(20)).not.toThrow();
    });

    it('e2e carousel workflow hydrates state from datasource fetchInfo$ and applies runtime config', () => {
        const component = createComponent();
        const ds = {
            fetchInfo$: new BehaviorSubject<any>(null),
            pageSize: 5,
            currentPage: 1,
            fetchData: vi.fn()
        };
        component.datasource = new BehaviorSubject<any>(ds);

        component.ngOnInit();
        ds.fetchInfo$.next({
            metaInfo: {
                columnMetadata: [
                    { mc_nome_colonna: 'image', mc_ui_column_type: 'upload', isImageUpload: true },
                    { mc_nome_colonna: 'description', mc_ui_column_type: 'text' }
                ],
                tableMetadata: {
                    md_display_string: 'Carousel',
                    md_route_name: 'carousel',
                    md_props_bag: '{}',
                    extraProps: {}
                }
            },
            resultInfo: {
                dato: [{ id: 1, image: '/a.png', description: 'A' }, { id: 2, image: '/b.png', description: 'B' }],
                totalRowCount: 2
            }
        });

        expect(component.data.length).toBe(2);
        expect(component.metaInfo).toBeTruthy();
        expect(component.archetypeOptions).toBeTruthy();

        component.configDraft.pageSize = 2;
        component.applyPageSizeChange(2);

        expect(ds.pageSize).toBe(2);
        expect(ds.currentPage).toBe(1);
        expect(ds.fetchData).toHaveBeenCalled();
    });
});

