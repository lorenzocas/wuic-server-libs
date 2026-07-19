import { Component, computed, inject, OnInit, signal, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import hljs from 'highlight.js';
import { BlogManifest, BlogPost as BlogPostMeta } from '../../models/blog.model';
import { SeoService } from '../../services/seo.service';
import { articleSchema, breadcrumbsSchema } from '../../services/seo-schemas';

/**
 * /blog/:slug — fetch the post's raw markdown from `assets/blog/<file>.md`,
 * render it with `marked` (commonmark-flavoured), and inject the HTML via
 * Angular's DomSanitizer.bypassSecurityTrustHtml.
 *
 * Why bypassSecurityTrustHtml is safe here: the markdown sources are part
 * of our own repository, not user input. Letting Angular's sanitizer
 * strip them would kill `<pre><code>` blocks (sanitizer drops `class`
 * attributes on inline HTML) and break syntax highlighting.
 *
 * Code blocks get highlighted with highlight.js. The CSS theme is
 * imported globally in styles.scss so prerender renders the styles
 * server-side — without it, the prerendered HTML has the right markup
 * but no colours until hydration.
 */
@Component({
  selector: 'app-blog-post',
  imports: [RouterLink, DatePipe],
  templateUrl: './blog-post.html',
  styleUrl: './blog.scss',
})
export class BlogPost implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);
  private seo = inject(SeoService);
  private platformId = inject(PLATFORM_ID);
  private http = inject(HttpClient);

  loading = signal(true);
  error = signal<string | null>(null);
  meta = signal<BlogPostMeta | null>(null);
  bodyHtml = signal<SafeHtml | null>(null);

  notFound = computed(() => !this.loading() && !this.meta() && !this.error());

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    if (!slug) {
      this.loading.set(false);
      return;
    }

    try {
      // Resolve the post metadata from the manifest first — that's how we
      // discover where the .md lives and grab the title for the SEO tags
      // before the body has even arrived.
      // HttpClient (NON fetch grezzo): il prerender SSG intercetta solo il
      // backend fetch di HttpClient (withFetch) — con fetch() nativo il body
      // non si popolava mai e l'HTML statico usciva "Loading article…".
      const manifest = await firstValueFrom(this.http.get<BlogManifest>('/blog-manifest.json'));
      const m = manifest.posts.find(p => p.slug === slug);
      if (!m) {
        this.loading.set(false);
        return;
      }
      this.meta.set(m);

      // Apply SEO with what we know now — title, description, canonical.
      // structuredData repeats the title in Article schema (richer SERP).
      this.seo.set({
        titleLiteral: m.title,
        descriptionLiteral: m.description,
        path: `/blog/${m.slug}`,
        // Articolo single-language: canonical alla versione root, no hreflang.
        localizedUrls: false,
        structuredData: [
          articleSchema({
            headline: m.title,
            description: m.description,
            path: `/blog/${m.slug}`,
            datePublished: m.date,
            authorName: m.author,
          }),
          breadcrumbsSchema([
            { name: 'Home', pathOrUrl: '/' },
            { name: 'Blog', pathOrUrl: '/blog' },
            { name: m.title, pathOrUrl: `/blog/${m.slug}` },
          ]),
        ],
      });

      const raw = await firstValueFrom(this.http.get(`/${m.sourcePath}`, { responseType: 'text' }));
      // Strip the frontmatter block before rendering.
      const body = raw.replace(/^---[\s\S]*?---\s*/, '');
      const html = await marked.parse(body, { gfm: true, breaks: false });
      this.bodyHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));

      // highlight.js can only colour blocks once they're attached to the
      // DOM, which on the server doesn't happen. Run it after hydration
      // in the browser. SSR ships uncoloured <pre><code>; the browser
      // re-paints them after the bootstrap.
      if (isPlatformBrowser(this.platformId)) {
        queueMicrotask(() => {
          document.querySelectorAll('pre code').forEach(el => {
            hljs.highlightElement(el as HTMLElement);
          });
        });
      }
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}
