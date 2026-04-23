import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

export const appRoutes: Routes = [
  // ========================================================================
  // "Pattern di sviluppo" — esempi classificati secondo la tassonomia
  // WUIC a 5 pattern. Ogni cartella e' un esempio autosufficiente in
  // wwwroot/src/app/component/examples/<pattern-id>/<example-slug>/.
  //
  //   Pattern 1: Full autogeneration (route metadata-driven, zero-code).
  //   Pattern 2: Framework data + Custom component.
  //   Pattern 3: Framework component + Custom data (backend).
  //   Pattern 4: Full custom (pure Angular + custom API).
  //   Pattern 5: Framework component + Framework data (manually mounted).
  //
  // Doc framework: docs/pages/pattern-*.md + pattern-framework-manual.md.
  //
  // NOTA: `data.description` su ogni route viene usato da
  // `AppComponent.updateMetaDescriptionForCurrentRoute` per popolare
  // `<meta name="description">` dinamicamente al NavigationEnd (SEO).
  // Max 155 char (limite Google SERP).
  // ========================================================================

  // ──────── Pattern 1 — Full autogeneration ────────
  {
    path: 'examples/1a-cities-autogen',
    loadComponent: () => import('./component/examples/pattern-1/1a-cities-autogen/1a-cities-autogen.component').then(m => m.Pattern1aCitiesAutogenComponent),
    data: { breadcrumbs: 'Pattern 1a — Cities autogen', description: 'Pattern 1a — CRUD full-autogenerato della route cities da metadata WUIC. Zero codice Angular, list-grid + edit + filtri generati dal server.' }
  },
  {
    path: 'examples/1b-customers-spreadsheet-autogen',
    loadComponent: () => import('./component/examples/pattern-1/1b-customers-spreadsheet-autogen/1b-customers-spreadsheet-autogen.component').then(m => m.Pattern1bCustomersSpreadsheetAutogenComponent),
    data: { breadcrumbs: 'Pattern 1b — Customers spreadsheet autogen', description: 'Pattern 1b — Spreadsheet editabile full-autogenerato da route customers. Paste da Excel, validazione colonne e undo/redo out-of-the-box.' }
  },

  // ──────── Pattern 2 — Framework data + Custom component ────────
  {
    path: 'examples/2a-cities-cards',
    loadComponent: () => import('./component/examples/pattern-2/2a-cities-cards/2a-cities-cards.component').then(m => m.Pattern2aCitiesCardsComponent),
    data: { breadcrumbs: 'Pattern 2a — Cities cards', description: 'Pattern 2a — Card grid custom su dati cities forniti dal framework. Databinding reattivo su DataSource WUIC con layout HTML libero.' }
  },
  {
    path: 'examples/2b-cities-kpi-dashboard',
    loadComponent: () => import('./component/examples/pattern-2/2b-cities-kpi-dashboard/2b-cities-kpi-dashboard.component').then(m => m.Pattern2bCitiesKpiDashboardComponent),
    data: { breadcrumbs: 'Pattern 2b — Cities KPI dashboard', description: 'Pattern 2b — Dashboard KPI custom con aggregate su dati cities. Tiles, sparkline e drill-down costruiti a mano con DataSource framework.' }
  },
  {
    path: 'examples/2c-custom-cities-list',
    loadComponent: () => import('./component/examples/pattern-2/2c-custom-cities-list/2c-custom-cities-list.component').then(m => m.Pattern2cCustomCitiesListComponent),
    data: { breadcrumbs: 'Pattern 2c — Custom cities list', description: 'Pattern 2c — List custom su dati cities WUIC. Template Angular personalizzato con data-binding a DataSource framework.' }
  },

  // ──────── Pattern 3 — Framework component + Custom data ────────
  {
    path: 'examples/3a-external-rest-grid',
    loadComponent: () => import('./component/examples/pattern-3/3a-external-rest-grid/3a-external-rest-grid.component').then(m => m.Pattern3aExternalRestGridComponent),
    data: { breadcrumbs: 'Pattern 3a — External REST grid', description: 'Pattern 3a — ListGrid framework collegata a API REST esterna (non WUIC). Adapter custom che mappa JSON esterno a metadati grid.' }
  },
  {
    path: 'examples/3b-custom-dotnet-grid',
    loadComponent: () => import('./component/examples/pattern-3/3b-custom-dotnet-grid/3b-custom-dotnet-grid.component').then(m => m.Pattern3bCustomDotnetGridComponent),
    data: { breadcrumbs: 'Pattern 3b — Custom .NET grid', description: 'Pattern 3b — ListGrid framework alimentata da endpoint .NET custom backend-side. Query SQL personalizzate con metadata auto-derivati.' }
  },
  {
    path: 'examples/3c-odata-cities-grid',
    loadComponent: () => import('./component/examples/pattern-3/3c-odata-cities-grid/3c-odata-cities-grid.component').then(m => m.Pattern3cODataCitiesGridComponent),
    data: { breadcrumbs: 'Pattern 3c — OData Cities grid', description: 'Pattern 3c — ListGrid framework su endpoint OData. Filtri, sort e paging delegati al server via query string OData standard.' }
  },

  // ──────── Pattern 4 — Full custom ────────
  {
    path: 'examples/4a-pure-ptable-crud',
    loadComponent: () => import('./component/examples/pattern-4/4a-pure-ptable-crud/4a-pure-ptable-crud.component').then(m => m.Pattern4aPurePtableCrudComponent),
    data: { breadcrumbs: 'Pattern 4a — Pure p-table CRUD', description: 'Pattern 4a — CRUD con PrimeNG p-table puro e API Angular standard. Zero dipendenze WUIC, baseline di confronto per altri pattern.' }
  },
  {
    path: 'examples/4b-pure-form-wizard',
    loadComponent: () => import('./component/examples/pattern-4/4b-pure-form-wizard/4b-pure-form-wizard.component').then(m => m.Pattern4bPureFormWizardComponent),
    data: { breadcrumbs: 'Pattern 4b — Pure form wizard', description: 'Pattern 4b — Form wizard multistep pure Angular + PrimeNG. Validazione reattiva, stato locale, nessun databinding WUIC.' }
  },

  // ──────── Pattern 5 — Framework component + Framework data (manual) ────────
  {
    path: 'examples/5a-cities-list-grid',
    loadComponent: () => import('./component/examples/pattern-5/5a-cities-list-grid/5a-cities-list-grid.component').then(m => m.Pattern5aCitiesListGridComponent),
    data: { breadcrumbs: 'Pattern 5a — Cities list-grid', description: 'Pattern 5a — ListGrid framework montata manualmente su route cities. Tutti gli output event subscribed come riferimento integrazione.' }
  },
  {
    path: 'examples/5b-cities-chart',
    loadComponent: () => import('./component/examples/pattern-5/5b-cities-chart/5b-cities-chart.component').then(m => m.Pattern5bCitiesChartComponent),
    data: { breadcrumbs: 'Pattern 5b — Cities chart', description: 'Pattern 5b — Chart framework su dati cities. Configurazione dimensioni/misure dichiarativa, rendering Chart.js automatico.' }
  },
  {
    path: 'examples/5c-cities-map',
    loadComponent: () => import('./component/examples/pattern-5/5c-cities-map/5c-cities-map.component').then(m => m.Pattern5cCitiesMapComponent),
    data: { breadcrumbs: 'Pattern 5c — Cities map', description: 'Pattern 5c — MapList Google Maps con marker cluster su cities. Popup personalizzati e drag marker con callback live.' }
  },
  {
    path: 'examples/5d-cities-spreadsheet',
    loadComponent: () => import('./component/examples/pattern-5/5d-cities-spreadsheet/5d-cities-spreadsheet.component').then(m => m.Pattern5dCitiesSpreadsheetComponent),
    data: { breadcrumbs: 'Pattern 5d — Cities spreadsheet', description: 'Pattern 5d — Spreadsheet framework su cities con edit inline, paste Excel, validazione server-side e commit transazionale.' }
  },
  {
    path: 'examples/5e-cities-edit',
    loadComponent: () => import('./component/examples/pattern-5/5e-cities-edit/5e-cities-edit.component').then(m => m.Pattern5eCitiesEditComponent),
    data: { breadcrumbs: 'Pattern 5e — Cities edit', description: 'Pattern 5e — Form edit framework su singola riga cities. Field-editor auto-derivati da metadata: lookup, date picker, json.' }
  },
  {
    path: 'examples/5f-cities-wizard',
    loadComponent: () => import('./component/examples/pattern-5/5f-cities-wizard/5f-cities-wizard.component').then(m => m.Pattern5fCitiesWizardComponent),
    data: { breadcrumbs: 'Pattern 5f — Cities wizard', description: 'Pattern 5f — Wizard multistep su cities con ParametricDialog framework. Step condizionali e validazione per-step.' }
  },
  {
    path: 'examples/5g-cities-data-repeater-events',
    loadComponent: () => import('./component/examples/pattern-5/5g-cities-data-repeater-events/5g-cities-data-repeater-events.component').then(m => m.Pattern5gCitiesDataRepeaterEventsComponent),
    data: { breadcrumbs: 'Pattern 5g — Cities data-repeater events', description: 'Pattern 5g — DataRepeater framework con lifecycle events (beforeSync, afterSync, changeTracking) sottoscritti per custom logic host.' }
  },
  {
    path: 'examples/5h-kanban-task',
    loadComponent: () => import('./component/examples/pattern-5/5h-kanban-task/5h-kanban-task.component').then(m => m.Pattern5hKanbanTaskComponent),
    data: { breadcrumbs: 'Pattern 5h — Kanban task', description: 'Pattern 5h — Kanban board framework su task con drag-drop tra colonne status, WIP limits, assignee e commit optimistico.' }
  },
  {
    path: 'examples/5i-tree-sample',
    loadComponent: () => import('./component/examples/pattern-5/5i-tree-sample/5i-tree-sample.component').then(m => m.Pattern5iTreeSampleComponent),
    data: { breadcrumbs: 'Pattern 5i — Tree sample', description: 'Pattern 5i — TreeList framework su dati gerarchici. Lazy loading dei children, drag-drop riordino e action custom per nodo.' }
  },
  {
    path: 'examples/5j-schedules-scheduler',
    loadComponent: () => import('./component/examples/pattern-5/5j-schedules-scheduler/5j-schedules-scheduler.component').then(m => m.Pattern5jSchedulesSchedulerComponent),
    data: { breadcrumbs: 'Pattern 5j — Schedules scheduler', description: 'Pattern 5j — Scheduler calendar view framework su schedules. Vista mese/settimana/giorno, drag resize eventi e recurrence rules.' }
  },
  {
    path: 'examples/5k-uploadsample-carousel',
    loadComponent: () => import('./component/examples/pattern-5/5k-uploadsample-carousel/5k-uploadsample-carousel.component').then(m => m.Pattern5kUploadsampleCarouselComponent),
    data: { breadcrumbs: 'Pattern 5k — Uploadsample carousel', description: 'Pattern 5k — CarouselList framework su file uploadsample. Anteprima media con paginazione e upload multiplo drag-and-drop.' }
  },

  // ========================================================================
  // Redirect URL legacy → nuovi path sotto /examples/.
  //
  // Mantengono funzionanti i bookmark utente, i link nel menu WUIC
  // configurati con le vecchie URL e i deep-link esterni. Redirect
  // client-side via Angular (no HTTP 301 necessario — il router naviga
  // direttamente). `pathMatch: 'full'` evita che la route matcha anche
  // sub-path (tipo /cities-list-grid/something-extra).
  // ========================================================================
  { path: 'cities-list-grid', redirectTo: 'examples/5a-cities-list-grid', pathMatch: 'full' },
  { path: 'cities-chart', redirectTo: 'examples/5b-cities-chart', pathMatch: 'full' },
  { path: 'cities-map', redirectTo: 'examples/5c-cities-map', pathMatch: 'full' },
  { path: 'cities-spreadsheet', redirectTo: 'examples/5d-cities-spreadsheet', pathMatch: 'full' },
  { path: 'cities-edit', redirectTo: 'examples/5e-cities-edit', pathMatch: 'full' },
  { path: 'cities-wizard', redirectTo: 'examples/5f-cities-wizard', pathMatch: 'full' },
  { path: 'cities-data-repeater-events', redirectTo: 'examples/5g-cities-data-repeater-events', pathMatch: 'full' },
  { path: 'kanban-task', redirectTo: 'examples/5h-kanban-task', pathMatch: 'full' },
  { path: 'tree-sample', redirectTo: 'examples/5i-tree-sample', pathMatch: 'full' },
  { path: 'schedules-scheduler', redirectTo: 'examples/5j-schedules-scheduler', pathMatch: 'full' },
  { path: 'uploadsample-carousel', redirectTo: 'examples/5k-uploadsample-carousel', pathMatch: 'full' },
  { path: 'custom-cities-list', redirectTo: 'examples/2c-custom-cities-list', pathMatch: 'full' },

  // ──────── Sistema / error pages (non esempi) ────────
  {
    path: 'unauthorized',
    loadComponent: () => import('./component/unauthorized/unauthorized.component').then((m) => m.UnauthorizedComponent),
    data: {
      breadcrumbs: 'unauthorized',
      description: 'Accesso non autorizzato — sessione scaduta o permessi insufficienti. Effettua il login per continuare.'
    }
  },

  ...wuicRoutes
];
