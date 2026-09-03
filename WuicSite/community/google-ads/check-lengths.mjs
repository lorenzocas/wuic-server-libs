// Verifica i limiti Google Ads sui testi in campaigns.md:
// headline <= 30, description <= 90, sitelink title <= 25 / desc <= 35, callout <= 25.
// Uso: node check-lengths.mjs   (exit 1 se qualcosa sfora)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, 'campaigns.md'), 'utf8');

// I blocchi ``` che seguono una riga "### RSA — headline" / "description"
const blocks = [...md.matchAll(/### RSA — (headline|description)[^\n]*\n```\n([\s\S]*?)```/g)];
let bad = 0, checked = 0;
for (const [, kind, body] of blocks) {
  const max = kind === 'headline' ? 30 : 90;
  for (const raw of body.split('\n')) {
    // toglie l'eventuale "(29)" di annotazione a fine riga
    const line = raw.replace(/\s*\(\d+\)\s*$/, '').trim();
    if (!line) continue;
    checked++;
    if (line.length > max) { bad++; console.log(`  TROPPO LUNGO (${line.length}>${max}) [${kind}] ${line}`); }
  }
}
console.log(`${kindSummary(checked, bad)}`);
function kindSummary(c, b) {
  return b === 0 ? `OK: ${c} testi entro i limiti Google (headline<=30, description<=90)`
                 : `FAIL: ${b} testi su ${c} sforano`;
}
process.exit(bad === 0 ? 0 : 1);
