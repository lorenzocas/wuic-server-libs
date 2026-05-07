/**
 * Patch dei chart archetype delle 4 dashboard analytics:
 * - aggiunge `maxBarThickness: 24` a tutti i dataset bar
 * - aggiunge `cutOffCount: 10` (top 10) per rendere il chart deterministico
 *   indipendentemente dal numero di righe ritornate dalla vista
 * - per chart line (cashflow giornaliero) NON aggiunge maxBarThickness ma
 *   imposta `pointRadius: 2` + `borderWidth: 2` per look stabile
 *
 * Idempotente: se mdpropsbag già ha cutOffCount/maxBarThickness, li sovrascrive.
 *
 * Vedi skills/dashboard-replicate-custom-ui/SKILL.md sezione "Determinismo chart".
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

const META_DB = 'FatturazioneElettronica_Metadata';
const META_CONN = `Server=localhost\\sqlexpress;Database=${META_DB};Integrated Security=False;User ID=sa;Password=superlamelauser;TrustServerCertificate=True`;

function fetchPropsBag(route) {
  const ps = `
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open(); $cmd = $cn.CreateCommand()
$cmd.CommandText = "SELECT mdpropsbag FROM dbo._metadati__tabelle WHERE mdroutename='${route}'"
$o = $cmd.ExecuteScalar()
$cn.Close()
if ($o -is [DBNull] -or -not $o) { '' } else { $o }
`;
  return execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }).trim();
}

function writePropsBag(route, json) {
  const dir = mkdtempSync(join(tmpdir(), 'patch-pb-'));
  const file = join(dir, 'pb.json');
  writeFileSync(file, json, { encoding: 'utf8' });
  const ps = `
$json = [System.IO.File]::ReadAllText('${file.replace(/\\/g, '\\\\')}', [System.Text.UTF8Encoding]::new($false))
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open(); $cmd = $cn.CreateCommand()
$cmd.CommandText = "UPDATE dbo._metadati__tabelle SET mdpropsbag=@p WHERE mdroutename='${route}'"
$p = $cmd.Parameters.Add('@p', [System.Data.SqlDbType]::NVarChar, -1); $p.Value = $json
$rc = $cmd.ExecuteNonQuery()
$cn.Close()
Write-Host "rows: $rc"
`;
  execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', stdio: 'inherit' });
}

const ROUTES_TO_PATCH = [
  // route → { type: 'bar'|'line'|'pie', cutOffCount?, maxBarThickness? }
  { route: 'vw_aging_crediti_clienti',  type: 'bar',  cutOffCount: 10, maxBarThickness: 24 },
  { route: 'vw_aging_debiti_fornitori', type: 'bar',  cutOffCount: 10, maxBarThickness: 24 },
  { route: 'vw_top_clienti_anno',       type: 'bar',  cutOffCount: 10, maxBarThickness: 24 },
  { route: 'vw_cashflow_giornaliero',   type: 'line', cutOffCount: 30 } // 30 giorni rolling
];

for (const cfg of ROUTES_TO_PATCH) {
  console.log(`\n=== ${cfg.route} (${cfg.type}) ===`);
  const raw = fetchPropsBag(cfg.route);
  if (!raw) {
    console.warn(`  ! mdpropsbag vuoto, skip`);
    continue;
  }
  let pb;
  try { pb = JSON.parse(raw); } catch (e) { console.warn(`  ! parse error: ${e.message}`); continue; }

  pb.archetypes = pb.archetypes || {};
  pb.archetypes.chart = pb.archetypes.chart || {};
  pb.archetypes.chart.dataOptions = pb.archetypes.chart.dataOptions || {};

  // Top N deterministico
  if (cfg.cutOffCount) {
    pb.archetypes.chart.dataOptions.cutOffCount = cfg.cutOffCount;
  }

  // Per chart bar: maxBarThickness su ogni dataset
  if (cfg.type === 'bar' && Array.isArray(pb.archetypes.chart.dataOptions.datasets)) {
    pb.archetypes.chart.dataOptions.datasets.forEach(ds => {
      ds.maxBarThickness = cfg.maxBarThickness;
    });
  }

  // Per chart line: pointRadius/borderWidth deterministici
  if (cfg.type === 'line' && Array.isArray(pb.archetypes.chart.dataOptions.datasets)) {
    pb.archetypes.chart.dataOptions.datasets.forEach(ds => {
      ds.pointRadius = 2;
      ds.borderWidth = 2;
      ds.tension = 0.25;
    });
  }

  const newJson = JSON.stringify(pb);
  console.log(`  patched: cutOffCount=${pb.archetypes.chart.dataOptions.cutOffCount}, datasets=${pb.archetypes.chart.dataOptions.datasets?.length || 0}`);
  writePropsBag(cfg.route, newJson);
}

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
await api.invalidateMetadataRuntime();
await api.dispose();
console.log('\n✓ Chart determinism patch applicata. Reload metadata runtime done.');
