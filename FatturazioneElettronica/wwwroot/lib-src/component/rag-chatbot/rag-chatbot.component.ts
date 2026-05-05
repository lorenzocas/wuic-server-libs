import { ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, ElementRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { BadgeModule } from 'primeng/badge';
import { ChipModule } from 'primeng/chip';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import {
  RagAskAcceptedResponse,
  RagChatHistorySnapshot,
  RagChatMessageDto,
  RagChatTurn,
  RagHealthResponse,
  RagSource,
  WuicRagService,
} from '../../service/wuic-rag.service';
import { NotificationRealtimeService, NotificationItem } from '../../service/notification-realtime.service';
import { WtoolboxService } from '../../service/wtoolbox.service';

/**
 * Singolo turno della conversazione visualizzato nel chatbot.
 *
 * Ora include `assistantMessageId` (id DB della riga in _rag_chat_messages) e
 * `correlationId` (GUID associato al pair user+assistant) per correlare le
 * notifiche real-time di completamento async al turno specifico.
 */
export interface RagChatbotTurn {
  /** id DB della riga _rag_chat_messages. -1 finche' non confermato. */
  messageId?: number;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  mode?: 'rag-llm' | 'retrieval-only' | null;
  sources?: RagSource[];
  warning?: string | null;
  errorMessage?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** GUID di correlazione (usato per match notifica completion). */
  correlationId?: string;
}

/**
 * Componente standalone che espone una chat sopra il RAG del codebase WUIC.
 *
 * Modalita' (input `mode`):
 * - `auto`     : usa chat (RAG+LLM) se il backend ha l'API key Claude, altrimenti retrieval pure
 * - `chat`     : forza la modalita' RAG+LLM (mostra errore se LLM non disponibile)
 * - `retrieval`: forza la modalita' retrieval pure (top-K snippets)
 *
 * **Persistenza & async (v2 2026-04-20)**:
 * - La cronologia e' persistita in `dbo._rag_chat_sessions` + `dbo._rag_chat_messages`
 *   (vedi `scripts/add-rag-chat-history.sql`).
 * - Ogni invio passa per `POST /api/Rag/Ask` che ritorna SUBITO con `assistantMessageId`
 *   in stato `pending`; il backend chiama il rag server Python in background.
 * - Quando il rag server risponde, il backend UPDATE assistant message + ENQUEUE
 *   notifica al bell con `target_json={path:/rag-chatbot, queryParams:{sessionId, messageId}}`.
 * - Questo componente subscribe a `NotificationRealtimeService.notifications$` per
 *   intercettare notifiche `rag.message.ready/error` di sessioni nostre (anche
 *   quando l'utente e' su un'altra pagina, alla riapertura il deep-link porta qui
 *   con sessionId+messageId in URL).
 */
@Component({
  selector: 'wuic-rag-chatbot',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    TextareaModule,
    BadgeModule,
    ChipModule,
    ScrollPanelModule,
    ProgressSpinnerModule,
    TooltipModule,
    MessageModule,
    DialogModule,
  ],
  templateUrl: './rag-chatbot.component.html',
  styleUrl: './rag-chatbot.component.scss',
})
export class WuicRagChatbotComponent implements OnInit, OnDestroy {
  /** Titolo mostrato nell'header del chatbot. */
  @Input() title = 'Assistente codebase WUIC';

  /** Modalita' operativa: vedi nota nella classDoc. */
  @Input() mode: 'auto' | 'chat' | 'retrieval' = 'auto';

  /** Numero di chunk top-K da chiedere al RAG (default 5). */
  @Input() topK = 5;

  /** Mostra/nasconde i source chip nei messaggi assistant. */
  @Input() showSources = true;

  /** Numero massimo di turni di history mantenuti in UI (load DB rispetta sempre). */
  @Input() maxHistory = 50;

  /** Placeholder dell'input. */
  @Input() placeholder = 'Chiedi qualcosa sul codebase WUIC (italiano o inglese)...';

  /** Modello Claude da usare in modalita' chat (default haiku 4.5). */
  @Input() model = 'claude-haiku-4-5-20251001';

