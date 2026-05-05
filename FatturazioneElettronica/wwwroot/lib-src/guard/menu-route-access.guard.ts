import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, CanMatchFn, Route, Router, RouterStateSnapshot, UrlSegment, UrlTree } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { AuthSessionService } from '../service/auth-session.service';
import { MetadataProviderService } from '../service/metadata-provider.service';
import { UserInfoService } from '../service/user-info.service';

const menuRouteCache = new Map<string, Set<string>>();

export const menuRouteAccessCanMatchGuard: CanMatchFn = async (_route: Route, segments: UrlSegment[]) => {
  const attemptedPath = '/' + segments.map((x) => x.path).join('/');
  return evaluateMenuAccess(attemptedPath);
};

export const menuRouteAccessCanActivateGuard: CanActivateFn = async (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  return evaluateMenuAccess(state.url || '/');
};

async function evaluateMenuAccess(rawTargetPath: string): Promise<boolean | UrlTree> {
  // IMPORTANT: tutti gli `inject()` devono essere SINCRONI all'inizio della
  // funzione, PRIMA di qualunque `await`. Angular non preserva l'injection
  // context oltre le await-boundary di una async function: chiamare `inject()`
  // dopo un await lancia NG0203 ("inject() must be called from an injection
  // context"). Questo diventa particolarmente visibile durante l'auto-logout,
  // dove `initialize()` → 401 → redirect trigga re-navigation → il guard
  // ripiomba qui con un await che innesca l'errore.
  const userInfo = inject(UserInfoService);
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const metadataProvider = inject(MetadataProviderService);

  // CRITICAL: await auth bootstrap before evaluating access.
  //
  // Why: in a fresh tab (e.g. ctrl+click or target="_blank" on a deep link
  // like /cities/list) the app boots without going through any UI component
  // that would normally call `authSession.initialize()` (today only
  // meta-menu.component.ts does it). At the same time `sessionStorage` is
  // per-tab isolated (W3C spec) so the cached `k-user-memory` snapshot from
  // the originating tab is NOT visible here. Without this await:
  //   - `authSession.snapshot.initialized` is still false,
  //   - `userInfo.getStoredUserInfo()` returns null,
  //   - `isAuthAdmin()` returns false,
  //   - the guard falls through to the empty allowed-routes set,
  //   - the user gets bounced to /unauthorized despite a valid session.
  //
  // `initialize()` is idempotent (no-op after the first call) so awaiting it
  // here adds latency only on the very first guard evaluation of the tab.
  // It performs `MetaService.me` to rehydrate the user from the (possibly
  // HttpOnly) cookie and writes the snapshot into sessionStorage so all
  // subsequent reads in this tab are synchronous.
  try {
    await authSession.initialize();
  } catch {
    // Intentionally swallow: a network failure during bootstrap should not
    // hard-block route evaluation — fall through to the legacy admin/menu
    // checks below, which still work via cookie fallback in legacy mode.
  }

  if (userInfo.isAuthAdmin(authSession.snapshot)) {
    return true;
  }

  const targetPath = normalizePath(rawTargetPath);
  if (!targetPath || targetPath === '/') {
    return true;
  }

  const allowedRoutes = await getAllowedRoutesForCurrentUser(userInfo, metadataProvider);
  const isAllowed = matchesAllowedRoute(targetPath, allowedRoutes);
  if (isAllowed) {
    return true;
  }

  return router.createUrlTree(['/unauthorized'], {
    queryParams: { from: targetPath }
  });
}

async function getAllowedRoutesForCurrentUser(
  userInfo: UserInfoService,
  metadataProvider: MetadataProviderService
): Promise<Set<string>> {
  // NOTE: i servizi arrivano come parametri perché questa funzione è chiamata
  // dopo un `await` nel caller — `inject()` qui triggerebbe NG0203.
  const user = userInfo.getStoredUserInfo();
  const userId = String(user?.user_id ?? '').trim();
  if (!userId) {
    return new Set<string>();
  }

  const cached = menuRouteCache.get(userId);
  if (cached) {
    return cached;
  }

  const localStorageRoutes = extractRoutesFromLocalStorageMenu(userId);
  if (localStorageRoutes.size > 0) {
    menuRouteCache.set(userId, localStorageRoutes);
    return localStorageRoutes;
  }

  try {
    const menu = await metadataProvider.getMenuByUserID(false);
    const routes = collectMenuRoutes(menu);
    menuRouteCache.set(userId, routes);
    return routes;
  } catch {
    return new Set<string>();
  }
}

