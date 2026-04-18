import { ApplicationConfig, effect, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideTranslateService, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { LanguageService } from './services/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideAnimationsAsync(),
    provideHttpClient(),
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
