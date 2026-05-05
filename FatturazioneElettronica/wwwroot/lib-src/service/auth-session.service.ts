import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AUTH_REDIRECT_REASON_KEY } from '../interceptor/auth-expired.interceptor';
import { MetadataProviderService } from './metadata-provider.service';
import { TranslationManagerService } from './translation-manager.service';
import { UserInfoService } from './user-info.service';
import { WtoolboxService } from './wtoolbox.service';

export interface AuthSessionState {
  initialized: boolean;
  loading: boolean;
  enabled: boolean;
  authenticated: boolean;
  legacyAuthenticated: boolean;
  provider?: string;
  name?: string;
  legacyName?: string;
  legacyRole?: string;
  claims?: { type: string; value: string }[];
  error?: string;
  returnUrl: string;
  sessionExpiring?: boolean;
  sessionExpiresInSeconds?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthSessionService {
  private initialized = false;
  private sessionTimeoutMs = 0;
  private sessionWarningMs = 0;
  private sessionTimer: any = null;
  private sessionWarningTimer: any = null;
  private sessionCountdownTimer: any = null;

  private readonly stateSubject = new BehaviorSubject<AuthSessionState>({
    initialized: false,
    loading: false,
    enabled: false,
    authenticated: false,
    legacyAuthenticated: false,
    provider: 'Google',
    returnUrl: this.getCurrentLocalUrl()
  });

  readonly state$ = this.stateSubject.asObservable();
  get snapshot(): AuthSessionState {
    return this.stateSubject.value;
  }

  constructor(private http: HttpClient, private userInfoService: UserInfoService, private metadataProvider: MetadataProviderService, private translationManager: TranslationManagerService, private ngZone: NgZone) { }

  /**
   * Allinea ngx-translate alla lingua dell'utente appena autenticato/hydratato.
   * Necessario perche' il TranslationManagerService bootstrap risolve la lingua
   * via `userInfoService.getuserInfo()` quando NESSUN utente e' ancora loggato,
   * finendo di default su `navigator.language` o 'it-IT'. Senza questa call
   * esplicita post-login, le traduzioni rese dal primo render (toolbar, menu,
   * dialog) restano "appiccicate" alla lingua di bootstrap finche' l'utente
   * non cambia lingua manualmente dal selettore, che invece chiama direttamente
   * `useLanguage()`. Chiamata best-effort: fallisce silenzioso se la lingua non
   * e' supportata o la tabella traduzioni non e' ancora pronta.
   */
  private async applyUserLanguageToTranslations(userLike: any): Promise<void> {
    // Se l'utente ha gia' scelto manualmente una lingua via il dropdown in alto
    // (persistita in localStorage da `translationManager.useLanguage(persist:true)`),
    // RISPETTA quella scelta e NON sovrascrivere col default DB user.
    // Senza questo guard, ogni refresh (che fa applyUserLanguageToTranslations
    // post-login) sovrascriveva la lingua scelta manualmente con quella di
    // utenti.language del server, vanificando la persistenza client-side.
    try {
      const override = (localStorage.getItem('wuic-selected-language') ?? '').trim();
      if (override) return;
    } catch { /* private mode / no localStorage: fall through al default user */ }

    const languageId = userLike?.lingua?.id || userLike?.language;
    if (!languageId) return;
    try {
      await this.translationManager.useLanguage(String(languageId));
    } catch {
      // best-effort: non bloccare il login per un fail della i18n layer
    }
  }

  /**
   * Inizializza il servizio una sola volta (o forzatamente) e carica lo stato sessione corrente via `refreshAll`.
   * @param force Se `true` forza una nuova inizializzazione anche se gia avvenuta.
   */
  async initialize(force?: boolean) {
    if (this.initialized && !force) {
      return;
    }

    this.initialized = true;
    await this.refreshAll();

    // After the state is fully rebuilt, check if the previous session
    // was terminated for a specific reason (e.g. "session_replaced"
    // by another browser login).  The auth-expired interceptor stores
    // the reason in localStorage before forcing the page reload.
    this.applyRedirectReason();
  }

  /**
   * Hydrates the UI-side user snapshot from the backend when sessionStorage
   * is empty but a server-managed HttpOnly `k-user` cookie might still be
   * valid. This is the critical step for `enableCookieAuthentication=true`:
   * after a browser restart (or new tab) sessionStorage is gone, the cookie
   * is HttpOnly and invisible to JS, so without this call the guard would
   * wrongly redirect to `/unauthorized` despite a valid session.
   *
   * Flow:
   *   1. If sessionStorage already has a snapshot → no hydration needed.
   *   2. Otherwise call `MetaService.me` with `withCredentials:true`. The
   *      backend reads the HttpOnly cookie server-side and returns the
   *      public user fields (and `cookieAuthEnabled` for introspection).
   *   3. If `me()` returns a populated payload, write it to sessionStorage
   *      via `userInfoService.setUserInfoCookie` so subsequent calls see
   *      the user. If `me()` returns an empty object `{}` (no valid
   *      cookie) the hydration is a no-op and the UI stays logged out.
   *
   * Errors are swallowed on purpose: if `me()` throws (network, backend
   * down, legacy backend without the endpoint), we fall back to whatever
   * the cookie/sessionStorage already has without blocking the boot.
   */
  private async hydrateFromServerCookie(): Promise<void> {
    // Always call MetaService.me to validate the session against the
    // server. This catches stale sessions (e.g. token replaced by
    // another browser login) that sessionStorage alone can't detect.
    // The me() endpoint is lightweight (no DB hit when unauthenticated).
    const hadSnapshot = !!this.userInfoService.getStoredUserInfo();
    try {
      const meRes = await firstValueFrom(
        this.http.post<any>(
          this.buildMetaAsmxEndpoint('MetaService.me'),
          {},
          { withCredentials: true }
        )
      );
      // In legacy mode (enableCookieAuthentication=false) the server does
      // NOT track sessions: MetaService.me always returns isLogged:false
      // and the SOURCE OF TRUTH for the UI is the client-managed k-user
      // cookie / sessionStorage snapshot. Treating server's "false" as
      // authoritative here would kill the session right after every login.
      // Only enforce the server-side check when cookieAuth is on (server
      // can actually validate the HttpOnly cookie).
      const serverManagedCookie = meRes?.cookieAuthEnabled === true || meRes?.cookieAuthEnabled === 'true';
      if (!serverManagedCookie) {
        return;
      }

      const isLogged = meRes?.isLogged === true || meRes?.isLogged === 'true';
      if (isLogged && meRes.user_id && Number(meRes.user_id) > 0) {
        this.userInfoService.setUserInfoCookie(meRes);
        await this.applyUserLanguageToTranslations(meRes);
      } else {
        // Server says not logged in — clear any stale local snapshot
        // so the login form is shown instead of a broken menu.
        this.userInfoService.clearUserInfo();

        // If we had a local snapshot but the server says no, the
        // session was replaced or expired. Store the reason so
        // applyRedirectReason() can show it on the login form.
        if (hadSnapshot) {
          try { localStorage.setItem('wuic_auth_redirect_reason', 'session_replaced'); } catch { /* ignore */ }
        }
      }
    } catch {
      // Best effort — if the endpoint is unreachable the user simply
      // stays logged out. With the new me() contract this catch is only
      // hit on network errors / backend down, not on unauthenticated
      // requests (those return HTTP 200 + isLogged:false).
    }
  }

  /**
   * Ricalcola lo stato autenticazione combinando configurazione OAuth, endpoint `Auth/Enabled`, endpoint `Auth/Me`
   * e fallback sessione legacy (`k-user`), poi sincronizza eventuali custom settings utente.
   */
  async refreshAll() {
    this.patchState({ loading: true, error: undefined });

    // Critical for server-managed cookie mode: if there's no cached user
    // snapshot but a valid HttpOnly `k-user` cookie exists on the browser,
    // call the server to get the user payload back. Without this the guard
    // would redirect to /unauthorized despite a valid session, because JS
    // can't read HttpOnly cookies via document.cookie.
    await this.hydrateFromServerCookie();

    if (!this.isOAuthEnabledInSettings()) {
      const legacyUser = this.userInfoService.getStoredUserInfo();
      this.patchState({
        initialized: true,
        loading: false,
        enabled: false,
        authenticated: false,
        legacyAuthenticated: !!legacyUser,
        provider: undefined,
        name: undefined,
        legacyName: legacyUser?.display_name || legacyUser?.user_name,
        legacyRole: legacyUser?.role,
        claims: [],
        error: undefined
      });
      await this.bootstrapUserCustomSettings();
      if (legacyUser) this.resetSessionTimer();
      return;
    }

    try {
      const [enabledRes, meRes] = await Promise.all([
        firstValueFrom(this.http.get<any>(this.buildEndpoint('Enabled'), { withCredentials: true })),
        firstValueFrom(this.http.get<any>(this.buildEndpoint('Me'), { withCredentials: true }))
      ]);
      const legacyUser = this.userInfoService.getStoredUserInfo();

      this.patchState({
        initialized: true,
        loading: false,
        enabled: !!enabledRes?.enabled,
        authenticated: !!meRes?.authenticated,
        legacyAuthenticated: !!legacyUser,
        provider: meRes?.provider || enabledRes?.provider || 'Google',
        name: meRes?.name,
        legacyName: legacyUser?.display_name || legacyUser?.user_name,
        legacyRole: legacyUser?.role,
        claims: meRes?.claims || []
      });
      await this.bootstrapUserCustomSettings();
    } catch (error: any) {
      const legacyUser = this.userInfoService.getStoredUserInfo();
      this.patchState({
        initialized: true,
        loading: false,
        enabled: false,
        authenticated: false,
        legacyAuthenticated: !!legacyUser,
        legacyName: legacyUser?.display_name || legacyUser?.user_name,
        legacyRole: legacyUser?.role,
        error: error?.message || 'Unable to load auth session'
      });
    }
  }

  /**
   * Aggiorna il `returnUrl` nello stato sessione applicando normalizzazione anti-open-redirect.
   * @param returnUrl URL di ritorno post login/logout.
   */
  setReturnUrl(returnUrl: string) {
    this.patchState({
      returnUrl: this.normalizeReturnUrl(returnUrl)
    });
  }

  /**
   * Avvia il login OAuth reindirizzando il browser a `Auth/Login` con `returnUrl` codificato.
   * @param returnUrl URL di ritorno post login/logout.
   */
  login(returnUrl?: string) {
    const safeReturnUrl = this.normalizeReturnUrl(returnUrl || this.stateSubject.value.returnUrl);
    window.location.href = `${this.buildEndpoint('Login')}?returnUrl=${encodeURIComponent(safeReturnUrl)}`;
  }

  /**
   * Esegue logout OAuth: pulisce prima stato client (storage + DB locali) e custom settings, poi redirect a `Auth/Logout`.
   * @param returnUrl URL di ritorno post login/logout.
   */
  async logout(returnUrl?: string) {
    await this.clearClientRuntimeState();
    this.metadataProvider.clearCustomSettingsLocalStorage();
    const safeReturnUrl = this.normalizeReturnUrl(returnUrl || this.stateSubject.value.returnUrl);
    window.location.href = `${this.buildEndpoint('Logout')}?returnUrl=${encodeURIComponent(safeReturnUrl)}`;
  }

  /**
   * Esegue login legacy via `MetaService.login`, interpreta le varianti payload storiche (`isLogged`, `value`, JSON string)
   * e in caso positivo salva l'utente nel cookie `k-user`.
   * @param username Username credenziale di autenticazione.
   * @param password Password credenziale di autenticazione.
   */
  async legacyLogin(username: string, password: string, captchaToken?: string) {
    this.patchState({ loading: true, error: undefined });

    try {
      const payload: any = { user_name: username, password };
      if (captchaToken) {
        payload.captchaToken = captchaToken;
      }
      const raw = await firstValueFrom(this.http.post<any>(this.buildMetaAsmxEndpoint('MetaService.login'), payload, { withCredentials: true }));
      this.debugLegacyLogin('response', raw);
      const parsed = this.parseLegacyLoginResponse(raw);

      const isLogged = parsed?.isLogged === true || parsed?.isLogged === 'true';
      if (!parsed || !isLogged) {
        this.patchState({
          loading: false,
          legacyAuthenticated: false,
          error: this.extractLegacyLoginError(raw, parsed) || 'Credenziali non valide'
        });
        return false;
      }

      this.userInfoService.setUserInfoCookie(parsed);
      await this.applyUserLanguageToTranslations(parsed);
      await this.refreshAll();
      this.resetSessionTimer();
      return true;
    } catch (error: any) {
      this.debugLegacyLogin('error', error);
      this.patchState({
        loading: false,
        legacyAuthenticated: false,
        error: this.extractLegacyLoginError(error?.error, null)
          || error?.error?.message
          || error?.message
          || 'Errore login'
      });
      return false;
    }
  }

  /**
   * Logout flow that works in BOTH cookie modes:
   *
   *  - **Server-managed mode** (`enableCookieAuthentication=true`): the
   *    `k-user` cookie is HttpOnly, so the only way to delete it is via a
   *    `Set-Cookie` delete header from the server. We call
   *    `MetaService.logoutSession` (parameterless) which:
   *      1. derives the user from the cookie server-side,
   *      2. wipes the DB session token via the existing `logout(user)`
   *         per-DBMS dispatcher,
   *      3. emits the `Set-Cookie` delete with matching CookieOptions.
   *
   *  - **Legacy mode** (`enableCookieAuthentication=false`): we still call
   *    `logoutSession` because the server-side helper is idempotent in
   *    legacy mode and always wipes the DB token. The local
   *    `userInfoService.clearUserInfo()` then deletes the JS-readable
   *    cookie + sessionStorage snapshot.
   *
   * Why not call the legacy `MetaService.logout(user)` overload? It only
   * runs the per-DBMS DB cleanup; it does NOT emit the cookie delete
   * header, so the HttpOnly cookie would survive the logout in
   * server-managed mode and the next page load would re-hydrate the
   * supposedly-logged-out user via `MetaService.me`. The new
   * `logoutSession` does both atomically.
   */
  async legacyLogout() {
    this.patchState({ loading: true, error: undefined });

    const legacyUser = this.userInfoService.getStoredUserInfo();
    try {
      // Always call logoutSession (parameterless) — works in both modes,
      // is idempotent if no cookie is present, and ALWAYS clears the
      // server-side cookie when running in HttpOnly mode.
      await firstValueFrom(
        this.http.post<any>(
          this.buildMetaAsmxEndpoint('MetaService.logoutSession'),
          {},
          { withCredentials: true }
        )
      );
    } catch {
      // Best effort — a failed logout should not block the local cleanup.
    } finally {
      await this.clearClientRuntimeState();
      this.metadataProvider.clearCustomSettingsLocalStorage(legacyUser?.user_id);
      this.userInfoService.clearUserInfo();
      await this.refreshAll();
    }
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
   * @returns Valore restituito dal metodo (Promise<void>).
   */
  private async clearClientRuntimeState(): Promise<void> {
    this.clearBrowserStorage();

    MetadataProviderService.resetMetaDbRuntimeState();

    await Promise.allSettled([
      this.deleteDexieDatabase('MetaDB'),
      this.deleteDexieDatabase('WuicClientSideCrudDB')
    ]);

    // Ensure stale Dexie handles are not reused after database deletion.
    MetadataProviderService.resetMetaDbRuntimeState();
  }

  /**
   * Pulisce lo stato runtime e le cache associate.
   * Legge/scrive dati persistenti su storage browser.
   */
  private clearBrowserStorage(): void {
    try {
      localStorage.clear();
    } catch {
      // Ignore storage errors to keep logout flow resilient.
    }

    try {
      sessionStorage.clear();
    } catch {
      // Ignore storage errors to keep logout flow resilient.
    }
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
   * @param dbName Nome database locale/remote da trattare.
   * @returns Valore restituito dal metodo (Promise<void>).
   */
  private async deleteDexieDatabase(dbName: string): Promise<void> {
    const normalized = String(dbName || '').trim();
    if (!normalized) {
      return;
    }

    try {
      const { default: Dexie } = await import('dexie');
      await Dexie.delete(normalized);
      return;
    } catch {
      // Fallback to IndexedDB native delete when Dexie delete is not available.
    }

    await this.deleteIndexedDbByName(normalized);
  }

  /**
   * Rimuove i dati target aggiornando lo stato del servizio.
   * Gestisce anche persistenza locale su IndexedDB/Dexie quando prevista.
   * @param dbName Nome database locale/remote da trattare.
   * @returns Valore restituito dal metodo (Promise<void>).
   */
  private deleteIndexedDbByName(dbName: string): Promise<void> {
    if (!dbName || typeof indexedDB === 'undefined') {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      try {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Carica e cache-a i custom settings dell'utente loggato in localStorage allineando il bootstrap sessione con MetadataProvider.
   */
  private async bootstrapUserCustomSettings(): Promise<void> {
    const userId = this.userInfoService.getStoredUserInfo()?.user_id;
    if (userId === null || userId === undefined) {
      return;
    }

    await this.metadataProvider.bootstrapCustomSettingsToLocalStorage(userId);
  }

  /**
   * Configura il timeout di sessione in minuti. Chiamato dal meta-menu dopo aver letto AuthConfig.
   */
  setSessionTimeout(minutes: number, warningMinutes?: number) {
    if (!minutes || minutes <= 0) return;
    this.sessionTimeoutMs = minutes * 60 * 1000;
    this.sessionWarningMs = (warningMinutes && warningMinutes > 0 ? warningMinutes : 2) * 60 * 1000;
    this.setupActivityListeners();

    // Riavvia il timer con i nuovi valori (se l'utente e' gia' autenticato).
    // Senza questa chiamata, cambiare `sessionTimeoutMinutes` da appsettings
    // editor non avrebbe effetto immediato: il timer in corso continua con
    // i valori vecchi finche' non scatta una activity. Con la nuova logica
    // l'effetto e' istantaneo: timer riarmato sui nuovi delay.
    if (this.isUserAuthenticated()) {
      this.resetSessionTimer();
    }
  }

  private activityListenersAttached = false;
  /** Timestamp dell'ultimo reset throttled, in ms epoch. */
  private lastActivityResetAt = 0;
  /** Min intervallo tra reset throttled (mousemove/scroll). 1s e' un buon compromesso
   *  tra responsiveness al "vero" idle e overhead da event flood. */
  private static readonly ACTIVITY_RESET_THROTTLE_MS = 1000;

  private setupActivityListeners() {
    if (this.activityListenersAttached) return;
    this.activityListenersAttached = true;

    // Eventi "discreti" (rari): reset immediato, niente throttle.
    const resetImmediate = () => this.resetSessionTimer();

    // Eventi "continui" (mousemove/scroll/touchmove): possono firare a 60+ Hz,
    // throttle a `ACTIVITY_RESET_THROTTLE_MS` per non bruciare CPU resettando
    // setTimeout di sistema migliaia di volte al secondo.
    const resetThrottled = () => {
      const now = Date.now();
      if (now - this.lastActivityResetAt < AuthSessionService.ACTIVITY_RESET_THROTTLE_MS) {
        return;
      }
      this.lastActivityResetAt = now;
      this.resetSessionTimer();
    };

    this.ngZone.runOutsideAngular(() => {
      // Reset immediato su input "intenzionale".
      document.addEventListener('click', resetImmediate, { passive: true });
      document.addEventListener('keydown', resetImmediate, { passive: true });
      document.addEventListener('touchstart', resetImmediate, { passive: true });

      // Reset throttled su movimenti continui — coprono il caso "navigo, scrollo
      // e leggo per 5 minuti senza cliccare".
      document.addEventListener('mousemove', resetThrottled, { passive: true });
      document.addEventListener('scroll', resetThrottled, { passive: true, capture: true });
      document.addEventListener('wheel', resetThrottled, { passive: true });
      document.addEventListener('touchmove', resetThrottled, { passive: true });
    });
  }

  /**
   * Avvia/riavvia i timer di sessione. Chiamato dopo login e ad ogni attività HTTP.
   */
  resetSessionTimer() {
    if (!this.sessionTimeoutMs) return;
    if (!this.isUserAuthenticated()) return;

    this.clearSessionTimers();
    this.patchState({ sessionExpiring: false, sessionExpiresInSeconds: undefined });

    const warningDelay = Math.max(this.sessionTimeoutMs - this.sessionWarningMs, 0);

    this.ngZone.runOutsideAngular(() => {
      this.sessionWarningTimer = setTimeout(() => {
        this.ngZone.run(() => this.startSessionExpiryCountdown());
      }, warningDelay);

      this.sessionTimer = setTimeout(() => {
        this.ngZone.run(() => this.handleSessionExpired());
      }, this.sessionTimeoutMs);
    });
  }

  private startSessionExpiryCountdown() {
    const remaining = Math.round(this.sessionWarningMs / 1000);
    this.patchState({ sessionExpiring: true, sessionExpiresInSeconds: remaining });

    let seconds = remaining;
    this.sessionCountdownTimer = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this.sessionCountdownTimer);
        this.sessionCountdownTimer = null;
        return;
      }
      this.patchState({ sessionExpiresInSeconds: seconds });
    }, 1000);
  }

  private async handleSessionExpired() {
    this.clearSessionTimers();
    this.patchState({ sessionExpiring: false, sessionExpiresInSeconds: undefined });

    // Persist reason BEFORE legacyLogout/logout (which clears localStorage)
    // so the login form post-redirect mostra "Sessione scaduta per inattivita".
    // Senza questa write, il redirect mostrerebbe il login form senza messaggio.
    try { localStorage.setItem(AUTH_REDIRECT_REASON_KEY, 'session_expired'); } catch { /* quota */ }

    try {
      if (this.snapshot.legacyAuthenticated) {
        await this.legacyLogout();
      } else if (this.snapshot.authenticated) {
        await this.logout();
      }
    } catch {
      // best-effort: il redirect sotto deve avvenire comunque
    }

    // Re-write reason in caso legacyLogout l'abbia rimosso via localStorage.clear()
    try { localStorage.setItem(AUTH_REDIRECT_REASON_KEY, 'session_expired'); } catch { /* quota */ }

    // Forza un full page reload alla root: stesso comportamento dell'interceptor
    // 401 (`auth-expired.interceptor.ts`). Senza questa redirect l'utente resta
    // su una protected route con UI in stato "Loading..." indefinito (component
    // tree gia' montato che attende dati ma il guard non ha ancora ridiretto).
    try {
      window.location.href = '/';
    } catch { /* SSR/test fallback */ }
  }

  private clearSessionTimers() {
    if (this.sessionTimer) { clearTimeout(this.sessionTimer); this.sessionTimer = null; }
    if (this.sessionWarningTimer) { clearTimeout(this.sessionWarningTimer); this.sessionWarningTimer = null; }
    if (this.sessionCountdownTimer) { clearInterval(this.sessionCountdownTimer); this.sessionCountdownTimer = null; }
  }

  private isUserAuthenticated(): boolean {
    const s = this.snapshot;
    return s.authenticated || s.legacyAuthenticated;
  }

  /**
   * Applica un aggiornamento parziale allo stato `AuthSessionState` preservando le proprieta non toccate.
   * @param partial Delta stato da fondere con lo stato corrente.
   */
  /**
   * Sets a user-visible error message in the auth state.
   * Used by the auth-expired interceptor to communicate the logout
   * reason (e.g. "session replaced by another login") after the
   * logout flow has completed and the login form is visible.
   */
  setError(message: string) {
    this.patchState({ error: message });
  }

  /** User-facing messages keyed by server reason code. */
  private static readonly REASON_MESSAGES: Record<string, string> = {
    session_replaced: 'Sessione terminata: è stato effettuato l\'accesso con lo stesso utente da un altro browser.',
    session_expired: 'Sessione scaduta per inattività.'
  };

  /**
   * Reads and removes the redirect reason left by the auth-expired
   * interceptor in localStorage, then sets the corresponding error
   * message in the auth state so the login form displays it.
   */
  private applyRedirectReason() {
    const key = 'wuic_auth_redirect_reason';
    try {
      const reason = localStorage.getItem(key);
      if (reason) {
        localStorage.removeItem(key);
        const message = AuthSessionService.REASON_MESSAGES[reason];
        if (message) {
          this.patchState({ error: message });
        }
      }
    } catch { /* storage not available */ }
  }

  private patchState(partial: Partial<AuthSessionState>) {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...partial
    });
  }

