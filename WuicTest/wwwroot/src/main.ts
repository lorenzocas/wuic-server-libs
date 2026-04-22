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

// Lazy-load Stimulsoft license setup — not needed at bootstrap, only before report components are used.
// The dynamic import keeps the 16 MB library out of the initial bundle.
import('stimulsoft-reports-js/Scripts/stimulsoft.reports').then((m) => {
  const Stimulsoft = m.Stimulsoft ?? (m as any).default?.Stimulsoft ?? (m as any).default;
  Stimulsoft.Base.StiLicense.Key = "6vJhGtLLLz2GNviWmUTrhSqnOItdDwjBylQzQcAOiHmJwbRgcBvPtpBV1fMGaPPIs2/9guB9QicH0Bjvx9nHoRyBgV" +
    "QOa5IHvhbUfunVFmPp3hn4ueHLQzwLc6x8JZ7V0LhGJoCxpDgYf2YZypPBHq8dylG5MmTtHomm+ukurtQrsjcNEHYh" +
    "J91UI/dS3h+iXj/TDnDMHgUNjcML2UI0ptP2h5MnbwbgRa2DOrG8pKMwr4MH7tzNeMxjcu659zBm4iRJWwb07txa4P" +
    "N0E26LrfMySzAaoMUPme6khincTraRCPDvjRU98485MFN2vZ8SscUGJq3Zz7hJxl/G6zYCJe6HyE7bxQIA7oHBzgI3" +
    "TvxeNrt5Zj/AyNnJNwi1qCmKN8wCBSCxYYKDhBmjzR3E88VWS8xEDkebwodLO7ygOkEA/xIoelbxoIqkNGDUPjIOWI" +
    "4UGsdVJwepeDEnfPA6GwsjHbtqiL6ViBc9VUo39CA8ITJudNuDjIzNFudMSZKmh2A0ZGxgp2wvnYmQGWE3MRnskjxT" +
    "vxM48Z8B/cYiPiaGpiePlIvvNyHsDCt87dCC";
});

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
