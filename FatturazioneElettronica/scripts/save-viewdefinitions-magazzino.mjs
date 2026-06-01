/**
 * Per ognuna delle 8 viste scaffoldate (modulo Varianti/Magazzino), crea una
 * ViewDefinition minimale (single-table block che riferisce la view stessa)
 * e la salva via `MetaService.savePivotConfiguration`, linking
 *   route_name → vista scaffoldata
 *   md_id      → _metadati__tabelle.md_id della stessa
 *
 * Questo collega ogni vista scaffoldata a una configurazione del View Builder
 * apribile/modificabile dal pivot-builder (`/pivot-builder/edit`).
 *
 * Trigger: estensione del workflow dashboard-replicate-custom-ui (skill).
 * Persistence: tabella `_metadati__pivot` (chiavi `route_name`, `pivot_name`).
 */
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
const execFile = promisify(execFileCb);

const BACKEND = 'http://localhost:5100';
const META_DB = 'FatturazioneElettronica_Metadata';

async function sqlMeta(query) {
  const out = await execFile('sqlcmd', ['-S','localhost\\sqlexpress','-d',META_DB,'-U','sa','-P','superlamelauser','-C','-I','-W','-s','|','-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`], { maxBuffer: 10485760 });
  return out.stdout;
}
async function getTableRow(route) {
  const out = await sqlMeta(`SELECT TOP 1 md_id, md_nome_tabella, mdschemaname FROM dbo._metadati__tabelle WHERE mdroutename='${route}' ORDER BY md_id DESC`);
  const lines = out.split(/\r?\n/).filter(l => l.includes('|'));
  if (!lines.length) return null;
  // first row are headers, second row data
  const dataLine = lines.find(l => /^\d+\|/.test(l.trim()));
  if (!dataLine) return null;
  const [md_id, md_nome_tabella, mdschemaname] = dataLine.split('|').map(s => s.trim());
  return { md_id: Number(md_id), md_nome_tabella, mdschemaname: mdschemaname || 'dbo' };
}

// Mapping route → friendly name pivot
const VIEWS = [
  { route: 'vw_mag_kpi_totali',     pivotName: 'Magazzino - KPI totali' },
  { route: 'vw_mag_kpi_dettaglio',  pivotName: 'Magazzino - Dettaglio sotto-scorta' },
  { route: 'vw_var_kpi_totali',     pivotName: 'Varianti - KPI totali' },
  { route: 'vw_var_kpi_per_attr',   pivotName: 'Varianti - Distribuzione per attributo' },
  { route: 'vw_var_kpi_ranking',    pivotName: 'Varianti - Ranking per stock' },
  { route: 'vw_mag_storico_totali', pivotName: 'Magazzino storico - KPI mese' },
  { route: 'vw_mag_storico_giorn',  pivotName: 'Magazzino storico - Giornaliero 30gg' },
  { route: 'vw_mag_storico_recenti',pivotName: 'Magazzino storico - Ultimi movimenti' }
];

const api = await createBackendApiClient({ backendBaseUrl: BACKEND, user: 'admin', password: 'admin' });

/**
 * Costruisce una ViewDefinition single-table per una vista esistente.
 * Replica esattamente la shape attesa dal frontend `pivot-builder` (Tab 1
 * "View Builder"): 1 nodo canvas con la vista come tabella sorgente,
 * tutte le colonne selected=true, nessun JOIN, nessuna aggregazione esplicita
 * (la vista contiene gia' la sua logica di aggregazione in SQL).
 */
function buildViewDefinition(route, md_id, tableName, schemaName, columnMetadata) {
  const tableAlias = 't0';
  const columns = (columnMetadata || []).map(c => {
    const alias = c.mc_nome_colonna || c.alias || c.columnName || '';
    const realName = c.mc_real_column_name || c.realName || alias;
    const label = c.mc_display_string_in_view || c.label || alias;
    const dbType = c.mc_db_column_type || c.dbType || '';
    const uiType = c.mc_ui_column_type || c.uiType || '';
    return {
      alias,
      realName,
      label,
      dbType,
      uiType,
      tableRoute: route,
      tableAlias,
      qualifiedLabel: `${tableAlias}.${alias}`,
      selected: true,
      virtual: false,
      showInFilters: c.mc_show_in_filters === true || c.showInFilters === true
    };
  });

  return {
    tables: [{
      nodeId: 'n0',
      route,
      mdId: md_id || null,
      tableName,
      schemaName: schemaName || 'dbo',
      caption: route,
      tableAlias,
      columns,
      x: 100,
      y: 100,
      collapsed: false
    }],
    joins: []
    // aggregations, groupByColumns, unionBlocks intenzionalmente omessi:
    // la vista SQL incarna gia' la logica completa.
  };
}

/**
 * Costruisce il payload `pivot_config_json` completo (shape attesa da
 * `buildPivotConfigPayload` lato Angular). Il pivot Tab 2 e' vuoto
 * (nessuna riconfigurazione pivot sulla vista; e' una "vista" non un
 * "pivot crosstab"), ma `viewDefinition` e' valorizzata.
 */
function buildPivotConfigPayload(pivotName, route, md_id, viewDef) {
  return {
    pivotName,
    routeName: route,
    mdId: md_id || null,
    rowColumns: [],
    rowColumnOptions: [],
    columnColumns: [],
    columnColumnOptions: [],
    valueColumns: [],
    valueColumn: '',
    aggregateFunction: 'SUM',
    topRows: 0,
    valueDefinitions: [],
    filterInfo: null,
    sortInfo: [],
    viewDefinition: viewDef,
    // Tracking opzionale del fatto che questa configurazione corrisponde
    // a una view fisica esistente nel DB Dati.
    pivotCreatedName: route,
    pivotCreatedRoute: route,
    pivotCreatedKind: 'view'
  };
}

let saved = 0;
let skipped = 0;
for (const { route, pivotName } of VIEWS) {
  console.log(`\n=== ${route} → ${pivotName} ===`);

  // Fetch table info via SQL diretto (slim response from getTableMetadata doesn't
  // include tableMetadata block — solo columnMetadata + defaults).
  const tabRow = await getTableRow(route);
  if (!tabRow) {
    console.log(`  ✗ _metadati__tabelle row non trovata, skip`);
    skipped++;
    continue;
  }
  const md_id = tabRow.md_id;
  const tableName = tabRow.md_nome_tabella;
  const schemaName = tabRow.mdschemaname || 'dbo';

  // ColumnMetadata via API (autoritativa per le label friendly applicate).
  const tm = await api.call('MetaService.getTableMetadata', { route });
  const cm = Array.isArray(tm?.columnMetadata) ? tm.columnMetadata : [];
  cm.forEach(c => { delete c.extraProps; });

  const viewDef = buildViewDefinition(route, md_id, tableName, schemaName, cm);
  const payload = buildPivotConfigPayload(pivotName, route, md_id, viewDef);

  // SQL: SELECT <colonne> FROM dbo.<viewName>
  const colList = cm.map(c => `${c.mc_nome_colonna || c.alias}`).filter(Boolean);
  const sqlText = colList.length
    ? `SELECT ${colList.join(', ')} FROM ${schemaName}.${tableName}`
    : `SELECT * FROM ${schemaName}.${tableName}`;

  const res = await api.call('MetaService.savePivotConfiguration', {
    route,
    md_id,
    pivot_config_json: JSON.stringify(payload),
    sql_text: sqlText,
    pivot_name: pivotName
  });
  let parsed;
  try { parsed = typeof res === 'string' ? JSON.parse(res) : res; } catch { parsed = res; }
  if (parsed && (parsed.ok === true || parsed.id1)) {
    console.log(`  ✓ saved (id1=${parsed.id1 || '?'}, md_id=${md_id}, columns=${cm.length})`);
    saved++;
  } else {
    console.log(`  ✗ response: ${JSON.stringify(parsed)?.slice(0, 200)}`);
    skipped++;
  }
}

await api.dispose();

console.log(`\n========== DONE ==========`);
console.log(`  ViewDefinition salvate: ${saved}/${VIEWS.length}`);
console.log(`  Skipped: ${skipped}`);
console.log(`  Lista pivot per route via UI: pivot-builder, Open → cerca per nome o per route.`);
