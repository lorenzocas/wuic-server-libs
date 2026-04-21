import { ApplicationConfig, ErrorHandler, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import localeItExtra from '@angular/common/locales/extra/it';
import localeFr from '@angular/common/locales/fr';
import localeFrExtra from '@angular/common/locales/extra/fr';
import localeEs from '@angular/common/locales/es';
import localeEsExtra from '@angular/common/locales/extra/es';
import localeDe from '@angular/common/locales/de';
import localeDeExtra from '@angular/common/locales/extra/de';

import { appRoutes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { GlobalHandler } from './wuic-bridges/core';
// import { ResizableModule } from 'angular-resizable-element';
import { providePrimeNG } from 'primeng/config';

// Registra tutti i locale gestiti dal framework (`_wuic_translations`). Senza questo,
// `formatNumber`/`formatCurrency`/`formatPercent`/`DatePipe` con locale !== 'en-US'
// (default Angular built-in) lanciano NG0701 "Missing locale data". en-US e' bundled
// di default quindi non richiede registrazione.
registerLocaleData(localeIt, 'it-IT', localeItExtra);
registerLocaleData(localeFr, 'fr-FR', localeFrExtra);
registerLocaleData(localeEs, 'es-ES', localeEsExtra);
registerLocaleData(localeDe, 'de-DE', localeDeExtra);
import Aura from '@primeuix/themes/aura';
import { credentialsInterceptor } from './interceptors/credentials.interceptor';
import { authExpiredInterceptor } from './wuic-bridges/core';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([credentialsInterceptor, authExpiredInterceptor])),
    importProvidersFrom(TranslateModule.forRoot()),
    importProvidersFrom(BrowserAnimationsModule),
    // importProvidersFrom(ResizableModule),
    // importProvidersFrom(ConfirmDialogModule),
    { provide: ErrorHandler, useClass: GlobalHandler },
    // Note: LicenseFeatureService.refresh() moved to AppComponent.ngOnInit
    // to avoid NG0200 circular DI during bootstrap (HTTP call → authExpiredInterceptor
    // → inject(AuthSessionService) before the root injector is fully built).
    provideRouter(appRoutes, withHashLocation()),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.theme-dark'
        }
      }
    })
  ]
};



