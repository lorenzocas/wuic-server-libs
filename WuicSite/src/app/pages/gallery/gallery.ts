import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ImageModule } from 'primeng/image';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TranslatePipe } from '@ngx-translate/core';
import { DocsContentManifest, DocsImage, DocsPage } from '../../models/docs.model';

/**
 * Live Demos gallery: aggrega tutte le immagini `.gif` presenti in
 * `page.images[]` dal `docs-content.json` e le mostra in grid con lightbox.
 * Il docs-content.json e' lo stesso file che il componente Docs scarica al boot
 * (single source of truth: quando docs:build aggiunge una GIF a una pagina, la
 * gallery la vede automaticamente al prossimo reload).
 */
interface GalleryItem {
  id: string;
  pageSlug: string;
  pageTitle: string;
  caption: string;
  path: string; // assets/wuic-framework-docs/screenshots/<file>.gif
}

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [RouterLink, ImageModule, ButtonModule, TagModule, TranslatePipe],
  templateUrl: './gallery.html',
  styleUrl: './gallery.scss'
})
export class Gallery implements OnInit {
  private sanitizer = inject(DomSanitizer);

  loading = signal(true);
  items = signal<GalleryItem[]>([]);

  // Group items by page slug for better UX (clicking "Back to page" routes to docs)
  itemsByPage = computed(() => {
    const grouped = new Map<string, GalleryItem[]>();
    for (const item of this.items()) {
      const bucket = grouped.get(item.pageSlug) || [];
      bucket.push(item);
      grouped.set(item.pageSlug, bucket);
    }
    return Array.from(grouped.entries()).map(([slug, items]) => ({
      slug,
      title: items[0].pageTitle,
      items
    }));
  });

  async ngOnInit() {
    try {
      const resp = await fetch('/docs-content.json');
      const data: DocsContentManifest = await resp.json();

      const collected: GalleryItem[] = [];
      // Prefer it-IT language for captions and titles. GIF paths are shared
      // across languages (the docs generator emits the same `images[]` for
      // every localized copy of a page), so iterating the it-IT subset is enough.
      const italianPages = data.pages.filter(p => p.lang === 'it-IT');
      for (const page of italianPages) {
        const imgs = (page.images || []) as DocsImage[];
        for (const img of imgs) {
          if (img.status !== 'available') continue;
          if (!img.path || !/\.gif($|\?)/i.test(img.path)) continue;
          collected.push({
            id: img.id,
            pageSlug: page.slug,
            pageTitle: page.title,
            caption: img.caption,
            path: img.path
          });
        }
      }

      // Stable sort by page title, then caption — makes the gallery deterministic
      collected.sort((a, b) =>
        a.pageTitle.localeCompare(b.pageTitle) || a.caption.localeCompare(b.caption)
      );

      this.items.set(collected);
    } catch (err) {
      console.error('Gallery load failed:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Strip the trailing viewport suffix and normalize captions for display.
   * Same shape the docs page uses so the gallery stays consistent.
   */
  displayCaption(value: string): string {
    return String(value || '').replace(/\s*\/\s*(desktop|mobile)\s*$/i, '').trim();
  }

  trustUrl(url: string): SafeUrl {
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  /**
   * Derive the thumbnail JPG path from the GIF path. Thumbs are generated
   * off-line by `ffmpeg -i <name>.gif -vframes 1 <name>.thumb.jpg` and
   * shipped alongside the GIFs in `assets/wuic-framework-docs/screenshots/`.
   * Fallback to the original path if the input is not a GIF (defensive —
   * currently the gallery only filters GIFs so this shouldn't trigger).
   */
  thumbPath(gifPath: string): string {
    if (!gifPath) return gifPath;
    return gifPath.replace(/\.gif(\?.*)?$/i, '.thumb.jpg$1');
  }
}
