import { Routes } from '@angular/router';
import { LOCALE_PREFIXES, LOCALE_BY_PREFIX } from './services/locale-url';

/**
 * Route delle pagine, SENZA prefisso locale. Definite una volta sola e
 * riusate sia alla root (EN) sia sotto ogni prefisso locale (/it, /fr, /es,
 * /de) — stessi componenti, la lingua attiva è derivata dall'URL
 * (services/locale-url.ts + LanguageService).
 *
 * NB: `loadComponent` è condiviso tra gli alberi → il chunk lazy di ogni
 * pagina resta UNO solo (nessuna duplicazione di bundle per locale).
 */
const pageRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then(m => m.Home)
  },
  {
    path: 'features',
    loadComponent: () => import('./pages/features/features').then(m => m.Features)
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pages/pricing/pricing').then(m => m.Pricing)
  },
  {
    path: 'downloads',
    loadComponent: () => import('./pages/downloads/downloads').then(m => m.Downloads)
  },
  {
    path: 'downloads/older',
    loadComponent: () => import('./pages/downloads/older-downloads').then(m => m.OlderDownloads)
  },
  {
    path: 'gallery',
    loadComponent: () => import('./pages/gallery/gallery').then(m => m.Gallery)
  },
  {
    path: 'docs',
    loadComponent: () => import('./pages/docs/docs').then(m => m.Docs)
  },
  {
    path: 'docs/:slug',
    loadComponent: () => import('./pages/docs/docs').then(m => m.Docs)
  },
  {
    path: 'legal',
    loadComponent: () => import('./pages/legal/legal').then(m => m.Legal)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy').then(m => m.Privacy)
  },
  {
    path: 'cookies',
    loadComponent: () => import('./pages/cookies/cookies').then(m => m.Cookies)
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms').then(m => m.Terms)
  },
  {
    path: 'comparison',
    loadComponent: () => import('./pages/comparison/comparison').then(m => m.Comparison),
  },
  // Blog — contenuto single-language (i .md sono autorati in UNA lingua):
  // esiste anche sotto i prefissi locale (chrome tradotto), ma le pagine
  // emettono canonical/hreflang alla sola versione root (vedi blog-list.ts /
  // blog-post.ts `localizedUrls: false`) per non indicizzare duplicati.
  {
    path: 'blog',
    loadComponent: () => import('./pages/blog/blog-list').then(m => m.BlogList),
  },
  {
    path: 'blog/:slug',
    loadComponent: () => import('./pages/blog/blog-post').then(m => m.BlogPost),
  },
  {
    path: 'sandbox',
    loadComponent: () => import('./pages/sandbox/sandbox').then(m => m.Sandbox),
  },
  {
    path: 'start',
    // Ads landing (Sprint 5): bareLayout hides navbar+footer — every nav
    // link is a leak out of the paid-click funnel. Hero variant comes from
    // the `m` query param (see Start component docs).
    data: { bareLayout: true },
    loadComponent: () => import('./pages/start/start').then(m => m.Start),
  },
];

/**
 * Schema URL (piano Visibilità W9-12, deciso 2026-07-14):
 *   `/` = inglese (nessun redirect, x-default), `/it|/fr|/es|/de` = altre lingue.
 * I wrapper locale sono componentless → i figli ereditano `data.locale`
 * (paramsInheritanceStrategy 'emptyOnly' copre i parent senza component).
 */
export const routes: Routes = [
  ...LOCALE_PREFIXES.map(prefix => ({
    path: prefix,
    data: { locale: LOCALE_BY_PREFIX[prefix] },
    children: pageRoutes,
  })),
  ...pageRoutes,
  { path: '**', redirectTo: '' }
];
