import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsentService } from '../../services/consent.service';

/**
 * GDPR cookie banner — shown on first visit (or when consent older than 6 months).
 *
 * Two views:
 *  - compact: Accept all / Reject / Personalize
 *  - expanded: detailed toggles per category + save button
 */
@Component({
  selector: 'app-cookie-banner',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss'
})
export class CookieBanner {
  private consent = inject(ConsentService);

  readonly visible = this.consent.bannerVisible;
  readonly expanded = signal<boolean>(false);

  /** Marketing toggle value while the user is customizing (expanded view). */
  readonly marketingToggle = signal<boolean>(false);

  readonly technicalLocked = computed(() => true);

  acceptAll(): void {
    this.consent.acceptAll();
    this.expanded.set(false);
  }

  rejectAll(): void {
    this.consent.rejectAll();
    this.expanded.set(false);
  }

  toggleExpanded(): void {
    // Initialize toggles with the current consent state when opening
    if (!this.expanded()) {
      this.marketingToggle.set(this.consent.state().marketing);
    }
    this.expanded.update(v => !v);
  }

  savePreferences(): void {
    this.consent.savePreferences({ marketing: this.marketingToggle() });
    this.expanded.set(false);
  }

  onMarketingToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.marketingToggle.set(input.checked);
  }
}
