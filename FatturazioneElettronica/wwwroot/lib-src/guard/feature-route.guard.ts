import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanMatchFn,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
} from '@angular/router';
import { LicenseFeatureService } from '../service/license-feature.service';

/**
 * Route guard for feature-gated navigation. Supports two modes:
 *
 * 1) **URL-segment mode** (archetype-based): when the route template is
 *    `:route/:action`, the second path segment is treated as the archetype
 *    (e.g. `/cities/spreadsheet`). If the archetype requires a feature that
 *    the current license does not include, the user is redirected to the same
 *    route with `/list` archetype (safe universal fallback).
 *
 * 2) **Route-data mode**: when the route has `data: { requireFeature: 'X' }`,
 *    the guard checks feature `X` directly. Used for dedicated routes like
 *    `/workflow-designer`, `/rag-chatbot`, `:route/report-designer`.
 *
 * If neither the URL segment nor the data flag indicate a gated feature → allow.
 *
 * This is UX only — the real enforcement is server-side (data decoration,
 * boardcontent sanitizer, [RequireFeature] attribute). A patched client can
 * bypass this guard but premium backend operations will still fail 403.
 *
 * Installation:
 *
 *   // Archetype (URL-segment) mode:
 *   { path: ':route/:action',
 *     canMatch:    [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
 *     canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
 *     ... }
 *
 *   // Dedicated route mode:
 *   { path: 'workflow-designer',
 *     data: { requireFeature: 'workflow-designer', breadcrumbs: 'workflow-designer' },
 *     canMatch:    [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
 *     canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
 *     ... }
 *
 * Keep it AFTER menuRouteAccessCanMatchGuard so menu-level denial wins.
 */
export const featureRouteCanMatchGuard: CanMatchFn = async (route: Route, segments: UrlSegment[]) => {
  // Race-fix: al refresh pagina il LicenseFeatureService non ha ancora caricato
  // lo snapshot → `has()` tornava false → redirect a /unauthorized anche con
  // licenza valida. Attendiamo `ready()` (no-op se gia' caricato).
  //
  // IMPORTANTE (Angular 18+): inject() va chiamato PRIMA di qualsiasi await.
  // Dopo un await il microtask boundary rompe l'injection context e
  // `inject(Router)` chiamato dalle helper fallisce con NG0203
  // ("`inject()` must be called from an injection context"). Quindi
  // inject-iamo Router qui sincronamente e lo passiamo come parametro.
  const licenseFeature = inject(LicenseFeatureService);
  const router = inject(Router);
  await licenseFeature.ready();

  const dataFeature = (route?.data as { requireFeature?: string } | undefined)?.requireFeature;
  if (dataFeature) {
    return evaluateFeatureAccess(dataFeature, null, null, licenseFeature, router);
  }

  if (segments.length < 2) return true;
  const archetype = segments[1]?.path;
  const routeName = segments[0]?.path;
  return evaluateArchetypeAccess(archetype, routeName, null, licenseFeature, router);
};

export const featureRouteCanActivateGuard: CanActivateFn = async (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  // Vedi nota su injection context nel guard canMatch sopra.
  const licenseFeature = inject(LicenseFeatureService);
  const router = inject(Router);
  await licenseFeature.ready();

  const dataFeature = (route.data as { requireFeature?: string } | undefined)?.requireFeature;
  if (dataFeature) {
    return evaluateFeatureAccess(dataFeature, null, state.url, licenseFeature, router);
  }

  const archetype = (route.paramMap.get('action') ?? '').trim().toLowerCase();
  const routeName = (route.paramMap.get('route') ?? '').trim();
  return evaluateArchetypeAccess(archetype, routeName, state.url, licenseFeature, router);
};

/** Feature-flag based access (used by dedicated routes). */
function evaluateFeatureAccess(
  feature: string,
  routeName: string | null,
  fullUrl: string | null | undefined,
  licenseFeature: LicenseFeatureService,
  router: Router
): boolean | UrlTree {
  const f = (feature ?? '').trim();
  if (!f) return true;
  if (licenseFeature.has(f)) return true;

  // Dedicated route denied → redirect to home (or /unauthorized). Prefer
  // /unauthorized when available in the host app's routing; fall back to '/'.
  return router.createUrlTree(['/unauthorized'], {
    queryParams: {
      licenseLockedFeature: f,
      licenseOriginalUrl: fullUrl ?? '',
    },
  });
}

/** URL-segment based access (used by `:route/:action` pattern). */
function evaluateArchetypeAccess(
  archetype: string | undefined,
  routeName: string | undefined,
  fullUrl: string | null | undefined,
  licenseFeature: LicenseFeatureService,
  router: Router
): boolean | UrlTree {
  const normalizedArchetype = (archetype ?? '').trim().toLowerCase();
  if (!normalizedArchetype) return true;
  if (licenseFeature.isArchetypeAllowed(normalizedArchetype)) return true;

  const normalizedRoute = (routeName ?? '').trim();
  if (!normalizedRoute) return true;

  return router.createUrlTree(['/' + normalizedRoute + '/list'], {
    queryParams: {
      licenseLockedFrom: normalizedArchetype,
      licenseOriginalUrl: fullUrl ?? '',
    },
  });
}
