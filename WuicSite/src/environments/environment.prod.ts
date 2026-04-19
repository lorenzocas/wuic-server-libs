/**
 * Production environment.
 *
 * Swapped in by angular.json `fileReplacements` for
 * `ng build --configuration production` (the default for `ng build`).
 *
 * PAYPAL_CLIENT_ID:
 *   Put your PayPal LIVE Client ID here (from
 *   https://developer.paypal.com/dashboard/applications/live).
 *   It is a PUBLIC identifier — safe to commit to source control.
 *   The Client SECRET must NEVER be placed here (server-only).
 */
export const environment = {
  production: true,
  paypal: {
    mode: 'production' as 'sandbox' | 'production',
    clientId: 'REPLACE_WITH_PAYPAL_LIVE_CLIENT_ID',
    currency: 'EUR' as const,
  },
  licenseEmail: 'licenses@wuic-framework.com' as const,
};
