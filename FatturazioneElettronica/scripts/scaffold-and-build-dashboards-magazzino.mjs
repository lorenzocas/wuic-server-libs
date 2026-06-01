/**
 * Scaffold viste + build 3 dashboard per i nuovi moduli Varianti/Magazzino:
 *
 *   - magazzino_kpi      (4 KPI + horizontal stacked bar dettaglio sotto-scorta)
 *   - varianti_kpi       (4 KPI + vertical bar per attributo + tabella ranking)
 *   - magazzino_storico  (2 KPI + line chart time-series 30gg + tabella movimenti)
 *
 * Pattern clone-and-adapt da aging_debiti (skill dashboard-replicate-custom-ui).
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

const api = await createBackendApiClient({ backendBaseUrl: BACKEND, user: 'admin', password: 'admin' });

async function execMeta(query) {
  const dir = mkdtempSync(join(tmpdir(), 'sqlmeta-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, `SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\n${query}\n`, { encoding: 'utf8' });
  await execFile('sqlcmd', ['-S','localhost\\sqlexpress','-d',META_DB,'-U','sa','-P','superlamelauser','-C','-I','-f','65001','-i',file], { maxBuffer: 10485760 });
}
async function sqlMeta(query) {
  const out = await execFile('sqlcmd', ['-S','localhost\\sqlexpress','-d',META_DB,'-U','sa','-P','superlamelauser','-C','-I','-W','-s','|','-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`], { maxBuffer: 10485760 });
  return out.stdout;
}
async function getMdId(viewName) {
  const out = await sqlMeta(`SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename='${viewName}' ORDER BY md_id DESC`);
  const lines = out.split(/\r?\n/).filter(l => /^\d+$/.test(l.trim()));
  return lines.length ? Number(lines[0].trim()) : null;
}

/**
 * Costruisce + salva una ViewDefinition single-table (canvas pivot-builder)
 * linkata alla view scaffoldata. Persistita in `_metadati__pivot` con
 *   route_name = route della vista
 *   md_id      = _metadati__tabelle.md_id della stessa
 *   pivot_name = nome friendly (mostrato in "Open pivot definition" UI)
 */
async function saveViewDefinitionFor(route, md_id, pivotName) {
  // Fetch tabella + colonne
  const tabOut = await sqlMeta(`SELECT TOP 1 md_nome_tabella, mdschemaname FROM dbo._metadati__tabelle WHERE md_id=${md_id}`);
  const tabLine = tabOut.split(/\r?\n/).find(l => /\|/.test(l) && !/^md_/.test(l));
  if (!tabLine) { console.log(`  (skip view def: tabella ${md_id} non trovata)`); return false; }
  const [tableName, schemaNameRaw] = tabLine.split('|').map(s => s.trim());
  const schemaName = schemaNameRaw || 'dbo';

  const tm = await api.call('MetaService.getTableMetadata', { route });
  const cm = Array.isArray(tm?.columnMetadata) ? tm.columnMetadata : [];
  cm.forEach(c => { delete c.extraProps; });

  const tableAlias = 't0';
  const columns = cm.map(c => {
    const alias = c.mc_nome_colonna || c.alias || '';
    return {
      alias, realName: c.mc_real_column_name || alias,
      label: c.mc_display_string_in_view || alias,
      dbType: c.mc_db_column_type || '', uiType: c.mc_ui_column_type || '',
      tableRoute: route, tableAlias,
      qualifiedLabel: `${tableAlias}.${alias}`,
      selected: true, virtual: false,
      showInFilters: c.mc_show_in_filters === true
    };
  });
  const viewDef = {
    tables: [{
      nodeId: 'n0', route, mdId: md_id,
      tableName, schemaName, caption: route, tableAlias,
      columns, x: 100, y: 100, collapsed: false
    }],
    joins: []
  };
  const payload = {
    pivotName, routeName: route, mdId: md_id,
    rowColumns: [], rowColumnOptions: [], columnColumns: [], columnColumnOptions: [],
    valueColumns: [], valueColumn: '', aggregateFunction: 'SUM', topRows: 0,
    valueDefinitions: [], filterInfo: null, sortInfo: [],
    viewDefinition: viewDef,
    pivotCreatedName: route, pivotCreatedRoute: route, pivotCreatedKind: 'view'
  };
  const colList = cm.map(c => c.mc_nome_colonna || c.alias).filter(Boolean);
  const sqlText = colList.length
    ? `SELECT ${colList.join(', ')} FROM ${schemaName}.${tableName}`
    : `SELECT * FROM ${schemaName}.${tableName}`;

  const res = await api.call('MetaService.savePivotConfiguration', {
    route, md_id, pivot_config_json: JSON.stringify(payload),
    sql_text: sqlText, pivot_name: pivotName
  });
  let parsed; try { parsed = typeof res === 'string' ? JSON.parse(res) : res; } catch { parsed = res; }
  const ok = parsed && (parsed.ok === true || parsed.id1);
  console.log(`  view-def: ${ok ? '✓ saved' : '✗ ' + JSON.stringify(parsed)?.slice(0,150)} (cols=${cm.length})`);
  return ok;
}

