import { EventEmitter } from '@angular/core';
import { WorkflowDesignerComponent } from './workflow-designer.component';

function setupRuntime(component: WorkflowDesignerComponent) {
    const nodes: any[] = [];
    const connections: any[] = [];
    let connectionSeq = 1;

    const editor: any = {
        getNodes: () => nodes,
        getNode: (id: any) => nodes.find((n) => String(n.id) === String(id)),
        getConnections: () => connections,
        addNode: async (node: any) => {
            nodes.push(node);
            return true;
        },
        removeNode: async (id: any) => {
            const key = String(id);
            const idx = nodes.findIndex((n) => String(n.id) === key);
            if (idx >= 0) {
                nodes.splice(idx, 1);
            }
            for (let i = connections.length - 1; i >= 0; i--) {
                const c = connections[i];
                if (String(c.source) === key || String(c.target) === key) {
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
        removeConnection: async (id: any) => {
            const key = String(id);
            const idx = connections.findIndex((c) => String(c.id) === key);
            if (idx >= 0) {
                connections.splice(idx, 1);
            }
        }
    };

    const area: any = {
        nodeViews: new Map<string, any>(),
        container: { clientWidth: 1280, clientHeight: 720 },
        parentScope: () => editor,
        area: {
            transform: { x: 0, y: 0, k: 1 },
            zoom: async (k: number) => { area.area.transform.k = k; }
        },
        translate: async (id: any, pos: any) => {
            area.nodeViews.set(String(id), {
                position: { x: pos.x, y: pos.y },
                element: { clientWidth: 240, clientHeight: 96 }
            });
        },
        update: async () => undefined,
        destroy: () => undefined
    };

    (component as any).editor = editor;
    (component as any).area = area;
    (component as any).workflowCanvasRef = { nativeElement: document.createElement('div') };
    (component as any).workflowChange = new EventEmitter<any>();
}

function createHarness() {
    const dataSrv: any = {
        selectByRoute: vi.fn().mockResolvedValue({ dato: [{ md_route_name: 'cities', md_nome_tabella: 'Cities' }] }),
        saveWorkflowGraph: vi.fn().mockResolvedValue(true),
        loadWorkflowGraph: vi.fn().mockResolvedValue([]),
        getWorkflowGraphs: vi.fn().mockResolvedValue([]),
        renameWorkflowGraph: vi.fn().mockResolvedValue(true),
        deleteWorkflowGraph: vi.fn().mockResolvedValue(true)
    };
    const component = new WorkflowDesignerComponent({} as any, dataSrv);
    setupRuntime(component);
    return { component, dataSrv };
}

describe('WorkflowDesignerComponent integration', () => {
    it('serializes and restores graph preserving route/action nodes and connections', async () => {
        const { component } = createHarness();
        await (component as any).addNodeByType('start', 100, 120);
        const routeNode = await (component as any).addNodeByType('route', 280, 130, { routeName: 'cities', action: 'list' });
        const actionNode = await (component as any).addNodeByType('action', 480, 130, undefined, { id: 1, description: 'generic.method.call.action' }, { id: 0, description: 'azione_tab' });
        await (component as any).autoConnectStartToRoute(routeNode, String((component as any).editor.getNodes()[0].id));
        await (component as any).autoConnectRouteToAction(actionNode, 480, 130, String(routeNode.id));

        const payload = (component as any).serializeGraphPayload();
        expect(payload.graph.nodes.length).toBe(3);
        expect(payload.graph.connections.length).toBeGreaterThanOrEqual(1);

        await (component as any).restoreGraph(payload.graph, payload.routeMetadata);
        const restoredNodes = (component as any).editor.getNodes();
        const restoredConnections = (component as any).editor.getConnections();
        expect(restoredNodes.length).toBeGreaterThanOrEqual(3);
        expect(restoredConnections.length).toBeGreaterThanOrEqual(1);
    });

    it('loads route options from metadata route list', async () => {
        const { component, dataSrv } = createHarness();
        await (component as any).loadRouteOptions();

        expect(dataSrv.selectByRoute).toHaveBeenCalled();
        expect(component.routeOptions.length).toBe(1);
        expect(component.routeOptions[0].value).toBe('cities');
        expect(component.routeOptions[0].label).toContain('cities');
    });
});
