import { DataProviderService } from './data-provider.service';

describe('DataProviderService', () => {
    function buildService(userId = 100274) {
        const httpStub: any = {};
        const metaSrvStub: any = {};
        const odataSrvStub: any = {
            update: vi.fn().mockResolvedValue({ source: 'odata' })
        };
        const dataMetaSrvStub: any = {
            selectByRoute: vi.fn().mockResolvedValue({ dato: [], totalRowCount: 0 }),
            selectCombo: vi.fn().mockResolvedValue({ dato: [{ id: 5 }], totalRowCount: 1 }),
            update: vi.fn().mockResolvedValue({ source: 'meta' })
        };
        const webSrvStub: any = {
            select: vi.fn().mockResolvedValue({ dato: [{ id: 3 }], totalRowCount: 1 }),
            update: vi.fn().mockResolvedValue({ source: 'web' })
        };
        const clientCrudStub: any = {
            select: vi.fn().mockResolvedValue({ dato: [{ id: 9 }], totalRowCount: 1 }),
            update: vi.fn().mockResolvedValue({ source: 'client' }),
            insert: vi.fn().mockResolvedValue({ source: 'client' }),
            delete: vi.fn().mockResolvedValue({ source: 'client' })
        };
        const userInfoStub: any = {
            getuserInfo: () => ({ user_id: userId })
        };
        const service = new DataProviderService(httpStub, metaSrvStub, odataSrvStub, dataMetaSrvStub, webSrvStub, userInfoStub, clientCrudStub);

        return { service, dataMetaSrvStub, odataSrvStub, webSrvStub, clientCrudStub };
    }

    it('selectByRoute uses current user id when delegating to DataProviderMetaService', async () => {
        const { service, dataMetaSrvStub } = buildService(777);

        await service.selectByRoute('cities', [], [], 10, 2);

        expect(dataMetaSrvStub.selectByRoute).toHaveBeenCalledWith(777, 'cities', expect.anything(), expect.anything(), 10, 2);
    });

    it('update delegates to meta provider when endpoint is not configured', async () => {
        const { service, dataMetaSrvStub, odataSrvStub, webSrvStub } = buildService();
        const scope: any = { metaInfo: { tableMetadata: { extraProps: {} } } };

        const result = await service.update({ id: 1 }, { id: 1 }, scope);

        expect(dataMetaSrvStub.update).toHaveBeenCalled();
        expect(odataSrvStub.update).not.toHaveBeenCalled();
        expect(webSrvStub.update).not.toHaveBeenCalled();
        expect((result as any).source).toBe('meta');
    });

    it('update delegates to odata provider when endpoint type is odata', async () => {
        const { service, dataMetaSrvStub, odataSrvStub, webSrvStub } = buildService();
        const scope: any = { metaInfo: { tableMetadata: { extraProps: { endpoint: { type: 'odata' } } } } };

        const result = await service.update({ id: 1 }, { id: 1 }, scope);

        expect(odataSrvStub.update).toHaveBeenCalled();
        expect(dataMetaSrvStub.update).not.toHaveBeenCalled();
        expect(webSrvStub.update).not.toHaveBeenCalled();
        expect((result as any).source).toBe('odata');
    });

    it('update delegates to web provider when endpoint type is not odata', async () => {
        const { service, dataMetaSrvStub, odataSrvStub, webSrvStub } = buildService();
        const scope: any = { metaInfo: { tableMetadata: { extraProps: { endpoint: { type: 'webservice' } } } } };

        const result = await service.update({ id: 1 }, { id: 1 }, scope);

        expect(webSrvStub.update).toHaveBeenCalled();
        expect(dataMetaSrvStub.update).not.toHaveBeenCalled();
        expect(odataSrvStub.update).not.toHaveBeenCalled();
        expect((result as any).source).toBe('web');
    });

    it('select uses client-side CRUD provider when mode is active', async () => {
        const { service, clientCrudStub, dataMetaSrvStub, odataSrvStub, webSrvStub } = buildService();
        const scope: any = {
            clientSideCrudActive: true,
            metaInfo: { tableMetadata: { extraProps: {} } }
        };

        const result = await service.select(scope, true);

        expect(clientCrudStub.select).toHaveBeenCalled();
        expect(dataMetaSrvStub.selectByRoute).not.toHaveBeenCalled();
        expect(odataSrvStub.update).not.toHaveBeenCalled();
        expect(webSrvStub.select).not.toHaveBeenCalled();
        expect(result.dato[0].id).toBe(9);
    });

    it('select delegates to web provider when endpoint type is webservice', async () => {
        const { service, webSrvStub } = buildService();
        const scope: any = {
            clientSideCrudActive: false,
            metaInfo: { tableMetadata: { extraProps: { endpoint: { type: 'webservice' } } } }
        };

        await service.select(scope, true);
        expect(webSrvStub.select).toHaveBeenCalled();
    });

    it('select with useComboEndpoint delegates to web provider when endpoint type is webservice', async () => {
        const { service, webSrvStub, dataMetaSrvStub } = buildService();
        const scope: any = {
            clientSideCrudActive: false,
            useComboEndpoint: true,
            metaInfo: { tableMetadata: { extraProps: { endpoint: { type: 'webservice' } } } }
        };

        await service.select(scope, true);

        expect(webSrvStub.select).toHaveBeenCalled();
        expect(dataMetaSrvStub.selectCombo).not.toHaveBeenCalled();
    });

    it('update uses remote provider when forceRemote=true even with client-side mode active', async () => {
        const { service, clientCrudStub, odataSrvStub } = buildService();
        const scope: any = {
            clientSideCrudActive: true,
            metaInfo: { tableMetadata: { extraProps: { endpoint: { type: 'odata' } } } }
        };

        const result = await service.update({ id: 1 }, { id: 1 }, scope, true);

        expect(clientCrudStub.update).not.toHaveBeenCalled();
        expect(odataSrvStub.update).toHaveBeenCalled();
        expect((result as any).source).toBe('odata');
    });
});
