import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

// Route applicative FlottaMezzi.
//
// Tutto il CRUD metadata-driven e' risolto da wuicRoutes — non serve
// dichiarare route Angular esplicite. Aggiungi qui SOLO le route che
// richiedono UI custom (livello 2+ della decision-ladder
// app-creation skill) o pagine di sistema (error pages, ecc).

export const appRoutes: Routes = [

  // ──────── Sistema / error pages ────────
  {
    path: 'unauthorized',
    loadComponent: () => import('./component/unauthorized/unauthorized.component')
      .then((m) => m.UnauthorizedComponent),
    data: {
      breadcrumbs: 'unauthorized',
      description: 'Accesso non autorizzato — sessione scaduta o permessi insufficienti. Effettua il login per continuare.'
    }
  },

  // ──────── Route framework metadata-driven (auto-resolve) ────────
  ...wuicRoutes
];