  /** Altezza fissa dell'area chat in CSS units (default `420px`). */
  @Input() chatHeight = '420px';

  /** Mostra il bottone "Svuota cronologia" nell'header. */
  @Input() showClearButton = true;

  // ----- Outputs -----

  /** Emette quando l'utente clicca su un source chip. */
  @Output() resultSelected = new EventEmitter<RagSource>();

  /** Emette in caso di errore HTTP non recuperabile. */
  @Output() errorOccurred = new EventEmitter<{ message: string; details?: unknown }>();

  /** Emette dopo ogni turno (user o assistant) aggiunto alla history. */
  @Output() turnAdded = new EventEmitter<RagChatbotTurn>();

  // ----- Stato interno -----

  history: RagChatbotTurn[] = [];
  inputValue = '';
  /** True solo durante il roundtrip iniziale di Ask (insert pair); il pending
   *  successivo mostra spinner sul singolo turno, NON blocca il send. */
  loading = false;
  healthInfo: RagHealthResponse | null = null;
  healthError: string | null = null;

  /** id sessione corrente (null = nessuna sessione caricata o nuova non ancora creata). */
  currentSessionId: number | null = null;

  /**
   * Map assistantMessageId -> riferimento al turno UI corrispondente.
   * Usato per ritrovare il turno quando arriva la notifica async di completion.
   */
  private pendingMap = new Map<number, RagChatbotTurn>();

  /**
   * Set di notification.id gia' processate per dedup (la notifications$ del
   * NotificationRealtimeService emette TUTTO lo snapshot ad ogni update,
   * non solo i delta).
   */
  private processedNotificationIds = new Set<number>();

  /** Sub a notificationRT.notifications$ + ActivatedRoute.queryParams. */
  private subs = new Subscription();

  /**
   * Source selezionato per il dialog preview. Null = dialog chiuso.
   * Il dialog mostra SOLO lo snippet embedded in RagSource (max 500 char dal
   * rag_server.py _format_sources). NON mostra il path del file sorgente ne
   * apre VSCode: il chunk e' autocontenuto e sufficiente per capire il contesto.
   */
  selectedSource: RagSource | null = null;

  @ViewChild('inputTextarea') inputTextarea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLElement>;

  constructor(
    private readonly ragService: WuicRagService,
    private readonly cdr: ChangeDetectorRef,
    @Optional() private readonly route?: ActivatedRoute,
    @Optional() private readonly router?: Router,
    @Optional() private readonly notificationRT?: NotificationRealtimeService,
  ) {}

