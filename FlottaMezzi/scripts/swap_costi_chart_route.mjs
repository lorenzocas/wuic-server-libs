import fs from 'fs';
import { execSync } from 'child_process';
import { request } from 'playwright';

// 1) Login + fetch metaInfo for new route from backend
const ctx = await request.newContext({ baseURL: 'http://localhost:5100' });
await ctx.post('/api/Meta/AsmxProxy/MetaService.login', {
  data: { user_name: 'admin_test', password: 'Test123!' },
  headers: { 'Content-Type': 'application/json' }
});

async function fetchMetaInfo(route) {
  const r = await ctx.post('/api/Meta/AsmxProxy/MetaService.getTableMetadata', {
    data: { route, lookup_table_id: 0, user_id: '', dm: 1 },
    headers: { 'Content-Type': 'application/json' }
  });
  const body = await r.json();
  const cols = body?.columnMetadata || [];
  if (!cols.length) throw new Error(`No columnMetadata for ${route}`);
  const tm = cols[0]._Metadati_Tabelle;
  const cleanedCols = cols.map(c => { const { extraProps, _Metadati_Tabelle, ...rest } = c; return rest; });
  const { extraProps, ...tmClean } = tm;
  return { tableMetadata: tmClean, columnMetadata: cleanedCols, operators: {} };
}

const newMeta = await fetchMetaInfo('vw_costi_per_mese');
console.log('vw_costi_per_mese metaInfo cols:', newMeta.columnMetadata.length);

// 2) Get current boardcontent of costi_forecast
const ps1Get = `
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT CAST(boardcontent AS NVARCHAR(MAX)) FROM dom_board WHERE boardroute='costi_forecast'"
$json = $cmd.ExecuteScalar()
$conn.Close()
[System.IO.File]::WriteAllText('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast_current.json', $json)
Write-Host "len=$($json.Length)"
`;
fs.writeFileSync('C:/src/Wuic/FlottaMezzi/scripts/_dump_costi.ps1', ps1Get);
console.log(execSync('pwsh -ExecutionPolicy Bypass -File C:/src/Wuic/FlottaMezzi/scripts/_dump_costi.ps1', { encoding: 'utf8' }).trim());

const arr = JSON.parse(fs.readFileSync('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast_current.json', 'utf8'));

// 3) Walk and swap chart datasource route + metaInfo
let swapped = 0;
function walk(n) {
  if (Array.isArray(n)) { n.forEach(walk); return; }
  if (n && typeof n === 'object') {
    if (typeof n.tag === 'string' && n.tag.includes('wuic-data-source') && n.inputs?.route === 'vw_costi_storici_mensili') {
      // Heuristic: chart tile DATASOURCE comes BEFORE the list grid one. We
      // distinguish them by the sibling DATAREPEATER.inputs.action: the
      // chart tile has its DS adjacent to a DATAREPEATER with action='chart'.
      // Easier: swap only the FIRST occurrence (chart was tile #2 in the table).
      // For safety, we check uniqueName affinity to chart-tile.
      // Actually we want to swap ONLY chart datasources, NOT list ones.
      // Skip — handled below via parent inspection.
    }
    for (const k of Object.keys(n)) walk(n[k]);
  }
}

// More robust: find the chart DATAREPEATER first, look at its sibling DATASOURCE,
// then change ONLY that DATASOURCE's route+metaInfo.
function findAndSwapChart(root) {
  function visit(n, parent, parentArrIdx) {
    if (Array.isArray(n)) { n.forEach((x, i) => visit(x, n, i)); return; }
    if (n && typeof n === 'object') {
      if (typeof n.tag === 'string' && n.tag.includes('wuic-data-repeater') && n.inputs?.action === 'chart') {
        // Find sibling DATASOURCE in parent.nestedComponents (or any nearby array)
        const sibArr = parent;
        if (Array.isArray(sibArr)) {
          for (const sib of sibArr) {
            if (sib && typeof sib === 'object' && typeof sib.tag === 'string' &&
                sib.tag.includes('wuic-data-source') && sib.inputs?.route === 'vw_costi_storici_mensili') {
              sib.inputs.route = 'vw_costi_per_mese';
              sib.inputs.metaInfo = newMeta;
              swapped++;
            }
          }
        }
      }
      for (const k of Object.keys(n)) {
        if (Array.isArray(n[k])) visit(n[k], n[k], -1);
        else visit(n[k], n, -1);
      }
    }
  }
  visit(root, null, -1);
}

findAndSwapChart(arr);
console.log('chart datasources swapped:', swapped);

// 4) Also update chart tile title to reflect new field
function setTitle(node, path, text) {
  // path like "[0].nestedComponents[2].nestedComponents[0].nestedComponents[0].nestedComponents[0]"
  // (already known from previous analysis: chart tile title is at this path)
  let cur = node;
  const segs = path.match(/\[(\d+)\]|\.nestedComponents/g) || [];
  for (const s of segs) {
    if (s.startsWith('[')) cur = cur[parseInt(s.slice(1, -1))];
    else cur = cur.nestedComponents;
  }
  if (cur?.inputs) cur.inputs.innerText = text;
}
// Title already "Andamento costi mensili" — leave as-is

const json = JSON.stringify(arr);
fs.writeFileSync('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast_swapped.json', json);

// 5) UPDATE DB
const ps1Set = `
$json = [System.IO.File]::ReadAllText('C:/src/Wuic/FlottaMezzi/dbms/templates/_dash_costi_forecast_swapped.json')
$conn = New-Object System.Data.SqlClient.SqlConnection 'Data Source=localhost\\sqlexpress;Initial Catalog=FlottaMezzi_Metadata;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True'
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = 'UPDATE dom_board SET boardcontent = @j WHERE boardroute = @r'
[void]$cmd.Parameters.AddWithValue('@j', $json)
[void]$cmd.Parameters.AddWithValue('@r', 'costi_forecast')
$rows = $cmd.ExecuteNonQuery()
$conn.Close()
Write-Host "rows=$rows"
`;
fs.writeFileSync('C:/src/Wuic/FlottaMezzi/scripts/_apply_costi.ps1', ps1Set);
console.log(execSync('pwsh -ExecutionPolicy Bypass -File C:/src/Wuic/FlottaMezzi/scripts/_apply_costi.ps1', { encoding: 'utf8' }).trim());

// 6) Invalidate
const inv = await ctx.post('/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime', { data: {}, headers: { 'Content-Type': 'application/json' } });
console.log('invalidate:', inv.status());
await ctx.dispose();
