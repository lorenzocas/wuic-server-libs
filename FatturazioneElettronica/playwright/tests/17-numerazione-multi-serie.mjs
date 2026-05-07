/**
 * Test 17: Workflow #7 — Numerazione fatture multi-sezionale.
 *
 * Verifica che il trigger `tr_fatture_inviate_numerazione` partizioni
 * il progressivo per (anno, serie):
 *   - serie 'A' → A-1/2026, A-2/2026, ...
 *   - serie 'B' → B-1/2026, B-2/2026, ...
 *   - serie '' (vuota) → 1/2026, 2/2026, ...
 *
 * Test cases (data_documento = 2026 per tutti):
 *   1) insert serie='TST_A' → numero "TST_A-1/2026" progressivo=1
 *   2) insert serie='TST_B' → numero "TST_B-1/2026" progressivo=1 (separato!)
 *   3) insert serie='TST_A' → numero "TST_A-2/2026" progressivo=2
 *   4) UI: navigate fatture_inviate/list filtrato per serie='TST_A' → 2 righe
 */
import { newCliente } from '../_shared/test-data.mjs';
import { queryOne, query, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '17',
  name: 'Numerazione fatture multi-sezionale (trigger + UI verify)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, assert, log } = ctx;

  // Cleanup pre-test (se test precedente ha lasciato fatture serie TST_*)
  await exec(`DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id IN (SELECT id FROM dbo.fatture_inviate WHERE serie LIKE 'TST_%')`);
  await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id IN (SELECT id FROM dbo.fatture_inviate WHERE serie LIKE 'TST_%')`);
  await exec(`DELETE FROM dbo.fatture_inviate WHERE serie LIKE 'TST_%'`);

  // Setup cliente
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');

  const insertFat = async (serie, causale) => {
    const r = await api.crudInsert('fatture_inviate', {
      data_documento: '2026-05-05',
      cliente_id: clienteId,
      causale: causale,
      serie: serie,
      stato: 'BOZZA',
      imponibile: 100, iva: 22, totale: 122
    });
    const id = Number(r?.result ?? r?.id);
    assert(id > 0, `insert serie="${serie}" fail`);
    return id;
  };

  // 1) serie TST_A → progressivo 1
  const fA1 = await insertFat('TST_A', 'serie A doc 1');
  const fA1Row = await queryOne(`SELECT id, numero, serie, progressivo, anno FROM dbo.fatture_inviate WHERE id=${fA1}`);
  assert(Number(fA1Row.progressivo) === 1, `serie TST_A doc 1 progressivo=${fA1Row.progressivo} (atteso 1)`);
  assert(fA1Row.numero === 'TST_A-1/2026', `serie TST_A doc 1 numero="${fA1Row.numero}" (atteso "TST_A-1/2026")`);
  log(`  [A1] id=${fA1} numero="${fA1Row.numero}" progressivo=${fA1Row.progressivo}`);

  // 2) serie TST_B → progressivo 1 (separato!)
  const fB1 = await insertFat('TST_B', 'serie B doc 1');
  const fB1Row = await queryOne(`SELECT numero, serie, progressivo FROM dbo.fatture_inviate WHERE id=${fB1}`);
  assert(Number(fB1Row.progressivo) === 1, `serie TST_B doc 1 progressivo=${fB1Row.progressivo} (atteso 1)`);
  assert(fB1Row.numero === 'TST_B-1/2026', `serie TST_B doc 1 numero="${fB1Row.numero}"`);
  log(`  [B1] id=${fB1} numero="${fB1Row.numero}" progressivo=${fB1Row.progressivo}`);

  // 3) serie TST_A secondo doc → progressivo 2
  const fA2 = await insertFat('TST_A', 'serie A doc 2');
  const fA2Row = await queryOne(`SELECT numero, serie, progressivo FROM dbo.fatture_inviate WHERE id=${fA2}`);
  assert(Number(fA2Row.progressivo) === 2, `serie TST_A doc 2 progressivo=${fA2Row.progressivo} (atteso 2)`);
  assert(fA2Row.numero === 'TST_A-2/2026', `serie TST_A doc 2 numero="${fA2Row.numero}"`);
  log(`  [A2] id=${fA2} numero="${fA2Row.numero}" progressivo=${fA2Row.progressivo}`);

  // 4) UI: filtra fatture per serie TST_A (deve mostrare 2 righe)
  if (ctx.page) {
    const { page, baseUrl } = ctx;
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'serie', operator: 'eq', value: 'TST_A' }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/fatture_inviate/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1200);

    const rows = await page.locator('wuic-list-grid tbody tr, .p-datatable-tbody tr').count();
    assert(rows === 2, `UI fatture/list filtrato serie=TST_A: attese 2 righe, viste ${rows}`);

    // Verifica i numeri "TST_A-1/2026" e "TST_A-2/2026" siano visibili
    const txt = await page.locator('body').innerText();
    assert(txt.includes('TST_A-1/2026'), `UI: numero TST_A-1/2026 non visibile`);
    assert(txt.includes('TST_A-2/2026'), `UI: numero TST_A-2/2026 non visibile`);
    log(`  UI ok: 2 righe filtrate, numeri TST_A-1/2026 + TST_A-2/2026 visibili`);

    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_17_numerazione_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    log(`  screenshot: ${snapPath}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id IN (${fA1}, ${fA2}, ${fB1})`);
    await api.crudDelete('fatture_inviate', { id: fA1 });
    await api.crudDelete('fatture_inviate', { id: fA2 });
    await api.crudDelete('fatture_inviate', { id: fB1 });
    await api.crudDelete('clienti', { id: clienteId });
  } catch (e) { log(`cleanup warn: ${e.message?.slice(0, 100)}`); }

  return { fA1, fA2, fB1, numeri: [fA1Row.numero, fB1Row.numero, fA2Row.numero] };
}
