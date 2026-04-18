import { ApplicationConfig, ErrorHandler, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import localeItExtra from '@angular/common/locales/extra/it';

import { appRoutes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { GlobalHandler } from './wuic-bridges/core';
// import { ResizableModule } from 'angular-resizable-element';
import { providePrimeNG } from 'primeng/config';

registerLocaleData(localeIt, 'it-IT', localeItExtra);
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