  /**
   * Costruisce una struttura derivata a partire dallo stato corrente.
   * @param action Azione richiesta nel flusso corrente.
   */
  private buildEndpoint(action: 'Enabled' | 'Me' | 'Login' | 'Logout') {
    const apiBase = this.getApiBaseUrl();
    return `${apiBase}Auth/${action}`;
  }

  /**
   * Costruisce una struttura derivata a partire dallo stato corrente.
   * @param fullMethodName Nome completo metodo legacy (es. `MetaService.login`).
   */
  private buildMetaAsmxEndpoint(fullMethodName: string) {
    const apiBase = this.getApiBaseUrl();
    return `${apiBase}Meta/AsmxProxy/${fullMethodName}`;
  }

  /**
   * Risolve la base URL API usata dal servizio: preferisce `appSettings.api_url`, fallback su `${window.location.origin}/api/`.
   */
  private getApiBaseUrl() {
    const configured = WtoolboxService.appSettings?.api_url as string;
    if (configured && configured.trim().length > 0) {
      return configured.endsWith('/') ? configured : `${configured}/`;
    }

    return `${window.location.origin}/api/`;
  }

  /**
   * Valuta una condizione booleana sullo stato o sull'input corrente.
   * @returns Valore restituito dal metodo (boolean).
   */
  private isOAuthEnabledInSettings(): boolean {
    const settings = WtoolboxService.appSettings || {};

    const raw =
      settings.oauth_enabled ??
      settings.oauthEnabled ??
      settings.oauth?.enabled ??
      settings.authentication?.oauth?.enabled ??
      settings.Authentication?.OAuth?.Enabled;

    if (raw === null || raw === undefined) {
      return true;
    }

    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return !!raw;
  }