async function scaffoldView(view, displayString, longDescription, chartCfg) {
  console.log(`\n=== scaffold ${view} ===`);
  try {
    await api.call('scaffolding.scaffoldView', {
      connection: DATA_CONN, connName: 'DataSQLConnection', db: 'FatturazioneElettronica_Data',
      view, createMenu: false, parentMenuId: 0
    });
  } catch (e) {
    console.log(`  (scaffold error swallowed if already exists: ${e?.message?.slice(0, 80)})`);
  }
  const md_id = await getMdId(view);
  await execMeta(`UPDATE dbo._metadati__tabelle SET mm_display_string=N'${displayString.replace(/'/g, "''")}', mm_long_description=N'${longDescription.replace(/'/g, "''")}' WHERE md_id=${md_id}`);
  if (chartCfg) {
    const json = JSON.stringify({ archetypes: { chart: chartCfg } });
    await execMeta(`UPDATE dbo._metadati__tabelle SET mdpropsbag=N'${json.replace(/'/g, "''")}' WHERE md_id=${md_id}`);
  }
  console.log(`  md_id=${md_id} ${chartCfg ? '+ chart ' + chartCfg.type : ''}`);
  // Auto-save ViewDefinition canvas linkato (apribile da pivot-builder Open).
  await saveViewDefinitionFor(view, md_id, displayString);
  return md_id;
}

// === SCAFFOLD VIEWS ===
const VIEWS_CFG = {
  'vw_mag_kpi_totali': { d: 'Magazzino — KPI totali', l: 'Single-row con i 4 KPI principali del magazzino.', c: null },
  'vw_mag_kpi_dettaglio': { d: 'Magazzino — dettaglio sotto-scorta', l: 'Top 30 prodotti sotto scorta cross-magazzino.', c:
    { type:'bar', dataOptions: { datasets: [
      { dataField:'quantita_libera', labelField:'prodotto_descrizione', label:'Disponibile', backgroundColor:'#22c55e', maxBarThickness:20 },
      { dataField:'quantita_riservata', labelField:'prodotto_descrizione', label:'Riservata', backgroundColor:'#f59e0b', maxBarThickness:20 },
      { dataField:'livello_riordino', labelField:'prodotto_descrizione', label:'Riordino', backgroundColor:'#ef4444', maxBarThickness:20 }
    ], dataProperty:'dato', stacked:true, indexAxis:'y', cutOffCount:10 } } },
  'vw_var_kpi_totali': { d:'Varianti — KPI totali', l:'Single-row con KPI varianti, prodotti con varianti, attributi.', c: null },
  'vw_var_kpi_per_attr': { d:'Varianti — distribuzione per attributo', l:'Numero varianti e valori per attributo configurato.', c:
    { type:'bar', dataOptions: { datasets: [
      { dataField:'num_varianti', labelField:'attributo_descrizione', label:'Varianti', backgroundColor:'#3b82f6', maxBarThickness:32 },
      { dataField:'num_valori', labelField:'attributo_descrizione', label:'Valori', backgroundColor:'#8b5cf6', maxBarThickness:32 }
    ], dataProperty:'dato', stacked:false, indexAxis:'x', cutOffCount:8 } } },
  'vw_var_kpi_ranking': { d:'Varianti — ranking per stock', l:'Top 20 varianti per valore stock.', c: null },
  'vw_mag_storico_totali': { d:'Magazzino storico — KPI mese', l:'Single-row con totali movimenti ultimi 30 giorni.', c: null },
  'vw_mag_storico_giorn': { d:'Magazzino storico — giornaliero', l:'Andamento giornaliero carichi/scarichi/rettifiche ultimi 30 giorni.', c:
    { type:'line', dataOptions: { datasets: [
      { dataField:'carichi', labelField:'etichetta', label:'Carichi', backgroundColor:'#22c55e', borderColor:'#22c55e' },
      { dataField:'scarichi', labelField:'etichetta', label:'Scarichi', backgroundColor:'#ef4444', borderColor:'#ef4444' },
      { dataField:'rettifiche', labelField:'etichetta', label:'Rettifiche', backgroundColor:'#f59e0b', borderColor:'#f59e0b' }
    ], dataProperty:'dato', cutOffCount:30 } } },
  'vw_mag_storico_recenti': { d:'Magazzino storico — ultimi movimenti', l:'Ultimi 20 movimenti per dettaglio.', c: null }
};

