import { LookupEditorComponent } from './lookup-editor.component';

describe('lookup-editor.component.spec', () => {
    const createComponent = () => {
        return new LookupEditorComponent({ instant: (k: string) => k } as any, { detectChanges: () => undefined } as any, { nativeElement: document.createElement('div') } as any);
    };

    it('should pass smoke test', () => {
        expect(true).toBe(true);
    });

    it('isLookupVirtualizationEnabled parses boolean-like values', () => {
        const component = createComponent();
        component.field = { extras: { lookup: { virtualize: 'true' } } } as any;
        expect(component.isLookupVirtualizationEnabled()).toBe(true);

        component.field = { extras: { lookup: { virtualize: 0 } } } as any;
        expect(component.isLookupVirtualizationEnabled()).toBe(false);
    });

    it('getLookupVirtualizationItemSize reads configured itemSize and fallback', () => {
        const component = createComponent();
        component.field = { extras: { lookup: { virtualize: { enabled: true, itemSize: 52 } } } } as any;
        expect(component.getLookupVirtualizationItemSize()).toBe(52);

        component.field = { extras: { lookup: { virtualize: { enabled: true, itemSize: -1 } } } } as any;
        expect(component.getLookupVirtualizationItemSize()).toBe(44);
    });

    it('getLookupVirtualizationItemSize returns undefined when virtualization is disabled', () => {
        const component = createComponent();
        component.field = { extras: { lookup: { virtualize: false } } } as any;
        expect(component.getLookupVirtualizationItemSize()).toBeUndefined();
    });
});
