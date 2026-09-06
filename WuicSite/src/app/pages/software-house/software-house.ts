import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../../services/seo.service';
import { articleSchema, breadcrumbsSchema, faqPageSchema } from '../../services/seo-schemas';

/**
 * WUIC list prices (EUR / year) — mirror of the Pricing page. Keep in sync
 * with pricing.ts / the pricing i18n block when prices change.
 */
const WUIC = {
  proFirstYear: 1200,
  /** Extension license bought within 60 days of the window's expiry (half price). */
  proExtensionYear: 600,
  proIncludedFingerprints: 3,
  extraFingerprintYear: 200,
  softwareHouseYear: 4800,
} as const;

/**
 * Competitor list prices (USD / user / month, annual billing) as published on
 * the vendors' pricing pages in September 2026. They change: update the
 * constants and the `asOf` string together.
 */
const COMPETITORS = {
  asOf: '2026-09',
  retoolTeam: { builder: 10, endUser: 5, includedEndUsers: 0 },
  retoolBusiness: { builder: 50, endUser: 15, includedEndUsers: 15 },
  budibasePremium: { builder: 50, endUser: 5, includedEndUsers: 0 },
} as const;

interface TcoRow {
  /** i18n suffix under softwareHouse.tco.rows.<id> */
  id: string;
  currency: 'EUR' | 'USD';
  year1: number;
  year2: number;
  year3: number;
  total: number;
  highlight?: boolean;
}

interface FaqEntry { id: string; }

@Component({
  selector: 'app-software-house',
  imports: [RouterLink, ButtonModule, TranslateModule],
  templateUrl: './software-house.html',
  styleUrl: './software-house.scss',
})
export class SoftwareHouse {
  // ─── Scenario inputs (editable in the page) ───────────────────────
  readonly developers = signal(3);
  readonly clients = signal(5);
  readonly endUsers = signal(200);

  readonly years = 3;
  readonly pricesAsOf = COMPETITORS.asOf;

  /** Fingerprints a Professional license must cover: one per developer machine + one per client server. */
  readonly fingerprints = computed(() => this.clamp(this.developers()) + this.clamp(this.clients()));
  readonly extraFingerprints = computed(() => Math.max(0, this.fingerprints() - WUIC.proIncludedFingerprints));

  readonly rows = computed<TcoRow[]>(() => {
    const devs = this.clamp(this.developers());
    const users = this.clamp(this.endUsers());
    const extra = this.extraFingerprints() * WUIC.extraFingerprintYear;

    const proY1 = WUIC.proFirstYear + extra;
    const proYn = WUIC.proExtensionYear + extra;
    const sh = WUIC.softwareHouseYear;

    const seat = (p: { builder: number; endUser: number; includedEndUsers: number }) =>
      (devs * p.builder + Math.max(0, users - p.includedEndUsers) * p.endUser) * 12;

    const retoolTeam = seat(COMPETITORS.retoolTeam);
    const retoolBusiness = seat(COMPETITORS.retoolBusiness);
    const budibase = seat(COMPETITORS.budibasePremium);

    const flat = (id: string, currency: 'EUR' | 'USD', y1: number, yn: number, highlight = false): TcoRow =>
      ({ id, currency, year1: y1, year2: yn, year3: yn, total: y1 + yn * 2, highlight });

    return [
      flat('wuicPro', 'EUR', proY1, proYn, true),
      flat('wuicSh', 'EUR', sh, sh, true),
      flat('retoolTeam', 'USD', retoolTeam, retoolTeam),
      flat('retoolBusiness', 'USD', retoolBusiness, retoolBusiness),
      flat('budibase', 'USD', budibase, budibase),
    ];
  });

  readonly faqs: FaqEntry[] = [
    { id: 'resale' },
    { id: 'fingerprint' },
    { id: 'tier' },
    { id: 'upgrade' },
    { id: 'source' },
    { id: 'lockin' },
  ];

  // English copy for JSON-LD (stable regardless of UI locale).
  private readonly faqsSchemaCopy = [
    { q: 'Can I resell applications built on WUIC to my customers?',
      a: 'Yes. The Professional license covers customer projects, and the Software House license adds explicit resale rights, three developer seats and unlimited production fingerprints on end-client servers.' },
    { q: 'How is a customer installation licensed?',
      a: 'Per machine. Each server has a machineFingerprint (GET /api/Meta/LicenseStatus). You send it to us and receive an updated license payload that adds the new server; Professional includes 3 fingerprints, extras cost €200 per year, Software House has no production limit.' },
    { q: 'Professional or Software House?',
      a: 'Professional fits one or two customer deployments plus your development machine. From roughly six fingerprints upward, or when you want priority support and explicit resale rights, Software House at €4,800 per year is cheaper and simpler.' },
    { q: 'What happens after the first year?',
      a: 'The installed version keeps working forever. To receive newer releases you buy an extension license at half price within 60 days of the window expiry (Developer €300, Professional €600), which opens a new 12-month update window.' },
    { q: 'Do my customers get the source code?',
      a: 'The framework runtime is closed-source; your application code (metadata, Angular customizations, .NET hooks) is yours and stays in your repository. Customers receive the built application and its data in their own SQL database.' },
    { q: 'Is there lock-in for my customers?',
      a: 'Application data lives in the customer\'s SQL Server, MySQL, PostgreSQL or Oracle database. Metadata lives in SQL tables under their control. The runtime is closed, but nothing is hosted by us: installations keep running without any contact with our servers, license checks are offline.' },
  ];

  constructor() {
    inject(SeoService).set({
      titleKey: 'seo.softwareHouse.title',
      descriptionKey: 'seo.softwareHouse.description',
      path: '/software-house',
      structuredData: [
        articleSchema({
          headline: 'WUIC for software houses — ship customer projects with per-server licensing',
          description:
            'Three-year cost of ownership of WUIC versus Retool and Budibase for a software house delivering to multiple customers, resale rights and per-customer fingerprint licensing.',
          path: '/software-house',
          datePublished: '2026-09-06',
        }),
        faqPageSchema(this.faqsSchemaCopy.map(f => ({ question: f.q, answer: f.a }))),
        breadcrumbsSchema([
          { name: 'Home', pathOrUrl: '/' },
          { name: 'Software houses', pathOrUrl: '/software-house' },
        ]),
      ],
    });
  }

  onInput(target: 'developers' | 'clients' | 'endUsers', ev: Event): void {
    const raw = Number((ev.target as HTMLInputElement).value);
    this[target].set(Number.isFinite(raw) ? raw : 0);
  }

  money(value: number, currency: 'EUR' | 'USD'): string {
    const n = Math.round(value).toLocaleString('en-US');
    return currency === 'EUR' ? `€${n}` : `$${n}`;
  }

  private clamp(n: number): number {
    return Math.min(100000, Math.max(0, Math.floor(n || 0)));
  }
}