  ngOnInit(): void {
    // 1. Probe health del backend (esistente)
    // markForCheck necessario per aggiornare healthInfo/healthError quando
    // il componente ha un ancestor OnPush (es. dentro FAB dialog).
    this.ragService.health().subscribe({
      next: (info) => { this.healthInfo = info; this.cdr.markForCheck(); },
      error: (err) => { this.healthError = this.extractErrorMessage(err); this.cdr.markForCheck(); },
    });

    // 2. Deep-link da notifica: ?sessionId=X(&messageId=Y) -> carica history.
    //    Se manca, lazy: la sessione viene creata al primo Ask.
    if (this.route) {
      this.subs.add(this.route.queryParamMap.subscribe((qp) => {
        const sid = Number(qp.get('sessionId') || 0);
        const mid = Number(qp.get('messageId') || 0);
        if (sid > 0 && sid !== this.currentSessionId) {
          this.loadSession(sid, mid > 0 ? mid : null);
        }
      }));
    }

    // 3. Subscribe alle notifiche real-time. Filtriamo type rag.message.* +
    //    payload.sessionId match + dedup via processedNotificationIds.
    // handleNotification -> refreshSingleMessage -> applyMessageToTurn
    // applyMessageToTurn chiama internamente markForCheck, quindi la
    // catena e' gia' OnPush-safe.
    if (this.notificationRT) {
      this.subs.add(this.notificationRT.notifications$.subscribe((notifs) => {
        if (!Array.isArray(notifs) || notifs.length === 0) return;
        for (const n of notifs) {
          this.handleNotification(n);
        }
      }));
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  // ----- Computed getters per template -----

  get effectiveMode(): 'rag-llm' | 'retrieval-only' {
    if (this.mode === 'retrieval') return 'retrieval-only';
    if (this.mode === 'chat') return 'rag-llm';
    return this.healthInfo?.llm_enabled ? 'rag-llm' : 'retrieval-only';
  }

  get modeBadgeLabel(): string {
    if (this.healthError) return 'RAG offline';
    if (!this.healthInfo) return 'connessione...';
    return this.effectiveMode === 'rag-llm' ? 'RAG + LLM' : 'retrieval';
  }

  get modeBadgeSeverity(): 'success' | 'info' | 'warn' | 'danger' {
    if (this.healthError) return 'danger';
    if (!this.healthInfo) return 'info';
    return this.effectiveMode === 'rag-llm' ? 'success' : 'info';
  }

  /** Disabilita il send button SOLO durante la chiamata Ask (~200ms), NON durante il pending. */
  get sendDisabled(): boolean {
    return this.loading || !this.inputValue.trim() || !!this.healthError;
  }

  // ----- Azioni utente -----

  /**
   * Invia il prompt corrente via flow async:
   * 1. Append turno user (placeholder, sara' ricevuto messageId nell'ack);
   * 2. Append turno assistant pending (loading=true);
   * 3. POST /api/Rag/Ask -> ack arriva subito;
   * 4. Pending registrato in pendingMap; risposta arriva via notifica push (o
   *    via reload manuale della pagina).
   */
  async onSend(): Promise<void> {
    const text = this.inputValue.trim();
    if (!text || this.loading || this.healthError) return;

    const userTurn: RagChatbotTurn = { role: 'user', content: text };
    const assistantTurn: RagChatbotTurn = {
      role: 'assistant',
      content: '',
      loading: true,
      sources: [],
    };

    this.history = [...this.history, userTurn, assistantTurn];
    this.trimHistory();
    this.turnAdded.emit(userTurn);
    this.inputValue = '';
    this.loading = true;
    this.cdr.markForCheck();
    this.scheduleScrollToBottom();

    try {
      const ack: RagAskAcceptedResponse = await this.ragService.askAsync({
        prompt: text,
        sessionId: this.currentSessionId,
        mode: this.mode,
        topK: this.topK,
        model: this.model,
      });

      // Salva la sessione corrente (puo' essere stata appena creata)
      this.currentSessionId = ack.sessionId;
      userTurn.messageId = ack.userMessageId;
      assistantTurn.messageId = ack.assistantMessageId;
      assistantTurn.correlationId = ack.correlationId;
      this.pendingMap.set(ack.assistantMessageId, assistantTurn);

      // Da qui in poi, il completamento arriva via:
      //   - notificationRT.notifications$  (push WebSocket o polling)
      //   - oppure se l'utente ricarica la pagina, via loadSession()
      // L'utente puo' inviare nuovi prompt mentre questo e' ancora pending.
    } catch (err) {
      assistantTurn.errorMessage = this.extractErrorMessage(err);
      assistantTurn.loading = false;
      this.errorOccurred.emit({ message: assistantTurn.errorMessage, details: err });
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
      this.scheduleScrollToBottom();
      this.focusInput();
    }
  }

  /**
   * Svuota la cronologia chat (soft-delete della sessione corrente sul DB) +
   * reset stato locale.
   */
  async onClearHistory(): Promise<void> {
    if (this.history.length === 0 && !this.currentSessionId) return;

    let confirmed = true;
    try {
      const tools = WtoolboxService as unknown as { promptDialog?: (opts: unknown) => Promise<unknown> };
      if (typeof tools.promptDialog === 'function') {
        const res = await tools.promptDialog({
          title: 'Svuotare cronologia?',
          message: 'Vuoi cancellare definitivamente questa sessione di chat?',
          confirmLabel: 'Svuota',
          cancelLabel: 'Annulla',
        });
        confirmed = !!res && (res as { confirmed?: boolean }).confirmed !== false;
      }
    } catch { confirmed = true; }

    if (!confirmed) return;

    if (this.currentSessionId) {
      try { await this.ragService.deleteSessionAsync(this.currentSessionId); } catch { /* best effort */ }
    }
    this.history = [];
    this.pendingMap.clear();
    this.currentSessionId = null;
  }

  /**
   * Click dispatcher:
   *   - docs chunk (docs/pages/<slug>.md) -> navigate a /framework-docs/<slug>
   *   - skill chunk (skills/<name>/SKILL.md) -> preview snippet inline (no route)
   *   - code chunk -> preview snippet inline
   * NON apriamo mai link/editor esterni sui file del codice sorgente.
   */
  onSourceClick(source: RagSource): void {
    this.resultSelected.emit(source);
    if (this.isDocsSource(source)) {
      this.onDocsClick(source);
    } else {
      // Skill chunks + code chunks -> dialog preview snippet
      this.selectedSource = source;
    }
  }

  closeSourcePreview(): void {
    this.selectedSource = null;
  }

  /**
   * Naviga alla pagina docs. Se il Router non e' disponibile (raro, componente
   * usato fuori da contesto routing) fallback a manipolazione hash location.
   */
  onDocsClick(source: RagSource): void {
    const slug = this.docsSlug(source);
    if (!slug) return;
    if (this.router) {
      this.router.navigate(['/framework-docs', slug]);
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.hash = `#/framework-docs/${slug}`;
    }
  }

  // -------------------------------------------------------------------
  // Classification: docs / skill / code source
  // -------------------------------------------------------------------

  /**
   * Match rel_path pattern `.../docs/pages/[<locale>/]<slug>.md`.
   * Locale opzionale (en-US, fr-FR, es-ES, de-DE) - la pagina target e' la
   * stessa (router gestisce la localizzazione lato app).
   */
  isDocsSource(source: RagSource): boolean {
    return !!this.docsSlug(source);
  }

  docsSlug(source: RagSource): string | null {
    const p = source?.rel_path || '';
    // Accetta sia forward-slash (linux/paths normalizzati) che backslash (Windows)
    const norm = p.replace(/\\/g, '/');
    const m = norm.match(/docs\/pages\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)\.md$/i);
    return m ? m[1] : null;
  }

  /**
   * Match rel_path pattern `.../skills/<skill-name>/SKILL.md`. Le skills sono
   * guide operative canoniche (es. `wuic-crud-api`, `dashboard-boardcontent`)
   * indicizzate nel RAG ma NON presenti nel docs manifest pubblico del framework
   * - quindi NON hanno una route `/framework-docs/<slug>` corrispondente.
   * Al click apriamo il preview snippet inline come per i code chunks.
   */
  isSkillSource(source: RagSource): boolean {
    return !!this.skillSlug(source);
  }

  skillSlug(source: RagSource): string | null {
    const p = source?.rel_path || '';
    const norm = p.replace(/\\/g, '/');
    const m = norm.match(/\/skills\/([^/]+)\/[^/]+\.md$/i);
    return m ? m[1] : null;
  }

  /**
   * Label del chip. Mostra:
   * - docs chunk: `docs: <slug>` (la pagina e' univoca per slug)
   * - code chunk: `symbol_name` se unico nel turno corrente, altrimenti
   *   `symbol_name · <filename>` per disambiguare chunk con stesso symbol
   *   in file diversi (es. due `updateCurrentRecord` in file differenti).
   *   Se symbol_name manca: `<filename>` o `snippet N`.
   *
   * Niente path del file sorgente (solo basename = informazione
   * equivalente a stacktrace, non filesystem leak).
   *
   * @param source il source da etichettare
   * @param allSources opzionale: tutti i sources del turno corrente per
   *   decidere se applicare la disambiguazione. Passato dal template via
   *   `sourceLabel(source, turn.sources)`.
   */
  sourceLabel(source: RagSource, allSources?: RagSource[]): string {
    // Tier 1a: documentazione framework
    const docSlug = this.docsSlug(source);
    if (docSlug) return `docs: ${docSlug}`;
    // Tier 1b: guide operative skill/
    const sklSlug = this.skillSlug(source);
    if (sklSlug) return `skill: ${sklSlug}`;

    const fname = this.sourceFileName(source);
    const sym = source.symbol_name;
    const lineRange = (source.start_line && source.end_line)
      ? `${source.start_line}-${source.end_line}`
      : null;

    if (sym) {
      if (allSources) {
        const sameSym = allSources.filter(s => s.symbol_name === sym);
        if (sameSym.length > 1) {
          // Duplicato su symbol_name. Scegli il discriminante minimo:
          //   - filename se differisce tra i duplicati,
          //   - altrimenti line range (stesso file = devono avere linee diverse).
          const sameFile = sameSym.every(s => this.sourceFileName(s) === fname);
          if (!sameFile && fname) return `${sym} · ${fname}`;
          if (sameFile && lineRange) return `${sym} · ${lineRange}`;
          // Fallback: entrambi mancanti, usa rank
          return `${sym} #${source.rank}`;
        }
      }
      return sym;
    }
    if (fname) return lineRange ? `${fname} · ${lineRange}` : fname;
    return `snippet ${source.rank}`;
  }

  /**
   * Dedup lato UI dei chunk ridondanti. Applichiamo 2 regole, dalla piu' stretta
   * alla piu' ampia:
   *
   *   1. stesso `chunk_id` -> scarta (stesso chunk ritornato piu' volte, raro
   *      ma possibile con re-ranking CE+LoRA).
   *
   *   2. stesso `rel_path + symbol_name` -> scarta. Il chunker di
   *      generate_embeddings.py usa sliding windows e assegna a ogni window
   *      il symbol_name del body a cui appartiene. Metodi lunghi (es.
   *      `updateCurrentRecord` in designer.component.ts) vengono spezzati
   *      in N chunk con LO STESSO symbol_name -> mostrare N chip per "la
   *      stessa funzione" e' rumore UX. Mantengo il primo per ranking (che
   *      il cross-encoder ha giudicato il piu' pertinente).
   *
   * Chiamata dal template per la lista fonti del turno corrente.
   */
  dedupSources(sources: RagSource[] | undefined | null): RagSource[] {
    if (!sources || sources.length === 0) return [];
    const seenChunk = new Set<string>();
    const seenSymbol = new Set<string>();
    const out: RagSource[] = [];
    for (const s of sources) {
      const chunkKey = s.chunk_id || `${s.rel_path}:${s.start_line}:${s.end_line}:${s.symbol_name}`;
      if (seenChunk.has(chunkKey)) continue;

      if (s.symbol_name && s.rel_path) {
        const symbolKey = `${s.rel_path}::${s.symbol_name}`;
        if (seenSymbol.has(symbolKey)) continue;
        seenSymbol.add(symbolKey);
      }

      seenChunk.add(chunkKey);
      out.push(s);
    }
    return out;
  }

  /**
   * Tooltip del chip. Diverso per docs (naviga) vs code (preview inline).
   * Nessun path del file sorgente in nessun caso.
   */
  sourceTooltip(source: RagSource): string {
    if (this.isDocsSource(source)) return 'Apri pagina documentazione';
    if (this.isSkillSource(source)) return 'Mostra snippet skill guide';
    const parts: string[] = [];
    if (source.symbol_type) parts.push(source.symbol_type);
    if (source.start_line && source.end_line) parts.push(`${source.start_line}-${source.end_line}`);
    return parts.join(' · ') || 'Mostra snippet';
  }

  /** Titolo del dialog preview (code chunk o skill chunk). */
  sourceDialogTitle(source: RagSource | null): string {
    if (!source) return 'Snippet';
    const sklSlug = this.skillSlug(source);
    if (sklSlug) return `skill: ${sklSlug}`;
    if (source.symbol_name) return source.symbol_name;
    return `Snippet #${source.rank}`;
  }

  /**
   * Nome del file (basename) del chunk sorgente. Informativo per l'utente
   * che vuole sapere da che componente/servizio proviene lo snippet, senza
   * esporre path filesystem completo. Es. "designer.component.ts".
   * Ritorna null se rel_path assente.
   */
  sourceFileName(source: RagSource | null): string | null {
    const p = (source?.rel_path || '').replace(/\\/g, '/').trim();
    if (!p) return null;
    const last = p.split('/').pop();
    return last || null;
  }

  /**
   * Presentazione del path del file nel dialog preview.
   *
   * - Per chunk provenienti da **WuicTest/** (esempi curati dei pattern): mostra
   *   il path relativo completo interno al progetto con prefix `/wuicTest/...`
   *   cosi' l'utente puo' localizzare l'esempio nella codebase WuicTest, anche
   *   se non e' cliccabile.
   * - Per tutti gli altri chunk (framework lib, skills, docs, ecc.): mostra
   *   solo il basename - nessun leak del path interno del framework.
   */
  sourceFilePath(source: RagSource | null): string | null {
    const p = (source?.rel_path || '').replace(/\\/g, '/').trim();
    if (!p) return null;
    const lower = p.toLowerCase();

    // WuicTest chunks: path completo relativo con prefix /wuicTest/
    const idxWt = lower.indexOf('wuictest/');
    if (idxWt >= 0) {
      const rest = p.substring(idxWt + 'wuictest/'.length);
      return `/wuicTest/${rest}`;
    }

    // Skill chunks: path dalla cartella skills/ in giu' con prefix /skills/
    const idxSk = lower.indexOf('/skills/');
    if (idxSk >= 0) {
      const rest = p.substring(idxSk + '/skills/'.length);
      return `/skills/${rest}`;
    }

    // Altri chunk: solo basename (no path leak del framework interno)
    return this.sourceFileName(source);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSend();
    }
  }

