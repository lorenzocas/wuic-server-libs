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

describe('MetadataEditorComponent E2E (component-level)', () => {
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

    it('covers full flow: build menus, open editor, delete related record and trigger report route', async () => {
        const trslSrv: any = {
            ensureTranslationsLoaded: vi.fn().mockResolvedValue(undefined),
            translationsLoaded$: new BehaviorSubject<boolean>(true),
            instant: (k: string) => k,
            format: (tpl: string, arg: string) => tpl.replace('{0}', arg)
        };
        const metaSrv: any = {
            getReportList: vi.fn().mockResolvedValue([{ name: 'Sales.mrt' }]),
            getMetadati: vi.fn().mockResolvedValue([])
        };
        const router: any = { navigateByUrl: vi.fn().mockResolvedValue(true) };
        const userInfoSrv: any = { getuserInfo: () => ({ user_id: 77, role_id: 4 }), isCurrentUserAdmin: () => true };
        const hostEl: any = { nativeElement: { querySelector: vi.fn().mockReturnValue(null) } };

        const component = new MetadataEditorComponent(trslSrv, metaSrv, router, userInfoSrv, hostEl);
        component.datasource = new BehaviorSubject<any>(createDatasource('route-e2e'));
        component.datasourceTabelle = createDatasource(' metadati  tabelle');
        component.datasourceColonne = createDatasource(' metadati  colonne');
        component.datasourceRelatedMetadata = createDatasource('_Metadati_Custom_Actions_Tabelle');
        component.datasourceRelatedMetadata.metaInfo = { tableMetadata: {}, columnMetadata: [{ mc_nome_colonna: 'Id' }] } as any;
        component.metaInfo = {
            tableMetadata: {
                md_id: 88,
                md_route_name: 'route-e2e',
                md_display_string: 'Route E2E',
                _Metadati_Custom_Actions_Tabelles: [{ Id: 500, button_caption: 'Run Action' }]
            },
            columnMetadata: [
                { mc_id: 111, mc_nome_colonna: 'Name', mc_display_string_in_view: 'Name', mc_ui_column_type: 'text' },
                { mc_id: 222, mc_nome_colonna: 'Btn', mc_display_string_in_view: 'Btn', mc_ui_column_type: 'button', mc_button_caption: 'Btn' }
            ]
        } as any;

        (component as any).viewReady = true;
        (component as any).rebuildMenuItems();
        await (component as any).refreshExtendedMetadataMenuItems();

        const relatedRoot = (component.items || []).find((x: any) => x.id === 'related-metadata-root');
        expect(relatedRoot).toBeTruthy();

        component.datasourceRelatedMetadata.metaInfo = { tableMetadata: {}, columnMetadata: [{ mc_nome_colonna: 'Id' }] } as any;
        vi.spyOn<any>(component, 'reloadMetadataEditorState').mockResolvedValue(undefined);
        await (component as any).deleteRelatedMetadataItem({
            label: 'Run Action',
            deleteKey: 'Id',
            info: { Id: 500 }
        });
        expect(component.datasourceRelatedMetadata.syncData).toHaveBeenCalled();
        expect((component as any).reloadMetadataEditorState).toHaveBeenCalled();

        await component.openEditor({ id: 'create-report' });
        expect(router.navigateByUrl).toHaveBeenCalled();
    });

    it('covers both persistence modes: embedded-memory vs default-db refresh on dialog close', async () => {
        const trslSrv: any = {
            ensureTranslationsLoaded: vi.fn().mockResolvedValue(undefined),
            translationsLoaded$: new BehaviorSubject<boolean>(true),
            instant: (k: string) => k,
            format: (tpl: string, arg: string) => tpl.replace('{0}', arg)
        };
        const metaSrv: any = {
            getReportList: vi.fn().mockResolvedValue([]),
            getMetadati: vi.fn().mockResolvedValue([])
        };
        const router: any = { navigateByUrl: vi.fn().mockResolvedValue(true) };
        const userInfoSrv: any = { getuserInfo: () => ({ user_id: 77, role_id: 4 }), isCurrentUserAdmin: () => true };
        const hostEl: any = { nativeElement: { querySelector: vi.fn().mockReturnValue(null) } };

        const component = new MetadataEditorComponent(trslSrv, metaSrv, router, userInfoSrv, hostEl);
        component.datasource = new BehaviorSubject<any>(createDatasource('route-e2e'));
        component.datasourceTabelle = createDatasource(' metadati  tabelle');
        component.datasourceColonne = createDatasource(' metadati  colonne');
        component.datasourceRelatedMetadata = createDatasource('_Metadati_Utenti_Autorizzazioni_Tabelle');
        component.metaInfo = {
            tableMetadata: { md_id: 88, md_route_name: 'route-e2e', md_display_string: 'Route E2E' },
            columnMetadata: [{ mc_id: 111, mc_nome_colonna: 'Name', mc_display_string_in_view: 'Name', mc_ui_column_type: 'text' }]
        } as any;
        (component as any).viewReady = true;

        const closeEmbedded$ = new Subject<any>();
        (WtoolboxService as any).dialogService.open = vi.fn().mockReturnValue({ onClose: closeEmbedded$ });
        component.saveCallback = () => true;
        vi.spyOn<any>(component, 'rebuildMenuItems');
        vi.spyOn<any>(component, 'refreshExtendedMetadataMenuItems').mockResolvedValue(undefined);
        vi.spyOn<any>(component, 'reloadMetadataEditorState').mockResolvedValue(undefined);

        (component as any).openEditDialog(component.datasourceRelatedMetadata, 'insert');
        closeEmbedded$.next({ muat_view: true });
        await Promise.resolve();

        expect((component as any).rebuildMenuItems).toHaveBeenCalled();
        expect((component as any).refreshExtendedMetadataMenuItems).toHaveBeenCalled();
        expect((component as any).reloadMetadataEditorState).not.toHaveBeenCalled();

        const closeDefault$ = new Subject<any>();
        (WtoolboxService as any).dialogService.open = vi.fn().mockReturnValue({ onClose: closeDefault$ });
        component.saveCallback = undefined as any;
        (component as any).reloadMetadataEditorState.mockClear();

        (component as any).openEditDialog(component.datasourceRelatedMetadata, 'insert');
        closeDefault$.next({ muat_view: true });
        await Promise.resolve();

        expect((component as any).reloadMetadataEditorState).toHaveBeenCalled();
    });
});

