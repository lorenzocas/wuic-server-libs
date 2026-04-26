import { inject, Injectable, DestroyRef } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from './language.service';

/**
 * Per-route SEO metadata applied at runtime.
 * Each routed page calls `seo.set({...})` in its constructor / ngOnInit so
 * that title, description, canonical, og:url, and hreflang reflect the
 * current page (not the static defaults baked in index.html, which only
 * cover the home page).
 *
 * Why not @Title in the route definition: ngx-translate keys aren't
 * available at route-config time (translations load asynchronously). Each
 * page can pass its translation keys here and the service resolves them
 * via TranslateService.instant — works because pages render only after
 * APP_INITIALIZER has primed the active language file.
 */
export interface PageSeo {
  /** i18n key for the document <title>. Suffixed with " — WUIC Framework" automatically. */
  titleKey: string;
  /** i18n key for the meta description (≤160 chars in the translated value). */
  descriptionKey: string;
  /** Path of the current route, e.g. '/pricing'. Drives canonical + og:url + hreflang. */
  path: string;
  /** Optional translation params for titleKey / descriptionKey interpolation. */
  params?: Record<string, unknown>;
}

const SUPPORTED_LANGS = ['it-IT', 'en-US', 'fr-FR', 'es-ES', 'de-DE'] as const;
const BASE_URL = 'https://wuic-framework.com';

@Injectable({ providedIn: 'root' })
export class SeoService {
  private titleSvc = inject(Title);
  private metaSvc = inject(Meta);
  private translate = inject(TranslateService);
  private langSvc = inject(LanguageService);
  private doc = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);

  /** Last config — used to re-apply meta when the active language changes. */
  private current: PageSeo | null = null;

  constructor() {
    // Keep meta in sync with the active language: when the user flips the
    // navbar flag, the description (and title if interpolated) needs to
    // re-render in the new language. ngx-translate emits onLangChange.
    const sub = this.translate.onLangChange.subscribe(() => {
      if (this.current) this.applyAll(this.current);
      this.applyHtmlLang();
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    // Set the initial <html lang="..."> from the user's current language
    // (overrides the static "en" baked into index.html).
    this.applyHtmlLang();
  }

  /** Main entry: applies every SEO field for the current route. */
  set(seo: PageSeo): void {
    this.current = seo;
    this.applyAll(seo);
  }

  private applyAll(seo: PageSeo): void {
    const titleBase = this.translate.instant(seo.titleKey, seo.params);
    const title = titleBase ? `${titleBase} — WUIC Framework` : 'WUIC Framework';
    const description = this.translate.instant(seo.descriptionKey, seo.params);
    const canonical = `${BASE_URL}${seo.path}`;

    this.titleSvc.setTitle(title);

    this.upsertMetaName('description', description);

    // Open Graph (Facebook, LinkedIn, WhatsApp, Slack)
    this.upsertMetaProp('og:title', title);
    this.upsertMetaProp('og:description', description);
    this.upsertMetaProp('og:url', canonical);
    this.upsertMetaProp('og:locale', this.ogLocale(this.langSvc.current()));
    // Reset alternates each time so we don't accumulate duplicates
    this.removeAllMetaProp('og:locale:alternate');
    SUPPORTED_LANGS
      .filter(l => l !== this.langSvc.current())
      .forEach(l => this.appendMetaProp('og:locale:alternate', this.ogLocale(l)));

    // Twitter
    this.upsertMetaName('twitter:title', title);
    this.upsertMetaName('twitter:description', description);

    // Canonical link
    this.upsertLink('canonical', canonical);

    // hreflang: tell crawlers about the same page in other languages.
    // We don't have separate URLs per language (the SPA uses ngx-translate
    // at runtime), so all hreflang point to the same path. This is still
    // useful to declare the languages we serve — Google + Bing accept it
    // and can pick the right one based on the user's browser locale.
    this.removeAllLinkRel('alternate');
    SUPPORTED_LANGS.forEach(l => {
      this.appendLink({
        rel: 'alternate',
        hreflang: this.htmlLang(l),
        href: canonical,
      });
    });
    // x-default is the fallback for unmatched user locales — point to canonical.
    this.appendLink({ rel: 'alternate', hreflang: 'x-default', href: canonical });
  }

  /** Sync <html lang="..."> with active language so screen readers + crawlers know. */
  private applyHtmlLang(): void {
    const html = this.doc.documentElement;
    if (html) html.setAttribute('lang', this.htmlLang(this.langSvc.current()));
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  /** ngx-translate language code → HTML lang attribute (e.g. 'en-US' stays). */
  private htmlLang(code: string): string {
    return code; // already in the BCP-47 format Angular and HTML expect
  }

  /** ngx-translate → Open Graph locale ('en-US' → 'en_US'). */
  private ogLocale(code: string): string {
    return code.replace('-', '_');
  }

  private upsertMetaName(name: string, content: string): void {
    if (this.metaSvc.getTag(`name="${name}"`)) {
      this.metaSvc.updateTag({ name, content });
    } else {
      this.metaSvc.addTag({ name, content });
    }
  }

  private upsertMetaProp(property: string, content: string): void {
    if (this.metaSvc.getTag(`property="${property}"`)) {
      this.metaSvc.updateTag({ property, content });
    } else {
      this.metaSvc.addTag({ property, content });
    }
  }

  private appendMetaProp(property: string, content: string): void {
    this.metaSvc.addTag({ property, content });
  }

  private removeAllMetaProp(property: string): void {
    this.metaSvc.getTags(`property="${property}"`).forEach(t => t.remove());
  }

  /** Insert/update a single <link rel="..."> in <head>. */
  private upsertLink(rel: string, href: string): void {
    let link = this.doc.querySelector(`link[rel="${rel}"]:not([hreflang])`) as HTMLLinkElement | null;
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', rel);
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private appendLink(attrs: Record<string, string>): void {
    const link = this.doc.createElement('link');
    Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v));
    this.doc.head.appendChild(link);
  }

  private removeAllLinkRel(rel: string): void {
    this.doc.querySelectorAll(`link[rel="${rel}"]`).forEach(l => l.remove());
  }
}
