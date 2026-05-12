// Refetch metaInfo via getTableMetadata for routes that changed,
// then patch the boardcontent DATASOURCE.inputs.metaInfo accordingly,
// then resave the boardcontent in the DB.
import fs from 'fs';
import { execSync } from 'child_process';
import { chromium } from 'playwright';

const BACKEND = 'http://localhost:5100';
const FRONTEND = 'http://localhost:4200';

// For each dashboard, map of OLD route -> NEW route (what we changed).
// We refetch metaInfo for each NEW route and assign to all DATASOURCE that already use it.
const ROUTE_REMAP = {
  aging_scadenze: { 'vw_aging_scadenze': 'vw_aging_scadenze_per_fascia' }, // chart DS only
  costi_forecast: { 'vw_costi_forecast': 'vw_costi_storici_mensili' }, // KPI DS x4
  top_mezzi: { 'vw_top_mezzi_per_km': 'vw_top_mezzi_per_costo' }, // KPI DS x4
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Login via UI helper (uses admin_test/Test123!)
const { loginAndNavigate } = await import('file:///C:/src/Wuic/FlottaMezzi/playwright/_shared/ui-helpers.mjs');
await loginAndNavigate(page, FRONTEND, { user: 'admin_test', password: 'Test123!' });

// Helper: call getTableMetadata for a route, return metaInfo {tableMetadata, columnMetadata, operators:{}}
async function fetchMetaInfo(route) {
  const resp = await page.request.post(`${BACKEND}/api/Meta/AsmxProxy/MetaService.getTableMetadata`, {
    data: { route, lookup_table_id: 0, user_id: '', dm: 1 },
    headers: { 'Content-Type': 'application/json' }
  });
  if (!resp.ok()) throw new Error(`getTableMetadata(${route}) failed: ${resp.status()}`);
  const body = await resp.json();
  // tableMetadata is nested in columnMetadata[0]._Metadati_Tabelle (per AGENTS rule mdpropsbag → md_props_bag mapping)
  const cols = body?.columnMetadata || [];
  if (!cols.length) throw new Error(`No columnMetadata for ${route}`);
  const tm = cols[0]._Metadati_Tabelle;
  const cleanedCols = cols.map(c => {
    const { extraProps, _Metadati_Tabelle, ...rest } = c;
    return rest;
  });
  // Build tableMetadata object from _Metadati_Tabelle (strip extraProps)
  const { extraProps, ...tmClean } = tm;
  return { tableMetadata: tmClean, columnMetadata: cleanedCols, operators: {} };
}

// Walk boardcontent and replace metaInfo on DATASOURCE nodes whose inputs.route matches `route`
function applyMetaInfo(arr, route, metaInfo) {
  let count = 0;
  function walk(n) {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n && typeof n === 'object') {
      if (typeof n.tag === 'string' && n.tag.includes('wuic-data-source') && n.inputs?.route === route) {
        n.inputs.metaInfo = metaInfo;
        count++;
      }
      for (const k of Object.keys(n)) walk(n[k]);
    }
  }
  walk(arr);
  return count;
}

for (const [dashRoute, remap] of Object.entries(ROUTE_REMAP)) {
  const file = `C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_${dashRoute}_patched.json`;
  const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const newRoute of Object.values(remap)) {
    const mi = await fetchMetaInfo(newRoute);
    const n = applyMetaInfo(arr, newRoute, mi);
    console.log(`  ${dashRoute}: refreshed metaInfo for "${newRoute}" on ${n} datasource(s); columns=${mi.columnMetadata.length}`);
  }
  const json = JSON.stringify(arr);
  const out = `C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_${dashRoute}_patched2.json`;
  fs.writeFileSync(out, json);
  // Apply to DB via PowerShell SqlClient
  const ps1 = `
$ErrorActionPreference='Stop'
$json = [System.IO.File]::ReadAllText('${out}')
Add-Type -AssemblyName System.Data
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = 'UPDATE dom_board SET boardcontent = @j WHERE boardroute = @r'
[void]$cmd.Parameters.AddWithValue('@j', $json)
[void]$cmd.Parameters.AddWithValue('@r', '${dashRoute}')
$rows = $cmd.ExecuteNonQuery()
$conn.Close()
Write-Host "rows: $rows"
`;
  const ps1file = `C:/src/Wuic/FlottaMezzi/scripts/_apply2_${dashRoute}.ps1`;
  fs.writeFileSync(ps1file, ps1);
  const result = execSync(`pwsh -ExecutionPolicy Bypass -File "${ps1file}"`, { encoding: 'utf8' });
  console.log(`  ${dashRoute} resaved -> ${result.trim()}`);
}

// Server-side invalidate
const inv = await page.request.post(`${BACKEND}/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime`, {
  data: {}, headers: { 'Content-Type': 'application/json' }
});
console.log('invalidate:', inv.status(), (await inv.text()).slice(0, 200));

await browser.close();
console.log('done');
