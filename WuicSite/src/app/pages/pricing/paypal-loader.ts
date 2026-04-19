import { PAYPAL_CONFIG } from './paypal.config';

declare const window: Window & { paypal?: any };

let sdkPromise: Promise<any> | null = null;

/**
 * Dynamically loads the PayPal JS SDK (once, memoized) with the configured
 * Client ID and currency. Returns the global `window.paypal` namespace.
 * The SDK is ~50KB gzipped — only loaded when the user opens the purchase
 * dialog, keeping the home/pricing initial bundle lean.
 */
export function loadPaypalSdk(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PayPal SDK requires browser environment'));
  }
  if (window.paypal) {
    return Promise.resolve(window.paypal);
  }
  if (sdkPromise) return sdkPromise;

  const params = new URLSearchParams({
    'client-id': PAYPAL_CONFIG.CLIENT_ID,
    'currency': PAYPAL_CONFIG.CURRENCY,
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

export function isPaypalConfigured(): boolean {
  const id = PAYPAL_CONFIG.CLIENT_ID ?? '';
  return !!id && !id.startsWith('REPLACE_') && id.trim().length > 10;
}
