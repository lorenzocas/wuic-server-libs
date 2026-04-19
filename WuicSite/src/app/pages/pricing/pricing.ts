import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseDialog } from './purchase-dialog';
import { PRODUCTS, PAYPAL_CONFIG, PurchaseProduct } from './paypal.config';
import { isPaypalConfigured } from './paypal-loader';

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
export class Pricing {

  /** Currently selected product (drives PurchaseDialog). */
  selectedProduct: PurchaseProduct | null = null;
  purchaseDialogVisible = false;

  /**
   * True when a real PayPal Client ID is wired in the active environment.
   * When false, the /pricing page hides the "Acquista ora" buttons and shows
   * a "contact us by email" fallback instead — so we can deploy the site even
   * before the live PayPal credentials are ready.
   */
  readonly paypalAvailable: boolean = isPaypalConfigured();

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
