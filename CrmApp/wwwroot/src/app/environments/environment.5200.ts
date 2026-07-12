// DEV-5200 ENVIRONMENT (usato dalla configurazione `development5200` / `serve:4300`).
//
// Come `environment.ts` (dev: no-optimize, sourcemap) MA con URL RELATIVI
// (origin-less): il dev server Angular su :4300 fa da reverse-proxy verso il
// backend :5200 (`proxy.conf.5200.json`) → tutto sullo stesso origin :4300,
// quindi NIENTE CORS né cookie cross-origin. Permette di far girare CrmApp
// in parallelo ad altre app WUIC che occupano :5000/:4200.
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
