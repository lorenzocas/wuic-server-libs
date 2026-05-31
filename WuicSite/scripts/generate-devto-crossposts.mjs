#!/usr/bin/env node
/**
 * generate-devto-crossposts.mjs
 *
 * Transforma ogni articolo in src/assets/blog/*.md nella sua versione
 * "dev.to-ready" sotto cross-posts/devto/. Il file dev.to:
 *   - Sostituisce il frontmatter del sito (title/slug/date/author/description/tags)
 *     con il frontmatter dev.to (title/published:false/description/tags/canonical_url).
 *   - Sanitizza i tag: dev.to accetta max 4, solo lowercase alphanumeric, max 25 char.
 *     Tag con trattini/spazi/special chars vengono normalizzati o droppati con warn.
 *   - Imposta canonical_url su https://wuic-framework.com/blog/<slug> in modo che
 *     Google attribuisca tutto il link juice al sito (no penalty SEO dal duplicato).
 *   - Riscrive i link interni assoluti: `/blog/foo` → `https://wuic-framework.com/blog/foo`,
 *     `/sandbox` → `https://wuic-framework.com/sandbox`, ecc. Senza questo i lettori
 *     dev.to vedrebbero 404 cliccando i link relativi.
 *   - Lascia tutto il body markdown invariato (immagini sono già su path assoluti
 *     /assets/... del sito; dev.to li risolve come immagini esterne).
 *
 * Output: un file .md per articolo + un file MANIFEST.md con la lista (slug,
 * canonical_url, dev.to tags sanitizzati) da spuntare manualmente man mano che
 * pubblichi.
 *
 * Uso:
 *   node scripts/generate-devto-crossposts.mjs
 *
 * dev.to publishing workflow (manuale, 5 min/articolo):
 *   1. Apri https://dev.to/new
 *   2. Click sull'ingranaggio in alto a destra "Edit frontmatter" → ottieni
 *      l'editor markdown raw con frontmatter visibile.
 *   3. Copia il contenuto INTERO del file devto/<slug>.md (incluso frontmatter
 *      ---).
 *   4. Verifica i tag (dev.to mostra autocomplete: scegli il più rilevante se
 *      il tuo non è ancora popolare).
 *   5. Premi "Publish" (oppure "Save draft" se vuoi schedulare). canonical_url
 *      garantisce che Google non ti penalizzi per duplicato.
 *   6. Spunta la riga nel MANIFEST.md.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(REPO_ROOT, 'src', 'assets', 'blog');
const OUTPUT_DIR = path.join(REPO_ROOT, 'cross-posts', 'devto');
const SITE_ORIGIN = 'https://wuic-framework.com';

// ----------------------------------------------------------------------------
// Frontmatter parsing
// ----------------------------------------------------------------------------
function parseFrontmatter(raw) {
  // Match the first --- ... --- block at the top of the file.
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const block = m[1];
  const body = m[2];
  const meta = {};
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body };
}

// ----------------------------------------------------------------------------
// Tag sanitization
// dev.to vincoli:
//   - max 4 tag
//   - solo lowercase alphanumeric (niente -, _, spazi)
//   - max 25 char per tag
//   - autocomplete suggerisce tag esistenti; preferire quelli per discoverability
// ----------------------------------------------------------------------------
const TAG_REMAP = {
  // canonicalizza alcuni nostri tag verso tag dev.to popolari
  'metadata-driven': 'lowcode',
  'low-code': 'lowcode',
  'sql-server': 'sqlserver',
  'no-code': 'nocode',
  'self-hosted': 'selfhosted',
  'free-apps': 'opensource',
  'sales-pipeline': 'sales',
  'sdi': 'compliance',
  'einvoicing': 'fintech',
  'fatturapa': 'fintech',
  'fleet-management': 'iot',
  'route-optimization': 'iot',
  'metadata': 'lowcode',
  'drag-and-drop': 'designer',
  'primeng': 'angular',
  'mrt': 'reports',
  'stimulsoft': 'reports',
  'workflow-designer': 'workflow',
  'list-grid': 'angular',
  'edit-form': 'angular',
  'css': 'webdev',
  'crud': 'database',
  'scaffolding': 'database',
  'bge-m3': 'ai',
  'claude': 'ai',
  'rag': 'ai',
  'retrieval-augmented-generation': 'ai',
  'rag-chatbot': 'ai',
  'dotnet': 'dotnet',
  '.net 10': 'dotnet',
  'asp.net-core': 'dotnet',
  'angular21': 'angular',
  'kestrel': 'dotnet',
  'systemd': 'linux',
  'ubuntu': 'linux',
  'nginx': 'webdev',
  'postgresql': 'postgres',
  'oracle': 'database',
  'mysql': 'mysql',
  'mssql': 'database',
  'dbms': 'database',
  'jamstack': 'webdev',
  'cms': 'webdev',
};

function sanitizeTag(raw) {
  let t = raw.trim().toLowerCase();
  if (TAG_REMAP[t] !== undefined) t = TAG_REMAP[t];
  // strip non-alphanumeric
  t = t.replace(/[^a-z0-9]/g, '');
  // truncate
  if (t.length > 25) t = t.slice(0, 25);
  if (!t) return null;
  return t;
}

function sanitizeTags(rawTagsStr) {
  if (!rawTagsStr) return [];
  // tags possono essere comma-separated o yaml-list inline
  const parts = rawTagsStr
    .replace(/^\[|\]$/g, '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  const dropped = [];
  for (const p of parts) {
    const t = sanitizeTag(p);
    if (!t) {
      dropped.push(p);
      continue;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 4) break;
  }
  return { kept: out, dropped };
}

// ----------------------------------------------------------------------------
// Body link absolutization
// ----------------------------------------------------------------------------
function absolutizeLinks(body) {
  // Markdown links + reference style images. Match `](/path...)` con un primo
  // slash assoluto, ma non `](//cdn...)` o `](http...)`.
  // Casi tipici nel nostro corpus:
  //   [previous post](/blog/sql-table...)
  //   [public demo](/sandbox)
  //   [downloads page](/downloads)
  //   [`install.sh`](/install.sh)
  //   [posts](/blog)
  return body.replace(/\]\((\/[^\s)]*)\)/g, (_m, p) => `](${SITE_ORIGIN}${p})`);
}

// ----------------------------------------------------------------------------
// dev.to frontmatter assembly
// ----------------------------------------------------------------------------
function buildDevtoFrontmatter({ title, description, tags, canonical }) {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    'published: false',
    `description: ${JSON.stringify(description)}`,
    `tags: ${tags.join(', ')}`,
    `canonical_url: ${canonical}`,
    '---',
    '',
  ].join('\n');
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Preserva lo stato di pubblicazione (✅ vs ☐) tra rigenerazioni.
  // Senza questo, ogni rilancio dello script azzera tutte le righe a ☐
  // anche quelle gia' pubblicate, e ci tocca andare a rimettere il flag
  // a mano. Strategia: leggi il MANIFEST.md preesistente, estrai i slug
  // gia' marcati ✅ in un Set, e ri-applicalo quando ricostruisci la
  // table sotto.
  const existingManifestPath = path.join(OUTPUT_DIR, 'MANIFEST.md');
  const publishedSlugs = new Set();
  try {
    const prev = await fs.readFile(existingManifestPath, 'utf8');
    // Match righe table tipo: | ✅ | [Title](https://wuic-framework.com/blog/<slug>) | ...
    const re = /^\|\s*✅\s*\|\s*\[[^\]]*\]\(https:\/\/wuic-framework\.com\/blog\/([^)\s]+)\)/gm;
    let m;
    while ((m = re.exec(prev)) !== null) publishedSlugs.add(m[1]);
    if (publishedSlugs.size > 0) {
      console.log(`[devto-crosspost] preserving ✅ for ${publishedSlugs.size} already-published slug(s): ${[...publishedSlugs].join(', ')}`);
    }
  } catch {
    // Primo run: nessun MANIFEST.md preesistente. Niente da preservare.
  }

  const files = (await fs.readdir(SOURCE_DIR))
    .filter((f) => f.endsWith('.md'))
    .sort();

  const manifestRows = [];

  for (const file of files) {
    const raw = await fs.readFile(path.join(SOURCE_DIR, file), 'utf8');
    const { meta, body } = parseFrontmatter(raw);

    const slug = meta.slug || file.replace(/\.md$/, '');
    const canonical = `${SITE_ORIGIN}/blog/${slug}`;
    const { kept: tags, dropped } = sanitizeTags(meta.tags);

    const fm = buildDevtoFrontmatter({
      title: meta.title || slug,
      description: meta.description || '',
      tags,
      canonical,
    });
    const absBody = absolutizeLinks(body);
    const devtoMd = fm + absBody;

    const outFile = path.join(OUTPUT_DIR, file);
    await fs.writeFile(outFile, devtoMd, 'utf8');

    manifestRows.push({
      slug,
      title: meta.title,
      canonical,
      tags,
      dropped,
      published: publishedSlugs.has(slug),
      outFile: path.relative(REPO_ROOT, outFile).replace(/\\/g, '/'),
    });
  }

  // MANIFEST.md
  const lines = [
    '# dev.to cross-post manifest',
    '',
    `Generated by \`scripts/generate-devto-crossposts.mjs\`. Each row below`,
    `corresponds to one article ready to be pasted into https://dev.to/new.`,
    '',
    `**Publishing workflow** (5 min/article):`,
    '',
    '1. Open https://dev.to/new and click the gear icon → "Edit frontmatter".',
    '2. Copy the entire content of the file under "Source" into the editor.',
    '3. Verify the suggested tags (dev.to autocomplete prefers existing tags).',
    '4. Click "Save draft" first, preview it, then "Publish".',
    '5. Check the row below.',
    '',
    `**Why \`canonical_url\` matters**: it tells Google that wuic-framework.com is`,
    `the authoritative copy, so the dev.to mirror does not split SEO juice or`,
    `trigger a duplicate-content penalty. Without this, the dev.to URL can`,
    `outrank our own canonical post on long-tail queries.`,
    '',
    '| ☐ | Article | dev.to tags | Source |',
    '|---|---|---|---|',
  ];
  for (const r of manifestRows) {
    // Display the human-friendly article title (linked to the canonical URL on
    // the public site) rather than the slug-with-dashes. The slug is still
    // visible as the URL the link points to, and it's the basename of the
    // source file referenced in the rightmost column — so the operator can
    // grep / open by slug if needed, but doesn't have to read it raw.
    const titleDisplay = (r.title || r.slug).replace(/\|/g, '\\|');
    const file = r.outFile.split('/').pop();
    const status = r.published ? '✅' : '☐';
    lines.push(
      `| ${status} | [${titleDisplay}](${r.canonical}) | \`${r.tags.join(', ')}\` | [${file}](${file}) |`,
    );
  }

  const droppedReport = manifestRows.filter((r) => r.dropped.length > 0);
  if (droppedReport.length > 0) {
    lines.push('');
    lines.push('## Tags droppati / rimappati');
    lines.push('');
    lines.push(
      'Alcuni tag del frontmatter sorgente non rispettavano i vincoli dev.to (max 4, lowercase, solo alphanumeric, max 25 char). Lo script li ha rimappati via `TAG_REMAP` o droppati per arrivare a max 4. Verifica manualmente prima di pubblicare se uno specifico tag ti serve.',
    );
    lines.push('');
    for (const r of droppedReport) {
      lines.push(`- **${r.slug}**: dropped \`${r.dropped.join(', ')}\``);
    }
  }

  await fs.writeFile(path.join(OUTPUT_DIR, 'MANIFEST.md'), lines.join('\n'), 'utf8');

  console.log(`[devto-crosspost] wrote ${manifestRows.length} files + MANIFEST.md to ${path.relative(REPO_ROOT, OUTPUT_DIR)}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
