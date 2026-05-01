import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';
import {
  articleSchema,
  breadcrumbsSchema,
  faqPageSchema,
} from '../../services/seo-schemas';

interface ComparisonRow {
  label: string;
  /** Description shown on hover/expansion. */
  detail?: string;
  /** Per-tool ratings: 'yes' = full support, 'partial' = limited, 'no' = unsupported. */
  wuic: ToolRating;
  retool: ToolRating;
  refine: ToolRating;
  budibase: ToolRating;
  appsmith: ToolRating;
  /** Optional inline note replacing the icon for nuance. */
  notes?: { wuic?: string; retool?: string; refine?: string; budibase?: string; appsmith?: string };
}

type ToolRating = 'yes' | 'partial' | 'no';

interface FaqEntry {
  q: string;
  a: string;
}

@Component({
  selector: 'app-comparison',
  imports: [RouterLink, ButtonModule],
  templateUrl: './comparison.html',
  styleUrl: './comparison.scss',
})
export class Comparison {
  // Order matters: WUIC first, then alphabetical.
  readonly tools = ['WUIC', 'Retool', 'Refine', 'Budibase', 'AppSmith'] as const;

  // ─── Verdict summary (top-of-page TL;DR) ──────────────────────────
  // 5 dimensions chosen because they're what evaluators actually filter
  // on first: how the tool models data, who owns the runtime, what stack
  // it commits you to, and where it shines. Anything more granular goes
  // in the detailed table below.
  readonly verdictRows: ComparisonRow[] = [
    {
      label: 'Approach',
      wuic: 'yes',
      retool: 'partial',
      refine: 'no',
      budibase: 'partial',
      appsmith: 'partial',
      notes: {
        wuic: 'Metadata-driven',
        retool: 'Drag-and-drop builder',
        refine: 'Code-first React framework',
        budibase: 'Drag-and-drop builder',
        appsmith: 'Drag-and-drop builder',
      },
    },
    {
      label: 'Hosting model',
      wuic: 'yes',
      retool: 'partial',
      refine: 'yes',
      budibase: 'yes',
      appsmith: 'yes',
      notes: {
        wuic: 'Self-hosted (your IIS / Linux)',
        retool: 'Cloud SaaS — self-host on Enterprise',
        refine: 'Self-hosted (npm package)',
        budibase: 'Self-hosted or cloud',
        appsmith: 'Self-hosted or cloud',
      },
    },
    {
      label: 'Source code',
      wuic: 'no',
      retool: 'no',
      refine: 'yes',
      budibase: 'yes',
      appsmith: 'yes',
      notes: {
        wuic: 'Closed-source',
        retool: 'Closed-source',
        refine: 'MIT (open-source)',
        budibase: 'GPL-3.0',
        appsmith: 'Apache-2.0',
      },
    },
    {
      label: 'UI stack',
      wuic: 'yes',
      retool: 'no',
      refine: 'yes',
      budibase: 'no',
      appsmith: 'no',
      notes: {
        wuic: 'Angular 21 + PrimeNG',
        retool: 'Proprietary',
        refine: 'React (any UI lib)',
        budibase: 'Svelte (proprietary)',
        appsmith: 'Proprietary',
      },
    },
    {
      label: 'Best for',
      wuic: 'yes',
      retool: 'yes',
      refine: 'yes',
      budibase: 'yes',
      appsmith: 'yes',
      notes: {
        wuic: 'Enterprise CRM / ERP from a SQL schema',
        retool: 'Internal admin tools, fast prototyping',
        refine: 'React devs building bespoke admin UIs',
        budibase: 'Non-devs building forms over PostgreSQL',
        appsmith: 'Internal tools with custom JS logic',
      },
    },
  ];

