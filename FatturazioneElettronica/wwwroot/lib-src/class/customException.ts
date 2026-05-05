export class CustomException {
    title: string;
    stackTrace: string;
    query: string;
    code: number;

    /**
     * Discriminator used by dialog consumers to pick the layout:
     *  - undefined / 'plain': legacy single-message dialog
     *  - 'sql-passthrough': SQL passthrough — body + expandable Stack/Query/Parameters
     */
    kind?: 'plain' | 'sql-passthrough';

    /** Free-form body text shown under the title (e.g. raw SQL engine message — NOT translated). */
    body?: string;

    /** Stable error code for the new typed envelope (server + client). */
    errorCode?: string;

    /** Structured args used to fill placeholders in the localized title. */
    args?: Record<string, unknown>;

    /** Distributed trace id propagated from the server via Activity.Current?.TraceId. */
    traceId?: string;

    /** Inner cause for client-side typed exceptions; left undefined in production. */
    cause?: unknown;

    // ----- Fields populated only when kind === 'sql-passthrough' -----
    sqlDetails?: {
        number?: number; state?: number; class?: number;
        line?: number; procedure?: string; server?: string; database?: string;
    };
    parameters?: Record<string, unknown>;
    innerExceptions?: { type?: string; message?: string }[];
    /** Localized labels for the dialog sections (so the dialog template stays language-agnostic). */
    labels?: { stack?: string; query?: string; params?: string; copy?: string };
}
