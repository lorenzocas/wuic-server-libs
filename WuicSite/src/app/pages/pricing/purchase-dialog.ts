import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ElementRef, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PurchaseProduct, PAYPAL_CONFIG } from './paypal.config';
import { loadPaypalSdk, PaypalConsentRequiredError, PaypalNotConfiguredError } from './paypal-loader';
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
  private translate = inject(TranslateService);

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

    // Localized in the buyer's currently-active site language via ngx-translate.
    // All keys live under `purchaseDialog.successMail.*` in /assets/i18n/<lang>.json.
    // Uses `instant()` (synchronous) because translations are eagerly loaded at
    // app start, so by the time the dialog reaches the success state they are
    // already in cache. Fallback to the bare key string if a translation is
    // missing (still valid email body, just less polished).
    const t = (key: string, params?: object) =>
      this.translate.instant(`purchaseDialog.successMail.${key}`, params);

    const subject = t('subject', {
      sku: this.product.sku,
      orderId: this.successInfo.orderId,
    });

    const lines: string[] = [
      t('greeting'),
      ``,
      t('intro', { product: this.product.label }),
      t('amount', { amount: this.successInfo.amount, currency: this.successInfo.currency }),
      t('orderId', { orderId: this.successInfo.orderId }),
      t('payerEmail', { email: this.successInfo.payerEmail }),
      ``,
      t('licenseEmail', { email: this.email || this.successInfo.payerEmail }),
      t('fingerprint', {
        fingerprint: this.machineFingerprint || t('fingerprintPlaceholder'),
      }),
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
      lines.push(t('invoicingHeader'));
      if (this.invoicingCompanyName.trim()) lines.push(t('invoicingCompanyName', { value: this.invoicingCompanyName.trim() }));
      if (this.invoicingVatNumber.trim())   lines.push(t('invoicingVatNumber',   { value: this.invoicingVatNumber.trim() }));
      if (this.invoicingSdiCode.trim())     lines.push(t('invoicingSdiCode',     { value: this.invoicingSdiCode.trim() }));
      if (this.invoicingAddress.trim())     lines.push(t('invoicingAddress',     { value: this.invoicingAddress.trim() }));
    }

    lines.push('');
    lines.push(t('signoff'));

    const body = lines.join('\n');
    return `mailto:${PAYPAL_CONFIG.LICENSE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  private async initialize(): Promise<void> {
    this.state = 'loading-sdk';
    this.cd.markForCheck();

    try {
      // `loadPaypalSdk` first calls `GET /api/paypal/config` to discover the
      // ClientId+Mode the server is currently set to (sandbox/live), then
      // loads the SDK. If the server reports `configured: false` (placeholder
      // or empty ClientId in appsettings.json) it throws PaypalNotConfiguredError
      // which we map to the dedicated "not-configured" state below.
      this.paypalInstance = await loadPaypalSdk(this.consent.canLoadMarketing());
      this.state = 'sdk-ready';
      this.cd.markForCheck();
      // Defer button render to next tick so #paypalContainer ViewChild is attached
      setTimeout(() => this.renderButton(), 0);
    } catch (err: any) {
      if (err instanceof PaypalNotConfiguredError) {
        this.state = 'not-configured';
        this.cd.markForCheck();
        return;
      }
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

      // Server-side order creation. We send the buyer info (email,
      // fingerprint, optional invoicing fields) so the backend can log
      // them alongside the PayPal order id for traceability. The server
      // is the source of truth for amount/SKU validation — see
      // WuicSiteApi/Program.cs `ProductCatalog`.
      createOrder: async (_data: any, _actions: any) => {
        const res = await fetch(`${PAYPAL_CONFIG.API_BASE_URL}/paypal/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: product.sku,
            amountEur: product.priceEur,
            currency: PAYPAL_CONFIG.CURRENCY,
            label: product.label,
            email: this.email,
            machineFingerprint: this.machineFingerprint,
            invoicingCompanyName: this.invoicingCompanyName,
            invoicingVatNumber: this.invoicingVatNumber,
            invoicingSdiCode: this.invoicingSdiCode,
            invoicingAddress: this.invoicingAddress,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`create-order failed: ${res.status} ${text}`);
        }
        const json = await res.json();
        return json.orderId as string;
      },

      // Server-side capture. The browser SDK only forwards the order id —
      // the backend talks to PayPal v2 with the Client SECRET and returns
      // the canonical receipt (amount, payer, captureId).
      onApprove: async (data: any, _actions: any) => {
        this.state = 'processing';
        this.cd.markForCheck();
        try {
          const orderId = data?.orderID;
          if (!orderId) throw new Error('missing orderID from PayPal');

          const res = await fetch(`${PAYPAL_CONFIG.API_BASE_URL}/paypal/capture-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Forward all the buyer info to the backend on capture too,
            // so it can include them in the post-capture notification email
            // (see WuicSiteApi/Program.cs `EmailSender.SendCaptureNotificationAsync`).
            // Sent on capture (not just on createOrder) because the email is
            // composed at capture time — passing them here keeps the backend
            // stateless (no per-orderId cache between create and capture).
            body: JSON.stringify({
              orderId,
              email: this.email,
              machineFingerprint: this.machineFingerprint,
              invoicingCompanyName: this.invoicingCompanyName,
              invoicingVatNumber: this.invoicingVatNumber,
              invoicingSdiCode: this.invoicingSdiCode,
              invoicingAddress: this.invoicingAddress,
            }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`capture failed: ${res.status} ${text}`);
          }
          const capture = await res.json();

          this.successInfo = {
            orderId: capture.orderId ?? orderId,
            payerEmail: capture.payerEmail ?? '',
            amount: capture.amount ?? this.amountString,
            currency: capture.currency ?? PAYPAL_CONFIG.CURRENCY,
            productLabel: capture.productLabel || product.label,
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
