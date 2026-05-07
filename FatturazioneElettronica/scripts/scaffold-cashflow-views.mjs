/**
 * Scaffold viste cashflow + chart archetype config (refactor framework-first #17).
 */
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const execFile = promisify(execFileCb);

const BACKEND = 'http://localhost:5100';
const DATA_CONN = 'Data Source=localhost\\sqlexpress;Initial Catalog=FatturazioneElettronica_Data;Integrated Security=False;Persist Security Info=True;User ID=sa;Password=superlamelauser;Encrypt=False;TrustServerCertificate=True';

async function execMeta(query) {
  const dir = mkdtempSync(join(tmpdir(), 'sqlmeta-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, `SET QUOTED_IDENTIFIER ON;\nSET ANSI_NULLS ON;\n${query}\n`, { encoding: 'utf8' });
  await execFile('sqlcmd', [
    '-S', 'localhost\\sqlexpress', '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser', '-C', '-I', '-f', '65001', '-i', file
  ], { maxBuffer: 10 * 1024 * 1024 });
}

async function sqlMeta(query) {
  const out = await execFile('sqlcmd', [
    '-S', 'localhost\\sqlexpress', '-d', 'FatturazioneElettronica_Metadata',
    '-U', 'sa', '-P', 'superlamelauser', '-C', '-I', '-W', '-s', '|',
    '-Q', `SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; ${query}`
  ], { maxBuffer: 10 * 1024 * 1024 });
  return out.stdout;
}

async function getMdId(viewName) {
  const out = await sqlMeta(`SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename='${viewName}' ORDER BY md_id DESC`);
  const lines = out.split(/\r?\n/).filter(l => /^\d+$/.test(l.trim()));
  return lines.length ? Number(lines[0].trim()) : null;
}

async function scaffoldView(api, view, displayString, longDescription, chartCfg) {
  console.log(`\n=== ${view} ===`);
  const res = await api.call('scaffolding.scaffoldView', {
    connection: DATA_CONN, connName: 'DataSQLConnection', db: 'FatturazioneElettronica_Data',
    view, createMenu: false, parentMenuId: 0
  });
  console.log(`  scaffoldView: ${JSON.stringify(res)?.slice(0, 100)}`);
  const md_id = await getMdId(view);
  console.log(`  md_id=${md_id}`);

  await execMeta(`UPDATE dbo._metadati__tabelle SET mm_display_string=N'${displayString.replace(/'/g, "''")}', mm_long_description=N'${longDescription.replace(/'/g, "''")}' WHERE md_id=${md_id}`);

  if (chartCfg) {
    const json = JSON.stringify({ archetypes: { chart: chartCfg } });
    await execMeta(`UPDATE dbo._metadati__tabelle SET mdpropsbag=N'${json.replace(/'/g, "''")}' WHERE md_id=${md_id}`);
    console.log(`  mdpropsbag.archetypes.chart configurato (type=${chartCfg.type})`);
  }
  return md_id;
}

const api = await createBackendApiClient({ backendBaseUrl: BACKEND, user: 'admin_test', password: 'Test123!' });
console.log(`✓ login ok`);

await scaffoldView(api, 'vw_cashflow_totali',
  'Cashflow forecast — KPI totali',
  'Single-row con i 4 KPI per le tile della dashboard cashflow forecast.',
  null);

await scaffoldView(api, 'vw_cashflow_giornaliero',
  'Cashflow forecast — saldo giornaliero',
  'Saldo per giorno con running total cumulativo. Chart line+bar.',
  {
    type: 'line',
    dataOptions: {
      datasets: [
        { dataField: 'saldo_cumulato', labelField: 'data_scadenza', label: 'Saldo cumulato',
          backgroundColor: 'rgba(59, 130, 246, 0.12)',
          borderColor: '#3b82f6', borderWidth: 2,
          pointRadius: 2, tension: 0.25 }
      ],
      dataProperty: 'dato',
      cutOffCount: 30
    }
  });

console.log('\nUpdate column labels...');
const COL_LABELS = {
  'incassi_attesi': 'Incassi attesi',
  'pagamenti_attesi': 'Pagamenti attesi',
  'saldo_finale': 'Saldo finale',
  'num_incassi': 'N. incassi',
  'num_pagamenti': 'N. pagamenti',
  'giorni_con_movimento': 'Giorni con movimento',
  'stato_saldo': 'Stato saldo',
  'data_scadenza': 'Data',
  'saldo_giorno': 'Saldo giornaliero',
  'saldo_cumulato': 'Saldo cumulato',
  'id': 'ID'
};
const md_ids = [await getMdId('vw_cashflow_totali'), await getMdId('vw_cashflow_giornaliero')];
for (const md_id of md_ids) {
  for (const [colName, label] of Object.entries(COL_LABELS)) {
    await execMeta(`UPDATE dbo._metadati__colonne SET mc_display_string_in_view=N'${label.replace(/'/g, "''")}', mc_display_string_in_edit=N'${label.replace(/'/g, "''")}' WHERE md_id=${md_id} AND mc_nome_colonna='${colName}'`);
  }
  await execMeta(`UPDATE dbo._metadati__colonne SET mchideinlist=1 WHERE md_id=${md_id} AND mc_nome_colonna IN ('id')`);
}
console.log(`  ${Object.keys(COL_LABELS).length} label friendly applicate`);

const inv = await api.invalidateMetadataRuntime();
console.log(`✓ invalidate ok`);
await api.dispose();
console.log('\n✓ DONE — 2 viste cashflow scaffolded.');
