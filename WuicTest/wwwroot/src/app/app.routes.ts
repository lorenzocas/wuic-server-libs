import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges-npm/routes';

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
    path: 'schedules-scheduler',
    loadComponent: () => import('./component/schedules-scheduler-page/schedules-scheduler-page.component').then((m) => m.SchedulesSchedulerPageComponent),
    data: {
      breadcrumbs: 'schedules-scheduler'
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
    path: 'uploadsample-carousel',
    loadComponent: () => import('./component/uploadsample-carousel-page/uploadsample-carousel-page.component').then((m) => m.UploadsampleCarouselPageComponent),
    data: {
      breadcrumbs: 'uploadsample-carousel'
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
    path: 'kanban-task',
    loadComponent: () => import('./component/kanban-task-page/kanban-task-page.component').then((m) => m.KanbanTaskPageComponent),
    data: {
      breadcrumbs: 'kanban-task'
    }
  },
  {
    path: 'tree-sample',
    loadComponent: () => import('./component/tree-sample-page/tree-sample-page.component').then((m) => m.TreeSamplePageComponent),
    data: {
      breadcrumbs: 'tree-sample'
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
    path: 'cities-data-repeater-events',
    loadComponent: () => import('./component/cities-data-repeater-events-page/cities-data-repeater-events-page.component').then((m) => m.CitiesDataRepeaterEventsPageComponent),
    data: {
      breadcrumbs: 'cities-data-repeater-events'
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
  {
    path: 'rag-chatbot-demo',
    loadComponent: () => import('./component/rag-chatbot-demo-page/rag-chatbot-demo-page.component').then((m) => m.RagChatbotDemoPageComponent),
    data: {
      breadcrumbs: 'rag-chatbot-demo'
    }
  },
  ...wuicRoutes
];

