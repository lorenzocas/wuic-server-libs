import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { BadgeModule } from 'primeng/badge';
import { WuicRagChatbotComponent } from '../rag-chatbot/rag-chatbot.component';
import { LicenseFeatureService } from '../../service/license-feature.service';
import { NotificationRealtimeService, NotificationItem } from '../../service/notification-realtime.service';

/**
 * Floating Action Button (FAB) bottom-right che apre il chatbot RAG come
 * dialog overlay non-modale. Riusa il componente esistente
 * {@link WuicRagChatbotComponent} che ha gia' la persistenza cronologia in
 * `_rag_chat_messages` + il flow async con notifiche real-time
 * (vedi `RagController.Ask` + `NotificationRealtimeService`).
 *
 * Visibilita' gated dalla feature `rag-chatbot` di
 * {@link LicenseFeatureService}: il FAB non si renderizza se la licenza
 * corrente non include la feature pro. Reattivo via `status$()`.
 *
 * Badge unread: conta le notifiche `rag.message.ready/error` non lette
 * (mostrato sopra il FAB quando il dialog NON e' aperto). All'apertura
 * del dialog il badge si azzera visualmente (non chiama mark-read globale -
 * lasciamo che l'utente gestisca le notifiche dal bell se vuole).
 *
 * Usage in app host (WuicTest, CrmApp, ecc.):
 *
 * ```html
 * <wuic-rag-chatbot-fab></wuic-rag-chatbot-fab>
 * ```
 *
 * Sara' visibile solo agli utenti con licenza pro. Posizionamento `position:fixed`
 * bottom-right via stile interno del componente, non interferisce col layout host.
 */
@Component({
  selector: 'wuic-rag-chatbot-fab',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    DialogModule,
    TooltipModule,
    BadgeModule,
    WuicRagChatbotComponent,
  ],
  templateUrl: './rag-chatbot-fab.component.html',
  styleUrl: './rag-chatbot-fab.component.scss',
  // OnPush: il subtree del FAB (button + badge + dialog + chatbot) non
  // viene re-CD-ato dai CD globali triggerati da click altrove sull'app
  // o dagli eventi zone-patched (resize, mousemove, ecc.). Elimina il
  // freeze visibile quando l'utente clicca il FAB su route WUIC admin
  // pesanti (wrapper BoundedRepeater + MetadataEditor con function-call
  // nei template).
  //
  // Requisito di correttezza: il chatbot figlio <wuic-rag-chatbot>
  // chiama `cdr.markForCheck()` dopo ogni mutation del proprio state
  // (vedi applyMessageToTurn / loadSession / onSend / ngOnInit). Senza
  // quella chiamata, quando una notifica push aggiorna un turn, lo
  // spinner "Sto interrogando..." non si sostituisce col content
  // perche' OnPush non walk il subtree del FAB fino al chatbot.
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None: il p-dialog con `[appendTo]="'body'"` viene
  // appeso fuori dallo scope del component, quindi gli stili emulated (taggati
  // con `[_nghost-xxx]`) NON lo raggiungerebbero. Tutti i selettori in scss
  // sono namespaced con `.wuic-rag-fab*` → nessun rischio di leakage globale.
  encapsulation: ViewEncapsulation.None,
})
export class WuicRagChatbotFabComponent implements OnInit, OnDestroy {
  /** Tooltip dell'icona FAB. */
  @Input() fabTooltip = 'Chiedi al codebase WUIC';

  /** Titolo del dialog (passato anche al chatbot interno). */
  @Input() dialogTitle = 'Assistente codebase WUIC';

  /** Larghezza del dialog. PrimeNG accetta CSS units. */
  @Input() dialogWidth = '500px';

  /** Altezza area chat (passata al `<wuic-rag-chatbot>` interno). */
  @Input() chatHeight = '480px';

  /**
   * Forza la visibilita' bypassando il check licenza. Usato in dev/test
   * o per skin CrmApp che vogliono mostrare il chatbot sempre.
   * Default false: visibile solo se `LicenseFeatureService.has('rag-chatbot')`.
   */
  @Input() forceVisible = false;

  /** Stato visibilita' dialog. */
  dialogVisible = false;

