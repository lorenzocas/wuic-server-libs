import type { Mock } from "vitest";
import { DesignerComponent } from './designer.component';
import { WtoolboxService } from '../../service/wtoolbox.service';

function reuseOrSpy<T extends object>(target: T, methodName: keyof T & string): Mock {
    const current = (target as any)[methodName];
    if (current && current.and && current.calls) {
        return current as Mock;
    }
    return vi.spyOn(target as any, methodName);
}

function createE2EHarness() {
    const inMemoryStore: {
        [route: string]: any;
    } = {};

    const routeStub = {
        snapshot: {
            paramMap: {
                get: vi.fn().mockReturnValue(null)
            }
        }
    };

    const dataSrv = {
        saveDashboard: vi.fn().mockName("DataProviderService.saveDashboard"),
        loadDashboard: vi.fn().mockName("DataProviderService.loadDashboard"),
        loadAllDashboards: vi.fn().mockName("DataProviderService.loadAllDashboards"),
        getCssClassesFromSheets: vi.fn().mockName("DataProviderService.getCssClassesFromSheets"),
        writeChangesToCssFile: vi.fn().mockName("DataProviderService.writeChangesToCssFile"),
        readFileContent: vi.fn().mockName("DataProviderService.readFileContent")
    };

    dataSrv.saveDashboard.mockImplementation(async (payload: any) => {
        inMemoryStore[payload.dashRoute] = {
            board_route: payload.dashRoute,
            board_des: payload.desc,
            boardcontent: payload.elements,
            sheetPaths: payload.sheetPaths || []
        };
        return true;
    });
    dataSrv.loadDashboard.mockImplementation(async (payload: any) => {
        const saved = inMemoryStore[payload.dashRoute];
        return saved ? [saved] : [];
    });
    dataSrv.loadAllDashboards.mockImplementation(async () => {
        return Object.values(inMemoryStore);
    });
    dataSrv.getCssClassesFromSheets.mockResolvedValue([]);
    dataSrv.readFileContent.mockResolvedValue('');

    const metaSrvStub = {};
    const userInfoStub = {
        getuserInfo: () => ({ user_id: 777 })
    };
    const cdStub = {
        detectChanges: vi.fn().mockName("ChangeDetectorRef.detectChanges")
    };
    const trslStub = {
        instant: (k: string) => k
    };
    const metadataEditorSrvStub = {
        openMetadataColumnEditorInContext: vi.fn().mockResolvedValue(undefined)
    };

    const component = new DesignerComponent(
        routeStub as any,
        dataSrv as any,
        metaSrvStub as any,
        userInfoStub as any,
        cdStub as any,
        trslStub as any,
        metadataEditorSrvStub as any
    );

    return { component };
}

describe('DesignerComponent E2E (component-level)', () => {
    beforeEach(() => {
        (WtoolboxService as any).appSettings = { global_root_url: 'http://localhost/api/' };
        (WtoolboxService as any).messageNotificationService = {
            add: vi.fn()
        };
    });

    it('covers full workflow: drop tools, rename, remove, save, clear and reload', async () => {
        const { component } = createE2EHarness();
        await component.ngOnInit();

        const visibleTools = (component.availableTools || []).filter((x) => !x.hide);
        visibleTools.forEach((tool) => {
            component.draggedPayload = tool;
            component.drop({ toElement: null });
        });

        expect(component.dashboardElements.length).toBeGreaterThan(0);
        expect(component.droppedDashboardItems.length).toBeGreaterThan(0);

        const first = component.droppedDashboardItems[0];
        component.footerCtxElement = first as any;
        reuseOrSpy(WtoolboxService, 'promptDialog').mockResolvedValue({
            displayName: { value: 'Renamed Item' }
        } as any);
        await (component as any).renameFooterContextItem();
        expect(component.getDroppedDashboardItemLabel(first as any)).toBe('Renamed Item');

        const toRemove = component.droppedDashboardItems[1];
        const beforeRemove = component.droppedDashboardItems.length;
        component.removeElementByName(String(toRemove?.uniqueName || ''));
        expect(component.droppedDashboardItems.length).toBeLessThan(beforeRemove);

        component.dashboardElements = [
            {
                name: 'DIV',
                uniqueName: 'DIV__1',
                componentId: 1,
                inputProps: {},
                inputs: {},
                nestedComponents: []
            } as any
        ];
        component.flattenedDashboardElements = component.flattenComponentTree(component.dashboardElements as any);

        component.currentDashboardRoute = 'designer-e2e';
        component.currentDashboardDescription = 'Designer E2E';
        (component as any).reloadDashboards = async () => { };
        await component.saveDashboard();

        component.clearDashboard();
        expect(component.dashboardElements.length).toBe(0);

        await component.loadDashboard({ board_route: 'designer-e2e' });
        expect(component.currentDashboardRoute).toBe('designer-e2e');
        expect(component.currentDashboardDescription).toBe('Designer E2E');
        expect(component.dashboardElements.length).toBeGreaterThan(0);
    });
});
