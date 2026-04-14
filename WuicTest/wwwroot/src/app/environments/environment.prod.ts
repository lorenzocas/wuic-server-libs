// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  file_path: 'http://localhost/',
  api_url: 'http://localhost/api/',
  meta_url: 'http://localhost/api/Meta/',
  global_root_url: 'http://localhost/api/Meta/AsmxProxy/',
  upload_handler: 'http://localhost/api/UploadImage',
  upload_path: 'http://localhost/upload/',
  oauth_enabled: false,
  cacheMetadataVersionExpirationMinutes: 0,
  preventNavigateOnFilterByDefault: true,
  locale: 'it-IT',
  currencyCode: 'EUR',
  currencySymbol: '€'
};
