export { LicenseFeatureService } from 'wuic-framework-lib';
export { WtoolboxService } from 'wuic-framework-lib/core';
export { MetadataProviderService } from 'wuic-framework-lib/core';
export { MetadataEditorService } from 'wuic-framework-lib/core';
export { AuthSessionService } from 'wuic-framework-lib/core';
export { TranslationManagerService } from 'wuic-framework-lib/core';
export { GlobalHandler } from 'wuic-framework-lib/core';
export { CustomException } from 'wuic-framework-lib/core';
export { MetadatiColonna } from 'wuic-framework-lib/core';
// Aggiunti per parita' col bridge dev `wuic-bridges/core.ts` — senza queste
// 2 export la build con `--configuration=npm` (file-replacement bridge ->
// bridge-npm) fallisce con TS2305 perche' `app.config.ts` importa
// `authExpiredInterceptor` e `app.component.ts` importa
// `WuicErrorDialogComponent` da './wuic-bridges/core'.
export { authExpiredInterceptor } from 'wuic-framework-lib/core';
export { WuicErrorDialogComponent } from 'wuic-framework-lib';
