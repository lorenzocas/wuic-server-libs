import { PAYPAL_CONFIG } from './paypal.config';

declare const window: Window & { paypal?: any };

/**
 * Public PayPal config returned by `GET /api/paypal/config` — propagated
 * by the WuicSiteApi backend at runtime based on its current Mode setting.
 * Switching sandbox <-> live is a single appsettings.json edit on the
 * server, no Angular rebuild required.
 */
interface PaypalRuntimeConfig {
  mode: 'sandbox' | 'live';
  clientId: string;
  currency: string;
  configured: boolean;
}

let sdkPromise: Promise<any> | null = null;
let cachedConfig: PaypalRuntimeConfig | null = null;

/**
 * Error thrown when `loadPaypalSdk()` is called without marketing cookie consent.
 * Callers should catch this and show the cookie banner prompt instead of the
 * PayPal button. See `ConsentService.canLoadMarketing()`.
 */
export class PaypalConsentRequiredError extends Error {
  constructor() {
    super('PAYPAL_CONSENT_REQUIRED');
    this.name = 'PaypalConsentRequiredError';
  }
}

/**
 * Error thrown when the backend reports `configured: false` (PayPal Mode
 * has empty / placeholder ClientId in appsettings.json on the server).
 * Caller should display the "not configured" branch in the dialog.
 */
export class PaypalNotConfiguredError extends Error {
  constructor() {
    super('PAYPAL_NOT_CONFIGURED');
    this.name = 'PaypalNotConfiguredError';
  }
}

/**
 * Fetch the public PayPal config from the backend (memoized for the page
 * lifetime). Returns ClientId + currency that the frontend uses to load the
 * SDK. The mode (sandbox/live) is implicit in the ClientId itself —
 * PayPal's SDK URL is the same for both, the network behavior is determined
 * by the ClientId.
 */
export async function fetchPaypalConfig(): Promise<PaypalRuntimeConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch(`${PAYPAL_CONFIG.API_BASE_URL}/paypal/config`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`paypal/config failed: ${res.status}`);
  }
  const json = await res.json() as PaypalRuntimeConfig;
  cachedConfig = json;
  return json;
}

/**
 * Dynamically loads the PayPal JS SDK (once, memoized) using the ClientId
 * that the backend reports for the current Mode. Returns the global
 * `window.paypal` namespace. The SDK is ~50KB gzipped — only loaded when
 * the user opens the purchase dialog, keeping the home/pricing initial
 * bundle lean.
 *
 * GDPR gate: PayPal SDK plants third-party cookies (`ts`, `ts_c`, `LANG`, …)
 * from paypal.com as soon as it loads. This counts as marketing/third-party
 * tracking under GDPR + Italian Garante cookie ruling 10/06/2021, so loading
 * the SDK is blocked until the user has opted in via the cookie banner.
 * Pass `hasMarketingConsent = true` to unblock (caller should read from
 * `ConsentService.canLoadMarketing()`).
 */
export async function loadPaypalSdk(hasMarketingConsent: boolean): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('PayPal SDK requires browser environment');
  }
  if (!hasMarketingConsent) {
    throw new PaypalConsentRequiredError();
  }
  if (window.paypal) {
    return window.paypal;
  }
  if (sdkPromise) return sdkPromise;

  // Pull ClientId+currency from backend before building the SDK URL so a
  // server-side Mode change (sandbox <-> live) takes effect without rebuild.
  const cfg = await fetchPaypalConfig();
  if (!cfg.configured) {
    throw new PaypalNotConfiguredError();
  }

  const params = new URLSearchParams({
    'client-id': cfg.clientId,
    'currency': cfg.currency || PAYPAL_CONFIG.CURRENCY,
    'intent': 'capture',
    'components': 'buttons,funding-eligibility',
    'enable-funding': 'card',
    'disable-funding': 'paylater,credit',
  });

  const src = `https://www.paypal.com/sdk/js?${params.toString()}`;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src^="https://www.paypal.com/sdk/js"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.paypal));
      existing.addEventListener('error', () => reject(new Error('PayPal SDK failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error('PayPal SDK loaded but `paypal` global missing'));
    };
    script.onerror = () => reject(new Error('PayPal SDK failed to load (network)'));
    document.head.appendChild(script);
  });

  return sdkPromise;
}
