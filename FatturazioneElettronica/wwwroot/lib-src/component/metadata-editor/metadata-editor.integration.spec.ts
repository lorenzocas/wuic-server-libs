import { BehaviorSubject, Subject } from 'rxjs';
import { MetadataEditorComponent } from './metadata-editor.component';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';

function createDatasource(route: string = ''): any {
    const ds: any = {
        hardcodedRoute: route,
        route: new BehaviorSubject<string>(route),
        metaInfo: { tableMetadata: {}, columnMetadata: [] },
        resultInfo: { current: null, dato: [] },
        fetchInfo$: new BehaviorSubject<any>(null),
        filterInfo: { logic: 'AND', filters: [] },
        filterDescriptor: {},
        getSchemaAndData: vi.fn().mockResolvedValue(undefined),
        fetchData: vi.fn().mockImplementation(async () => ({
            resultInfo: { dato: ds.resultInfo.dato || [], current: ds.resultInfo.current || null }
        })),
        getModelFromObservable: vi.fn().mockImplementation((x: any) => x),
        setCurrent: vi.fn().mockImplementation((x: any) => { ds.resultInfo.current = x; }),
        addNewRecord: vi.fn().mockImplementation((seed: any) => { ds.resultInfo.current = seed; }),
        syncData: vi.fn().mockResolvedValue(undefined)
    };
    return ds;
}

function createComponent() {
    const trslSrv: any = {
        ensureTranslationsLoaded: vi.fn().mockResolvedValue(undefined),
        translationsLoaded$: new BehaviorSubject<boolean>(false),
        instant: (k: string) => k,
        format: (tpl: string, arg: string) => tpl.replace('{0}', arg)
    };
    const metaSrv: any = {
        getReportList: vi.fn().mockResolvedValue([]),
        getMetadati: vi.fn().mockResolvedValue([])
    };
    const router: any = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    const userInfoSrv: any = { getuserInfo: () => ({ user_id: 11, role_id: 2 }), isCurrentUserAdmin: () => true };
    const hostEl: any = { nativeElement: { querySelector: vi.fn().mockReturnValue(null) } };

    const component = new MetadataEditorComponent(trslSrv, metaSrv, router, userInfoSrv, hostEl);
    component.datasource = new BehaviorSubject<any>(createDatasource('route-b'));
    component.datasourceTabelle = createDatasource(' metadati  tabelle');
    component.datasourceColonne = createDatasource(' metadati  colonne');
    component.datasourceRelatedMetadata = createDatasource('_Metadati_Custom_Actions_Tabelle');
    component.metaInfo = {
        tableMetadata: {
            md_id: 55,
            md_route_name: 'route-b',
            md_display_string: 'Route B',
            _Metadati_Custom_Actions_Tabelles: [{ Id: 200, button_caption: 'Run' }]
        },
        columnMetadata: [
            { mc_id: 101, mc_nome_colonna: 'Name', mc_display_string_in_view: 'Name', mc_ui_column_type: 'text' },
            { mc_id: 102, mc_nome_colonna: 'Go', mc_display_string_in_view: 'Go', mc_ui_column_type: 'button', mc_button_caption: 'Go' }
        ]
    } as any;

    return { component, metaSrv };
}

