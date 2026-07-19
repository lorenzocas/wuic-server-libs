/**
 * Config Google Ads / gtag — SINGLE SOURCE per gli identificativi del tag.
 *
 * TUTTO qui è config-gated: finché `ADS_CONVERSION_ID` resta il placeholder
 * `AW-XXXXXXXXXX`, il GoogleAdsService è un NO-OP completo (nessun gtag.js
 * caricato, nessun dataLayer, nessun consent default) — così il sito resta
 * pulito e privacy-safe finché non esiste davvero un account Ads.
 *
 * Quando l'account Ads è pronto (piano W9-12, campagne a settembre):
 *   1. Sostituisci ADS_CONVERSION_ID con il tuo ID (`AW-1234567890`).
 *   2. In Google Ads crea le "conversion actions" e copia il loro label
 *      (la parte dopo lo slash in `AW-123.../AbCd_EfGh`) nelle CONVERSION_LABELS.
 *   3. Deploy. Consent Mode v2 + conversioni partono automaticamente.
 *
 * NB: NIENTE GA4 (decisione del piano: "solo gtag conversioni + Plausible").
 * L'analytics di traffico resta Plausible (cookieless); gtag serve SOLO a
 * misurare le conversioni degli annunci a pagamento.
 */

/** ID conversione Google Ads. Placeholder = feature disattivata. */
export const ADS_CONVERSION_ID = 'AW-XXXXXXXXXX';

/**
 * Label delle conversion action per goal (la parte dopo lo slash del
 * `send_to`). Placeholder = quel goal non spara conversione (ma continua a
 * sparare il goal Plausible, che è indipendente).
 * Le CHIAVI combaciano con i nomi-evento già usati nelle CTA (start.ts, ecc.).
 */
export const CONVERSION_LABELS: Record<string, string> = {
  sandbox_open: '',    // demo live aperta
  download_click: '',  // click su download ZIP
  buy_click: '',       // apertura flusso acquisto (pricing)
  start_cta: '',       // CTA principale su /start
};

/** True quando l'ID Ads è configurato per davvero (non il placeholder). */
export function isAdsConfigured(): boolean {
  return /^AW-\d{6,}$/.test(ADS_CONVERSION_ID);
}
