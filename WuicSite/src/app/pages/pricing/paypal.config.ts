/**
 * PayPal integration config.
 *
 * Replace `CLIENT_ID` with the production Client ID from your PayPal Business
 * Developer Dashboard (https://developer.paypal.com/dashboard/applications/live).
 * For testing, set it to a Sandbox Client ID and switch `MODE` to `'sandbox'`.
 *
 * The Client ID is a PUBLIC identifier — safe to expose in the frontend bundle.
 * The Client SECRET must NEVER be placed here (server-only).
 *
 * IMPORTANT: with this purely-client integration the transaction capture happens
 * client-side. PayPal still emails the vendor on every transaction, and the
 * license is issued manually after verifying amount + buyer email. For full
 * fraud-proofing switch to server-side order creation via PayPal Orders v2 API.
 */
export const PAYPAL_CONFIG = {
  /** Set to 'sandbox' for testing, 'production' for live */
  MODE: 'sandbox' as 'sandbox' | 'production',

  /** PayPal Business Client ID — replace with your real one */
  CLIENT_ID: 'REPLACE_WITH_PAYPAL_CLIENT_ID',

  /** ISO currency code */
  CURRENCY: 'EUR' as const,

  /** Email where license requests are sent after successful payment */
  LICENSE_EMAIL: 'licenses@wuic-framework.com' as const,
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
    description: 'Framework completo con designer, AI e offline-first. 5 fingerprint inclusi.',
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
