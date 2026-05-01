// Server-flavoured ApplicationConfig used during prerender. We start from
// the browser config and layer on `provideServerRendering()`: that pulls
// in the platform-server bindings (DOM emulation, server zone, transfer
// state, etc.) so Angular can render each route to a string at build time.
//
// Anything that's safe both in a browser and in Node lives in app.config
// (router, primeng theme, ngx-translate, http client). Anything that
// only works in the browser (DOM access, localStorage, navigator, …) must
// be guarded with `isPlatformBrowser()` checks inside the component or
// service — at prerender time those globals aren't available. Today the
// places that touch them are LanguageService.readInitial (already defends
// with `typeof window !== 'undefined'`) and SeoService.applyHtmlLang
// (uses DOCUMENT injection, which works on the server too).
import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    // `withRoutes(serverRoutes)` is required: routes with `:param` (docs/:slug,
    // blog/:slug) need an explicit renderMode or the prerender step bombs
    // with "getPrerenderParams is missing". See app.routes.server.ts for
    // the per-route strategy.
    provideServerRendering(withRoutes(serverRoutes)),
    // The browser-side `provideAnimationsAsync()` lives in main.ts now,
    // so we don't need to override it here — but keeping NoopAnimations
    // is harmless and acts as a safety net in case any PrimeNG component
    // pulls AnimationDriver during prerender (it has in past versions).
    provideNoopAnimations(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
