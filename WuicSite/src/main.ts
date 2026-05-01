import { bootstrapApplication } from '@angular/platform-browser';
import { mergeApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Browser-only providers layered on top of the SSR-safe `appConfig`. We
// keep these out of app.config.ts so the same file can be re-used by the
// server-side bootstrap (app.config.server.ts) without crashing the
// prerender extractor on DOM/animation/error-listener globals — that's
// the root cause of the NG0401 we hit during the first prerender attempt.
//
//   - provideAnimationsAsync: PrimeNG dialogs/transitions need animations;
//     server uses provideNoopAnimations instead (see app.config.server.ts)
//   - provideClientHydration(withEventReplay): re-uses the prerendered DOM
//     at boot AND captures user clicks during the hydration window so a
//     "Download" tap doesn't silently disappear
//   - provideBrowserGlobalErrorListeners: catches uncaught errors / promise
//     rejections at the window level — meaningless on the server
const browserConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
  ],
};

bootstrapApplication(App, mergeApplicationConfig(appConfig, browserConfig))
  .catch((err) => console.error(err));
