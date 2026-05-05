import { MetadataProviderService } from './metadata-provider.service';
import { DataProviderMetaService } from './data-provider-meta.service';

describe('DataProviderMetaService', () => {
    it('select sends expected read payload and maps resultInfo', async () => {
        const postSpy = vi.fn().mockReturnValue({
            toPromise: () => Promise.resolve({
                results: [{ id: 1, name: 'Rome' }],
                TotalRecords: 1,
                TotalGroups: 0,
                Agg: []
            })
        });

        const service = new DataProviderMetaService({ post: postSpy } as any);
        MetadataProviderService.readUri = '/api/Meta/AsmxProxy/MetaService.getFlatRecordData';

        const scope: any = {
            metaInfo: {
                tableMetadata: { md_route_name: 'cities', md_server_side_operations: true },
                columnMetadata: []
            },
            sortInfo: [],
            groupInfo: [],
            aggregationInfo: [],
            pageSize: 10,
            currentPage: 1,
            filterInfo: { logic: 'AND', filters: [] },
            loading: { next: vi.fn() }
        };

        const result = await service.select(scope, 100274, true);

        expect(postSpy).toHaveBeenCalled();
        const [, payload] = vi.mocked(postSpy).mock.lastCall;
        expect(payload.route).toBe('cities');
        expect(payload.user_id).toBe(100274);
        expect(payload.PageInfo.pageSize).toBe(10);
        expect(result.dato.length).toBe(1);
        expect(result.totalRowCount).toBe(1);
        expect(scope.loading.next).not.toHaveBeenCalled();
    });

    it('update sends __original and route/user payload to updateUri', async () => {
        const postSpy = vi.fn().mockReturnValue({
            toPromise: () => Promise.resolve({ id: 1, updated: true })
        });

        const service = new DataProviderMetaService({ post: postSpy } as any);
        MetadataProviderService.updateUri = '/api/Meta/AsmxProxy/MetaService.updateRecord';

        const scope: any = {
            metaInfo: {
                tableMetadata: { md_route_name: 'cities', extraProps: {} }
            },
            loading: { next: vi.fn() },
            getSchemaAndData: vi.fn()
        };

        const entity: any = { id: 1, name: 'Rome' };
        const pristine: any = { id: 1, name: 'Roma' };

        await service.update(entity, pristine, scope, { user_id: 100274 } as any);

        const [, payload] = vi.mocked(postSpy).mock.lastCall;
        expect(payload.route).toBe('cities');
        expect(payload.user_id).toBe(100274);
        expect(payload.entity.__original).toEqual(pristine);
    });
});
