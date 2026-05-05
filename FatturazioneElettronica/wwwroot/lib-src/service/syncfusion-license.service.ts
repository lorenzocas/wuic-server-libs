import { registerLicense } from '@syncfusion/ej2-base';

/**
 * =====================================================================
 *   WUIC bundled Syncfusion Community License key
 * =====================================================================
 *
 * Questa è la chiave Syncfusion **emessa a nome di Lorenzo Castrico**
 * (ditta individuale, VAT IT02098880681 — titolare del framework WUIC)
 * sotto il programma Small Business Community License di Syncfusion
 * (revenue < 1M USD, ≤ 5 developers). Approvata da Syncfusion Inc. il
 * 2026-04-23, ticket #832836.
 *
 * È bundled DENTRO la lib (non nel main.ts dell'app host) per due ragioni:
 *
 * 1. Il cliente finale di WUIC non dovrebbe dover gestire o conoscere
 *    dettagli di licenze di componenti di terze parti — il framework
 *    è un prodotto commerciale e deve "just work" fuori scatola.
 *
 * 2. Syncfusion Community License include una redistribution clause:
 *    il titolare della licenza (Lorenzo Castrico) può redistribuire i
 *    componenti Syncfusion ai propri clienti commerciali sotto forma di
 *    framework WUIC — purché il titolare resti entro le soglie di
 *    eligibility annuali. Attenzione: questa clausola copre l'uso dei
 *    componenti **attraverso i wrapper pubblici WUIC**. I licenziatari
 *    WUIC che vogliono usare Syncfusion direttamente (source-code
 *    ownership sul proprio progetto, bypassando WUIC) devono acquistare
 *    una propria licenza Syncfusion — vedi `LICENSE-Syncfusion.txt` nei
 *    deploy ZIP e `DISCLAIMER.txt` per i tre scenari d'uso.
 *
 * La chiave è una **stringa pubblica non-secret** (Syncfusion FAQ lo
 * conferma esplicitamente): l'attivazione avviene client-side e non
 * contiene credenziali. Può stare in source control tranquillamente.
 *
 * Quando va aggiornata:
 * - Al rinnovo annuale della Community License (auto-opt-in via dashboard
 *   Syncfusion, gratuito)
 * - Al bump alla major successiva dei package @syncfusion/ej2-* (es. da
 *   v33 a v34); la chiave è valida per una specifica major.
 *
 * Come aggiornarla:
 * 1. Login su https://syncfusion.com → Account → License & Downloads
 * 2. Get License Key → seleziona la major installata nel repo
 * 3. Copia la stringa generata
 * 4. Sostituisci `WUIC_BUNDLED_SYNCFUSION_KEY` qui sotto
 * 5. Rebuild della lib: `npx ng build wuic-framework-lib --watch=false`
 * 6. Il cliente finale riceve la lib rebuilt tramite NuGet/FESM → no action needed
 */
const WUIC_BUNDLED_SYNCFUSION_KEY =
  'IAk8BicRIAEqCzQhAR8kAxMHIgRJXmBXf01yQWhYfUFzdUpPaVVYVHdeSFhqQ3taZiUeUn1ecnJVQmJfUEVyXUJaYk19V31GYA==';

/**
 * Polyfill defensive per bug Syncfusion v33 (Resize3.setTarget):
 * `e.target.className.includes(...)`. Se `e.target` è un elemento SVG,
 * `className` è un `SVGAnimatedString` (non una stringa) → l'accesso a
 * `.includes` torna `undefined` e la chiamata esplode con
 * `TypeError: e.target.className.includes is not a function`.
 *
 * Il crash si ripete ad ogni `mousemove` sopra un SVG interno (es. icone
 * funnel, svg di resize) e blocca il render iniziale dello spreadsheet.
 *
 * Patchiamo il prototype di `SVGAnimatedString` aggiungendo le string-method
 * canoniche che delegano a `baseVal`. Viene applicato una sola volta per
 * application lifecycle via flag su `globalThis`.
 *
 * Chiamato in testa a `ensureWuicSyncfusionLicenseRegistered()` così la
 * patch è attiva PRIMA che qualsiasi componente Syncfusion venga montato
 * (il costruttore di SpreadsheetListSfComponent invoca subito la
 * registrazione license, quindi prima di qualsiasi bootstrap Syncfusion).
 */
