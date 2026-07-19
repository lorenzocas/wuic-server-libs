import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { buttondownSubscribeUrl, isNewsletterConfigured } from '../../services/newsletter.config';

type SignupState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Newsletter signup (Buttondown) riutilizzabile — footer + blog.
 *
 * CONFIG-GATED: `configured` è false col placeholder → il template non
 * renderizza nulla (nessun impatto finché non c'è un account Buttondown).
 *
 * Iscrizione via POST `no-cors` all'endpoint pubblico embed-subscribe: non
 * espone API key e non richiede backend. La response è opaca (no-cors) quindi
 * mostriamo lo stato ottimistico "conferma via email" (Buttondown fa il
 * double opt-in). Gli errori di RETE (offline) vengono comunque catturati.
 */
@Component({
  selector: 'app-newsletter-signup',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './newsletter-signup.html',
  styleUrl: './newsletter-signup.scss',
})
export class NewsletterSignup {
  readonly configured = isNewsletterConfigured();
  readonly email = signal('');
  readonly state = signal<SignupState>('idle');

  private static readonly EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async submit(evt: Event): Promise<void> {
    evt.preventDefault();
    if (!this.configured || this.state() === 'submitting') { return; }

    const email = this.email().trim();
    if (!NewsletterSignup.EMAIL_RE.test(email)) {
      this.state.set('error');
      return;
    }

    this.state.set('submitting');
    try {
      const body = new URLSearchParams({ email, tag: 'wuic-site' });
      await fetch(buttondownSubscribeUrl(), {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      // no-cors → response opaca: successo ottimistico (double opt-in in arrivo).
      this.state.set('success');
      this.email.set('');
    } catch {
      this.state.set('error');
    }
  }

  onInput(value: string): void {
    this.email.set(value);
    if (this.state() === 'error') { this.state.set('idle'); }
  }
}
