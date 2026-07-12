import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';

/**
 * /start — ads landing page (Sprint 5).
 *
 * Design constraints (from the visibility plan, do not "improve" casually):
 *  - NO navbar / NO footer: every nav link is a leak out of the paid-click
 *    funnel. The route sets `data: { bareLayout: true }` and the app shell
 *    hides both. The only outbound paths are the two CTAs, the guided-demo
 *    mailto, and one discreet privacy link (Google Ads destination policy).
 *  - Message match per ad group via the `m` query param:
 *      ?m=competitor → "self-hosted alternative you own" hero
 *      (default)    → "SQL table → app" hero (category + IT campaigns)
 *    Keep param values in sync with the Google Ads final URLs.
 *  - Price above the fold: per-seat anxiety is the #1 objection coming from
 *    Retool/Budibase comparisons — answer it before they scroll.
 */
@Component({
  selector: 'app-start',
  imports: [TranslateModule, ButtonModule],
  templateUrl: './start.html',
  styleUrl: './start.scss',
})
export class Start {
  /** Same live-demo entry point used by the /sandbox page. */
  readonly demoUrl = 'https://demo.wuic-framework.com/';

  private readonly route = inject(ActivatedRoute);

  /** Hero variant key resolved from the `m` query param (see class docs). */
  readonly variant = toSignal(
    this.route.queryParamMap.pipe(
      map(params => (params.get('m') === 'competitor' ? 'competitor' : 'default')),
    ),
    { initialValue: 'default' as const },
  );

  constructor() {
    inject(SeoService).set({
      titleKey: 'seo.start.title',
      descriptionKey: 'seo.start.description',
      path: '/start',
    });
  }

  /**
   * Fire a Plausible custom event if the analytics script is loaded.
   * Safe no-op before task "Analytics" wires the script in — the goals
   * (sandbox_open / download_click) are pre-wired so the funnel starts
   * reporting the moment Plausible lands on the page.
   */
  track(event: string): void {
    (window as unknown as { plausible?: (e: string) => void }).plausible?.(event);
  }
}
