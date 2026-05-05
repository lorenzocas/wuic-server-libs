import { Routes } from '@angular/router';
import { boundedRepeaterPendingChangesGuard } from './component/bounded-repeater/bounded-repeater-pending-changes.guard';
import { designerPendingChangesGuard } from './component/designer/designer-pending-changes.guard';
import { menuRouteAccessCanActivateGuard, menuRouteAccessCanMatchGuard } from './guard/menu-route-access.guard';
import { featureRouteCanActivateGuard, featureRouteCanMatchGuard } from './guard/feature-route.guard';

export const routes: Routes = [
    {
        path: 'framework-docs',
        loadComponent: () => import('./component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
        canMatch: [menuRouteAccessCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard],
        data: {
            breadcrumbs: 'framework-docs',
        }
    },
    {
        path: 'framework-docs/:slug',
        loadComponent: () => import('./component/framework-docs/framework-docs.component').then((m) => m.FrameworkDocsComponent),
        canMatch: [menuRouteAccessCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard],
        data: {
            breadcrumbs: 'framework-docs',
        }
    },
    {
        path: 'workflow-runner/:graph-id',
        loadComponent: () => import('./component/workflow-runner/workflow-runner.component').then((m) => m.WorkflowRunnerComponent),
        canMatch: [menuRouteAccessCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard],
        data: {
            breadcrumbs: 'workflow-runner',
        }
    },
    {
        path: ':route/report-designer',
        loadComponent: () => import('./component/report-designer/report-designer.component').then((m) => m.ReportDesignerComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'report-designer',
            requireFeature: 'report-designer',
        }
    },
    {
        path: ':route/report-viewer',
        loadComponent: () => import('./component/report-viewer/report-viewer.component').then((m) => m.ReportViewerComponent),
        canMatch: [menuRouteAccessCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard],
        data: {
            breadcrumbs: 'report-viewer',
        }
    },
    {
        path: ':route/dashboard',
        loadComponent: () => import('./component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        canDeactivate: [designerPendingChangesGuard],

        data: {
            breadcrumbs: 'dashboard',
            requireFeature: 'dashboard-designer',
        }
    },
    {
        path: ':route/pivot-builder',
        loadComponent: () => import('./component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'pivot-builder',
            requireFeature: 'pivot-grid',
        }
    },
    {
        path: 'pivot-builder',
        loadComponent: () => import('./component/pivot-builder/pivot-builder.component').then((m) => m.PivotBuilderComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'pivot-builder',
            requireFeature: 'pivot-grid',
        }
    },
    {
        path: ':route/:action',
        loadComponent: () => import('./component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        canDeactivate: [boundedRepeaterPendingChangesGuard],

        data: {
            breadcrumbs: 'list',
        }
    },
    {
        path: ':route/:action/:filters',
        loadComponent: () => import('./component/bounded-repeater/bounded-repeater.component').then((m) => m.BoundedRepeaterComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        canDeactivate: [boundedRepeaterPendingChangesGuard],
        data: {
            breadcrumbs: 'list',
        }
    },
    {
        path: 'designer',
        loadComponent: () => import('./component/designer/designer.route.component').then((m) => m.DesignerRouteComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'designer',
            requireFeature: 'dashboard-designer',
        }
    },
    {
        path: 'workflow-designer',
        loadComponent: () => import('./component/workflow-designer/workflow-designer.route.component').then((m) => m.WorkflowDesignerRouteComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'workflow-designer',
            requireFeature: 'workflow-designer',
        }
    },
    {
        // Editor di appsettings.json. Single-segment route, non confligge con
        // `:route/:action` (che richiede 2 segmenti). La voce di menu viene
        // creata via SQL patch (vedi scripts/add-app-settings-editor-menu.sql).
        path: 'appsettings-editor',
        loadComponent: () => import('./component/app-settings-editor/app-settings-editor.component').then((m) => m.AppSettingsEditorComponent),
        canMatch: [menuRouteAccessCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard],
        data: {
            breadcrumbs: 'appsettings-editor',
        }
    },
    {
        path: 'rag-chatbot',
        loadComponent: () => import('./component/rag-chatbot/rag-chatbot.component').then((m) => m.WuicRagChatbotComponent),
        canMatch: [menuRouteAccessCanMatchGuard, featureRouteCanMatchGuard],
        canActivate: [menuRouteAccessCanActivateGuard, featureRouteCanActivateGuard],
        data: {
            breadcrumbs: 'rag-chatbot',
            requireFeature: 'rag-chatbot',
        }
    }


];
