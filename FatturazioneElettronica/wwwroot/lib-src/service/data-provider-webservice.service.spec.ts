import { BehaviorSubject } from 'rxjs';
import { DataProviderWebserviceService } from './data-provider-webservice.service';
import { WtoolboxService } from './wtoolbox.service';

describe('DataProviderWebserviceService', () => {
    const originalAppSettings = WtoolboxService.appSettings;

    beforeEach(() => {
        (WtoolboxService as any).appSettings = { ...(originalAppSettings || {}), api_url: '/api/' };
    });

    afterAll(() => {
        (WtoolboxService as any).appSettings = originalAppSettings;
    });

    function createScope(method: 'get' | 'post', parameterMapping?: any[]) {
        return {
            metaInfo: {
                tableMetadata: {
                    md_route_name: 'cities',
                    extraProps: { endpoint: { method, uri: 'sample-endpoint', parameterMapping } }
                }
            },
            filterParam: null,
            filterInfo: { logic: 'AND', filters: [] as any[] },
            loading: new BehaviorSubject<boolean>(false),
            getObservable: vi.fn().mockImplementation((x: any) => x),
            isCurrentInsert: false
        } as any;
    }

    it('returns null when required mapped parameters are missing', async () => {
        const service = new DataProviderWebserviceService({ get: vi.fn(), post: vi.fn() } as any);
        const scope = createScope('post', [
            { source: { required: true }, target: { name: 'tenantId' } }
        ]);
        const loadingNextSpy = vi.spyOn(scope.loading, 'next');
        const logSpy = vi.spyOn(console, 'log');

        const result = await service.select(scope, 100274, true);

        expect(result).toBeNull();
        expect(logSpy).toHaveBeenCalled();
        expect(loadingNextSpy).not.toHaveBeenCalled();
        expect(scope.loading.value).toBe(false);
    });

    it('select maps required filter values to POST body', async () => {
        const postSpy = vi.fn().mockReturnValue({
            toPromise: () => Promise.resolve([{ id: 1, name: 'Rome' }])
        });
        const service = new DataProviderWebserviceService({ get: vi.fn(), post: postSpy } as any);
        const scope = createScope('post', [
            { source: { required: true }, target: { name: 'tenantId' } }
        ]);
        const loadingNextSpy = vi.spyOn(scope.loading, 'next');
        scope.filterInfo = {
            logic: 'AND',
            filters: [{ field: 'tenantId', value: 12 }]
        };

        const result = await service.select(scope, 100274, true);

        expect(postSpy).toHaveBeenCalledWith('/api/sample-endpoint', { tenantId: 12 });
        expect(result?.dato).toEqual([{ id: 1, name: 'Rome' }]);
        expect(result?.totalRowCount).toBe(1);
        expect(loadingNextSpy).not.toHaveBeenCalled();
    });

    it('select uses GET endpoint when method=get', async () => {
        const getSpy = vi.fn().mockReturnValue({
            toPromise: () => Promise.resolve([{ id: 5 }])
        });
        const service = new DataProviderWebserviceService({ get: getSpy, post: vi.fn() } as any);
        const scope = createScope('get');
        const loadingNextSpy = vi.spyOn(scope.loading, 'next');

        const result = await service.select(scope, 100274, true);

        expect(getSpy).toHaveBeenCalledWith('/api/sample-endpoint');
        expect(result?.dato).toEqual([{ id: 5 }]);
        expect(loadingNextSpy).not.toHaveBeenCalled();
    });
});
