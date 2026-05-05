import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { WtoolboxService } from './wtoolbox.service';

/**
 * Singolo "source" (chunk del codebase) restituito dal RAG.
 *
 * Mappa 1:1 il payload `RagSourceOut` di `rag_server.py`.
 */
export interface RagSource {
  rank: number;
  chunk_id?: string | null;
  rel_path?: string | null;
  symbol_name?: string | null;
  symbol_type?: string | null;
  start_line?: number | null;
  end_line?: number | null;
  score_vector?: number | null;
  score_bm25?: number | null;
  snippet: string;
}

/**
 * Turno della cronologia chat passato al modello LLM in modalita' RAG+LLM.
 */
export interface RagChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Payload `POST /api/Rag/Query`. */
export interface RagQueryRequest {
  query: string;
  top_k?: number;
  use_lora?: boolean;
}

/** Risposta `POST /api/Rag/Query`. */
export interface RagQueryResponse {
  results: RagSource[];
}

/** Payload `POST /api/Rag/Chat`. */
export interface RagChatRequest {
  query: string;
  history?: RagChatTurn[];
  top_k?: number;
  model?: string;
}

/**
 * Risposta `POST /api/Rag/Chat`.
 *
 * Quando `mode === 'retrieval-only'`, il backend ha trovato `ANTHROPIC_API_KEY`
 * mancante o ha avuto un errore di chiamata Claude: `answer` e' null e
 * `warning` contiene la causa. I `sources` sono comunque popolati.
 */
export interface RagChatResponse {
  mode: 'rag-llm' | 'retrieval-only';
  answer: string | null;
  sources: RagSource[];
  warning?: string | null;
  model?: string | null;
  tokens_in?: number | null;
  tokens_out?: number | null;
}

/** Risposta `GET /api/Rag/Health`. */
export interface RagHealthResponse {
  status: string;
  llm_enabled: boolean;
  docs_loaded: number;
  translate_cache_size: number;
  loaded_at?: number | null;
  default_model: string;
}

// ===== Async chat history persistence DTO =====
//
// Mappa 1:1 i DTO C# in RagController.cs / Services/RagChat/RagChatModels.cs.
// Schema DB: scripts/add-rag-chat-history.sql.

/** Stato di un singolo messaggio (user prompt o assistant response). */
export type RagChatMessageStatus = 'pending' | 'completed' | 'error';

/** Una sessione = una conversazione (un utente puo' avere N sessioni). */
export interface RagChatSessionDto {
  id: number;
  userId: number;
  title?: string | null;
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
}

/** Un messaggio (turno) della cronologia. */
export interface RagChatMessageDto {
  id: number;
  sessionId: number;
  userId: number;
  role: 'user' | 'assistant';
  content?: string | null;    // null se status='pending'
  status: RagChatMessageStatus;
  mode?: 'rag-llm' | 'retrieval-only' | null;
  sourcesJson?: string | null;  // JSON array RagSource (deserializzato lato UI)
  errorMessage?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  correlationId: string;       // GUID
  createdAt: string;
  completedAt?: string | null;
}

/** Snapshot history completo (sessione + messaggi ordine cronologico). */
export interface RagChatHistorySnapshot {
  session: RagChatSessionDto;
  messages: RagChatMessageDto[];
}

/** Payload `POST /api/Rag/Ask` (async fire-and-forget). */
export interface RagAskRequest {
  prompt: string;
  /** null o 0 -> backend crea una nuova sessione (titolo auto-derivato). */
  sessionId?: number | null;
  /** "auto" | "chat" | "retrieval" (default "auto"). */
  mode?: 'auto' | 'chat' | 'retrieval';
  topK?: number;
  model?: string;
}

/** Risposta `POST /api/Rag/Ask` - ritornato SUBITO, prima del completamento. */
export interface RagAskAcceptedResponse {
  sessionId: number;
  userMessageId: number;
  assistantMessageId: number;
  correlationId: string;
  title?: string | null;
}

/**
 * Service tipizzato sopra `RagController` C# che a sua volta proxa il server
 * Python `rag_server.py`. Tutte le chiamate viaggiano con il cookie di sessione
 * `k-user` (auth gia' enforced dal middleware globale di KonvergenceCore).
 *
 * Il path API e' hardcoded su `/api/Rag/...` (path-relative al backend WUIC),
 * coerente con la skill `rag-chatbot-creation` che richiede WUIC-specific
 * deployment, non OEM.
 */
@Injectable({ providedIn: 'root' })
export class WuicRagService {
  constructor(private http: HttpClient) {}

  /**
   * Esegue una query di sola retrieval (top-K chunk) sul codebase.
   *
   * @param query Testo della query (italiano o inglese; il server traduce IT->EN dalla cache).
   * @param options `top_k` (default 8), `use_lora` (default true).
   */
  query(query: string, options: { topK?: number; useLora?: boolean } = {}): Observable<RagQueryResponse> {
    const payload: RagQueryRequest = {
      query,
      top_k: options.topK ?? 8,
      use_lora: options.useLora ?? true,
    };
    return this.http.post<RagQueryResponse>(this.buildUrl('Query'), payload, { withCredentials: true });
  }

  /** Variant Promise di {@link query}. */
  queryAsync(query: string, options: { topK?: number; useLora?: boolean } = {}): Promise<RagQueryResponse> {
    return firstValueFrom(this.query(query, options));
  }

