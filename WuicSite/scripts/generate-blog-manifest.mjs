// generate-blog-manifest.mjs
//
// Build-time generator for `public/blog-manifest.json`. Walks every
// `src/assets/blog/*.md` file, parses a minimal YAML-style frontmatter
// block, and emits a JSON index the BlogList component fetches at runtime.
//
// Each .md file is expected to start with:
//
//   ---
//   title: "Why we built a metadata-driven Angular framework"
//   slug: why-metadata-driven
//   date: 2026-05-01
//   author: Lorenzo Castrico
//   description: "Honest origin story…"
//   tags: angular, metadata, rag
//   ---
//
//   # Heading
//   …
//
// Runs as `prebuild` (alongside generate-sitemap.mjs) so the manifest
// always reflects the markdown files currently in the tree. The blog
// content itself ships as plain `.md` in the dist (assets glob copies
// them) — the BlogPost component fetches and renders them client-side
// with `marked`. We do NOT inline article bodies into the manifest:
// keeping them separate lets us code-split (only fetch the article
// text on /blog/:slug, not on the index page).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const BLOG_DIR = resolve(REPO_ROOT, 'src/assets/blog');
const OUT_FILE = resolve(REPO_ROOT, 'public/blog-manifest.json');

/**
 * Parse the frontmatter block at the top of a markdown file. Tolerates
 * missing frontmatter (returns empty object) so a half-finished article
 * doesn't break the build.
 */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // Strip wrapping quotes if present.
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[m[1]] = value;
  }
  return meta;
}

function listMarkdownFiles(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return []; }
  return entries
    .filter(e => e.endsWith('.md'))
    .map(e => join(dir, e))
    .filter(p => statSync(p).isFile());
}

function deriveSlugFromFilename(filePath) {
  return basename(filePath).replace(/\.md$/, '');
}

const files = listMarkdownFiles(BLOG_DIR);
const posts = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const meta = parseFrontmatter(raw);
  const slug = (meta.slug || deriveSlugFromFilename(file)).trim();
  if (!slug) continue;

  // Estimate reading time at 200 wpm — common heuristic, accurate
  // enough for a "5 min read" badge without pulling in a NLP lib.
  const body = raw.replace(/^---[\s\S]*?---/, '').trim();
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  posts.push({
    slug,
    title: meta.title || slug,
    date: meta.date || new Date().toISOString().slice(0, 10),
    author: meta.author || 'WUIC Framework',
    description: meta.description || '',
    tags: (meta.tags || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
    readingMinutes,
    /** Path the BlogPost component fetches at runtime. Public-relative. */
    sourcePath: `assets/blog/${basename(file)}`,
  });
}

// Newest-first sort by date — same UX as a typical engineering blog.
posts.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

const out = {
  generatedAt: new Date().toISOString(),
  count: posts.length,
  posts,
};

writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
console.log(`[blog-manifest] wrote ${OUT_FILE} (${posts.length} posts)`);
