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

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as { status?: number; statusText?: string; message?: string };
    if (anyErr?.status === 404) return 'releases.json non trovato';
    if (anyErr?.message) return anyErr.message;
    if (anyErr?.statusText) return `${anyErr.status} ${anyErr.statusText}`;
    return 'errore sconosciuto';
  }
}
