import { Component, signal, computed, inject, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { DocsContentManifest, DocsPage, DocsNavGroup, DocsSection, DocsCodeSample } from '../../models/docs.model';

interface SectionPart {
  kind: 'html' | 'code';
  html?: string;
  sample?: DocsCodeSample;
}

@Component({
  selector: 'app-docs',
  imports: [FormsModule, NgClass, InputTextModule, TagModule, ButtonModule, SelectModule, RouterLink],
  templateUrl: './docs.html',
  styleUrl: './docs.scss'
})
export class Docs implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);

  manifest = signal<DocsContentManifest | null>(null);
  loading = signal(true);
  query = signal('');
  currentSlug = signal('getting-started');
  currentLang = signal('it-IT');
  expandedSamples = new Set<string>();

  langs = [
    { label: 'Italiano', value: 'it-IT' },
    { label: 'English', value: 'en-US' },
    { label: 'Deutsch', value: 'de-DE' },
    { label: 'Espanol', value: 'es-ES' },
    { label: 'Francais', value: 'fr-FR' }
  ];

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
      if (slug) this.currentSlug.set(slug);
    });
  }

  openPage(slug: string) {
    this.currentSlug.set(slug);
    this.router.navigate(['/docs', slug]);
    this.contentScroller?.nativeElement?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  scrollToSection(event: Event, sectionId: string) {
    event.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  sectionParts(section: DocsSection): SectionPart[] {
    const parts: SectionPart[] = [];
    if (!section.codeSamples?.length) {
      parts.push({ kind: 'html', html: section.html });
      return parts;
    }
    // Interleave HTML with code samples at placeholder positions
    let html = section.html;
    for (const sample of section.codeSamples) {
      const placeholder = `<!-- code-sample:${sample.id} -->`;
      const idx = html.indexOf(placeholder);
      if (idx >= 0) {
        const before = html.substring(0, idx);
        if (before.trim()) parts.push({ kind: 'html', html: before });
        parts.push({ kind: 'code', sample });
        html = html.substring(idx + placeholder.length);
      }
    }
    if (html.trim()) parts.push({ kind: 'html', html });
    // If no placeholders matched, append samples at the end
    if (parts.length === 0) {
      parts.push({ kind: 'html', html: section.html });
      for (const sample of section.codeSamples) {
        parts.push({ kind: 'code', sample });
      }
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
}
