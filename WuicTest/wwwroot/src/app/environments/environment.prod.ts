// PROD ENVIRONMENT (attivo nei build `--configuration=npm` via
// `angular.json` → `fileReplacements`). Rimpiazza `environment.ts` a
// build-time.
//
// URL relativi (origin-less) → il browser li risolve contro
// `window.location.origin`. Questo garantisce che la stessa bundle
// funzioni identica su qualunque host serving (localhost:5000,
// wuic.test:5000 alias host per test prod-mode, demo.wuic-framework.com,
// ecc.) SENZA riconfigurazioni per-host, CORS preflight o cookie
// isolation — lo SPA e il backend sono sempre sullo stesso origin
// dove il SPA e' ospitato.
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
