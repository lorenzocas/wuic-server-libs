import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';
import {
  articleSchema,
  breadcrumbsSchema,
  faqPageSchema,
} from '../../services/seo-schemas';

interface ComparisonRow {
  /**
   * i18n key segment, e.g. `approach` / `hosting` / `crud` — used to compose
   * `comparison.verdict.rows.<id>.label` (and `.detail`, `.notes.<tool>`)
   * for verdict rows, or `comparison.features.rows.<id>.label` for feature
   * rows. Keep these stable: changing the id requires updating all 5 i18n
   * JSON files.
   */
  id: string;
  /** Per-tool ratings: 'yes' = full support, 'partial' = limited, 'no' = unsupported. */
  wuic: ToolRating;
  retool: ToolRating;
  refine: ToolRating;
  budibase: ToolRating;
  appsmith: ToolRating;
  /**
   * When true the cell renders the localized note text from
   * `…rows.<id>.notes.<tool>` instead of the rating icon. Verdict rows
   * always set this; feature rows only set it for the `lockin` and
   * `pricing` rows where each cell deserves a per-tool sentence.
   */
  notes?: boolean;
}

type ToolRating = 'yes' | 'partial' | 'no';

interface FaqEntry {
  /** Suffix under `comparison.faq.items.<id>.{q,a}`. */
  id: string;
}

@Component({
  selector: 'app-comparison',
  imports: [RouterLink, ButtonModule, TranslateModule],
  templateUrl: './comparison.html',
  styleUrl: './comparison.scss',
})
export class Comparison {
  // Brand names — never translated (they are vendor product names).
  readonly tools = ['WUIC', 'Retool', 'Refine', 'Budibase', 'AppSmith'] as const;

  // ─── Verdict summary (top-of-page TL;DR) ──────────────────────────
  // Five dimensions evaluators usually filter on first. Every cell here
  // renders a localized note (no icons in the verdict table).
  readonly verdictRows: ComparisonRow[] = [
    { id: 'approach', wuic: 'yes', retool: 'partial', refine: 'no',  budibase: 'partial', appsmith: 'partial', notes: true },
    { id: 'hosting',  wuic: 'yes', retool: 'partial', refine: 'yes', budibase: 'yes',     appsmith: 'yes',     notes: true },
    { id: 'source',   wuic: 'no',  retool: 'no',      refine: 'yes', budibase: 'yes',     appsmith: 'yes',     notes: true },
    { id: 'ui',       wuic: 'yes', retool: 'no',      refine: 'yes', budibase: 'no',      appsmith: 'no',      notes: true },
    { id: 'best',     wuic: 'yes', retool: 'yes',     refine: 'yes', budibase: 'yes',     appsmith: 'yes',     notes: true },
  ];

  // ─── Detailed feature comparison ──────────────────────────────────
  // Twelve concrete capabilities. Most cells show an icon (yes/partial/no);
  // only `lockin` and `pricing` render per-tool localized notes instead.
  // Each row's label + detail comes from comparison.features.rows.<id>.
  readonly featureRows: ComparisonRow[] = [
    { id: 'crud',        wuic: 'yes', retool: 'partial', refine: 'partial', budibase: 'yes',     appsmith: 'partial' },
    { id: 'designer',    wuic: 'yes', retool: 'yes',     refine: 'no',      budibase: 'yes',     appsmith: 'yes'     },
    { id: 'workflow',    wuic: 'yes', retool: 'partial', refine: 'no',      budibase: 'partial', appsmith: 'partial' },
    { id: 'reports',     wuic: 'yes', retool: 'no',      refine: 'no',      budibase: 'no',      appsmith: 'no'      },
    { id: 'mobile',      wuic: 'yes', retool: 'partial', refine: 'partial', budibase: 'yes',     appsmith: 'partial' },
    { id: 'rag',         wuic: 'yes', retool: 'partial', refine: 'no',      budibase: 'no',      appsmith: 'no'      },
    { id: 'multitenant', wuic: 'yes', retool: 'partial', refine: 'no',      budibase: 'partial', appsmith: 'partial' },
    { id: 'sqlServer',   wuic: 'yes', retool: 'yes',     refine: 'partial', budibase: 'partial', appsmith: 'yes'     },
    { id: 'iis',         wuic: 'yes', retool: 'partial', refine: 'partial', budibase: 'partial', appsmith: 'partial' },
    { id: 'angular',     wuic: 'yes', retool: 'no',      refine: 'no',      budibase: 'no',      appsmith: 'partial' },
    { id: 'lockin',      wuic: 'partial', retool: 'no',  refine: 'yes', budibase: 'partial', appsmith: 'partial', notes: true },
    { id: 'pricing',     wuic: 'yes', retool: 'partial', refine: 'yes', budibase: 'partial', appsmith: 'yes',     notes: true },
  ];

