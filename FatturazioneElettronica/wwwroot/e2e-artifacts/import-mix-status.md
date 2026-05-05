# WuicTest Import Mix Status

Generated: 2026-04-11 17:34:53

## Modifiche applicate (questa iterazione)
- Creato `src/app/wuic-bridges/public.ts` come barrel source-only per componenti/tipi usati dalle pagine demo.
- Aggiunto alias `wuic-framework-lib-dev` in `tsconfig.json` -> `./src/app/wuic-bridges/public.ts`.
- Sostituiti import nei componenti app da `wuic-framework-lib` a `wuic-framework-lib-dev` (15 file).

### File componenti migrati a source-only alias
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-map-page\cities-map-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, MapListComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\custom-list\custom-list.component.ts:4:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, IDataBoundHostComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-data-repeater-events-page\cities-data-repeater-events-page.component.ts:3:import { DataRepeaterComponent, DataSourceComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\custom-cities-list\custom-cities-list.component.ts:3:import { DataSourceComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\custom-cities-list\custom-cities-list.component.ts:6:import { FilterBarComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\custom-cities-list\custom-cities-list.component.ts:7:import { PagerComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-wizard-page\cities-wizard-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, ParametricDialogComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-chart-page\cities-chart-page.component.ts:3:import { ChartListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-spreadsheet-page\cities-spreadsheet-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, SpreadsheetListComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-list-grid-page\cities-list-grid-page.component.ts:3:import { DataSourceComponent, ListGridAfterRenderEvent, ListGridAfterRowRenderEvent, ListGridBeforeRowRenderEvent, ListGridComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-edit-page\cities-edit-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, ParametricDialogComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\cities-edit-page\cities-edit-page.component.ts:4:import { PagerComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\rag-chatbot-demo-page\rag-chatbot-demo-page.component.ts:3:import { WuicRagChatbotComponent, RagSource } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\uploadsample-carousel-page\uploadsample-carousel-page.component.ts:3:import { CarouselListComponent, DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\tree-sample-page\tree-sample-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, TreeListComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\kanban-task-page\kanban-task-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, KanbanListComponent } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\field\custom-text-field\custom-text-field.component.ts:5:import { MetaInfo, ValidationRule, IFieldEditor, MetadatiColonna, WtoolboxService } from 'wuic-framework-lib-dev';
- c:\src\Wuic\WuicTest\wwwroot\src\app\component\schedules-scheduler-page\schedules-scheduler-page.component.ts:3:import { DataSourceAfterSyncEvent, DataSourceBeforeSyncEvent, DataSourceComponent, SchedulerListComponent } from 'wuic-framework-lib-dev';

## Stato mix attuale
- Package imports raggiungibili dal bootstrap (da import-reachability): 0
- Package imports non raggiungibili: 27
- File wuic-bridges-npm raggiungibili: 0

### Import package ancora presenti nel codice
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:1:export { WtoolboxService } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:10:export { getThemeOptions, PRIMARY_PALETTES, type ThemeOption } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:11:export { authExpiredInterceptor } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:2:export { MetadataProviderService } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:3:export { MetadataEditorService } from 'wuic-framework-lib';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:4:export { AuthSessionService } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:5:export { UserInfoService } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:6:export { TranslationManagerService } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:7:export { GlobalHandler } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:8:export { CustomException } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\core.ts:9:export { MetadatiColonna } from 'wuic-framework-lib/core';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:1:export { LazyMetaMenuComponent } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:10:export { FormatGridViewValuePipe } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:11:export { CallbackPipe2 } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:12:export { GetSrcUploadPreviewPipe } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:2:export { LazyDataSourceComponent } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:3:export { LazyDataActionButtonComponent } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:4:export { LazyFieldEditorComponent } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:5:export { LazyImageWrapperComponent } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:6:export { ImageWrapperComponent } from 'wuic-framework-lib';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:7:export { CallbackPipe } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:8:export { IsSelectedRowPipe } from 'wuic-framework-lib/ui';
- c:\src\Wuic\WuicTest\wwwroot\src\app\wuic-bridges-npm\ui.ts:9:export { VisibleFieldListPipe } from 'wuic-framework-lib/ui';

### Import package fuori da wuic-bridges-npm (dovrebbero essere 0)
- Nessuno (OK)

## Edge case residui
- La cartella `src/app/wuic-bridges-npm/` contiene ancora export verso package. Non risulta raggiungibile dal bootstrap attuale, ma resta rischio di regressione se qualcuno la reimporta.
- Test runtime non eseguito in questa iterazione: `http://localhost:4200` non raggiungibile (`ERR_CONNECTION_REFUSED`).

## Prossime verifiche quando ng serve è attivo
- Login + route `#/cities/list`: verificare assenza dialog `global_root_url` undefined.
- Console: verificare assenza warning `NG0912`.
- Rilancio checker selector e aggiornamento report.

## Modifica test menu-routes
- Aggiornato `KonvergenceCore/wwwroot/my-workspace/playwright/wuic-menu-routes.spec.ts` con fail-fast console guard per `NG0912` / duplicate component id.
- Dopo ogni `gotoHash(route)` e dopo `runDeepProbe(route)` il test verifica eventi console raccolti per quella route e fallisce subito con messaggio: `[route] duplicate component id detected ...`.
- Scope per-route tracciato con `currentRouteContext` per notificare esattamente quale route fallisce.

## Hardening menu-routes (blank page + popup error)
- Aggiunta `assertRouteContentNotBlank(...)`: fallisce se dopo la navigazione non c'è contenuto route visibile (menu/dialog esclusi).
- Potenziata `assertNoFatalErrorDialog(...)`: se un popup visibile contiene segnali di errore (`Errore`, `Error`, `Cannot read properties`, `NGxxxx`, `RuntimeError`, `Exception`, stack) il test fallisce subito.
