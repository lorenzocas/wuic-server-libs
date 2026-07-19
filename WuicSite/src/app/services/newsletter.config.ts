/**
 * Config newsletter Buttondown — SINGLE SOURCE dell'username.
 *
 * CONFIG-GATED: finché `BUTTONDOWN_USERNAME` resta il placeholder, il
 * componente <app-newsletter-signup> NON si renderizza affatto → nessuna
 * modifica visibile al sito finché non esiste un account Buttondown reale.
 *
 * Per attivarla:
 *   1. Crea l'account su https://buttondown.com e prendi il tuo username.
 *   2. Sostituisci BUTTONDOWN_USERNAME qui sotto.
 *   3. Deploy. Il form appare (footer + blog) e iscrive via double-opt-in.
 *
 * NB: NIENTE API key lato client (è segreta). Usiamo l'endpoint pubblico di
 * embed-subscribe con un POST `no-cors`: l'iscrizione parte e Buttondown
 * invia l'email di conferma (double opt-in) — noi mostriamo lo stato
 * ottimistico "controlla la posta".
 */

/** Username Buttondown. Placeholder `__BUTTONDOWN_USERNAME__` = disattivato. */
export const BUTTONDOWN_USERNAME = '__BUTTONDOWN_USERNAME__';

/** Endpoint pubblico embed-subscribe (form POST, no API key). */
export function buttondownSubscribeUrl(): string {
  return `https://buttondown.email/api/emails/embed-subscribe/${encodeURIComponent(BUTTONDOWN_USERNAME)}`;
}

/** True quando l'username è configurato per davvero. */
export function isNewsletterConfigured(): boolean {
  return !!BUTTONDOWN_USERNAME && !BUTTONDOWN_USERNAME.startsWith('__');
}
