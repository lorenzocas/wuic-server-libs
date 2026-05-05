import { of } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { WtoolboxService } from './wtoolbox.service';

describe('AuthSessionService', () => {
    afterEach(() => {
        (WtoolboxService as any).appSettings = {};
    });

    it('refreshAll sets legacy-auth state when OAuth is disabled', async () => {
        (WtoolboxService as any).appSettings = { oauth_enabled: false };

        const httpStub: any = {
            get: vi.fn(),
            post: vi.fn()
        };
        const userInfoStub: any = {
            getStoredUserInfo: vi.fn().mockReturnValue({
                user_id: 100274,
                display_name: 'admin',
                user_name: 'admin',
                role: 'Admin'
            }),
            setUserInfoCookie: vi.fn(),
            clearUserInfo: vi.fn()
        };
        const metadataStub: any = {
            bootstrapCustomSettingsToLocalStorage: vi.fn().mockResolvedValue(undefined),
            clearCustomSettingsLocalStorage: vi.fn()
        };

        const service = new AuthSessionService(httpStub as any, userInfoStub as any, metadataStub as any, { run: (fn: any) => fn?.() } as any);
        await service.refreshAll();

        expect(service.snapshot.enabled).toBe(false);
        expect(service.snapshot.legacyAuthenticated).toBe(true);
        expect(service.snapshot.legacyName).toBe('admin');
        expect(metadataStub.bootstrapCustomSettingsToLocalStorage).toHaveBeenCalledWith(100274);
    });

    it('legacyLogin stores user cookie and resolves true on successful login payload', async () => {
        (WtoolboxService as any).appSettings = { oauth_enabled: false, api_url: '/api/' };

        const httpStub: any = {
            get: vi.fn(),
            post: vi.fn().mockReturnValue(of({
                isLogged: true,
                user_id: 100274,
                username: 'admin',
                display_name: 'admin',
                role: 'Admin',
                role_id: 1
            }))
        };
        const userInfoStub: any = {
            getStoredUserInfo: vi.fn().mockReturnValue({
                user_id: 100274,
                display_name: 'admin',
                user_name: 'admin',
                role: 'Admin'
            }),
            setUserInfoCookie: vi.fn(),
            clearUserInfo: vi.fn()
        };
        const metadataStub: any = {
            bootstrapCustomSettingsToLocalStorage: vi.fn().mockResolvedValue(undefined),
            clearCustomSettingsLocalStorage: vi.fn()
        };

        const service = new AuthSessionService(httpStub as any, userInfoStub as any, metadataStub as any, { run: (fn: any) => fn?.() } as any);
        const ok = await service.legacyLogin('admin', 'admin');

        expect(ok).toBe(true);
        expect(userInfoStub.setUserInfoCookie).toHaveBeenCalled();
    });

    it('legacyLogin resolves false and sets error when login payload is invalid', async () => {
        (WtoolboxService as any).appSettings = { oauth_enabled: false, api_url: '/api/' };

        const httpStub: any = {
            get: vi.fn(),
            post: vi.fn().mockReturnValue(of({
                isLogged: false,
                message: 'Credenziali non valide'
            }))
        };
        const userInfoStub: any = {
            getStoredUserInfo: vi.fn().mockReturnValue(null),
            setUserInfoCookie: vi.fn(),
            clearUserInfo: vi.fn()
        };
        const metadataStub: any = {
            bootstrapCustomSettingsToLocalStorage: vi.fn().mockResolvedValue(undefined),
            clearCustomSettingsLocalStorage: vi.fn()
        };

        const service = new AuthSessionService(httpStub as any, userInfoStub as any, metadataStub as any, { run: (fn: any) => fn?.() } as any);
        const ok = await service.legacyLogin('admin', 'wrong');

        expect(ok).toBe(false);
        expect(service.snapshot.error).toBeTruthy();
    });

    it('refreshAll loads oauth session when oauth is enabled', async () => {
        (WtoolboxService as any).appSettings = { oauth_enabled: true, api_url: '/api/' };

        const httpStub: any = {
            get: vi.fn().mockImplementation((url: string) => {
                if (url.endsWith('/Auth/Enabled')) {
                    return of({ enabled: true, provider: 'Google' });
                }
                return of({ authenticated: true, provider: 'Google', name: 'John', claims: [{ type: 'role', value: 'Admin' }] });
            }),
            post: vi.fn()
        };
        const userInfoStub: any = {
            getStoredUserInfo: vi.fn().mockReturnValue(null),
            setUserInfoCookie: vi.fn(),
            clearUserInfo: vi.fn()
        };
        const metadataStub: any = {
            bootstrapCustomSettingsToLocalStorage: vi.fn().mockResolvedValue(undefined),
            clearCustomSettingsLocalStorage: vi.fn()
        };

        const service = new AuthSessionService(httpStub as any, userInfoStub as any, metadataStub as any, { run: (fn: any) => fn?.() } as any);
        await service.refreshAll();

        expect(service.snapshot.enabled).toBe(true);
        expect(service.snapshot.authenticated).toBe(true);
        expect(service.snapshot.name).toBe('John');
        expect(service.snapshot.claims?.length).toBe(1);
    });

    it('setReturnUrl normalizes external urls to local root', () => {
        (WtoolboxService as any).appSettings = { oauth_enabled: true };
        const service = new AuthSessionService({ get: vi.fn(), post: vi.fn() } as any, {
            getStoredUserInfo: () => null
        } as any, {
            bootstrapCustomSettingsToLocalStorage: vi.fn().mockResolvedValue(undefined),
            clearCustomSettingsLocalStorage: vi.fn()
        } as any, { run: (fn: any) => fn?.() } as any);

        service.setReturnUrl('https://evil.example.com/hijack');
        expect(service.snapshot.returnUrl).toBe('/');
    });
});
