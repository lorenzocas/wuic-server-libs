import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DEFAULT_LOCALE, localeFromPath } from './locale-url';

export interface SiteLanguage {
  code: string;           // ISO locale used inside docs manifest, e.g. 'it-IT'
  short: string;          // 2-letter display code, e.g. 'IT'
  label: string;          // Native language name, e.g. 'Italiano'
  /**
   * ISO 3166-1 alpha-2 country code (lowercase) used to render the flag via
   * the `flag-icons` library. We intentionally use country codes (not locale
   * codes) because the flag belongs to a country, not a language:
   *   - 'en-US' → 'gb' (British flag, traditional for "English" in language
   *     pickers even though US uses en-US — more recognizable to EU visitors)
   *   - 'es-ES' → 'es' (Spain flag rather than Latin-American variants)
   * In the template we render it with `<span class="fi fi-{{lang.flag}}"></span>`.
   */
  flag: string;
}

/**
 * List of languages supported by the public site. The `code` must match the
 * lang keys used in the docs content manifest (docs.generated.json) so that
 * the same switcher drives both the site chrome and the docs body.
 */
export const SITE_LANGUAGES: SiteLanguage[] = [
  { code: 'it-IT', short: 'IT', label: 'Italiano', flag: 'it' },
  { code: 'en-US', short: 'EN', label: 'English',  flag: 'gb' },
  { code: 'fr-FR', short: 'FR', label: 'Français', flag: 'fr' },
  { code: 'es-ES', short: 'ES', label: 'Español',  flag: 'es' },
  { code: 'de-DE', short: 'DE', label: 'Deutsch',  flag: 'de' },
];

/**
 * Shared signal for the currently selected site language.
 *
 * URL-FIRST (2026-07-14, EN-root prerender): la lingua iniziale è derivata
 * ESCLUSIVAMENTE dal path (`/it/**` → it-IT, root → en-US) via `localeFromPath`.
 * Le vecchie euristiche localStorage/navigator sono state RIMOSSE di proposito:
 * durante il prerender SSG `navigator` riflette il locale della BUILD MACHINE
 * (macchina italiana → tutte le pagine statiche uscivano `lang="it-IT"`), e a
 * runtime avrebbero fatto divergere lingua della UI e lingua dell'URL, rompendo
 * canonical/hreflang. La scelta utente ora vive nell'URL: il LanguageSelector
 * NAVIGA alla variante localizzata (vedi language-selector.ts).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly doc = inject(DOCUMENT);
  private readonly _current = signal<string>(this.readInitial());

  readonly languages = SITE_LANGUAGES;
  readonly current = this._current.asReadonly();

  setLanguage(code: string): void {
    if (!SITE_LANGUAGES.some(l => l.code === code)) return;
    this._current.set(code);
  }

  getLanguageByCode(code: string): SiteLanguage | undefined {
    return SITE_LANGUAGES.find(l => l.code === code);
  }

  /**
   * Lingua iniziale = prefisso locale dell'URL corrente (deterministico sia
   * nel browser sia nel prerender: platform-server espone DOCUMENT.location
   * con l'URL della route in corso di prerender). Root senza prefisso = EN.
   */
  private readInitial(): string {
    try {
      const path = this.doc?.location?.pathname ?? '/';
      return localeFromPath(path) ?? DEFAULT_LOCALE;
    } catch {
      return DEFAULT_LOCALE;
    }
  }
}
