#!/usr/bin/env node
/**
 * render-brand-icons.mjs
 *
 * Rasterizza i SVG sotto public/assets/brand/ in PNG a piu' size. Usato
 * per produrre i file PNG che servono dove SVG non e' supportato:
 *   - favicon.ico legacy (PNG @ 16, 32, 48, 64 → poi assemblati in .ico)
 *   - Apple touch icon 180×180
 *   - Android maskable 192/512
 *   - dev.to cover image 1000×420 (raster preferito da dev.to per og)
 *   - Slack / Discord profile picture
 *
 * Default: rende solo wuic-icon-w-faceted.svg (variant F, scelta come
 * brand-mark canonico). Passa altri file via CLI per renderne altri.
 *
 * Uso:
 *   node scripts/render-brand-icons.mjs
 *   node scripts/render-brand-icons.mjs wuic-icon-w-tipo.svg
 *
 * Output: in public/assets/brand/png/<basename>-<size>.png.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const BRAND_DIR = path.join(REPO_ROOT, 'public', 'assets', 'brand');
const OUT_DIR = path.join(BRAND_DIR, 'png');

// Dimensioni canoniche da generare per ogni mark.
// Coprono tutto: favicon, PWA, Apple touch, social profile, cover hero.
const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];

async function renderOne(svgPath, basename) {
  const svg = await fs.readFile(svgPath);
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Caso speciale: og-image.svg ha aspect 1200×630 (1.91:1 OpenGraph canon),
  // non un mark quadrato. Per quello renderiamo UN SOLO PNG alla dimensione
  // intera senza centrare/contenere in un quadrato. Output va direttamente
  // in public/assets/og-image.png (non in /png/) cosi' index.html lo trova
  // al path canonico documentato negli og:image meta tag.
  if (basename === 'og-image') {
    const outPath = path.join(path.dirname(svgPath), 'og-image.png');
    await sharp(svg, { density: 192 })
      .resize(1200, 630, { fit: 'contain', background: { r: 11, g: 19, b: 43, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    const stat = await fs.stat(outPath);
    console.log(`  ${path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')}  1200×630  ${(stat.size / 1024).toFixed(1)} KB`);
    return;
  }

  for (const size of SIZES) {
    const outPath = path.join(OUT_DIR, `${basename}-${size}.png`);
    await sharp(svg, { density: 384 })  // densita' alta cosi' i gradient non sgranano
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    const stat = await fs.stat(outPath);
    console.log(`  ${path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')}  ${size}×${size}  ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = argv.length > 0
    ? argv
    : ['wuic-icon-w-faceted.svg'];  // default canonico: variant F

  for (const t of targets) {
    const svgPath = path.isAbsolute(t) ? t : path.join(BRAND_DIR, t);
    const basename = path.basename(t, '.svg');
    console.log(`[render] ${t}`);
    await renderOne(svgPath, basename);
  }

  console.log(`[render] done. PNGs under ${path.relative(REPO_ROOT, OUT_DIR).replace(/\\/g, '/')}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
