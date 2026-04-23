import { Injectable, signal } from '@angular/core';

/**
 * MaintenanceService — detects the server-side maintenance window and triggers
 * a page reload so the user lands on `/maintenance.html` instead of seeing
 * broken lazy-loaded chunks or stalled navigations.
 *
 * Two signals feed into it:
 *   1. HTTP interceptor (`maintenance.interceptor.ts`) — if ANY response
 *      carries `X-Maintenance: true`, the server is in maintenance mode.
 *   2. Angular Router `NavigationError` listener (wired in app.ts) — if a
 *      lazy-loaded chunk import fails with "Unexpected token '<'" (because
 *      IIS rewrote the .js request to maintenance.html), we assume
 *      maintenance.
 *
 * On either signal we:
 *   - show a small overlay "Aggiornamento in corso, ricarico..." (2s)
 *   - then `location.reload()` → browser does a full-page GET → IIS rewrites
 *     it to /maintenance.html → user sees the friendly maintenance page.
 *
 * Safety: the service keeps a module-level boolean so the reload fires at
 * most once per tab load, even if multiple requests hit the same response
 * within a few ms.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  /** Visible overlay flag (consumed by `<app-maintenance-toast>`). */
  readonly overlayVisible = signal<boolean>(false);

  private alreadyFiring = false;
  private readonly RELOAD_DELAY_MS = 1500;

  /**
   * Called by the HTTP interceptor or the router error listener.
   * Idempotent — multiple calls within the same tab coalesce into a single
   * overlay+reload.
   */
  trigger(reason: string = 'unknown'): void {
    if (this.alreadyFiring) return;
    this.alreadyFiring = true;

    // Only act in the browser — never in SSR/tests
    if (typeof window === 'undefined') return;

    // Silent no-op on already-maintenance URL
    if (window.location.pathname.endsWith('/maintenance.html')) return;

    // Debug log for ops — visible in devtools when reviewing what happened
    console.info('[maintenance] triggered (reason=%s) → reloading in %sms', reason, this.RELOAD_DELAY_MS);

    this.overlayVisible.set(true);
    setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        // unreachable in browsers, but defensive
      }
    }, this.RELOAD_DELAY_MS);
  }
}