function _patchSvgClassNameStringMethods(): void {
  try {
    if ((globalThis as any).__wuicSfSvgPatched) return;
    if (typeof SVGAnimatedString !== 'undefined') {
      const proto: any = SVGAnimatedString.prototype;
      if (!proto.includes) {
        proto.includes = function (search: string, start?: number): boolean {
          return typeof this.baseVal === 'string' && this.baseVal.includes(search, start);
        };
      }
      if (!proto.startsWith) {
        proto.startsWith = function (search: string, start?: number): boolean {
          return typeof this.baseVal === 'string' && this.baseVal.startsWith(search, start);
        };
      }
      if (!proto.endsWith) {
        proto.endsWith = function (search: string, end?: number): boolean {
          return typeof this.baseVal === 'string' && this.baseVal.endsWith(search, end);
        };
      }
      if (!proto.indexOf) {
        proto.indexOf = function (search: string, start?: number): number {
          return typeof this.baseVal === 'string' ? this.baseVal.indexOf(search, start) : -1;
        };
      }
      if (!proto.lastIndexOf) {
        proto.lastIndexOf = function (search: string, start?: number): number {
          return typeof this.baseVal === 'string' ? this.baseVal.lastIndexOf(search, start as any) : -1;
        };
      }
      if (!proto.split) {
        proto.split = function (sep: any, limit?: number): string[] {
          return typeof this.baseVal === 'string' ? this.baseVal.split(sep, limit) : [];
        };
      }
      if (!proto.trim) {
        proto.trim = function (): string {
          return typeof this.baseVal === 'string' ? this.baseVal.trim() : '';
        };
      }
      if (!proto.toLowerCase) {
        proto.toLowerCase = function (): string {
          return typeof this.baseVal === 'string' ? this.baseVal.toLowerCase() : '';
        };
      }
      if (!proto.toUpperCase) {
        proto.toUpperCase = function (): string {
          return typeof this.baseVal === 'string' ? this.baseVal.toUpperCase() : '';
        };
      }
      if (!proto.match) {
        proto.match = function (re: any): RegExpMatchArray | null {
          return typeof this.baseVal === 'string' ? this.baseVal.match(re) : null;
        };
      }
      if (!proto.replace) {
        proto.replace = function (a: any, b: any): string {
          return typeof this.baseVal === 'string' ? this.baseVal.replace(a, b) : '';
        };
      }
    }
    (globalThis as any).__wuicSfSvgPatched = true;
  } catch {
    // swallow - patch defensive, non deve mai rompere il boot
  }
}

/**
 * Flag module-scope per evitare doppie registrazioni (Syncfusion accetta
 * solo una chiamata `registerLicense(...)` per application lifecycle;
 * chiamate successive sono silenziosamente no-op o warning).
 */
let _licenseRegistered = false;

/**
 * Flag interno che marca se la chiave bundled è stata considerata "valida"
 * (non placeholder / non vuota). Usato dalla diagnostica per spiegare
 * al developer perché la spreadsheet mostra il watermark "Unlicensed".
 */
let _bundledKeyLooksValid = false;

/**
 * Registra automaticamente la Community License Syncfusion bundled nella
 * lib. È **idempotente**: se già registrata, non fa nulla.
 *
 * Viene chiamata dal costruttore di `SpreadsheetListSfComponent` (e altri
 * componenti Syncfusion futuri) al primo utilizzo. Il cliente finale di
 * WUIC non deve mai chiamarla esplicitamente.
 *
 * Da sola NON è sufficiente se la costante `WUIC_BUNDLED_SYNCFUSION_KEY`
 * è ancora placeholder: in quel caso loggiamo un warn diagnostico ma
 * proseguiamo (Syncfusion mostrerà il watermark "Unlicensed" finché la
 * chiave reale non è bundled).
 */
