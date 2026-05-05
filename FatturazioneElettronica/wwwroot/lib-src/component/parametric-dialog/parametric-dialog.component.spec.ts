import '@angular/compiler';
import { ParametricDialogComponent } from './parametric-dialog.component';
import { MetaInfo } from '../../class/metaInfo';

describe('parametric-dialog.component.spec', () => {
    function createComponent(): ParametricDialogComponent {
        const routeStub: any = {
            snapshot: {
                paramMap: {
                    get: () => ''
                }
            }
        };
        const routerStub: any = {};
        const trnslStub: any = {};
        const hostElementRefStub: any = { nativeElement: document.createElement('div') };
        return new ParametricDialogComponent(null, null, routeStub, routerStub, trnslStub, hostElementRefStub);
    }

    function createMetaInfo(dataTabs: any[]): MetaInfo {
        const metaInfo = new MetaInfo();
        metaInfo.tableMetadata.md_tab_edit = true;
        metaInfo.columnMetadata = [];
        metaInfo.dataTabs = dataTabs;
        return metaInfo;
    }

    function applySnapshot(component: ParametricDialogComponent, dataTabs: any[]): void {
        const metaInfo = createMetaInfo(dataTabs);
        const ds: any = {
            resultInfo: { current: {} },
            pristine: {}
            ,
            metaInfo
        };
        (component as any).applyDatasourceSnapshot(ds, metaInfo);
    }

    it('uses selected metadata tab when present and visible', () => {
        const component = createComponent();
        const tabs = [
            { tabName: 'tab_a', selected: false, hidden: false },
            { tabName: 'tab_b', selected: true, hidden: false },
            { tabName: 'tab_c', selected: false, hidden: false }
        ];

        applySnapshot(component, tabs);

        expect(component.visibleDataTabs[1].selected).toBe(true);
        expect(component.visibleDataTabs[0].selected).toBe(false);
        expect(component.visibleDataTabs[2].selected).toBe(false);
    });

    it('falls back to first visible tab when no selected tab is present', () => {
        const component = createComponent();
        const tabs = [
            { tabName: 'tab_a', selected: false, hidden: false },
            { tabName: 'tab_b', selected: false, hidden: false }
        ];

        applySnapshot(component, tabs);

        expect(component.visibleDataTabs[0].selected).toBe(true);
        expect(component.visibleDataTabs[1].selected).toBe(false);
    });

    it('updates metadata selected flags when tab value changes', () => {
        const component = createComponent();
        const tabs = [
            { tabName: 'tab_a', selected: true, hidden: false },
            { tabName: 'tab_b', selected: false, hidden: false }
        ];

        applySnapshot(component, tabs);
        component.onTabValueChange(component.getTabValue(component.visibleDataTabs[1], 1));

        expect(component.visibleDataTabs[0].selected).toBe(false);
        expect(component.visibleDataTabs[1].selected).toBe(true);
    });

    it('keeps stable tab values by index and syncs activeTabValue on metadata selection', () => {
        const component = createComponent();
        const tabs = [
            { tabName: 'tab_a', selected: true, hidden: false },
            { tabName: 'tab_b', selected: false, hidden: false },
            { tabName: 'tab_c', selected: false, hidden: false }
        ];

        applySnapshot(component, tabs);
        expect(component.getTabValue(component.visibleDataTabs[0], 0)).toBe(0);
        expect(component.getTabValue(component.visibleDataTabs[1], 1)).toBe(1);
        expect(component.activeTabValue).toBe(0);

        tabs[0].selected = false;
        tabs[2].selected = true;
        applySnapshot(component, tabs);
        expect(component.activeTabValue).toBe(2);
    });

    it('ignores hidden selected tabs and picks first visible one', () => {
        const component = createComponent();
        const tabs = [
            { tabName: 'tab_hidden', selected: true, hidden: true },
            { tabName: 'tab_a', selected: false, hidden: false },
            { tabName: 'tab_b', selected: false, hidden: false }
        ];

        applySnapshot(component, tabs);

        expect(component.visibleDataTabs[0].tabName).toBe('tab_a');
        expect(component.visibleDataTabs[0].selected).toBe(true);
        expect(component.visibleDataTabs[1].selected).toBe(false);
    });
});
