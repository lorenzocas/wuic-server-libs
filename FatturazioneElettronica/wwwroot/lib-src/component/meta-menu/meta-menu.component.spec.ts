import { of } from 'rxjs';
import { MetaMenuComponent } from './meta-menu.component';

describe('MetaMenuComponent', () => {
    function buildComponent() {
        const metaSrvStub: any = {
            getMenuByUserID: vi.fn().mockResolvedValue([]),
            getMenuAdminMethods: vi.fn().mockResolvedValue(['addMenu', 'reorderMenu', 'nestMenu'])
        };
        const authSessionStub: any = {
            state$: of({}),
            snapshot: { enabled: true, authenticated: true, legacyAuthenticated: true },
            setReturnUrl: vi.fn(),
            initialize: vi.fn().mockResolvedValue(undefined)
        };
        const trslStub: any = { instant: (x: string) => x };
        const userInfoStub: any = { isAuthAdmin: vi.fn().mockReturnValue(true) };
        const workflowRuntimeMenuStub: any = { runtimeMenus$: of([]) };
        const httpStub: any = { get: vi.fn(), post: vi.fn() };
        const ngZoneStub: any = { run: (fn: any) => fn?.() };

        const routerStub: any = { navigate: vi.fn(), navigateByUrl: vi.fn() };
        return new MetaMenuComponent(metaSrvStub, authSessionStub, trslStub, userInfoStub, workflowRuntimeMenuStub, httpStub, ngZoneStub, routerStub);
    }

    it('requiresAuthentication handles oauth and legacy states', () => {
        const component = buildComponent();
        expect(component.requiresAuthentication({ enabled: true, authenticated: false, legacyAuthenticated: true } as any)).toBe(true);
        expect(component.requiresAuthentication({ enabled: false, authenticated: false, legacyAuthenticated: false } as any)).toBe(true);
        expect(component.requiresAuthentication({ enabled: true, authenticated: true, legacyAuthenticated: false } as any)).toBe(false);
    });

    it('canOpenMenuContext and canDragMenu require admin role and menu id', () => {
        const component = buildComponent();
        component.menuAdminMethods = new Set(['reorderMenu', 'nestMenu']);
        const auth: any = { claims: [] };

        expect(component.canOpenMenuContext(auth, { mm_id: 10 })).toBe(true);
        expect(component.canOpenMenuContext(auth, { mm_id: null })).toBe(false);

        expect(component.canDragMenu(auth, { mm_id: 10 })).toBe(true);
        component.menuAdminMethods = new Set();
        expect(component.canDragMenu(auth, { mm_id: 10 })).toBe(false);
    });

    it('onMenuContext builds context items only when user can open context', () => {
        const component = buildComponent();
        component.menuAdminMethods = new Set(['addMenu']);
        const event = {
            preventDefault: vi.fn().mockName("MouseEvent.preventDefault"),
            stopPropagation: vi.fn().mockName("MouseEvent.stopPropagation")
        };
        const contextMenu = { show: vi.fn() };

        component.onMenuContext(event as any, { mm_id: 1, label: 'Cities' }, {} as any, contextMenu as any);

        expect(component.contextItems.length).toBeGreaterThan(0);
        expect(contextMenu.show).toHaveBeenCalled();
    });
});
