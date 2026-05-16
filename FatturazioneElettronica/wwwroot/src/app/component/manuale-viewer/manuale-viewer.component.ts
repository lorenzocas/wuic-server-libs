import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

/**
 * Manuale Viewer — wrapper Angular per il manuale utente HTML statico.
 *
 * Route: `#/manuale`
 *
 * Razionale: il manuale e' un file HTML standalone in
 * `wwwroot/public/docs/manuale.html` (servito staticamente dal dev server
 * Angular e dall'host IIS/Kestrel). Per integrarlo nella navigation del
 * framework WUIC senza modifiche al `meta-menu` (che usa solo
 * `router.navigateByUrl` e non supporta URL esterne), questo componente
 * lo renderizza in un `<iframe>` full-viewport.
 *
 * Voce di menu corrispondente: registrata in `_metadati__menu` con
 *   mm_uri_menu='manuale' (no leading `#/`, il framework lo aggiunge)
 *   mm_icon='pi pi-book'
 *
 * Vedi anche:
 *   - C:\src\Wuic\FatturazioneElettronica\docs\manuale.html       (sorgente)
 *   - C:\src\Wuic\FatturazioneElettronica\wwwroot\public\docs\manuale.html (deploy)
 *   - scripts/2026-05-12-menu-manuale-utente.sql                  (patch menu)
 */
@Component({
  selector: 'wuic-manuale-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="manuale-viewer">
      <div class="topbar">
        <span class="title">
          <i class="pi pi-book"></i>
          Manuale utente — FatturazioneElettronica
        </span>
        <span class="actions">
          <a [href]="rawUrl" target="_blank" rel="noopener" class="open-tab">
            <i class="pi pi-external-link"></i> apri in nuova scheda
          </a>
        </span>
      </div>
      <iframe
        [src]="safeUrl"
        title="Manuale FatturazioneElettronica"
        loading="eager"
        referrerpolicy="same-origin"
      ></iframe>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .manuale-viewer {
      display: flex; flex-direction: column;
      height: calc(100vh - 64px);  /* sotto navbar top framework */
      background: #f8fafc;
    }
    .topbar {
      display: flex; align-items: center; gap: 12px;
      height: 40px; padding: 0 16px;
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.92rem;
    }
    .topbar .title {
      display: inline-flex; align-items: center; gap: 8px;
      color: #0f172a; font-weight: 600;
    }
    .topbar .title i { color: #6366f1; }
    .topbar .actions { margin-left: auto; }
    .topbar .open-tab {
      color: #6366f1; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 8px; border-radius: 4px;
      transition: background 0.15s;
    }
    .topbar .open-tab:hover { background: #eef2ff; }
    iframe {
      flex: 1; border: 0; width: 100%;
      background: #fff;
    }
  `]
})
export class ManualeViewerComponent {
  // Angular copia `public/**` nella root del bundle (vedi `angular.json`
  // assets entry `{ glob: '**/*', input: 'public' }`), quindi il file
  // sorgente `wwwroot/public/docs/manuale.html` finisce servito come
  // `/docs/manuale.html` (sia dal dev server `ng serve` che dall'host
  // IIS/Kestrel in prod). Il prefisso `/public/` causa 404.
  readonly rawUrl = '/docs/manuale.html';
  readonly safeUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.safeUrl = sanitizer.bypassSecurityTrustResourceUrl(this.rawUrl);
  }
}
