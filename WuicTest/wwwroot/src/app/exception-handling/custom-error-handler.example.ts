/**
 * ──────────────────────────────────────────────────────────────────────────
 *  Esempio: estendere la gestione eccezioni del framework WUIC
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  Il framework esporta `GlobalHandler` (che implementa `ErrorHandler` di
 *  Angular) come default handler delle eccezioni client. Il consumer ha 3
 *  punti di estensione, in ordine di invasività crescente:
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ Pattern 1 — Subscribe a `GlobalHandler.messageNotification`         │
 *  │                                                                      │
 *  │ Cross-cutting (analytics, telemetria, logging custom). Non altera   │
 *  │ il flusso. Si aggiunge accanto al subscribe gia' presente in        │
 *  │ `app.component.ts` per il dialog. CONSIGLIATO per la maggior parte  │
 *  │ dei casi.                                                            │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ Pattern 2 — Subclass `GlobalHandler` con override di `handleError`  │
 *  │                                                                      │
 *  │ Permette di intercettare l'errore PRIMA che il framework decida cosa│
 *  │ fare (es. inserire una telemetria sincrona, filtrare per errorCode, │
 *  │ tradurre certi errori in altro). Chiama `super.handleError(e)` per  │
 *  │ delegare il default. Wirato in `app.config.ts`:                     │
 *  │   { provide: ErrorHandler, useClass: MyCustomHandler }              │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │ Pattern 3 — Replace completo (NON CONSIGLIATO)                      │
 *  │                                                                      │
 *  │ Implementare `ErrorHandler` da zero senza estendere `GlobalHandler` │
 *  │ disabilita TUTTE le typed envelope, traduzioni, dialog SQL          │
 *  │ passthrough, NG04002 routing, ecc. Solo se hai requisiti molto      │
 *  │ specifici e sei pronto a re-implementare il flusso.                  │
 *  └──────────────────────────────────────────────────────────────────────┘
 */

import { ErrorHandler, Injectable } from '@angular/core';
import { GlobalHandler } from '../wuic-bridges/core';

/* ──────────────────────────────────────────────────────────────────────── *
 *  Pattern 1 — Subscribe (cross-cutting telemetry)
 * ──────────────────────────────────────────────────────────────────────── *
 *
 *  Da chiamare UNA VOLTA in `AppComponent.ngOnInit` (o equivalente). Ogni
 *  emit di `GlobalHandler.messageNotification` ti passa l'eccezione gia'
 *  tipizzata (con `errorCode`, `args`, eventuale `traceId` server-side).
 *
 *  Esempio: invio a un servizio di analytics (Sentry / Application
 *  Insights / endpoint custom) di TUTTE le eccezioni `errors.client.*`,
 *  filtrando rumore noto come `errors.client.archetype.list.init_failed`
 *  che non e' azionabile.
 */
export function installCustomTelemetry(): void {
  GlobalHandler.messageNotification.subscribe((data: any) => {
    const exc = data?.exception;
    if (!exc?.errorCode) return;

    // Filtra rumore: archetype init failures sono spesso problemi metadata
    // a configurazione, non bug applicativi.
    if (String(exc.errorCode).startsWith('errors.client.archetype.')) return;

    // Esempio: invio JSON a un endpoint analytics interno.
    // L'eccezione contiene gia' `errorCode` + `args` + opzionale `traceId`
    // (se l'errore arrivava dal server).
    const payload = {
      errorCode:   exc.errorCode,
      args:        exc.args,
      traceId:     exc.traceId,
      title:       exc.title,
      url:         typeof window !== 'undefined' ? window.location.href : '',
      ts:          new Date().toISOString(),
    };

    // fetch('/analytics/client-errors', { method: 'POST', body: JSON.stringify(payload), credentials: 'include' });
    console.info('[CustomTelemetry] would send', payload);
  });
}

