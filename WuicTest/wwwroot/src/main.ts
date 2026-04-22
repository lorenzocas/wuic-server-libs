import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// NON chiamare enableProdMode() qui, nonostante Angular stampi
// "Angular is running in development mode" in console ad ogni boot.
//
// Storico (2026-04-22): un tentativo di invocare enableProdMode() solo sui
// deploy remoti (guard hostname != localhost) ha causato il crash
//   TypeError: Cannot redefine property: ɵfac
//     at addDirectiveFactoryDef
//     at compileComponent
//     at _DynamicRowTemplateComponent.getComponentFromTemplate
// Motivo: Angular 18+ chiama `Object.defineProperty(..., { configurable:
// isDevMode() })` su `ɵfac`. Con enableProdMode() attivo isDevMode() torna
// false -> configurable=false -> il successivo ɵcompileComponent (eseguito
// runtime da DynamicRowTemplateComponent per compilare template custom per
// row) non riesce a ridefinire la proprieta' e crasha la list-grid.
//
// Lo stesso effetto era gia' noto con `optimization.scripts: true` (vedi
// commento in postbuild-minify.mjs) perche' quel flag produce un define
// esbuild `ngDevMode=false` che ha la stessa conseguenza. In entrambi i
// casi la root cause e' `isDevMode()==false`, non il minifier in se'.
//
// Finche' DynamicRowTemplateComponent usa `ɵcompileComponent` runtime per
// i template dinamici, il deploy DEVE restare in dev mode a livello runtime
// (bundle minificato via terser, ma ngDevMode/isDevMode lasciati liberi di
// valutare dev a runtime). Il prezzo e' il log in console + alcune
// ottimizzazioni runtime skipped, non impatta funzionalita'.

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
