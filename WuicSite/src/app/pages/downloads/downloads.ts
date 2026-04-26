import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../services/seo.service';

/**
 * Singolo file (ZIP) di una release. Shape allineata a deploy-site.ps1 che
 * genera /downloads/releases.json al push degli artifact.
 */
export interface DownloadFile {
  name: string;
  audience: 'src' | 'iis' | string;
  rag: boolean;
  tutorial: string;            // "no" | "SQL" | "BAK"
  size: string;                // es. "120.5 MB"
  sizeMb?: number;
  url: string;                 // /downloads/<filename>.zip
  archiveUrl?: string;         // /downloads/archive/<releaseKey>/<filename>.zip
}

/**
 * Una release = uno snapshot di ZIP per una coppia (server, client).
 */
export interface ReleaseEntry {
  key: string;                 // es. "v0.3.5_11.11.0"
  server: string;              // es. "0.3.5"
  client: string;              // es. "11.11.0"
  date: string;                // "YYYY-MM-DD"
  timestampUtc?: string;
  files: DownloadFile[];
}

/** Manifest /downloads/releases.json */
export interface ReleasesManifest {
  latest: string;              // key della release piu' recente
  updated?: string;            // ISO timestamp dell'ultimo push
  releases: ReleaseEntry[];    // ordinato DESC, max 5
}

@Component({
  selector: 'app-downloads',
  imports: [
    CommonModule,
    RouterLink,
    TableModule,
    TagModule,
    ButtonModule,
    CardModule,
    MessageModule,
    TranslatePipe
  ],
  templateUrl: './downloads.html',
  styleUrl: './downloads.scss'
})
export class Downloads implements OnInit {
  private readonly http = inject(HttpClient);

  constructor() {
    inject(SeoService).set({ titleKey: 'seo.downloads.title', descriptionKey: 'seo.downloads.description', path: '/downloads' });
  }

  // Signals perche' l'app e' zoneless (no zone.js, no provideZoneChangeDetection):
  // in quella modalita' l'assegnazione a una proprieta' plain dopo una subscribe()
  // HTTP NON triggera change detection, quindi la UI resta su "Caricamento..."
  // finche' un click o altra interazione non forza un CD cycle. I signal sono
  // reactive-native e triggerano CD automaticamente.
  readonly latest = signal<ReleaseEntry | null>(null);
  readonly hasOlder = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    // Fetch con cache-busting leggero (query param timestamp) per evitare che
    // il browser serva una versione stale subito dopo un deploy.
    const url = `/downloads/releases.json?t=${Date.now()}`;
    this.http.get<ReleasesManifest>(url).subscribe({
      next: (manifest) => {
        const list = Array.isArray(manifest?.releases) ? manifest.releases : [];
        this.latest.set(list.length > 0 ? list[0] : null);
        this.hasOlder.set(list.length > 1);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.loadError.set(this.extractErrorMessage(err));
      }
    });
  }

  /**
   * Forza il download del file anche se il browser tenterebbe di aprirlo inline.
   * Gli ZIP dovrebbero partire come download grazie al Content-Type, ma su alcuni
   * IIS senza il mime type custom possono essere trattati come octet-stream inline.
   */
  getDownloadUrl(entry: DownloadFile): string {
    return entry.url;
  }

  private extractErrorMessage(err: unknown): string {
    const anyErr = err as { status?: number; statusText?: string; message?: string };
    if (anyErr?.status === 404) return 'releases.json non ancora pubblicato';
    if (anyErr?.message) return anyErr.message;
    if (anyErr?.statusText) return `${anyErr.status} ${anyErr.statusText}`;
    return 'errore sconosciuto';
  }
}
