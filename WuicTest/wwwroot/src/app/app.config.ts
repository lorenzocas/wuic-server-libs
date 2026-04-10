import { ApplicationConfig, ErrorHandler, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import localeItExtra from '@angular/common/locales/extra/it';

import { appRoutes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { GlobalHandler } from './wuic-bridges-npm/core';
// import { ResizableModule } from 'angular-resizable-element';
import { providePrimeNG } from 'primeng/config';

registerLocaleData(localeIt, 'it-IT', localeItExtra);
import Aura from '@primeng/themes/aura';
import { credentialsInterceptor } from './interceptors/credentials.interceptor';
import { authExpiredInterceptor } from 'wuic-framework-lib';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([credentialsInterceptor, authExpiredInterceptor])),
    importProvidersFrom(TranslateModule.forRoot()),
    importProvidersFrom(BrowserAnimationsModule),
    // importProvidersFrom(ResizableModule),
    // importProvidersFrom(ConfirmDialogModule),
    { provide: ErrorHandler, useClass: GlobalHandler },
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