  /**
   * Esegue una chat completa (RAG + Claude). Se il server non ha
   * `ANTHROPIC_API_KEY`, il backend degrada automaticamente in
   * modalita' `retrieval-only` (controlla `response.mode`).
   *
   * @param query Domanda dell'utente.
   * @param history Cronologia di messaggi precedenti (per multi-turn).
   * @param options `top_k` (default 5), `model` (default `claude-haiku-4-5-20251001`).
   */
  chat(
    query: string,
    history: RagChatTurn[] = [],
    options: { topK?: number; model?: string } = {},
  ): Observable<RagChatResponse> {
    const payload: RagChatRequest = {
      query,
      history,
      top_k: options.topK ?? 5,
      model: options.model ?? 'claude-haiku-4-5-20251001',
    };
    return this.http.post<RagChatResponse>(this.buildUrl('Chat'), payload, { withCredentials: true });
  }

  /** Variant Promise di {@link chat}. */
  chatAsync(
    query: string,
    history: RagChatTurn[] = [],
    options: { topK?: number; model?: string } = {},
  ): Promise<RagChatResponse> {
    return firstValueFrom(this.chat(query, history, options));
  }

  /**
   * Stato del server RAG (status, LLM enabled, chunks indicizzati).
   *
   * Usato dal componente `<wuic-rag-chatbot>` per decidere se mostrare il
   * badge "RAG+LLM" o "retrieval-only" e per disabilitare la mode `chat` se
   * il backend non ha la API key configurata.
   */
  health(): Observable<RagHealthResponse> {
    return this.http.get<RagHealthResponse>(this.buildUrl('Health'), { withCredentials: true });
  }

  /** Variant Promise di {@link health}. */
  healthAsync(): Promise<RagHealthResponse> {
    return firstValueFrom(this.health());
  }

  /**
   * Forza il reload dell'indice + LoRA del server Python. Da chiamare dopo
   * la skill `rag-rebuild-pipeline` per evitare di dover restartare il
   * processo uvicorn.
   */
  reload(): Observable<{ status: string; docs_loaded: number; llm_enabled: boolean }> {
    return this.http.post<{ status: string; docs_loaded: number; llm_enabled: boolean }>(
      this.buildUrl('Reload'),
      {},
      { withCredentials: true },
    );
  }

  // ===================================================================
  // ASYNC CHAT FLOW (con persistenza DB + notifiche al completamento)
  // ===================================================================

  /**
   * Lista delle sessioni chat dell'utente corrente, ordinate per ultima attivita'.
   * Usato per future sidebar di selezione conversazione.
   */
  sessions(): Observable<{ sessions: RagChatSessionDto[] }> {
    return this.http.get<{ sessions: RagChatSessionDto[] }>(
      this.buildUrl('Sessions'),
      { withCredentials: true },
    );
  }
  sessionsAsync(): Promise<{ sessions: RagChatSessionDto[] }> {
    return firstValueFrom(this.sessions());
  }

  /**
   * Soft-delete di una sessione (e tutti i suoi messaggi via FK CASCADE).
   */
  deleteSession(sessionId: number): Observable<{ deleted: boolean }> {
    return this.http.post<{ deleted: boolean }>(
      this.buildUrl('DeleteSession'),
      { sessionId },
      { withCredentials: true },
    );
  }
  deleteSessionAsync(sessionId: number): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.deleteSession(sessionId));
  }

  /**
   * Carica la cronologia completa di una sessione (per init componente o
   * deep-link da notifica). Filtra automaticamente per ownership user_id.
   */
  history(sessionId: number): Observable<RagChatHistorySnapshot> {
    const url = `${this.buildUrl('History')}?sessionId=${encodeURIComponent(String(sessionId))}`;
    return this.http.get<RagChatHistorySnapshot>(url, { withCredentials: true });
  }
  historyAsync(sessionId: number): Promise<RagChatHistorySnapshot> {
    return firstValueFrom(this.history(sessionId));
  }

  /**
   * Endpoint async principale del flow con persistenza.
   *
   * Backend behavior:
   *   1. INSERT atomico user msg + assistant msg pending (con correlation_id);
   *   2. Lancia Task.Run che chiama il rag server Python in background;
   *   3. Ritorna SUBITO {sessionId, userMessageId, assistantMessageId, correlationId}
   *      al frontend (HTTP 202 Accepted), senza aspettare la risposta del rag server.
   *
   * Quando il task completa scrive una notifica nel bell con
   * `target_json={path:/rag-chatbot, queryParams:{sessionId, messageId}}`. Il
   * frontend, se sulla pagina, marca il pending come done filtrando per
   * correlationId (via NotificationRealtimeService); altrimenti la notifica
   * porta indietro al chatbot al click.
   */
  ask(req: RagAskRequest): Observable<RagAskAcceptedResponse> {
    return this.http.post<RagAskAcceptedResponse>(
      this.buildUrl('Ask'),
      req,
      { withCredentials: true },
    );
  }
  askAsync(req: RagAskRequest): Promise<RagAskAcceptedResponse> {
    return firstValueFrom(this.ask(req));
  }

  // ----- private helpers -----

  /**
   * Costruisce l'URL `<api_base>Rag/<action>` rispettando l'eventuale
   * `WtoolboxService.appSettings.api_url` configurato lato runtime (stesso
   * pattern di NotificationRealtimeService).
   */
  private buildUrl(action: string): string {
    const base = this.buildApiBaseUrl();
    return `${base}Rag/${action}`;
  }

  private buildApiBaseUrl(): string {
    const configured = String(WtoolboxService.appSettings?.api_url || '').trim();
    if (configured) {
      return configured.endsWith('/') ? configured : `${configured}/`;
    }
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.protocol}//${window.location.host}/api/`;
    }
    return '/api/';
  }
}
