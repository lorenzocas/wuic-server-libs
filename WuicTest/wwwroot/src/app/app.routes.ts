import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

export const appRoutes: Routes = [
  // {
  //   path: 'crm_opportunities/kanban',
  //   loadComponent: () => import('./component/crm-opportunity-kanban/crm-opportunity-kanban.component').then((m) => m.CrmOpportunityKanbanComponent),
  //   data: {
  //     breadcrumbs: 'kanban'
  //   }
  // },
  ...wuicRoutes
];
