import { Component, signal, computed, inject, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ImageModule } from 'primeng/image';
import { TranslatePipe } from '@ngx-translate/core';
import { DocsContentManifest, DocsPage, DocsNavGroup, DocsSection, DocsCodeSample } from '../../models/docs.model';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';

interface SectionPart {
  kind: 'html' | 'code';
  html?: string;
  sample?: DocsCodeSample;
}

@Component({
  selector: 'app-docs',
  imports: [FormsModule, NgClass, InputTextModule, TagModule, ButtonModule, SelectModule, ImageModule, RouterLink, TranslatePipe],
  templateUrl: './docs.html',
  styleUrl: './docs.scss'
})
export class Docs implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private languageService = inject(LanguageService);

  constructor() {
    inject(SeoService).set({ titleKey: 'seo.docs.title', descriptionKey: 'seo.docs.description', path: '/docs' });
  }

  manifest = signal<DocsContentManifest | null>(null);
  loading = signal(true);
  query = signal('');
  currentSlug = signal('getting-started');
  /**
   * Reads the globally-selected language from LanguageService (driven by the
   * navbar flag picker). Falls back to `it-IT` if the service isn't ready.
   * This replaces the previous local signal so that changing language in the
   * navbar updates the docs body reactively.
   */
  currentLang = this.languageService.current;
  expandedSamples = new Set<string>();

  @ViewChild('contentScroller') contentScroller!: ElementRef;

  pageMap = computed(() => {
    const m = this.manifest();
    if (!m) return new Map<string, DocsPage>();
    const map = new Map<string, DocsPage>();
    for (const p of m.pages) {
      map.set(`${p.lang}:${p.slug}`, p);
    }
    return map;
  });

  groups = computed<DocsNavGroup[]>(() => {
    const m = this.manifest();
    if (!m) return [];
    const lang = this.currentLang();
    return m.groups.map(g => ({
      ...g,
      title: g.titles?.[lang] || g.title,
      items: g.items.map(i => ({
        ...i,
        title: i.titles?.[lang] || i.title
      }))
    }));
  });

  filteredGroups = computed(() => {
    const q = this.query().toLowerCase().trim();
    const all = this.groups();
    if (!q) return all;
    return all
      .map(g => ({
        ...g,
        items: g.items.filter(i =>
          i.title.toLowerCase().includes(q) ||
          i.slug.includes(q)
        )
      }))
      .filter(g => g.items.length > 0);
  });

  currentPage = computed(() => {
    const map = this.pageMap();
    const slug = this.currentSlug();
    const lang = this.currentLang();
    return map.get(`${lang}:${slug}`) || map.get(`it-IT:${slug}`) || null;
  });

  breadcrumbs = computed(() => {
    const page = this.currentPage();
    if (!page) return ['Docs'];
    const group = this.groups().find(g => g.items.some(i => i.slug === page.slug));
    return ['Docs', group?.title || '', page.title].filter(Boolean);
  });

  async ngOnInit() {
    try {
      const resp = await fetch('/docs-content.json');
      const data: DocsContentManifest = await resp.json();
      this.manifest.set(data);
    } catch (e) {
      console.error('Failed to load docs:', e);
    } finally {
      this.loading.set(false);
    }

    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      if (slug) {
        this.currentSlug.set(slug);
        // Scroll-to-top centralizzato: qualunque cambio di slug (click sidebar,
        // back/forward del browser, link diretto, link interno nel body del
        // docs) passa da qui, quindi un solo punto di reset scroll vale per
        // tutti. `setTimeout(0)` defer dopo il render Angular della nuova
        // pagina — altrimenti scrolliamo il layout *prima* che il contenuto
        // nuovo sia mounted, e il browser resta all'offset precedente.
        setTimeout(() => this.scrollContentToTop(), 0);
      }
    });
  }

  openPage(slug: string) {
    this.currentSlug.set(slug);
    // Lo scroll-to-top e' gestito centralmente nel paramMap.subscribe
    // (vedi ngOnInit): `router.navigate` triggera quella subscribe, quindi
    // qui non serve duplicare la chiamata — evita un doppio scroll che su
    // Safari puo' produrre un "jump" percepibile.
    this.router.navigate(['/docs', slug]);
  }

  /**
   * Riporta la vista all'inizio della pagina docs. Tenta sia il container
   * interno `contentScroller` (layout desktop, dove `.docs-content` ha il
   * proprio overflow-y: auto) sia `window` (layout mobile / breakpoint sotto
   * cui il layout perde la split-column e la pagina intera scrolla). Essere
   * permissivi qui e' piu' semplice del sniffing del media query: la chiamata
   * no-op lato che non scrolla non costa nulla.
   */
  private scrollContentToTop(): void {
    try {
      this.contentScroller?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
    } catch { /* ignore */ }
    try {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch { /* ignore (SSR / privacy mode) */ }
  }

  scrollToSection(event: Event, sectionId: string) {
    event.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  sectionParts(section: DocsSection): SectionPart[] {
    const samples = section.codeSamples || [];
    if (!samples.length) {
      return [{ kind: 'html', html: section.html }];
    }

    // The framework's docs generator (KonvergenceCore/scripts/docs/generate-docs-content.mjs)
    // strips fenced code blocks from markdown and replaces each one with a textual marker
    // `Snippet <N>:` (rendered as `<p>Snippet N:</p>` after markdown→HTML), while collecting
    // the original code into `section.codeSamples`. So the parser MUST match that marker
    // (NOT an HTML comment placeholder), in document order, and pair it with the next
    // unconsumed sample. Same algorithm as WuicTest's framework-docs.component.ts to keep
    // the two renderers in sync.
    const parts: SectionPart[] = [];
    const markerRegex = /<p>\s*Snippet[^<]*:<\/p>/gi;
    const html = section.html || '';

    let cursor = 0;
    let sampleIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = markerRegex.exec(html)) !== null) {
      const before = html.slice(cursor, match.index);
      if (before.trim()) {
        parts.push({ kind: 'html', html: before });
      }
      if (sampleIndex < samples.length) {
        parts.push({ kind: 'code', sample: samples[sampleIndex] });
        sampleIndex++;
      }
      cursor = match.index + match[0].length;
    }

    const remainingHtml = html.slice(cursor);
    if (remainingHtml.trim()) {
      parts.push({ kind: 'html', html: remainingHtml });
    }

    // Defensive: if any samples weren't matched by a marker (e.g. older content variants),
    // append them at the end so the user still sees the snippet rather than losing it silently.
    while (sampleIndex < samples.length) {
      parts.push({ kind: 'code', sample: samples[sampleIndex] });
      sampleIndex++;
    }

    return parts;
  }

  trustHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  isCollapsible(code: string): boolean {
    return code.split('\n').length > 7;
  }

  isExpanded(key: string): boolean {
    return this.expandedSamples.has(key);
  }

  toggleExpanded(key: string) {
    if (this.expandedSamples.has(key)) {
      this.expandedSamples.delete(key);
    } else {
      this.expandedSamples.add(key);
    }
  }

  hiddenLines(code: string): number {
    return Math.max(0, code.split('\n').length - 7);
  }

  getVisibleCode(code: string, key: string): string {
    if (this.isExpanded(key)) return code;
    return code.split('\n').slice(0, 7).join('\n');
  }

  sampleKey(slug: string, sectionId: string, sampleId: string): string {
    return `${slug}:${sectionId}:${sampleId}`;
  }

  copyCode(code: string) {
    navigator.clipboard.writeText(code);
  }

  langLabel(lang: string): string {
    const labels: Record<string, string> = {
      typescript: 'TypeScript', html: 'HTML', json: 'JSON',
      csharp: 'C#', sql: 'SQL', powershell: 'PowerShell',
      css: 'CSS', scss: 'SCSS', bash: 'Bash', xml: 'XML'
    };
    return labels[lang] || lang;
  }

  /**
   * Strip the trailing viewport suffix (` / desktop`, ` / mobile`) that the
   * docs generator adds to screenshot captions. Same shape as WuicTest so the
   * two renderers display identical labels.
   */
  formatScreenshotCaption(value: string): string {
    return String(value || '').replace(/\s*\/\s*(desktop|mobile)\s*$/i, '').trim();
  }
}
