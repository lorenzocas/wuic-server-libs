import { Injectable, NgZone, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { isWuicClientException, WuicClientException } from '../exception/WuicClientException';

// Skill crash-reporting Commit 8b (M3 client soft-drop): prefix di errorCode
// che vengono droppati lato browser PRIMA di qualsiasi POST. Match per prefix
// (no regex). Stessa lista del lato server (`CrashReportingService._softDropPrefixes`)
// — devono restare in sync.
const SOFT_DROP_PREFIXES = [
  'errors.client.user_callback.',
  'errors.input.required',
  'errors.input.invalid',
  'errors.auth.unauthenticated',
  'errors.auth.unauthorized',
  'errors.auth.operation_disabled',
  'errors.auth.cookie_malformed',
];

function isSoftDropped(errorCode: string | undefined | null): boolean {
  if (!errorCode) return false;
  for (const p of SOFT_DROP_PREFIXES) if (errorCode.startsWith(p)) return true;
  return false;
}

/**
 * Frontend crash reporter (skill crash-reporting Commit 8).
 *
 * Capture surface:
 *   - `window.onerror`               (sync runtime errors fuori da Angular zone)
 *   - `window.onunhandledrejection`  (promise rejection unhandled)
 *   - `GlobalHandler.handleError()`  (extension point: vedi `report(err)`)
 *
 * Per ogni errore catturato:
 *   1. Costruisce un `CrashReportPayload` con stack + url + UA + breadcrumbs ring buffer
 *   2. Calcola `stackHash` (SHA-256 dello stack canonicalizzato) per dedup in-memory
 *   3. Se nuovo o se occorrenza N-th (default 10), POSTa a `/api/Meta/AsmxProxy/MetaService.crashForward`
 *   4. Al `beforeunload`, flush con `navigator.sendBeacon` per non perdere errori last-mile
 *
 * Il backend (`MetaController.AsmxProxy` -> `MetaService.crashForward`) e'
 * responsabile di aggiungere gli header `X-Wuic-License-*` server-side e di
 * fare effettivamente il POST upstream a `errors.wuic-framework.com`. Cosi'
 * niente secret nel browser.
 *
 * ── Lazy init ────────────────────────────────────────────────────────
 * `init()` va chiamato una-tantum nell'`APP_INITIALIZER` (o equivalente
 * lifecycle hook) del consumer. Probe `/api/Meta/AsmxProxy/MetaService.getCrashReportingConfig`:
 *   - se `enabled=false` -> tutti i metodi diventano no-op senza ulteriori HTTP.
 *   - se `enabled=true` -> hooks DOM + breadcrumb listeners attivi.
 *
 * ── No-op gating ─────────────────────────────────────────────────────
 * Default OFF: niente attivita' lato browser finche' il backend non dice
 * `enabled=true`. Nessun fingerprinting, nessun listener DOM aggiunto.
 *
 * ── Privacy ──────────────────────────────────────────────────────────
 * I breadcrumb non includono mai contenuto form (input.value), header
 * Authorization, cookie, o body di response. Solo URL pattern, status code,
 * route changes, console.error message (truncated).
 */
@Injectable({ providedIn: 'root' })
export class CrashReporterService {
  // ── Public state ────────────────────────────────────────────────────
  /** Set after `init()` resolves with backend config. */
  private _enabled = false;
  get enabled(): boolean { return this._enabled; }

  // ── Config (from backend) ───────────────────────────────────────────
  private readonly forwardUrl = '/api/Meta/AsmxProxy/MetaService.crashForward';
  private readonly configUrl = '/api/Meta/AsmxProxy/MetaService.getCrashReportingConfig';
  private maxBreadcrumbs = 30;
  private dedupCapacity = 20;
  private dedupFlushEvery = 10;

  // ── Runtime state ───────────────────────────────────────────────────
  private breadcrumbs: Breadcrumb[] = [];
  /** LRU map: stackHash -> occurrence count. */
  private dedupMap = new Map<string, number>();
  /** Cache of last enqueued payloads pending sendBeacon at beforeunload. */
  private pendingBeacon: CrashReportPayload[] = [];
  private hooksInstalled = false;
  private initInFlight: Promise<void> | null = null;

  // ── DI ──────────────────────────────────────────────────────────────
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);

  /**
   * Bootstrap. Idempotent — multiple calls return the same in-flight promise.
   * Resolves when the config probe is complete (or when it fails — silent).
   */
  init(): Promise<void> {
    if (this.initInFlight) return this.initInFlight;
    this.initInFlight = this.bootstrapAsync().catch(() => undefined);
    return this.initInFlight;
  }

  /** Public API for `GlobalHandler` to forward an Angular-zone error. */
  report(error: unknown, context?: { url?: string; userId?: string }): void {
    if (!this._enabled) return;
    // Soppressione durante il restart del backend: durante l'overlay
    // "Riavvio in corso" tutti i call HTTP falliscono (ERR_CONNECTION_REFUSED).
    // Se inoltrassimo questi al `crashForward` endpoint il payload arriverebbe
    // a un backend down (ulteriori errori) e quando torna su finirebbe nei
    // log come "rumore" non azionabile. Stessa flag usata da
    // `GlobalHandler.handleError` (Branch -4).
    try {
      // Lazy import: il crash-reporter e' caricato prima del GlobalHandler in
      // alcuni contest, quindi accediamo alla flag via il global esposto
      // dalla static `setRestartInProgress` invece di importare direttamente
      // (eviterebbe un cyclic dep).
      const gh = (globalThis as { __wuicGlobalHandler?: { isRestartInProgress?: () => boolean } }).__wuicGlobalHandler;
      if (gh && typeof gh.isRestartInProgress === 'function' && gh.isRestartInProgress()) {
        return;
      }
    } catch { /* never amplify */ }
    try {
      const payload = this.normalize(error, context);
      // Soft drop client-side (M3): tagliamo i codici zero-value alla sorgente
      // PRIMA di toccare la dedup map / il network. Vedi SOFT_DROP_PREFIXES.
      if (isSoftDropped(payload.errorCode)) return;
      this.captureInternal(payload);
    }
    catch { /* never amplify */ }
  }

  /**
   * Append a breadcrumb (navigation, XHR, console message, etc.). Cheap —
   * O(1) amortized via FIFO with cap. Safe to call before `init()`.
   */
  pushBreadcrumb(crumb: Breadcrumb): void {
    try {
      this.breadcrumbs.push({
        ...crumb,
        timestamp: crumb.timestamp || new Date().toISOString(),
      });
      if (this.breadcrumbs.length > this.maxBreadcrumbs) {
        this.breadcrumbs.splice(0, this.breadcrumbs.length - this.maxBreadcrumbs);
      }
    } catch { /* never throw on breadcrumb */ }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async bootstrapAsync(): Promise<void> {
    const config = await this.fetchConfig();
    this._enabled = !!config?.enabled;
    if (!this._enabled) return;
    if (typeof config.maxBreadcrumbsLen === 'number' && config.maxBreadcrumbsLen > 0) {
      // The byte cap is enforced by the backend before upload; client just
      // limits ring buffer count to keep memory bounded.
      this.maxBreadcrumbs = Math.min(this.maxBreadcrumbs, 60);
    }
    if (typeof config.dedupFlushEvery === 'number' && config.dedupFlushEvery > 0) {
      this.dedupFlushEvery = config.dedupFlushEvery;
    }
    this.installDomHooks();
    // Expose globally so GlobalHandler.handleError can reach the singleton
    // without the framework lib imposing a circular service-injection
    // dependency on the consumer (the existing GlobalHandler is wired via
    // ErrorHandler provider at app-level, so it's instantiated before any
    // service of this lib).
    try { (globalThis as any).__wuicCrashReporter = this; } catch { /* noop */ }
  }

  private async fetchConfig(): Promise<CrashReportingConfig | null> {
    try {
      const resp = await firstValueFrom(
        this.http.post<CrashReportingConfig>(this.configUrl, {}, {
          headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
          withCredentials: true,
        }),
      );
      return resp || null;
    } catch {
      return null;
    }
  }

  private installDomHooks(): void {
    if (this.hooksInstalled || typeof window === 'undefined') return;
    this.hooksInstalled = true;

    // Run handlers OUTSIDE Angular zone — non vogliamo triggerare CD per ogni
    // errore non-Angular (specialmente unhandled rejection in librerie 3p).
    this.zone.runOutsideAngular(() => {
      window.addEventListener('error', (ev) => {
        try {
          const err = ev.error || new Error(ev.message || 'unknown error');
          this.report(err, { url: typeof location !== 'undefined' ? location.href : undefined });
        } catch { /* swallow */ }
      });

      window.addEventListener('unhandledrejection', (ev) => {
        try {
          const reason = (ev as PromiseRejectionEvent).reason;
          const err = reason instanceof Error ? reason : new Error(String(reason));
          this.report(err, { url: typeof location !== 'undefined' ? location.href : undefined });
        } catch { /* swallow */ }
      });

      // sendBeacon at unload — last-mile flush. The backend forward endpoint
      // accepts the same JSON body shape; we serialize the queue and fire-and-forget.
      window.addEventListener('beforeunload', () => {
        try {
          if (!this.pendingBeacon.length) return;
          const blob = new Blob([JSON.stringify(this.pendingBeacon)], { type: 'application/json' });
          // Use native sendBeacon so the browser sends after page nav.
          if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(this.forwardUrl + '?beacon=1', blob);
          }
        } catch { /* swallow */ }
      });
    });
  }

  private normalize(error: unknown, context?: { url?: string; userId?: string }): CrashReportPayload {
    let type = 'Error';
    let message = '';
    let stackRaw = '';
    let errorCode: string | undefined;
    let args: Record<string, unknown> | undefined;
    let isTyped = false;

    // Estrai i campi tipizzati se WuicClientException (skill Commit 8b: B).
    if (isWuicClientException(error)) {
      const wuic = error as WuicClientException;
      errorCode = wuic.errorCode;
      args = wuic.args;
      isTyped = true;
    }

    if (error instanceof Error) {
      type = error.name || 'Error';
      message = error.message || '';
      stackRaw = error.stack || `${type}: ${message}`;
    } else if (typeof error === 'string') {
      message = error;
      stackRaw = error;
    } else {
      try { message = JSON.stringify(error); } catch { message = String(error); }
      stackRaw = message;
    }
    return {
      type,
      message: this.truncate(message, 2000),
      stackRaw: this.truncate(stackRaw, 64 * 1024),
      stackHash: this.hash(this.canonicalize(stackRaw)),
      source: 'js',
      url: context?.url || (typeof location !== 'undefined' ? location.href : undefined),
      userId: context?.userId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      breadcrumbs: [...this.breadcrumbs],
      errorCode,
      args,
      isTyped,
    };
  }

  private captureInternal(payload: CrashReportPayload): void {
    if (!payload.stackHash) return;
    const occ = (this.dedupMap.get(payload.stackHash) || 0) + 1;
    this.touchDedup(payload.stackHash, occ);
    const shouldEnqueue = occ === 1 || occ % this.dedupFlushEvery === 0;
    if (!shouldEnqueue) return;
    this.enqueuePending(payload);
    this.postForward(payload);
  }

  private touchDedup(hash: string, occ: number): void {
    this.dedupMap.delete(hash); // refresh recency
    this.dedupMap.set(hash, occ);
    while (this.dedupMap.size > this.dedupCapacity) {
      const oldest = this.dedupMap.keys().next().value;
      if (oldest === undefined) break;
      this.dedupMap.delete(oldest);
    }
  }

  private enqueuePending(payload: CrashReportPayload): void {
    this.pendingBeacon.push(payload);
    if (this.pendingBeacon.length > 10) this.pendingBeacon.splice(0, this.pendingBeacon.length - 10);
  }

  private postForward(payload: CrashReportPayload): void {
    this.http.post(this.forwardUrl, payload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      withCredentials: true,
    }).subscribe({ next: () => undefined, error: () => undefined });
  }

  // ── Stack canonicalization (mirror server StackCanonicalizer) ──────
  private canonicalize(raw: string): string {
    if (!raw) return '';
    return raw
      .replace(/\r\n|\r/g, '\n').trim()
      .replace(/\b0x[0-9A-Fa-f]+\b|\b[0-9A-Fa-f]{8,}\b/g, '<hex>')
      .replace(/\d{4,}/g, '<n>')
      .replace(/\?[^\s'"]*/g, '')
      .replace(/<>[a-zA-Z0-9_]+/g, '<anon>');
  }

  private hash(s: string): string {
    // Lightweight FNV-1a 32-bit hex; SHA-256 would be more "secure" but
    // there's no security boundary here — only need uniform distribution
    // for dedup. Returns 8-char lowercase hex.
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  private truncate(s: string, max: number): string {
    if (!s) return s;
    return s.length <= max ? s : s.slice(0, max);
  }
}

// ── DTOs ─────────────────────────────────────────────────────────────

export interface Breadcrumb {
  category: 'nav' | 'xhr' | 'console' | 'ui' | string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

export interface CrashReportPayload {
  type: string;
  message: string;
  stackRaw: string;
  stackHash: string;
  source: 'js' | '.net';
  url?: string;
  userId?: string;
  userAgent?: string;
  breadcrumbs?: Breadcrumb[];
  extra?: Record<string, unknown>;
  release?: string;

  // ── Typed-error enrichment (Commit 8b: B+M3) ──────────────────────
  /** errorCode tipizzato di una WuicClientException (es. errors.client.archetype.chart.init_failed). */
  errorCode?: string;
  /** Args strutturati associati al codice tipizzato. */
  args?: Record<string, unknown>;
  /** True se proviene da WuicClientException tipizzata. */
  isTyped?: boolean;
}

export interface CrashReportingConfig {
  enabled: boolean;
  upstreamUrl?: string;
  disclaimerVersion?: string;
  maxBreadcrumbsLen?: number;
  dedupFlushEvery?: number;
}
