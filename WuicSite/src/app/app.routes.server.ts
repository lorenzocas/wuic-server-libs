// Per-route render strategy used by the prerender pipeline. Angular 21
// requires explicit handling for any route that includes a parameter
// (`:slug`, `:id`, …) because the prerender extractor doesn't know which
// concrete URLs to materialize. Without this file the build fails:
//   "The 'X/:slug' route uses prerendering and includes parameters, but
//    'getPrerenderParams' is missing."
//
// Strategy:
//   - `/docs/:slug` and `/blog/:slug`:  RenderMode.Client. The page still
//     loads (SPA fallback), but no `<route>/index.html` is shipped. SEO
//     impact is acceptable because:
//       • /blog is a Sprint-1 placeholder (noindex), so its children
//         shouldn't be in the index either.
//       • /docs/:slug content is loaded dynamically from the docs manifest
//         at runtime — even if we prerendered, the body text would be
//         empty until the manifest fetch completes.
//   - everything else falls through to the catch-all `**` rule which
//     keeps the build's overall `prerender: true` behavior — the same
//     `prerender-routes.txt` list is what actually gets prerendered.
//
// When /docs/:slug graduates to per-slug prerender (Sprint 6 or later),
// switch its entry to `RenderMode.Prerender` + `getPrerenderParams` that
// returns the slug list from docs.generated.json.
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: 'docs/:slug', renderMode: RenderMode.Client },
  { path: 'blog/:slug', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