  // ----- Notifiche real-time + history reload -----

  /**
   * Filtra UNA notifica ricevuta dal NotificationRealtimeService:
   * - type deve essere `rag.message.ready` o `rag.message.error`;
   * - payload.sessionId match con currentSessionId (oppure carica nuova session);
   * - dedup via processedNotificationIds (lo snapshot $ ri-emette tutto).
   */
  private handleNotification(n: NotificationItem): void {
    if (!n || (n.type !== 'rag.message.ready' && n.type !== 'rag.message.error')) return;
    if (this.processedNotificationIds.has(n.id)) return;

    let payload: { sessionId?: number; messageId?: number; correlationId?: string; status?: string } = {};
    try { payload = JSON.parse(n.payloadJson || '{}'); } catch { return; }

    const sid = Number(payload.sessionId || 0);
    const mid = Number(payload.messageId || 0);
    if (sid <= 0 || mid <= 0) return;

    // Caso A: notifica per la sessione caricata in questo momento
    if (this.currentSessionId === sid) {
      this.processedNotificationIds.add(n.id);
      this.refreshSingleMessage(mid);
      return;
    }

    // Caso B: notifica per altra sessione (utente l'ha aperta in altro tab,
    // oppure sessione non ancora caricata). Non facciamo niente qui: il bell
    // del notification-bell mostra gia' la notifica con deep-link cliccabile.
    // Se l'utente clicca, ngOnInit > queryParams ricarica questa sessione.
  }

