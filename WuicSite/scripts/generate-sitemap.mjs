// generate-sitemap.mjs
//
// Build-time sitemap generator for https://wuic-framework.com.
// Runs as `prebuild` (before `ng build`), regenerating `public/sitemap.xml`
// from a curated list of public routes.
//
// `<lastmod>` per route is computed from the most recent mtime among the
// route's component files (.ts/.html/.scss). Using mtime instead of "today"
// keeps Google honest: lastmod reflects when the PAGE actually changed, not
// when the site was last deployed. Lying about lastmod (e.g. always = today)
// can cause Google to deprioritize crawling — see
// https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#additional-notes
//
// To add a new route: append an entry to `ROUTES` below. The script auto-
// derives <loc>, computes <lastmod> from filesystem, and writes the file.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const SRC_PAGES = resolve(REPO_ROOT, 'src/app/pages');
export const OUT_FILE = resolve(REPO_ROOT, 'public/sitemap.xml');
export const BASE_URL = 'https://wuic-framework.com';

/**
 * Routes mirror src/app/app.routes.ts. `dir` is the page folder under
 * src/app/pages/ — the script walks it for the most recent file mtime.
 *
 *  changefreq: hint for crawlers about how often the page is updated.
 *              Valid values: always | hourly | daily | weekly | monthly | yearly | never
 *  priority:   hint about importance relative to other URLs (0.0 .. 1.0).
 *              Note: most modern engines (Google in particular) IGNORE both
 *              changefreq and priority, but they're harmless and Bing still
 *              uses them as one of many signals.
 */
export const ROUTES = [
  { path: '/',           dir: 'home',      changefreq: 'weekly',  priority: 1.0 },
  { path: '/features',   dir: 'features',  changefreq: 'monthly', priority: 0.9 },
  { path: '/pricing',    dir: 'pricing',   changefreq: 'monthly', priority: 0.9 },
  { path: '/comparison', dir: 'comparison', changefreq: 'monthly', priority: 0.8 },
  { path: '/gallery',    dir: 'gallery',   changefreq: 'monthly', priority: 0.7 },
  { path: '/docs',       dir: 'docs',      changefreq: 'weekly',  priority: 0.8 },
  { path: '/blog',       dir: 'blog',      changefreq: 'weekly',  priority: 0.8 },
  { path: '/downloads',  dir: 'downloads', changefreq: 'weekly',  priority: 0.8 },
  { path: '/sandbox',    dir: 'sandbox',   changefreq: 'monthly', priority: 0.6 },
  { path: '/legal',      dir: 'legal',     changefreq: 'yearly',  priority: 0.3 },
  { path: '/privacy',    dir: 'privacy',   changefreq: 'yearly',  priority: 0.3 },
  { path: '/cookies',    dir: 'cookies',   changefreq: 'yearly',  priority: 0.3 },
  { path: '/terms',      dir: 'terms',     changefreq: 'yearly',  priority: 0.3 },
];

/**
 * Read the blog manifest (produced by generate-blog-manifest.mjs in the
 * same prebuild chain) and emit one ROUTES entry per published post.
 * `lastmod` per post is the article's `date` field — that's the
 * authoritative publication date the author put in the frontmatter,
 * which is what Google wants to see in a blog sitemap (filesystem mtime
 * would shift on every formatter pass and make every old post look
 * "freshly updated", which Google penalizes as low-trust signal).
 *
 * Returns [] when the manifest is missing — keeps the build deterministic
 * if someone runs `node generate-sitemap.mjs` standalone before the blog
 * generator has run. The next pre-build will pick the posts up.
 */
