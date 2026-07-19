/**
 * Mapping URL-prefix ⇄ locale per il sito pubblico (SSG per-URL).
 *
 * Schema URL (decisione 2026-07-14, piano Visibilità W9-12):
 *   - `/`          → en-US (root = inglese, NESSUN redirect, x-default)
 *   - `/it/...`    → it-IT
 *   - `/fr/...`    → fr-FR
 *   - `/es/...`    → es-ES
 *   - `/de/...`    → de-DE
 *
 * Tutte e 5 le lingue restano supportate (nessun drop). La lingua attiva è
 * derivata DETERMINISTICAMENTE dal primo segmento dell'URL — mai da
 * `navigator`/localStorage — così il prerender SSG bake la lingua giusta in
 * ogni pagina statica indipendentemente dal locale della build machine
 * (bug storico: tutte le pagine uscivano `lang="it-IT"` perché la macchina
 * di build era italiana).
 *
 * Questo modulo è puro (niente Angular) così può essere importato sia dai
 * servizi runtime sia — concettualmente — replicato nel generatore sitemap.
 */

/** prefix URL (senza slash) → locale BCP-47. La root (prefix '') è en-US. */
export const LOCALE_BY_PREFIX: Record<string, string> = {
  it: 'it-IT',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
};

export const PREFIX_BY_LOCALE: Record<string, string> = Object.fromEntries(
  Object.entries(LOCALE_BY_PREFIX).map(([p, l]) => [l, p])
);

export const DEFAULT_LOCALE = 'en-US';

/** Prefissi locale ('it' | 'fr' | 'es' | 'de') in ordine stabile. */
export const LOCALE_PREFIXES = Object.keys(LOCALE_BY_PREFIX);

/**
 * Locale dal pathname: '/it/pricing' → 'it-IT'; '/pricing' → null (root=EN).
 * Match sul PRIMO segmento esatto: '/italia-tour' NON matcha 'it'.
 */
export function localeFromPath(pathname: string): string | null {
  const first = String(pathname || '/').replace(/^\/+/, '').split('/')[0].toLowerCase();
  return LOCALE_BY_PREFIX[first] ?? null;
}

/** Path senza l'eventuale prefisso locale: '/it/pricing' → '/pricing'. */
export function stripLocalePrefix(pathname: string): string {
  const clean = String(pathname || '/');
  const first = clean.replace(/^\/+/, '').split('/')[0].toLowerCase();
  if (!LOCALE_BY_PREFIX[first]) return clean;
  const rest = clean.replace(/^\/+/, '').split('/').slice(1).join('/');
  return '/' + rest;
}

/**
 * Path localizzato per un locale: ('/pricing', 'it-IT') → '/it/pricing';
 * ('/pricing', 'en-US') → '/pricing'; ('/', 'de-DE') → '/de'.
 * Accetta anche path già prefissati (li normalizza prima).
 */
export function localizePath(pathname: string, locale: string): string {
  const base = stripLocalePrefix(pathname);
  const prefix = PREFIX_BY_LOCALE[locale] ?? '';
  if (!prefix) return base;
  return base === '/' ? `/${prefix}` : `/${prefix}${base}`;
}
