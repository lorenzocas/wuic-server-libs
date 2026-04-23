import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { MaintenanceService } from './maintenance.service';

/**
 * Watches every HTTP response for the `X-Maintenance: true` header that the
 * IIS maintenance web.config emits while the site is being re-deployed.
 * When seen, triggers `MaintenanceService.trigger()` → show overlay, reload.
 *
 * Note: this does NOT cover Angular lazy-loaded chunks (those use native
 * `import()` and bypass HttpClient). For those, see the `NavigationError`
 * listener in `app.ts`.
 *
 * Also note: Angular exposes the response headers to interceptors only when
 * the fetched resource was served by our backend via HttpClient — static
 * asset loads via <img src> / <script src> tags do NOT pass through here.
 * That is fine because during maintenance the rewrite catches them and
 * either returns HTML (for dynamic imports) or gets noticed on a user click
 * through the router.
 */
export const maintenanceInterceptor: HttpInterceptorFn = (req, next) => {
  const maintenance = inject(MaintenanceService);
  return next(req).pipe(
    tap((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse) {
        const hdr = event.headers?.get?.('X-Maintenance');
        if (hdr && hdr.toLowerCase() === 'true') {
          maintenance.trigger('http-interceptor');
        }
      }
    })
  );
};