function blogPostEntries() {
  const manifestPath = resolve(REPO_ROOT, 'public/blog-manifest.json');
  if (!existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return (manifest.posts ?? []).map(post => ({
      loc: `${BASE_URL}/blog/${post.slug}`,
      lastmod: post.date,
      changefreq: 'monthly',
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns ISO timestamp (ms since epoch) of the most recent git commit that
 * touched any file under `dir`. Used as the authoritative source of truth
 * for sitemap <lastmod>: git history survives `git clone`, `git pull`,
 * format-on-save, robocopy, etc. — unlike filesystem mtime which gets
 * reset to "now" on every fresh checkout (a real problem in CI/CD).
 *
 * Returns 0 if git is unavailable, the dir is outside any git repo, or no
 * commit ever touched files inside `dir` — caller falls back to mtime.
 */
function gitMaxCommitTime(dir) {
  try {
    // %ct = committer date as Unix timestamp (seconds). One log call across
    // the whole subtree is much faster than per-file lookups.
    const out = execFileSync('git', [
      '-C', REPO_ROOT,
      'log', '-1',
      '--format=%ct',
      '--', dir,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!out) return 0;
    const seconds = parseInt(out, 10);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  } catch {
    // Not a git repo, or git not on PATH — fallback path takes over.
    return 0;
  }
}

/**
 * Most recent filesystem mtime of any non-generated file under `dir`.
 * Used as fallback when git history is unavailable. Be aware this is NOT
 * a reliable SEO source — see comment on gitMaxCommitTime above.
 */
export function maxMtime(dir) {
  let max = 0;
  function walk(p) {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) {
      for (const child of readdirSync(p)) walk(join(p, child));
    } else {
      // Skip generated/transient files
      if (/\.(spec|d)\.ts$|\.map$/.test(p)) return;
      if (st.mtimeMs > max) max = st.mtimeMs;
    }
  }
  walk(dir);
  return max;
}

/** Best available "last modified" timestamp for a directory: git first, mtime fallback. */
export function lastModifiedMs(dir) {
  const gt = gitMaxCommitTime(dir);
  if (gt > 0) return gt;
  return maxMtime(dir);
}

/**
 * Pure: build sitemap URL entries from ROUTES + filesystem mtimes.
 * Exported so the postbuild sanity checker can re-run the same logic in
 * memory and compare against the file actually shipped in dist/.
 */
export function buildSitemapEntries() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const staticEntries = ROUTES.map(({ path, dir, changefreq, priority }) => {
    const folder = join(SRC_PAGES, dir);
    const ts = lastModifiedMs(folder);
    // Fallback to today if both git and fs lookups failed (e.g. route added
    // but page folder not yet created on disk).
    const lastmod = ts > 0
      ? new Date(ts).toISOString().slice(0, 10)
      : todayIso;
    return { loc: `${BASE_URL}${path}`, lastmod, changefreq, priority };
  });
  // Concat one entry per blog post — discovered from the manifest so this
  // script doesn't need to be edited every time an article is published.
  return [...staticEntries, ...blogPostEntries()];
}

/** Pure: serialize entries to the canonical sitemap XML string. */
export function buildSitemapXml(entries) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(u => [
      '  <url>',
      `    <loc>${u.loc}</loc>`,
      `    <lastmod>${u.lastmod}</lastmod>`,
      `    <changefreq>${u.changefreq}</changefreq>`,
      `    <priority>${u.priority.toFixed(1)}</priority>`,
      '  </url>',
    ].join('\n')),
    '</urlset>',
    '',
  ].join('\n');
}

// Run as script: write the file. When imported as a module by the postbuild
// sanity checker, the side-effecting block below is skipped.
const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`
            || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const urls = buildSitemapEntries();
  const xml = buildSitemapXml(urls);
  writeFileSync(OUT_FILE, xml, 'utf8');
  console.log(`[sitemap] wrote ${OUT_FILE} (${urls.length} URLs, lastmod range ${
    urls.reduce((min, u) => u.lastmod < min ? u.lastmod : min, '9999-99-99')
  } .. ${
    urls.reduce((max, u) => u.lastmod > max ? u.lastmod : max, '0000-00-00')
  })`);
}
