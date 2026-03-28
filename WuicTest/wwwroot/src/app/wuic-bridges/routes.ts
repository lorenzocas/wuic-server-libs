import { CanDeactivateFn, Routes } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';

const lazyBoundedRepeaterPendingChangesGuard: CanDeactivateFn<any> = async (component, currentRoute, currentState, nextState) => {
  const m = await import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater-pending-changes.guard');
  const result = m.boundedRepeaterPendingChangesGuard(component, currentRoute, currentState, nextState);
  return isObservable(result) ? await firstValueFrom(result) : result;
};

export const routes: Routes = [
  {
    path: 'framework-docs',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    data: { breadcrumbs: 'framework-docs' }
  },
  {
    path: 'framework-docs/:slug',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    data: { breadcrumbs: 'framework-docs' }
  },
  {
    path: 'workflow-runner/:graph-id',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-runner/workflow-runner.component').then((m) => m.WorkflowRunnerComponent),
    data: { breadcrumbs: 'workflow-runner' }
  },
  {
    path: ':route/report-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-designer/report-designer.component').then((m) => m.ReportDesignerComponent),
    data: { breadcrumbs: 'report-designer' }
  },
  {
    path: ':route/report-viewer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-viewer/report-viewer.component').then((m) => m.ReportViewerComponent),
    data: { breadcrumbs: 'report-viewer' }
  },
  {
    path: ':route/dashboard',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    data: { breadcrumbs: 'dashboard' }
  },
  {
    path: ':route/pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    data: { breadcrumbs: 'pivot-builder' }
  },
  {
    path: 'pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    data: { breadcrumbs: 'pivot-builder' }
  },
  {
    path: ':route/:action',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' }
  },
  {
    path: ':route/:action/:filters',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' }
  },
  {
    path: 'designer',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    data: { breadcrumbs: 'designer' }
  },
  {
    path: 'workflow-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-designer/workflow-designer.route.component').then((m) => m.WorkflowDesignerRouteComponent),
    data: { breadcrumbs: 'workflow-designer' }
  }
];
