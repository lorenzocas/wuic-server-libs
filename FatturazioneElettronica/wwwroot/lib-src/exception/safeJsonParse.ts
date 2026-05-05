import { WuicClientException } from './WuicClientException';
import { WuicErrorCodes } from './WuicErrorCodes';

/**
 * Replacement for `JSON.parse` at every site that consumes user/metadata
 * data of unknown shape (notably `mc_props_bag`, `md_props_bag`,
 * `CAI_Target_Action_Param_Value`).
 *
 * On success: returns the parsed value.
 * On failure:
 *   - logs a console.warn with context (does NOT throw to keep callers simple),
 *   - notifies via WuicClientException so GlobalHandler can show a localized dialog,
 *   - returns `fallback`.
 *
 * The function never throws — callers can use the return value directly.
 */
export function safeJsonParse<T>(
    raw: unknown,
    fallback: T,
    context: {
        errorCode?: string;
        targetName?: string;
        extra?: Record<string, unknown>;
    } = {}
): T {
    if (raw === null || raw === undefined || raw === '') return fallback;
    if (typeof raw !== 'string') return raw as unknown as T;

    try {
        return JSON.parse(raw) as T;
    } catch (e: any) {
        const errorCode = context.errorCode || WuicErrorCodes.ClientPropsBagMalformed;
        const exc = new WuicClientException(errorCode, {
            ...context.extra,
            parserMessage: e?.message,
            preview: raw.length > 120 ? raw.slice(0, 120) + '…' : raw,
            length: raw.length,
        }, {
            surface: 'service',
            targetName: context.targetName,
            cause: e,
            fallbackMessage: e?.message,
        });

        try { console.warn('[safeJsonParse]', errorCode, exc.args); } catch { /* noop */ }

        // Notify the GlobalHandler asynchronously to avoid disrupting the
        // current call frame. Loaded via dynamic import to keep this util
        // free of cyclic deps with the handler module.
        notifyGlobalHandlerAsync(exc);

        return fallback;
    }
}

function notifyGlobalHandlerAsync(exc: WuicClientException): void {
    if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => emitToGlobalHandler(exc));
    } else if (typeof setTimeout === 'function') {
        setTimeout(() => emitToGlobalHandler(exc), 0);
    }
}

function emitToGlobalHandler(exc: WuicClientException): void {
    try {
        // Lazy require to break the dependency cycle between
        // safeJsonParse → GlobalHandler → CustomException.
        // Keep dynamic import string literal for tree-shaking compatibility.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('../handler/GlobalHandler');
        mod?.GlobalHandler?.emitClientException?.(exc);
    } catch {
        // GlobalHandler not bootstrapped yet (e.g. unit test) — swallow.
    }
}
