import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
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
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const resp = await fetch('/blog-manifest.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const manifest: BlogManifest = await resp.json();
      this.posts.set(manifest.posts);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}
