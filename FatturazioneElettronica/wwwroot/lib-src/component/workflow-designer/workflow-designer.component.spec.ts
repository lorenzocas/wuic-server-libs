import type { Mock } from "vitest";
import { EventEmitter } from '@angular/core';
import { WorkflowDesignerComponent } from './workflow-designer.component';
import { WtoolboxService } from '../../service/wtoolbox.service';

function reuseOrSpy<T extends object>(target: T, methodName: keyof T & string): Mock {
    const current = (target as any)[methodName];
    if (current && current.and && current.calls) {
        return current as Mock;
    }
    return vi.spyOn(target as any, methodName);
}

function attachFakeRuntime(component: WorkflowDesignerComponent) {
    const nodes: any[] = [];
    const connections: any[] = [];
    let connectionSeq = 1;

    const createNodeView = (x: number, y: number) => ({
        position: { x, y },
        element: {
            clientWidth: 240,
            clientHeight: 120
        }
    });

    const editor: any = {
        getNodes: () => nodes,
        getConnections: () => connections,
        addNode: async (node: any) => {
            nodes.push(node);
            area.nodeViews.set(String(node.id), createNodeView(0, 0));
            return true;
        },
        removeNode: async (nodeId: any) => {
            const id = String(nodeId);
            const idx = nodes.findIndex((n) => String(n.id) === id);
            if (idx >= 0) {
                nodes.splice(idx, 1);
            }
            area.nodeViews.delete(id);
            for (let i = connections.length - 1; i >= 0; i--) {
                const c = connections[i];
                if (String(c.source) === id || String(c.target) === id) {
                    connections.splice(i, 1);
                }
            }
        },
        addConnection: async (connection: any) => {
            if (!connection.id) {
                connection.id = `c${connectionSeq++}`;
            }
            connections.push(connection);
            return true;
        },
        removeConnection: async (connectionId: any) => {
            const id = String(connectionId);
            const idx = connections.findIndex((c) => String(c.id) === id);
            if (idx >= 0) {
                connections.splice(idx, 1);
            }
        }
    };

    const area: any = {
        nodeViews: new Map<string, any>(),
        area: { transform: { x: 0, y: 0, k: 1 } },
        parentScope: () => null,
        translate: async (nodeId: any, pos: any) => {
            area.nodeViews.set(String(nodeId), createNodeView(pos.x, pos.y));
        },
        update: async () => undefined,
        destroy: () => undefined
    };

    (component as any).editor = editor;
    (component as any).area = area;
    (component as any).workflowCanvasRef = { nativeElement: document.createElement('div') };
    (component as any).workflowChange = new EventEmitter<any>();
}

function createComponent() {
    const dataSrv: any = {
        selectByRoute: vi.fn().mockResolvedValue({ dato: [] }),
        loadAllDashboards: vi.fn().mockResolvedValue([]),
        saveWorkflowGraph: vi.fn().mockResolvedValue(true),
        loadWorkflowGraph: vi.fn().mockResolvedValue([]),
        getWorkflowGraphs: vi.fn().mockResolvedValue([]),
        renameWorkflowGraph: vi.fn().mockResolvedValue(true),
        deleteWorkflowGraph: vi.fn().mockResolvedValue(true)
    };

    const component = new WorkflowDesignerComponent({} as any, dataSrv);
    attachFakeRuntime(component);
    return { component, dataSrv };
}

