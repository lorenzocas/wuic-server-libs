import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

export const appRoutes: Routes = [
  {
    path: 'custom-cities-list',
    loadComponent: () => import('./component/custom-cities-list/custom-cities-list.component').then((m) => m.CustomCitiesListComponent),
    data: {
      breadcrumbs: 'custom-cities-list'
    }
  },
  ...wuicRoutes
];
