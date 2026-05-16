import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

// Route applicative CostCnh.
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

  // ──────── Custom: Custom Attributes Admin (Phase I.7) ────────
  {
    path: 'custom-attributes-admin',
    loadComponent: () => import('./component/custom-attributes-admin/custom-attributes-admin.component')
      .then((m) => m.CustomAttributesAdminComponent),
    data: {
      breadcrumbs: 'custom-attributes-admin',
      description: 'Custom Attributes / Values / Lookup admin manager.'
    }
  },

  // ──────── Custom: Workforce Upload xlsx (Task 8.4) ────────
  {
    path: 'workforce-upload',
    loadComponent: () => import('./component/workforce-upload/workforce-upload.component')
      .then((m) => m.WorkforceUploadComponent),
    data: { breadcrumbs: 'workforce-upload', description: 'Bulk upload xlsx workforce allocation.' }
  },

  // ──────── Custom: Workforce Scenarios manager (Task 8.3) ────────
  {
    path: 'workforce-scenarios/:programId',
    loadComponent: () => import('./component/workforce-scenarios/workforce-scenarios.component')
      .then((m) => m.WorkforceScenariosComponent),
    data: { breadcrumbs: 'workforce-scenarios', description: 'Workforce scenario branching + promote + diff.' }
  },

  // ──────── Custom: Workforce Allocation 2D matrix (Task 8.1) ────────
  {
    path: 'workforce-allocation/:programId',
    loadComponent: () => import('./component/workforce-allocation-edit/workforce-allocation-edit.component')
      .then((m) => m.WorkforceAllocationEditComponent),
    data: {
      breadcrumbs: 'workforce-allocation',
      description: 'Workforce allocation 2D matrix (resource × month × FTE/Hours/Cost).'
    }
  },

  // ──────── Custom: PowerEdit hierarchical pivot grid (Phase H) ────────
  // Port app-local del legacy PowerEdit (XBS × month × facet, lock-aware).
  // Rotta: /power-edit/:programId?year=YYYY
  {
    path: 'power-edit/:programId',
    loadComponent: () => import('./component/power-edit/power-edit.component')
      .then((m) => m.PowerEditComponent),
    data: {
      breadcrumbs: 'power-edit',
      description: 'PowerEdit hierarchical planning grid (XBS × month × facet, lock-aware).'
    }
  },

  // ──────── Route framework metadata-driven (auto-resolve) ────────
  ...wuicRoutes
];