  /**
   * Normalizza il payload in una forma coerente per i passaggi successivi.
   * @param returnUrl URL di ritorno post login/logout.
   */
  private normalizeReturnUrl(returnUrl: string) {
    if (!returnUrl || !returnUrl.trim()) {
      return this.getCurrentLocalUrl();
    }

    // Prevent open redirects and keep SPA navigation local.
    if (returnUrl.startsWith('/')) {
      return returnUrl;
    }

    try {
      const parsed = new URL(returnUrl, window.location.origin);
      if (parsed.origin !== window.location.origin) {
        return '/';
      }

      return parsed.toString();
    } catch {
      return '/';
    }
  }

  /**
   * Ritorna l'URL browser corrente usato come `returnUrl` predefinito in login/logout.
   */
  private getCurrentLocalUrl() {
    return window.location.href;
  }

  /**
   * Esegue il parsing del valore in ingresso con fallback sicuro.
   * @param raw Payload legacy da interpretare (stringa JSON, oggetto o wrapper con `value`).
   * @returns Valore restituito dal metodo (any).
   */
  private parseLegacyLoginResponse(raw: any): any {
    if (raw == null) {
      return null;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    if (typeof raw === 'object') {
      if (typeof raw.value === 'string') {
        try {
          return JSON.parse(raw.value);
        } catch {
          return raw.value;
        }
      }
      return raw;
    }

    return null;
  }

  /**
   * Estrae un messaggio errore leggibile da payload legacy eterogenei (raw/parsing/error/value) del login storico.
   * @param raw Payload grezzo risposta/errore.
   * @param parsed Payload gia interpretato.
   * @returns Messaggio errore normalizzato oppure `null`.
   */
  private extractLegacyLoginError(raw: any, parsed: any): string | null {
    const candidates: any[] = [parsed, raw, raw?.value, raw?.error];

    for (const candidate of candidates) {
      const msg = this.readMessage(candidate);
      if (msg) {
        return msg;
      }
    }

    if (typeof raw === 'string') {
      const lowered = raw.toLowerCase();
      if (lowered.includes('unauthorized') || lowered.includes('non autorizzato')) {
        return 'Non autorizzato';
      }
    }

    return null;
  }

  /**
   * Prova a leggere un messaggio errore da stringhe plain/JSON o da oggetti con chiavi comuni (`message`, `error`, `ExceptionMessage`).
   * @param candidate Sorgente messaggio da analizzare.
   * @returns Messaggio trovato oppure `null`.
   */
  private readMessage(candidate: any): string | null {
    if (!candidate) {
      return null;
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) {
        return null;
      }

      try {
        const parsed = JSON.parse(trimmed);
        return this.readMessage(parsed);
      } catch {
        // Plain string error
        return trimmed;
      }
    }

    if (typeof candidate === 'object') {
      const keys = ['message', 'Message', 'error', 'Error', 'exceptionMessage', 'ExceptionMessage'];
      for (const key of keys) {
        const value = candidate[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }

    return null;
  }

  /**
   * Log diagnostico opzionale del flusso login legacy, attivo solo con `appSettings.debugLegacyLogin === true`.
   * @param kind Tipo evento (`response` o `error`).
   * @param payload Payload da tracciare in console.
   */
  private debugLegacyLogin(kind: 'response' | 'error', payload: any) {
    if (WtoolboxService.appSettings?.debugLegacyLogin !== true) {
      return;
    }

    // Dev-only diagnostic to inspect MetaService.login payload shape.
    console.log(`[AuthSessionService][legacyLogin][${kind}]`, payload);
  }
}
