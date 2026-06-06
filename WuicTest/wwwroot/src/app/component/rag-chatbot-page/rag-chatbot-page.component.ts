import { Component } from '@angular/core';
import { WuicRagChatbotComponent } from 'wuic-framework-lib';

/**
 * Pagina full-page del RAG chatbot per WuicTest (dev/test app).
 *
 * Wrapper minimale attorno a <wuic-rag-chatbot> il cui UNICO scopo e' abilitare
 * il toggle profilo "Vista Dev / Vista Cliente" ([allowProfileToggle]=true) in
 * ambiente di sviluppo. Il toggle e' gated by-design: la chat spedita al cliente
 * NON lo mostra (lo abilita solo questo host dev). E' comunque leak-safe: il
 * server applica strictest-of(env, richiesta).
 */
@Component({
  standalone: true,
  selector: 'app-rag-chatbot-page',
  imports: [WuicRagChatbotComponent],
  template: `<wuic-rag-chatbot [allowProfileToggle]="true" [maxHistory]="100" [sendRouteContext]="false"></wuic-rag-chatbot>`,
  styles: [`
    /* Catena di altezza 100%: la app-shell rende questo host flex-column height:100%
       (regola globale app-shell-content router-outlet+*). Il custom element
       <wuic-rag-chatbot> e' inline di default e collassa all'altezza del contenuto:
       lo forziamo a riempire (display:flex + flex:1 + min-height:0). */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
    }
    wuic-rag-chatbot {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
    }
  `],
})
export class RagChatbotPageComponent {}