  /**
   * Carica un singolo messaggio dal DB e aggiorna il turno UI corrispondente
   * (se trovato in pendingMap, oppure cerca per messageId in history).
   */
  private async refreshSingleMessage(messageId: number): Promise<void> {
    if (!this.currentSessionId) return;
    try {
      const snap = await this.ragService.historyAsync(this.currentSessionId);
      const fresh = (snap?.messages || []).find((m) => m.id === messageId);
      if (!fresh) return;
      this.applyMessageToTurn(fresh);
      this.scheduleScrollToBottom();
    } catch {
      // best effort: se il reload fallisce, l'utente puo' sempre ricaricare la pagina
    }
  }

  /**
   * Carica history completa di una sessione (deep-link da notifica o refresh pagina).
   * Se highlightMessageId fornito, scrolla a quel messaggio dopo il render.
   */
  private async loadSession(sessionId: number, highlightMessageId: number | null): Promise<void> {
    try {
      const snap: RagChatHistorySnapshot = await this.ragService.historyAsync(sessionId);
      if (!snap || !snap.session) return;
      this.currentSessionId = snap.session.id;
      this.history = (snap.messages || []).map((m) => this.dtoToTurn(m));
      this.pendingMap.clear();
      // Re-popola pendingMap per i messaggi assistant ancora in attesa
      for (const turn of this.history) {
        if (turn.role === 'assistant' && turn.loading && turn.messageId) {
          this.pendingMap.set(turn.messageId, turn);
        }
      }
      this.cdr.markForCheck();
      this.scheduleScrollToBottom();
      if (highlightMessageId) {
        // Lascia tempo al render Angular di completare prima dello scroll
        setTimeout(() => this.scrollToMessage(highlightMessageId), 100);
      }
    } catch (err) {
      this.healthError = this.extractErrorMessage(err);
      this.cdr.markForCheck();
    }
  }

