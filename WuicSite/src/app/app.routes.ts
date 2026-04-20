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
  { path: '**', redirectTo: '' }
];
