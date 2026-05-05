import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { frameworkDocsContent } from '../../documentation/generated/docs.generated';
import { DocsCodeSample, DocsContentManifest, DocsPage, DocsSection } from '../../documentation/docs.model';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ImageModule } from 'primeng/image';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { getThemeOptions } from '../../config/theme-catalog';
import { TranslationManagerService } from '../../service/translation-manager.service';
import { UserInfoService } from '../../service/user-info.service';

@Component({
  selector: 'wuic-framework-docs',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TagModule, TooltipModule, ImageModule, TranslateModule],
  templateUrl: './framework-docs.component.html',
  styleUrl: './framework-docs.component.scss'
})
export class FrameworkDocsComponent {
  @ViewChild('contentScroller') contentScroller?: ElementRef<HTMLElement>;
  readonly content: DocsContentManifest = frameworkDocsContent;
  readonly query = signal('');
  readonly dark = signal(this.readTheme() === 'dark');
  readonly currentSlug = signal<string>('getting-started');
  readonly currentLang = signal<string>('it-IT');
  readonly allThemes = getThemeOptions();
  private readonly collapsedCodeMaxLines = 7;
  private readonly expandedSamples = signal<Record<string, boolean>>({});
  private readonly highlightedHtmlCache = new Map<string, string>();
  private trslSrv = inject(TranslationManagerService);
  private ngxTranslate = inject(TranslateService);

  readonly langPages = computed(() => {
    const lang = this.currentLang();
    return this.content.pages.filter(p => p.lang === lang);
  });

  readonly pagesBySlug = computed(() => {
    return new Map(this.langPages().map(p => [p.slug, p]));
  });

  private readonly searchIndexBySlug = this.buildSearchIndexBySlug();
  private readonly sectionPartsCache = new Map<string, Array<{ kind: 'html'; html: string } | { kind: 'code'; sample: DocsCodeSample }>>();

