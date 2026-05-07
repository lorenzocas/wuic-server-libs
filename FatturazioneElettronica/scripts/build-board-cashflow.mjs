/**
 * Build dashboard `cashflow_forecast` framework-pure (refactor #17).
 *
 * Layout:
 *   - TR1 title: "Cash-flow forecast 90gg"
 *   - TR2: 4 KPI tile (Incassi / Pagamenti / Saldo finale + badge SURPLUS|DEFICIT / Giorni movimento)
 *   - TR3: line chart su vw_cashflow_giornaliero (saldo cumulato)
 *   - TR4: tabella daily su stessa view
 *
 * Vedi skill: skills/dashboard-replicate-custom-ui/SKILL.md
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

const BOARD_ROUTE = 'cashflow_forecast';
const BOARD_TITLE = 'Cash-flow forecast 90gg';
const BOARD_DESC = 'Proiezione saldo 90gg + KPI incassi/pagamenti attesi.';
const META_DB = 'FatturazioneElettronica_Metadata';
const META_CONN = `Server=localhost\\sqlexpress;Database=${META_DB};Integrated Security=False;User ID=sa;Password=superlamelauser;TrustServerCertificate=True`;
const TPL_PATH = 'C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json';

const apiPre = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });

function fetchTableRow(route) {
  const ps = `
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open(); $cmd = $cn.CreateCommand()
$cmd.CommandText = 'SELECT md_id, md_nome_tabella, mdroutename, mdschemaname, mdconnname, mddbname, mdpropsbag, mm_display_string, mm_long_description FROM dbo._metadati__tabelle WHERE mdroutename = @route'
$p = $cmd.Parameters.Add('@route', [System.Data.SqlDbType]::NVarChar, 200); $p.Value = '${route}'
$r = $cmd.ExecuteReader()
$o = @{}
if ($r.Read()) { for ($i=0; $i -lt $r.FieldCount; $i++) { $name = $r.GetName($i); $v = $r.GetValue($i); if ($v -is [DBNull]) { $v = $null }; $o[$name] = $v } }
$cn.Close(); $o | ConvertTo-Json -Depth 4 -Compress
`;
  const out = execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 5*1024*1024 });
  return JSON.parse(out.trim() || '{}');
}

const ROUTES = ['vw_cashflow_totali', 'vw_cashflow_giornaliero'];
const tmCache = {}, cmCache = {};
for (const route of ROUTES) {
  const tm = await apiPre.call('MetaService.getTableMetadata', { route });
  const cm = Array.isArray(tm?.columnMetadata) ? tm.columnMetadata : [];
  cm.forEach(c => { delete c.extraProps; });
  cmCache[route] = cm;
  const tabRow = fetchTableRow(route);
  if (typeof tabRow.mdpropsbag === 'string') {
    try { tabRow.md_props_bag = JSON.parse(tabRow.mdpropsbag); } catch { tabRow.md_props_bag = {}; }
  } else if (tabRow.mdpropsbag) tabRow.md_props_bag = tabRow.mdpropsbag;
  delete tabRow.mdpropsbag;
  tmCache[route] = tabRow;
  console.log(`metaInfo[${route}]: md_id=${tabRow.md_id}, cols=${cm.length}`);
}
await apiPre.dispose();

function buildTableMetadata(route) {
  const tab = tmCache[route];
  return {
    md_id: tab.md_id, md_nome_tabella: tab.md_nome_tabella,
    mdroutename: tab.mdroutename, md_route_name: tab.mdroutename,
    mdschemaname: tab.mdschemaname, md_schema_name: tab.mdschemaname,
    mdconnname: tab.mdconnname, md_conn_name: tab.mdconnname,
    mddbname: tab.mddbname, md_db_name: tab.mddbname,
    md_display_string: tab.mm_display_string,
    md_long_description: tab.mm_long_description,
    md_props_bag: tab.md_props_bag || {}
  };
}

let raw = readFileSync(TPL_PATH, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const tpl = JSON.parse(raw);

const suff = '_cf_' + Math.random().toString(36).slice(2, 7);
function patchUN(node) {
  if (!node) return;
  if (node.inputs?.uniqueName) node.inputs.uniqueName = String(node.inputs.uniqueName) + suff;
  if (node.uniqueName) node.uniqueName = String(node.uniqueName) + suff;
  if (node.inputs?.datasource?.uniqueName) node.inputs.datasource.uniqueName = String(node.inputs.datasource.uniqueName) + suff;
  if (Array.isArray(node.nestedComponents)) node.nestedComponents.forEach(patchUN);
}
const tplPatched = JSON.parse(JSON.stringify(tpl));
tplPatched.forEach(patchUN);

const root = tplPatched[0];
const titleSpan = root.nestedComponents[0].nestedComponents[0].nestedComponents[0];
titleSpan.inputs.innerText = BOARD_TITLE;

const trDataRow = root.nestedComponents[1];
const tdBlueprintRaw = trDataRow.nestedComponents[0];
function cloneTd() { return JSON.parse(JSON.stringify(tdBlueprintRaw)); }

let cloneSeq = 0;
function uniquify(node) {
  cloneSeq++;
  const localSuff = '_c' + cloneSeq;
  function walk(n) {
    if (!n) return;
    if (n.inputs?.uniqueName) n.inputs.uniqueName += localSuff;
    if (n.uniqueName) n.uniqueName += localSuff;
    if (n.inputs?.datasource?.uniqueName) n.inputs.datasource.uniqueName += localSuff;
    if (Array.isArray(n.nestedComponents)) n.nestedComponents.forEach(walk);
  }
  walk(node);
}

function makeKpiTile({ labelText, ds_route, bindingBody, color }) {
  const td = cloneTd();
  // KPI altezza vh-based per fitting 1920x1080 + scaling responsive
  td.inputs.height = 'clamp(90px, 12vh, 130px)'; td.inputs.maxHeight = 'clamp(90px, 12vh, 130px)'; td.inputs.width = '25%';
  const div = td.nestedComponents[0];
  div.inputs.height = '100%'; div.inputs.minHeight = 'auto'; div.inputs.padding = '12px';
  const spanTitle = div.nestedComponents[0];
  const ds = div.nestedComponents[1];
  const spanValue = JSON.parse(JSON.stringify(spanTitle));
  div.nestedComponents[2] = spanValue;

  spanTitle.inputs.innerText = labelText;
  spanTitle.inputs.fontSize = '12px';
  spanTitle.inputs.color = '#6b7280';
  spanTitle.inputs.fontWeight = '500';

  ds.inputs.route = ds_route;
  ds.inputs.autoload = true;
  if (cmCache[ds_route]?.length && ds.inputs.metaInfo) ds.inputs.metaInfo.columnMetadata = cmCache[ds_route];
  if (ds.inputs.metaInfo?.tableMetadata) Object.assign(ds.inputs.metaInfo.tableMetadata, buildTableMetadata(ds_route));

  spanValue.inputs.datasource = { uniqueName: ds.inputs.uniqueName || ds.uniqueName };
  spanValue.inputs.bindingFunction = bindingBody;
  spanValue.inputs.fontSize = '24px';
  spanValue.inputs.fontWeight = '700';
  if (color) spanValue.inputs.color = color;
  spanValue.inputs.innerText = '...';

  uniquify(td);
  return td;
}

function makeWideWidget({ titleText, ds_route, action, colspan, height }) {
  const td = cloneTd();
  if (colspan && colspan > 1) td.inputs.colSpan = String(colspan);
  const widgetHeight = height || (action === 'chart' ? 'clamp(300px, 40vh, 460px)' : 'clamp(160px, 20vh, 240px)');
  td.inputs.height = widgetHeight; td.inputs.maxHeight = widgetHeight; td.inputs.width = '100%';
  const div = td.nestedComponents[0];
  div.inputs.height = '100%'; div.inputs.minHeight = 'auto';
  const spanTitle = div.nestedComponents[0];
  const ds = div.nestedComponents[1];
  const dr = div.nestedComponents[2];

  spanTitle.inputs.innerText = titleText;
  ds.inputs.route = ds_route;
  ds.inputs.autoload = true;
  if (cmCache[ds_route]?.length && ds.inputs.metaInfo) ds.inputs.metaInfo.columnMetadata = cmCache[ds_route];
  if (ds.inputs.metaInfo?.tableMetadata) Object.assign(ds.inputs.metaInfo.tableMetadata, buildTableMetadata(ds_route));
  dr.inputs.action = action;

  uniquify(td);
  return td;
}

const fmtEur = `function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}`;

const kpi1 = makeKpiTile({
  labelText: 'Incassi attesi 90gg',
  ds_route: 'vw_cashflow_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.incassi_attesi) : '...';`,
  color: '#16a34a'
});
const kpi2 = makeKpiTile({
  labelText: 'Pagamenti attesi 90gg',
  ds_route: 'vw_cashflow_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? '−' + fmt(r.pagamenti_attesi) : '...';`,
  color: '#dc2626'
});
const kpi3 = makeKpiTile({
  labelText: 'Saldo finale',
  ds_route: 'vw_cashflow_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} inputs.innerText = fmt(r.saldo_finale); var st=String(r.stato_saldo||'PARI'); inputs.color = st==='SURPLUS'?'#16a34a':(st==='DEFICIT'?'#dc2626':'#0f172a');`,
  color: '#0f172a'
});
const kpi4 = makeKpiTile({
  labelText: 'Stato saldo',
  ds_route: 'vw_cashflow_totali',
  bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} var st=String(r.stato_saldo||'PARI'); inputs.innerText = st==='SURPLUS'?'IN SURPLUS':(st==='DEFICIT'?'IN DEFICIT':'PARI'); inputs.backgroundColor = st==='SURPLUS'?'#dcfce7':(st==='DEFICIT'?'#fee2e2':'#f3f4f6'); inputs.color = st==='SURPLUS'?'#166534':(st==='DEFICIT'?'#991b1b':'#475569');`,
  color: '#0f172a'
});

const chartW = makeWideWidget({
  titleText: 'Saldo cumulato giornaliero',
  ds_route: 'vw_cashflow_giornaliero',
  action: 'chart',
  colspan: 4
});
const tableW = makeWideWidget({
  titleText: 'Dettaglio movimenti giornalieri',
  ds_route: 'vw_cashflow_giornaliero',
  action: 'list',
  colspan: 4
});

// Costruisci la nuova struttura TABLE
const tr1 = JSON.parse(JSON.stringify(root.nestedComponents[0]));
tr1.nestedComponents[0].inputs.colSpan = '4';
uniquify(tr1);

const tr2 = JSON.parse(JSON.stringify(root.nestedComponents[1]));
tr2.nestedComponents = [kpi1, kpi2, kpi3, kpi4];
if (tr2.uniqueName) tr2.uniqueName += '_tr2';

const tr3 = JSON.parse(JSON.stringify(root.nestedComponents[1]));
tr3.nestedComponents = [chartW];
if (tr3.uniqueName) tr3.uniqueName += '_tr3';

const tr4 = JSON.parse(JSON.stringify(root.nestedComponents[1]));
tr4.nestedComponents = [tableW];
if (tr4.uniqueName) tr4.uniqueName += '_tr4';

root.nestedComponents = [tr1, tr2, tr3, tr4];

const json = JSON.stringify(tplPatched);
console.log(`boardcontent built: ${json.length} chars`);
writeFileSync('C:/Users/lollo/AppData/Local/Temp/cashflow-board.json', json, 'utf8');

const ps = `
$json = [System.IO.File]::ReadAllText('C:\\Users\\lollo\\AppData\\Local\\Temp\\cashflow-board.json', [System.Text.UTF8Encoding]::new($false))
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open()
$cmd = $cn.CreateCommand()
$cmd.CommandText = "IF EXISTS (SELECT 1 FROM dbo.dom_board WHERE boardroute='${BOARD_ROUTE}') UPDATE dbo.dom_board SET boardcontent=@bc, boarddes=@desc WHERE boardroute='${BOARD_ROUTE}' ELSE INSERT INTO dbo.dom_board (boardroute, boarddes, boardcontent) VALUES ('${BOARD_ROUTE}', @desc, @bc)"
$p = $cmd.Parameters.Add('@bc', [System.Data.SqlDbType]::NVarChar, -1); $p.Value = $json
$pd = $cmd.Parameters.Add('@desc', [System.Data.SqlDbType]::NVarChar, 200); $pd.Value = '${BOARD_DESC.replace(/'/g, "''")}'
$cmd.ExecuteNonQuery() | Out-Null
$cn.Close()
Write-Host "OK"
`;
execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', stdio: 'inherit' });

const api2 = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
await api2.invalidateMetadataRuntime();
await api2.dispose();
console.log(`\n✓ Dashboard cashflow built. URL: http://localhost:4202/#/${BOARD_ROUTE}/dashboard`);
