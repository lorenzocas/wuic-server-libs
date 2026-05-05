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

describe('WorkflowDesignerComponent E2E (component-level)', () => {
    it('covers save/load/rename/delete graph lifecycle with in-memory provider', async () => {
        const store = new Map<string, any>();
        const dataSrv: any = {
            selectByRoute: vi.fn().mockResolvedValue({ dato: [] }),
            saveWorkflowGraph: vi.fn().mockImplementation(async (payload: any) => {
                store.set(String(payload.graph_key), {
                    graph_key: payload.graph_key,
                    graph_name: payload.graph_name,
                    graph_json: payload.graph_json,
                    route_metadata: JSON.parse(payload.route_metadata_json || '[]')
                });
                return true;
            }),
            loadWorkflowGraph: vi.fn().mockImplementation(async (payload: any) => {
                const row = store.get(String(payload.graph_key));
                return row ? [row] : [];
            }),
            getWorkflowGraphs: vi.fn().mockImplementation(async () => Array.from(store.values())),
            renameWorkflowGraph: vi.fn().mockImplementation(async (payload: any) => {
                const key = String(payload.graph_key);
                const row = store.get(key);
                if (row) {
                    row.graph_name = payload.graph_name;
                    store.set(key, row);
                }
                return true;
            }),
            deleteWorkflowGraph: vi.fn().mockImplementation(async (payload: any) => {
                store.delete(String(payload.graph_key));
                return true;
            })
        };

        const component = new WorkflowDesignerComponent({} as any, dataSrv);
        setupRuntime(component);
        reuseOrSpy(WtoolboxService as any, 'confirm').mockResolvedValue(true);
        reuseOrSpy(WtoolboxService, 'promptDialog').mockResolvedValue({ workflowName: { value: 'Workflow Test' } });

        await (component as any).addNodeByType('start', 80, 120);
        await (component as any).addNodeByType('route', 260, 120, { routeName: 'cities', action: 'list' });
        component.workflowName = 'Workflow Test';

        await component.saveWorkflow();
        expect(dataSrv.saveWorkflowGraph).toHaveBeenCalled();
        expect(component.savedGraphOptions.length).toBe(1);

        const savedKey = component.savedGraphOptions[0].value;
        component.selectedSavedGraphKey = savedKey;
        component.workflowName = 'Workflow Renamed';
        await component.renameSelectedGraph();
        expect(dataSrv.renameWorkflowGraph).toHaveBeenCalled();

        await component.openSelectedGraph();
        expect(dataSrv.loadWorkflowGraph).toHaveBeenCalled();

        await component.deleteSelectedGraph();
        expect(dataSrv.deleteWorkflowGraph).toHaveBeenCalled();
        expect(component.savedGraphOptions.length).toBe(0);
    });
});