for (const [v, cfg] of Object.entries(VIEWS_CFG)) {
  await scaffoldView(v, cfg.d, cfg.l, cfg.c);
}

// === LABEL FRIENDLY COLONNE ===
const COL_LABELS = {
  // mag_kpi_totali
  valore_stock_totale:'Valore stock totale', prodotti_sotto_scorta:'Sotto scorta', movimenti_settimana:'Movimenti settimana',
  magazzini_attivi:'Magazzini attivi', stato_scorta:'Stato',
  // mag_kpi_dettaglio
  prodotto_codice:'Codice prodotto', prodotto_descrizione:'Prodotto', magazzino_codice:'Magazzino',
  quantita_disponibile:'Disponibile', quantita_riservata:'Riservata', quantita_libera:'Libera',
  livello_riordino:'Soglia riordino', costo_medio:'Costo medio', valore_giacenza:'Valore giacenza',
  // var_kpi_totali
  varianti_attive:'Varianti attive', prodotti_con_varianti:'Prodotti con varianti',
  attributi_configurati:'Attributi configurati', valori_configurati:'Valori configurati',
  // var_kpi_per_attr
  attributo_codice:'Codice attributo', attributo_descrizione:'Attributo',
  num_varianti:'N. varianti', num_valori:'N. valori',
  // var_kpi_ranking
  sku:'SKU', variante_descrizione:'Descrizione variante',
  prezzo_vendita:'Prezzo vendita', stock_totale:'Stock totale', valore_stock:'Valore stock',
  // mag_storico_totali
  carichi_mese:'Carichi mese', scarichi_mese:'Scarichi mese', rettifiche_mese:'Rettifiche mese',
  movimenti_totali_mese:'Movimenti totali', valore_carichi_mese:'Valore carichi mese',
  // mag_storico_giorn
  giorno:'Giorno', etichetta:'Data', carichi:'Carichi', scarichi:'Scarichi', rettifiche:'Rettifiche',
  // mag_storico_recenti
  data_movimento:'Data', tipo_movimento:'Tipo', quantita:'Quantita', prezzo_unitario:'Prezzo unitario',
  valore_movimento:'Valore', causale:'Causale',
  // generic
  id:'ID'
};

const md_ids_all = {};
for (const v of Object.keys(VIEWS_CFG)) md_ids_all[v] = await getMdId(v);