export function ensureWuicSyncfusionLicenseRegistered(): void {
  if (_licenseRegistered) return;

  // Patch defensive per bug Syncfusion v33: Resize3.setTarget chiama
  // `e.target.className.includes(...)`. Se il target è un SVG, className
  // è un SVGAnimatedString (non string) → TypeError. Si verifica ad ogni
  // mousemove, blocca il render iniziale della spreadsheet.
  // Il polyfill va applicato PRIMA che qualsiasi componente Syncfusion
  // venga montato, quindi qui (chiamato dal costruttore di SpreadsheetListSf).
  _patchSvgClassNameStringMethods();

  const key = (WUIC_BUNDLED_SYNCFUSION_KEY ?? '').trim();
  const looksValid = !!key && !key.startsWith('REPLACE_') && key.length > 50;

  if (!looksValid) {
    _licenseRegistered = true; // evita di rilanciare il warn ad ogni istanza
    console.warn(
      '[WUIC] Bundled Syncfusion Community License key is not configured ' +
      '(placeholder in syncfusion-license.service.ts). Spreadsheet will ' +
      'render with the "Unlicensed" watermark. Update the key and rebuild ' +
      'the framework library.'
    );
    return;
  }

  try {
    registerLicense(key);
    _licenseRegistered = true;
    _bundledKeyLooksValid = true;
  } catch (err) {
    console.error('[WUIC] Failed to register bundled Syncfusion license:', err);
  }
}

/**
 * Override escape hatch — registra una chiave Syncfusion alternativa fornita
 * dall'app host invece di quella bundled nel framework.
 *
 * USE CASE PRIMARIO:
 * - Cliente enterprise WUIC che ha ACQUISTATO una propria licenza Syncfusion
 *   Team/Commercial (perché cresciuto oltre le soglie Community: > 1M USD
 *   revenue o > 5 developers) e vuole deployare col proprio nome di
 *   organizzazione nel record Syncfusion.
 * - CI/CD con chiave test separata.
 *
 * Quando chiamata:
 * - **PRIMA** che qualunque componente Syncfusion venga istanziato, altrimenti
 *   la chiave bundled di Lamela è già stata attivata e override non ha effetto.
 * - Tipicamente in `main.ts`, prima di `bootstrapApplication(App, ...)`.
 *
 * Non chiamarla mai con la chiave di Lamela: quella è già bundled e
 * attivata automaticamente dal framework.
 */
export function registerWuicSyncfusionLicense(customKey: string | null | undefined): void {
  if (_licenseRegistered) {
    console.warn('[WUIC] Syncfusion license already registered; custom override ignored.');
    return;
  }
  if (!customKey || typeof customKey !== 'string') return;
  const trimmed = customKey.trim();
  if (!trimmed || trimmed.startsWith('REPLACE_') || trimmed.length < 50) return;

  try {
    registerLicense(trimmed);
    _licenseRegistered = true;
    _bundledKeyLooksValid = true;
  } catch (err) {
    console.error('[WUIC] Failed to register custom Syncfusion license:', err);
  }
}

/**
 * Diagnostic helper — utile per test / health check / pagina admin.
 * Ritorna lo stato corrente della registrazione license.
 */
export function getWuicSyncfusionLicenseStatus(): {
  registered: boolean;
  keyAppearsValid: boolean;
  bundledKeyPlaceholder: boolean;
} {
  const key = (WUIC_BUNDLED_SYNCFUSION_KEY ?? '').trim();
  return {
    registered: _licenseRegistered,
    keyAppearsValid: _bundledKeyLooksValid,
    bundledKeyPlaceholder: !key || key.startsWith('REPLACE_')
  };
}
