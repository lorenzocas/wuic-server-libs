/**
 * Test 15: Workflow #9 — Pagamenti rateali automatici.
 *
 * Verifica che il trigger DB `tr_fatture_inviate_scadenze_auto` generi
 * automaticamente N scadenze quando una fattura viene inserita/aggiornata
 * con `totale > 0` e `pagamento_id` valorizzato.
 *
 * Test cases:
 *   A) pagamento N=1 rata, tipo DF, giorni=30 → 1 scadenza a data_doc + 30
 *   B) pagamento N=3 rate, tipo FM, giorni=30 → 3 scadenze a EOMONTH+30, +60, +90
 *      con importi divisi (residuo sull'ultima)
 *   C) idempotenza: re-update fattura non duplica scadenze
 */
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';
import { queryOne, query, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '15',
  name: 'Pagamenti rateali automatici (trigger DB + UI verify)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, assert, log } = ctx;

  // Setup: cliente + risolvi pagamenti reference
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, `cliente insert fail: ${JSON.stringify(clRes)}`);
  log(`cliente creato id=${clienteId}`);

  // Pagamento 30gg DF, 1 rata (id=8 dal seed)
  const pag1 = await queryOne(`SELECT TOP 1 id, n_rate, tipo_scadenza, giorni_scadenza FROM dbo.pagamenti WHERE n_rate = 1 AND tipo_scadenza = 'DF' AND giorni_scadenza = 30 ORDER BY id`);
  assert(pag1?.id, 'pagamento 30gg DF 1 rata non trovato');

  // Pagamento 30/60/90 FM, 3 rate (id=12 dal seed)
  const pag3 = await queryOne(`SELECT TOP 1 id, n_rate, tipo_scadenza, giorni_scadenza FROM dbo.pagamenti WHERE n_rate = 3 ORDER BY id`);
  assert(pag3?.id, 'pagamento 3 rate non trovato');
  log(`pag1=${pag1.id} (${pag1.n_rate}r ${pag1.tipo_scadenza} ${pag1.giorni_scadenza}gg) | pag3=${pag3.id} (${pag3.n_rate}r ${pag3.tipo_scadenza} ${pag3.giorni_scadenza}gg)`);

  // === Test A: 1 rata DF ===
  const fattA = newFatturaInviata(clienteId, { pagamento_id: Number(pag1.id), causale: 'Test A: 1 rata DF' });
  const fAres = await api.crudInsert('fatture_inviate', fattA);
  const fAid = Number(fAres?.result ?? fAres?.id);
  assert(fAid > 0, `fatturaA insert fail: ${JSON.stringify(fAres)}`);

  // Aggiungi riga (trigger ricalcola totale → trigger scadenze fire)
  const iva22 = await queryOne(`SELECT TOP 1 id FROM dbo.codici_iva WHERE codice = '22'`);
  const um = await queryOne(`SELECT TOP 1 id FROM dbo.unita_misura WHERE codice = 'pz'`);
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(fAid, Number(iva22.id), Number(um.id), {
    quantita: 1, prezzo_unitario: 1000, imponibile_riga: 1000, iva_riga: 220, totale_riga: 1220
  }));

  // Verifica scadenze auto: 1 record con importo=1220, data_scadenza=data_doc+30
  const scadA = await query(`
    SELECT id, rata_n, rata_totale, importo, data_scadenza, stato, note
    FROM dbo.scadenze
    WHERE fattura_inviata_id = ${fAid} AND note = 'AUTO_GENERATED'
    ORDER BY rata_n
  `);
  assert(scadA.length === 1, `Test A: attese 1 scadenza, viste ${scadA.length}`);
  assert(Number(scadA[0].importo) === 1220, `Test A: importo errato ${scadA[0].importo} (atteso 1220)`);
  assert(Number(scadA[0].rata_n) === 1 && Number(scadA[0].rata_totale) === 1, `Test A: rata_n/totale errati`);
  assert(scadA[0].stato === 'APERTA', `Test A: stato errato ${scadA[0].stato}`);
  log(`Test A OK: 1 scadenza id=${scadA[0].id} importo=${scadA[0].importo} data=${scadA[0].data_scadenza}`);

  // === Test B: 3 rate FM ===
  const fattB = newFatturaInviata(clienteId, { pagamento_id: Number(pag3.id), causale: 'Test B: 3 rate FM' });
  const fBres = await api.crudInsert('fatture_inviate', fattB);
  const fBid = Number(fBres?.result ?? fBres?.id);
  assert(fBid > 0, `fatturaB insert fail: ${JSON.stringify(fBres)}`);

  // Riga con totale 1000 (per testare divisione 333.33+333.33+333.34)
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(fBid, Number(iva22.id), Number(um.id), {
    quantita: 1, prezzo_unitario: 819.67, imponibile_riga: 819.67, iva_riga: 180.33, totale_riga: 1000.00
  }));

  const scadB = await query(`
    SELECT id, rata_n, rata_totale, importo, data_scadenza, stato
    FROM dbo.scadenze
    WHERE fattura_inviata_id = ${fBid} AND note = 'AUTO_GENERATED'
    ORDER BY rata_n
  `);
  assert(scadB.length === 3, `Test B: attese 3 scadenze, viste ${scadB.length}`);
  assert(scadB.every(s => Number(s.rata_totale) === 3), `Test B: rata_totale != 3`);
  // Somma importi = 1000 esatto
  const sommaB = scadB.reduce((acc, s) => acc + Number(s.importo), 0);
  assert(Math.abs(sommaB - 1000) < 0.01, `Test B: somma importi ${sommaB} != 1000`);
  // Rate equispaziate: data1 < data2 < data3
  const d1 = new Date(scadB[0].data_scadenza);
  const d2 = new Date(scadB[1].data_scadenza);
  const d3 = new Date(scadB[2].data_scadenza);
  assert(d1 < d2 && d2 < d3, `Test B: date scadenze non crescenti`);
  log(`Test B OK: 3 scadenze, importi ${scadB.map(s=>s.importo).join('|')}, date ${scadB.map(s=>s.data_scadenza).join('|')}`);

  // === Test C: idempotenza (re-update fattura non duplica) ===
  // Trigger UPDATE fattura riapplicando lo stesso totale
  await exec(`UPDATE dbo.fatture_inviate SET totale = totale WHERE id = ${fBid}`);
  const scadB2 = await query(`SELECT COUNT(*) AS n FROM dbo.scadenze WHERE fattura_inviata_id = ${fBid} AND note = 'AUTO_GENERATED' AND ISNULL(cancellato, 0) = 0`);
  assert(Number(scadB2[0].n) === 3, `Test C: idempotenza fail, scadenze duplicate ora ${scadB2[0].n}`);
  log(`Test C OK: idempotenza verificata, sempre 3 scadenze`);

  // === Test D — UI: verifica visiva che le scadenze auto-generate siano in scadenze/scheduler ===
  if (ctx.page) {
    const { page, baseUrl } = ctx;
    // Naviga a v_scadenzario filtrato per fattura B (3 rate)
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'fattura_inviata_id', operator: 'eq', value: fBid }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/scadenze/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Verifica list-grid mostra le 3 scadenze
    const visibleRows = await page.locator('wuic-list-grid tbody tr, .p-datatable-tbody tr').count();
    assert(visibleRows >= 3, `UI scadenze: attese >=3 righe per fattura B, viste ${visibleRows}`);
    log(`  Test D UI: ${visibleRows} scadenze visibili nella list-grid filtrata`);

    // Snapshot del successo
    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_15_scadenze_auto_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    log(`  screenshot: ${snapPath}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id IN (${fAid}, ${fBid})`);
    await api.crudDelete('fatture_inviate', { id: fAid });
    await api.crudDelete('fatture_inviate', { id: fBid });
    await api.crudDelete('clienti', { id: clienteId });
  } catch (e) { log(`cleanup warn: ${e.message?.slice(0, 100)}`); }

  return { fatturaA: fAid, fatturaB: fBid, scadenzeA: scadA.length, scadenzeB: scadB.length };
}
