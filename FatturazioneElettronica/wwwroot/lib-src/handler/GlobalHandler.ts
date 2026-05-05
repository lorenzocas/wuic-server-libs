import { ErrorHandler, Injector, inject } from "@angular/core";
import { CustomException } from "../class/customException";
import { BehaviorSubject } from "rxjs";
import { WtoolboxService } from "../service/wtoolbox.service";
import { WuicClientException, isWuicClientException } from "../exception/WuicClientException";
import { WuicErrorCodes } from "../exception/WuicErrorCodes";
import { inferTemplateFieldFromBaseClass } from "../service/dynamic-compiler.service";
import { CrashReporterService } from "../service/crash-reporter.service";

/**
 * Normalized context passed to error delegates registered via
 * {@link GlobalHandler.registerDelegate}.
 *
 * Built from any raw error (HttpErrorResponse, Error, WuicClientException,
 * or arbitrary thrown object) so component delegates can do lookups
 * (e.g. `ctx.message.includes('METADATA_DB_EXISTS_CONFIRM_REQUIRED')`)
 * without caring about the envelope shape.
 */
export interface ErrorDelegateContext {
    /** Raw error as received by the GlobalHandler. */
    error: any;
    /** `errorCode` from the typed-exception envelope (e.g. `errors.server.unhandled`). */
    errorCode?: string;
    /** `args` map from the typed-exception envelope. */
    args?: Record<string, unknown>;
    /** Server's `fallbackMessage` (raw, untranslated). */
    fallbackMessage?: string;
    /** Best-effort merged message — concatenates every plausible source
     *  (body.message, body.rootMessage, args.message, fallbackMessage,
     *  err.message) so substring matches work regardless of envelope shape. */
    message: string;
    /** HTTP status code, if the error is an HttpErrorResponse. */
    status?: number;
    /** Request URL, if the error is an HttpErrorResponse. */
    url?: string;
    /** True if the raw error looks like an HttpErrorResponse. */
    isHttpError: boolean;
    /** True if the raw error is a typed `WuicClientException`. */
    isClientException: boolean;
}

/**
 * Delegate function: returns true (sync or via Promise) to suppress the
 * default error dialog. See {@link GlobalHandler.registerDelegate} for the
 * full contract and async semantics.
 */
export type ErrorDelegate = (ctx: ErrorDelegateContext) => boolean | void | Promise<boolean | void>;

/**
 * Options for {@link GlobalHandler.notify}: controls how the error is
 * surfaced to the user (toast vs dialog) and what header/severity to use.
 */
export interface NotifyOptions {
    /** True → render as PrimeNG toast (via WtoolboxService.messageNotificationService).
     *  False/undefined → full dialog flow (handleError path). Default: false. */
    isToast?: boolean;
    /** Toast header text. Default: 'Errore'. (Toast-only.) */
    summary?: string;
    /** Toast severity (PrimeNG). Default: 'error'. (Toast-only.) */
    severity?: 'success' | 'info' | 'warn' | 'error';
    /** Toast lifetime ms. Default: 6000. (Toast-only.) */
    life?: number;
    /** True → bypass registered delegates (rare; default false). */
    skipDelegates?: boolean;
}

