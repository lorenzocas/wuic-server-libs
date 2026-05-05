import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { EMPTY, catchError, throwError } from 'rxjs';

/**
 * Module-level flag to prevent multiple concurrent logout calls when
 * several API requests fail with 401 at the same time.
 */
let logoutInProgress = false;

/**
 * localStorage key used to pass the logout reason across the full
 * page reload so the login form can display a user-friendly message.
 * Written in the `finally` callback AFTER legacyLogout (which clears
 * localStorage) but BEFORE the redirect. Read and removed by
 * AuthSessionService.initialize on the next page load.
 */
export const AUTH_REDIRECT_REASON_KEY = 'wuic_auth_redirect_reason';

/**
 * HTTP interceptor that detects 401 (Unauthorized) responses and
 * triggers an automatic logout + full page redirect to `/`.
 *
 * This is critical for `enableCookieAuthentication=true`: the
 * server-managed HttpOnly cookie can expire (via `sessionTimeoutMinutes`)
 * while the client-side session snapshot in sessionStorage is still
 * populated. Without this interceptor, expired sessions produce a
 * generic error dialog instead of a clean redirect to login.
 *
 * When the 401 carries a `session_replaced` reason (another browser
 * logged in with the same user, overwriting the token), the reason is
 * persisted to localStorage (survives the session clear) and displayed
 * by the login form after the redirect.
 *
 * Auth-related endpoints (login, logout, me) are excluded to avoid
 * infinite loops when the logout call itself returns 401.
 *
 * ALL 401 responses on non-auth endpoints are swallowed (including
 * concurrent ones while logout is in progress) to prevent the
 * GlobalHandler from showing error dialogs during the redirect.
 */
export const authExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  // NOTA (2026-04-23): RIMOSSA `const authSession = inject(AuthSessionService)`
  // che era dead code (mai usato nel body dell'interceptor) ma innescava
  // NG0200 al bootstrap prod con ottimizzazioni tree-shake aggressive.
  //
  // Chain del circular prima del fix:
  //   AppComponent.constructor(HttpClient) →
  //   HttpClient risolve gli interceptor (eager al construct) →
  //   authExpiredInterceptor eager-inject(AuthSessionService) →
  //   AuthSessionService.constructor richiede HttpClient →
  //   NG0200 Circular dependency detected for `_AuthSessionService`.
  //
  // Il body della funzione (401 → redirect window.location='/') non usa
  // authSession, quindi rimuoverlo e' safe. Se servisse aggiungere logica
  // che richiede AuthSessionService, farlo LAZY dentro il catchError via
  // `inject(Injector).get(AuthSessionService)` dopo il first tick, NON a
  // module-level dell'interceptor.
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isAuthEndpoint(req.url)) {
        if (!logoutInProgress) {
          logoutInProgress = true;

          const reason = extractAuthReason(error);

          // Clear client-side session so the login form shows after
          // the redirect (not the menu with stale user info).
          try { sessionStorage.clear(); } catch { /* ignore */ }

          // Persist the reason in localStorage (survives the clear
          // above since we only cleared sessionStorage).
          if (reason) {
            try { localStorage.setItem(AUTH_REDIRECT_REASON_KEY, reason); } catch { /* quota */ }
          }

          // Redirect immediately — don't wait for legacyLogout which
          // may hang if the server rejects the logout call with 401.
          // The full page reload resets all SPA state; the server
          // session is already invalid so no server-side cleanup is
          // strictly needed.
          window.location.href = '/';
        }

        // Swallow ALL 401s (first and concurrent) so the GlobalHandler
        // never shows an error dialog during the redirect.
        return EMPTY;
      }
      return throwError(() => error);
    })
  );
};

/**
 * Extracts the auth failure reason from the 401 response body.
 *
 * Two possible response shapes:
 * - JsonExceptionFilter (non-AsmxProxy): `{ Message: "session_replaced", ... }`
 * - AsmxProxy catch block: `{ rootMessage: "session_replaced", ... }`
 */
function extractAuthReason(error: HttpErrorResponse): string | null {
  const body = error.error;
  if (!body) return null;

  // AsmxProxy puts the base exception message in rootMessage;
  // JsonExceptionFilter serializes Exception.Message as "Message".
  const msg: string = body.rootMessage || body.Message || body.message || '';
  if (msg === 'session_replaced') return 'session_replaced';
  if (msg === 'session_expired') return 'session_expired';
  if (msg === 'auth_exception') return 'session_replaced';
  return null;
}

const AUTH_PATHS = [
  'MetaService.login',
  'MetaService.logout',
  'MetaService.logoutSession',
  'MetaService.me',
  'Auth/Login',
  'Auth/Logout',
  'Auth/Me',
  'Auth/Enabled',
  'AuthConfig'
];

function isAuthEndpoint(url: string): boolean {
  return AUTH_PATHS.some(p => url.includes(p));
}