for (const md_id of Object.values(md_ids_all)) {
  for (const [colName, label] of Object.entries(COL_LABELS)) {
    await execMeta(`UPDATE dbo._metadati__colonne SET mc_display_string_in_view=N'${label.replace(/'/g, "''")}', mc_display_string_in_edit=N'${label.replace(/'/g, "''")}' WHERE md_id=${md_id} AND mc_nome_colonna='${colName}'`);
  }
  // hide tech columns
  await execMeta(`UPDATE dbo._metadati__colonne SET mchideinlist=1 WHERE md_id=${md_id} AND mc_nome_colonna IN ('id','giorno','tipo_movimento','attributo_codice')`);
}
console.log('Label friendly applicate.');

// === HELPERS BOARDCONTENT ===
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

const tmCache = {}, cmCache = {};
async function ensureMetaInfo(route) {
  if (tmCache[route]) return;
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

let rawTpl = readFileSync(TPL_PATH, 'utf8');
if (rawTpl.charCodeAt(0) === 0xFEFF) rawTpl = rawTpl.slice(1);
const TPL = JSON.parse(rawTpl);

const fmtEur = `function(n){return Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' €';}`;
const fmtNum = `function(n){return Number(n||0).toLocaleString('it-IT');}`;

async function buildBoard(opts) {
  const { boardRoute, boardTitle, boardDesc, kpiTiles, chartRoute, chartTitle, tableRoute, tableTitle } = opts;
  console.log(`\n========== BUILD ${boardRoute} ==========`);
  await ensureMetaInfo(chartRoute);
  await ensureMetaInfo(tableRoute);
  for (const t of kpiTiles) await ensureMetaInfo(t.ds_route);

  // patch uniqueNames in template
  const suff = '_' + boardRoute.replace(/[^a-z0-9]/gi, '').slice(0, 6) + '_' + Math.random().toString(36).slice(2, 6);
  const tplPatched = JSON.parse(JSON.stringify(TPL));
  function patchUN(node) {
    if (!node) return;
    if (node.inputs?.uniqueName) node.inputs.uniqueName += suff;
    if (node.uniqueName) node.uniqueName += suff;
    if (node.inputs?.datasource?.uniqueName) node.inputs.datasource.uniqueName += suff;
    if (Array.isArray(node.nestedComponents)) node.nestedComponents.forEach(patchUN);
  }
  tplPatched.forEach(patchUN);

  const root = tplPatched[0];
  const titleSpan = root.nestedComponents[0].nestedComponents[0].nestedComponents[0];
  titleSpan.inputs.innerText = boardTitle;

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
    td.inputs.flex = '1 1 0'; td.inputs.width = 'auto'; td.inputs.maxWidth = 'none';
    const div = td.nestedComponents[0];
    div.inputs.height = '100%'; div.inputs.minHeight = 'auto'; div.inputs.padding = '12px';
    const spanTitle = div.nestedComponents[0];
    const ds = div.nestedComponents[1];
    const spanValue = JSON.parse(JSON.stringify(spanTitle));
    if (spanValue.inputs?.uniqueName) spanValue.inputs.uniqueName += '_VALUE';
    if (spanValue.uniqueName) spanValue.uniqueName += '_VALUE';
    div.nestedComponents[2] = spanValue;
    spanTitle.inputs.innerText = labelText;
    spanTitle.inputs.fontSize = '12px'; spanTitle.inputs.color = '#6b7280'; spanTitle.inputs.fontWeight = '500';
    ds.inputs.route = ds_route; ds.inputs.autoload = true;
    if (cmCache[ds_route]?.length && ds.inputs.metaInfo) ds.inputs.metaInfo.columnMetadata = cmCache[ds_route];
    if (ds.inputs.metaInfo?.tableMetadata) Object.assign(ds.inputs.metaInfo.tableMetadata, buildTableMetadata(ds_route));
    spanValue.inputs.datasource = { uniqueName: ds.inputs.uniqueName || ds.uniqueName };
    spanValue.inputs.bindingFunction = bindingBody;
    spanValue.inputs.fontSize = '24px'; spanValue.inputs.fontWeight = '700';
    if (color) spanValue.inputs.color = color;
    spanValue.inputs.innerText = '...';
    uniquify(td);
    return td;
  }
  function makeWideWidget({ titleText, ds_route, action, colspan, height, fillResidual }) {
    const td = cloneTd();
    if (colspan && colspan > 1) td.inputs.colSpan = String(colspan);
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
    ds.inputs.route = ds_route; ds.inputs.autoload = true;
    if (cmCache[ds_route]?.length && ds.inputs.metaInfo) ds.inputs.metaInfo.columnMetadata = cmCache[ds_route];
    if (ds.inputs.metaInfo?.tableMetadata) Object.assign(ds.inputs.metaInfo.tableMetadata, buildTableMetadata(ds_route));
    dr.inputs.action = action;
    uniquify(td);
    return td;
  }

  const kpiTds = kpiTiles.map(t => makeKpiTile(t));
  const chartW = makeWideWidget({ titleText: chartTitle, ds_route: chartRoute, action: 'chart', colspan: 4 });
  const tableW = makeWideWidget({ titleText: tableTitle, ds_route: tableRoute, action: 'list', colspan: 4, fillResidual: true });

  const tr1 = JSON.parse(JSON.stringify(root.nestedComponents[0]));
  tr1.nestedComponents[0].inputs.colSpan = '4';
  uniquify(tr1);
  const tr2 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr2.nestedComponents = kpiTds; if (tr2.uniqueName) tr2.uniqueName += '_tr2'; if (tr2.inputs?.uniqueName) tr2.inputs.uniqueName += '_tr2';
  const tr3 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr3.nestedComponents = [chartW]; if (tr3.uniqueName) tr3.uniqueName += '_tr3'; if (tr3.inputs?.uniqueName) tr3.inputs.uniqueName += '_tr3';
  const tr4 = JSON.parse(JSON.stringify(root.nestedComponents[1])); tr4.nestedComponents = [tableW]; if (tr4.uniqueName) tr4.uniqueName += '_tr4'; if (tr4.inputs?.uniqueName) tr4.inputs.uniqueName += '_tr4';
  root.nestedComponents = [tr1, tr2, tr3, tr4];

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
  console.log(`  boardcontent built: ${json.length} chars`);
  const tmpFile = `C:/Users/lollo/AppData/Local/Temp/board-${boardRoute}.json`;
  writeFileSync(tmpFile, json, 'utf8');

  const ps = `
$json = [System.IO.File]::ReadAllText('${tmpFile.replace(/\//g, '\\\\')}', [System.Text.UTF8Encoding]::new($false))
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open()
$cmd = $cn.CreateCommand()
$cmd.CommandText = "IF EXISTS (SELECT 1 FROM dbo.dom_board WHERE boardroute='${boardRoute}') UPDATE dbo.dom_board SET boardcontent=@bc, boarddes=@desc WHERE boardroute='${boardRoute}' ELSE INSERT INTO dbo.dom_board (boardroute, boarddes, boardcontent) VALUES ('${boardRoute}', @desc, @bc)"
$p = $cmd.Parameters.Add('@bc', [System.Data.SqlDbType]::NVarChar, -1); $p.Value = $json
$pd = $cmd.Parameters.Add('@desc', [System.Data.SqlDbType]::NVarChar, 200); $pd.Value = '${boardDesc.replace(/'/g, "''")}'
$cmd.ExecuteNonQuery() | Out-Null
$cn.Close()
Write-Host "OK"
`;
  execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', stdio: 'inherit' });
  console.log(`  ✓ ${boardRoute} saved.`);
}