  // ─── FAQ ───────────────────────────────────────────────────────────
  // Question + answer copy live under comparison.faq.items.<id>.{q,a}.
  readonly faqs: FaqEntry[] = [
    { id: 'retool'  },
    { id: 'closed'  },
    { id: 'lockin'  },
    { id: 'lowcode' },
    { id: 'try'     },
  ];

  // Canonical English FAQ copy for JSON-LD structured data (server-side
  // prerender). schema.org payloads are stable for SEO regardless of the
  // user's active UI locale; the visible UI uses the translated values.
  private readonly faqsSchemaCopy = [
    { q: 'Is WUIC really an alternative to Retool?',
      a: 'For internal tools backed by a SQL database, yes — WUIC and Retool occupy the same problem space. The key difference is approach: Retool is a drag-and-drop SaaS builder that excels at putting a UI on top of any datasource you can write a query against; WUIC is a self-hosted Angular framework that derives the UI from your database schema and metadata. If your team is mostly SQL-fluent and you want CRUD/dashboards/workflows generated from a schema, WUIC fits. If your team is mostly non-developers building one-off internal panels in the cloud, Retool fits.' },
    { q: 'Why would I pick a closed-source framework over Refine, Budibase, or AppSmith?',
      a: 'Three reasons we hear from teams that pick WUIC: (1) much less hand-written code per app — metadata replaces hundreds of TS files; (2) production-grade workflow + report engine in the box, where the open-source competitors usually need bolt-ons; (3) first-class self-hosting on Windows/IIS without Docker, which still matters for many corporate environments. The tradeoff is honest: if having the source code in your repo is non-negotiable, the open-source competitors win that round and you should pick one of them.' },
    { q: 'Does WUIC lock me in if I want to migrate away?',
      a: 'Your application data lives in your own SQL database — WUIC reads from it, it does not host it. Your metadata (route definitions, column visibility, action logic) lives in two SQL tables also under your control. UI customisation is plain Angular code in your repository. Migration risk is therefore mostly about replacing the runtime, not extracting the data. We would not claim zero lock-in, but it is materially lower than cloud SaaS competitors.' },
    { q: 'Where do you draw the line between WUIC and a low-code platform?',
      a: 'WUIC is opinionated about generating UI from metadata, but it stays out of your way for everything else: routing, services, custom components, deployment, SSO, observability — all standard Angular and .NET. Low-code platforms typically own the entire stack and constrain you to their primitives. We see WUIC as a "code-saver framework" rather than low-code: less typing, full developer control.' },
    { q: 'Can I try it before committing to a license?',
      a: 'Yes — every license tier ships with a 30-day evaluation. The annual Developer license starts at €600/dev. You can also book a guided demo on the Get Started page, or download the framework from the Downloads page and run it on a SQL Server instance you already have.' },
  ];

  // Visual rendering helpers used by the template.
  readonly toolKey = ['wuic', 'retool', 'refine', 'budibase', 'appsmith'] as const;

  constructor() {
    inject(SeoService).set({
      titleKey: 'seo.comparison.title',
      descriptionKey: 'seo.comparison.description',
      path: '/comparison',
      structuredData: [
        articleSchema({
          headline: 'WUIC vs Retool, Refine, Budibase, AppSmith — a side-by-side comparison',
          description:
            'Honest feature-by-feature comparison of WUIC against the most common low-code and admin-panel alternatives, with explicit guidance on when each tool fits.',
          path: '/comparison',
          datePublished: '2026-05-01',
        }),
        faqPageSchema(
          this.faqsSchemaCopy.map(f => ({ question: f.q, answer: f.a }))
        ),
        breadcrumbsSchema([
          { name: 'Home', pathOrUrl: '/' },
          { name: 'Comparison', pathOrUrl: '/comparison' },
        ]),
      ],
    });
  }

  ratingClass(rating: ToolRating): string {
    return `rating rating-${rating}`;
  }

  ratingIcon(rating: ToolRating): string {
    switch (rating) {
      case 'yes':
        return '✓';
      case 'partial':
        return '~';
      case 'no':
        return '✗';
    }
  }

  /**
   * Returns the i18n KEY for the rating label (not the literal text).
   * Template wires it through the `translate` pipe so screen readers /
   * tooltips see the localized string.
   */
  ratingLabelKey(rating: ToolRating): string {
    switch (rating) {
      case 'yes':
        return 'comparison.rating.full';
      case 'partial':
        return 'comparison.rating.partial';
      case 'no':
        return 'comparison.rating.none';
    }
  }
}
