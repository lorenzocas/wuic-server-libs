import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

export const appRoutes: Routes = [
  {
    path: 'cities-list-grid',
    loadComponent: () => import('./component/cities-list-grid-page/cities-list-grid-page.component').then((m) => m.CitiesListGridPageComponent),
    data: {
      breadcrumbs: 'cities-list-grid'
    }
  },
  {
    path: 'cities-chart',
    loadComponent: () => import('./component/cities-chart-page/cities-chart-page.component').then((m) => m.CitiesChartPageComponent),
    data: {
      breadcrumbs: 'cities-chart'
    }
  },
  {
    path: 'cities-scheduler',
    loadComponent: () => import('./component/cities-scheduler-page/cities-scheduler-page.component').then((m) => m.CitiesSchedulerPageComponent),
    data: {
      breadcrumbs: 'cities-scheduler'
    }
  },
  {
    path: 'cities-map',
    loadComponent: () => import('./component/cities-map-page/cities-map-page.component').then((m) => m.CitiesMapPageComponent),
    data: {
      breadcrumbs: 'cities-map'
    }
  },
  {
    path: 'cities-carousel',
    loadComponent: () => import('./component/cities-carousel-page/cities-carousel-page.component').then((m) => m.CitiesCarouselPageComponent),
    data: {
      breadcrumbs: 'cities-carousel'
    }
  },
  {
    path: 'cities-spreadsheet',
    loadComponent: () => import('./component/cities-spreadsheet-page/cities-spreadsheet-page.component').then((m) => m.CitiesSpreadsheetPageComponent),
    data: {
      breadcrumbs: 'cities-spreadsheet'
    }
  },
  {
    path: 'cities-kanban',
    loadComponent: () => import('./component/cities-kanban-page/cities-kanban-page.component').then((m) => m.CitiesKanbanPageComponent),
    data: {
      breadcrumbs: 'cities-kanban'
    }
  },
  {
    path: 'cities-tree',
    loadComponent: () => import('./component/cities-tree-page/cities-tree-page.component').then((m) => m.CitiesTreePageComponent),
    data: {
      breadcrumbs: 'cities-tree'
    }
  },
  {
    path: 'cities-edit',
    loadComponent: () => import('./component/cities-edit-page/cities-edit-page.component').then((m) => m.CitiesEditPageComponent),
    data: {
      breadcrumbs: 'cities-edit'
    }
  },
  {
    path: 'cities-wizard',
    loadComponent: () => import('./component/cities-wizard-page/cities-wizard-page.component').then((m) => m.CitiesWizardPageComponent),
    data: {
      breadcrumbs: 'cities-wizard'
    }
  },
  {
    path: 'custom-cities-list',
    loadComponent: () => import('./component/custom-cities-list/custom-cities-list.component').then((m) => m.CustomCitiesListComponent),
    data: {
      breadcrumbs: 'custom-cities-list'
    }
  },
  {
    path: 'unauthorized',
    loadComponent: () => import('./component/unauthorized/unauthorized.component').then((m) => m.UnauthorizedComponent),
    data: {
      breadcrumbs: 'unauthorized'
    }
  },
  ...wuicRoutes
];
