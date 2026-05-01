import { afterNextRender, Injectable, signal } from '@angular/core';

/**
 * Consent model — one boolean per cookie category.
 * `technical` is always true (strictly necessary, no consent required).
 */
export interface ConsentState {
  technical: true;
  marketing: boolean;
  /** Millis timestamp when the decision was saved. */
  decidedAt: number | null;
}

const STORAGE_KEY = 'wuic-cookie-consent';
const DEFAULT_STATE: ConsentState = {
  technical: true,
  marketing: false,
  decidedAt: null,
};

/**
 * GDPR consent store for the public site.
 *
 * Responsibilities:
 *  - Expose a signal with current consent state (technical always on, others opt-in)
 *  - Persist the decision in `localStorage` under `wuic-cookie-consent`
 *  - Tell callers whether a decision has ever been made (shows/hides the banner)
 *  - Tell `paypal-loader.ts` whether it is allowed to inject the PayPal SDK
 *    (marketing category — third-party cookies from paypal.com)
 *
 * Consent is stored for 6 months from the decision date. After that we ask again.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

  // SSR safety: the constructor runs both during prerender (no `window`)
  // and in the browser. Initialise to defaults so server-side rendering
  // produces a valid HTML, then re-hydrate from localStorage on the
  // client right after the first render. Without this, the prerendered
  // HTML always carries `bannerVisible=true` (no decision was ever made
  // server-side, because there's no localStorage there) and the banner
  // pops open on every visit even after the user accepted on a previous
  // session.
  readonly state = signal<ConsentState>({ ...DEFAULT_STATE });
  readonly bannerVisible = signal<boolean>(true);

  constructor() {
    // afterNextRender is browser-only — Angular guarantees this callback
    // never runs during SSR / prerender, so we can safely touch
    // localStorage without an isPlatformBrowser guard.
    afterNextRender(() => {
      const fresh = this.load();
      this.state.set(fresh);
      this.bannerVisible.set(this.needsDecision());
    });
  }

  /** True when marketing cookies (PayPal SDK) are allowed. */
  canLoadMarketing(): boolean {
    return this.state().marketing === true;
  }

  acceptAll(): void {
    this.save({ technical: true, marketing: true, decidedAt: Date.now() });
  }

  rejectAll(): void {
    this.save({ technical: true, marketing: false, decidedAt: Date.now() });
  }

  savePreferences(prefs: { marketing: boolean }): void {
    this.save({ technical: true, marketing: prefs.marketing, decidedAt: Date.now() });
  }

  /** Re-open the banner (called from Cookie Policy page "Manage cookies" button). */
  reopen(): void {
    this.bannerVisible.set(true);
  }

  private save(next: ConsentState): void {
    this.state.set(next);
    this.bannerVisible.set(false);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
    } catch {
      // localStorage unavailable (private mode, quota) — state lives only in memory
    }
  }

  private load(): ConsentState {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as ConsentState;
          if (parsed && typeof parsed === 'object') {
            return {
              technical: true,
              marketing: parsed.marketing === true,
              decidedAt: typeof parsed.decidedAt === 'number' ? parsed.decidedAt : null,
            };
          }
        }
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_STATE };
  }

  private needsDecision(): boolean {
    const s = this.state();
    if (s.decidedAt === null) return true;
    const age = Date.now() - s.decidedAt;
    return age > this.SIX_MONTHS_MS;
  }
}