// === DASHBOARD 1: magazzino_kpi ===
await buildBoard({
  boardRoute: 'magazzino_kpi',
  boardTitle: 'Magazzino — KPI Overview',
  boardDesc: '4 KPI tile (valore stock / sotto-scorta / movimenti settimana / magazzini attivi) + horizontal stacked bar prodotti sotto-scorta + tabella dettaglio.',
  kpiTiles: [
    { labelText: 'Valore stock totale', ds_route: 'vw_mag_kpi_totali',
      bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.valore_stock_totale) : '...';`, color: '#0f172a' },
    { labelText: 'Prodotti sotto scorta', ds_route: 'vw_mag_kpi_totali',
      bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} var n=Number(r.prodotti_sotto_scorta||0); inputs.innerText = String(n); inputs.color = n===0?'#16a34a':(n<=5?'#f59e0b':'#dc2626');`, color: '#0f172a' },
    { labelText: 'Movimenti settimana', ds_route: 'vw_mag_kpi_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.movimenti_settimana) : '...';`, color: '#0f172a' },
    { labelText: 'Stato approvvigionamento', ds_route: 'vw_mag_kpi_totali',
      bindingBody: `var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; if(!r){inputs.innerText='...';return;} var s=String(r.stato_scorta||'?'); inputs.innerText = s; inputs.backgroundColor = s==='CRITICO'?'#fee2e2':(s==='ATTENZIONE'?'#fef3c7':'#dcfce7'); inputs.color = s==='CRITICO'?'#991b1b':(s==='ATTENZIONE'?'#92400e':'#166534');`, color: '#0f172a' }
  ],
  chartRoute: 'vw_mag_kpi_dettaglio',
  chartTitle: 'Top 10 prodotti sotto-scorta',
  tableRoute: 'vw_mag_kpi_dettaglio',
  tableTitle: 'Dettaglio giacenze critiche'
});

