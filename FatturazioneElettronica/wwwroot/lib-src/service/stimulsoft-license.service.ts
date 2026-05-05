/**
 * =====================================================================
 *   WUIC bundled Stimulsoft Reports License key
 * =====================================================================
 *
 * Pattern parallelo a `syncfusion-license.service.ts`: la chiave Stimulsoft
 * Reports e' bundled DENTRO la lib WUIC (non nel main.ts dell'app host) per
 * 2 motivi:
 *
 * 1. Il cliente finale di WUIC non deve gestire dettagli di licenze terze:
 *    il framework e' un prodotto commerciale che "just works" out of the box.
 * 2. Stimulsoft license Wuic-emessa include redistribution clause: il
 *    titolare della licenza (Lorenzo Castrico — ditta individuale,
 *    VAT IT02098880681, WUIC Framework) puo' redistribuire i componenti
 *    Stimulsoft ai propri clienti commerciali sotto forma di framework WUIC.
 *
 * REGISTRAZIONE LAZY (CRITICO per perf): la registrazione richiede di
 * importare `stimulsoft-reports-js/Scripts/stimulsoft.reports`, un pacchetto
 * di ~12.7 MB raw / ~5.4 MB transfer (gzip). Per evitare di scaricarlo al
 * boot della SPA (che bloccava il main thread per ~450ms misurati via
 * PerformanceObserver longtask), `ensureWuicStimulsoftLicenseRegistered()`
 * usa un `import()` dinamico che e' invocato solo dai componenti
 * report-viewer e report-designer al loro `ngOnInit`. Cosi' il chunk
 * Stimulsoft viene scaricato SOLO la prima volta che l'utente apre una
 * route report (~5% delle session per applicazioni tipiche WUIC).
 *
 * Storico (2026-04-22): la registrazione era fatta inline in `main.ts`
 * dell'host con un `import('stimulsoft-reports-js/...')` eseguito
 * immediatamente al boot. Il commento dell'epoca diceva "keeps it out of
 * initial bundle" ma era fuorviante: il dynamic import senza gate viene
 * risolto subito al boot. Lighthouse "Avoid long main-thread tasks"
 * segnalava il task da 450ms come #3 in gravita'.
 *
 * IDEMPOTENZA: chiamate ripetute sono no-op (flag `_licenseRegistered`).
 * In-flight requests sono coalesced: se 2 componenti chiamano in parallelo,
 * la promise viene cached.
 */

let _licenseRegistered = false;
let _inflightPromise: Promise<void> | null = null;

/**
 * Chiave Stimulsoft Wuic-licensed. Stringa pubblica non-secret (Stimulsoft
 * docs lo conferma): l'attivazione e' client-side e non contiene credenziali.
 * Puo' stare in source control.
 *
 * Aggiornamento: al rinnovo annuale della Stimulsoft Reports license, fare
 * login su stimulsoft.com -> Account -> Subscription -> get JS license,
 * sostituire la stringa qui sotto e ribuildare la lib.
 */
const WUIC_BUNDLED_STIMULSOFT_KEY =
  '6vJhGtLLLz2GNviWmUTrhSqnOItdDwjBylQzQcAOiHmJwbRgcBvPtpBV1fMGaPPIs2/9guB9QicH0Bjvx9nHoRyBgV' +
  'QOa5IHvhbUfunVFmPp3hn4ueHLQzwLc6x8JZ7V0LhGJoCxpDgYf2YZypPBHq8dylG5MmTtHomm+ukurtQrsjcNEHYh' +
  'J91UI/dS3h+iXj/TDnDMHgUNjcML2UI0ptP2h5MnbwbgRa2DOrG8pKMwr4MH7tzNeMxjcu659zBm4iRJWwb07txa4P' +
  'N0E26LrfMySzAaoMUPme6khincTraRCPDvjRU98485MFN2vZ8SscUGJq3Zz7hJxl/G6zYCJe6HyE7bxQIA7oHBzgI3' +
  'TvxeNrt5Zj/AyNnJNwi1qCmKN8wCBSCxYYKDhBmjzR3E88VWS8xEDkebwodLO7ygOkEA/xIoelbxoIqkNGDUPjIOWI' +
  '4UGsdVJwepeDEnfPA6GwsjHbtqiL6ViBc9VUo39CA8ITJudNuDjIzNFudMSZKmh2A0ZGxgp2wvnYmQGWE3MRnskjxT' +
  'vxM48Z8B/cYiPiaGpiePlIvvNyHsDCt87dCC';

/**
 * Garantisce che la license Stimulsoft sia registrata prima di istanziare
 * un componente Stimulsoft (report-viewer / report-designer).
 *
 * - Importa dinamicamente `stimulsoft-reports-js` (chunk lazy).
 * - Setta `Stimulsoft.Base.StiLicense.Key = WUIC_BUNDLED_STIMULSOFT_KEY`.
 * - Cache: chiamate successive ritornano la stessa Promise resolved.
 * - Race-safe: chiamate parallele attendono la stessa in-flight Promise.
 *
 * Uso tipico in un Component:
 * ```ts
 * async ngOnInit() {
 *   await ensureWuicStimulsoftLicenseRegistered();
 *   // ora puoi usare Stimulsoft Viewer / Designer senza watermark
 * }
 * ```
 */
export function ensureWuicStimulsoftLicenseRegistered(): Promise<void> {
  if (_licenseRegistered) return Promise.resolve();
  if (_inflightPromise) return _inflightPromise;

  _inflightPromise = import('stimulsoft-reports-js/Scripts/stimulsoft.reports')
    .then((m) => {
      const Stimulsoft =
        (m as any).Stimulsoft ??
        (m as any).default?.Stimulsoft ??
        (m as any).default;
      if (!Stimulsoft?.Base?.StiLicense) {
        throw new Error('[WUIC] Stimulsoft module did not expose Base.StiLicense — package layout changed?');
      }
      Stimulsoft.Base.StiLicense.Key = WUIC_BUNDLED_STIMULSOFT_KEY;
      _licenseRegistered = true;
    })
    .catch((err) => {
      // Reset inflight so a retry has a fresh attempt; logga ma non rilancia
      // (il caller decidera' se procedere col watermark o bloccare la route).
      _inflightPromise = null;
      console.error('[WUIC] Failed to register Stimulsoft license:', err);
    });

  return _inflightPromise;
}

/**
 * Diagnostic helper — utile per test / health check.
 */
export function getWuicStimulsoftLicenseStatus(): { registered: boolean; inflight: boolean } {
  return { registered: _licenseRegistered, inflight: !!_inflightPromise };
}
