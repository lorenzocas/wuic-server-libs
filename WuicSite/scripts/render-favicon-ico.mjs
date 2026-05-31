#!/usr/bin/env node
/**
 * render-favicon-ico.mjs
 *
 * Genera public/favicon.ico (multi-resolution) partendo dai PNG W faceted
 * gia' renderizzati da render-brand-icons.mjs. Usa png-to-ico che impacca
 * 16x16 + 32x32 + 48x48 in un singolo container .ico (formato che Windows
 * Explorer + IE/Edge legacy preferiscono).
 *
 * Perche' anche il .ico se ho gia' il SVG primario nell'index.html:
 *   - alcuni crawler / bot cercano sempre /favicon.ico a prescindere
 *     dal link rel (es. archive.org, certi search-engine indexer);
 *   - Windows Explorer mostra l'.ico come icona quando un .url shortcut
 *     punta al sito, indipendentemente da quello che dice l'HTML.
 *
 * Uso:
 *   node scripts/render-favicon-ico.mjs
 *
 * Idempotente: sovrascrive public/favicon.ico ogni volta.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PNG_DIR = path.join(REPO_ROOT, 'public', 'assets', 'brand', 'png');
const OUT_PATH = path.join(REPO_ROOT, 'public', 'favicon.ico');

async function main() {
  const sizes = [16, 32, 48];
  const pngPaths = sizes.map((s) => path.join(PNG_DIR, `wuic-icon-w-faceted-${s}.png`));
  for (const p of pngPaths) {
    try { await fs.access(p); }
    catch { throw new Error(`PNG mancante: ${p}\nLancia prima: node scripts/render-brand-icons.mjs`); }
  }

  const buf = await pngToIco(pngPaths);
  await fs.writeFile(OUT_PATH, buf);

  const stat = await fs.stat(OUT_PATH);
  console.log(`[favicon] wrote ${path.relative(REPO_ROOT, OUT_PATH).replace(/\\/g, '/')}  ${(stat.size / 1024).toFixed(1)} KB  (${sizes.join(' + ')} px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