// === DASHBOARD 2: varianti_kpi ===
await buildBoard({
  boardRoute: 'varianti_kpi',
  boardTitle: 'Varianti — Catalogo',
  boardDesc: '4 KPI tile (varianti / prodotti con varianti / attributi / valori) + bar chart per attributo + tabella ranking varianti.',
  kpiTiles: [
    { labelText: 'Varianti attive', ds_route: 'vw_var_kpi_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.varianti_attive) : '...';`, color: '#3b82f6' },
    { labelText: 'Prodotti con varianti', ds_route: 'vw_var_kpi_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.prodotti_con_varianti) : '...';`, color: '#0f172a' },
    { labelText: 'Attributi configurati', ds_route: 'vw_var_kpi_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.attributi_configurati) : '...';`, color: '#8b5cf6' },
    { labelText: 'Valori configurati', ds_route: 'vw_var_kpi_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.valori_configurati) : '...';`, color: '#6366f1' }
  ],
  chartRoute: 'vw_var_kpi_per_attr',
  chartTitle: 'Distribuzione varianti per attributo',
  tableRoute: 'vw_var_kpi_ranking',
  tableTitle: 'Top 20 varianti per valore stock'
});

// === DASHBOARD 3: magazzino_storico ===
await buildBoard({
  boardRoute: 'magazzino_storico',
  boardTitle: 'Magazzino — Storico Movimenti',
  boardDesc: '4 KPI tile (carichi / scarichi / rettifiche / valore carichi) + line chart 30gg + tabella ultimi movimenti.',
  kpiTiles: [
    { labelText: 'Carichi mese', ds_route: 'vw_mag_storico_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.carichi_mese) : '...';`, color: '#16a34a' },
    { labelText: 'Scarichi mese', ds_route: 'vw_mag_storico_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.scarichi_mese) : '...';`, color: '#dc2626' },
    { labelText: 'Rettifiche mese', ds_route: 'vw_mag_storico_totali',
      bindingBody: `var fmt=${fmtNum}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.rettifiche_mese) : '...';`, color: '#f59e0b' },
    { labelText: 'Valore carichi', ds_route: 'vw_mag_storico_totali',
      bindingBody: `var fmt=${fmtEur}; var r=resultInfo&&resultInfo.dato&&resultInfo.dato[0]; inputs.innerText = r ? fmt(r.valore_carichi_mese) : '...';`, color: '#0f172a' }
  ],
  chartRoute: 'vw_mag_storico_giorn',
  chartTitle: 'Andamento giornaliero (ultimi 30 gg)',
  tableRoute: 'vw_mag_storico_recenti',
  tableTitle: 'Ultimi movimenti'
});

await api.invalidateMetadataRuntime();
await api.dispose();
console.log('\n========== DONE ==========');
console.log('  http://localhost:4202/#/magazzino_kpi/dashboard');
console.log('  http://localhost:4202/#/varianti_kpi/dashboard');
console.log('  http://localhost:4202/#/magazzino_storico/dashboard');
