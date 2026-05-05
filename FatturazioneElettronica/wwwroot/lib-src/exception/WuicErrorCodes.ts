/**
 * Single source of truth for client-side errorCodes. Mirror of the server
 * counterpart in Helpers/Exceptions/WuicErrorCodes.cs — keep them in sync.
 *
 * Translations live in `wuic_translation` (seeded by
 * scripts/exception-handling/seed-error-translations.ps1). The
 * `errors.db.sql_exception` code is special: it is NOT looked up as a
 * message — only the dialog labels under `errors.db.sql_exception.*` are
 * translated. The actual SQL message comes raw from the server.
 */
export const WuicErrorCodes = {
    // Mirror of server codes
    AuthUnauthenticated:      'errors.auth.unauthenticated',
    AuthCookieMalformed:      'errors.auth.cookie_malformed',
    AuthOperationDisabled:    'errors.auth.operation_disabled',
    AuthLoginFailed:          'errors.auth.login_failed',

    MetadataPropsBagMalformed: 'errors.metadata.props_bag.malformed',
    MetadataRouteNotFound:     'errors.metadata.route.not_found',
    MetadataLookupOrphan:      'errors.metadata.lookup_orphan',
    MetadataVersionMismatch:   'errors.metadata.version_mismatch',
    MetadataTemplateInvalid:   'errors.metadata.template.invalid',
    MetadataSqlFragmentInvalid:   'errors.metadata.sql_fragment.invalid',
    MetadataSqlFragmentForbidden: 'errors.metadata.sql_fragment.forbidden',

    InputRequired:             'errors.input.required',
    InputInvalid:              'errors.input.invalid',

    DbSqlException:            'errors.db.sql_exception', // passthrough — dialog dedicato
    DbConnection:              'errors.db.connection',
    DbTimeout:                 'errors.db.timeout',

    ServerUnhandled:           'errors.server.unhandled',
    ServerUserCallbackFailed:  'errors.server.user_callback.failed',

    // Reports (Stimulsoft .mrt) — emessi da ReportViewerController / ReportDesignerController
    ReportNotFound:            'errors.report.not_found',
    ReportLoadFailed:          'errors.report.load_failed',
    ReportRenderFailed:        'errors.report.render_failed',

    // Client-only namespace
    ClientUnknown:             'errors.client.unknown',
    ClientPropsBagMalformed:   'errors.client.props_bag.malformed',
    ClientUserCallbackFailed:  'errors.client.user_callback.failed',
    ClientMetadataLookupOrphan:'errors.client.metadata.lookup_orphan',
    ClientMetadataCacheMiss:   'errors.client.metadata.cache_miss',
    ClientMetadataVersionMismatch: 'errors.client.metadata.version_mismatch',
    ClientWindowUnhandled:     'errors.client.window.unhandled',
    ClientPromiseUnhandled:    'errors.client.promise.unhandled',
    ClientHttpUnknown:         'errors.client.http.unknown',

    // Archetype namespace builder
    archetypeInitFailed:  (name: string) => `errors.client.archetype.${name}.init_failed`,
    archetypeRenderFailed:(name: string) => `errors.client.archetype.${name}.render_failed`,
    serviceMethodFailed:  (service: string, method: string) =>
        `errors.client.service.${service}.${method}.failed`,
    componentLifecycleFailed: (component: string, hook: string) =>
        `errors.client.component.${component}.${hook}.failed`,
} as const;
