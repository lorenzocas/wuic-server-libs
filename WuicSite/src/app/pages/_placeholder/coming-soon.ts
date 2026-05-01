import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';

/**
 * Reusable placeholder for routes that are registered (so internal links
 * resolve and don't 404) but not yet built out — comparison page, blog,
 * sandbox, etc. Each route passes a `data` payload through the router
 * config; this component reads it and:
 *
 *   1. Renders a minimal hero with title/subtitle/CTA back to home.
 *   2. Tells SeoService to emit `<meta name="robots" content="noindex,
 *      follow">` so Google doesn't index thin content (which can drag down
 *      site-wide ranking — Helpful Content System penalizes "low-effort"
 *      pages even when only a handful exist).
 *
 * As each placeholder graduates to a real page in later sprints, swap the
 * `loadComponent` in app.routes.ts to point at the dedicated component and
 * the route automatically becomes indexable again.
 */
interface ComingSoonRouteData {
  /** Visible page heading. EN literal — placeholders are not localized. */
  title: string;
  /** Visible subtitle / brief description of what the page will offer. */
  subtitle: string;
  /** Path used by SeoService for canonical/og:url. e.g. '/comparison'. */
  path: string;
  /** When the page is expected to land. Cosmetic only. */
  eta?: string;
}

@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink, ButtonModule],
  template: `
    <section class="placeholder-hero">
      <div class="container">
        <span class="badge">Coming soon</span>
        <h1>{{ data.title }}</h1>
        <p class="subtitle">{{ data.subtitle }}</p>
        @if (data.eta) {
          <p class="eta">Expected: {{ data.eta }}</p>
        }
        <div class="actions">
          <a routerLink="/">
            <p-button label="Back to home" icon="pi pi-arrow-left" severity="secondary" [outlined]="true" />
          </a>
          <a routerLink="/downloads">
            <p-button label="Try WUIC now" icon="pi pi-download" />
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .placeholder-hero {
      background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 50%, #c7d2fe 100%);
      padding: 120px 0 100px;
      text-align: center;
      min-height: 60vh;
      display: flex;
      align-items: center;
    }
    .container { max-width: 720px; margin: 0 auto; padding: 0 24px; }
    .badge {
      display: inline-block;
      background: #6366f1;
      color: #fff;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
      margin: 0 0 20px;
    }
    .subtitle {
      font-size: 1.15rem;
      color: #475569;
      line-height: 1.7;
      margin: 0 0 16px;
    }
    .eta {
      font-size: 0.95rem;
      color: #6366f1;
      font-weight: 600;
      margin: 0 0 32px;
    }
    .actions {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }
  `],
})
export class ComingSoon {
  data: ComingSoonRouteData;

  constructor() {
    const route = inject(ActivatedRoute);
    this.data = route.snapshot.data as ComingSoonRouteData;
    inject(SeoService).set({
      titleLiteral: this.data.title,
      descriptionLiteral: this.data.subtitle,
      path: this.data.path,
      noindex: true,
    });
  }
}
