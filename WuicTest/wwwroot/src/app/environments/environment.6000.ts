// DEV-6000 ENVIRONMENT (usato dalla configurazione `development6000` / `serve:6200`).
//
// Come `environment.ts` (dev: no-optimize, sourcemap, bridge dev — DEBUGGABILE)
// MA con URL RELATIVI (origin-less): il dev server Angular su :6200 fa da
// reverse-proxy verso il backend :6000 (`proxy.conf.6000.json`) → tutto sullo
// stesso origin :6200, quindi NIENTE CORS ne' cookie cross-origin (a differenza
// degli URL assoluti a :5000 di environment.ts). Serve per debuggare le
// modifiche NON deployate del frontend contro un backend KonvergenceCore locale.
export const environment = {
  file_path: '/',
  api_url: '/api/',
  meta_url: '/api/Meta/',
  global_root_url: '/api/Meta/AsmxProxy/',
  upload_handler: '/api/UploadImage',
  upload_path: '/upload/',
  oauth_enabled: false,
  cacheMetadataVersionExpirationMinutes: 0,
  preventNavigateOnFilterByDefault: true,
  locale: 'it-IT',
  currencyCode: 'EUR',
  currencySymbol: '€'
};
