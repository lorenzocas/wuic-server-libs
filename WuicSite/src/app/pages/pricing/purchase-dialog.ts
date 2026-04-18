import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TranslatePipe } from '@ngx-translate/core';
import { PurchaseProduct, PAYPAL_CONFIG } from './paypal.config';
import { isPaypalConfigured, loadPaypalSdk } from './paypal-loader';

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

  state: 'idle' | 'loading-sdk' | 'sdk-ready' | 'not-configured' | 'processing' | 'success' | 'error' = 'idle';
  errorMessage = '';

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
    const body = [
      `Ciao,`,
      ``,
      `ho appena acquistato: ${this.product.label}`,
      `Importo: ${this.successInfo.amount} ${this.successInfo.currency}`,
      `PayPal Order ID: ${this.successInfo.orderId}`,
      `Email PayPal: ${this.successInfo.payerEmail}`,
      ``,
      `Email su cui intestare la licenza: ${this.email || this.successInfo.payerEmail}`,
      `Machine fingerprint del server: ${this.machineFingerprint || '[da inviare dopo aver installato WUIC e chiamato GET /api/Meta/LicenseStatus]'}`,
      ``,
      `Grazie.`,
    ].join('\n');
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
      this.paypalInstance = await loadPaypalSdk();
      this.state = 'sdk-ready';
      this.cd.markForCheck();
      // Defer button render to next tick so #paypalContainer ViewChild is attached
      setTimeout(() => this.renderButton(), 0);
    } catch (err: any) {
      this.state = 'error';
      this.errorMessage = err?.message ?? 'SDK load error';
      this.cd.markForCheck();
    }
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
  }
}
