import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';
import { articleSchema, breadcrumbsSchema, faqPageSchema } from '../../services/seo-schemas';

interface SandboxThing {
  /** PrimeIcons class name. */
  icon: string;
  /** ngx-translate key for the card title (e.g. `sandbox.things.items.designer.title`). */
  titleKey: string;
  /** ngx-translate key for the card description body. */
  descriptionKey: string;
}

interface FaqEntry {
  /** ngx-translate key for the question. */
  qKey: string;
  /** ngx-translate key for the answer. */
  aKey: string;
}

@Component({
  selector: 'app-sandbox',
  imports: [RouterLink, ButtonModule, TranslateModule],
  templateUrl: './sandbox.html',
  styleUrl: './sandbox.scss',
})
export class Sandbox {
  /** External demo URL — keep it as a constant so any future rebrand updates one place. */
  readonly demoUrl = 'https://demo.wuic-framework.com/';

  // 4-6 ideas a visitor can try in 60 seconds. Order them roughly by
  // wow-per-second: visual stuff first (designer, mobile), then the
  // metadata-driven workflows that take a beat to appreciate.
  //
  // Titles + descriptions live under `sandbox.things.items.*` in every
  // assets/i18n/<locale>.json so language switch works at runtime. Keep the
  // identifier here in sync with the JSON key.
  readonly things: SandboxThing[] = [
    {
      icon: 'pi pi-objects-column',
      titleKey: 'sandbox.things.items.designer.title',
      descriptionKey: 'sandbox.things.items.designer.description',
    },
    {
      icon: 'pi pi-mobile',
      titleKey: 'sandbox.things.items.mobile.title',
      descriptionKey: 'sandbox.things.items.mobile.description',
    },
    {
      icon: 'pi pi-comments',
      titleKey: 'sandbox.things.items.rag.title',
      descriptionKey: 'sandbox.things.items.rag.description',
    },
    {
      icon: 'pi pi-sitemap',
      titleKey: 'sandbox.things.items.wizard.title',
      descriptionKey: 'sandbox.things.items.wizard.description',
    },
    {
      icon: 'pi pi-database',
      titleKey: 'sandbox.things.items.audit.title',
      descriptionKey: 'sandbox.things.items.audit.description',
    },
    {
      icon: 'pi pi-file',
      titleKey: 'sandbox.things.items.report.title',
      descriptionKey: 'sandbox.things.items.report.description',
    },
  ];

  readonly faqs: FaqEntry[] = [
    { qKey: 'sandbox.faq.items.login.q',    aKey: 'sandbox.faq.items.login.a'    },
    { qKey: 'sandbox.faq.items.data.q',     aKey: 'sandbox.faq.items.data.a'     },
    { qKey: 'sandbox.faq.items.break.q',    aKey: 'sandbox.faq.items.break.a'    },
    { qKey: 'sandbox.faq.items.sameCode.q', aKey: 'sandbox.faq.items.sameCode.a' },
    { qKey: 'sandbox.faq.items.fast.q',     aKey: 'sandbox.faq.items.fast.a'     },
  ];

  // FAQ literal copy used for JSON-LD structured data (server-side prerender).
  // SEO crawlers see this regardless of the active UI locale; we keep the
  // canonical English text here so the schema.org payload is stable for
  // Google indexing, while the visible UI uses the translated values via the
  // ngx-translate pipe in the template.
  private readonly faqsSchemaCopy = [
    { q: 'Do I need to log in?',
      a: 'No. The sandbox auto-logs you in as a demo user with read/write access to demo data. System tables (metadata, users, license) are read-only.' },
    { q: 'What happens to data I create?',
      a: 'Edits live in the demo database until 04:00 UTC the next day, when a scheduled job restores the original seed dataset. Until then, anyone visiting the sandbox sees the changes other visitors made — treat it like a shared notepad.' },
    { q: 'Can I break the demo?',
      a: 'You can edit demo data freely, but mutations to system tables are blocked at the API layer (HTTP 403). The whole instance is also rate-limited per IP, so a curl loop will just hit 429 instead of taking the box down. If something does break, the daily reset puts it back to a known-good state.' },
    { q: 'Is this the same code I get when I download WUIC?',
      a: 'Yes — bit-for-bit. The demo is the standard KonvergenceCore + WuicTest build with one extra appsettings layer that flips DemoMode hardenings on. No custom forks, no demo-only features.' },
    { q: 'How fast can I run my own copy?',
      a: 'About 5 minutes for an evaluation install on Windows. Download the framework from the Downloads page, point it at a SQL Server instance you already have, and the firstRun wizard does the rest.' },
  ];

  constructor() {
    inject(SeoService).set({
      titleLiteral: 'Try WUIC in your browser',
      descriptionLiteral:
        'Open a hosted demo of WUIC running in your browser. Live data, real designer, no installation. Resets daily.',
      path: '/sandbox',
      structuredData: [
        articleSchema({
          headline: 'Try WUIC in your browser — live sandbox at demo.wuic-framework.com',
          description:
            'A hosted sandbox of the WUIC framework with a fresh demo dataset and the full designer / dashboard / report stack. Resets every 24 hours.',
          path: '/sandbox',
          datePublished: '2026-05-01',
        }),
        faqPageSchema(this.faqsSchemaCopy.map(f => ({ question: f.q, answer: f.a }))),
        breadcrumbsSchema([
          { name: 'Home', pathOrUrl: '/' },
          { name: 'Sandbox', pathOrUrl: '/sandbox' },
        ]),
      ],
    });
  }
}