describe('WorkflowDesignerComponent unit', () => {
    it('parses action type dictionary entries', () => {
        const { component } = createComponent();
        const parsed = (component as any).parseActionTypeOptions('0@@navigation||1@@method.call');

        expect(parsed.length).toBe(2);
        expect(parsed[0]).toEqual({ label: 'navigation', value: 0 });
        expect(parsed[1]).toEqual({ label: 'method.call', value: 1 });
    });

    it('creates action node with output only for navigation type', () => {
        const { component } = createComponent();
        const navNode = (component as any).createNode('action', undefined, { id: 0, description: 'navigation' }, { id: 0, description: 'azione_tab' });
        const methodNode = (component as any).createNode('action', undefined, { id: 1, description: 'method.call' }, { id: 0, description: 'azione_tab' });

        expect((navNode.outputs as any)?.out).toBeTruthy();
        expect((methodNode.outputs as any)?.out).toBeFalsy();
    });

    it('adds only one start node', async () => {
        const { component } = createComponent();
        const first = await (component as any).addNodeByType('start', 100, 120);
        const second = await (component as any).addNodeByType('start', 200, 240);

        expect(first).toBeTruthy();
        expect(second).toBeNull();
        expect((component as any).editor.getNodes().length).toBe(1);
    });

    it('saves start menu payload through callback handler', () => {
        const { component } = createComponent();
        const startNode = (component as any).createNode('start');
        (component as any).editor.getNodes().push(startNode);
        (component as any).pendingStartMenuContext = { startNodeId: String(startNode.id), mode: 'insert' };
        vi.spyOn<any>(component, 'emitWorkflow').mockImplementation(() => { });

        const result = (component as any).handleStartMenuSave({ mm_display_string_menu: { value: 'Admin' }, mm_uri_menu: { value: '/admin/list' } }, {});

        expect(result).toBeTruthy();
        const menus = (startNode as any).workflowStartMenus || [];
        expect(menus.length).toBe(1);
        expect(menus[0].mm_display_string_menu).toBe('Admin');
        expect((component as any).emitWorkflow).toHaveBeenCalled();
    });

    it('saves menu authorization payload through callback handler', () => {
        const { component } = createComponent();
        const startNode = (component as any).createNode('start');
        (startNode as any).workflowStartMenus = [{ mm_id: 99, mm_uri_menu: '/x', mm_display_string_menu: 'X', _Metadati_Utenti_Autorizzazioni_Menus: [] }];
        (component as any).editor.getNodes().push(startNode);
        (component as any).pendingMenuAuthContext = { startNodeId: String(startNode.id), menuId: 99, mode: 'insert' };
        vi.spyOn<any>(component, 'emitWorkflow').mockImplementation(() => { });

        const result = (component as any).handleMenuAuthorizationSave({ muamview: 1, ruoloid: 3, utenteid: 0 }, {});

        expect(result).toBeTruthy();
        const auths = ((startNode as any).workflowStartMenus[0]?._Metadati_Utenti_Autorizzazioni_Menus || []);
        expect(auths.length).toBe(1);
        expect(auths[0].ruoloid).toBe(3);
        expect((component as any).emitWorkflow).toHaveBeenCalled();
    });

    it('imports full route metadata bundle when dropping a route node', async () => {
        const { component } = createComponent();
        (component as any).routeMetadataDs = {
            hardcodedRoute: '',
            route: { next: vi.fn() },
            getSchemaAndData: vi.fn().mockResolvedValue(true),
            metaInfo: {
                tableMetadata: {
                    md_id: 11,
                    _Metadati_Custom_Actions_Tabelles: [{ Id: 90 }],
                    _Metadati_Utenti_Autorizzazioni_Tabelles: [{ muat_id: 91 }],
                    _Metadati_UI_Stili_Tabelles: [{ must_id: 92 }]
                },
                columnMetadata: [
                    {
                        mc_id: 10,
                        mc_ui_column_type: 'text',
                        _Metadati_Utenti_Autorizzazioni_Colonnes: [{ muac_id: 93 }],
                        _Metadati_UI_Stili_Colonnes: [{ musc_id: 94 }]
                    },
                    {
                        mc_id: 20,
                        mc_ui_column_type: 'button',
                        _Metadati_Utenti_Autorizzazioni_Colonnes: [],
                        _Metadati_UI_Stili_Colonnes: []
                    }
                ]
            }
        } as any;
        (component as any).pendingRouteDrop = { x: 120, y: 60 };
        component.selectedRouteName = 'cities';
        component.selectedRouteAction = 'list';

        await component.confirmRouteDrop();

        const routeNode = (component as any).editor.getNodes().find((n: any) => String(n?.workflowType || '') === 'route');
        const bundle = (routeNode as any)?.workflowRouteMetadataBundle;
        expect(routeNode).toBeTruthy();
        expect(bundle).toBeTruthy();
        expect(bundle.route).toBe('cities');
        expect(bundle.tableMetadata?.md_id).toBe(11);
        expect((bundle.tableActions || []).length).toBe(1);
        expect((bundle.tablePermissions || []).length).toBe(1);
        expect((bundle.tableStyles || []).length).toBe(1);
        expect((bundle.columnMetadata || []).length).toBe(2);
        const buttonColumn = (bundle.columnMetadata || []).find((x: any) => String(x?.mc_ui_column_type || '') === 'button');
        expect(buttonColumn).toBeTruthy();
        const colWithNested = (bundle.columnMetadata || []).find((x: any) => Number(x?.mc_id) === 10);
        expect(((colWithNested?._Metadati_Utenti_Autorizzazioni_Colonnes) || []).length).toBe(1);
        expect(((colWithNested?._Metadati_UI_Stili_Colonnes) || []).length).toBe(1);
        const linkedActionNode = (component as any).editor.getNodes().find((n: any) => String(n?.workflowType || '') === 'action'
            && String(n?.workflowMetadataTargetType || '') === 'table_action'
            && Number(n?.workflowMetadataTargetId || 0) === 90);
        expect(linkedActionNode).toBeTruthy();
    });

    it('creates dashboard route nodes with datasource metadata extracted from boardcontent', async () => {
        const { component } = createComponent();
        (component as any).pendingRouteDrop = { x: 140, y: 70 };
        component.selectedRouteSourceType = 'dashboard';
        component.selectedDashboardRoute = 'sales-dashboard';
        component.dashboardOptions = [{
            label: 'Sales (#/sales-dashboard/dashboard)',
            value: 'sales-dashboard',
            boardcontent: JSON.stringify([
                {
                    name: 'DATASOURCE',
                    uniqueName: 'DATASOURCE_1',
                    inputs: {
                        route: 'cities',
                        metaInfo: {
                            tableMetadata: { md_id: 11, md_route_name: 'cities' },
                            columnMetadata: [{ mc_id: 10, mc_nome_colonna: 'name', mc_ui_column_type: 'text' }]
                        }
                    }
                }
            ])
        }];

        await component.confirmRouteDrop();

        const routeNode = (component as any).editor.getNodes().find((n: any) => String(n?.workflowType || '') === 'route');
        expect((routeNode as any)?.workflowRouteSourceType).toBe('dashboard');
        expect((routeNode as any)?.workflowAction).toBe('dashboard');
        expect((routeNode as any)?.workflowDashboardBoardcontent).toContain('DATASOURCE_1');
        expect(((routeNode as any)?.workflowDashboardDatasources || []).length).toBe(1);
        expect((routeNode as any)?.workflowRouteMetadataBundle?.route).toBe('cities');
    });

    it('removes linked action node when a table action is deleted from metadata', async () => {
        const { component } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 100, 80, { routeName: 'cities', action: 'list' });
        (routeNode as any).workflowRouteMetadataBundle = {
            route: 'cities',
            tableMetadata: {},
            columnMetadata: [],
            tableActions: [{ Id: 10, md_action_type: 1 }],
            columnActions: [],
            tablePermissions: [],
            columnPermissions: [],
            tableStyles: [],
            columnStyles: []
        };
        await (component as any).syncTableActionNodesWithMetadata(routeNode, (routeNode as any).workflowRouteMetadataBundle);
        (component as any).routeMetadataNodeId = String(routeNode.id);

        await (component as any).handleRouteMetadataSave({ Id: 10, __deleted: true }, { Id: 10 }, 'Id');

        const linkedActionNode = (component as any).editor.getNodes().find((n: any) => String(n?.workflowType || '') === 'action'
            && String(n?.workflowMetadataTargetType || '') === 'table_action'
            && Number(n?.workflowMetadataTargetId || 0) === 10);
        expect(linkedActionNode).toBeFalsy();
    });

    it('serializes workflow payload from fake editor runtime', async () => {
        const { component } = createComponent();
        const startNode = await (component as any).addNodeByType('start', 80, 100);
        await (component as any).addNodeByType('route', 240, 100, { routeName: 'cities', action: 'list' });
        (startNode as any).workflowStartMenuCaption = 'Applicazione';
        (startNode as any).workflowStartInheritMetadata = false;
        (startNode as any).workflowStartExclusiveMenu = true;
        (startNode as any).workflowStartShowExit = false;

        const payload = (component as any).serializeGraphPayload();
        const serializedStart = payload.graph.nodes.find((n: any) => n.type === 'start');

        expect(payload.graph.nodes.length).toBe(2);
        expect(payload.graph.nodes.some((n: any) => n.type === 'route' && n.route === 'cities')).toBe(true);
        expect(serializedStart?.startMenuCaption).toBe('Applicazione');
        expect(serializedStart?.startInheritMetadata).toBe(false);
        expect(serializedStart?.startExclusiveMenu).toBe(true);
        expect(serializedStart?.startShowExit).toBe(false);
    });

    it('normalizes menu authorizations with legacy key names', () => {
        const { component } = createComponent();
        const result = (component as any).normalizeMenuAuthorizations([
            { muam_id: 7, muam_view: 1, ruolo_id: 3, utente_id: 9, mm_id: 11 }
        ], 11);

        expect(result.length).toBe(1);
        expect(result[0]).toEqual({
            mmid: 11,
            muamid: 7,
            muamview: 1,
            ruoloid: 3,
            utenteid: 9
        });
    });

    it('keeps inserted table authorization in-memory even when muat_id is missing', () => {
        const { component } = createComponent();
        const bundle = (component as any).createEmptyRouteBundle('cities');

        (component as any).applyRecordToBundle(bundle, { md_id: 10, id_ruolo: 3, muat_view: true, muat_edit: false, muat_insert: true, muat_delete: false }, {});

        expect(bundle.tablePermissions.length).toBe(1);
        expect(Number(bundle.tablePermissions[0].muat_id)).toBeLessThan(0);
        expect(bundle.tablePermissions[0].id_ruolo).toBe(3);
    });

    it('keeps inserted table authorization in-memory also with legacy keys (muatview/muatid)', () => {
        const { component } = createComponent();
        const bundle = (component as any).createEmptyRouteBundle('cities');

        (component as any).applyRecordToBundle(bundle, { mdid: 10, muatview: true, idruolo: 4 }, {});

        expect(bundle.tablePermissions.length).toBe(1);
        expect(Number(bundle.tablePermissions[0].muat_id)).toBeLessThan(0);
    });

    it('stores inserted column authorization under columnPermissions even when mc_id is present', () => {
        const { component } = createComponent();
        const bundle = (component as any).createEmptyRouteBundle('cities');

        (component as any).applyRecordToBundle(bundle, { mc_id: 15, muac_view: true, muac_editable: false, id_ruolo: 2 }, {});

        expect(bundle.columnPermissions.length).toBe(1);
        expect(Number(bundle.columnPermissions[0].muac_id)).toBeLessThan(0);
        expect(bundle.columnMetadata.length).toBe(0);
    });

    it('saveWorkflow overwrites current saved graph key after confirmation', async () => {
        const { component, dataSrv } = createComponent();
        component.savedGraphOptions = [{ value: 'wf_existing', name: 'Existing', label: 'Existing' } as any];
        component.selectedSavedGraphKey = 'wf_existing';
        component.workflowName = 'Existing';
        reuseOrSpy(WtoolboxService as any, 'confirm').mockResolvedValue(true);
        vi.spyOn<any>(component, 'refreshSavedGraphs').mockResolvedValue();

        await component.saveWorkflow();

        expect(WtoolboxService.confirm).toHaveBeenCalled();
        expect(dataSrv.saveWorkflowGraph).toHaveBeenCalled();
        const payload = vi.mocked(dataSrv.saveWorkflowGraph).mock.lastCall[0];
        expect(payload.graph_key).toBe('wf_existing');
    });

    it('saveWorkflow cancels overwrite when confirmation is rejected', async () => {
        const { component, dataSrv } = createComponent();
        component.savedGraphOptions = [{ value: 'wf_existing', name: 'Existing', label: 'Existing' } as any];
        component.selectedSavedGraphKey = 'wf_existing';
        component.workflowName = 'Existing';
        reuseOrSpy(WtoolboxService as any, 'confirm').mockResolvedValue(false);

        await component.saveWorkflow();

        expect(WtoolboxService.confirm).toHaveBeenCalled();
        expect(dataSrv.saveWorkflowGraph).not.toHaveBeenCalled();
    });

    it('saveWorkflow asks name for new graph and persists it', async () => {
        const { component, dataSrv } = createComponent();
        component.savedGraphOptions = [];
        component.selectedSavedGraphKey = '';
        component.workflowKey = '';
        component.workflowName = '';
        const promptSpy = reuseOrSpy(WtoolboxService, 'promptDialog').mockResolvedValue({ workflowName: { value: 'Nuovo workflow' } });
        vi.spyOn<any>(component, 'refreshSavedGraphs').mockResolvedValue();

        await component.saveWorkflow();

        expect(promptSpy).toHaveBeenCalled();
        expect(dataSrv.saveWorkflowGraph).toHaveBeenCalled();
        const payload = vi.mocked(dataSrv.saveWorkflowGraph).mock.lastCall[0];
        expect(payload.graph_name).toBe('Nuovo workflow');
        expect(component.workflowName).toBe('Nuovo workflow');
    });

    it('deleteSelectedGraph asks confirmation and aborts when rejected', async () => {
        const { component, dataSrv } = createComponent();
        component.workflowKey = 'wf_existing';
        component.workflowName = 'Existing';
        component.selectedSavedGraphKey = 'wf_existing';
        reuseOrSpy(WtoolboxService as any, 'confirm').mockResolvedValue(false);

        await component.deleteSelectedGraph();

        expect(WtoolboxService.confirm).toHaveBeenCalled();
        expect(dataSrv.deleteWorkflowGraph).not.toHaveBeenCalled();
        expect(component.workflowKey).toBe('wf_existing');
    });

    it('deleteSelectedGraph resets to new workflow state after confirmation', async () => {
        const { component, dataSrv } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 240, 100, { routeName: 'cities', action: 'list' });
        component.workflowKey = 'wf_existing';
        component.workflowName = 'Existing';
        component.selectedSavedGraphKey = 'wf_existing';
        component.savedGraphOptions = [{ value: 'wf_other', name: 'Other', label: 'Other' } as any];
        reuseOrSpy(WtoolboxService as any, 'confirm').mockResolvedValue(true);
        vi.spyOn<any>(component, 'refreshSavedGraphs').mockImplementation(async () => {
            component.savedGraphOptions = [{ value: 'wf_other', name: 'Other', label: 'Other' } as any];
        });

        expect(routeNode).toBeTruthy();

        await component.deleteSelectedGraph();

        expect(dataSrv.deleteWorkflowGraph).toHaveBeenCalledWith({
            user_id: '',
            graph_key: 'wf_existing'
        });
        expect(component.workflowKey).toBe('');
        expect(component.workflowName).toBe('');
        expect(component.selectedSavedGraphKey).toBe('');
        expect((component as any).editor.getNodes().some((n: any) => String(n?.workflowType || '') === 'start')).toBe(true);
        expect((component as any).editor.getNodes().every((n: any) => String(n?.workflowType || '') !== 'route')).toBe(true);
    });

    it('opens metadata action editor with table-action context for linked table action nodes', async () => {
        const { component } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 80, 80, { routeName: 'cities', action: 'list' });
        const actionNode = await (component as any).addNodeByType('action', 320, 80, undefined, { id: 0, description: 'navigation' }, { id: 0, description: 'azione_tab' });
        (actionNode as any).workflowRouteNodeId = String(routeNode?.id || '');
        (actionNode as any).workflowMetadataTargetType = 'table_action';
        (actionNode as any).workflowMetadataTargetId = 77;
        (actionNode as any).workflowActionTypeId = 2;
        (actionNode as any).workflowActionType = 'generate.file.action';
        (routeNode as any).workflowRouteMetadataBundle = {
            route: 'cities',
            tableMetadata: {},
            columnMetadata: [],
            tableActions: [{ Id: 77, md_action_type: 1, button_caption: 'Vai' }],
            columnActions: [],
            tablePermissions: [],
            columnPermissions: [],
            tableStyles: [],
            columnStyles: []
        };
        const editorStub: any = {
            openEditor: vi.fn().mockResolvedValue(true)
        };
        (component as any).routeMetadataDs = {
            hardcodedRoute: '',
            route: { next: vi.fn() },
            getSchemaAndData: vi.fn().mockResolvedValue(true)
        } as any;
        (component as any).actionMetadataEditor = editorStub;
        (component as any).contextMenuNodeId = String((actionNode as any).id);

        await component.openActionMetadataFromContext();

        expect(editorStub.openEditor).toHaveBeenCalled();
        const arg = vi.mocked(editorStub.openEditor).mock.lastCall[0];
        expect(arg?.editorKey).toBe('Id');
        expect(String(arg?.editorRoute || '')).toContain('_Metadati_Custom_Actions_Tabelle');
        expect(Number(arg?.info?.Id || 0)).toBe(77);
        expect(Number(arg?.info?.md_action_type || 0)).toBe(2);
    });

    it('builds one route metadata context-menu item per dashboard datasource', async () => {
        const { component } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 80, 80, {
            routeName: 'sales-dashboard',
            action: 'dashboard',
            sourceType: 'dashboard',
            dashboardBoardcontent: JSON.stringify([
                {
                    name: 'DATASOURCE',
                    uniqueName: 'DS_A',
                    inputs: {
                        route: 'cities',
                        metaInfo: { tableMetadata: { md_id: 11, md_route_name: 'cities' }, columnMetadata: [] }
                    }
                },
                {
                    name: 'DATASOURCE',
                    uniqueName: 'DS_B',
                    inputs: {
                        route: 'regions',
                        metaInfo: { tableMetadata: { md_id: 12, md_route_name: 'regions' }, columnMetadata: [] }
                    }
                }
            ])
        });
        (component as any).contextMenuNodeId = String(routeNode?.id || '');
        (component as any).contextMenuNodeType = 'route';

        const items = (component as any).buildContextMenuItems();

        expect(items.length).toBe(3);
        expect(items[0].label).toBe('Proprieta route annidata nel datasource (DS_A)');
        expect(items[1].label).toBe('Proprieta route annidata nel datasource (DS_B)');
    });

    it('writes nested dashboard datasource metadata back into boardcontent on save', async () => {
        const { component } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 80, 80, {
            routeName: 'sales-dashboard',
            action: 'dashboard',
            sourceType: 'dashboard',
            dashboardBoardcontent: JSON.stringify([
                {
                    name: 'DATASOURCE',
                    uniqueName: 'DS_A',
                    inputs: {
                        route: 'cities',
                        metaInfo: {
                            tableMetadata: { md_id: 11, md_route_name: 'cities' },
                            columnMetadata: [{ mc_id: 10, mc_nome_colonna: 'name', mc_ui_column_type: 'text' }]
                        }
                    }
                }
            ])
        });
        (component as any).routeMetadataDs = {
            metaInfo: { tableMetadata: {}, columnMetadata: [] },
            resultInfo: { current: {} },
            fetchInfo$: { next: vi.fn() }
        } as any;
        (component as any).routeMetadataNodeId = String(routeNode?.id || '');
        (component as any).routeMetadataDashboardDatasourceUniqueName = 'DS_A';
        (component as any).routeMetadataRoute = 'cities';

        await (component as any).handleRouteMetadataSave({ mc_id: 10, mc_nome_colonna: 'name', mc_ui_column_type: 'button', mc_button_action_type: 7 }, { mc_id: 10 }, undefined);

        const boardcontent = JSON.parse(String((routeNode as any).workflowDashboardBoardcontent || '[]'));
        const savedDatasource = boardcontent[0];
        expect(savedDatasource.inputs.metaInfo.columnMetadata[0].mc_ui_column_type).toBe('button');
        expect(savedDatasource.inputs.metaInfo.tableMetadata.md_route_name).toBe('cities');
        expect(((routeNode as any).workflowDashboardDatasources || [])[0]?.metadataBundle?.columnMetadata?.[0]?.mc_ui_column_type).toBe('button');
    });

    it('restores dashboard route nodes with nested datasource menu entries after reopen', async () => {
        const { component } = createComponent();

        await (component as any).restoreGraph({
            nodes: [{
                id: 'r1',
                label: 'Route ok1 [dashboard]',
                type: 'route',
                route: 'ok1',
                action: 'dashboard',
                routeSourceType: 'dashboard',
                dashboardBoardcontent: JSON.stringify([
                    {
                        name: 'DATASOURCE',
                        uniqueName: 'DS_A',
                        inputs: {
                            route: 'cities',
                            metaInfo: { tableMetadata: { md_id: 11, md_route_name: 'cities' }, columnMetadata: [] }
                        }
                    }
                ]),
                dashboardDatasources: [{
                    uniqueName: 'DS_A',
                    route: 'cities',
                    metadataBundle: {
                        route: 'cities',
                        tableMetadata: { md_id: 11, md_route_name: 'cities' },
                        columnMetadata: [],
                        tableActions: [],
                        columnActions: [],
                        tablePermissions: [],
                        columnPermissions: [],
                        tableStyles: [],
                        columnStyles: []
                    }
                }],
                x: 100,
                y: 80
            } as any],
            connections: []
        }, []);

        const routeNode = (component as any).editor.getNodes()[0];
        (component as any).contextMenuNodeId = String(routeNode?.id || '');
        (component as any).contextMenuNodeType = 'route';

        const items = (component as any).buildContextMenuItems();

        expect((routeNode as any).workflowRouteSourceType).toBe('dashboard');
        expect(((routeNode as any).workflowDashboardDatasources || []).length).toBe(1);
        expect(items[0].label).toBe('Proprieta route annidata nel datasource (DS_A)');
    });

    it('infers dashboard route subtype on reopen even when legacy payload has no routeSourceType', async () => {
        const { component } = createComponent();

        await (component as any).restoreGraph({
            nodes: [{
                id: 'r1',
                label: 'Route ok1 [dashboard]',
                type: 'route',
                route: 'ok1',
                action: 'dashboard',
                dashboardBoardcontent: JSON.stringify([
                    {
                        name: 'DATASOURCE',
                        uniqueName: 'DS_A',
                        inputs: {
                            route: 'cities',
                            metaInfo: { tableMetadata: { md_id: 11, md_route_name: 'cities' }, columnMetadata: [] }
                        }
                    }
                ]),
                x: 100,
                y: 80
            } as any],
            connections: []
        }, []);

        const routeNode = (component as any).editor.getNodes()[0];
        (component as any).contextMenuNodeId = String(routeNode?.id || '');
        (component as any).contextMenuNodeType = 'route';

        const items = (component as any).buildContextMenuItems();

        expect((routeNode as any).workflowRouteSourceType).toBe('dashboard');
        expect(items[0].label).toBe('Proprieta route annidata nel datasource (DS_A)');
    });

    it('persists linked table action type from action node into serialized route metadata', async () => {
        const { component } = createComponent();
        const routeNode = await (component as any).addNodeByType('route', 80, 80, { routeName: 'cities', action: 'list' });
        const actionNode = await (component as any).addNodeByType('action', 320, 80, undefined, { id: 1, description: 'generic.method.call.action' }, { id: 0, description: 'azione_tab' });
        (actionNode as any).workflowRouteNodeId = String(routeNode?.id || '');
        (actionNode as any).workflowMetadataTargetType = 'table_action';
        (actionNode as any).workflowMetadataTargetId = 77;
        (actionNode as any).workflowActionTypeId = 2;
        (actionNode as any).workflowActionType = 'generate.file.action';
        (routeNode as any).workflowRouteMetadataBundle = {
            route: 'cities',
            tableMetadata: {},
            columnMetadata: [],
            tableActions: [{ Id: 77, md_action_type: 1, button_caption: 'Vai' }],
            columnActions: [],
            tablePermissions: [],
            columnPermissions: [],
            tableStyles: [],
            columnStyles: []
        };

        const payload = (component as any).serializeGraphPayload();
        const serializedRoute = payload.graph.nodes.find((n: any) => n.type === 'route');
        const actionMeta = (serializedRoute?.routeMetadata?.tableActions || []).find((x: any) => Number(x?.Id || 0) === 77);
        expect(Number(actionMeta?.md_action_type || 0)).toBe(2);
    });
});

