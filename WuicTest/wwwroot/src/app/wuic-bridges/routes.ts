import { CanDeactivateFn, Routes } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { roleRouteCanActivateGuard, roleRouteCanMatchGuard } from '../routing/role-route.guard';
import { menuRouteAccessCanActivateGuard, menuRouteAccessCanMatchGuard } from 'wuic-framework-lib-src/guard/menu-route-access.guard';

const lazyBoundedRepeaterPendingChangesGuard: CanDeactivateFn<any> = async (component, currentRoute, currentState, nextState) => {
  const m = await import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater-pending-changes.guard');
  const result = m.boundedRepeaterPendingChangesGuard(component, currentRoute, currentState, nextState);
  return isObservable(result) ? await firstValueFrom(result) : result;
};

export const routes: Routes = [
  {
    path: 'framework-docs',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'framework-docs' }
  },
  {
    path: 'framework-docs/:slug',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'framework-docs' }
  },
  {
    path: 'workflow-runner/:graph-id',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-runner/workflow-runner.component').then((m) => m.WorkflowRunnerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'workflow-runner' }
  },
  {
    path: ':route/report-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-designer/report-designer.component').then((m) => m.ReportDesignerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'report-designer', roleRuleKey: 'report-designer' }
  },
  {
    path: ':route/report-viewer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-viewer/report-viewer.component').then((m) => m.ReportViewerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'report-viewer' }
  },
  {
    path: ':route/dashboard',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'dashboard', roleRuleKey: 'dashboard' }
  },
  {
    path: ':route/pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'pivot-builder' }
  },
  {
    path: 'pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'pivot-builder' }
  },
  {
    path: ':route/:action',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' }
  },
  {
    path: ':route/:action/:filters',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' }
  },
  {
    path: 'designer',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'designer', roleRuleKey: 'designer' }
  },
  {
    path: 'workflow-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-designer/workflow-designer.route.component').then((m) => m.WorkflowDesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'workflow-designer', roleRuleKey: 'workflow-designer' }
  },
  {
    path: 'appsettings-editor',
    loadComponent: () => import('wuic-framework-lib-src/component/app-settings-editor/app-settings-editor.component').then((m) => m.AppSettingsEditorComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'appsettings-editor' }
  },
  {
    path: 'rag-chatbot',
    loadComponent: () => import('wuic-framework-lib-src/component/rag-chatbot/rag-chatbot.component').then((m) => m.WuicRagChatbotComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'rag-chatbot' }
  }
];
