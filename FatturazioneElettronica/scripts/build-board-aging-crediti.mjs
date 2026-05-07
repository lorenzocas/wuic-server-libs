/**
 * Build dashboard `aging_crediti` per FE clonando il template 2x2-grid-with-charts
 * della skill dashboard-boardcontent. Layout 2x2 con:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  Aging analysis crediti  (title)        │
 *   ├──────────────────┬──────────────────────┤
 *   │ KPI overview     │ Distribuzione bucket │
 *   │ (totali, list)   │ (buckets, chart pie) │
 *   ├──────────────────┼──────────────────────┤
 *   │ Esposizione cli  │ Dettaglio clienti    │
 *   │ (clienti, chart  │ (clienti, list)      │
 *   │  stacked bar)    │                      │
 *   └──────────────────┴──────────────────────┘
 *
 * Tile mapping:
 *  W1 (list):  vw_aging_crediti_totali  → "Riepilogo KPI"
 *  W2 (chart): vw_aging_crediti_buckets → "Distribuzione esposizione" (pie)
 *  W3 (chart): vw_aging_crediti_clienti → "Esposizione per cliente" (stacked bar)
 *  W4 (list):  vw_aging_crediti_clienti → "Dettaglio clienti"
 *
 * Template source: skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json
 *  - 1 TR title (SPAN)
 *  - 2 TR data (4 TD widgets, each with DIV > SPAN+DATASOURCE+DATAREPEATER)
 *  - hand-crafting boardcontent dichiarativo non funziona (skill warning):
 *    cloniamo il template e sostituiamo SOLO inputs.route + uniqueName +
 *    metaInfo.tableMetadata + metaInfo.columnMetadata + inputs.action.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

const BOARD_ROUTE = 'aging_crediti';
const BOARD_TITLE = 'Aging analysis crediti';
const BOARD_DESC = 'Distribuzione crediti per fascia eta + dettaglio per cliente. Dashboard framework con 4 widget bindati a viste SQL aging_crediti_*';

// Mappatura widget: 4 tile in ordine (W1..W4) corrispondono ai 4 TD del template 2x2.
const TILES = [
  { route: 'vw_aging_crediti_totali',  title: 'Riepilogo KPI',           action: 'list'  },
  { route: 'vw_aging_crediti_buckets', title: 'Distribuzione esposizione', action: 'chart' },
  { route: 'vw_aging_crediti_clienti', title: 'Esposizione per cliente',  action: 'chart' },
  { route: 'vw_aging_crediti_clienti', title: 'Dettaglio clienti',        action: 'list'  }
];

const TPL_PATH = 'C:/src/Wuic/KonvergenceCore/skills/dashboard-boardcontent/templates/2x2-grid-with-charts.template.json';
const META_DB = 'FatturazioneElettronica_Metadata';
const META_CONN = `Server=localhost\\sqlexpress;Database=${META_DB};Integrated Security=False;User ID=sa;Password=superlamelauser;TrustServerCertificate=True`;

let raw = readFileSync(TPL_PATH, 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const tpl = JSON.parse(raw);

// Pre-fetch metaInfo per ogni route
const apiPre = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });

function fetchTableRow(route) {
  const ps = `
$cn = New-Object System.Data.SqlClient.SqlConnection '${META_CONN}'
$cn.Open(); $cmd = $cn.CreateCommand()
$cmd.CommandText = 'SELECT md_id, md_nome_tabella, mdroutename, mdschemaname, mdconnname, mddbname, mdpropsbag, mm_display_string, mm_long_description FROM dbo._metadati__tabelle WHERE mdroutename = @route'
$p = $cmd.Parameters.Add('@route', [System.Data.SqlDbType]::NVarChar, 200); $p.Value = '${route}'
$r = $cmd.ExecuteReader()
$o = @{}
if ($r.Read()) {
  for ($i=0; $i -lt $r.FieldCount; $i++) {
    $name = $r.GetName($i); $v = $r.GetValue($i)
    if ($v -is [DBNull]) { $v = $null }
    $o[$name] = $v
  }
}
$cn.Close()
$o | ConvertTo-Json -Depth 4 -Compress
`;
  const out = execFileSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 5*1024*1024 });
  return JSON.parse(out.trim() || '{}');
}

const tmCache = {};
const cmCache = {};
const uniqueRoutes = [...new Set(TILES.map(t => t.route))];
for (const route of uniqueRoutes) {
  try {
    const tm = await apiPre.call('MetaService.getTableMetadata', { route });
    const cm = Array.isArray(tm?.columnMetadata) ? tm.columnMetadata : [];
    cm.forEach(c => { delete c.extraProps; });
    cmCache[route] = cm;

    const tabRow = fetchTableRow(route);
    if (typeof tabRow.mdpropsbag === 'string') {
      try { tabRow.md_props_bag = JSON.parse(tabRow.mdpropsbag); } catch { tabRow.md_props_bag = {}; }
      delete tabRow.mdpropsbag;
    } else if (tabRow.mdpropsbag) {
      tabRow.md_props_bag = tabRow.mdpropsbag;
      delete tabRow.mdpropsbag;
    }
    tmCache[route] = tabRow;
    console.log(`metaInfo[${route}]: md_id=${tabRow.md_id}, cols=${cm.length}, hasChart=${!!tabRow.md_props_bag?.archetypes?.chart}`);
  } catch (e) {
    console.log(`metaInfo[${route}] FAIL: ${e.message?.slice(0, 100)}`);
    cmCache[route] = []; tmCache[route] = {};
  }
}
await apiPre.dispose();

// Deep clone template
const out = JSON.parse(JSON.stringify(tpl));

// Update title
const titleSpan = out[0].nestedComponents[0].nestedComponents[0].nestedComponents[0];
titleSpan.inputs.innerText = BOARD_TITLE;

// Random suffix per uniqueName affinche' siano univoci tra board diverse
// (evita collisioni con la home FE che usa lo stesso template). DEVE essere
// applicato anche ai REFERENCE uniqueName dentro inputs (DATAREPEATER →
// inputs.datasource.uniqueName referenzia il DATASOURCE; senza patch dei
// reference il binding rompe a runtime, widget vuoti).
const uniqueSuffix = '_ag_' + Math.random().toString(36).slice(2, 8);

function patchUniqueName(node) {
  if (!node) return;
  if (node.inputs?.uniqueName) node.inputs.uniqueName = String(node.inputs.uniqueName) + uniqueSuffix;
  if (node.uniqueName) node.uniqueName = String(node.uniqueName) + uniqueSuffix;
  // Patch dei reference: inputs.datasource.uniqueName (e fratelli) deve
  // matchare il NUOVO uniqueName del DATASOURCE target.
  if (node.inputs?.datasource?.uniqueName) {
    node.inputs.datasource.uniqueName = String(node.inputs.datasource.uniqueName) + uniqueSuffix;
  }
  if (node.inputs?.parentDatasource?.uniqueName) {
    node.inputs.parentDatasource.uniqueName = String(node.inputs.parentDatasource.uniqueName) + uniqueSuffix;
  }
  if (Array.isArray(node.nestedComponents)) node.nestedComponents.forEach(patchUniqueName);
}
out.forEach(patchUniqueName);

// Patch dei 4 widget tile
let widgetIdx = 0;
for (let tr = 1; tr <= 2; tr++) {
  const tdCells = out[0].nestedComponents[tr].nestedComponents;
  for (const td of tdCells) {
    const div = td.nestedComponents[0];
    const spanTitle = div.nestedComponents[0];
    const ds = div.nestedComponents[1];
    const dr = div.nestedComponents[2];

    const tile = TILES[widgetIdx];
    if (!tile) continue;

    spanTitle.inputs.innerText = tile.title;
    ds.inputs.route = tile.route;

    // ITER 1 PROOF-OF-CONCEPT: per il W1 (Riepilogo KPI), collego il SPAN title
    // al DATASOURCE via bindingFunction per verificare che il binding funzioni
    // davvero. Se ok, scalo a 4 SPAN separati per i 4 KPI distinti.
    if (widgetIdx === 0) {
      // Punta SPAN al DATASOURCE del widget 1 (stesso uniqueName + suffix)
      spanTitle.inputs.datasource = { uniqueName: ds.inputs.uniqueName || ds.uniqueName };
      // bindingFunction: legge il primo record del datasource e popola innerText
      // con un riassunto formattato. Body eseguito via new Function('resultInfo, metaInfo, inputs, wtoolbox', body).
      spanTitle.inputs.bindingFunction = `
        var row = resultInfo && resultInfo.dato && resultInfo.dato[0];
        if (!row) { inputs.innerText = 'Riepilogo KPI'; return; }
        var fmt = function(n){ return Number(n||0).toLocaleString('it-IT', {minimumFractionDigits:0, maximumFractionDigits:0}); };
        inputs.innerText = 'Esposizione ' + fmt(row.totale_esposizione) + ' € | Scaduto ' + fmt(row.totale_scaduto) + ' € | ' + Number(row.perc_scaduto_su_totale||0).toFixed(2) + '% — RISCHIO ' + (row.rischio||'?');
      `;
    }

    if (cmCache[tile.route]?.length && ds.inputs.metaInfo) {
      ds.inputs.metaInfo.columnMetadata = cmCache[tile.route];
    }
    if (ds.inputs.metaInfo?.tableMetadata && tmCache[tile.route]) {
      const tab = tmCache[tile.route];
      Object.assign(ds.inputs.metaInfo.tableMetadata, {
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
      });
    }

    dr.inputs.action = tile.action;

    console.log(`  W${widgetIdx+1}: ${tile.route} (${dr.inputs.action}) — ${tile.title}`);
    widgetIdx++;
  }
}

const json = JSON.stringify(out);
console.log(`boardcontent built: ${json.length} chars`);
writeFileSync('C:/Users/lollo/AppData/Local/Temp/aging-crediti-board.json', json, 'utf8');

// UPSERT su dom_board
const ps = `
$json = [System.IO.File]::ReadAllText('C:\\Users\\lollo\\AppData\\Local\\Temp\\aging-crediti-board.json', [System.Text.UTF8Encoding]::new($false))
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
const v = await api2.invalidateMetadataRuntime();
console.log('new metadata version:', v?.projectMetadataVersion ?? 'OK');
await api2.dispose();
console.log(`\n✓ Dashboard built. URL: http://localhost:4202/#/${BOARD_ROUTE}/list`);
