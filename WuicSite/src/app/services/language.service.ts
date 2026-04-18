import { Injectable, signal } from '@angular/core';

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

const STORAGE_KEY = 'wuic-site-lang';

/**
 * Shared signal for the currently selected site language. Components subscribe
 * to `current()` reactively; changes are persisted to localStorage and read back
 * on next visit. Default is Italian (project default + first manifest entry).
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly _current = signal<string>(this.readInitial());

  readonly languages = SITE_LANGUAGES;
  readonly current = this._current.asReadonly();

  setLanguage(code: string): void {
    if (!SITE_LANGUAGES.some(l => l.code === code)) return;
    this._current.set(code);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, code);
      }
    } catch {
      // ignore storage quota / privacy-mode errors
    }
  }

  getLanguageByCode(code: string): SiteLanguage | undefined {
    return SITE_LANGUAGES.find(l => l.code === code);
  }

  /**
   * Resolve the initial language, in this priority order:
   *   1) localStorage — last user choice (if still valid)
   *   2) navigator.languages — user's preferred browser languages, in order
   *   3) navigator.language — single primary locale (legacy fallback)
   *   4) 'en-US' — universal fallback when nothing matches
   *
   * Matching first tries exact `code` (e.g. 'fr-FR') then language prefix
   * (e.g. 'fr' matches 'fr-FR') so that visitors with region-specific locales
   * (fr-CA, en-GB, es-MX, de-CH, …) still hit the nearest supported language.
   */
  private readInitial(): string {
    try {
      // 1) Persisted user choice wins
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && SITE_LANGUAGES.some(l => l.code === saved)) return saved;
      }

      // 2) Browser preference list (ordered by user priority in settings)
      if (typeof navigator !== 'undefined') {
        const prefs: string[] = Array.isArray(navigator.languages) && navigator.languages.length > 0
          ? [...navigator.languages]
          : (navigator.language ? [navigator.language] : []);

        for (const pref of prefs) {
          if (!pref) continue;
          // Exact match (fr-FR == fr-FR)
          const exact = SITE_LANGUAGES.find(l => l.code.toLowerCase() === pref.toLowerCase());
          if (exact) return exact.code;
          // Language-code match (fr matches fr-FR, en-GB matches en-US, de-CH matches de-DE)
          const prefLang = pref.split('-')[0].toLowerCase();
          const byLang = SITE_LANGUAGES.find(l => l.code.split('-')[0].toLowerCase() === prefLang);
          if (byLang) return byLang.code;
        }
      }
    } catch {
      // ignore localStorage/privacy-mode errors
    }
    // 3) Universal fallback
    return 'en-US';
  }
}