function pickCI(obj: any, ...keys: string[]): any {
    if (!obj || typeof obj !== 'object') return undefined;
    const lowerMap: Record<string, any> = {};
    for (const k of Object.keys(obj)) lowerMap[k.toLowerCase()] = obj[k];
    for (const k of keys) {
        const v = lowerMap[k.toLowerCase()];
        if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
}

function tryTranslate(key: string, args?: Record<string, unknown>): string | undefined {
    try {
        const svc: any = (WtoolboxService as any)?.translationService;
        if (svc && typeof svc.instant === 'function') {
            const v = svc.instant(key, args);
            // translation services typically return the key itself when missing
            if (typeof v === 'string' && v && v !== key) {
                // Manual `{name}` placeholder interpolation — the WUIC
                // TranslationManagerService.instant() ignores its second
                // argument and the framework's `format()` helper only
                // supports positional `{0}, {1}` markers. We use named
                // placeholders for readability.
                if (args && typeof args === 'object') {
                    return v.replace(/\{(\w+)\}/g, (m, name) => {
                        const val = (args as any)[name];
                        return val === undefined || val === null ? m : String(val);
                    });
                }
                return v;
            }
        }
    } catch { /* swallow — translation must never throw */ }
    return undefined;
}

function buildSqlPassthroughException(serverArgs: any): CustomException {
    const exc = new CustomException();
    const a = serverArgs || {};

    exc.title = tryTranslate('errors.db.sql_exception.title') || 'Database error';
    // The body is the RAW SQL engine message — NOT translated, it's the
    // most actionable diagnostic for the dev/DBA reading the dialog.
    (exc as any).body = a.sqlMessage;
    (exc as any).kind = 'sql-passthrough';
    (exc as any).sqlDetails = {
        number:    a.sqlNumber,
        state:     a.sqlState,
        class:     a.sqlClass,
        line:      a.sqlLineNumber,
        procedure: a.sqlProcedure,
        server:    a.sqlServer,
        database:  a.sqlDatabase,
    };
    (exc as any).query           = a.query;
    (exc as any).parameters      = a.parameters;
    (exc as any).innerExceptions = a.innerExceptions;
    exc.stackTrace               = a.stackTrace;

    // Section labels (translated separately; the SQL message itself is not).
    (exc as any).labels = {
        stack:  tryTranslate('errors.db.sql_exception.section.stack')  || 'Stack trace',
        query:  tryTranslate('errors.db.sql_exception.section.query')  || 'Executed query',
        params: tryTranslate('errors.db.sql_exception.section.params') || 'Parameters',
        copy:   tryTranslate('errors.db.sql_exception.action.copy')    || 'Copy',
    };
    return exc;
}

function buildTypedException(errorCode: string, args?: Record<string, unknown>, fallbackMessage?: string): CustomException {
    const exc = new CustomException();
    exc.title = tryTranslate(errorCode, args)
              || fallbackMessage
              || errorCode;
    (exc as any).errorCode = errorCode;
    (exc as any).args = args;
    return exc;
}

export class GlobalHandler implements ErrorHandler {
    public static messageNotification: BehaviorSubject<{ show: boolean, exception: CustomException }>
        = new BehaviorSubject({ show: false, exception: null });

    /**
     * Flag globale "backend in restart" — quando true, `handleError` non
     * mostra dialog/toast di errore e non inoltra al CrashReporter. Acceso
     * da `app-settings-editor.component.ts:saveAndApply` mentre l'overlay
     * "Riavvio in corso" e' visibile (poll-fail → bump → poll-up). Spento
     * appena il nuovo worker risponde.
     *
     * Razionale: durante il restart il worker e' down per ~5-30s. Tutte le
     * chiamate HTTP correnti (notification polling, crashForward, lazy
     * fetches) falliscono con `ERR_CONNECTION_REFUSED`. Ogni fallimento
     * fa partire `handleError` → dialog "Errore HTTP 0" sotto il dialog
     * "Riavvio in corso". Brutto e fuorviante per l'utente che sta
     * legittimamente aspettando il restart. Soppresso fino a fine restart.
     */
    private static _restartInProgress = false;
    public static setRestartInProgress(value: boolean): void {
        GlobalHandler._restartInProgress = !!value;
        // Espone la flag come `globalThis.__wuicGlobalHandler.isRestartInProgress()`
        // cosi' il `CrashReporterService` (e altri consumer non DI) puo'
        // controllarla senza importare GlobalHandler (eviterebbe cyclic dep).
        try {
            const g = globalThis as { __wuicGlobalHandler?: { isRestartInProgress: () => boolean } };
            g.__wuicGlobalHandler = g.__wuicGlobalHandler || { isRestartInProgress: () => GlobalHandler._restartInProgress };
        } catch { /* noop */ }
    }
    public static isRestartInProgress(): boolean {
        return GlobalHandler._restartInProgress;
    }

    /**
     * Auto-bootstrap del CrashReporterService al primo istanziamento del
     * GlobalHandler (registrato dal consumer come `{ provide: ErrorHandler,
     * useClass: GlobalHandler }` → eager-instantiated dal DI Angular al boot).
     *
     * Bug fix 2026-04-28: prima nessun consumer (WuicTest, WuicDemo, CrmApp)
     * chiamava `CrashReporterService.init()` esplicitamente → l'`enabled`
     * restava false → `(globalThis as any).__wuicCrashReporter` mai assegnato
     * → `handleError` saltava silenziosamente il forward → tutti i crash JS
     * (incluse le `TypeError` da librerie 3p come Stimulsoft viewer)
     * non arrivavano mai a `MetaService.crashForward` → e di conseguenza
     * mai al receiver `errors.wuic-framework.com`. Visibile anche dal
     * Network panel browser: nessuna POST a `crashForward` dopo un errore.
     *
     * Centralizzare il bootstrap qui ha questi vantaggi:
     *   1. Niente codice consumer-side richiesto — la lib si auto-attiva.
     *   2. Garantisce che `__wuicCrashReporter` sia popolato PRIMA che
     *      `handleError` lo legga (stesso ciclo di costruzione DI).
     *   3. Guard `_bootstrapAttempted`: niente double-init se per qualche
     *      ragione GlobalHandler venisse istanziato N volte (es.
     *      `handleErrorStatic` ne crea uno transient per request).
     */
    private static _bootstrapAttempted = false;

    constructor() {
        if (GlobalHandler._bootstrapAttempted) return;
        GlobalHandler._bootstrapAttempted = true;
        try {
            // `inject()` qui e' opzionale: se la lib viene usata in un test
            // o in un context senza injector standard, falliamo silent.
            const reporter = inject(CrashReporterService, { optional: true });
            if (reporter && typeof reporter.init === 'function') {
                // Fire-and-forget: l'init e' async (probe `getCrashReportingConfig`)
                // ma noi vogliamo solo kickoff-arlo, non bloccare la
                // costruzione del GlobalHandler.
                void reporter.init();
            }
        } catch { /* never amplify boot errors */ }
    }

    /**
     * Static dispatcher — lets framework code that doesn't have access to
     * the Angular ErrorHandler instance (e.g. the HTTP interceptor)
     * trigger the same dialog flow. Internally creates a transient
     * GlobalHandler to honour the same branch ordering as the DI version.
     */
    public static handleErrorStatic(e: any): void {
        try { new GlobalHandler().handleError(e); } catch { /* noop */ }
    }

    /**
     * Entry point used by safeJsonParse / wrapClient helpers when they
     * decide to notify a typed exception without throwing it through the
     * Angular zone (e.g. swallowed lifecycle errors).
     */
    public static emitClientException(exc: WuicClientException): void {
        const cust = buildTypedException(exc.errorCode, exc.args, exc.fallbackMessage);
        if (exc.cause) {
            (cust as any).cause = exc.cause;
        }
        try { console.warn('[WuicClientException]', exc.errorCode, exc.args, exc.cause); }
        catch { /* noop */ }
        GlobalHandler.messageNotification.next({ show: true, exception: cust });
    }

    /**
     * Component-friendly entry point: take an error and surface it to the
     * user as a TOAST (default) or DIALOG, choosing the right message
     * automatically from the typed-exception envelope.
     *
     * Use case: components doing their own try/catch on HTTP calls (e.g.
     * pivot-builder, view-builder) want to show a contextual error in a
     * PrimeNG toast — they used to do
     *   `messageService.add({ severity:'error', detail: err.message })`
     * which prints the useless "Http failure response for X: 500 OK".
     * With `notify(err, { isToast:true })` the toast shows the SERVER's
     * `fallbackMessage` / `args.message` from the JsonExceptionFilter envelope.
     *
     * Also runs the registered delegates first, so a marker-intercepting
     * delegate (e.g. wizard's METADATA_DB_EXISTS) can take over and
     * suppress the toast/dialog if it handles the error itself.
     */
    public static notify(error: any, opts: NotifyOptions = {}): void {
        const ctx = GlobalHandler.extractErrorContext(error);

        if (!opts.skipDelegates && GlobalHandler.delegates.length > 0) {
            if (GlobalHandler.dispatchToDelegates(ctx)) return;
        }

        if (opts.isToast) {
            try {
                const ms: any = (WtoolboxService as any).messageNotificationService;
                if (ms?.add) {
                    ms.add({
                        severity: opts.severity || 'error',
                        summary:  opts.summary  || 'Errore',
                        detail:   ctx.message,
                        life:     opts.life     || 6000,
                    });
                    return;
                }
            } catch { /* fallthrough to dialog */ }
        }

        // Fallback: full dialog flow (rispetta tutte le branch del handleError)
        GlobalHandler.handleErrorStatic(error);
    }

    /**
     * Optional bootstrap: install window/promise handlers that wrap any
     * native unhandled error into a typed WuicClientException. Call once
     * from app.module / main.ts of the consumer app.
     *
     * Also exposes `window.__wuicExposeLastException = true` so
     * WuicClientException stores the last instance on window for tests.
     */
    public static installWindowHandlers(opts: { exposeForTests?: boolean } = {}): void {
        if (typeof window === 'undefined') return;
        if ((window as any).__wuicWindowHandlersInstalled) return;
        (window as any).__wuicWindowHandlersInstalled = true;
        if (opts.exposeForTests) (window as any).__wuicExposeLastException = true;

        window.addEventListener('error', (ev: ErrorEvent) => {
            // Skip if the error is already a typed exception we threw — Angular
            // ErrorHandler will receive it via handleError(), no need to double-emit.
            if (isWuicClientException((ev as any).error)) return;

            const exc = new WuicClientException(WuicErrorCodes.ClientWindowUnhandled, {
                source:  ev.filename,
                line:    ev.lineno,
                column:  ev.colno,
                message: typeof ev.message === 'string' ? ev.message.slice(0, 500) : undefined,
            }, { surface: 'window', cause: (ev as any).error });
            GlobalHandler.emitClientException(exc);
        });

        window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
            const reason: any = (ev as any).reason;
            if (isWuicClientException(reason)) return;

            const exc = new WuicClientException(WuicErrorCodes.ClientPromiseUnhandled, {
                reason: typeof reason === 'string'
                    ? reason.slice(0, 500)
                    : (reason?.message || String(reason)).slice(0, 500),
            }, { surface: 'window', cause: reason });
            GlobalHandler.emitClientException(exc);
        });
    }

    // ─── Delegate registry (component-level error interception) ────────
    // Components can register a delegate to intercept errors BEFORE the
    // default dialog flow. Use case: first-run-wizard wants to recognize
    // `METADATA_DB_EXISTS_CONFIRM_REQUIRED` and show a custom prompt
    // instead of the localized error dialog.
    //
    // Delegate contract: SYNC return boolean. true → suppress default
    // dialog (you handled it). false/undefined → continue normal flow.
    // For async logic (e.g. await promptDialog), return true immediately
    // and run the async work fire-and-forget (the default dialog is
    // suppressed; you're now responsible for the entire UX).
    private static delegates: Array<{ fn: ErrorDelegate, priority: number, id: number }> = [];
    private static nextDelegateId = 0;

    /**
     * Register a delegate that intercepts errors before the default dialog.
     * Higher priority delegates are called first; first one returning true
     * suppresses the default dialog and stops further delegate calls.
     * @returns disposer function — call it to unregister (e.g. ngOnDestroy).
     */
    public static registerDelegate(
        fn: ErrorDelegate,
        opts: { priority?: number } = {},
    ): () => void {
        const id = ++GlobalHandler.nextDelegateId;
        const priority = opts.priority ?? 0;
        GlobalHandler.delegates.push({ fn, priority, id });
        // Sort desc so higher priority is dispatched first.
        GlobalHandler.delegates.sort((a, b) => b.priority - a.priority);
        return () => {
            GlobalHandler.delegates = GlobalHandler.delegates.filter(d => d.id !== id);
        };
    }

    /** Build a normalized context from a raw error (HttpErrorResponse, Error,
     *  WuicClientException, or anything else with .error).  */
    private static extractErrorContext(e: any): ErrorDelegateContext {
        const body = e?.error;
        const isHttp = !!(e && (typeof e.status === 'number' || e?.url || e?.headers));
        const isClientExc = isWuicClientException(e) || isWuicClientException(e?.rejection);

        let errorCode: string | undefined;
        let args: Record<string, unknown> | undefined;
        let fallbackMessage: string | undefined;
        if (body && typeof body === 'object') {
            if (typeof body.errorCode === 'string') errorCode = body.errorCode;
            if (body.args && typeof body.args === 'object') args = body.args as Record<string, unknown>;
            if (typeof body.fallbackMessage === 'string') fallbackMessage = body.fallbackMessage;
        }
        if (!errorCode && isClientExc) {
            const exc = (isWuicClientException(e) ? e : e?.rejection) as WuicClientException;
            errorCode = exc.errorCode;
            args = exc.args ?? args;
            fallbackMessage = exc.fallbackMessage ?? fallbackMessage;
        }

        // Compose a best-effort message — concatenate every plausible source
        // so substring lookups (e.g. `includes('METADATA_DB_EXISTS_...')`) work
        // regardless of which envelope shape the server emitted.
        const parts: string[] = [];
        if (typeof body === 'string' && body.trim()) parts.push(body);
        if (body?.message) parts.push(String(body.message));
        if (body?.error && typeof body.error === 'string') parts.push(body.error);
        if (body?.title) parts.push(String(body.title));
        if (body?.rootMessage) parts.push(String(body.rootMessage));
        if (args && typeof (args as any).message === 'string') parts.push(String((args as any).message));
        if (fallbackMessage) parts.push(fallbackMessage);
        if (e?.message) parts.push(String(e.message));
        const dedup = Array.from(new Set(parts.filter(s => s && s.trim())));

        return {
            error: e,
            errorCode,
            args,
            fallbackMessage,
            message: dedup.join(' | ') || 'Unknown error',
            status: typeof e?.status === 'number' ? e.status : undefined,
            url: typeof e?.url === 'string' ? e.url : undefined,
            isHttpError: isHttp,
            isClientException: isClientExc,
        };
    }

    /** Iterate delegates; first one returning true suppresses default flow.
     *  Async delegates: their Promise is dispatched fire-and-forget; the
     *  return value seen here is `Promise` (truthy), which we treat as
     *  "delegate took over" → suppress default dialog. */
    private static dispatchToDelegates(ctx: ErrorDelegateContext): boolean {
        for (const d of GlobalHandler.delegates) {
            let result: any;
            try { result = d.fn(ctx); }
            catch (delegateErr) {
                try { console.error('[GlobalHandler] delegate threw, ignored:', delegateErr); } catch { /* noop */ }
                continue;
            }
            if (result === true) return true;
            if (result && typeof result.then === 'function') {
                // Async delegate — treat as taking over (suppress default).
                // It must handle its own error UI completely.
                Promise.resolve(result).catch(promiseErr => {
                    try { console.error('[GlobalHandler] async delegate rejected:', promiseErr); } catch { /* noop */ }
                });
                return true;
            }
        }
        return false;
    }

    handleError(e: any) {
        try {
            // Branch -4 (restart-in-progress): durante il restart del backend
            // (overlay "Riavvio in corso" attivo) i call HTTP falliscono in
            // massa con ERR_CONNECTION_REFUSED. Sopprimo dialog + crash
            // forward per non sovrapporre popup di errore al monitor di
            // restart. Il flag viene gestito da app-settings-editor.component
            // tra `setRestartInProgress(true)` (pre-StopApplication) e
            // `setRestartInProgress(false)` (post-health-check OK).
            if (GlobalHandler._restartInProgress) {
                return;
            }

            // Branch -2 (dedup): the typed-exception flow already surfaced
            // a localized dialog for this error — Zone is just re-delivering
            // the original raw throw via its unhandled-rejection hook.
            // Dropping it here prevents the typed dialog from being
            // overwritten by the errors.client.unknown fallback.
            const reason: any = e?.rejection ?? e;
            if (reason && (reason.__wuicHandled === true || reason?.cause?.__wuicHandled === true)) {
                return;
            }

            // Branch -3 (component delegates): registered delegates get a
            // chance to handle this error BEFORE the default dialog. If any
            // returns true (sync or async), we stop here.
            if (GlobalHandler.delegates.length > 0) {
                const ctx = GlobalHandler.extractErrorContext(e);
                if (GlobalHandler.dispatchToDelegates(ctx)) {
                    // Mark as handled so subsequent zone re-deliveries
                    // (Branch -2) skip too.
                    try {
                        if (e && typeof e === 'object') (e as any).__wuicHandled = true;
                        if (reason && typeof reason === 'object') (reason as any).__wuicHandled = true;
                    } catch { /* noop */ }
                    return;
                }
            }

            // Skill crash-reporting Commit 8: forward al CrashReporterService.
            // Lazy-import + fail-quiet — il crash reporter e' opt-in per GDPR
            // e potrebbe non essere registrato (Enabled=false in appsettings).
            // Fatto PRIMA del display dialog cosi' anche errori che vengono
            // poi tradotti/silenziati nel dialog vengono inviati per il triage.
            try {
                const reporter = (globalThis as any).__wuicCrashReporter;
                if (reporter && typeof reporter.report === 'function') {
                    reporter.report(reason);
                }
            } catch { /* never amplify */ }

            // Branch -1 (top priority): SQL passthrough — full payload, NO translation
            const isSqlPassthrough =
                e?.error?.errorCode === WuicErrorCodes.DbSqlException ||
                e?.error?.args?.passthrough === true;
            if (isSqlPassthrough) {
                const cust = buildSqlPassthroughException(e.error.args);
                console.error(e);
                GlobalHandler.messageNotification.next({ show: true, exception: cust });
                return;
            }

            // Branch 0: typed client exception (thrown locally)
            if (isWuicClientException(e)) {
                GlobalHandler.emitClientException(e as WuicClientException);
                return;
            }
            if (isWuicClientException(e?.rejection)) {
                GlobalHandler.emitClientException(e.rejection as WuicClientException);
                return;
            }

            // Branch 1: server payload with new typed envelope
            if (typeof e?.error?.errorCode === 'string') {
                // Merge traceId INTO args cosi' il template di traduzione che
                // referenzia `{traceId}` (es. errors.server.unhandled "Codice:
                // {traceId}") viene interpolato correttamente. Senza il merge
                // il placeholder rimaneva letterale ("Codice: {traceId}").
                const argsWithTrace = e.error.traceId
                    ? { ...(e.error.args || {}), traceId: e.error.traceId }
                    : e.error.args;
                const cust = buildTypedException(
                    e.error.errorCode,
                    argsWithTrace,
                    e.error.fallbackMessage,
                );
                if (e.error.traceId) (cust as any).traceId = e.error.traceId;
                console.error(e);
                GlobalHandler.messageNotification.next({ show: true, exception: cust });
                return;
            }

            // Branch 1.4: Angular Router NG04002 — "Cannot match any routes".
            // Quando l'utente naviga a un URL hash che non e' definito nel
            // RouteConfig (es. `/<boardroute>` invece di `/<route>/list`, o
            // typo nell'URL), Angular Router lancia `Error: NG04002: Cannot
            // match any routes. URL Segment: '<segment>'`. Senza un branch
            // dedicato finisce nel fallback `errors.client.unknown` con stack
            // completo + hash interni Angular minified — UX pessima.
            const errMsg0 = (typeof e?.message === 'string' ? e.message : '') as string;
            const ng04002Match = errMsg0.match(/NG04002[^']*'([^']+)'/);
            if (ng04002Match) {
                const segment = ng04002Match[1] || '<unknown>';
                const cust = buildTypedException(
                    WuicErrorCodes.MetadataRouteNotFound,
                    {
                        route:         segment,
                        innerName:     'NG04002',
                        innerMessage:  errMsg0.slice(0, 500),
                    },
                    `Route not found: '${segment}'`,
                );
                console.warn(`[GlobalHandler] route not found (NG04002): '${segment}'`);
                GlobalHandler.messageNotification.next({ show: true, exception: cust });
                return;
            }

            // Branch 1.5: dynamic-template runtime expression error.
            // When a metadata-driven template (md_rowTemplate, md_edit_template,
            // mc_ui_grid_column_data_template, mc_button_template, ...) compiles
            // OK but its expressions throw at runtime (e.g. `{{ rowData.foo.bar }}`
            // when `foo` is undefined → "Cannot read properties of undefined
            // reading 'bar'"), the error reaches handleError as a raw TypeError.
            // The compile-time guard in DynamicCompilerService.compile only
            // catches parser failures (malformed HTML) — it has no insight into
            // runtime evaluation. Detect via stack heuristic and tag with the
            // typed errors.metadata.props_bag.malformed envelope so the user
            // sees a localized dialog with the inner cause.
            const stackText = (typeof e?.stack === 'string' ? e.stack : '') as string;
            const errMsg = (typeof e?.message === 'string' ? e.message : '') as string;
            // Identifiers added by DynamicCompilerService.compile to subclass
            // names: `Dynamic_<baseClassName>_<n>` (see line ~180 of that
            // service). Stack frames produced by Ivy's compiled view function
            // include the component class name → easy to match.
            const isDynamicTemplateRuntime =
                stackText.includes('Dynamic_DynamicRowTemplateComponent') ||
                stackText.includes('Dynamic_DynamicGenericTemplate') ||
                stackText.includes('Dynamic_DynamicFieldTemplate') ||
                stackText.includes('Dynamic_DynamicFormTemplate') ||
                stackText.includes('Dynamic_DynamicCardTemplate') ||
                stackText.includes('Dynamic_DynamicRepeaterTemplate') ||
                /\bat Dynamic_/.test(stackText);
            if (isDynamicTemplateRuntime) {
                // Parse the compiled component class name to infer which
                // metadata field supplied the template (best-effort —
                // 1:1 mapping when the call site at compile time used
                // the conventional baseClass).
                const classMatch = stackText.match(/Dynamic_([A-Za-z0-9_]+)_(?:\d+)/);
                const baseClassHint = classMatch ? classMatch[1] : 'DynamicTemplate';
                const templateField = inferTemplateFieldFromBaseClass(baseClassHint);
                const cust = buildTypedException(
                    WuicErrorCodes.MetadataTemplateInvalid,
                    {
                        templateField,
                        route:         '<runtime>',
                        phase:         'runtime',
                        parserMessage: errMsg.slice(0, 500),
                        baseClass:     baseClassHint,
                        innerName:     e?.name,
                        innerMessage:  errMsg.slice(0, 500),
                    },
                    `Template '${templateField}' runtime: ${errMsg.slice(0, 200)}`,
                );
                console.error(`[GlobalHandler] template '${templateField}' runtime expression FAILED:`, errMsg);
                GlobalHandler.messageNotification.next({ show: true, exception: cust });
                return;
            }

            // Branch 2 (legacy): pre-typed-envelope server payloads.
            // Kept for back-compat with endpoints not yet migrated.
            // @deprecated remove once full server migration is verified.
            this.handleLegacyError(e);
        } catch (innerHandlerError) {
            // The handler itself must never crash. Last-resort fallback.
            try { console.error('[GlobalHandler] handler crashed', innerHandlerError, 'while processing', e); }
            catch { /* noop */ }
            const cust = buildTypedException(WuicErrorCodes.ClientUnknown, {
                stage: 'handler',
                handlerError: (innerHandlerError as any)?.message,
            });
            GlobalHandler.messageNotification.next({ show: true, exception: cust });
        } finally {
            WtoolboxService.isBusy.next(false);
        }
    }

    /**
     * @deprecated Pre-typed-envelope branches. Remove once server migration
     * is complete — kept to avoid regressing payloads still produced by
     * controllers/services not yet routed through MetaExceptionTranslator.
     */
    private handleLegacyError(e: any): void {
        let exc: CustomException;

        // Skill crash-reporting Commit 9b (Opzione B): generic HTTP/runtime
        // error fallbacks. Coprono errori che NON hanno il typed envelope
        // (chiamate a endpoint non-AsmxProxy: OAuth, file upload custom,
        // third-party APIs). Pesco una traduzione friendly da `error.<...>`
        // PRIMA di scendere nel parsing legacy, cosi' l'utente vede sempre
        // un messaggio user-readable invece di stringhe raw o status numerici.
        const httpStatus: number | undefined = (typeof e?.status === 'number')
            ? e.status
            : (typeof e?.error?.status === 'number' ? e.error.status : undefined);
        const isTimeout =
            (e?.name === 'TimeoutError') ||
            (typeof e?.message === 'string' && /timeout/i.test(e.message)) ||
            (httpStatus === 0 && typeof e?.message === 'string' && /timeout|aborted/i.test(e.message));

        let genericKey: string | undefined;
        if (isTimeout) genericKey = 'error.timeout.user_message';
        else if (httpStatus === 401) genericKey = 'error.http_401.user_message';
        else if (httpStatus === 403) genericKey = 'error.http_403.user_message';
        else if (httpStatus === 404) genericKey = 'error.http_404.user_message';
        else if (httpStatus === 503) genericKey = 'error.http_503.user_message';
        else if (typeof httpStatus === 'number' && httpStatus >= 500) genericKey = 'error.http_500.user_message';

        if (genericKey) {
            exc = new CustomException();
            exc.title = tryTranslate(genericKey) || genericKey;
            // Compose a 1-line technicalSummary so support has something to grep
            // even with minimized runtime: METHOD URL → STATUS.
            const method = String(e?.method || e?.error?.method || '').toUpperCase();
            const url = String(e?.url || e?.error?.url || '');
            if (method || url || httpStatus !== undefined) {
                exc.stackTrace = `${method} ${url}${httpStatus !== undefined ? ` → HTTP ${httpStatus}` : ''}`.trim();
            }
            // Preserve any backend stack/correlation hint if present (folded
            // into stackTrace alongside the request line so the dialog's
            // expandable section shows everything).
            const backendStack = pickCI(e?.error || {}, 'stackTrace', 'StackTraceString', 'stack');
            if (backendStack) exc.stackTrace = `${exc.stackTrace || ''}\n${backendStack}`.trim();
            const correlation = e?.headers?.get?.('X-Request-Id') || e?.error?.traceId;
            if (correlation) (exc as any).traceId = correlation;
            console.error(`[GlobalHandler] generic ${genericKey}`, e);
            GlobalHandler.messageNotification.next({ show: true, exception: exc });
            return;
        }

        if (e.error) {
            const classNameVal = pickCI(e.error, 'ClassName');
            const rootTypeVal = pickCI(e.error, 'rootType');
            const isJsonExceptionClass = typeof classNameVal === 'string' && classNameVal === 'Newtonsoft.Json.JsonException';
            const isJsonExceptionRoot = typeof rootTypeVal === 'string' && rootTypeVal === 'Newtonsoft.Json.JsonException';
            if (isJsonExceptionClass) {
                const msgField = pickCI(e.error, 'Message');
                try {
                    const parsed = JSON.parse(msgField);
                    const exData = pickCI(parsed, 'exceptionData');
                    exc = exData as CustomException;
                } catch {
                    exc = new CustomException();
                    exc.title = typeof msgField === 'string' ? msgField : `Error: ${pickCI(e.error, 'fullMethodName') || ''}`;
                }
                console.error(exc);

                GlobalHandler.messageNotification.next({ show: true, exception: exc });
            } else if (isJsonExceptionRoot) {
                exc = new CustomException();

                const rootMsg = pickCI(e.error, 'rootMessage');
                const outerMsg = pickCI(e.error, 'Message');
                const stackStr = pickCI(e.error, 'stackTrace', 'StackTraceString', 'error') || '';
                if (rootMsg) {
                    try {
                        const jsonErr = JSON.parse(rootMsg);
                        const exData = pickCI(jsonErr, 'exceptionData');
                        const titleFromExData = exData ? pickCI(exData, 'title') : undefined;
                        const msgText = titleFromExData || pickCI(jsonErr, 'Message');
                        if (msgText) {
                            exc.title = msgText;
                            exc.stackTrace = `${outerMsg || ''}. Stack:  ${stackStr}`;
                            console.error(e);
                        } else {
                            exc.title = tryTranslate('error.generic.user_message') || `Error: ${pickCI(e.error, 'fullMethodName') || ''}`;
                            exc.stackTrace = `${outerMsg || ''}. Stack:  ${stackStr}`;
                            console.error(e);
                        }
                    } catch (error) {
                        exc.title = tryTranslate('error.generic.user_message') || `Error: ${pickCI(e.error, 'fullMethodName') || ''}`;
                        exc.stackTrace = `${outerMsg || ''}. Stack:  ${stackStr}`;
                        console.error(e);
                    }
                } else {
                    exc.title = tryTranslate('error.generic.user_message') || `Error: ${pickCI(e.error, 'fullMethodName') || ''}`;
                    exc.stackTrace = `${outerMsg || ''}. Stack:  ${stackStr}`;
                    console.error(e);
                }

                GlobalHandler.messageNotification.next({ show: true, exception: exc });
            } else {
                exc = new CustomException();
                exc.title = pickCI(e.error, 'rootMessage', 'Message', 'text');
                exc.stackTrace = pickCI(e.error, 'StackTraceString', 'stackTrace', 'error');
                console.error(exc);

                GlobalHandler.messageNotification.next({ show: true, exception: exc });
            }
        } else {
            exc = new CustomException();
            exc.title = e.message;
            exc.stackTrace = e.stack;
            exc.code = e.code;
            console.error(e);

            if (e.code == -100) {
                // intentional silent — keep behavior
            } else {
                // Branch 3 fallback: pack as ClientUnknown so we still surface a
                // typed envelope client-side instead of a raw `e.message`.
                const cust = buildTypedException(WuicErrorCodes.ClientUnknown, {
                    name: e?.name,
                    message: typeof e?.message === 'string' ? e.message.slice(0, 500) : undefined,
                });
                cust.stackTrace = e?.stack;
                cust.code = e?.code;
                GlobalHandler.messageNotification.next({ show: true, exception: cust });
            }
        }
    }
}