function extractRoutesFromLocalStorageMenu(userId: string): Set<string> {
  try {
    const key = `menu_${userId}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return collectMenuRoutes(parsed as MenuItem[]);
  } catch {
    return new Set<string>();
  }
}

// Archetype suffixes WUIC: le voci di menu registrano tipicamente la variante
// `/<archetype>` della route (es. `cities/list`, `orders/dashboard`). Le altre
// varianti della STESSA risorsa (`cities/edit/:id`, `cities/new`, `cities/view/:id`,
// `cities/designer`, ...) sono accessibili dai bottoni della list stessa e NON
// compaiono come voci menu separate. Strippando questi suffissi estraiamo il
// "resource root" e lo aggiungiamo come route permessa: cosi' il client-guard
// autorizza tutte le varianti archetype della stessa risorsa.
//
// L'auth reale (insert/update/delete consentiti?) resta sul backend via
// `_mtdt__tnt__trzzzioni__tabelle`: se l'utente non puo' davvero editare
// `cities`, il server risponde 403 sulla POST crud.update. Il client-guard
// qui e' solo UX per non mostrare schermate vuote.
const ARCHETYPE_SUFFIXES = [
  '/list',
  '/dashboard',
  '/designer',
  '/gallery',
  '/view',
  '/edit',
  '/new',
  '/report',
  '/workflow',
];

function addResourceRoot(routes: Set<string>, normalizedRoute: string): void {
  for (const suffix of ARCHETYPE_SUFFIXES) {
    if (normalizedRoute.endsWith(suffix)) {
      const parent = normalizedRoute.substring(0, normalizedRoute.length - suffix.length);
      // Evita di aggiungere root vuoto `/` o stringa vuota: autorizzerebbe tutto.
      if (parent.length > 1) {
        routes.add(parent);
      }
      break; // una sola variante di suffisso per path, il primo match vince.
    }
  }
}

function collectMenuRoutes(items: MenuItem[]): Set<string> {
  const routes = new Set<string>();

  const visit = (nodes: MenuItem[]) => {
    for (const node of nodes || []) {
      const normalizedRoute = normalizePath((node as any)?.route);
      if (normalizedRoute) {
        routes.add(normalizedRoute);
        // Aggiungi anche il resource root cosi' le varianti archetype fratelli
        // (edit/view/new/designer/...) passano il `startsWith(root + '/')` in
        // matchesAllowedRoute. Senza questo, un utente con solo `cities/list`
        // nel menu viene bounced a `/unauthorized` su `cities/edit/:id` anche
        // se il backend gli concederebbe l'update.
        addResourceRoot(routes, normalizedRoute);
      }

      const children = Array.isArray(node?.items) ? node.items : [];
      if (children.length) {
        visit(children);
      }
    }
  };

  visit(items || []);
  return routes;
}

function matchesAllowedRoute(targetPath: string, allowedRoutes: Set<string>): boolean {
  if (!allowedRoutes.size) {
    return false;
  }

  if (allowedRoutes.has(targetPath)) {
    return true;
  }

  for (const route of allowedRoutes) {
    if (targetPath.startsWith(`${route}/`)) {
      return true;
    }
  }

  return false;
}

function normalizePath(input: any): string {
  if (typeof input !== 'string') {
    return '';
  }

  let value = input.trim();
  if (!value) {
    return '';
  }

  if (value.startsWith('#/')) {
    value = value.substring(1);
  } else if (value.startsWith('#')) {
    value = value.substring(1);
  }

  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) {
    value = value.substring(0, queryIndex);
  }

  if (!value.startsWith('/')) {
    value = `/${value}`;
  }

  value = value.replace(/\/{2,}/g, '/');
  if (value.length > 1 && value.endsWith('/')) {
    value = value.substring(0, value.length - 1);
  }

  return value.toLowerCase();
}