  // ─── Detailed feature comparison ──────────────────────────────────
  // ~12 rows. Each is checked against the actual published
  // documentation of the competitors at the time of writing — we don't
  // claim something works on Refine just because the WUIC equivalent
  // has the same name. If a competitor's behaviour changed, please
  // file an issue rather than letting it rot.
  readonly featureRows: ComparisonRow[] = [
    {
      label: 'Auto CRUD from a SQL table',
      detail: 'Generate list/edit/detail UI + REST endpoints from a database schema with no boilerplate.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'partial',
      budibase: 'yes',
      appsmith: 'partial',
    },
    {
      label: 'Dashboard designer (drag-and-drop)',
      detail: 'Visual designer that produces a runtime dashboard, not just a screenshot.',
      wuic: 'yes',
      retool: 'yes',
      refine: 'no',
      budibase: 'yes',
      appsmith: 'yes',
    },
    {
      label: 'Visual workflow / process engine',
      detail: 'Multi-step business workflows with conditional branches, embedded in the same app.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'no',
      budibase: 'partial',
      appsmith: 'partial',
    },
    {
      label: 'Built-in report builder (PDF/Excel)',
      detail: 'Designer for tabular and matrix reports exportable to PDF/Excel without external tooling.',
      wuic: 'yes',
      retool: 'no',
      refine: 'no',
      budibase: 'no',
      appsmith: 'no',
    },
    {
      label: 'Mobile-responsive auto-layout',
      detail: 'Tables collapse to card stack on small screens with no per-component config.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'partial',
      budibase: 'yes',
      appsmith: 'partial',
    },
    {
      label: 'In-product RAG / AI chatbot',
      detail: 'Embeddable assistant that answers questions about your data and codebase.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'no',
      budibase: 'no',
      appsmith: 'no',
    },
    {
      label: 'Multi-tenant authorization out-of-the-box',
      detail: 'Row-level + column-level permissions driven by metadata, not custom code.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'no',
      budibase: 'partial',
      appsmith: 'partial',
    },
    {
      label: 'SQL Server first-class',
      detail: 'Native SQL Server support including stored procedures and Windows auth.',
      wuic: 'yes',
      retool: 'yes',
      refine: 'partial',
      budibase: 'partial',
      appsmith: 'yes',
    },
    {
      label: 'Self-hosted on Windows / IIS',
      detail: 'Deploy to a corporate Windows server without containers or Linux.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'partial',
      budibase: 'partial',
      appsmith: 'partial',
    },
    {
      label: 'Customise UI with full Angular control',
      detail: 'Drop down to native Angular components when the framework is not enough.',
      wuic: 'yes',
      retool: 'no',
      refine: 'no',
      budibase: 'no',
      appsmith: 'partial',
    },
    {
      label: 'Vendor lock-in risk',
      detail: 'How tied is your data and UI to the platform if you stop paying / using it?',
      wuic: 'partial',
      retool: 'no',
      refine: 'yes',
      budibase: 'partial',
      appsmith: 'partial',
      notes: {
        wuic: 'Closed runtime, but data + metadata stay in your SQL — exportable',
        retool: 'High — cloud lock-in, JS apps live inside Retool',
        refine: 'Low — your code is plain React',
        budibase: 'Medium — apps live in Budibase format',
        appsmith: 'Medium — apps live in AppSmith JSON',
      },
    },
    {
      label: 'Pricing model',
      detail: 'How licensing scales with team / users.',
      wuic: 'yes',
      retool: 'partial',
      refine: 'yes',
      budibase: 'partial',
      appsmith: 'yes',
      notes: {
        wuic: 'Per-developer annual (€600-€1200/dev)',
        retool: 'Per end-user/month — gets expensive fast',
        refine: 'Free (open-source); Enterprise tier optional',
        budibase: 'Per-user/month + free self-host',
        appsmith: 'Free (community); usage-based business tier',
      },
    },
  ];

  readonly faqs: FaqEntry[] = [
    {
      q: 'Is WUIC really an alternative to Retool?',
      a: 'For internal tools backed by a SQL database, yes — WUIC and Retool occupy the same problem space. The key difference is approach: Retool is a drag-and-drop SaaS builder that excels at putting a UI on top of any datasource you can write a query against; WUIC is a self-hosted Angular framework that derives the UI from your database schema and metadata. If your team is mostly SQL-fluent and you want CRUD/dashboards/workflows generated from a schema, WUIC fits. If your team is mostly non-developers building one-off internal panels in the cloud, Retool fits.',
    },
    {
      q: 'Why would I pick a closed-source framework over Refine, Budibase, or AppSmith?',
      a: 'Three reasons we hear from teams that pick WUIC: (1) much less hand-written code per app — metadata replaces hundreds of TS files; (2) production-grade workflow + report engine in the box, where the open-source competitors usually need bolt-ons; (3) first-class self-hosting on Windows/IIS without Docker, which still matters for many corporate environments. The tradeoff is honest: if having the source code in your repo is non-negotiable, the open-source competitors win that round and you should pick one of them.',
    },
    {
      q: 'Does WUIC lock me in if I want to migrate away?',
      a: 'Your application data lives in your own SQL database — WUIC reads from it, it does not host it. Your metadata (route definitions, column visibility, action logic) lives in two SQL tables also under your control. UI customisation is plain Angular code in your repository. Migration risk is therefore mostly about replacing the runtime, not extracting the data. We would not claim zero lock-in, but it is materially lower than cloud SaaS competitors.',
    },
    {
      q: 'Where do you draw the line between WUIC and a low-code platform?',
      a: 'WUIC is opinionated about generating UI from metadata, but it stays out of your way for everything else: routing, services, custom components, deployment, SSO, observability — all standard Angular and .NET. Low-code platforms typically own the entire stack and constrain you to their primitives. We see WUIC as a "code-saver framework" rather than low-code: less typing, full developer control.',
    },
    {
      q: 'Can I try it before committing to a license?',
      a: 'Yes — every license tier ships with a 30-day evaluation. The annual Developer license starts at €600/dev. You can also book a guided demo on the Get Started page, or download the framework from the Downloads page and run it on a SQL Server instance you already have.',
    },
  ];

  // Visual rendering helpers used by the template.
  readonly toolKey = ['wuic', 'retool', 'refine', 'budibase', 'appsmith'] as const;

  constructor() {
    inject(SeoService).set({
      titleLiteral: 'WUIC vs Retool, Refine, Budibase, AppSmith',
      descriptionLiteral:
        'A side-by-side comparison of WUIC against Retool, Refine, Budibase and AppSmith — feature matrix, when each fits, and honest tradeoffs.',
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
          this.faqs.map(f => ({ question: f.q, answer: f.a }))
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

  ratingLabel(rating: ToolRating): string {
    switch (rating) {
      case 'yes':
        return 'Full support';
      case 'partial':
        return 'Partial / limited';
      case 'no':
        return 'Not supported';
    }
  }
}
