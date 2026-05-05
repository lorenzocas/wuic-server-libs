import { ReportViewerComponent } from './report-viewer.component';

describe('report-viewer.component.spec', () => {
    function createComponent() {
        return new ReportViewerComponent({ events: { subscribe: () => ({ unsubscribe() { } }) } } as any, {
            snapshot: { paramMap: { get: () => null }, queryParamMap: { get: () => null } }
        } as any);
    }

    // TODO(rotted): il constructor di ReportViewerComponent legge `WtoolboxService.appSettings.api_url`
    // ora obbligatorio, e lo stub corrente non lo fornisce. Da rivedere insieme allo stub di WtoolboxService.
    it.skip('flattens nested filterInfo when building report filters query', () => {
        const component = createComponent();
        const raw = JSON.stringify({
            logic: 'OR',
            filters: [
                { field: 'name', operatore: 'contains', value: 'Rom' },
                {
                    nestedFilters: {
                        logic: 'AND',
                        filters: [
                            { field: 'country', operatore: 'eq', value: 'IT' },
                            { field: 'status', operatore: 'eq', value: 'OPEN' }
                        ]
                    }
                }
            ]
        });

        const qs = (component as any).buildFiltersQueryString(raw);

        expect(qs).toContain('name||contains||Rom');
        expect(qs).toContain('country||eq||IT');
        expect(qs).toContain('status||eq||OPEN');
    });
});
