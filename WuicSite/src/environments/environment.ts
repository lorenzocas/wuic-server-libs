/**
 * Development / sandbox environment (default).
 *
 * This file is used by `ng serve` and `ng build --configuration development`.
 * For production, `environment.prod.ts` is swapped in via `fileReplacements`
 * in angular.json.
 *
 * Note on PayPal configuration:
 *   The PayPal ClientId and Mode (sandbox/live) are NOT configured here
 *   anymore — they are fetched at runtime from the WuicSiteApi backend
 *   (`GET /api/paypal/config`). This way switching sandbox <-> live is a
 *   single appsettings.json edit on the IIS server, no Angular rebuild.
 *   See `paypal-loader.ts` and the backend `Program.cs`.
 *
 * apiBaseUrl:
 *   In dev, points to the local API (`dotnet run` in WuicSite/api).
 *   In prod (`environment.prod.ts`), points to the relative `/api` sub-app.
 */
export const environment = {
  production: false,
  paypal: {
    /** Display + fallback currency. The actual currency on each order is
     *  decided server-side via `Paypal:Currency` in appsettings.json. */
    currency: 'EUR' as const,
  },
  apiBaseUrl: 'http://localhost:5080' as const,
  licenseEmail: 'licenses@wuic-framework.com' as const,
};
