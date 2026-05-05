import { of } from 'rxjs';
import { WorkflowRunnerComponent } from './workflow-runner.component';

function createComponent(rawGraphResponse: any, userInfo?: any) {
    const routeStub: any = {
        paramMap: of({ get: () => null })
    };
    const dataSrv: any = {
        loadWorkflowGraph: vi.fn().mockResolvedValue(rawGraphResponse)
    };
    const runtimeMenuSrv: any = {
        setRuntimeMenus: vi.fn(),
        clearRuntimeMenus: vi.fn()
    };
    const runtimeMetadataSrv: any = {
        setRouteMetadata: vi.fn(),
        setLinkedActionRouteMetadata: vi.fn(),
        setRouteNodePayloadEntries: vi.fn(),
        setPreviousRouteNodeEntries: vi.fn(),
        clear: vi.fn()
    };
    const userInfoSrv: any = {
        getuserInfo: vi.fn().mockReturnValue(userInfo || { user_id: 10, role_id: 3 })
    };
    const trslSrv: any = {
        instant: vi.fn().mockImplementation((x: string) => x)
    };

    const component = new WorkflowRunnerComponent(routeStub, dataSrv, runtimeMetadataSrv, runtimeMenuSrv, userInfoSrv, trslSrv);
    return { component, dataSrv, runtimeMenuSrv, runtimeMetadataSrv };
}