/* ──────────────────────────────────────────────────────────────────────── *
 *  Pattern 2 — Subclass GlobalHandler
 * ──────────────────────────────────────────────────────────────────────── *
 *
 *  Esempio d'uso (in `app.config.ts`):
 *    import { MyCustomErrorHandler } from './exception-handling/...';
 *    providers: [
 *      ...
 *      { provide: ErrorHandler, useClass: MyCustomErrorHandler },
 *    ]
 *
 *  Override di `handleError` permette di:
 *    - Loggare/inviare a telemetria PRIMA del rendering del dialog.
 *    - Filtrare errori che NON vuoi mostrare all'utente (es. errori
 *      provenienti da estensioni browser, ad blocker, terze parti).
 *    - Convertire un errore generico in tipizzato e poi delegare a super.
 *    - Aggiungere context (build version, user role, feature flags).
 */
@Injectable()
export class MyCustomErrorHandler extends GlobalHandler {
  override handleError(e: any): void {
    // Esempio 1: filtra errori noti che NON vuoi mostrare al user.
    const msg = (typeof e?.message === 'string' ? e.message : '') as string;
    if (msg.includes('ResizeObserver loop limit exceeded')) {
      // Non azionabile — silently drop.
      console.debug('[MyCustomErrorHandler] suppressed known noise:', msg);
      return;
    }

    // Esempio 2: invio sincrono a logger custom prima di delegare.
    try {
      // logToCustomBackend({ stage: 'pre-handle', errorCode: e?.error?.errorCode, msg });
    } catch { /* noop — logger custom non deve mai rompere il flusso */ }

    // Esempio 3: arricchisci args server-side con info applicative.
    if (typeof e?.error?.errorCode === 'string' && e?.error?.args) {
      e.error.args = {
        ...e.error.args,
        appVersion: (window as any).__myAppVersion || 'dev',
        userRole:   (window as any).__myAppUserRole || 'unknown',
      };
    }

    // Delega al GlobalHandler default — typed envelopes, traduzioni,
    // dialog SQL passthrough, NG04002, ecc. continuano a funzionare.
    super.handleError(e);
  }
}

/* ──────────────────────────────────────────────────────────────────────── *
 *  Pattern 3 — Replace completo (DANGEROUS, esempio commentato)
 * ──────────────────────────────────────────────────────────────────────── *
 *
 *  NON IMPLEMENTARE A MENO CHE NON TI SERVA DAVVERO. Disabilita tutte le
 *  funzionalita' del GlobalHandler (typed envelopes server, traduzioni,
 *  SQL passthrough, NG04002 routing, dynamic-template error tagging).
 *
 *  ```
 *  @Injectable()
 *  export class FullCustomHandler implements ErrorHandler {
 *    handleError(e: any): void {
 *      console.error('Caught', e);
 *      // Mostra un alert nudo — NESSUNA traduzione, NESSUN errorCode.
 *      alert('Errore: ' + (e?.message || 'unknown'));
 *    }
 *  }
 *  ```
 */

/* ──────────────────────────────────────────────────────────────────────── *
 *  Pattern 4 — Throw eccezioni tipizzate dal codice consumer
 * ──────────────────────────────────────────────────────────────────────── *
 *
 *  Se il consumer ha logica custom che vuole emettere un errore tipizzato
 *  (con stesso flusso di traduzione + dialog), puo' importare le classi
 *  dal framework e lanciare una `WuicClientException`.
 *
 *  Esempio in un service applicativo:
 *
 *  ```
 *  import { WuicClientException } from 'wuic-framework-lib-src/exception/WuicClientException';
 *
 *  if (!myConfig.enabled) {
 *    throw new WuicClientException(
 *      'errors.myapp.feature_disabled',
 *      { feature: 'export-pdf' },
 *      { surface: 'service', targetName: 'MyAppService.exportPdf' }
 *    );
 *  }
 *  ```
 *
 *  Aggiungi la traduzione `errors.myapp.feature_disabled` nel tuo seed
 *  `_wuic_translations` (it-IT + en-US, eventualmente altri locale) e
 *  l'utente vedra' il dialog localizzato senza ulteriori configurazioni.
 */
