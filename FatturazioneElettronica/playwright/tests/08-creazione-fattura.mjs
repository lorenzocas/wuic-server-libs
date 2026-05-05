/**
 * Test 03: Creazione fattura inviata end-to-end.
 *
 * Step:
 *   1) Crea cliente di test via API
 *   2) UI: navigate fatture_inviate/list
 *   3) Insert testata fattura via API (UI complessa con popup riga richiede
 *      conoscenza specifica del designer dell'app, che in dev e' minimale)
 *   4) Insert riga via API
 *   5) Verifica TRIGGER ricalcolo totali (tr_fatture_inviate_righe_totali):
 *      imponibile + iva + totale popolati correttamente sulla testata
 *   6) Verifica TRIGGER numerazione (tr_fatture_inviate_numerazione):
 *      anno+progressivo+numero composto secondo il pattern
 *   7) UI: verifica che la fattura compaia nella list-grid
 *   8) Cleanup
 */
import { navigateRoute, findRowByText, snap } from '../_shared/ui-helpers.mjs';
import { queryOne } from '../_shared/sql-helpers.mjs';
import { newCliente, newFatturaInviata, newRigaFattura, PREFIX, RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '08',
  name: 'Creazione Fattura inviata + trigger totali',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // 1) cliente
  const cl = newCliente();
  const clIns = await api.crudInsert('clienti', cl);
  const clienteId = clIns?.result ?? clIns?.id ?? clIns?.Id ?? clIns?.results?.[0]?.id;
  assert(clienteId > 0, 'cliente insert');
  log(`cliente creato id=${clienteId}`);

  // 2) UI navigate
  await navigateRoute(page, baseUrl, 'fatture_inviate', 'list');
  log('UI navigate fatture_inviate/list');

  // 3) testata fattura via API
  const fatt = newFatturaInviata(clienteId, { causale: `E2E run ${RUN_ID}` });
  const fIns = await api.crudInsert('fatture_inviate', fatt);
  const fatturaId = fIns?.result ?? fIns?.id ?? fIns?.Id ?? fIns?.results?.[0]?.id;
  assert(fatturaId > 0, 'fattura insert');
  log(`fattura creata id=${fatturaId}`);

  // 4) lookup IVA + UM + insert riga
  const iva = await api.crudRead('codici_iva', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] }
  });
  const ivaId = (iva?.results ?? iva?.data)?.[0]?.id;
  const um = await api.crudRead('unita_misura', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] }
  });
  const umId = (um?.results ?? um?.data)?.[0]?.id;

  const riga = newRigaFattura(fatturaId, ivaId, umId, {
    quantita: 2,
    prezzo_unitario: 50.0,
    imponibile_riga: 100.0,
    iva_riga: 22.0,
    totale_riga: 122.0
  });
  await api.crudInsert('fatture_inviate_righe', riga);
  log('riga inserita');

  // 5) verifica trigger ricalcolo totali via SQL diretto (autorevole)
  const totali = await queryOne(`
    SELECT imponibile, iva, totale
    FROM dbo.fatture_inviate
    WHERE id = ${fatturaId}
  `);
  assert(Number(totali.imponibile) === 100, `imponibile errato: ${totali.imponibile}`);
  assert(Number(totali.iva) === 22, `iva errata: ${totali.iva}`);
  assert(Number(totali.totale) === 122, `totale errato: ${totali.totale}`);
  log('TRIGGER ricalcolo totali ok (100+22=122)');

  // 6) verifica trigger numerazione
  const num = await queryOne(`
    SELECT numero, progressivo, anno
    FROM dbo.fatture_inviate
    WHERE id = ${fatturaId}
  `);
  assert(num.anno > 2020, `anno non valorizzato: ${num.anno}`);
  assert(Number(num.progressivo) > 0, `progressivo non valorizzato: ${num.progressivo}`);
  assert(num.numero?.includes('/'), `numero composto sbagliato: "${num.numero}"`);
  log(`TRIGGER numerazione ok: ${num.numero} (anno=${num.anno}, prog=${num.progressivo})`);

  // 7) UI: verifica che la fattura sia nella grid filtrata via filterInfo
  // (regola 11 AGENTS) — evita la paginazione del default 10 rows/page.
  const fInfo = encodeURIComponent(JSON.stringify({
    filters: [{ field: 'id', operator: 'eq', value: fatturaId }]
  }));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/fatture_inviate/list?filterInfo=${fInfo}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, wuic-data-repeater', { timeout: 30000 });
  await page.waitForTimeout(800);
  const found = await findRowByText(page, num.numero).count();
  assert(found > 0, `fattura ${num.numero} non visibile nella list-grid UI (id=${fatturaId})`);
  log(`UI verify list-grid: fattura ${num.numero} visibile`);

  const screenshot = await snap(page, 'fattura-creata');

  // 8) cleanup
  try {
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch (e) {
    log(`cleanup warn: ${e.message}`);
  }

  return { fatturaId, clienteId, numero: num.numero, screenshot };
}
