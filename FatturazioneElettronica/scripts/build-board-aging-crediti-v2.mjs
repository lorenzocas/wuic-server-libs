/**
 * Build dashboard `aging_crediti` v2: layout identico all'originale Angular custom.
 *
 * Layout target:
 *   ┌──────────────────────────────────────────────────────┐
 *   │              Aging analysis crediti                   │  TR1: title
 *   ├────────┬────────┬────────┬────────────────────────────┤
 *   │ KPI 1  │ KPI 2  │ KPI 3  │ KPI 4 (badge "RISCHIO X")  │  TR2: 4 KPI tile
 *   ├────────┴────────┴────────┴────────────────────────────┤
 *   │             STACKED BAR per cliente                   │  TR3: chart (colspan=4)
 *   ├──────────────────────────────────────────────────────┤
 *   │             TABELLA dettaglio cliente                 │  TR4: list (colspan=4)
 *   └──────────────────────────────────────────────────────┘
 *
 * Strategia: parto da 2x2-grid-with-charts.template.json, estraggo i blocchi
 * (TR/TD/DIV/DATASOURCE/SPAN/DATAREPEATER) come blueprint, costruisco la
 * nuova struttura TABLE con 4 TR.
 *
 * KPI binding: 4 SPAN bindati alla stessa vw_aging_crediti_totali (1 DS shared
 * con autoload). Ogni SPAN ha bindingFunction che legge resultInfo.dato[0]
 * e popola innerText con il KPI specifico (e per il #4 inputs.color cambia
 * in funzione del rischio).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

const BOARD_ROUTE = 'aging_crediti';
const BOARD_TITLE = 'Aging analysis crediti';
const BOARD_DESC = 'Distribuzione crediti per fascia eta — 4 KPI tile + stacked bar + tabella dettaglio cliente.';
const META_DB = 'FatturazioneElettronica_Metadata';
const META_CONN = `Server=localhost\\sqlexpress;Database=${META_DB};Integrated Security=False;User ID=sa;Password=superlamelauser;TrustServerCertificate=True`;
const TPL_PATH = 'C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json';

// Pre-fetch metaInfo (route → tableMetadata + columnMetadata)
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

const ROUTES = ['vw_aging_crediti_totali', 'vw_aging_crediti_clienti'];
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

// Helper: build tableMetadata block coerente per una route
function buildTableMetadata(route) {
  const tab = tmCache[route];
  return {
    md_id: tab.md_id,
    md_nome_tabella: tab.md_nome_tabella,
    mdroutename: tab.mdroutename,
    md_route_name: tab.mdroutename,
    mdschemaname: tab.mdschemaname,
    md_schema_name: tab.mdschemaname,
    mdconnname: tab.mdconnname,
    md_conn_name: tab.mdconnname,
    mddbname: tab.mddbname,
    md_db_name: tab.mddbname,
    md_display_string: tab.mm_display_string,
    md_long_description: tab.mm_long_description,
    md_props_bag: tab.md_props_bag || {}
  };
}

// Read template
let raw = readFileSync(TPL_PATH, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const tpl = JSON.parse(raw);

// Suffix unique per evitare collision con home board
const suff = '_ag_' + Math.random().toString(36).slice(2, 7);

// Patch tutti gli uniqueName (anche reference inputs.datasource.uniqueName)
function patchUN(node) {
  if (!node) return;
  if (node.inputs?.uniqueName) node.inputs.uniqueName = String(node.inputs.uniqueName) + suff;
  if (node.uniqueName) node.uniqueName = String(node.uniqueName) + suff;
  if (node.inputs?.datasource?.uniqueName) node.inputs.datasource.uniqueName = String(node.inputs.datasource.uniqueName) + suff;
  if (Array.isArray(node.nestedComponents)) node.nestedComponents.forEach(patchUN);
}
const tplPatched = JSON.parse(JSON.stringify(tpl));
tplPatched.forEach(patchUN);

const root = tplPatched[0]; // TABLE
const titleSpan = root.nestedComponents[0].nestedComponents[0].nestedComponents[0];
titleSpan.inputs.innerText = BOARD_TITLE;

// Estraggo i blocchi blueprint dal template:
// - trBlueprint: TR del template (rimuovo tutti i TD per riusarla)
// - tdBlueprint: TD del template (per cloni nuovi)
// - widgetBlueprint: DIV con SPAN+DATASOURCE+DATAREPEATER (per W3/W4)
// - kpiTdBlueprint: TD-DIV-DATASOURCE-SPAN per i 4 KPI tile (lo derivo dal widgetBlueprint)
const trDataRow = root.nestedComponents[1]; // TR row con 2 TD widget
const tdBlueprintRaw = trDataRow.nestedComponents[0]; // TD con DIV+widget
const widgetBlueprintRaw = tdBlueprintRaw.nestedComponents[0]; // DIV widget

// Helper: clone una TD con DIV widget pristino
function cloneTd() { return JSON.parse(JSON.stringify(tdBlueprintRaw)); }

// Helper: rinomina uniqueName con un nuovo suffix locale (per renderle univoche tra cloni)
let cloneSeq = 0;
function uniquify(node) {
  cloneSeq++;
  const localSuff = '_c' + cloneSeq;
  function walk(n) {
    if (!n) return;
    if (n.inputs?.uniqueName) n.inputs.uniqueName += localSuff;
    if (n.uniqueName) n.uniqueName += localSuff;
    // i reference vanno aggiornati con lo stesso localSuff
    if (n.inputs?.datasource?.uniqueName) n.inputs.datasource.uniqueName += localSuff;
    if (Array.isArray(n.nestedComponents)) n.nestedComponents.forEach(walk);
  }
  walk(node);
}

// === COSTRUZIONE LAYOUT ===
// TR1 (title) → invariato
// Costruisco TR2 (4 KPI), TR3 (chart), TR4 (table)

// Helper: crea KPI tile = TD > DIV > [SPAN title + DATASOURCE + SPAN bindato]
// Ogni KPI ha 2 SPAN: 1 fisso (label) + 1 bindato (valore numero/badge)
function makeKpiTile({ labelText, ds_route, bindingBody, color }) {
  const td = cloneTd();
  // FIX 2026-05-07: il TD blueprint del template 2x2 era pensato per chart/list
  // grossi (DIV interno con height: clamp(300px, 100vh, 40vh)). Per KPI tile
  // serve altezza compatta ~120px.
  td.inputs.height = 'clamp(90px, 12vh, 130px)';
  td.inputs.maxHeight = 'clamp(90px, 12vh, 130px)';
  // FIX 2026-05-08 (flex layout): TR display:flex row + 4 KPI flex equi-distribuiti
  td.inputs.flex = '1 1 0';
  td.inputs.width = 'auto';
  td.inputs.maxWidth = 'none';
  const div = td.nestedComponents[0];
  div.inputs.height = '100%';
  div.inputs.minHeight = 'auto';
  div.inputs.padding = '12px';

  // div.nestedComponents = [SPAN_title, DATASOURCE, DATAREPEATER]
  // Sostituisco DATAREPEATER con SPAN_value bindato
  const spanTitle = div.nestedComponents[0];
  const ds = div.nestedComponents[1];
  const spanValueClone = JSON.parse(JSON.stringify(spanTitle)); // clone SPAN come blueprint per il valore
  // FIX 2026-05-08: deep-clone eredita stesso uniqueName del titolo →
  // dopo uniquify() i 2 SPAN avrebbero uniqueName IDENTICO. Append marker.
  if (spanValueClone.inputs?.uniqueName) spanValueClone.inputs.uniqueName += '_VALUE';
  if (spanValueClone.uniqueName) spanValueClone.uniqueName += '_VALUE';
  // Sostituisce il DATAREPEATER nel terzo slot
  div.nestedComponents[2] = spanValueClone;

  // Setta SPAN_title (label statica, 12pt)
  spanTitle.inputs.innerText = labelText;
  spanTitle.inputs.fontSize = '12px';
  spanTitle.inputs.color = '#6b7280';
  spanTitle.inputs.fontWeight = '500';

  // Setta DATASOURCE
  ds.inputs.route = ds_route;
  ds.inputs.autoload = true;
  if (cmCache[ds_route]?.length && ds.inputs.metaInfo) {
    ds.inputs.metaInfo.columnMetadata = cmCache[ds_route];
  }
  if (ds.inputs.metaInfo?.tableMetadata) {
    Object.assign(ds.inputs.metaInfo.tableMetadata, buildTableMetadata(ds_route));
  }

  // SPAN value bindato al DS
  spanValueClone.inputs.datasource = { uniqueName: ds.inputs.uniqueName || ds.uniqueName };
  spanValueClone.inputs.bindingFunction = bindingBody;
  spanValueClone.inputs.fontSize = '24px';
  spanValueClone.inputs.fontWeight = '700';
  if (color) spanValueClone.inputs.color = color;
  spanValueClone.inputs.innerText = '...';

  uniquify(td);  // rendi univoci tutti gli uniqueName clonati
  return td;
}

// Helper: crea widget completo (chart o list) full-width con colspan=4
function makeWideWidget({ titleText, ds_route, action, colspan, height, fillResidual }) {
  const td = cloneTd();
  if (colspan && colspan > 1) td.inputs.colSpan = String(colspan);
  // FIX 2026-05-08 (flex layout): TR display:flex row, TD = flex:1 1 0 +
  // reset maxWidth (template 2x2 lo ha a 50%). Pattern dashboard-replicate-custom-ui.
  td.inputs.width = 'auto';
  td.inputs.maxWidth = 'none';
  td.inputs.flex = '1 1 0';
  const div = td.nestedComponents[0];
  if (fillResidual) {
    // TR4 grid residuale: DIV riempie il TD naturalmente, PrimeNG datatable
    // gestisce il proprio scroll quando i record superano lo spazio.
    td.inputs.height = '100%';
    delete td.inputs.maxHeight;
    div.inputs.height = '100%';
    div.inputs.minHeight = height || 'clamp(160px, 20vh, 240px)';
    delete div.inputs.maxHeight;
    delete div.inputs.overflow;
  } else {
    // chart: clamp altezza fissa per fitting 1920x1080.
    const widgetHeight = height || (action === 'chart' ? 'clamp(300px, 40vh, 460px)' : 'clamp(160px, 20vh, 240px)');
    td.inputs.height = widgetHeight;
    td.inputs.maxHeight = widgetHeight;
    div.inputs.height = '100%';
    div.inputs.maxHeight = widgetHeight;
    div.inputs.minHeight = 'auto';
    div.inputs.overflow = 'hidden';
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

// Costruisci i 4 KPI tile bindati a vw_aging_crediti_totali
const fmtEur = `function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}`;

const kpi1 = makeKpiTile({
  labelText: 'Totale esposizione',
  ds_route: 'vw_aging_crediti_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.totale_esposizione) : '...';`,
  color: '#0f172a'
});
const kpi2 = makeKpiTile({
  labelText: 'Totale scaduto',
  ds_route: 'vw_aging_crediti_totali',
  bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.totale_scaduto) : '...';`,
  color: '#dc2626'
});
const kpi3 = makeKpiTile({
  labelText: '% scaduto su totale',
  ds_route: 'vw_aging_crediti_totali',
  bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} var p=Number(r.perc_scaduto_su_totale||0); inputs.innerText = p.toFixed(2)+' %'; inputs.color = p<=10?'#16a34a':(p<=30?'#f59e0b':'#dc2626');`,
  color: '#0f172a'
});
const kpi4 = makeKpiTile({
  labelText: 'Rischio',
  ds_route: 'vw_aging_crediti_totali',
  bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} var risk=String(r.rischio||'?'); inputs.innerText = risk; inputs.backgroundColor = risk==='ALTO'?'#fee2e2':(risk==='MEDIO'?'#fef3c7':'#dcfce7'); inputs.color = risk==='ALTO'?'#991b1b':(risk==='MEDIO'?'#92400e':'#166534');`,
  color: '#0f172a'
});

// Stacked bar (W3) full width colspan=4
const chartW = makeWideWidget({
  titleText: 'Esposizione per cliente',
  ds_route: 'vw_aging_crediti_clienti',
  action: 'chart',
  colspan: 4
});

// Tabella dettaglio (W4) full width colspan=4 — fillResidual riempie TR4
const tableW = makeWideWidget({
  titleText: 'Dettaglio per cliente',
  ds_route: 'vw_aging_crediti_clienti',
  action: 'list',
  colspan: 4,
  fillResidual: true
});

// Costruisci il NUOVO array nestedComponents della TABLE root
// TR1 (title) — clone esistente, ma colspan=4
const tr1 = JSON.parse(JSON.stringify(root.nestedComponents[0]));
tr1.nestedComponents[0].inputs.colSpan = '4';
uniquify(tr1);

// TR2 KPI: 4 TD
const tr2 = JSON.parse(JSON.stringify(root.nestedComponents[1])); // TR template
tr2.nestedComponents = [kpi1, kpi2, kpi3, kpi4];
// uniquify TR2 itself (ma solo node, no children che gia' uniquificati)
if (tr2.uniqueName) tr2.uniqueName += '_tr2';
if (tr2.inputs?.uniqueName) tr2.inputs.uniqueName += '_tr2';

// TR3 chart wide
const tr3 = JSON.parse(JSON.stringify(root.nestedComponents[1]));
tr3.nestedComponents = [chartW];
if (tr3.uniqueName) tr3.uniqueName += '_tr3';
if (tr3.inputs?.uniqueName) tr3.inputs.uniqueName += '_tr3';

// TR4 table wide
const tr4 = JSON.parse(JSON.stringify(root.nestedComponents[1]));
tr4.nestedComponents = [tableW];
if (tr4.uniqueName) tr4.uniqueName += '_tr4';
if (tr4.inputs?.uniqueName) tr4.inputs.uniqueName += '_tr4';

root.nestedComponents = [tr1, tr2, tr3, tr4];

// === FIX 2026-05-08: TABLE → flex column per honorare height cap viewport ===
// Pattern: skills/dashboard-replicate-custom-ui (sezione "Trappole verificate").
// HTML <table>/<tr>/<td> ignorano height come MAX → table sfora viewport.
// Soluzione: flex column su TABLE + flex row su TR + reset maxWidth/maxHeight.
if (root.inputs) {
  root.inputs.display = 'flex';
  root.inputs.flexDirection = 'column';
  root.inputs.height = 'calc(100vh - 50px)';
  root.inputs.maxHeight = 'calc(100vh - 50px)';
  root.inputs.width = '100%';
}
function setFlexItem(tr, residual) {
  if (!tr.inputs) tr.inputs = {};
  tr.inputs.display = 'flex';
  tr.inputs.flexDirection = 'row';
  if (residual) {
    tr.inputs.flex = '1 1 0';
    tr.inputs.minHeight = '0';
    delete tr.inputs.height;
  } else {
    tr.inputs.flex = '0 0 auto';
    delete tr.inputs.height;
  }
}
setFlexItem(tr1, false);
setFlexItem(tr2, false);
setFlexItem(tr3, false);
setFlexItem(tr4, true);

const json = JSON.stringify(tplPatched);
console.log(`boardcontent v2 built: ${json.length} chars (vs 288k v1)`);
writeFileSync('C:/Users/lollo/AppData/Local/Temp/aging-crediti-board-v2.json', json, 'utf8');

// UPSERT su dom_board
const ps = `
$json = [System.IO.File]::ReadAllText('C:\\Users\\lollo\\AppData\\Local\\Temp\\aging-crediti-board-v2.json', [System.Text.UTF8Encoding]::new($false))
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open()
$cmd = $cn.CreateCommand()
$cmd.CommandText = "IF EXISTS (SELECT 1 FROM dbo.dom_board WHERE boardroute='${BOARD_ROUTE}') UPDATE dbo.dom_board SET boardcontent=@bc, boarddes=@desc WHERE boardroute='${BOARD_ROUTE}' ELSE INSERT INTO dbo.dom_board (boardroute, boarddes, boardcontent) VALUES ('${BOARD_ROUTE}', @desc, @bc)"
$p = $cmd.Parameters.Add('@bc', [System.Data.SqlDbType]::NVarChar, -1); $p.Value = $json
$pd = $cmd.Parameters.Add('@desc', [System.Data.SqlDbType]::NVarChar, 200); $pd.Value = '${BOARD_DESC.replace(/'/g, "''")}'
$rc = $cmd.ExecuteNonQuery()
Write-Host "rows affected: $rc"
$cn.Close()
`;
execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', stdio: 'inherit' });

const api2 = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
await api2.invalidateMetadataRuntime();
await api2.dispose();
console.log(`\n✓ Dashboard v2 built. URL: http://localhost:4202/#/${BOARD_ROUTE}/dashboard`);
