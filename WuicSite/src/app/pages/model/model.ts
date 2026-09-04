import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SeoService } from '../../services/seo.service';

/**
 * /model — "Run the WUIC coding model locally".
 *
 * Pagina EN-only (technical, audience developer): usa `titleLiteral` /
 * `descriptionLiteral` + `localizedUrls: false` come il blog, così il canonical
 * punta alla root e non traduciamo comandi/config in 5 lingue. Il contenuto è
 * statico (nessun fetch), quindi niente signal / OnInit.
 *
 * Gli identificativi (repo HF, nome modello, URL vsix) sono costanti in cima
 * così un rename è one-liner e il template resta pulito.
 */
@Component({
  selector: 'app-model',
  imports: [CommonModule, RouterLink, CardModule, ButtonModule, MessageModule],
  templateUrl: './model.html',
  styleUrl: './model.scss',
})
export class Model {
  /** Repo Hugging Face che ospita il GGUF (creato dall'owner, vedi pagina). */
  readonly hfRepo = 'castricolorenzo/qwen3-coder-wuic-30b-dpo';
  readonly hfUrl = 'https://huggingface.co/castricolorenzo/qwen3-coder-wuic-30b-dpo';
  /** Nome breve del modello in Ollama dopo l'alias (usato in tutte le config). */
  readonly modelTag = 'qwen3-coder-wuic:30b-dpo';
  /** VSIX dell'estensione WUIC Assistant, ospitato sul sito come le free-app. */
  readonly vsixUrl = '/downloads/wuic-assistant.vsix';

  constructor() {
    inject(SeoService).set({
      titleLiteral: 'Run the WUIC coding model locally',
      descriptionLiteral:
        'Download qwen3-coder-wuic:30b-dpo — our DPO fine-tune of qwen3-coder for the WUIC framework — from Hugging Face, run it on your own GPU with Ollama, and wire it into the WUIC backend and the WUIC Assistant VS Code extension. Fully local, no API calls.',
      path: '/model',
      localizedUrls: false,
    });
  }
}
