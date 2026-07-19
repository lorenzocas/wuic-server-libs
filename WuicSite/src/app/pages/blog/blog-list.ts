import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BlogManifest, BlogPost } from '../../models/blog.model';
import { SeoService } from '../../services/seo.service';

/**
 * Index page for /blog. Fetches the static `blog-manifest.json` produced
 * by scripts/generate-blog-manifest.mjs at prebuild and renders a card
 * list newest-first. The manifest is small (<10 KB even at 50 posts) so
 * we don't need pagination yet — the full list ships in one fetch.
 *
 * SOFT-LAUNCH: this page is intentionally noindex + not in the sitemap
 * during the draft phase. When ready to launch, flip `noindex` to false
 * here and in BlogPost, and add the slugs to scripts/generate-sitemap.mjs.
 */
@Component({
  selector: 'app-blog-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './blog-list.html',
  styleUrl: './blog.scss',
})
export class BlogList implements OnInit {
  private http = inject(HttpClient);

  loading = signal(true);
  error = signal<string | null>(null);
  posts = signal<BlogPost[]>([]);

  hasPosts = computed(() => this.posts().length > 0);

  constructor() {
    inject(SeoService).set({
      titleLiteral: 'Engineering blog',
      descriptionLiteral:
        'Deep dives on metadata-driven Angular, RAG over codebases, embeddable workflow engines, and what we have learned shipping enterprise apps with WUIC.',
      path: '/blog',
      // Contenuto single-language: canonical alla sola versione root, niente
      // hreflang (i .md sono autorati in una lingua — vedi PageSeo.localizedUrls).
      localizedUrls: false,
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      // HttpClient (NON fetch grezzo): con `withFetch()` Angular SSR
      // intercetta la richiesta durante il prerender e la serve dal bundle
      // assets in-memory → l'indice arriva GIA' popolato nell'HTML statico.
      // Il fetch() nativo non è intercettato: durante il prerender non
      // risolveva mai e le pagine statiche uscivano bloccate su
      // "Loading posts…" (bug fixato 2026-07-14).
      const manifest = await firstValueFrom(this.http.get<BlogManifest>('/blog-manifest.json'));
      this.posts.set(manifest.posts);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}
