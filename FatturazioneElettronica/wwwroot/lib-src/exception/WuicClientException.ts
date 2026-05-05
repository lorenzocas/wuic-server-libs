/**
 * Typed exception thrown by services / components / archetypes of the
 * framework. Caught by GlobalHandler.handleError and rendered as a
 * localized dialog via TranslationManagerService.instant('errors.' + code, args).
 *
 * Always prefer this over `throw new Error('...')` for any error meant to
 * be shown to the user. The raw Error is reserved for genuinely unexpected
 * runtime failures and is wrapped by GlobalHandler under
 * `errors.client.unknown` as a safety net.
 */
export type WuicClientSurface =
    | 'service'
    | 'component'
    | 'archetype'
    | 'callback'
    | 'window'
    | 'http';

export class WuicClientException extends Error {
    public readonly errorCode: string;
    public readonly args: Record<string, unknown>;
    public readonly surface: WuicClientSurface;
    public readonly targetName?: string;
    public readonly fallbackMessage?: string;
    public override readonly cause?: unknown;

    constructor(
        errorCode: string,
        args: Record<string, unknown> = {},
        opts: {
            surface?: WuicClientSurface;
            targetName?: string;
            fallbackMessage?: string;
            cause?: unknown;
        } = {}
    ) {
        super(opts.fallbackMessage || errorCode);
        this.name = 'WuicClientException';
        this.errorCode = errorCode;
        this.args = args || {};
        this.surface = opts.surface || 'service';
        this.targetName = opts.targetName;
        this.fallbackMessage = opts.fallbackMessage;
        this.cause = opts.cause;

        // Preserve test/debug visibility: tests inspect the last typed
        // exception via window.__lastWuicException without needing console
        // parsing. Gated to non-production through a global flag set at
        // bootstrap (see GlobalHandler).
        if (typeof window !== 'undefined' && (window as any).__wuicExposeLastException) {
            (window as any).__lastWuicException = this;
        }
    }
}

export function isWuicClientException(e: unknown): e is WuicClientException {
    return !!e && (e as any).name === 'WuicClientException' && typeof (e as any).errorCode === 'string';
}
