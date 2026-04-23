import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { environment as appSettings } from './app/environments/environment';

// Popola il backing store globale di `WtoolboxService.appSettings` PRIMA
// del bootstrap.
//
// Decisione di design: scriviamo direttamente su `globalThis.__WUIC_APP_SETTINGS`
// invece di `import { WtoolboxService } from 'wuic-framework-lib'` + setter.
// Motivazione:
//   1. L'import di WtoolboxService a module-level di main.ts triggerava NG0200
//      (Angular circular DI) perche' forzava Angular a hoistare il service
//      nell'injector root prima che la chain `authExpiredInterceptor` →
//      `AuthSessionService` → `WtoolboxService` fosse pronta.
//   2. `WtoolboxService.appSettings` getter/setter leggono dallo stesso
//      `globalThis.__WUIC_APP_SETTINGS`, quindi scrivere direttamente qui
//      produce lo stesso risultato semanticamente, SENZA tirare il service
//      nel grafo dependency del bootstrap.
//   3. Con `optimization.scripts: true` + secondary entry points, esbuild
//      puo' duplicare la classe `WtoolboxService` in piu' chunk; il global
//      store condivide lo stato tra tutte le copie.
(globalThis as any).__WUIC_APP_SETTINGS = appSettings;

// enableProdMode(): abilitato su TUTTI i deploy dove hostname != 'localhost'.
// Per testare la prod mode SULLA stessa macchina di sviluppo senza toccare
// questo codice, registra un alias localhost nel file hosts di Windows
// (`C:\Windows\System32\drivers\etc\hosts`):
//     127.0.0.1    wuic.test
// e naviga su `http://wuic.test:5000/` invece di `localhost:5000`. Il
// browser invia Host: wuic.test, window.location.hostname diventa
// 'wuic.test' → il guard qui sotto attiva prod mode.
//
// Storico (2026-04-22): il primo tentativo di attivarlo aveva causato il
// crash `TypeError: Cannot redefine property: ɵfac at addDirectiveFactoryDef
// at compileComponent at _DynamicRowTemplateComponent.getComponentFromTemplate`
// perche' `enableProdMode()` rendeva `isDevMode()==false` → Angular 18+
// definiva `ɵfac` con `configurable: false`, e il successivo
// `ɵcompileComponent` runtime dei dynamic-*-template non poteva ridefinirlo.
//
// Fix (2026-04-23): i 7 dynamic-*-template sono stati refactorati per
// usare `DynamicCompilerService` (wrapper su API pubblica `Compiler` via
// `JitCompilerFactory` manuale). Questo path NgModule-based non chiama
// piu' `addDirectiveFactoryDef` sugli import → nessun crash in prod mode.
// Vedi skills/angular-jit-compiler-migration/SKILL.md.
if (window.location.hostname !== 'localhost') {
  enableProdMode();
}

// Stimulsoft license registration is NOT done here at bootstrap.
//
// Storico: il file precedente faceva `import('stimulsoft-reports-js/...').then(...)`
// in cima a main.ts, sostenendo via commento "keeps it out of initial bundle".
// In realta' il dynamic import veniva risolto **immediatamente** al boot della
// SPA — non c'era nessuna gate condition — quindi il browser scaricava e
// parseava il chunk Stimulsoft (~5.4 MB transfer / ~12.7 MB raw) appena
// caricato il main bundle. Risultato misurato via PerformanceObserver
// (longtask): 450ms di main-thread blocking durante i primi 1000ms del page
// load, su cities/list dove report-viewer non e' nemmeno usato.
//
// Fix: la registrazione della license e' stata spostata dentro
// `ensureStimulsoftLicenseRegistered()` (vedi
// wuic-framework-lib/service/stimulsoft-license.service.ts), invocata al
// `ngOnInit` di `ReportViewerComponent` e `ReportDesignerComponent` (gia' lazy
// via `loadComponent` in app.routes.ts). Cosi' Stimulsoft viene scaricato
// SOLO quando l'utente apre per la prima volta una route report — i ~95% di
// session che non aprono mai un report risparmiano completamente.
//
// La chiave License e' stata spostata nel service stesso (stessa stringa
// commerciale gia' commentata sopra; e' una chiave Wuic-licensed di Stimulsoft).

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
