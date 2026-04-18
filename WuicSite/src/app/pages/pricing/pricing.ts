import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { RouterLink } from '@angular/router';
import { PurchaseDialog } from './purchase-dialog';
import { PRODUCTS, PurchaseProduct } from './paypal.config';

interface FeatureRow {
  feature: string;
  dev: boolean;
  pro: boolean;
}

interface FeatureGroup {
  title: string;
  rows: FeatureRow[];
}

@Component({
  selector: 'app-pricing',
  imports: [CardModule, ButtonModule, RouterLink, PurchaseDialog],
  templateUrl: './pricing.html',
  styleUrl: './pricing.scss'
})
export class Pricing {

  /** Currently selected product (drives PurchaseDialog). */
  selectedProduct: PurchaseProduct | null = null;
  purchaseDialogVisible = false;

  /** Triggered by "Acquista ora" buttons. */
  openPurchase(productKey: keyof typeof PRODUCTS): void {
    this.selectedProduct = PRODUCTS[productKey];
    this.purchaseDialogVisible = true;
  }

  featureGroups: FeatureGroup[] = [
    {
      title: 'Data & UI core',
      rows: [
        { feature: 'List / Grid, Form / Dialog, Datasource, DataRepeater', dev: true, pro: true },
        { feature: 'Kanban, Scheduler, Map, Tree, Carousel, Chart', dev: true, pro: true },
        { feature: 'Filtri, paging, sorting, export / import Excel', dev: true, pro: true },
        { feature: 'Field widget (lookup, upload, HTML editor, code editor, …)', dev: true, pro: true },
        { feature: 'Temi PrimeNG, dark mode, internazionalizzazione multilingua', dev: true, pro: true },
      ]
    },
    {
      title: 'Business logic & sicurezza',
      rows: [
        { feature: 'Autorizzazioni (route / tabella / colonna), audit trail, logic delete', dev: true, pro: true },
        { feature: 'Notifiche real-time (WebSocket)', dev: true, pro: true },
        { feature: 'Scheduler / Job engine', dev: true, pro: true },
        { feature: 'Custom CRUD override', dev: true, pro: true },
        { feature: 'Concurrency control', dev: true, pro: true },
      ]
    },
    {
      title: 'Feature premium',
      rows: [
        { feature: 'Spreadsheet, Pivot Grid', dev: false, pro: true },
        { feature: 'Dashboard Designer WYSIWYG', dev: false, pro: true },
        { feature: 'Workflow Designer + Runner', dev: false, pro: true },
        { feature: 'Report Designer (Stimulsoft) + Report Viewer', dev: false, pro: true },
        { feature: 'Pivot Builder con auto-materializzazione', dev: false, pro: true },
        { feature: 'RAG Chatbot (AI)', dev: false, pro: true },
        { feature: 'In-Memory CRUD (IndexedDB offline-first)', dev: false, pro: true },
      ]
    }
  ];
}
