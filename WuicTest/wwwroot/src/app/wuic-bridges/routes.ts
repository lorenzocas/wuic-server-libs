import { CanDeactivateFn, Routes } from '@angular/router';
import { firstValueFrom, isObservable } from 'rxjs';
import { roleRouteCanActivateGuard, roleRouteCanMatchGuard } from '../routing/role-route.guard';
import { menuRouteAccessCanActivateGuard, menuRouteAccessCanMatchGuard } from 'wuic-framework-lib-src/guard/menu-route-access.guard';

const lazyBoundedRepeaterPendingChangesGuard: CanDeactivateFn<any> = async (component, currentRoute, currentState, nextState) => {
  const m = await import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater-pending-changes.guard');
  const result = m.boundedRepeaterPendingChangesGuard(component, currentRoute, currentState, nextState);
  return isObservable(result) ? await firstValueFrom(result) : result;
};

// Curated descriptions per route: usate da
// `AppComponent.updateMetaDescriptionForCurrentRoute` per popolare
// `<meta name="description">` via `@angular/platform-browser` Meta service.
// Max 155 char (SERP).
export const routes: Routes = [
  {
    path: 'framework-docs',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'framework-docs', description: 'Documentazione WUIC Framework: guide, reference API, pattern architetturali e esempi integrati. Ricerca full-text.' }
  },
  {
    path: 'framework-docs/:slug',
    loadComponent: () => import('wuic-framework-lib-src/component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'framework-docs', description: 'Documentazione WUIC — {slug}: guida dettagliata, esempi live, screenshot e link ai sorgenti del componente.' }
  },
  {
    path: 'workflow-runner/:graph-id',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-runner/workflow-runner.component').then((m) => m.WorkflowRunnerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'workflow-runner', description: 'Runner WUIC Workflow: esegue e monitora un grafo di processo step-by-step, con deep-link a route collegate dai nodi.' }
  },
  {
    path: ':route/report-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-designer/report-designer.component').then((m) => m.ReportDesignerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'report-designer', roleRuleKey: 'report-designer', description: 'Report Designer {route} WUIC (Stimulsoft) — editor WYSIWYG per report pixel-perfect con databinding live.' }
  },
  {
    path: ':route/report-viewer',
    loadComponent: () => import('wuic-framework-lib-src/component/report-viewer/report-viewer.component').then((m) => m.ReportViewerComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'report-viewer', description: 'Report Viewer {route} WUIC — visualizza ed esporta report in PDF/XLS/DOCX con filtri parametrici live.' }
  },
  {
    path: ':route/dashboard',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'dashboard', roleRuleKey: 'dashboard', description: 'Dashboard {route} WUIC — layout drag-and-drop con KPI, grafici, grid e filtri sincronizzati sulla route.' }
  },
  {
    path: ':route/pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'pivot-builder', description: 'Pivot Builder {route} WUIC — aggregazioni multidimensionali drag-and-drop con export XLS.' }
  },
  {
    path: 'pivot-builder',
    loadComponent: () => import('wuic-framework-lib-src/component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'pivot-builder', description: 'Pivot Builder WUIC standalone: seleziona una route sorgente e costruisci dashboard pivot multidimensionali.' }
  },
  {
    path: ':route/:action',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' /* description omessa: metadata-driven, fallback humanize in AppComponent */ }
  },
  {
    path: ':route/:action/:filters',
    loadComponent: () => import('wuic-framework-lib-src/component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    canDeactivate: [lazyBoundedRepeaterPendingChangesGuard],
    data: { breadcrumbs: 'list' /* description omessa: metadata-driven con filtri */ }
  },
  {
    path: 'designer',
    loadComponent: () => import('wuic-framework-lib-src/component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'designer', roleRuleKey: 'designer', description: 'Dashboard Designer WUIC: strumento drag-and-drop per costruire layout componenti con databinding live e CSS custom.' }
  },
  {
    path: 'workflow-designer',
    loadComponent: () => import('wuic-framework-lib-src/component/workflow-designer/workflow-designer.route.component').then((m) => m.WorkflowDesignerRouteComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'workflow-designer', roleRuleKey: 'workflow-designer', description: 'Workflow Designer WUIC: editor grafico per processi multistep con node-type custom, condizioni e deep-link a route.' }
  },
  {
    path: 'appsettings-editor',
    loadComponent: () => import('wuic-framework-lib-src/component/app-settings-editor/app-settings-editor.component').then((m) => m.AppSettingsEditorComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'appsettings-editor', description: 'AppSettings Editor WUIC: modifica live le configurazioni di appsettings.json con validazione tipo e reload runtime.' }
  },
  {
    path: 'rag-chatbot',
    loadComponent: () => import('wuic-framework-lib-src/component/rag-chatbot/rag-chatbot.component').then((m) => m.WuicRagChatbotComponent),
    canMatch: [menuRouteAccessCanMatchGuard, roleRouteCanMatchGuard],
    canActivate: [menuRouteAccessCanActivateGuard, roleRouteCanActivateGuard],
    data: { breadcrumbs: 'rag-chatbot', description: 'RAG Chatbot WUIC: assistente AI con retrieval-augmented generation su documentazione framework e metadata del progetto.' }
  }
];