  readonly filteredGroups = computed(() => {
    const q = this.normalizeSearchText(this.query());
    const lang = this.currentLang();
    const pbs = this.pagesBySlug();

    const localizedGroups = this.content.groups.map(group => ({
      ...group,
      title: (group as any).titles?.[lang] || group.title,
      items: group.items.map(item => ({
        ...item,
        title: (item as any).titles?.[lang] || item.title
      }))
    }));

    if (!q) {
      return localizedGroups;
    }

    return localizedGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const manifestTerms = this.normalizeSearchText(`${group.title || ''} ${item.title || ''} ${item.slug || ''}`);
          const haystack = `${manifestTerms} ${this.searchIndexBySlug.get(item.slug) || ''}`.trim();
          return haystack.includes(q);
        })
      }))
      .filter((group) => group.items.length > 0);
  });

  readonly currentPage = computed<DocsPage | undefined>(() => {
    return this.pagesBySlug().get(this.currentSlug()) || this.langPages()[0];
  });

  readonly breadcrumbs = computed(() => {
    const page = this.currentPage();
    return ['Framework Docs', page?.title || ''];
  });

  private static readonly SUPPORTED_LANGS = ['it-IT', 'en-US', 'fr-FR', 'es-ES', 'de-DE'];

  t(key: string, fallback: string): string {
    const translated = this.trslSrv?.instant?.(key);
    return translated && translated !== key ? translated : fallback;
  }

  private resolveLang(raw: string): string {
    const langs = FrameworkDocsComponent.SUPPORTED_LANGS;
    return langs.find(s => s === raw)
      || langs.find(s => s.toLowerCase().startsWith(raw.split('-')[0].toLowerCase() + '-'))
      || 'it-IT';
  }

  constructor(private router: Router, private route: ActivatedRoute) {
    // Detect initial language from user info
    const userInfo = inject(UserInfoService);
    const userLang = userInfo.getuserInfo?.()?.lingua?.id || navigator.language || 'it-IT';
    this.currentLang.set(this.resolveLang(userLang));

    // Subscribe to global language changes from the app's language dropdown
    this.ngxTranslate.onLangChange.subscribe((event) => {
      const resolved = this.resolveLang(event.lang);
      if (resolved !== this.currentLang()) {
        this.currentLang.set(resolved);
        this.sectionPartsCache.clear();
        this.highlightedHtmlCache.clear();
      }
    });

    this.route.paramMap.subscribe((params) => {
      const slug = (params.get('slug') || 'getting-started').trim();
      if (this.pagesBySlug().has(slug)) {
        this.currentSlug.set(slug);
      } else {
        this.currentSlug.set(this.langPages()[0]?.slug || 'getting-started');
      }
      this.resetScrollPosition();
    });
  }

  openPage(slug: string): void {
    this.router.navigate(['/framework-docs', slug]);
    this.resetScrollPosition();
  }

  toggleTheme(): void {
    this.dark.update((v) => !v);
    const value = this.dark() ? 'dark' : 'light';
    localStorage.setItem('wuic_framework_docs_theme', value);
  }

  copyCode(value: string): void {
    if (!value) {
      return;
    }

    navigator.clipboard?.writeText(value);
  }

  getSampleKey(pageSlug: string, sectionId: string, sampleId: string): string {
    return `${pageSlug}::${sectionId}::${sampleId}`;
  }

  isSampleCollapsible(code: string): boolean {
    return this.getSampleLineCount(code) > this.collapsedCodeMaxLines;
  }

  isSampleExpanded(key: string): boolean {
    return !!this.expandedSamples()[key];
  }

  toggleSampleExpanded(key: string): void {
    this.expandedSamples.update((curr) => ({ ...curr, [key]: !curr[key] }));
  }

  getVisibleSampleCode(code: string, key: string): string {
    if (!this.isSampleCollapsible(code) || this.isSampleExpanded(key)) {
      return code || '';
    }

    return (code || '').split(/\r?\n/).slice(0, this.collapsedCodeMaxLines).join('\n');
  }

  getCollapsedHiddenLines(code: string): number {
    return Math.max(0, this.getSampleLineCount(code) - this.collapsedCodeMaxLines);
  }

  getSnippetLanguageLabel(language: string): string {
    const key = this.getSnippetLanguageKey(language);
    if (key === 'html') return 'HTML';
    if (key === 'json') return 'JSON';
    if (key === 'ts') return 'TS';
    if (key === 'cs') return 'CS';
    return String(language || 'TEXT').toUpperCase();
  }

  getSnippetLanguageClass(language: string): string {
    return `lang-${this.getSnippetLanguageKey(language)}`;
  }

  getSnippetLanguageIconClass(language: string): string {
    const key = this.getSnippetLanguageKey(language);
    if (key === 'html') return 'pi-code';
    if (key === 'json') return 'pi-braces';
    if (key === 'ts') return 'pi-bolt';
    if (key === 'cs') return 'pi-microsoft';
    return 'pi-file';
  }

  getVisibleSampleHighlightedCode(code: string, key: string, language: string): string {
    const visible = this.getVisibleSampleCode(code, key);
    // Due layer di evidenziazione:
    //  1. Syntax highlight del linguaggio (ts/cs/json/html/...).
    //  2. Query highlight (match del search bar) — wrappato in `<mark>`
    //     dallo stesso helper usato per il body HTML delle sezioni. Senza
    //     questo secondo passaggio, gli snippet di codice restano visivamente
    //     neutri anche quando la pagina e' stata matchata sul contenuto
    //     del codice.
    // `getHighlightedHtml` e' no-op quando `query` e' vuoto.
    const syntaxHighlighted = this.highlightCodeByLanguage(visible, language);
    return this.getHighlightedHtml(syntaxHighlighted);
  }

  sectionParts(section: DocsSection): Array<{ kind: 'html'; html: string } | { kind: 'code'; sample: DocsCodeSample }> {
    const samples = section.codeSamples || [];
    if (!samples.length) {
      return [{ kind: 'html', html: section.html || '' }];
    }

    const cacheKey = `${section.id}::${section.html?.length || 0}::${samples.length}`;
    const cached = this.sectionPartsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const parts: Array<{ kind: 'html'; html: string } | { kind: 'code'; sample: DocsCodeSample }> = [];
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

    while (sampleIndex < samples.length) {
      parts.push({ kind: 'code', sample: samples[sampleIndex] });
      sampleIndex++;
    }

    this.sectionPartsCache.set(cacheKey, parts);
    return parts;
  }

  formatScreenshotCaption(value: string): string {
    return String(value || '').replace(/\s*\/\s*(desktop|mobile)\s*$/i, '').trim();
  }

  getHighlightedHtml(html: string): string {
    const source = String(html || '');
    const query = this.normalizeHighlightText(this.query()).trim();
    if (!source || !query) {
      return source;
    }

    const cacheKey = `${query}::${source}`;
    const cached = this.highlightedHtmlCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = source;
    const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parentTag = node.parentElement?.tagName?.toLowerCase() || '';
      if (parentTag === 'script' || parentTag === 'style') {
        continue;
      }
      textNodes.push(node);
    }

    textNodes.forEach((node) => {
      const replacement = this.buildHighlightedFragment(node.nodeValue || '', query);
      if (replacement) {
        node.replaceWith(replacement);
      }
    });

    const highlighted = wrapper.innerHTML;
    this.highlightedHtmlCache.set(cacheKey, highlighted);
    return highlighted;
  }

  getHighlightedText(value: string): string {
    const source = String(value || '');
    const query = this.normalizeHighlightText(this.query()).trim();
    if (!source || !query) {
      return this.escapeHtml(source);
    }

    const sourceLower = this.normalizeHighlightText(source);
    let idx = 0;
    let out = '';
    while (idx < source.length) {
      const found = sourceLower.indexOf(query, idx);
      if (found < 0) {
        out += this.escapeHtml(source.slice(idx));
        break;
      }
      out += this.escapeHtml(source.slice(idx, found));
      out += `<mark>${this.escapeHtml(source.slice(found, found + query.length))}</mark>`;
      idx = found + query.length;
    }
    return out;
  }

  scrollToSection(event: Event, id: string, title?: string): void {
    event.preventDefault();

    const article = document.querySelector('.fw-docs .body-grid article');
    if (!article) {
      return;
    }

    const byId = article.querySelector(`#${id}`);
    if (byId) {
      byId.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const normalizedTitle = this.normalizeAnchorText(title || '');
    const heading = Array.from(article.querySelectorAll('h2, h3')).find((h) => {
      const text = this.normalizeAnchorText(h.textContent || '');
      return text === normalizedTitle;
    }) as HTMLElement | undefined;

    if (heading) {
      heading.id = id;
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private normalizeAnchorText(value: string): string {
    return String(value || '')
      .replace(/`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private readTheme(): 'dark' | 'light' {
    const value = localStorage.getItem('wuic_framework_docs_theme');
    return value === 'dark' ? 'dark' : 'light';
  }

  private resetScrollPosition(): void {
    requestAnimationFrame(() => {
      const scroller = this.contentScroller?.nativeElement;
      if (scroller) {
        scroller.scrollTop = 0;
        scroller.scrollLeft = 0;
      }
      globalThis?.window?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  private getSampleLineCount(code: string): number {
    if (!code) {
      return 0;
    }

    return code.split(/\r?\n/).length;
  }

  private buildSearchIndexBySlug(): Map<string, string> {
    const groupTitleBySlug = new Map<string, string>();
    this.content.groups.forEach((group) => {
      group.items.forEach((item) => {
        groupTitleBySlug.set(item.slug, group.title || '');
      });
    });

    const index = new Map<string, string>();
    this.content.pages.forEach((page) => {
      const groupTitle = groupTitleBySlug.get(page.slug) || '';
      const sectionTitles = (page.sections || []).map((s) => s.title || '').join(' ');
      const sectionHtmlText = (page.sections || []).map((s) => this.stripHtml(s.html || '')).join(' ');
      const tocTitles = (page.toc || []).map((t) => t.title || '').join(' ');
      const screenshotCaptions = (page.images || []).map((img) => img.caption || '').join(' ');
      const screenshotIds = (page.images || []).map((img) => img.id || '').join(' ');
      const codeSampleTitles = (page.sections || [])
        .flatMap((s) => (s.codeSamples || []).map((c) => c.title || ''))
        .join(' ');
      // Il corpo degli snippet di codice fa parte della pagina a tutti gli
      // effetti — l'utente si aspetta che cercando un token nel search bar
      // (es. "KonvergenceCore") la pagina che lo contiene in uno snippet
      // venga trovata. Senza questo, snippet invisibili al filtro.
      const codeSampleBodies = (page.sections || [])
        .flatMap((s) => (s.codeSamples || []).map((c) => c.code || ''))
        .join(' ');

      const raw = [
        groupTitle,
        page.title || '',
        page.slug || '',
        page.description || '',
        ...(page.keywords || []),
        ...(page.tags || []),
        sectionTitles,
        sectionHtmlText,
        tocTitles,
        screenshotCaptions,
        screenshotIds,
        codeSampleTitles,
        codeSampleBodies
      ].join(' ');

      index.set(page.slug, this.normalizeSearchText(raw));
    });

    return index;
  }

  private stripHtml(value: string): string {
    return String(value || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeSearchText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeHighlightText(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private buildHighlightedFragment(value: string, normalizedQuery: string): DocumentFragment | null {
    const original = String(value || '');
    if (!original) {
      return null;
    }

    const normalized = this.normalizeHighlightText(original);
    let idx = 0;
    let foundAny = false;
    const fragment = document.createDocumentFragment();

    while (idx < original.length) {
      const found = normalized.indexOf(normalizedQuery, idx);
      if (found < 0) {
        fragment.appendChild(document.createTextNode(original.slice(idx)));
        break;
      }

      foundAny = true;
      if (found > idx) {
        fragment.appendChild(document.createTextNode(original.slice(idx, found)));
      }

      const mark = document.createElement('mark');
      mark.textContent = original.slice(found, found + normalizedQuery.length);
      fragment.appendChild(mark);
      idx = found + normalizedQuery.length;
    }

    return foundAny ? fragment : null;
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private getSnippetLanguageKey(language: string): 'html' | 'json' | 'ts' | 'cs' | 'text' {
    const lang = String(language || '').trim().toLowerCase();
    if (lang === 'html' || lang === 'xml') return 'html';
    if (lang === 'json') return 'json';
    if (lang === 'ts' || lang === 'typescript' || lang === 'javascript' || lang === 'js') return 'ts';
    if (lang === 'cs' || lang === 'csharp' || lang === 'c#') return 'cs';
    return 'text';
  }

  private highlightCodeByLanguage(code: string, language: string): string {
    const lang = this.getSnippetLanguageKey(language);
    const escaped = this.escapeHtml(code || '');

    if (lang === 'html') {
      return this.applyTokenPatterns(escaped, [
        { regex: /&lt;!--[\s\S]*?--&gt;/g, cls: 'tok-comment' },
        { regex: /(&lt;\/?)([a-zA-Z0-9:-]+)/g, replacer: (_m, p1, p2) => `${p1}<span class="tok-tag">${p2}</span>` },
        { regex: /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, replacer: (_m, p1, p2, p3) => `<span class="tok-attr">${p1}</span><span class="tok-op">${p2}</span><span class="tok-string">${p3}</span>` },
        { regex: /(&lt;|&gt;|\/&gt;|&lt;\/)/g, cls: 'tok-op' }
      ]);
    }

    if (lang === 'json') {
      return this.applyTokenPatterns(escaped, [
        { regex: /&quot;([^&]|&amp;|&#39;|&quot;)*?&quot;\s*:/g, replacer: (m) => `<span class="tok-key">${m.slice(0, -1)}</span><span class="tok-op">:</span>` },
        { regex: /:\s*(&quot;([^&]|&amp;|&#39;|&quot;)*?&quot;)/g, replacer: (_m, p1) => `: <span class="tok-string">${p1}</span>` },
        { regex: /\b(true|false|null)\b/g, cls: 'tok-keyword' },
        { regex: /\b-?\d+(\.\d+)?([eE][+-]?\d+)?\b/g, cls: 'tok-number' }
      ]);
    }

    if (lang === 'ts') {
      return this.applyTokenPatterns(escaped, [
        { regex: /\/\/.*/g, cls: 'tok-comment' },
        { regex: /\/\*[\s\S]*?\*\//g, cls: 'tok-comment' },
        { regex: /(&quot;([^&]|&amp;|&#39;|&quot;)*?&quot;|&#39;([^&]|&amp;|&#39;|&quot;)*?&#39;|`[^`]*`)/g, cls: 'tok-string' },
        { regex: /\b(import|from|export|const|let|var|function|return|if|else|for|while|await|async|new|class|extends|implements|public|private|protected|readonly|interface|type|as|switch|case|break|default|try|catch|finally|throw)\b/g, cls: 'tok-keyword' },
        { regex: /\b(string|number|boolean|void|any|unknown|never|Promise|Record|BehaviorSubject)\b/g, cls: 'tok-type' },
        { regex: /\b([A-Za-z_][\w]*)(?=\s*\()/g, cls: 'tok-fn' },
        { regex: /(\.)([A-Za-z_][\w]*)/g, replacer: (_m, p1, p2) => `${p1}<span class="tok-prop">${p2}</span>` },
        // Keep HTML entities (&lt; / &gt;) intact to avoid rendering them as literal text.
        { regex: /(?:&lt;|&gt;|[=+\-*/%!|?:]+)/g, cls: 'tok-op' },
        { regex: /\b-?\d+(\.\d+)?\b/g, cls: 'tok-number' }
      ]);
    }

    if (lang === 'cs') {
      return this.applyTokenPatterns(escaped, [
        { regex: /\/\/.*/g, cls: 'tok-comment' },
        { regex: /\/\*[\s\S]*?\*\//g, cls: 'tok-comment' },
        { regex: /(&quot;([^&]|&amp;|&#39;|&quot;)*?&quot;|&#39;([^&]|&amp;|&#39;|&quot;)*?&#39;)/g, cls: 'tok-string' },
        { regex: /\b(using|namespace|class|public|private|protected|internal|static|void|string|int|bool|var|new|return|if|else|switch|case|break|default|try|catch|finally|throw|async|await|Task|List|Dictionary)\b/g, cls: 'tok-keyword' },
        { regex: /\b([A-Za-z_][\w]*)(?=\s*\()/g, cls: 'tok-fn' },
        { regex: /(\.)([A-Za-z_][\w]*)/g, replacer: (_m, p1, p2) => `${p1}<span class="tok-prop">${p2}</span>` },
        // Keep HTML entities (&lt; / &gt;) intact to avoid rendering them as literal text.
        { regex: /(?:&lt;|&gt;|[=+\-*/%!|?:]+)/g, cls: 'tok-op' },
        { regex: /\b-?\d+(\.\d+)?\b/g, cls: 'tok-number' }
      ]);
    }

    return escaped;
  }

  private applyTokenPatterns(
    source: string,
    patterns: Array<
      { regex: RegExp; cls: string; replacer?: never } |
      { regex: RegExp; cls?: never; replacer: (...args: any[]) => string }
    >
  ): string {
    let work = source;
    const placeholders: string[] = [];
    const tokenFor = (index: number) => `@@WUIC_TOK_${index}@@`;
    const tokenRegex = /@@WUIC_TOK_(\d+)@@/g;

    patterns.forEach((pattern) => {
      work = work.replace(pattern.regex, (...args: any[]) => {
        const rendered = 'cls' in pattern && pattern.cls
          ? `<span class="${pattern.cls}">${args[0]}</span>`
          : pattern.replacer(...args);
        const token = tokenFor(placeholders.length);
        placeholders.push(rendered);
        return token;
      });
    });

    // Restore recursively in case a rendered replacement still contains tokens.
    while (tokenRegex.test(work)) {
      tokenRegex.lastIndex = 0;
      work = work.replace(tokenRegex, (_m, i) => placeholders[Number(i)] || '');
    }

    return work;
  }
}
