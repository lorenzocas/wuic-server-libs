import { Component, inject, OnInit } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseDialog } from './purchase-dialog';
import { PRODUCTS, PAYPAL_CONFIG, PurchaseProduct } from './paypal.config';
import { fetchPaypalConfig } from './paypal-loader';
import { SeoService } from '../../services/seo.service';

interface FeatureRow {
  key: string;   // i18n subkey under pricing.comparison.rows
  dev: boolean;
  pro: boolean;
}

interface FeatureGroup {
  titleKey: string;  // i18n subkey under pricing.comparison.groups
  rows: FeatureRow[];
}

@Component({
  selector: 'app-pricing',
  imports: [CardModule, ButtonModule, MessageModule, RouterLink, PurchaseDialog, TranslatePipe],
  templateUrl: './pricing.html',
  styleUrl: './pricing.scss'
})
export class Pricing implements OnInit {

  /** Currently selected product (drives PurchaseDialog). */
  selectedProduct: PurchaseProduct | null = null;
  purchaseDialogVisible = false;

  /**
   * True when the backend reports a usable PayPal Client ID in its current
   * Mode (`Paypal:Mode` in appsettings.json: sandbox|live).
   * When false, the /pricing page hides the "Acquista ora" buttons and
   * shows a "contact us by email" fallback — so we can deploy the site even
   * before the PayPal credentials are populated on the server.
   *
   * Optimistic default: assume true so the buttons show immediately. If the
   * backend says otherwise the field flips to false on `ngOnInit`. The
   * "not configured" state is rare in practice (only during the very first
   * deploy before secrets are in place), so the brief flash is acceptable.
   */
  paypalAvailable = true;

  constructor() {
    inject(SeoService).set({ titleKey: 'seo.pricing.title', descriptionKey: 'seo.pricing.description', path: '/pricing' });
  }

  ngOnInit(): void {
    // Fetch runtime config from backend — single source of truth for the
    // ClientId+Mode (sandbox/live), so a server-side switch propagates to
    // the SPA without a rebuild. See `paypal-loader.fetchPaypalConfig()`.
    fetchPaypalConfig()
      .then(cfg => { this.paypalAvailable = cfg.configured; })
      .catch(() => { /* network error — keep optimistic true, dialog will surface real error */ });
  }

  /** Contact email shown in the fallback banner when PayPal is not wired. */
  readonly contactEmail: string = PAYPAL_CONFIG.LICENSE_EMAIL;

  /** `mailto:` href used by the fallback CTA — prefilled with product context. */
  buildContactMailto(productKey: keyof typeof PRODUCTS): string {
    const product = PRODUCTS[productKey];
    const subject = `WUIC licenza — interesse ${product?.sku ?? productKey}`;
    const body = [
      `Ciao,`,
      ``,
      `sono interessato a: ${product?.label ?? productKey}`,
      `Importo indicativo: ${product ? product.priceEur.toFixed(2) : '?'} EUR`,
      ``,
      `Vi prego di inviarmi le istruzioni per finalizzare l'acquisto.`,
      ``,
      `Grazie.`,
    ].join('\n');
    return `mailto:${this.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  /** Triggered by "Acquista ora" buttons (only rendered when paypalAvailable). */
  openPurchase(productKey: keyof typeof PRODUCTS): void {
    this.selectedProduct = PRODUCTS[productKey];
    this.purchaseDialogVisible = true;
  }

  /**
   * Feature comparison rows — only ✓/✗ state + i18n keys live here.
   * Group title and row labels are resolved at render time from the loaded
   * translation JSON under `pricing.comparison.groups.{titleKey}` and
   * `pricing.comparison.rows.{rowKey}`.
   */
  featureGroups: FeatureGroup[] = [
    {
      titleKey: 'core',
      rows: [
        { key: 'listForm',   dev: true, pro: true },
        { key: 'archetypes', dev: true, pro: true },
        { key: 'filters',    dev: true, pro: true },
        { key: 'widgets',    dev: true, pro: true },
        { key: 'themes',     dev: true, pro: true },
      ]
    },
    {
      titleKey: 'business',
      rows: [
        { key: 'authz',       dev: true, pro: true },
        { key: 'realtime',    dev: true, pro: true },
        { key: 'scheduler',   dev: true, pro: true },
        { key: 'customCrud',  dev: true, pro: true },
        { key: 'concurrency', dev: true, pro: true },
      ]
    },
    {
      titleKey: 'premium',
      rows: [
        { key: 'spreadsheet',       dev: false, pro: true },
        { key: 'dashboardDesigner', dev: false, pro: true },
        { key: 'workflow',          dev: false, pro: true },
        { key: 'reportDesigner',    dev: false, pro: true },
        { key: 'pivotBuilder',      dev: false, pro: true },
        { key: 'rag',               dev: false, pro: true },
        { key: 'offline',           dev: false, pro: true },
      ]
    }
  ];
}
