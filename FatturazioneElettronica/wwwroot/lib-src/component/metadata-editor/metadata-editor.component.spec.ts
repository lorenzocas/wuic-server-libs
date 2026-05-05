import { BehaviorSubject, Subject } from 'rxjs';
import { MetadataEditorComponent } from './metadata-editor.component';
import { WtoolboxService } from '../../service/wtoolbox.service';
import { MetadataProviderService } from '../../service/metadata-provider.service';

function createDatasourceStub(route: string = ''): any {
    const ds: any = {
        hardcodedRoute: route,
        route: new BehaviorSubject<string>(route),
        metaInfo: { tableMetadata: {}, columnMetadata: [] },
        resultInfo: { current: null, dato: [] },
        filterInfo: { logic: 'AND', filters: [] as any[] },
        filterDescriptor: {},
        fetchInfo$: new BehaviorSubject<any>(null),
        getSchemaAndData: vi.fn().mockResolvedValue(undefined),
        fetchData: vi.fn().mockImplementation(async () => ({
            resultInfo: {
                dato: ds.resultInfo?.dato || [],
                current: ds.resultInfo?.current || null
            }
        })),
        getModelFromObservable: vi.fn().mockImplementation((x: any) => x),
        setCurrent: vi.fn().mockImplementation((x: any) => { ds.resultInfo.current = x; }),
        addNewRecord: vi.fn().mockImplementation((seed: any) => { ds.resultInfo.current = seed; }),
        syncData: vi.fn().mockResolvedValue(undefined)
    };

    return ds;
}

function createHarness() {
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
    const userInfoSrv: any = {
        getuserInfo: () => ({ user_id: 7, role_id: 1 }),
        isCurrentUserAdmin: () => true
    };
    const hostEl: any = {
        nativeElement: {
            querySelector: vi.fn().mockReturnValue(null)
        }
    };

    const component = new MetadataEditorComponent(trslSrv, metaSrv, router, userInfoSrv, hostEl);
    component.datasource = new BehaviorSubject<any>(createDatasourceStub('route-a'));
    component.datasourceTabelle = createDatasourceStub(' metadati  tabelle');
    component.datasourceColonne = createDatasourceStub(' metadati  colonne');
    component.datasourceRelatedMetadata = createDatasourceStub('_Metadati_Custom_Actions_Tabelle');
    component.metaInfo = {
        tableMetadata: { md_id: 10, md_route_name: 'route-a', md_display_string: 'Route A' },
        columnMetadata: [
            { mc_id: 1, mc_nome_colonna: 'Name', mc_display_string_in_view: 'Name', mc_ui_column_type: 'text' },
            { mc_id: 2, mc_nome_colonna: 'Btn1', mc_display_string_in_view: 'Btn1', mc_ui_column_type: 'button', mc_button_caption: 'Do It' }
        ]
    } as any;

    return { component, trslSrv, metaSrv, router };
}

