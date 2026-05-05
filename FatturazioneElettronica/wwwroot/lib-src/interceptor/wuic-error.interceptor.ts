import { Injectable } from '@angular/core';
import {
    HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpErrorResponse,
    HttpInterceptorFn, HttpHandlerFn,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { WuicErrorCodes } from '../exception/WuicErrorCodes';
import { GlobalHandler } from '../handler/GlobalHandler';

/**
 * Normalizes HTTP errors so the GlobalHandler always sees an
 * `errorCode + args + fallbackMessage` envelope.
 *
 * Behavior:
 *  - 4xx/5xx coming from `/api/Meta/*` already use the typed envelope
 *    produced by JsonExceptionFilter — forwarded directly to
 *    GlobalHandler.handleError so the dialog appears even if the
 *    subscribing component swallows the error in its catchError.
 *  - 4xx/5xx from other endpoints (custom controllers, third-party APIs)
 *    are wrapped client-side under `errors.client.http.<status>` so the
 *    GlobalHandler can localize them via wuic_translation.
 *  - 401 is left to AuthExpiredInterceptor (logout/redirect flow).
 *
 * IMPORTANT: this interceptor does NOT swallow errors — after notifying
 * the GlobalHandler it rethrows so existing subscribers' error callbacks
 * still fire (they may close busy spinners, etc).
 */

function processHttpError(req: HttpRequest<any>, err: HttpErrorResponse): HttpErrorResponse {
    // Already typed by the server → notify GlobalHandler directly so the
    // dialog renders even if the subscribing component handles the error
    // in its own catchError.
    if (err.error && typeof err.error === 'object' && 'errorCode' in err.error) {
        try { GlobalHandler.handleErrorStatic({ error: err.error }); } catch { /* noop */ }
        return err;
    }

    // Generic HTTP failure — wrap with a stable code so the
    // GlobalHandler renders a localized dialog instead of the
    // legacy `Error: <fullMethodName>` fallback.
    const wrappedError = {
        errorCode: `errors.client.http.${err.status || 'unknown'}`,
        args: {
            url:        req.urlWithParams || req.url,
            method:     req.method,
            status:     err.status,
            statusText: err.statusText,
        },
        fallbackMessage: typeof err.error === 'string' ? err.error : err.message,
        traceId: err.headers?.get('traceparent') || undefined,
    };
    try { GlobalHandler.handleErrorStatic({ error: wrappedError }); } catch { /* noop */ }
    return new HttpErrorResponse({
        error:      wrappedError,
        headers:    err.headers,
        status:     err.status,
        statusText: err.statusText,
        url:        err.url,
    });
}

/** Functional interceptor — preferred form for Angular 15+ withInterceptors. */
export const wuicErrorInterceptor: HttpInterceptorFn = (req, next: HttpHandlerFn) =>
    next(req).pipe(
        catchError((err: any) => {
            if (!(err instanceof HttpErrorResponse)) return throwError(() => err);
            if (err.status === 401) return throwError(() => err);
            return throwError(() => processHttpError(req, err));
        }),
    );

/** Class interceptor — kept for legacy NgModule consumers. */
@Injectable()
export class WuicErrorInterceptor implements HttpInterceptor {
    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(req).pipe(
            catchError((err: any) => {
                if (!(err instanceof HttpErrorResponse)) return throwError(() => err);
                if (err.status === 401) return throwError(() => err);
                return throwError(() => processHttpError(req, err));
            }),
        );
    }
}
