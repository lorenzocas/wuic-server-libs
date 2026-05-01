import { ApplicationConfig, effect, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { maintenanceInterceptor } from './core/maintenance.interceptor';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideTranslateService, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { LanguageService } from './services/language.service';

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

    // Sync the LanguageService signal with ngx-translate's active language.
    // Runs whenever LanguageService.current() changes (navbar flag pick).
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      const lang = inject(LanguageService);
      // Initial sync
      translate.use(lang.current());
      // Keep in sync on every change (Signal effect)
      effect(() => {
        translate.use(lang.current());
      });
    })
  ]
};
