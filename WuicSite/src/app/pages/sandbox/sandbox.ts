import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';
import { articleSchema, breadcrumbsSchema, faqPageSchema } from '../../services/seo-schemas';

interface SandboxThing {
  /** PrimeIcons class name. */
  icon: string;
  title: string;
  description: string;
}

interface FaqEntry {
  q: string;
  a: string;
}

@Component({
  selector: 'app-sandbox',
  imports: [RouterLink, ButtonModule],
  templateUrl: './sandbox.html',
  styleUrl: './sandbox.scss',
})
export class Sandbox {
  /** External demo URL — keep it as a constant so any future rebrand updates one place. */
  readonly demoUrl = 'https://demo.wuic-framework.com/';

  // 4-6 ideas a visitor can try in 60 seconds. Order them roughly by
  // wow-per-second: visual stuff first (designer, mobile), then the
  // metadata-driven workflows that take a beat to appreciate.
  readonly things: SandboxThing[] = [
    {
      icon: 'pi pi-objects-column',
      title: 'Open the dashboard designer',
      description: 'Drag a widget onto the canvas, bind it to a route, watch it materialise into a runtime dashboard. The save button writes JSON to a metadata table — there is no codegen step.',
    },
    {
      icon: 'pi pi-mobile',
      title: 'Resize your browser to phone width',
      description: 'Every list collapses to a card stack and every edit form re-stacks vertically. Zero per-screen mobile config — the framework derives it from the same metadata that drives desktop.',
    },
    {
      icon: 'pi pi-comments',
      title: 'Ask the embedded RAG chatbot',
      description: 'Try "where is the logout handled?" or "how does multi-tenant work?". Answers cite the actual source files. Powered by Claude + a fine-tuned BAAI/bge-m3 reranker against the framework codebase.',
    },
    {
      icon: 'pi pi-sitemap',
      title: 'Walk a multi-step wizard',
      description: 'Open any list, click "New" on a route configured as a wizard, and step through validation + conditional branches. The graph is metadata, not handwritten code.',
    },
    {
      icon: 'pi pi-database',
      title: 'Edit a record, see the audit',
      description: 'Save a contact or a deal — your edit lives in the demo DB until the next 04:00 UTC reset. Until then, every visitor sees what you wrote.',
    },
    {
      icon: 'pi pi-file',
      title: 'Open a built-in report',
      description: 'Reports menu → pick anything. PDF and Excel export work directly in the browser — no Stimulsoft viewer install on the client.',
    },
  ];

  readonly faqs: FaqEntry[] = [
    {
      q: 'Do I need to log in?',
      a: 'No. The sandbox auto-logs you in as a demo user with read/write access to demo data. System tables (metadata, users, license) are read-only.',
    },
    {
      q: 'What happens to data I create?',
      a: 'Edits live in the demo database until 04:00 UTC the next day, when a scheduled job restores the original seed dataset. Until then, anyone visiting the sandbox sees the changes other visitors made — treat it like a shared notepad.',
    },
    {
      q: 'Can I break the demo?',
      a: 'You can edit demo data freely, but mutations to system tables are blocked at the API layer (HTTP 403). The whole instance is also rate-limited per IP, so a curl loop will just hit 429 instead of taking the box down. If something does break, the daily reset puts it back to a known-good state.',
    },
    {
      q: 'Is this the same code I get when I download WUIC?',
      a: 'Yes — bit-for-bit. The demo is the standard KonvergenceCore + WuicTest build with one extra appsettings layer that flips DemoMode hardenings on. No custom forks, no demo-only features.',
    },
    {
      q: 'How fast can I run my own copy?',
      a: 'About 5 minutes for an evaluation install on Windows. Download the framework from the Downloads page, point it at a SQL Server instance you already have, and the firstRun wizard does the rest.',
    },
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
        faqPageSchema(this.faqs.map(f => ({ question: f.q, answer: f.a }))),
        breadcrumbsSchema([
          { name: 'Home', pathOrUrl: '/' },
          { name: 'Sandbox', pathOrUrl: '/sandbox' },
        ]),
      ],
    });
  }
}
