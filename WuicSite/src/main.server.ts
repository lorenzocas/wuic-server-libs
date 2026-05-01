// Server-side bootstrap entry, imported by the prerender step (and any
// future SSR runtime). Uses the merged server-flavoured ApplicationConfig
// from app.config.server.ts — that file layers `provideServerRendering()`
// on top of the browser config so transferred state, hydration, and the
// platform-server primitives are wired in. The default export is the
// bootstrap function itself: Angular's prerender pipeline calls it once
// per route to render that page's HTML.
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { config } from './app/app.config.server';

// Angular 21 prerender pipeline calls this default export once per route,
// passing a `BootstrapContext` it minted for that render. Forwarding the
// context is mandatory: dropping it triggers NG0401 ("Missing Platform")
// before any user code runs because the server platform binding is lazy-
// resolved through the context object.
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
