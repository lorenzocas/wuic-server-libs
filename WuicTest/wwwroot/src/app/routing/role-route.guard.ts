import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, CanMatchFn, Route, Router, RouterStateSnapshot, UrlSegment, UrlTree } from '@angular/router';
import { AuthSessionService, UserInfoService } from '../wuic-bridges-npm/core';
import { FRAMEWORK_ROUTE_ROLE_RULES, RouteRoleRule } from './route-role-map';

type GuardRouteData = { roleRuleKey?: string };

export const roleRouteCanMatchGuard: CanMatchFn = (route: Route, segments: UrlSegment[]) => {
  const attemptedPath = '/' + segments.map((s) => s.path).join('/');
  return evaluateRouteAccess(route, attemptedPath);
};

export const roleRouteCanActivateGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  return evaluateRouteAccess(route.routeConfig, state.url || '/');
};

function evaluateRouteAccess(route: Route | null | undefined, attemptedPath: string): boolean | UrlTree {
  const rule = resolveRule(route);
  if (!rule) {
    return true;
  }

  const currentRoles = getCurrentUserRoles();
  const requiredRoles = normalizeRoles(rule.roles);
  const isAllowed = requiredRoles.some((role) => currentRoles.has(role));

  if (isAllowed) {
    return true;
  }

  const router = inject(Router);
  return router.createUrlTree(['/unauthorized'], {
    queryParams: { from: attemptedPath || '/' }
  });
}

function resolveRule(route: Route | null | undefined): RouteRoleRule | null {
  if (!route) {
    return null;
  }

  const data = (route.data || {}) as GuardRouteData;
  const roleRuleKey = String(data.roleRuleKey || '').trim();
  if (roleRuleKey) {
    return FRAMEWORK_ROUTE_ROLE_RULES.find((r) => r.key === roleRuleKey) || null;
  }

  const routePath = String(route.path || '').trim();
  if (!routePath) {
    return null;
  }

  return FRAMEWORK_ROUTE_ROLE_RULES.find((r) => r.routePattern === routePath) || null;
}

function getCurrentUserRoles(): Set<string> {
  const result = new Set<string>();
  const authSession = inject(AuthSessionService);
  const userInfoService = inject(UserInfoService);

  const claims = Array.isArray(authSession.snapshot?.claims) ? authSession.snapshot.claims : [];
  for (const claim of claims) {
    const type = String(claim?.type || '').toLowerCase();
    if (!type.includes('role')) {
      continue;
    }

    const parsed = normalizeRole(String(claim?.value || ''));
    if (parsed) {
      result.add(parsed);
    }
  }

  const legacyRole = normalizeRole(String(authSession.snapshot?.legacyRole || ''));
  if (legacyRole) {
    result.add(legacyRole);
  }

  const user = userInfoService.getStoredUserInfo();
  const cookieRole = normalizeRole(String(user?.role || ''));
  if (cookieRole) {
    result.add(cookieRole);
  }

  if (Number(user?.role_id || 0) === 1 || user?.isAdmin === true) {
    result.add('admin');
  }

  return result;
}

function normalizeRoles(roles: string[]): string[] {
  const set = new Set<string>();
  for (const role of roles || []) {
    const normalized = normalizeRole(role);
    if (normalized) {
      set.add(normalized);
    }
  }
  return Array.from(set);
}

function normalizeRole(value: string): string {
  return String(value || '').trim().toLowerCase();
}

