/**
 * Combo: scaffold viste top_clienti + build dashboard `top_clienti`.
 * Pattern documentato in skills/dashboard-replicate-custom-ui/SKILL.md
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFile as execFileCb, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
const execFile = promisify(execFileCb);

const BACKEND = 'http://localhost:5100';
const DATA_CONN = 'Data Source=localhost\\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;Integrated Security=False;Persist Security Info=True;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True';
const META_DB = 'FatturazioneElettronica_Metadata';
const META_CONN = `Server=localhost\\sqlexpress;Database=${META_DB};Integrated Security=False;User ID=sa;Password=superlamelauser;TrustServerCertificate=True`;
const TPL_PATH = 'C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json';

const BOARD_ROUTE = 'top_clienti';
const BOARD_TITLE = 'Top clienti per fatturato';
const BOARD_DESC = 'Top 10 clienti per fatturato anno corrente — KPI + bar chart + tabella.';

async function execMeta(query) {
  const dir = mkdtempSync(join(tmpdir(), 'sqlmeta-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, `SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\n${query}\n`, { encoding: 'utf8' });
  await execFile('sqlcmd', [
    '-S', 'localhost\\sqlexpress', '-d', META_DB, '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I', '-f', '65001', '-i', file
  ], { maxBuffer: 10 * 1024 * 1024 });
}

async function sqlMeta(query) {
  const out = await execFile('sqlcmd', [
    '-S', 'localhost\\sqlexpress', '-d', META_DB, '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I', '-W', '-s', '|', '-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`
  ], { maxBuffer: 10 * 1024 * 1024 });
  return out.stdout;
}

async function getMdId(viewName) {
  const out = await sqlMeta(`SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename='${viewName}' ORDER BY md_id DESC`);
  const lines = out.split(/\r?\n/).filter(l => /^\d+$/.test(l.trim()));
  return lines.length ? Number(lines[0].trim()) : null;
}

const api = await createBackendApiClient({ backendBaseUrl: BACKEND, user: 'admin_test', password: 'Test123!' });

// === SCAFFOLD ===
async function scaffoldView(view, displayString, longDescription, chartCfg) {
  console.log(`\n=== ${view} ===`);
  const res = await api.call('scaffolding.scaffoldView', {
    connection: DATA_CONN, connName: 'DataSQLConnection', db: 'FatturazioneElettronica_Data',
    view, createMenu: false, parentMenuId: 0
  });
  console.log(`  scaffoldView: ${JSON.stringify(res)?.slice(0, 100)}`);
  const md_id = await getMdId(view);
  await execMeta(`UPDATE dbo._metadati__tabelle SET mm_display_string=N'${displayString.replace(/'/g, "''")}', mm_long_description=N'${longDescription.replace(/'/g, "''")}' WHERE md_id=${md_id}`);
  if (chartCfg) {
    const json = JSON.stringify({ archetypes: { chart: chartCfg } });
    await execMeta(`UPDATE dbo._metadati__tabelle SET mdpropsbag=N'${json.replace(/'/g, "''")}' WHERE md_id=${md_id}`);
    console.log(`  chart archetype configurato (${chartCfg.type})`);
  }
  return md_id;
}

await scaffoldView('vw_top_clienti_totali',
  'Top clienti — KPI', 'Single-row con i KPI top clienti.', null);

await scaffoldView('vw_top_clienti_anno',
  'Top clienti — top 10 anno', 'Top 10 clienti per fatturato anno corrente. Bar chart horizontal.',
  {
    type: 'bar',
    dataOptions: {
      datasets: [{
        dataField: 'totale_fatturato', labelField: 'cliente_ragione', label: 'Fatturato',
        backgroundColor: '#3b82f6',
        maxBarThickness: 24
      }],
      dataProperty: 'dato',
      indexAxis: 'y',  // horizontal bar
      cutOffCount: 10
    }
  });

const COL_LABELS = {
  'cliente_codice': 'Codice', 'cliente_ragione': 'Cliente', 'cliente_tipo': 'Tipo',
  'num_fatture': 'N. fatture', 'imponibile_totale': 'Imponibile',
  'iva_totale': 'IVA', 'totale_fatturato': 'Totale',
  'prima_fattura': 'Prima', 'ultima_fattura': 'Ultima',
  'n_clienti_top': 'N. clienti top', 'totale_fatturato_top': 'Fatturato totale',
  'num_fatture_totali': 'N. fatture totali', 'top_1_fatturato': 'Top 1 fatturato',
  'top_1_cliente': 'Top 1 cliente',
  'cliente_id': 'ID', 'id': 'ID'
};
const md_ids = [await getMdId('vw_top_clienti_totali'), await getMdId('vw_top_clienti_anno')];
for (const md_id of md_ids) {
  for (const [colName, label] of Object.entries(COL_LABELS)) {
    await execMeta(`UPDATE dbo._metadati__colonne SET mc_display_string_in_view=N'${label.replace(/'/g, "''")}', mc_display_string_in_edit=N'${label.replace(/'/g, "''")}' WHERE md_id=${md_id} AND mc_nome_colonna='${colName}'`);
  }
  await execMeta(`UPDATE dbo._metadati__colonne SET mchideinlist=1 WHERE md_id=${md_id} AND mc_nome_colonna IN ('id','cliente_id')`);
}
console.log(`Label friendly applicate`);

// === BUILD DASHBOARD ===
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

const ROUTES = ['vw_top_clienti_totali', 'vw_top_clienti_anno'];
const tmCache = {}, cmCache = {};
for (const route of ROUTES) {
  const tm = await api.call('MetaService.getTableMetadata', { route });
  const cm = Array.isArray(tm?.columnMetadata) ? tm.columnMetadata : [];
  cm.forEach(c => { delete c.extraProps; });
  cmCache[route] = cm;
  const tabRow = fetchTableRow(route);
  if (typeof tabRow.mdpropsbag === 'string') {
    try { tabRow.md_props_bag = JSON.parse(tabRow.mdpropsbag); } catch { tabRow.md_props_bag = {}; }
  } else if (tabRow.mdpropsbag) tabRow.md_props_bag = tabRow.mdpropsbag;
  delete tabRow.mdpropsbag;
  tmCache[route] = tabRow;
}

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

const suff = '_tc_' + Math.random().toString(36).slice(2, 7);
function patchUN(node) {
  if (!node) return;
  if (node.inputs?.uniqueName) node.inputs.uniqueName += suff;
  if (node.uniqueName) node.uniqueName += suff;
  if (node.inputs?.datasource?.uniqueName) node.inputs.datasource.uniqueName += suff;
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
  td.inputs.height = 'clamp(90px, 12vh, 130px)'; td.inputs.maxHeight = 'clamp(90px, 12vh, 130px)';
  // FIX 2026-05-08 (flex layout)
  td.inputs.flex = '1 1 0'; td.inputs.width = 'auto'; td.inputs.maxWidth = 'none';
  const div = td.nestedComponents[0];
  div.inputs.height = '100%'; div.inputs.minHeight = 'auto'; div.inputs.padding = '12px';
  const spanTitle = div.nestedComponents[0];
  const ds = div.nestedComponents[1];
  const spanValue = JSON.parse(JSON.stringify(spanTitle));
  // FIX 2026-05-08: append marker per distinguerlo dal title (deep-clone
  // eredita lo stesso uniqueName, uniquify appenderebbe lo stesso suffix).
  if (spanValue.inputs?.uniqueName) spanValue.inputs.uniqueName += '_VALUE';
  if (spanValue.uniqueName) spanValue.uniqueName += '_VALUE';
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

function makeWideWidget({ titleText, ds_route, action, colspan, height, fillResidual }) {
  const td = cloneTd();
  if (colspan && colspan > 1) td.inputs.colSpan = String(colspan);
  // FIX 2026-05-08 (flex layout)
  td.inputs.width = 'auto'; td.inputs.maxWidth = 'none'; td.inputs.flex = '1 1 0';
  const div = td.nestedComponents[0];
  if (fillResidual) {
    td.inputs.height = '100%'; delete td.inputs.maxHeight;
    div.inputs.height = '100%'; div.inputs.minHeight = height || 'clamp(160px, 20vh, 240px)';
    delete div.inputs.maxHeight; delete div.inputs.overflow;
  } else {
    const widgetHeight = height || (action === 'chart' ? 'clamp(300px, 40vh, 460px)' : 'clamp(160px, 20vh, 240px)');
    td.inputs.height = widgetHeight; td.inputs.maxHeight = widgetHeight;
    div.inputs.height = '100%'; div.inputs.maxHeight = widgetHeight; div.inputs.minHeight = 'auto'; div.inputs.overflow = 'hidden';
  }
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
  labelText: 'Top 1 cliente',
  ds_route: 'vw_top_clienti_totali',
  bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? String(r.top_1_cliente||'—') : '...'; inputs.fontSize='18px';`,
  color: '#f59e0b'
});
const kpi2 = makeKpiTile({
  labelText: 'Top 1 fatturato',
  ds_route: 'vw_top_clienti_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.top_1_fatturato) : '...';`,
  color: '#0f172a'
});
const kpi3 = makeKpiTile({
  labelText: 'Fatturato totale top 10',
  ds_route: 'vw_top_clienti_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.totale_fatturato_top) : '...';`,
  color: '#0f172a'
});
const kpi4 = makeKpiTile({
  labelText: 'N. fatture totali',
  ds_route: 'vw_top_clienti_totali',
  bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? String(r.num_fatture_totali||0) : '...';`,
  color: '#0f172a'
});

const chartW = makeWideWidget({
  titleText: 'Top 10 clienti per fatturato',
  ds_route: 'vw_top_clienti_anno', action: 'chart', colspan: 4
});
const tableW = makeWideWidget({
  titleText: 'Dettaglio top clienti',
  ds_route: 'vw_top_clienti_anno', action: 'list', colspan: 4, fillResidual: true
});

const tr1 = JSON.parse(JSON.stringify(root.nestedComponents[0]));
tr1.nestedComponents[0].inputs.colSpan = '4';
uniquify(tr1);
const tr2 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr2.nestedComponents = [kpi1, kpi2, kpi3, kpi4]; if (tr2.uniqueName) tr2.uniqueName += '_tr2'; if (tr2.inputs?.uniqueName) tr2.inputs.uniqueName += '_tr2';
const tr3 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr3.nestedComponents = [chartW]; if (tr3.uniqueName) tr3.uniqueName += '_tr3'; if (tr3.inputs?.uniqueName) tr3.inputs.uniqueName += '_tr3';
const tr4 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr4.nestedComponents = [tableW]; if (tr4.uniqueName) tr4.uniqueName += '_tr4'; if (tr4.inputs?.uniqueName) tr4.inputs.uniqueName += '_tr4';
root.nestedComponents = [tr1, tr2, tr3, tr4];

// FIX 2026-05-08: TABLE → flex column. Pattern: skills/dashboard-replicate-custom-ui.
if (root.inputs) {
  root.inputs.display = 'flex'; root.inputs.flexDirection = 'column';
  root.inputs.height = 'calc(100vh - 50px)'; root.inputs.maxHeight = 'calc(100vh - 50px)';
  root.inputs.width = '100%';
}
function setFlexItem(tr, residual) {
  if (!tr.inputs) tr.inputs = {};
  tr.inputs.display = 'flex'; tr.inputs.flexDirection = 'row';
  if (residual) { tr.inputs.flex = '1 1 0'; tr.inputs.minHeight = '0'; delete tr.inputs.height; }
  else { tr.inputs.flex = '0 0 auto'; delete tr.inputs.height; }
}
setFlexItem(tr1, false); setFlexItem(tr2, false); setFlexItem(tr3, false); setFlexItem(tr4, true);

const json = JSON.stringify(tplPatched);
console.log(`boardcontent built: ${json.length} chars`);
const tmpFile = 'C:/Users/lollo/AppData/Local/Temp/top-clienti-board.json';
writeFileSync(tmpFile, json, 'utf8');

const ps = `
$json = [System.IO.File]::ReadAllText('${tmpFile.replace(/\//g, '\\\\')}', [System.Text.UTF8Encoding]::new($false))
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

await api.invalidateMetadataRuntime();
await api.dispose();
console.log(`\n✓ Dashboard top_clienti built. URL: http://localhost:4202/#/${BOARD_ROUTE}/dashboard`);
