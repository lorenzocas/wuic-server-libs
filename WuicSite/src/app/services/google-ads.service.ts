import { afterNextRender, effect, inject, Injectable } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ConsentService } from './consent.service';
import { ADS_CONVERSION_ID, CONVERSION_LABELS, isAdsConfigured } from './analytics.config';

type GtagFn = (...args: unknown[]) => void;

/**
 * Google Ads tag (gtag.js) con **Consent Mode v2**.
 *
 * Flusso (tutto browser-only, mai in prerender):
 *   1. bootstrap(): imposta il consent DEFAULT = tutto `denied` (EU-first,
 *      `wait_for_update`) PRIMA di caricare gtag.js → il tag opera in modalità
 *      cookieless finché l'utente non acconsente. Poi inietta gtag.js e fa
 *      `config` sull'ID Ads.
 *   2. effect() su ConsentService.state → `consent update`: quando l'utente
 *      accetta la categoria "marketing" (stessa del PayPal SDK) i segnali
 *      `ad_storage`/`ad_user_data`/`ad_personalization`/`analytics_storage`
 *      passano a `granted`; su reject tornano `denied`.
 *   3. trackConversion(goal): spara l'evento conversione mappato in
 *      CONVERSION_LABELS. Convive con i goal Plausible (indipendenti).
 *
 * CONFIG-GATED: se l'ID Ads è il placeholder, ogni metodo è no-op → nessun
 * gtag, nessun dataLayer, nessun consent default. Zero impatto finché non
 * esiste un account Ads reale (analytics.config.ts).
 */
@Injectable({ providedIn: 'root' })
export class GoogleAdsService {
  private readonly consent = inject(ConsentService);
  private readonly doc = inject(DOCUMENT);

  private ready = false;
  private lastMarketing: boolean | null = null;

  constructor() {
    // Sync consenso → Consent Mode. Registrato SUBITO (sincrono, injection
    // context ok). Su denied iniziale è no-op finché bootstrap non è pronto,
    // poi bootstrap() riapplica lo stato corrente.
    effect(() => {
      const marketing = this.consent.state().marketing;
      this.applyConsent(marketing);
    });

    // Caricamento tag: SOLO browser (afterNextRender non gira in prerender).
    afterNextRender(() => this.bootstrap());
  }

  /** Inietta gtag.js con consent default denied + config Ads. Idempotente. */
  private bootstrap(): void {
    if (this.ready || !isAdsConfigured()) { return; }

    const w = this.win();
    if (!w) { return; }

    w.dataLayer = w.dataLayer || [];
    const gtag: GtagFn = (...args) => { w.dataLayer!.push(args); };
    w.gtag = gtag;

    // Consent Mode v2 DEFAULT — tutto negato prima di ogni tag Google.
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      wait_for_update: 500,
    });

    gtag('js', new Date());
    gtag('config', ADS_CONVERSION_ID);

    // Script async di Google (una volta sola).
    const s = this.doc.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ADS_CONVERSION_ID)}`;
    this.doc.head.appendChild(s);

    this.ready = true;
    // Riapplica lo stato consenso corrente (utente che aveva già accettato in
    // una sessione precedente → grant immediato).
    this.applyConsent(this.consent.state().marketing);
  }

  /** consent update in base alla categoria marketing. */
  private applyConsent(marketing: boolean): void {
    if (!this.ready || !isAdsConfigured()) { return; }
    if (this.lastMarketing === marketing) { return; }
    this.lastMarketing = marketing;

    const v = marketing ? 'granted' : 'denied';
    this.win()?.gtag?.('consent', 'update', {
      ad_storage: v,
      ad_user_data: v,
      ad_personalization: v,
      analytics_storage: v,
    });
  }

  /**
   * Spara una conversione Ads per il goal indicato (se ha un label
   * configurato). Sotto Consent Mode v2 l'evento è sicuro anche con consenso
   * negato (ping cookieless / conversion modeling) — la privacy la governa il
   * consent state, non il gating dell'evento.
   */
  trackConversion(goal: string): void {
    if (!this.ready || !isAdsConfigured()) { return; }
    const label = CONVERSION_LABELS[goal];
    if (!label) { return; }
    this.win()?.gtag?.('event', 'conversion', {
      send_to: `${ADS_CONVERSION_ID}/${label}`,
    });
  }

  private win(): (Window & { dataLayer?: unknown[]; gtag?: GtagFn }) | null {
    const w = this.doc.defaultView as (Window & { dataLayer?: unknown[]; gtag?: GtagFn }) | null;
    return w ?? null;
  }
}
