import { ApplicationConfig, effect, inject, provideAppInitializer } from '@angular/core';
import { NavigationStart, provideRouter, Router, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { maintenanceInterceptor } from './core/maintenance.interceptor';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideTranslateService, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { LanguageService } from './services/language.service';
import { DEFAULT_LOCALE, localeFromPath, localizePath } from './services/locale-url';

/** Separa il path puro da querystring+fragment ('/start?m=x#y' → ['/start', '?m=x#y']). */
function splitPathSuffix(url: string): [string, string] {
  const m = /^([^?#]*)(.*)$/.exec(url || '/');
  return [m?.[1] || '/', m?.[2] || ''];
}

export const appConfig: ApplicationConfig = {
  // Browser-only providers (provideBrowserGlobalErrorListeners,
  // provideClientHydration, provideAnimationsAsync) live in main.ts so
  // app.config.ts can be imported by both the browser bootstrap and the
  // server-side prerender bootstrap (app.config.server.ts) without
  // pulling DOM-dependent code into the prerender extractor — that's
  // what was crashing prerender with NG0401.
  providers: [
    // Path-based routing (NOT hash) — clean URLs like /pricing instead of
    // /#/pricing. Critical for SEO: Google does not index URL fragments,
    // so hash-based URLs are invisible to search crawlers. The IIS site
    // has an SPA fallback rewrite (web.config) so direct deep-link access
    // resolves correctly. `scrollPositionRestoration: 'top'` makes every
    // navigation start at the top of the page (otherwise users land mid-
    // scroll on long pages because Angular preserves scroll across routes).
    provideRouter(routes, withInMemoryScrolling({
      scrollPositionRestoration: 'top',
      anchorScrolling: 'enabled',
    })),
    // `withFetch()` makes Angular HttpClient use the standard fetch API
    // instead of XHR. This is required during prerender: the fetch backend
    // is the one Angular SSR intercepts to serve files from the in-memory
    // assets bundle, so requests like ngx-translate's
    // GET /assets/i18n/it-IT.json resolve at build time. Without it, the
    // request escapes to a fake "ng-localhost" host and fails with 0
    // Unknown Error, killing every prerendered route.
    provideHttpClient(withFetch(), withInterceptors([maintenanceInterceptor])),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: { darkModeSelector: '.dark-mode' }
      }
    }),

    // ngx-translate: loads /assets/i18n/{lang}.json at runtime.
    // `fallbackLang` is the final safety net when a key is missing in the
    // active translation file: we use English because it's universally
    // understandable. The `lang` value is a placeholder that gets immediately
    // overwritten by the APP_INITIALIZER below with the user's detected
    // preference (saved → browser locale → en-US).
    provideTranslateService({
      fallbackLang: 'en-US',
      lang: 'en-US',
      loader: provideTranslateHttpLoader({ prefix: './assets/i18n/', suffix: '.json' })
    }),

    // Sync LanguageService ⇄ ngx-translate + sticky-locale navigation.
    // La lingua iniziale è già URL-derived (LanguageService.readInitial).
    // AWAIT del primo translate.use: durante il prerender garantisce che il
    // file i18n sia caricato PRIMA che la pagina venga serializzata → l'HTML
    // statico esce già tradotto nella lingua dell'URL.
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      const lang = inject(LanguageService);
      const router = inject(Router);

      // Keep in sync on every change (Signal effect).
      // NB: effect() e subscribe() vanno registrati in modo SINCRONO, prima
      // di qualsiasi await — dopo un await l'injection context non esiste
      // più e effect() lancia NG0203 (rompeva l'estrazione route del prerender).
      effect(() => {
        translate.use(lang.current());
      });

      // STICKY LOCALE: i routerLink interni sono locale-less ('/pricing').
      // Su una variante localizzata (/it/**) un click li porterebbe alla
      // versione EN. Intercettiamo la NavigationStart: se la lingua attiva ha
      // un prefisso e la URL target non ce l'ha, re-instradiamo alla variante
      // localizzata. Il selettore lingua aggiorna PRIMA il signal e POI naviga,
      // quindi il cambio lingua esplicito non viene mai "riacchiappato".
      router.events.subscribe(ev => {
        if (!(ev instanceof NavigationStart)) return;
        const active = lang.current();
        if (active === DEFAULT_LOCALE) return;               // root EN: nulla da fare
        const url = ev.url || '/';
        if (localeFromPath(url)) {
          // URL già localizzata: allinea il signal se l'utente naviga
          // direttamente su un ALTRO prefisso (back/forward, link esterni).
          const target = localeFromPath(url)!;
          if (target !== active) lang.setLanguage(target);
          return;
        }
        const [path, suffix] = splitPathSuffix(url);
        router.navigateByUrl(localizePath(path, active) + suffix, { replaceUrl: false });
      });

      // Ritorna la promise del primo load i18n: l'app initializer la attende,
      // così nel prerender l'HTML viene serializzato SOLO a traduzioni caricate
      // (la pagina statica esce già nella lingua dell'URL).
      return firstValueFrom(translate.use(lang.current()));
    })
  ]
};
