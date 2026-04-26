// check-sitemap.mjs
//
// Postbuild sanity check on dist/WuicSite/browser/sitemap.xml.
//
// What can go wrong that this catches:
//   - prebuild was bypassed (e.g. user ran `ng build` directly instead of
//     `npm run build`) -> sitemap stale or missing
//   - someone hand-edited public/sitemap.xml between prebuild and now
//   - a route was added to ROUTES but the corresponding page folder is
//     missing on disk (would fall back to today() — flagged here)
//   - dist/sitemap.xml entirely absent (Angular asset copy regression)
//
// How: re-runs the same generator logic in memory and compares byte-by-byte
// with the file shipped in dist/. If they differ, we tell the user exactly
// which URLs / fields don't match. Exit 1 fails the build.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  REPO_ROOT, ROUTES, SRC_PAGES,
  buildSitemapEntries, buildSitemapXml,
} from './generate-sitemap.mjs';

const DIST_FILE = resolve(REPO_ROOT, 'dist/WuicSite/browser/sitemap.xml');

let exitCode = 0;
function fail(msg) {
  console.error(`  [FAIL] ${msg}`);
  exitCode = 1;
}
function ok(msg) {
  console.log(`  [ok]   ${msg}`);
}

console.log(`[sitemap-check] verifying ${DIST_FILE}`);

// ── 1. File exists in dist/ ─────────────────────────────────────────
if (!existsSync(DIST_FILE)) {
  fail(`sitemap.xml NOT shipped in dist/. ng build did not copy public/sitemap.xml — check angular.json assets config.`);
  process.exit(exitCode);
}
ok('sitemap.xml exists in dist/');

// ── 2. Content matches what generator would produce NOW ──────────
const expectedEntries = buildSitemapEntries();
const expectedXml = buildSitemapXml(expectedEntries);
const actualXml = readFileSync(DIST_FILE, 'utf8');

if (actualXml === expectedXml) {
  ok(`content matches generator output (${expectedEntries.length} URLs)`);
} else {
  fail('shipped sitemap.xml DIFFERS from what generate-sitemap.mjs would produce now');
  console.error('');
  console.error('  Cause hypotheses (most likely first):');
  console.error('   1. prebuild step was skipped — did you run `ng build` directly');
  console.error('      instead of `npm run build`? Always go through npm so the');
  console.error('      prebuild hook fires.');
  console.error('   2. someone hand-edited public/sitemap.xml after prebuild ran.');
  console.error('   3. a source file changed between prebuild and now (race).');
  console.error('');
  console.error('  Fix: run `npm run sitemap` then `npm run build` again.');
  console.error('');

  // Try to surface a meaningful diff: per-URL field comparison
  const reEntry = /<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>\s*<changefreq>([^<]+)<\/changefreq>\s*<priority>([^<]+)<\/priority>\s*<\/url>/g;
  const parse = (xml) => {
    const map = new Map();
    let m; while ((m = reEntry.exec(xml)) !== null) {
      map.set(m[1], { lastmod: m[2], changefreq: m[3], priority: m[4] });
    }
    return map;
  };
  const exp = parse(expectedXml);
  const act = parse(actualXml);

  const allLocs = new Set([...exp.keys(), ...act.keys()]);
  for (const loc of allLocs) {
    const e = exp.get(loc);
    const a = act.get(loc);
    if (!e) { console.error(`   - extra in dist: ${loc}`); continue; }
    if (!a) { console.error(`   - missing in dist: ${loc} (expected lastmod=${e.lastmod})`); continue; }
    const diffs = [];
    if (e.lastmod    !== a.lastmod)    diffs.push(`lastmod expected=${e.lastmod} got=${a.lastmod}`);
    if (e.changefreq !== a.changefreq) diffs.push(`changefreq expected=${e.changefreq} got=${a.changefreq}`);
    if (e.priority   !== a.priority)   diffs.push(`priority expected=${e.priority} got=${a.priority}`);
    if (diffs.length) console.error(`   - ${loc}: ${diffs.join(', ')}`);
  }
  process.exit(exitCode);
}

// ── 3. No URL has lastmod in the future (sanity for clock skew) ───
const todayIso = new Date().toISOString().slice(0, 10);
const future = expectedEntries.filter(e => e.lastmod > todayIso);
if (future.length) {
  fail(`URLs have lastmod in the future (clock skew? wrong file mtime?): ${
    future.map(e => `${e.loc}=${e.lastmod}`).join(', ')
  }`);
} else {
  ok('no future lastmod dates');
}

// ── 4. All ROUTES have a corresponding page folder on disk ────────
const missingFolders = ROUTES.filter(r => {
  const folder = resolve(SRC_PAGES, r.dir);
  return !existsSync(folder);
});
if (missingFolders.length) {
  fail(`ROUTES reference missing page folders (lastmod fell back to today): ${
    missingFolders.map(r => `${r.path} -> src/app/pages/${r.dir}`).join(', ')
  }`);
} else {
  ok(`all ${ROUTES.length} routes have an existing page folder`);
}

// ── 5. URLs cover every Angular route in app.routes.ts ───────────
// Cross-check: parse app.routes.ts for every `path: '...'` entry and warn
// if a public route exists in code but is missing from ROUTES (the script's
// curated list). Catches: someone added a new page but forgot to register
// it in generate-sitemap.mjs ROUTES.
try {
  const routesSrc = readFileSync(resolve(REPO_ROOT, 'src/app/app.routes.ts'), 'utf8');
  const angularPaths = [];
  const reAng = /path:\s*['"`]([^'"`]*)['"`]/g;
  let m; while ((m = reAng.exec(routesSrc)) !== null) {
    const p = m[1];
    // Skip wildcard, parametric routes, and sub-paths (only top-level public pages in sitemap)
    if (p === '**' || p.includes(':') || p.includes('/')) continue;
    angularPaths.push('/' + p);
  }
  const sitemapPaths = new Set(ROUTES.map(r => r.path));
  const missingFromSitemap = angularPaths.filter(p => !sitemapPaths.has(p));
  if (missingFromSitemap.length) {
    // Warn (not fail) — author may intentionally exclude an internal route
    console.warn(`  [warn] Angular routes NOT in sitemap (add to ROUTES if public): ${missingFromSitemap.join(', ')}`);
  } else {
    ok('every top-level Angular route is present in sitemap');
  }
} catch (e) {
  console.warn(`  [warn] could not cross-check app.routes.ts: ${e.message}`);
}

if (exitCode === 0) {
  console.log(`[sitemap-check] all checks passed`);
}
process.exit(exitCode);
