/**
 * Production environment.
 *
 * Swapped in by angular.json `fileReplacements` for
 * `ng build --configuration production` (the default for `ng build`).
 *
 * Note on PayPal configuration:
 *   The PayPal ClientId and Mode (sandbox/live) are NOT configured here
 *   anymore — they are fetched at runtime from the WuicSiteApi backend
 *   (`GET /api/paypal/config`). This way switching sandbox <-> live is a
 *   single appsettings.json edit on the IIS server, no Angular rebuild.
 *   See `paypal-loader.ts` and the backend `Program.cs`.
 *
 * apiBaseUrl:
 *   Relative '/api' path — same origin as the SPA, served by the
 *   WuicSiteApi sub-app under wuic-framework.com (see web.config rewrite
 *   exclusion + IIS sub-application config).
 */
export const environment = {
  production: true,
  paypal: {
    /** Display + fallback currency. The actual currency on each order is
     *  decided server-side via `Paypal:Currency` in appsettings.json. */
    currency: 'EUR' as const,
  },
  apiBaseUrl: '/api' as const,
  licenseEmail: 'licenses@wuic-framework.com' as const,
};
