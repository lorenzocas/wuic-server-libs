import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Manuale-viewer.
 *
 * Wrapper Angular standalone che renderizza il manuale HTML statico
 * (`/assets/manuale.html`) dentro un iframe full-viewport, con una topbar
 * sopra che offre:
 *   - titolo della pagina
 *   - link "Apri in nuova scheda" (anchor `target="_blank"` con
 *     `rel="noopener noreferrer"` per evitare reverse-tabnabbing)
 *   - link "Scarica" che forza il download del file
 *
 * Il source del manuale e' generato a mano (HTML standalone con CSS+JS
 * inline) e vive in `wwwroot/src/assets/manuale.html`. La sua sorgente
 * canonica e' `docs/manuale.html` nel root del progetto FlottaMezzi: se
 * lo modifichi li', ricopialo qui (o sostituisci con un build step).
 *
 * Perche' bypassSecurityTrustResourceUrl:
 *   Angular's default behavior strips the iframe `src` se non e' un URL
 *   "trusted". Siccome `/assets/manuale.html` e' un asset same-origin
 *   servito dalla nostra app, lo marchiamo come trusted via DomSanitizer
 *   (NON e' un input utente, quindi nessun rischio XSS).
 */
@Component({
  selector: 'app-manuale-viewer',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <section class="manuale-viewer">
      <header class="topbar">
        <div class="title">
          <span class="icon" aria-hidden="true">📘</span>
          <h1>{{ 'manuale.title' | translate }}</h1>
          <span class="subtitle">{{ 'manuale.subtitle' | translate }}</span>
        </div>
        <nav class="actions">
          <a
            [href]="rawUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="btn-primary"
            [attr.title]="'manuale.open_new_tab_tooltip' | translate"
          >
            <span aria-hidden="true">↗</span>
            {{ 'manuale.open_new_tab' | translate }}
          </a>
          <a
            [href]="rawUrl"
            [download]="downloadFileName"
            class="btn-ghost"
            [attr.title]="'manuale.download_tooltip' | translate"
          >
            <span aria-hidden="true">⬇</span>
            {{ 'manuale.download' | translate }}
          </a>
        </nav>
      </header>

      <div class="iframe-wrap">
        <iframe
          *ngIf="safeUrl"
          [src]="safeUrl"
          class="manuale-iframe"
          [attr.title]="'manuale.iframe_title' | translate"
          loading="eager"
          referrerpolicy="same-origin"
        ></iframe>
      </div>
    </section>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .manuale-viewer {
      display: grid;
      grid-template-rows: auto 1fr;
      /* 70px = altezza topbar app WUIC. Se cambia in framework, allineare qui. */
      height: calc(100vh - 70px);
      background: #f5f7fb;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 18px;
      background: linear-gradient(180deg, #ffffff 0%, #f4f7fc 100%);
      border-bottom: 1px solid #d9e2f3;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      flex-wrap: wrap;
    }
    :host-context(.theme-dark) .topbar,
    :host-context(.dark-theme) .topbar,
    :host-context([data-theme-mode='dark']) .topbar {
      background: linear-gradient(180deg, #15233a 0%, #0f1c2f 100%);
      border-bottom-color: #2a4569;
    }
    .title {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }
    .title .icon {
      font-size: 1.3rem;
      line-height: 1;
    }
    .title h1 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
      color: #18304a;
      letter-spacing: 0.01em;
    }
    :host-context(.theme-dark) .title h1,
    :host-context(.dark-theme) .title h1,
    :host-context([data-theme-mode='dark']) .title h1 {
      color: #dbe8ff;
    }
    .title .subtitle {
      font-size: 0.82rem;
      color: #4d6278;
      font-style: italic;
    }
    :host-context(.theme-dark) .title .subtitle,
    :host-context(.dark-theme) .title .subtitle,
    :host-context([data-theme-mode='dark']) .title .subtitle {
      color: #9eb4d2;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .actions a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.86rem;
      font-weight: 500;
      text-decoration: none;
      border: 1px solid transparent;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .actions .btn-primary {
      background: #0d6efd;
      color: white;
    }
    .actions .btn-primary:hover {
      background: #0b5ed7;
    }
    .actions .btn-ghost {
      background: transparent;
      color: #0d6efd;
      border-color: #b8d0ff;
    }
    .actions .btn-ghost:hover {
      background: rgba(13, 110, 253, 0.08);
    }
    :host-context(.theme-dark) .actions .btn-ghost,
    :host-context(.dark-theme) .actions .btn-ghost,
    :host-context([data-theme-mode='dark']) .actions .btn-ghost {
      color: #7eb2ff;
      border-color: #294869;
    }
    :host-context(.theme-dark) .actions .btn-ghost:hover,
    :host-context(.dark-theme) .actions .btn-ghost:hover,
    :host-context([data-theme-mode='dark']) .actions .btn-ghost:hover {
      background: rgba(126, 178, 255, 0.12);
    }
    .iframe-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .manuale-iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
      background: white;
    }
    :host-context(.theme-dark) .manuale-iframe,
    :host-context(.dark-theme) .manuale-iframe,
    :host-context([data-theme-mode='dark']) .manuale-iframe {
      background: #0f1c2f;
    }
  `]
})
export class ManualeViewerComponent implements OnInit {
  /** Raw URL del manuale (per <a href> e download attr). */
  readonly rawUrl = 'assets/manuale.html';

  /** URL sanitizzato per <iframe [src]>. Bypass spiegato in JSDoc del component. */
  safeUrl: SafeResourceUrl | null = null;

  /** Nome file proposto al download. */
  readonly downloadFileName = 'FlottaMezzi-manuale.html';

  constructor(private readonly sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    // bypassSecurityTrustResourceUrl: l'URL e' un asset same-origin
    // ('assets/manuale.html') generato da noi, non input utente -> safe to trust.
    // Senza il bypass Angular blocca il binding [src]="rawUrl" come "unsafe".
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.rawUrl);
  }
}

export default ManualeViewerComponent;
