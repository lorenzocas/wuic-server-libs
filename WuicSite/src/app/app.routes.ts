import { Routes } from '@angular/router';

export const routes: Routes = [
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

  // ─── Sprint 1 placeholders ──────────────────────────────────────────
  // Routes are registered now (so internal links + analytics + sitemap
  // tooling work) but rendered via the shared ComingSoon component with
  // `noindex` so Google doesn't index thin content. Each route gets
  // promoted to a dedicated component in later sprints (Sprint 2:
  // /comparison + /sandbox; Sprint 3: /blog + /blog/:slug; Sprint 5:
  // /start). When promoting, replace `loadComponent` and drop the
  // `data` block — SeoService.set() in the new component takes over.
  {
    path: 'comparison',
    loadComponent: () => import('./pages/comparison/comparison').then(m => m.Comparison),
  },
  {
    path: 'blog',
    data: {
      title: 'WUIC Engineering Blog',
      subtitle: 'Deep dives on metadata-driven Angular, RAG over codebases, embeddable workflow engines, and what we have learned shipping enterprise apps with this stack.',
      path: '/blog',
      eta: 'Sprint 3 (4–6 weeks)',
    },
    loadComponent: () => import('./pages/_placeholder/coming-soon').then(m => m.ComingSoon),
  },
  {
    path: 'blog/:slug',
    data: {
      title: 'Article — WUIC Engineering Blog',
      subtitle: 'This article is not published yet. The blog goes live in Sprint 3.',
      path: '/blog',
      eta: 'Sprint 3 (4–6 weeks)',
    },
    loadComponent: () => import('./pages/_placeholder/coming-soon').then(m => m.ComingSoon),
  },
  {
    path: 'sandbox',
    data: {
      title: 'Try WUIC in your browser',
      subtitle: 'A hosted demo instance with seeded data, reset every 24 hours. No installation, no signup. Coming alongside the comparison page.',
      path: '/sandbox',
      eta: 'Sprint 2 (2–3 weeks)',
    },
    loadComponent: () => import('./pages/_placeholder/coming-soon').then(m => m.ComingSoon),
  },
  {
    path: 'start',
    data: {
      title: 'Get started with WUIC',
      subtitle: 'A focused landing page for evaluators — guided demo, sandbox access, and direct contact. This is the destination for our paid campaigns starting Sprint 5.',
      path: '/start',
      eta: 'Sprint 5 (8–10 weeks)',
    },
    loadComponent: () => import('./pages/_placeholder/coming-soon').then(m => m.ComingSoon),
  },

  { path: '**', redirectTo: '' }
];
