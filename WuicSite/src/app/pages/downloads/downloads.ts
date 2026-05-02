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
import { LanguageService } from '../../services/language.service';

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
  /** Backward-compat: URL della release notes it-IT (o prima locale
   *  disponibile) per client che non sanno gestire la mappa multi-locale.
   *  Nuovo client: usa `releaseNotesUrls` (mappa) + `pickReleaseNotesUrl()`. */
  releaseNotesUrl?: string | null;
  /** Mappa locale -> URL del file release notes HTML, popolata da
   *  deploy-site.ps1 per ogni `release-notes-<key>.<locale>.md` trovato in
   *  WuicSite/release-notes/. Il client risolve la URL appropriata in base
   *  alla lingua corrente (`LanguageService.current()`), con fallback a
   *  it-IT > en-US > prima locale disponibile. */
  releaseNotesUrls?: Record<string, string> | null;
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
  private readonly languageService = inject(LanguageService);

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

  /**
   * Risolve la URL del file release notes per la release indicata, scegliendo
   * la lingua corrente del sito con fallback in priorita': lingua attiva ->
   * it-IT -> en-US -> prima locale disponibile -> backward-compat
   * `releaseNotesUrl` (singolare). Ritorna `null` se non c'e' nessun link.
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
    if (anyErr?.status === 404) return 'releases.json non ancora pubblicato';
    if (anyErr?.message) return anyErr.message;
    if (anyErr?.statusText) return `${anyErr.status} ${anyErr.statusText}`;
    return 'errore sconosciuto';
  }
}