describe('MetadataEditorComponent integration', () => {
    beforeEach(() => {
        (WtoolboxService as any).appSettings = { global_root_url: 'http://localhost/' };
        (WtoolboxService as any).dialogService = {
            open: vi.fn().mockImplementation(() => ({ onClose: new Subject<any>() }))
        };
        (WtoolboxService as any).confirm = vi.fn().mockResolvedValue(true);
        (WtoolboxService as any).http = {
            post: vi.fn().mockReturnValue({ toPromise: async () => [] })
        };
        (WtoolboxService as any).messageNotificationService = { add: vi.fn() };

        (MetadataProviderService as any).metatableActionRoute = '_Metadati_Custom_Actions_Tabelle';
        (MetadataProviderService as any).metatableAuthRoute = '_Metadati_Utenti_Autorizzazioni_Tabelle';
        (MetadataProviderService as any).metatableColumnAuthRoute = '_Metadati_Utenti_Autorizzazioni_Colonne';
        (MetadataProviderService as any).metatableStyleRoute = '_Metadati_UI_Stili_Tabelle';
        (MetadataProviderService as any).metatableColumnStyleRoute = '_Metadati_UI_Stili_Colonne';
        (MetadataProviderService as any).metaColumnRoute = ' metadati  colonne';
        (MetadataProviderService as any).MetaDB = { tables: [] };
    });

    it('builds related metadata section with insert and record actions', async () => {
        const { component } = createComponent();
        (component as any).viewReady = true;
        (component as any).rebuildMenuItems();
        await (component as any).refreshExtendedMetadataMenuItems();

        const root = (component.items || []).find((x: any) => x.id === 'related-metadata-root');
        expect(root).toBeTruthy();
        const labels = (root.items || []).map((x: any) => x.label).filter(Boolean);
        expect(labels).toContain('Table Actions');
        expect(labels).toContain('Column Actions');
        expect(labels).toContain('Run');
        expect(labels).toContain('Go');
    });

    it('opens insert related metadata action and primes datasource state', async () => {
        const { component } = createComponent();
        (component as any).viewReady = true;
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({ id: 'insert-meta-custom-actions' });

        expect(component.datasourceRelatedMetadata.getSchemaAndData).toHaveBeenCalled();
        expect(component.datasourceRelatedMetadata.addNewRecord).toHaveBeenCalled();
        expect((component as any).openEditDialog).toHaveBeenCalled();
    });

    it('uses local in-memory context for related auth edit when saveCallback is provided', async () => {
        const { component } = createComponent();
        component.saveCallback = () => true;
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'muat_id' }, { mc_nome_colonna: 'md_id' }, { mc_nome_colonna: 'muat_view' }]
        } as any;
        component.datasourceRelatedMetadata.resultInfo.current = {};
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({
            info: {
                muat_id: -1,
                muat_view: true
            }
        });

        expect(component.datasourceRelatedMetadata.setCurrent).toHaveBeenCalled();
        expect(component.datasourceRelatedMetadata.fetchData).not.toHaveBeenCalled();
        expect((component as any).openEditDialog).toHaveBeenCalledWith(component.datasourceRelatedMetadata, expect.any(String), undefined);
    });

    it('shows in-memory table authorization rows with temporary negative muat_id', async () => {
        const { component } = createComponent();
        component.saveCallback = () => true;
        (component as any).viewReady = true;

        (component.metaInfo.tableMetadata as any)._Metadati_Utenti_Autorizzazioni_Tabelles = [
            { muat_id: -1, md_id: 55, id_ruolo: 3, muat_view: true, muat_edit: false, muat_insert: true, muat_delete: false }
        ];

        (component as any).rebuildMenuItems();
        await (component as any).refreshExtendedMetadataMenuItems();

        const root = (component.items || []).find((x: any) => x.id === 'related-metadata-root');
        const labels = (root?.items || []).map((x: any) => String(x?.label || ''));
        expect(labels.some((x: string) => x.includes('Role 3'))).toBe(true);
    });

    it('opens related table authorization editor using section context instead of md_id fallback', async () => {
        const { component } = createComponent();
        component.saveCallback = () => true;
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'muat_id' }, { mc_nome_colonna: 'md_id' }]
        } as any;
        component.datasourceRelatedMetadata.resultInfo.current = {};
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({
            info: { muat_id: -1, md_id: 55, muat_view: true },
            editorKey: 'muat_id'
        });

        expect(component.datasourceRelatedMetadata.setCurrent).toHaveBeenCalled();
        expect((component as any).openEditDialog).toHaveBeenCalledWith(component.datasourceRelatedMetadata, expect.any(String), 'muat_id');
    });

    it('opens related column authorization editor by section context even when mc_id is present', async () => {
        const { component } = createComponent();
        component.saveCallback = () => true;
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'muac_id' }, { mc_nome_colonna: 'mc_id' }]
        } as any;
        component.datasourceRelatedMetadata.resultInfo.current = {};
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({
            info: { muac_id: -2, mc_id: 101, muac_view: true },
            editorKey: 'muac_id'
        });

        expect(component.datasourceRelatedMetadata.setCurrent).toHaveBeenCalled();
        expect((component as any).openEditDialog).toHaveBeenCalledWith(component.datasourceRelatedMetadata, expect.any(String), 'muac_id');
    });

    it('opens table style and column style editors by section context', async () => {
        const { component } = createComponent();
        component.saveCallback = () => true;
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'must_id' }, { mc_nome_colonna: 'musc_id' }, { mc_nome_colonna: 'mc_id' }]
        } as any;
        component.datasourceRelatedMetadata.resultInfo.current = {};
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({
            info: { must_id: -3, md_id: 55, must_attribute_name: 'wuic-row-style-applied' },
            editorKey: 'must_id'
        });
        await component.openEditor({
            info: { musc_id: -4, mc_id: 101, musc_attribute_name: 'color' },
            editorKey: 'musc_id'
        });

        expect((component as any).openEditDialog).toHaveBeenCalledTimes(2);
        expect(vi.mocked((component as any).openEditDialog).mock.calls[0][0]).toBe(component.datasourceRelatedMetadata);
        expect(vi.mocked((component as any).openEditDialog).mock.calls[1][0]).toBe(component.datasourceRelatedMetadata);
    });
});

