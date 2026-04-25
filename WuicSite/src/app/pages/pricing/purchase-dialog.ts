import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ElementRef, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseProduct, PAYPAL_CONFIG } from './paypal.config';
import { isPaypalConfigured, loadPaypalSdk, PaypalConsentRequiredError } from './paypal-loader';
import { ConsentService } from '../../services/consent.service';

@Component({
  selector: 'app-purchase-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, MessageModule, DecimalPipe, RouterLink, TranslatePipe],
  templateUrl: './purchase-dialog.html',
  styleUrl: './purchase-dialog.scss',
})
export class PurchaseDialog implements OnChanges, AfterViewInit, OnDestroy {

  @Input() visible = false;
  @Input() product: PurchaseProduct | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();

  @ViewChild('paypalContainer') paypalContainer?: ElementRef<HTMLDivElement>;

  email = '';
  machineFingerprint = '';

  // ── Optional invoicing fields ────────────────────────────────────────
  // Required by Italian law for B2B sales (Fattura Elettronica via SdI).
  // Optional for B2C consumers — they can leave blank and we'll invoice
  // with their codice fiscale. Hidden behind a collapsible section so
  // private buyers see a minimal form by default.
  invoicingExpanded = false;
  invoicingCompanyName = '';
  invoicingVatNumber = '';
  invoicingSdiCode = '';      // 7-char alphanumeric or "0000000" (consumer) / "XXXXXXX" (foreign)
  invoicingAddress = '';

  toggleInvoicing(): void {
    this.invoicingExpanded = !this.invoicingExpanded;
  }

  state: 'idle' | 'loading-sdk' | 'sdk-ready' | 'not-configured' | 'needs-consent' | 'processing' | 'success' | 'error' = 'idle';
  errorMessage = '';

  private consent = inject(ConsentService);

  successInfo: {
    orderId: string;
    payerEmail: string;
    amount: string;
    currency: string;
    productLabel: string;
  } | null = null;

  private paypalInstance: any = null;
  private buttonsInstance: any = null;