  /**
   * Flag "sticky" di primo-apertura. Diventa `true` al primo click sul FAB
   * e NON torna mai piu' a false. Guarda il mount del `<wuic-rag-chatbot>`
   * nel template: finche' resta false la chatbot non esiste in DOM, quindi
   * non chiama `ragService.health()` in ngOnInit. Evita il `GET
   * /api/Rag/Health` a ogni page refresh quando l'utente non apre mai la
   * chatbot (tipico caso: RAG server Python offline sul remoto -> 503
   * Service Unavailable rosso in console a ogni refresh).
   *
   * Design: intenzionalmente sticky (no reset al `close`). PrimeNG p-dialog
   * con content gia' montato si limita a show/hide CSS, quindi mantenere
   * il chatbot istanziato dopo il primo open da UX piu' reattiva alle
   * ri-aperture (niente ngOnInit ripetuto, niente rimonto subscribe).
   */
  dialogOpened = false;

  /** True quando la licenza concede la feature `rag-chatbot`. */
  licenseAllowed = false;

  /** Counter unread per il badge sul FAB. */
  unreadRagCount = 0;

  private subs = new Subscription();

  constructor(
    private readonly licenseService: LicenseFeatureService,
    private readonly notificationRT: NotificationRealtimeService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Subscribe al license status. La status$() emette null finche' refresh()
    // non e' stata chiamata almeno una volta da APP_INITIALIZER (vedi pattern
    // standard WUIC) - finche' non sappiamo, restiamo nascosti (fail-closed).
    // markForCheck: OnPush richiede notifica esplicita del change.
    this.subs.add(this.licenseService.status$().subscribe(() => {
      this.licenseAllowed = this.licenseService.has('rag-chatbot');
      this.cdr.markForCheck();
    }));

    // Conta le notifiche unread di tipo RAG per badge sul FAB.
    this.subs.add(this.notificationRT.notifications$.subscribe((notifs: NotificationItem[]) => {
      const next = (!Array.isArray(notifs))
        ? 0
        : notifs.filter(n =>
            !n.isRead && (n.type === 'rag.message.ready' || n.type === 'rag.message.error')
          ).length;
      if (next !== this.unreadRagCount) {
        this.unreadRagCount = next;
        this.cdr.markForCheck();
      }
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get visible(): boolean {
    return this.forceVisible || this.licenseAllowed;
  }

  /**
   * Toggle del dialog. Usiamo il flow zone-normale (no runOutsideAngular)
   * perche' il chatbot figlio (<wuic-rag-chatbot>) e le sue subscribe a
   * `NotificationRealtimeService.notifications$` devono essere registrate
   * DENTRO la zona Angular: il callback della subscribe mutare lo stato
   * dell'assistant turn (`loading=false`, `content=...`) e deve poter
   * triggerare CD per aggiornare la UI.
   *
   * Il tradeoff e' che il click triggera CD globale via zone.js, che su
   * route admin (/<route>/<action> con BoundedRepeaterComponent +
   * MetadataEditorComponent) puo' prendere 1-2s per via delle method-call
   * nel template del wrapper. Mitigazioni applicate:
   *  - OnPush sul FAB: il subtree del FAB (button + badge + dialog) non
   *    viene re-CD-ato dai CD globali.
   *  - [appendTo]="'body'" sul p-dialog: il content e' fuori dal subtree
   *    del FAB, evita layout interaction col parent.
   *
   * Fix piu' profondo (follow-up): rendere OnPush anche il BoundedRepeater
   * e il MetadataEditor, o memoizzare gli isCurrentUserAdmin() /
   * shouldRenderFilterBar() / isDeletableMenuItem() in property invece
   * che metodi chiamati dai template.
   */
  toggleDialog(): void {
    this.dialogVisible = !this.dialogVisible;
    if (this.dialogVisible) {
      // Primo click della sessione -> il chatbot va istanziato ora (guard
      // `@if (dialogOpened)` nel template). Dopo questo assegnamento il
      // flag resta true per l'intera lifetime del FAB: apri/chiudi
      // successivi riusano il chatbot gia' montato.
      this.dialogOpened = true;
      // L'utente sta aprendo il dialog per vedere gli item indicati dal badge:
      // marchiamo come lette le notifiche RAG non lette così il badge si azzera
      // coerentemente con la history che sta per vedere.
      void this.markRagNotificationsAsRead();
    }
    this.cdr.markForCheck();
  }

  private async markRagNotificationsAsRead(): Promise<void> {
    const notifs = this.notificationRT.notifications$.getValue() || [];
    const unreadRag = notifs.filter(n =>
      !n.isRead && (n.type === 'rag.message.ready' || n.type === 'rag.message.error')
    );
    for (const n of unreadRag) {
      await this.notificationRT.markRead(n.id);
    }
  }

  onDialogHide(): void {
    this.dialogVisible = false;
    this.cdr.markForCheck();
  }
}
