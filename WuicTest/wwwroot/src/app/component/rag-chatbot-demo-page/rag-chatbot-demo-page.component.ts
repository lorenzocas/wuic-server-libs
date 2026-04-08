import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WuicRagChatbotComponent, RagSource } from 'wuic-framework-lib';

/**
 * Demo page per il componente <wuic-rag-chatbot> del framework lib.
 *
 * Mostra il chatbot in dimensioni "comode" per l'esplorazione del codebase
 * WUIC, con tutti i source chip clickabili e logging in console di:
 * - source selezionati
 * - turn aggiunti alla history
 * - errori HTTP
 *
 * Prerequisiti per il funzionamento:
 *  1. rag_server.py up su 127.0.0.1:8765 (da c:\src\Wuic\codebase_embeddings\)
 *  2. KonvergenceCore in esecuzione (espone /api/Rag come proxy autenticato)
 *  3. cookie k-user di sessione valido
 *  4. (opzionale) ANTHROPIC_API_KEY settata sul server Python per modalita' RAG+LLM,
 *     altrimenti il chatbot degrada automaticamente in retrieval-only.
 */
@Component({
  selector: 'app-rag-chatbot-demo-page',
  standalone: true,
  imports: [CommonModule, WuicRagChatbotComponent],
  templateUrl: './rag-chatbot-demo-page.component.html',
  styleUrls: ['./rag-chatbot-demo-page.component.css'],
})
export class RagChatbotDemoPageComponent {
  /** Ultimi source cliccati, per debugging visuale. */
  lastSelectedSources: RagSource[] = [];

  /** Ultimo errore HTTP non recuperabile, mostrato in pagina. */
  lastError: { message: string; details?: unknown } | null = null;

  /** Numero totale di turn passati nel chatbot (debug). */
  turnCount = 0;

  onResultSelected(source: RagSource): void {
    console.log('[rag-chatbot-demo] resultSelected:', source);
    this.lastSelectedSources = [source, ...this.lastSelectedSources].slice(0, 5);
  }

  onErrorOccurred(err: { message: string; details?: unknown }): void {
    console.error('[rag-chatbot-demo] errorOccurred:', err);
    this.lastError = err;
  }

  onTurnAdded(): void {
    this.turnCount += 1;
  }

  clearLastError(): void {
    this.lastError = null;
  }
}
