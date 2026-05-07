/**
 * Scaffold delle 3 viste aging crediti + configura archetypes.chart su _buckets e _clienti.
 *
 * Pattern framework-first (POC refactor #19):
 *   - vw_aging_crediti_totali  → list archetype (1 row, KPI)
 *   - vw_aging_crediti_buckets → chart archetype: PIE chart distribuzione
 *   - vw_aging_crediti_clienti → chart archetype: BAR stacked + list (tabella)
 *
 * mdpropsbag pattern (verificato su vw_dash_*):
 *   { "archetypes": { "chart": { "type":"bar|pie|line",
 *     "dataOptions": { "datasets":[{ "dataField":"...", "labelField":"...", "label":"..." }],
 *                       "dataProperty":"dato" } } } }
 */
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCb);

const BACKEND = 'http://localhost:5100';
const DATA_CONN = 'Data Source=localhost\\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;Integrated Security=False;Persist Security Info=True;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True';

async function execMeta(query) {
  // Scriviamo lo SQL in un file temp + sqlcmd -i: cosi' le virgolette interne
  // (es. JSON nel mdpropsbag) non si scontrano col parsing CLI di -Q.
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'sqlmeta-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, `SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\n${query}\n`, { encoding: 'utf8' });
  const args = [
    '-S', 'localhost\\sqlexpress',
    '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I',
    '-f', '65001',  // codepage UTF-8
    '-i', file
  ];
  await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
}