  constructor(private cd: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) {
        this.initialize();
      } else {
        this.resetDialog();
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.visible) this.initialize();
  }

  ngOnDestroy(): void {
    this.teardownButtons();
  }

  onClose(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.resetDialog();
  }

  get amountString(): string {
    if (!this.product) return '0.00';
    return this.product.priceEur.toFixed(2);
  }

  get mailtoHref(): string {
    if (!this.successInfo || !this.product) return '';
    const subject = `WUIC licenza — ${this.product.sku} — ord ${this.successInfo.orderId}`;

    const lines: string[] = [
      `Ciao,`,
      ``,
      `ho appena acquistato: ${this.product.label}`,
      `Importo: ${this.successInfo.amount} ${this.successInfo.currency}`,
      `PayPal Order ID: ${this.successInfo.orderId}`,
      `Email PayPal: ${this.successInfo.payerEmail}`,
      ``,
      `Email su cui intestare la licenza: ${this.email || this.successInfo.payerEmail}`,
      `Machine fingerprint del server: ${this.machineFingerprint || '[da inviare dopo aver installato WUIC e chiamato GET /api/Meta/LicenseStatus]'}`,
    ];

    // Append invoicing fields ONLY if at least one is filled — keeps the
    // email tidy for B2C buyers who don't need a fattura elettronica.
    const hasAnyInvoicing =
      !!this.invoicingCompanyName.trim() ||
      !!this.invoicingVatNumber.trim() ||
      !!this.invoicingSdiCode.trim() ||
      !!this.invoicingAddress.trim();

    if (hasAnyInvoicing) {
      lines.push('');
      lines.push('--- Dati per fattura elettronica ---');
      if (this.invoicingCompanyName.trim()) lines.push(`Ragione sociale: ${this.invoicingCompanyName.trim()}`);
      if (this.invoicingVatNumber.trim()) lines.push(`P.IVA / Codice Fiscale: ${this.invoicingVatNumber.trim()}`);
      if (this.invoicingSdiCode.trim()) lines.push(`Codice destinatario SdI / PEC: ${this.invoicingSdiCode.trim()}`);
      if (this.invoicingAddress.trim()) lines.push(`Indirizzo: ${this.invoicingAddress.trim()}`);
    }

    lines.push('');
    lines.push('Grazie.');

    const body = lines.join('\n');
    return `mailto:${PAYPAL_CONFIG.LICENSE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  private async initialize(): Promise<void> {
    if (!isPaypalConfigured()) {
      this.state = 'not-configured';
      this.cd.markForCheck();
      return;
    }

    this.state = 'loading-sdk';
    this.cd.markForCheck();

    try {
      this.paypalInstance = await loadPaypalSdk(this.consent.canLoadMarketing());
      this.state = 'sdk-ready';
      this.cd.markForCheck();
      // Defer button render to next tick so #paypalContainer ViewChild is attached
      setTimeout(() => this.renderButton(), 0);
    } catch (err: any) {
      if (err instanceof PaypalConsentRequiredError) {
        // User has not opted in to marketing cookies — show consent prompt
        // (template branch) instead of a generic error. The user can click
        // the button in that branch to re-open the cookie banner.
        this.state = 'needs-consent';
        this.cd.markForCheck();
        return;
      }
      this.state = 'error';
      this.errorMessage = err?.message ?? 'SDK load error';
      this.cd.markForCheck();
    }
  }

  /**
   * Re-open the cookie banner from the "needs-consent" state in the dialog.
   * When the user accepts marketing cookies there, they can click "Retry"
   * and the SDK will be loaded normally.
   */
  openCookiePreferences(): void {
    this.consent.reopen();
  }

  /**
   * Retry loading the PayPal SDK after the user has (presumably) granted
   * marketing consent via the cookie banner. No-op if consent is still missing.
   */
  retryAfterConsent(): void {
    if (!this.consent.canLoadMarketing()) return;
    this.initialize();
  }

  private renderButton(): void {
    if (!this.paypalInstance || !this.paypalContainer || !this.product) return;

    this.teardownButtons();

    const product = this.product;
    this.buttonsInstance = this.paypalInstance.Buttons({
      style: { layout: 'vertical', color: 'blue', shape: 'rect', label: 'paypal' },
      createOrder: (_data: any, actions: any) => actions.order.create({
        purchase_units: [{
          description: product.label,
          custom_id: product.sku,
          amount: {
            value: product.priceEur.toFixed(2),
            currency_code: PAYPAL_CONFIG.CURRENCY,
          },
        }],
        application_context: {
          brand_name: 'WUIC Framework',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
        },
      }),
      onApprove: async (_data: any, actions: any) => {
        this.state = 'processing';
        this.cd.markForCheck();
        try {
          const details = await actions.order.capture();
          const unit = details?.purchase_units?.[0];
          this.successInfo = {
            orderId: details?.id ?? _data?.orderID ?? '(unknown)',
            payerEmail: details?.payer?.email_address ?? '',
            amount: unit?.payments?.captures?.[0]?.amount?.value ?? this.amountString,
            currency: unit?.payments?.captures?.[0]?.amount?.currency_code ?? PAYPAL_CONFIG.CURRENCY,
            productLabel: product.label,
          };
          // Pre-fill email from PayPal payer if user didn't type one
          if (!this.email && this.successInfo.payerEmail) {
            this.email = this.successInfo.payerEmail;
          }
          this.state = 'success';
          this.cd.markForCheck();
        } catch (err: any) {
          this.state = 'error';
          this.errorMessage = err?.message ?? 'Capture failed';
          this.cd.markForCheck();
        }
      },
      onError: (err: any) => {
        this.state = 'error';
        this.errorMessage = err?.message ?? 'Payment error';
        this.cd.markForCheck();
      },
      onCancel: () => {
        // User closed the PayPal window — stay in sdk-ready state, allow retry
      },
    });

    this.buttonsInstance.render(this.paypalContainer.nativeElement);
  }

  private teardownButtons(): void {
    try {
      this.buttonsInstance?.close?.();
    } catch {
      // ignore
    }
    this.buttonsInstance = null;
    if (this.paypalContainer?.nativeElement) {
      this.paypalContainer.nativeElement.innerHTML = '';
    }
  }

  private resetDialog(): void {
    this.teardownButtons();
    this.state = 'idle';
    this.errorMessage = '';
    this.successInfo = null;
    this.email = '';
    this.machineFingerprint = '';
    this.invoicingExpanded = false;
    this.invoicingCompanyName = '';
    this.invoicingVatNumber = '';
    this.invoicingSdiCode = '';
    this.invoicingAddress = '';
  }
}
