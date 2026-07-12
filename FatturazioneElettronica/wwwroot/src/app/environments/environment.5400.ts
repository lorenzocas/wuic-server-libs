// DEV-5400 ENVIRONMENT (usato dalla configurazione `development5400` / `serve:4400`).
//
// Come `environment.ts` (dev: no-optimize, sourcemap) MA con URL RELATIVI
// (origin-less): il dev server Angular su :4400 fa da reverse-proxy verso il
// backend :5400 (`proxy.conf.5400.json`) → tutto sullo stesso origin :4400,
// quindi NIENTE CORS né cookie cross-origin. Permette di far girare
// FatturazioneElettronica in parallelo alle altre app WUIC.
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