describe('WorkflowRunnerComponent unit', () => {
    it('builds runtime menu from startMenus and direct start->route links', async () => {
        const graphPayload = [{
            graph_name: 'Main Graph',
            graph_json: JSON.stringify({
                nodes: [
                    {
                        id: 'start_1',
                        type: 'start',
                        startMenuCaption: 'Applicazione',
                        startMenus: [
                            {
                                mm_id: 100,
                                mm_parent_id: 0,
                                mm_display_string_menu: 'Custom',
                                mm_uri_menu: '/custom/list',
                                mm_ordine: 10,
                                mm_is_visible_by_default: true,
                                _Metadati_Utenti_Autorizzazioni_Menus: []
                            }
                        ]
                    },
                    { id: 'route_1', type: 'route', route: 'Cities', action: 'list' }
                ],
                connections: [
                    { source: 'start_1', sourceOutput: 'out', target: 'route_1', targetInput: 'in' }
                ]
            }),
            route_metadata: []
        }];

        const { component, runtimeMenuSrv, runtimeMetadataSrv } = createComponent(graphPayload);
        await (component as any).loadGraph('wf_graph_1');

        expect(runtimeMenuSrv.setRuntimeMenus).toHaveBeenCalled();
        expect(runtimeMetadataSrv.setRouteMetadata).toHaveBeenCalled();
        const args = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[0];
        expect(args.length).toBe(1);
        expect(args[0].label).toBe('Applicazione');
        const children = args[0].items || [];
        expect(children.some((x: any) => x.label === 'Custom' && x.route === '/custom/list')).toBe(true);
        expect(children.some((x: any) => x.label === 'Cities [list]' && x.route === '/Cities/list')).toBe(true);
    });

    it('accepts legacy auth keys for start menu visibility', async () => {
        const graphPayload = [{
            graph_name: 'Legacy Auth Graph',
            graph_json: JSON.stringify({
                nodes: [
                    {
                        id: 'start_1',
                        type: 'start',
                        startMenuCaption: 'Applicazione',
                        startMenus: [
                            {
                                mm_id: 200,
                                mm_parent_id: 0,
                                mm_display_string_menu: 'Secure',
                                mm_uri_menu: '/secure/list',
                                mm_ordine: 10,
                                mm_is_visible_by_default: false,
                                _Metadati_Utenti_Autorizzazioni_Menus: [
                                    { mm_id: 200, muam_id: 900, muam_view: 1, ruolo_id: 3, utente_id: 10 }
                                ]
                            }
                        ]
                    }
                ],
                connections: []
            }),
            route_metadata: []
        }];

        const { component, runtimeMenuSrv, runtimeMetadataSrv } = createComponent(graphPayload, { user_id: 10, role_id: 3 });
        await (component as any).loadGraph('wf_graph_legacy');

        expect(runtimeMenuSrv.setRuntimeMenus).toHaveBeenCalled();
        expect(runtimeMetadataSrv.setRouteMetadata).toHaveBeenCalled();
        const args = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[0];
        const children = args[0].items || [];
        expect(children.some((x: any) => x.label === 'Secure' && x.route === '/secure/list')).toBe(true);
    });

    it('honors startExclusiveMenu by hiding route and exit items', async () => {
        const graphPayload = [{
            graph_name: 'Exclusive Graph',
            graph_json: JSON.stringify({
                nodes: [
                    {
                        id: 'start_1',
                        type: 'start',
                        startMenuCaption: 'Applicazione',
                        startExclusiveMenu: true,
                        startShowExit: true,
                        startMenus: [
                            {
                                mm_id: 100,
                                mm_parent_id: 0,
                                mm_display_string_menu: 'Solo custom',
                                mm_uri_menu: '/custom/list',
                                mm_ordine: 10,
                                mm_is_visible_by_default: true,
                                _Metadati_Utenti_Autorizzazioni_Menus: []
                            }
                        ]
                    },
                    { id: 'route_1', type: 'route', route: 'Cities', action: 'list' }
                ],
                connections: [
                    { source: 'start_1', sourceOutput: 'out', target: 'route_1', targetInput: 'in' }
                ]
            }),
            route_metadata: []
        }];

        const { component, runtimeMenuSrv } = createComponent(graphPayload);
        await (component as any).loadGraph('wf_graph_exclusive');

        expect(runtimeMenuSrv.setRuntimeMenus).toHaveBeenCalled();
        const args = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[0];
        const children = args[0].items || [];
        expect(children.some((x: any) => x.label === 'Solo custom' && x.route === '/custom/list')).toBe(true);
        expect(children.some((x: any) => x.label === 'Cities [list]')).toBe(false);
        expect(children.some((x: any) => x.label === 'Esci' && x.route === '/')).toBe(true);
        const exclusiveFlag = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[1];
        expect(exclusiveFlag).toBe(true);
    });

    it('hides exit item when startShowExit is false', async () => {
        const graphPayload = [{
            graph_name: 'No Exit Graph',
            graph_json: JSON.stringify({
                nodes: [
                    {
                        id: 'start_1',
                        type: 'start',
                        startMenuCaption: 'Applicazione',
                        startShowExit: false,
                        startMenus: [
                            {
                                mm_id: 101,
                                mm_parent_id: 0,
                                mm_display_string_menu: 'Custom',
                                mm_uri_menu: '/custom/list',
                                mm_ordine: 10,
                                mm_is_visible_by_default: true,
                                _Metadati_Utenti_Autorizzazioni_Menus: []
                            }
                        ]
                    }
                ],
                connections: []
            }),
            route_metadata: []
        }];

        const { component, runtimeMenuSrv } = createComponent(graphPayload);
        await (component as any).loadGraph('wf_graph_no_exit');

        expect(runtimeMenuSrv.setRuntimeMenus).toHaveBeenCalled();
        const args = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[0];
        const children = args[0].items || [];
        expect(children.some((x: any) => x.label === 'Custom')).toBe(true);
        expect(children.some((x: any) => x.label === 'Esci')).toBe(false);
    });

    it('shows start-connected route links in exclusive mode when no custom start menus are present', async () => {
        const graphPayload = [{
            graph_name: 'Exclusive Fallback',
            graph_json: JSON.stringify({
                nodes: [
                    {
                        id: 'start_1',
                        type: 'start',
                        startMenuCaption: 'VAI',
                        startExclusiveMenu: true,
                        startShowExit: true,
                        startMenus: []
                    },
                    { id: 'route_1', type: 'route', route: 'cities', action: 'list' }
                ],
                connections: [
                    { source: 'start_1', sourceOutput: 'out', target: 'route_1', targetInput: 'in' }
                ]
            }),
            route_metadata: []
        }];

        const { component, runtimeMenuSrv } = createComponent(graphPayload);
        await (component as any).loadGraph('wf_graph_exclusive_fallback');

        expect(runtimeMenuSrv.setRuntimeMenus).toHaveBeenCalled();
        const args = vi.mocked(runtimeMenuSrv.setRuntimeMenus).mock.lastCall[0];
        const children = args[0].items || [];
        expect(children.some((x: any) => x.label === 'cities [list]' && x.route === '/cities/list')).toBe(true);
        expect(children.some((x: any) => x.label === 'Esci' && x.route === '/')).toBe(true);
    });
});