  private dtoToTurn(m: RagChatMessageDto): RagChatbotTurn {
    let sources: RagSource[] = [];
    if (m.sourcesJson) {
      try { sources = JSON.parse(m.sourcesJson) as RagSource[]; } catch { /* ignora JSON invalido */ }
    }
    const turn: RagChatbotTurn = {
      messageId: m.id,
      role: m.role,
      content: m.content || '',
      loading: m.status === 'pending',
      mode: (m.mode as 'rag-llm' | 'retrieval-only' | null) || null,
      sources,
      errorMessage: m.status === 'error' ? (m.errorMessage || 'Errore sconosciuto') : null,
      tokensIn: m.tokensIn,
      tokensOut: m.tokensOut,
      correlationId: m.correlationId,
    };
    if (turn.role === 'assistant' && turn.loading && (!turn.content || turn.content === '')) {
      turn.content = '';
    }
    return turn;
  }

  private applyMessageToTurn(m: RagChatMessageDto): void {
    let target = this.pendingMap.get(m.id);
    if (!target) {
      target = this.history.find((t) => t.messageId === m.id);
    }
    if (!target) return;

    target.loading = m.status === 'pending';
    target.mode = (m.mode as 'rag-llm' | 'retrieval-only' | null) || null;
    if (m.sourcesJson) {
      try { target.sources = JSON.parse(m.sourcesJson) as RagSource[]; } catch { /* ignora */ }
    }
    if (m.status === 'completed' && m.content) {
      target.content = m.content;
      target.errorMessage = null;
    } else if (m.status === 'error') {
      target.errorMessage = m.errorMessage || 'Errore sconosciuto';
    }
    target.tokensIn = m.tokensIn;
    target.tokensOut = m.tokensOut;
    if (!target.loading) {
      this.pendingMap.delete(m.id);
    }

    // markForCheck: la mutation avviene su un oggetto esistente dentro
    // `this.history` (nested property), invisibile ad Angular con
    // ChangeDetectionStrategy.OnPush dei componenti ancestor (es. quando
    // il chatbot e' proiettato dentro <wuic-rag-chatbot-fab> che e' OnPush
    // per evitare freeze da CD globale). Senza markForCheck, il tick
    // successivo skippa il subtree del FAB e il turno resta "in caricamento"
    // visualmente anche se lo stato e' gia' aggiornato. Su route diretta
    // (parent Default) e' un no-op innocuo.
    this.cdr.markForCheck();
  }

  private scrollToMessage(messageId: number): void {
    if (typeof document === 'undefined') return;
    const el = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ----- Helpers (esistenti, riutilizzati) -----

  private trimHistory(): void {
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(this.history.length - this.maxHistory);
    }
  }

  private scheduleScrollToBottom(): void {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      const el = this.scrollContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private focusInput(): void {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => this.inputTextarea?.nativeElement?.focus(), 0);
  }

  private extractErrorMessage(err: unknown): string {
    if (!err) return 'Errore sconosciuto';
    const anyErr = err as { error?: { error?: string; details?: string; hint?: string }; message?: string; status?: number; statusText?: string };
    if (anyErr.error?.error) {
      const baseMsg = anyErr.error.details ? `${anyErr.error.error}: ${anyErr.error.details}` : anyErr.error.error;
      return anyErr.error.hint ? `${baseMsg} - ${anyErr.error.hint}` : baseMsg;
    }
    if (anyErr.message) return anyErr.message;
    if (anyErr.statusText) return `${anyErr.status} ${anyErr.statusText}`;
    return JSON.stringify(err);
  }
}
