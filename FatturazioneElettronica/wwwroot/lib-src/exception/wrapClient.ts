import { WuicClientException, WuicClientSurface } from './WuicClientException';
import { WuicErrorCodes } from './WuicErrorCodes';

/**
 * Wrap helpers that turn raw runtime errors into typed
 * <see cref="WuicClientException"/> instances. Use them at the boundary of
 * services / component lifecycles / metadata-driven user callbacks so the
 * GlobalHandler always receives a typed exception with a stable errorCode
 * instead of a generic `Error('...')`.
 *
 * Wrapping rules:
 * - If the inner function already throws a WuicClientException, rethrow
 *   as-is (do not double-wrap).
 * - Otherwise wrap into a new exception with the configured errorCode +
 *   surface + targetName, attaching the original error as `cause`.
 * - Async / Promise-returning functions: wrap the rejection branch.
 */

interface WrapOptions {
    errorCode: string;
    surface: WuicClientSurface;
    targetName?: string;
    extraArgs?: Record<string, unknown>;
    /** When true, swallow the exception after notifying. Default: false (rethrow). */
    swallow?: boolean;
}

export function wrapSync<T>(fn: () => T, opts: WrapOptions): T {
    try {
        return fn();
    } catch (e: any) {
        const exc = toWuicClient(e, opts);
        if (opts.swallow) {
            // Notification path — caller decided this error must not bubble.
            // We still surface to console + GlobalHandler.
            void exc;
            return undefined as unknown as T;
        }
        throw exc;
    }
}

export async function wrapAsync<T>(fn: () => Promise<T>, opts: WrapOptions): Promise<T> {
    try {
        return await fn();
    } catch (e: any) {
        const exc = toWuicClient(e, opts);
        if (opts.swallow) return undefined as unknown as T;
        throw exc;
    }
}

/** Wrap a service method: errorCode = errors.client.service.<service>.<method>.failed */
export function wrapServiceMethod<T>(
    serviceName: string,
    methodName: string,
    fn: () => T,
    extraArgs?: Record<string, unknown>
): T {
    return wrapSync(fn, {
        errorCode:  WuicErrorCodes.serviceMethodFailed(serviceName, methodName),
        surface:    'service',
        targetName: `${serviceName}.${methodName}`,
        extraArgs,
    });
}

/** Wrap a component lifecycle hook (ngOnInit, processData, render, ...) */
export function wrapComponentLifecycle<T>(
    componentName: string,
    hookName: string,
    fn: () => T,
    extraArgs?: Record<string, unknown>
): T {
    return wrapSync(fn, {
        errorCode:  WuicErrorCodes.componentLifecycleFailed(componentName, hookName),
        surface:    'component',
        targetName: `${componentName}#${hookName}`,
        extraArgs,
        swallow:    true, // a broken lifecycle should NOT crash the host view
    });
}

/** Wrap a metadata-driven user callback (DynamicCompilerService eval). */
export function wrapUserCallback<T>(
    callbackName: string,
    fn: () => T,
    extraArgs?: Record<string, unknown>
): T {
    return wrapSync(fn, {
        errorCode:  WuicErrorCodes.ClientUserCallbackFailed,
        surface:    'callback',
        targetName: callbackName,
        extraArgs:  { callbackName, ...extraArgs },
        swallow:    true, // a broken converter must not freeze the grid
    });
}

function toWuicClient(e: any, opts: WrapOptions): WuicClientException {
    if (e instanceof WuicClientException) return e;
    return new WuicClientException(opts.errorCode, {
        ...opts.extraArgs,
        innerName:    e?.name,
        innerMessage: typeof e?.message === 'string' ? e.message.slice(0, 500) : undefined,
    }, {
        surface:    opts.surface,
        targetName: opts.targetName,
        cause:      e,
        fallbackMessage: e?.message,
    });
}