async function sqlMeta(query) {
  const args = [
    '-S', 'localhost\\sqlexpress',
    '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser',
    '-C', '-I', '-W', '-s', '|',
    '-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`
  ];
  const { stdout } = await execFile('sqlcmd', args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function getMdId(viewName) {
  const out = await sqlMeta(`SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = '${viewName}' OR md_nome_tabella = '${viewName}' ORDER BY md_id DESC`);
  const lines = out.split(/\r?\n/).filter(l => /^\d+$/.test(l.trim()));
  return lines.length ? Number(lines[0].trim()) : null;
}

async function scaffoldView(api, view, displayString, longDescription, archetypesChart) {
  console.log(`\n=== ${view} ===`);
  // 1) scaffold
  const res = await api.call('scaffolding.scaffoldView', {
    connection: DATA_CONN, connName: 'DataSQLConnection', db: 'FatturazioneElettronica_Data',
    view, createMenu: false, parentMenuId: 0
  });
  console.log(`  scaffoldView: ${JSON.stringify(res)?.slice(0, 100)}`);

  // 2) md_id
  const md_id = await getMdId(view);
  if (!md_id) throw new Error(`md_id non trovato per ${view}`);
  console.log(`  md_id=${md_id}`);

  // 3) display + description
  const dispEsc = displayString.replace(/'/g, "''");
  const descEsc = longDescription.replace(/'/g, "''");
  await execMeta(`UPDATE dbo._metadati__tabelle SET mm_display_string=N'${dispEsc}', mm_long_description=N'${descEsc}' WHERE md_id=${md_id}`);

  // 4) archetypes.chart in mdpropsbag (se richiesto)
  if (archetypesChart) {
    const json = JSON.stringify({ archetypes: { chart: archetypesChart } });
    const jsonEsc = json.replace(/'/g, "''");
    await execMeta(`UPDATE dbo._metadati__tabelle SET mdpropsbag = N'${jsonEsc}' WHERE md_id=${md_id}`);
    console.log(`  mdpropsbag.archetypes.chart configurato (type=${archetypesChart.type})`);
  }
  return md_id;
}

async function main() {
  const api = await createBackendApiClient({ backendBaseUrl: BACKEND, user: 'admin_test', password: 'Test123!' });
  console.log(`✓ login ok`);

  // 1) vw_aging_crediti_totali — 1 riga KPI, archetype list (no chart needed, sara' bindato a SPAN nei tile)
  await scaffoldView(api, 'vw_aging_crediti_totali',
    'Aging crediti — KPI totali',
    'Single-row con i 4 KPI per le tile della dashboard aging crediti.',
    null);

  // 2) vw_aging_crediti_buckets — 5 righe, PIE chart distribuzione
  await scaffoldView(api, 'vw_aging_crediti_buckets',
    'Aging crediti — distribuzione per bucket',
    '5 righe (Non scaduto / 0-30 / 31-60 / 61-90 / >90 gg) con totale residuo per bucket. Pie chart.',
    {
      type: 'pie',
      dataOptions: {
        datasets: [{
          dataField: 'totale_residuo',
          labelField: 'bucket_label',
          label: 'Distribuzione esposizione per fascia eta'
        }],
        dataProperty: 'dato'
      }
    });

  // 3) vw_aging_crediti_clienti — N righe, stacked bar per cliente
  // NB: per stacked bar passo 5 datasets, uno per bucket.
  await scaffoldView(api, 'vw_aging_crediti_clienti',
    'Aging crediti — dettaglio per cliente',
    'Esposizione per cliente con breakdown sui 5 bucket eta. Stacked bar chart + tabella.',
    {
      type: 'bar',
      dataOptions: {
        datasets: [
          { dataField: 'non_scaduto',     labelField: 'cliente_ragione', label: 'Non scaduto',  backgroundColor: '#22c55e', maxBarThickness: 24 },
          { dataField: 'scaduto_0_30',    labelField: 'cliente_ragione', label: '0-30 giorni',  backgroundColor: '#fbbf24', maxBarThickness: 24 },
          { dataField: 'scaduto_31_60',   labelField: 'cliente_ragione', label: '31-60 giorni', backgroundColor: '#f97316', maxBarThickness: 24 },
          { dataField: 'scaduto_61_90',   labelField: 'cliente_ragione', label: '61-90 giorni', backgroundColor: '#ef4444', maxBarThickness: 24 },
          { dataField: 'scaduto_over_90', labelField: 'cliente_ragione', label: '> 90 giorni',  backgroundColor: '#7f1d1d', maxBarThickness: 24 }
        ],
        dataProperty: 'dato',
        stacked: true,
        indexAxis: 'y',
        cutOffCount: 10
      }
    });

  // Update label friendly per le colonne (le 3 viste insieme)
  console.log('\nUpdate column labels...');
  const COL_LABELS = {
    // totali
    'totale_esposizione': 'Totale esposizione',
    'totale_scaduto': 'Totale scaduto',
    'num_scadenze_totali': 'N. scadenze',
    'num_clienti_totali': 'N. clienti',
    'perc_scaduto_su_totale': '% scaduto',
    'rischio': 'Rischio',
    // buckets
    'bucket': 'Bucket',
    'bucket_label': 'Fascia',
    'num_scadenze': 'N. scadenze',
    'num_clienti': 'N. clienti',
    'totale_residuo': 'Totale residuo',
    'giorni_min': 'Giorni min',
    'giorni_max': 'Giorni max',
    // clienti
    'cliente_codice': 'Codice cliente',
    'cliente_ragione': 'Cliente',
    'non_scaduto': 'Non scaduto',
    'scaduto_0_30': '0-30 gg',
    'scaduto_31_60': '31-60 gg',
    'scaduto_61_90': '61-90 gg',
    'scaduto_over_90': '> 90 gg',
    'id': 'ID',
    'cliente_id': 'ID cliente'
  };
  const md_ids = [
    await getMdId('vw_aging_crediti_totali'),
    await getMdId('vw_aging_crediti_buckets'),
    await getMdId('vw_aging_crediti_clienti')
  ];
  for (const md_id of md_ids) {
    for (const [colName, label] of Object.entries(COL_LABELS)) {
      await execMeta(`
        UPDATE dbo._metadati__colonne
        SET mc_display_string_in_view = N'${label.replace(/'/g, "''")}',
            mc_display_string_in_edit = N'${label.replace(/'/g, "''")}'
        WHERE md_id = ${md_id} AND mc_nome_colonna = '${colName}';
      `);
    }
    // Hide ID columns su tutte e 3
    await execMeta(`UPDATE dbo._metadati__colonne SET mchideinlist=1 WHERE md_id=${md_id} AND mc_nome_colonna IN ('id','cliente_id','bucket')`);
  }
  console.log('  ' + Object.keys(COL_LABELS).length + ' label friendly applicate');

  // Invalidate
  const inv = await api.invalidateMetadataRuntime();
  console.log(`\n✓ invalidate ok (version=${inv?.projectMetadataVersion ?? 'N/A'})`);

  await api.dispose();
  console.log('\n✓ DONE — 3 viste aging crediti scaffolded + chart archetype configurato.');
}

main().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
