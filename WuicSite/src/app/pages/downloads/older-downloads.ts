import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TranslatePipe } from '@ngx-translate/core';
import type { ReleaseEntry, ReleasesManifest, DownloadFile } from './downloads';
import { LanguageService } from '../../services/language.service';

/**
 * Pagina "Versioni precedenti" mostra le release storiche (dalla 2° alla 5°).
 * L'ultima release vive in /downloads (pagina principale), le older vivono in
 * /downloads/archive/<key>/ (deploy-site.ps1 fa rotation automatico: max 5 in
 * archivio, le piu' vecchie eliminate al push).
 */
@Component({
  selector: 'app-older-downloads',
  imports: [
    CommonModule,
    RouterLink,
    AccordionModule,
    TableModule,
    TagModule,
    ButtonModule,
    MessageModule,
    TranslatePipe
  ],
  templateUrl: './older-downloads.html',
  styleUrl: './older-downloads.scss'
})
export class OlderDownloads implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly languageService = inject(LanguageService);

  // Signals: l'app e' zoneless, assegnazioni plain dopo subscribe() HTTP non
  // triggerano change detection — senza signal la UI resta su "Caricamento..."
  // finche' un click non forza un CD cycle. Vedi downloads.ts per il dettaglio.
  readonly older = signal<ReleaseEntry[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    const url = `/downloads/releases.json?t=${Date.now()}`;
    this.http.get<ReleasesManifest>(url).subscribe({
      next: (manifest) => {
        const list = Array.isArray(manifest?.releases) ? manifest.releases : [];
        // Esclude la latest (index 0), tiene dalla 2° alla 5°
        this.older.set(list.slice(1));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(this.extractErrorMessage(err));
      }
    });
  }

  /**
   * URL per il download. Preferisce archiveUrl (stabile e immutabile per versione);
   * fallback a url se il vecchio deploy-site aveva scritto la release prima che
   * archive esistesse.
   */
  getDownloadUrl(file: DownloadFile): string {
    return file.archiveUrl || file.url;
  }

  /**
   * Risolve la URL release notes per la release indicata, scegliendo la lingua
   * corrente del sito con fallback in priorita': lingua attiva -> it-IT ->
   * en-US -> prima locale disponibile -> backward-compat `releaseNotesUrl`.
   * Stessa logica di Downloads.pickReleaseNotesUrl(): replicata qui per non
   * forzare l'import della classe Downloads in OlderDownloads.
   */
  pickReleaseNotesUrl(rel: ReleaseEntry | null | undefined): string | null {
    if (!rel) return null;
    const map = rel.releaseNotesUrls;
    if (map && typeof map === 'object') {
      const current = this.languageService.current();
      if (current && map[current]) return map[current];
      if (map['it-IT']) return map['it-IT'];
      if (map['en-US']) return map['en-US'];
      const keys = Object.keys(map);
      if (keys.length > 0) return map[keys[0]];
    }
    return rel.releaseNotesUrl ?? null;
  }

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as { status?: number; statusText?: string; message?: string };
    if (anyErr?.status === 404) return 'releases.json non trovato';
    if (anyErr?.message) return anyErr.message;
    if (anyErr?.statusText) return `${anyErr.status} ${anyErr.statusText}`;
    return 'errore sconosciuto';
  }
}
