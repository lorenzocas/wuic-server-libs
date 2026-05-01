import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ImageModule } from 'primeng/image';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TranslatePipe } from '@ngx-translate/core';
import { DocsContentManifest, DocsImage, DocsPage } from '../../models/docs.model';
import { SeoService } from '../../services/seo.service';

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

/**
 * Hand-picked featured GIFs with pre-rendered poster thumbnails. Lighter
 * than the auto-generated docs gallery (these are curated for marketing,
 * each ~200KB-2.5MB) and shown as a dedicated row at the top of /gallery
 * — they're the first thing a visitor sees, so we want quality over
 * quantity. The poster column is critical for performance: it lets us
 * lazy-load the GIF only on click, keeping the page weight at ~250KB
 * instead of ~6MB on first paint. Pure click-to-play, no autoplay.
 */
interface FeaturedDemo {
  /** Section caption shown under the thumbnail. i18n key resolved at render. */
  titleKey: string;
  /** One-line description, also i18n. */
  blurbKey: string;
  /** Public path to the animated GIF. */
  gifPath: string;
  /** Public path to the static thumbnail / poster (JPG or PNG). */
  posterPath: string;
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

  constructor() {
    inject(SeoService).set({ titleKey: 'seo.gallery.title', descriptionKey: 'seo.gallery.description', path: '/gallery' });
  }

  loading = signal(true);
  items = signal<GalleryItem[]>([]);

  /**
   * Hand-picked featured demos shown at the top of the gallery. We point
   * at the *-demo.gif files emitted by the docs build (each has a
   * `.thumb.jpg` sibling already cropped + colour-graded by the docs
   * pipeline — much higher quality than auto-extracting frame 1 of an
   * arbitrary GIF). The matching docs gallery items are filtered out
   * below in `itemsByPage()` so a visitor doesn't see the same demo
   * twice on the page.
   *
   * The earlier `gifs/<name>.gif` files in public/gifs/ are different
   * (older) recordings of the same features — kept around as orphan
   * assets for now in case some legacy doc page still links them.
   */
  readonly featuredDemos: (FeaturedDemo & { id: string })[] = [
    { id: 'designer',    titleKey: 'gallery.featured.designer.title',    blurbKey: 'gallery.featured.designer.blurb',    gifPath: 'assets/wuic-framework-docs/screenshots/designer__designer-advanced__desktop.gif',         posterPath: 'assets/wuic-framework-docs/screenshots/designer__designer-advanced__desktop.thumb.jpg' },
    { id: 'kanban',      titleKey: 'gallery.featured.kanban.title',      blurbKey: 'gallery.featured.kanban.blurb',      gifPath: 'assets/wuic-framework-docs/screenshots/kanban-list__kanban-base__desktop.gif',            posterPath: 'assets/wuic-framework-docs/screenshots/kanban-list__kanban-base__desktop.thumb.jpg' },
    { id: 'chart',       titleKey: 'gallery.featured.chart.title',       blurbKey: 'gallery.featured.chart.blurb',       gifPath: 'assets/wuic-framework-docs/screenshots/chart-list__chart-filter__desktop.gif',            posterPath: 'assets/wuic-framework-docs/screenshots/chart-list__chart-filter__desktop.thumb.jpg' },
    { id: 'carousel',    titleKey: 'gallery.featured.carousel.title',    blurbKey: 'gallery.featured.carousel.blurb',    gifPath: 'assets/wuic-framework-docs/screenshots/carousel-list__carousel-animation__desktop.gif',   posterPath: 'assets/wuic-framework-docs/screenshots/carousel-list__carousel-animation__desktop.thumb.jpg' },
    { id: 'edit-form',   titleKey: 'gallery.featured.editForm.title',    blurbKey: 'gallery.featured.editForm.blurb',    gifPath: 'assets/wuic-framework-docs/screenshots/edit-form-demo.gif',                                posterPath: 'assets/wuic-framework-docs/screenshots/edit-form-demo.thumb.jpg' },
    { id: 'list-grid',   titleKey: 'gallery.featured.listGrid.title',    blurbKey: 'gallery.featured.listGrid.blurb',    gifPath: 'assets/wuic-framework-docs/screenshots/list-grid__list-grid-base__desktop.gif',           posterPath: 'assets/wuic-framework-docs/screenshots/list-grid__list-grid-base__desktop.thumb.jpg' },
    { id: 'map',         titleKey: 'gallery.featured.map.title',         blurbKey: 'gallery.featured.map.blurb',         gifPath: 'assets/wuic-framework-docs/screenshots/map-list__map-marker__desktop.gif',                posterPath: 'assets/wuic-framework-docs/screenshots/map-list__map-marker__desktop.thumb.jpg' },
    { id: 'workflow',    titleKey: 'gallery.featured.workflow.title',    blurbKey: 'gallery.featured.workflow.blurb',    gifPath: 'assets/wuic-framework-docs/screenshots/workflow-designer__workflow-designer-demo__desktop.gif', posterPath: 'assets/wuic-framework-docs/screenshots/workflow-designer__workflow-designer-demo__desktop.thumb.jpg' },
    { id: 'spreadsheet', titleKey: 'gallery.featured.spreadsheet.title', blurbKey: 'gallery.featured.spreadsheet.blurb', gifPath: 'assets/wuic-framework-docs/screenshots/spreadsheet-list__spreadsheet-animation__desktop.gif', posterPath: 'assets/wuic-framework-docs/screenshots/spreadsheet-list__spreadsheet-animation__desktop.thumb.jpg' },
    { id: 'tree',        titleKey: 'gallery.featured.tree.title',        blurbKey: 'gallery.featured.tree.blurb',        gifPath: 'assets/wuic-framework-docs/screenshots/tree-demo.gif',                                     posterPath: 'assets/wuic-framework-docs/screenshots/tree-demo.thumb.jpg' },
    { id: 'themes',      titleKey: 'gallery.featured.themes.title',      blurbKey: 'gallery.featured.themes.blurb',      gifPath: 'assets/wuic-framework-docs/screenshots/themes__themes-switch__desktop.gif',               posterPath: 'assets/wuic-framework-docs/screenshots/themes__themes-switch__desktop.thumb.jpg' },
  ];

  /** Set of GIF paths promoted to the Featured row — used to filter them out of the docs section below. */
  private get featuredPathSet(): Set<string> {
    return new Set(this.featuredDemos.map(d => d.gifPath));
  }

  // Group items by page slug for better UX (clicking "Back to page" routes to docs).
  // Skip items whose path is already shown in the Featured row above so a visitor
  // never sees the same demo twice on the page.
  itemsByPage = computed(() => {
    const featured = this.featuredPathSet;
    const grouped = new Map<string, GalleryItem[]>();
    for (const item of this.items()) {
      if (featured.has(item.path)) continue;
      const bucket = grouped.get(item.pageSlug) || [];
      bucket.push(item);
      grouped.set(item.pageSlug, bucket);
    }
    return Array.from(grouped.entries())
      .filter(([_, items]) => items.length > 0)
      .map(([slug, items]) => ({
        slug,
        title: items[0].pageTitle,
        items,
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
