import { Component, signal, computed, effect, inject, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { ImageModule } from 'primeng/image';
import { TranslatePipe } from '@ngx-translate/core';
import { DocsContentManifest, DocsPage, DocsNavGroup, DocsSection, DocsCodeSample } from '../../models/docs.model';
import { LanguageService } from '../../services/language.service';
import { SeoService } from '../../services/seo.service';
import { articleSchema } from '../../services/seo-schemas';
import { localizePath } from '../../services/locale-url';

/**
 * Cache dei manifesti per lingua, a livello di MODULO e non di componente.
 *
 * Navigare tra prefissi locale (`/it/docs/x` → `/de/docs/x`) distrugge e
 * ricrea il componente Docs: con la cache dentro la classe, ogni cambio
 * lingua ripartiva da zero e rifaceva la richiesta da ~650 KB.
 *
 * Contiene solo contenuto pubblico e immutabile, indicizzato per lingua —
 * nessun dato utente, quindi condividerlo tra istanze è sicuro. In prerender
 * il beneficio è anche maggiore: le 158 pagine statiche parsano il manifesto
 * una volta sola invece di 158.
 */
const manifestByLang = new Map<string, Promise<DocsContentManifest | null>>();

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
  private seo = inject(SeoService);
  private http = inject(HttpClient);

  constructor() {
    // SEO REATTIVO, non one-shot. `/docs` e `/docs/:slug` montano lo STESSO
    // componente: un singolo `set()` nel constructor con `path: '/docs'`
    // hardcoded faceva emettere a tutte le 79 pagine (×5 lingue) lo stesso
    // <title>, la stessa description e soprattutto `canonical = /docs` —
    // cioè ogni pagina dichiarava di essere un duplicato dell'indice, e
    // nessuna poteva posizionarsi. Qui il set() rigira a ogni cambio di
    // slug, di lingua e all'arrivo del manifesto (i signal letti dentro
    // `applySeo` sono le dipendenze dell'effect).
    effect(() => this.applySeo());

    // Cambio lingua dalla navbar: serve il manifesto dell'altra lingua, che
    // ora è un file separato. `loadManifest` deduplica, quindi la prima
    // esecuzione di questo effect e quella di ngOnInit condividono la stessa
    // richiesta invece di farne due.
    effect(() => void this.loadManifest(this.currentLang()));
  }

  manifest = signal<DocsContentManifest | null>(null);
  loading = signal(true);
  query = signal('');
  currentSlug = signal('getting-started');
  /**
   * `/docs` senza slug mostra `getting-started` come contenuto di cortesia,
   * ma NON è la stessa URL: l'indice deve restare canonical su `/docs` e la
   * pagina di dettaglio su `/docs/getting-started`, altrimenti le due si
   * cannibalizzano. Questo flag distingue i due casi per il SEO.
   */
  private hasSlug = signal(false);
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
    // Il vecchio fallback `it-IT:<slug>` è stato rimosso: il manifesto ora
    // contiene UNA sola lingua, quindi non c'è nessuna copia italiana su cui
    // ripiegare. Non è una perdita: il generatore emette tutti gli slug in
    // tutte e cinque le lingue (79 ciascuna), quindi il fallback non è mai
    // scattato. Se un domani la parità si rompesse, qui si vedrebbe la pagina
    // vuota invece di contenuto silenziosamente nella lingua sbagliata —
    // che è il comportamento giusto per accorgersene.
    return map.get(`${lang}:${slug}`) ?? null;
  });

  breadcrumbs = computed(() => {
    const page = this.currentPage();
    if (!page) return ['Docs'];
    const group = this.groups().find(g => g.items.some(i => i.slug === page.slug));
    return ['Docs', group?.title || '', page.title].filter(Boolean);
  });

  /**
   * Applica title/description/canonical/hreflang della pagina corrente.
   * Chiamato da un effect: finché il manifesto non è caricato `currentPage()`
   * è null e restiamo sui metadata dell'indice — meglio un titolo generico
   * per un istante che un titolo vuoto nell'HTML prerenderizzato.
   */
  private applySeo(): void {
    const page = this.currentPage();
    const slug = this.currentSlug();
    const lang = this.currentLang();

    if (!this.hasSlug() || !page) {
      this.seo.set({ titleKey: 'seo.docs.title', descriptionKey: 'seo.docs.description', path: '/docs' });
      return;
    }

    // `path` va passato SENZA prefisso locale: SeoService lo localizza da sé
    // per canonical e hreflang. Lo schema JSON-LD invece vuole l'URL finale,
    // quindi lì il prefisso lo mettiamo noi — altrimenti `mainEntityOfPage`
    // punterebbe alla variante inglese anche sulle pagine /it /fr /es /de.
    const basePath = `/docs/${slug}`;
    const description = this.metaDescription(page);
    const generatedAt = (this.manifest()?.generatedAt || '').slice(0, 10);

    this.seo.set({
      titleLiteral: page.title,
      descriptionLiteral: description,
      path: basePath,
      structuredData: articleSchema({
        headline: page.title,
        description,
        path: localizePath(basePath, lang),
        datePublished: generatedAt || '2026-01-01',
      }),
    });
  }

  /**
   * Meta description derivata dal CORPO della pagina, non dal campo
   * `description` del manifesto: quel campo è il template italiano
   * "<Titolo> - documentazione operativa e tecnica" su tutte e cinque le
   * lingue (pagine inglesi comprese), quindi produrrebbe 395 description
   * identiche e nella lingua sbagliata. Il corpo invece è tradotto davvero.
   */
  private metaDescription(page: DocsPage): string {
    let text = (page.sections || [])
      .map(s => s.html || '')
      .join(' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#\d+;|&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Il corpo si apre quasi sempre con l'H1, che è già il <title>: ripeterlo
    // in apertura di description brucia caratteri utili nello snippet SERP.
    if (page.title && text.toLowerCase().startsWith(page.title.toLowerCase())) {
      text = text.slice(page.title.length).trim();
    }

    if (text.length < 40) return page.description || '';
    if (text.length <= 155) return text;
    const cut = text.slice(0, 155);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}…`;
  }

  /**
   * Carica il manifesto della lingua richiesta.
   *
   * Un file per lingua invece del monolite: il vecchio `docs-content.json`
   * pesava 3,2 MB e veniva scaricato intero per leggere ~8 KB di una pagina.
   * Chi legge `/it/docs` non ha alcun bisogno delle altre quattro lingue.
   *
   * HttpClient e NON `fetch` grezzo: il prerender SSG intercetta solo il
   * backend fetch di HttpClient (withFetch). Con la fetch nativa il manifesto
   * non si risolve durante il prerender e l'HTML statico esce col corpo VUOTO
   * — è il motivo per cui `docs/:slug` era rimasto in RenderMode.Client.
   *
   * I manifesti già scaricati restano in cache: cambiare lingua avanti e
   * indietro nella navbar non deve ri-scaricare nulla.
   */
  private async loadManifest(lang: string): Promise<void> {
    // In cache stanno le PROMISE, non i dati: ngOnInit e l'effect sul cambio
    // lingua possono chiedere la stessa lingua nello stesso tick, e con una
    // cache di soli dati partirebbero due fetch identiche.
    let pending = manifestByLang.get(lang);
    if (!pending) {
      this.loading.set(true);
      pending = firstValueFrom(
        this.http.get<DocsContentManifest>(`/docs-content.${lang}.json`)
      ).catch(e => {
        console.error(`Failed to load docs manifest for ${lang}:`, e);
        // La promise fallita non resta in cache, altrimenti un errore di rete
        // temporaneo renderebbe quella lingua irrecuperabile per tutta la sessione.
        manifestByLang.delete(lang);
        return null;
      });
      manifestByLang.set(lang, pending);
    }
    const data = await pending;
    // Nel frattempo l'utente può aver cambiato di nuovo lingua: pubblicare un
    // manifesto ormai superato farebbe lampeggiare la pagina nella lingua sbagliata.
    if (data && this.currentLang() === lang) this.manifest.set(data);
    if (this.currentLang() === lang) this.loading.set(false);
  }

  async ngOnInit() {
    await this.loadManifest(this.currentLang());

    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug');
      this.hasSlug.set(!!slug);
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

  /**
   * href della voce di sidebar, col prefisso locale della lingua attiva.
   *
   * Serve l'href REALE, non basta il (click): i crawler seguono l'attributo,
   * non il gestore JS. Con `/docs/<slug>` fisso, gli alberi `/it /fr /es /de`
   * non ricevevano NESSUN link interno — irraggiungibili per il crawl anche
   * una volta prerenderizzati e messi in sitemap. Vale anche per il
   * click-centrale e l'apri-in-nuova-scheda dell'utente.
   */
  docHref(slug: string): string {
    return localizePath(`/docs/${slug}`, this.currentLang());
  }

  openPage(slug: string) {
    this.currentSlug.set(slug);
    // Lo scroll-to-top e' gestito centralmente nel paramMap.subscribe
    // (vedi ngOnInit): `router.navigate` triggera quella subscribe, quindi
    // qui non serve duplicare la chiamata — evita un doppio scroll che su
    // Safari puo' produrre un "jump" percepibile.
    //
    // Il prefisso locale va PRESERVATO: `navigate(['/docs', slug])` porta
    // alla root inglese, e siccome LanguageService deriva la lingua dal path,
    // un click nella sidebar da `/it/docs` cambiava lingua sotto i piedi e
    // rendeva l'albero localizzato irraggiungibile navigando.
    this.router.navigateByUrl(localizePath(`/docs/${slug}`, this.currentLang()));
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
