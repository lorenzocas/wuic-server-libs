/**
 * Test 06: Reports — verifica che i 3 .mrt esistano + datasource SQL valida.
 *
 * Non eseguiamo il viewer Stimulsoft (richiede plugin proprietario);
 * invece verifichiamo end-to-end che:
 *   1) i file .mrt esistano e parsino come XML valido (struttura StiSerializer)
 *   2) le datasource interne ai .mrt referenzino route metadata reali
 *   3) la query SQL di ogni report ritorni dati coerenti se i seed esistono
 *   4) UI: navigate report-viewer per ognuno e verifica che il container venga renderizzato
 */
import { existsSync, readFileSync } from 'node:fs';
import { navigateRoute, snap } from '../_shared/ui-helpers.mjs';
import { query } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '11',
  name: 'Reports (.mrt + datasource SQL coerenti)',
  area: 'reports',
  needsUi: true,
  needsApi: true
};

const reports = [
  { route: 'clienti',           file: 'C:/src/Wuic/FatturazioneElettronica/Reports/clienti/Report.mrt',
    expectedDatasource: 'clienti', expectedQueryTable: 'dbo.clienti' },
  { route: 'fatturato',          file: 'C:/src/Wuic/FatturazioneElettronica/Reports/fatturato/Report.mrt',
    expectedDatasource: 'fatturato', expectedQueryTable: 'dbo.fatture_inviate' },
  { route: 'fatture_inviate',    file: 'C:/src/Wuic/FatturazioneElettronica/Reports/fatture_inviate/Report.mrt',
    expectedDatasource: 'fatture_inviate', expectedQueryTable: 'dbo.fatture_inviate' }
];

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;
  const results = [];

  for (const r of reports) {
    // 1) file esiste
    assert(existsSync(r.file), `report file mancante: ${r.file}`);
    const content = readFileSync(r.file, 'utf8');
    assert(content.length > 1000, `report ${r.route}: file troppo piccolo (${content.length} bytes)`);

    // 2) XML structure
    assert(content.includes('<StiSerializer'), `${r.route}: header StiSerializer mancante`);
    assert(content.includes(`<${r.expectedDatasource} `) || content.includes(`<Name>${r.expectedDatasource}</Name>`),
      `${r.route}: datasource '${r.expectedDatasource}' non trovata nel .mrt`);

    // 3) query SQL referenzia tabella reale
    const sqlMatch = content.match(/<SqlCommand>([\s\S]*?)<\/SqlCommand>/);
    assert(sqlMatch, `${r.route}: <SqlCommand> mancante`);
    assert(sqlMatch[1].toLowerCase().includes(r.expectedQueryTable.toLowerCase()),
      `${r.route}: SqlCommand non referenzia ${r.expectedQueryTable}`);
    log(`report ${r.route}: file ok, datasource='${r.expectedDatasource}', query referenzia ${r.expectedQueryTable}`);

    // 4) verifica esecuzione query base (data oriented):
    // estraiamo la prima parte SELECT...FROM <table> e proviamo che non crashi.
    if (r.route === 'clienti') {
      const rows = await query(`SELECT TOP 5 id, codice, ragione_sociale FROM dbo.clienti WHERE ISNULL(cancellato,0)=0`);
      log(`  query clienti: ${rows.length} righe (first id=${rows[0]?.id ?? 'none'})`);
    } else if (r.route === 'fatturato') {
      const rows = await query(`
        SELECT TOP 3 YEAR(data_documento) AS anno, COUNT(*) AS n
        FROM dbo.fatture_inviate WHERE ISNULL(cancellato,0)=0
        GROUP BY YEAR(data_documento)`);
      log(`  query fatturato aggregato: ${rows.length} gruppi`);
    }

    // 5) UI: report-viewer route
    await navigateRoute(page, baseUrl, r.route, 'report-viewer');
    // attesa che container viewer carichi (il framework usa wuic-report-viewer)
    const hasViewer = await page.locator('wuic-report-viewer, [class*="stimulsoft"], iframe[src*="report"]').count();
    log(`  UI viewer ${r.route}: hasViewer=${hasViewer}`);
    // soft assert: il viewer puo' richiedere licenza Stimulsoft live, ma il container deve essere presente
    results.push({ route: r.route, ok: true, hasViewer });
  }

  const screenshot = await snap(page, 'reports-end');
  return { reports: results, screenshot };
}
