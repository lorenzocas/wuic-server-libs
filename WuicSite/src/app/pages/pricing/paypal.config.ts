import { environment } from '../../../environments/environment';

/**
 * PayPal integration config (frontend side).
 *
 * Note: ClientId and Mode (sandbox/live) are NOT here anymore — they are
 * fetched at runtime from the WuicSiteApi backend via `GET /api/paypal/config`,
 * see `paypal-loader.ts`. This way switching sandbox <-> live is a one-line
 * edit to `appsettings.json` on the IIS server (no Angular rebuild required,
 * since the ClientId is no longer baked into the bundle).
 *
 * What remains here is purely client-side / build-time config:
 *  - currency (display + fallback)
 *  - the email shown in the success screen mailto
 *  - the API base URL for the backend endpoints
 */
export const PAYPAL_CONFIG = {
  /**
   * ISO currency code — used as fallback if the backend doesn't echo one.
   * The actual currency on each order is decided server-side in the
   * `Paypal:Currency` setting (defaults to EUR there too).
   */
  CURRENCY: environment.paypal.currency,

  /** Email shown in the success-screen mailto link (license issuer inbox). */
  LICENSE_EMAIL: environment.licenseEmail,

  /**
   * Base URL of the WuicSiteApi backend that:
   *   - returns the public PayPal config (`GET /paypal/config`)
   *   - creates and captures PayPal orders server-side
   *   - sends the post-capture notification email
   * Server-side capture avoids the unreliable client-side `actions.order.capture()`
   * flow (which fails in sandbox with "Buyer access token not present") and
   * keeps the Client SECRET off the browser bundle. See WuicSite/api/Program.cs.
   */
  API_BASE_URL: environment.apiBaseUrl,
};

/** Product catalog — prices match /pricing page and license-issue.ps1 pricing rules. */
export interface PurchaseProduct {
  sku: string;
  label: string;
  priceEur: number;
  description: string;
  tier?: 'developer' | 'professional';
  issueType: 'initial' | 'renewal' | 'maintenance-extension' | 'extra-fingerprint';
}

export const PRODUCTS: Record<string, PurchaseProduct> = {
  DEV: {
    sku: 'wuic-dev-12m',
    label: 'WUIC Developer — Licenza annuale',
    priceEur: 600,
    description: 'Singolo sviluppatore, 1 fingerprint, tutte le feature base del framework.',
    tier: 'developer',
    issueType: 'initial',
  },
  PRO: {
    sku: 'wuic-pro-12m',
    label: 'WUIC Professional — Licenza annuale',
    priceEur: 1200,
    description: 'Framework completo con designer, AI e offline-first. 3 fingerprint inclusi.',
    tier: 'professional',
    issueType: 'initial',
  },
  DEV_EXTENSION: {
    sku: 'wuic-dev-ext-12m',
    label: 'WUIC Developer — Estensione manutenzione 12 mesi',
    priceEur: 300,
    description: 'Apre una nuova finestra di 12 mesi di aggiornamenti sulla tua licenza Developer.',
    tier: 'developer',
    issueType: 'maintenance-extension',
  },
  PRO_EXTENSION: {
    sku: 'wuic-pro-ext-12m',
    label: 'WUIC Professional — Estensione manutenzione 12 mesi',
    priceEur: 600,
    description: 'Apre una nuova finestra di 12 mesi di aggiornamenti sulla tua licenza Professional.',
    tier: 'professional',
    issueType: 'maintenance-extension',
  },
  EXTRA_FINGERPRINT: {
    sku: 'wuic-fp-extra-12m',
    label: 'Fingerprint aggiuntivo — 1 server extra',
    priceEur: 200,
    description: 'Autorizza 1 server aggiuntivo sulla tua licenza esistente per 12 mesi.',
    issueType: 'extra-fingerprint',
  },
};
