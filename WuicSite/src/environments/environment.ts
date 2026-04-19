/**
 * Development / sandbox environment (default).
 *
 * This file is used by `ng serve` and `ng build --configuration development`.
 * For production, `environment.prod.ts` is swapped in via `fileReplacements`
 * in angular.json.
 *
 * PAYPAL_CLIENT_ID:
 *   Put your PayPal SANDBOX Client ID here (from
 *   https://developer.paypal.com/dashboard/applications/sandbox).
 *   It is a PUBLIC identifier — safe to commit to source control.
 *   The Client SECRET must NEVER be placed here (server-only).
 */
export const environment = {
  production: false,
  paypal: {
    mode: 'sandbox' as 'sandbox' | 'production',
    clientId: 'Aen2LtIGY9kVSruhyrtmy45eHnc53KzI09rS1-PXSyW7oMyEsD0KN6JmeDBvZBfaYsxXVuWMbTC3LBYQ',
    currency: 'EUR' as const,
  },
  licenseEmail: 'licenses@wuic-framework.com' as const,
};
