// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

// DEV ENVIRONMENT (default, usato da `ng serve:dev` su :4200).
//
// URL RELATIVI (origin-less) come prod: il browser li risolve contro
// `window.location.origin` (:4200) e il dev-proxy Angular (proxy.conf.js) li
// inoltra al backend. Cosi' il FE e' DISACCOPPIATO dalla porta del backend:
// il proxy punta a :5000 di default, oppure a un'altra porta via
// `WUIC_E2E_BACKEND_URL` (es. dispatcher docs-driven su :5210 quando :5000 e'
// occupata da un altro progetto). Prima erano hardcodati `http://localhost:5000`
// assoluti (bypassavano il proxy) → spostando la porta del backend il bootstrap
// (traduzioni/auth/firstrun) restava su :5000 e la UI non caricava.
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