describe('metadata-editor.component', () => {
    beforeEach(() => {
        (WtoolboxService as any).appSettings = { global_root_url: 'http://localhost/' };
        (WtoolboxService as any).dialogService = {
            open: vi.fn().mockImplementation(() => ({ onClose: new Subject<any>() }))
        };
        (WtoolboxService as any).promptDialog = vi.fn();
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

    it('builds base metadata menu with column actions', () => {
        const { component } = createHarness();
        (component as any).rebuildMenuItems();

        expect(component.items?.length).toBeGreaterThan(0);
        expect(component.items?.[0]?.label).toBe('Metadata');
        const metadataItems = component.items?.[0]?.items || [];
        expect(metadataItems.some((x: any) => x.id === 'insert-column')).toBe(true);
        expect(metadataItems.some((x: any) => x.id === 'sync-metadata-from-schema')).toBe(true);
        expect(metadataItems.some((x: any) => x.label === 'Name')).toBe(true);
        expect(metadataItems.some((x: any) => x.label === 'Btn1')).toBe(false);
    });

    it('dispatches menu click to command', () => {
        const { component } = createHarness();
        const cmd = vi.fn();
        const event: any = { preventDefault: vi.fn() };

        component.onMenuItemClick(event as Event, { command: cmd, disabled: false });

        expect(event.preventDefault).toHaveBeenCalled();
        expect(cmd).toHaveBeenCalled();
    });

    it('opens report designer for create-report menu item', async () => {
        const { component, router } = createHarness();
        const item = { id: 'create-report' } as any;

        await component.openEditor(item);

        expect(router.navigateByUrl).toHaveBeenCalled();
        const target = String(vi.mocked(router.navigateByUrl).mock.lastCall[0]);
        expect(target).toContain('/route-a/report-designer?reportName=');
    });

    it('routes column editor lookup by mc_id and opens edit dialog', async () => {
        const { component } = createHarness();
        component.datasourceColonne.resultInfo.dato = [{ mc_id: 1, mc_nome_colonna: 'Name' }];
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({ info: { mc_id: 1 } });

        expect(component.datasourceColonne.fetchData).toHaveBeenCalled();
        expect((component as any).openEditDialog).toHaveBeenCalled();
    });

    it('deletes related metadata through configured strategy', async () => {
        const { component } = createHarness();
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'muat_id' }]
        } as any;
        vi.spyOn<any>(component, 'reloadMetadataEditorState').mockResolvedValue(undefined);

        await (component as any).deleteRelatedMetadataItem({
            label: 'Auth row',
            deleteKey: 'muat_id',
            info: { muat_id: 11 }
        });

        expect(component.datasourceRelatedMetadata.syncData).toHaveBeenCalled();
        expect((component as any).reloadMetadataEditorState).toHaveBeenCalled();
    });

    it('in embedded mode (saveCallback) refreshes only in-memory menu on dialog close', async () => {
        const { component } = createHarness();
        const close$ = new Subject<any>();
        (WtoolboxService as any).dialogService.open = vi.fn().mockReturnValue({ onClose: close$ });
        component.saveCallback = () => true;
        (component as any).viewReady = true;

        vi.spyOn<any>(component, 'rebuildMenuItems');
        vi.spyOn<any>(component, 'refreshExtendedMetadataMenuItems').mockResolvedValue(undefined);
        vi.spyOn<any>(component, 'reloadMetadataEditorState').mockResolvedValue(undefined);

        (component as any).openEditDialog(component.datasourceRelatedMetadata, 'insert');
        close$.next({ muat_view: true });
        await Promise.resolve();

        expect((component as any).rebuildMenuItems).toHaveBeenCalled();
        expect((component as any).refreshExtendedMetadataMenuItems).toHaveBeenCalled();
        expect((component as any).reloadMetadataEditorState).not.toHaveBeenCalled();
    });

    it('in default mode (no saveCallback) reloads datasource state on dialog close', async () => {
        const { component } = createHarness();
        const close$ = new Subject<any>();
        (WtoolboxService as any).dialogService.open = vi.fn().mockReturnValue({ onClose: close$ });
        component.saveCallback = undefined as any;
        (component as any).viewReady = true;

        vi.spyOn<any>(component, 'reloadMetadataEditorState').mockResolvedValue(undefined);

        (component as any).openEditDialog(component.datasourceRelatedMetadata, 'insert');
        close$.next({ muat_view: true });
        await Promise.resolve();

        expect((component as any).reloadMetadataEditorState).toHaveBeenCalled();
    });

    it('prefers local editor context over remote fetch when saveCallback is provided', async () => {
        const { component } = createHarness();
        component.saveCallback = () => true;
        component.datasourceRelatedMetadata.metaInfo = {
            tableMetadata: {},
            columnMetadata: [{ mc_nome_colonna: 'Id' }]
        } as any;
        component.datasourceRelatedMetadata.resultInfo = {
            current: { Id: 77, md_action_type: 2 },
            dato: [{ Id: 77, md_action_type: 1 }]
        } as any;
        vi.spyOn<any>(component, 'openEditDialog').mockImplementation(() => { });

        await component.openEditor({
            info: { Id: 77, md_action_type: 2 },
            editorKey: 'Id',
            editorRoute: '_Metadati_Custom_Actions_Tabelle'
        } as any);

        expect(component.datasourceRelatedMetadata.setCurrent).toHaveBeenCalled();
        const setCurrentArg = vi.mocked((component.datasourceRelatedMetadata.setCurrent as any)).mock.lastCall[0];
        expect(Number(setCurrentArg?.md_action_type || 0)).toBe(2);
        expect((component as any).openEditDialog).toHaveBeenCalled();
    });
});

