// Diff REALE campo-per-campo: per ogni system route, dump SELECT * cross-DB
// e confronta TUTTE le properties cella-per-cella (no shortlist arbitraria).
import { execSync } from 'child_process';
import fs from 'fs';

const SYSTEM_ROUTES = [
  ' metadati  tabelle',
  ' metadati  colonne',
  ' metadati  menu',
  ' metadati  wizard',
  ' metadati  wizard  tabelle',
  ' metadati  tabelle_cloned',
  ' metadati  colonne_cloned',
  '__metadati_stili_colonna',
  '__metadati_stili_tabella',
  '_metadati_condition_action_group',
  '_metadati_condition_action_item',
  '_metadati_condition_group',
  '_metadati_condition_item',
];

// Properties da NON confrontare (variano legitimamente per-DB):
const SKIP_PROPS = new Set([
  'mc_id',          // surrogate PK, varia per-DB
  'md_id',          // FK to _metadati__tabelle.md_id, varia per-DB
  'extraProps',     // runtime-only
  '_Metadati_Tabelle', // navigation property
  'ProjectMetadataVersion',
  'skipColumns',
  'skipAuthsAndStyles',
]);

function dumpRoute(db, route) {
  const sql = `SET NOCOUNT ON;
SELECT c.* FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id=c.md_id
WHERE t.mdroutename = N'${route.replace(/'/g, "''")}'
ORDER BY c.mc_nome_colonna
FOR JSON PATH, INCLUDE_NULL_VALUES;`;

  // Use sqlcmd, capture output via stdout. We pipe to a file for reliability.
  const tmp = `_tmp_dump_${Math.random().toString(36).slice(2)}.json`;
  try {
    execSync(`sqlcmd -S "localhost\\sqlexpress" -U sa -P superlamelauser -C -d ${db} -y 0 -Q "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}" -o "${tmp}"`, { stdio: 'pipe' });
    let raw = fs.readFileSync(tmp, 'utf8').replace(/^﻿/, '').trim();
    fs.unlinkSync(tmp);
    if (!raw) return [];
    // sqlcmd può prefissare con header tipo "JSON_xxx" o whitespace
    raw = raw.replace(/^\s*JSON_F\S+[\r\n\s]+/, '').trim();
    if (!raw.startsWith('[') && !raw.startsWith('{')) {
      // multi-row JSON_F output: cercare prima [
      const idx = raw.indexOf('[');
      if (idx >= 0) raw = raw.slice(idx);
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error(`  ERR dumping ${db} / ${route}: ${e.message?.slice(0, 200)}`);
    return [];
  }
}

function indexByName(rows) {
  const m = new Map();
  for (const r of rows) m.set(r.mc_nome_colonna, r);
  return m;
}

const REPORT = [];
for (const route of SYSTEM_ROUTES) {
  const kiara = indexByName(dumpRoute('Kiara_wuic_new', route));
  const fe = indexByName(dumpRoute('FatturazioneElettronica_Metadata', route));
  if (kiara.size === 0 || fe.size === 0) continue;

  const allColNames = new Set([...kiara.keys(), ...fe.keys()]);
  for (const colName of allColNames) {
    const k = kiara.get(colName);
    const f = fe.get(colName);
    if (!k) { REPORT.push({ route, col: colName, prop: '__col_only_in_fe' }); continue; }
    if (!f) { REPORT.push({ route, col: colName, prop: '__col_only_in_kiara' }); continue; }

    const allProps = new Set([...Object.keys(k), ...Object.keys(f)]);
    for (const p of allProps) {
      if (SKIP_PROPS.has(p)) continue;
      const vk = k[p];
      const vf = f[p];
      // Normalize null/undefined/empty as same
      const normK = (vk === null || vk === undefined || vk === '') ? null : vk;
      const normF = (vf === null || vf === undefined || vf === '') ? null : vf;
      if (JSON.stringify(normK) !== JSON.stringify(normF)) {
        REPORT.push({ route, col: colName, prop: p, kiara: normK, fe: normF });
      }
    }
  }
}

console.log(`Total diffs: ${REPORT.length}`);
// Group by property for visibility
const byProp = {};
for (const r of REPORT) byProp[r.prop] = (byProp[r.prop] || 0) + 1;
console.log('\nDiffs by property:');
Object.entries(byProp).sort((a,b)=>b[1]-a[1]).forEach(([p,n])=>console.log(`  ${n.toString().padStart(4)}  ${p}`));

// Save full report
fs.writeFileSync('C:/src/Wuic/FlottaMezzi/scripts/_real_diff_full.json', JSON.stringify(REPORT, null, 2));
console.log(`\nFull report: C:/src/Wuic/FlottaMezzi/scripts/_real_diff_full.json`);
