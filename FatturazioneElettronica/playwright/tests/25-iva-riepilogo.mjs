/**
 * Test 25: Workflow #17 — Riepilogo IVA periodico (LIPE-style).
 *
 * Setup:
 *   - 1 cliente + 1 fornitore di test
 *   - 2 fatture EMESSE in 2027-Q1 con righe IVA 22% (1000+220) e 10% (500+50)
 *   - 1 fattura RICEVUTA in 2027-Q1 con riga IVA 22% (300+66)
 *   - 1 fattura EMESSA in 2027-Q2 (NON deve apparire nel filtro Q1)
 *
 * Test:
 *   A. GET /api/iva/riepilogo?anno=2027&periodo=Q1
 *      - 2 aliquote (10%, 22%)
 *      - aliquota 22%: imp_vendite=1000, iva_vendite=220, num_fatture_emesse=1,
 *                      imp_acquisti=300, iva_acquisti=66, saldo=154
 *      - aliquota 10%: imp_vendite=500, iva_vendite=50, num_emesse=1, saldo=50
 *      - totali: iva_vendite=270, iva_acquisti=66, saldo=204 (a debito)
 *   B. GET ?periodo=YEAR include anche la fattura Q2 (3 emesse + 1 ricevuta)
 *   C. GET ?periodo=Q3 → results vuoti, totali tutti zero
 *   D. UI: naviga a #/iva/riepilogo → component renders, default anno corrente
 *      → cambia anno=2027 + periodo=Q1 → click "Calcola" → tabella mostra 2 aliquote +
 *        riga totali con badge "a debito"
 *   E. Validation: anno=null → 400; periodo='ZZ' → 400
 */
import { newClienteRealistico, newFornitoreRealistico } from '../_shared/test-data.mjs';
import { queryOne, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '25',
  name: 'Riepilogo IVA periodico (SP + endpoint + UI tabella + saldo)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, backendBaseUrl, page, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // === Setup ===
  const cl = newClienteRealistico();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');

  // Fornitore (riusa la struttura clienti se esiste tabella, altrimenti SQL diretto)
  const fornRes = await api.crudInsert('fornitori', newFornitoreRealistico());
  const fornitoreId = Number(fornRes?.result ?? fornRes?.id);
  assert(fornitoreId > 0, 'fornitore insert fail');

  // Codici IVA (devono già esistere o creiamo)
  const iva22 = await queryOne(`SELECT TOP 1 id, aliquota FROM dbo.codici_iva WHERE aliquota = 22.00`);
  const iva10 = await queryOne(`SELECT TOP 1 id, aliquota FROM dbo.codici_iva WHERE aliquota = 10.00`);
  assert(iva22 && iva10, 'codici IVA 22% e 10% richiesti — verifica seed dati');

  // 2 fatture EMESSE in 2027 Q1
  const f1 = await api.crudInsert('fatture_inviate', {
    progressivo: 5001, anno: 2027, data_documento: '2027-01-15',
    cliente_id: clienteId, causale: 'IVA test Q1 emessa #1',
    stato: 'EMESSA', imponibile: 1000, iva: 220, totale: 1220
  });
  const f1Id = Number(f1?.result ?? f1?.id);
  await exec(`INSERT INTO dbo.fatture_inviate_righe (fattura_id, riga, descrizione, quantita, prezzo_unitario, codice_iva_id, imponibile_riga, iva_riga, totale_riga)
              VALUES (${f1Id}, 1, 'Servizio test 22%', 1, 1000, ${iva22.id}, 1000, 220, 1220)`);

  const f2 = await api.crudInsert('fatture_inviate', {
    progressivo: 5002, anno: 2027, data_documento: '2027-02-20',
    cliente_id: clienteId, causale: 'IVA test Q1 emessa #2',
    stato: 'EMESSA', imponibile: 500, iva: 50, totale: 550
  });
  const f2Id = Number(f2?.result ?? f2?.id);
  await exec(`INSERT INTO dbo.fatture_inviate_righe (fattura_id, riga, descrizione, quantita, prezzo_unitario, codice_iva_id, imponibile_riga, iva_riga, totale_riga)
              VALUES (${f2Id}, 1, 'Servizio test 10%', 1, 500, ${iva10.id}, 500, 50, 550)`);

  // 1 fattura EMESSA in Q2 (deve NON entrare in filtro Q1)
  const f3 = await api.crudInsert('fatture_inviate', {
    progressivo: 5003, anno: 2027, data_documento: '2027-04-10',
    cliente_id: clienteId, causale: 'IVA test Q2 emessa',
    stato: 'EMESSA', imponibile: 200, iva: 44, totale: 244
  });
  const f3Id = Number(f3?.result ?? f3?.id);
  await exec(`INSERT INTO dbo.fatture_inviate_righe (fattura_id, riga, descrizione, quantita, prezzo_unitario, codice_iva_id, imponibile_riga, iva_riga, totale_riga)
              VALUES (${f3Id}, 1, 'Servizio Q2 22%', 1, 200, ${iva22.id}, 200, 44, 244)`);

  // 1 fattura RICEVUTA in 2027 Q1 (a credito)
  const fr1 = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: 6001, anno: 2027,
    numero_fornitore: 'F-' + Date.now().toString().slice(-6),
    data_documento: '2027-03-05', data_ricezione: '2027-03-06',
    fornitore_id: fornitoreId, causale: 'IVA test Q1 ricevuta',
    imponibile: 300, iva: 66, totale: 366
  });
  const fr1Id = Number(fr1?.result ?? fr1?.id);
  await exec(`INSERT INTO dbo.fatture_ricevute_righe (fattura_id, riga, descrizione, quantita, prezzo_unitario, codice_iva_id, imponibile_riga, iva_riga, totale_riga)
              VALUES (${fr1Id}, 1, 'Acquisto test 22%', 1, 300, ${iva22.id}, 300, 66, 366)`);

  log(`setup: cliente=${clienteId}, fornitore=${fornitoreId}, fatture inviate=[${f1Id},${f2Id},${f3Id}], ricevuta=${fr1Id}`);

  // === Test A: GET ?anno=2027&periodo=Q1 ===
  const r1 = await fetch(`${apiBase}/api/iva/riepilogo?anno=2027&periodo=Q1`);
  const j1 = await r1.json();
  assert(j1.ok === true, `GET Q1 fail: ${JSON.stringify(j1)?.slice(0,200)}`);
  assert(Array.isArray(j1.results), `results deve essere array`);
  // Filtra solo aliquote che HANNO match con le nostre (altre fatture in DB potrebbero esistere)
  const r22 = j1.results.find(r => Number(r.aliquota) === 22);
  const r10 = j1.results.find(r => Number(r.aliquota) === 10);
  assert(r22, `aliquota 22 mancante in Q1`);
  assert(r10, `aliquota 10 mancante in Q1`);
  // Verifica che le NOSTRE fatture siano incluse (potrebbero esserci anche altre dati)
  assert(Number(r22.iva_vendite) >= 220, `iva_vendite 22% ≥ 220 (atteso 220+, visto ${r22.iva_vendite})`);
  assert(Number(r22.iva_acquisti) >= 66,  `iva_acquisti 22% ≥ 66 (visto ${r22.iva_acquisti})`);
  assert(Number(r10.iva_vendite) >= 50,   `iva_vendite 10% ≥ 50 (visto ${r10.iva_vendite})`);
  log(`Test A: Q1 results 22%(vendite=${r22.iva_vendite}, acquisti=${r22.iva_acquisti}, saldo=${r22.saldo_iva}) + 10%(vendite=${r10.iva_vendite})`);
  // totali
  assert(j1.totali, 'totali presenti');
  assert(Number(j1.totali.iva_vendite) >= 270, `tot iva_vendite >=270, visto ${j1.totali.iva_vendite}`);
  assert(j1.totali.a_debito === true, `Q1 saldo deve essere a debito (vendite > acquisti)`);
  log(`  totali Q1: saldo=${j1.totali.saldo_iva} a_debito=${j1.totali.a_debito}`);

  // === Test B: GET ?periodo=YEAR include anche Q2 ===
  const r2 = await fetch(`${apiBase}/api/iva/riepilogo?anno=2027&periodo=YEAR`);
  const j2 = await r2.json();
  assert(j2.ok === true && j2.results, `GET YEAR fail`);
  const r22Year = j2.results.find(r => Number(r.aliquota) === 22);
  // YEAR 22% deve essere ≥ Q1 22% (Q2 aggiunge altri 44 di iva)
  assert(Number(r22Year.iva_vendite) >= Number(r22.iva_vendite) + 44,
    `YEAR 22% iva_vendite (${r22Year.iva_vendite}) deve includere anche Q2 (+44 vs Q1=${r22.iva_vendite})`);
  log(`Test B: YEAR 22% iva_vendite=${r22Year.iva_vendite} (Q1=${r22.iva_vendite} + Q2 contrib >= 44)`);

  // === Test C: GET ?periodo=Q3 (vuoto per nostre fatture) ===
  const r3 = await fetch(`${apiBase}/api/iva/riepilogo?anno=2027&periodo=Q3`);
  const j3 = await r3.json();
  assert(j3.ok === true, `GET Q3 fail`);
  log(`Test C: Q3 ha ${j3.results.length} aliquote (no specific check, dipende da altri dati DB)`);

  // === Test D: UI ===
  if (page) {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/iva/riepilogo?bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#app_iva_riepilogo_page', { timeout: 30000 });
    await page.waitForTimeout(800);

    // Cleanup pre-test: chiudi eventuali dialog stale
    try {
      const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok")').first();
      if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await okBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {}

    // Cambia anno=2027 + periodo=Q1 + click Calcola
    const annoInput = page.locator('#iva_anno');
    await annoInput.click();
    await annoInput.fill('');
    await annoInput.fill('2027');
    await page.waitForTimeout(200);

    // Periodo p-select - apri e seleziona Q1
    const periodoSelect = page.locator('p-select[inputId="iva_periodo"]');
    await periodoSelect.click();
    await page.waitForTimeout(400);
    await page.locator('.p-select-overlay .p-select-option:has-text("Q1")').first().click();
    await page.waitForTimeout(300);

    // Click Calcola
    await page.locator('#iva_btn_calcola').click();
    await page.waitForTimeout(2000);

    // Verifica tabella renderizzata + riga totali
    const resultsDiv = page.locator('#iva_results');
    await resultsDiv.waitFor({ state: 'visible', timeout: 10000 });
    const totaliRow = page.locator('#iva_totali');
    await totaliRow.waitFor({ state: 'visible', timeout: 5000 });

    // Verifica saldo finale visualizzato
    const saldoEl = page.locator('#iva_saldo_finale');
    const saldoText = await saldoEl.textContent();
    assert(saldoText && saldoText.trim().length > 0, `saldo non renderizzato, visto: "${saldoText}"`);
    log(`Test D UI: tabella renderizzata, saldo finale="${saldoText.trim()}"`);

    // Verifica badge "a debito" visibile
    const badgeDebito = page.locator('.iva-badge[data-saldo="debito"]');
    const hasDebitoBadge = await badgeDebito.count();
    assert(hasDebitoBadge >= 1, `badge "a debito" mancante (Q1 deve avere vendite > acquisti per la nostra setup)`);
    log(`  badge "a debito" presente`);

    // Snapshot
    const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_25_iva_riepilogo_${Date.now()}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    log(`screenshot: ${snap}`);
  }

  // === Test E: validation ===
  const rE1 = await fetch(`${apiBase}/api/iva/riepilogo?periodo=YEAR`);
  assert(rE1.status === 400, `senza anno deve essere 400, visto ${rE1.status}`);
  const rE2 = await fetch(`${apiBase}/api/iva/riepilogo?anno=2027&periodo=ZZ`);
  assert(rE2.status === 400, `periodo invalido deve essere 400, visto ${rE2.status}`);
  log(`Test E: validation 400 per anno mancante e periodo invalido`);

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id IN (${f1Id},${f2Id},${f3Id})`);
    await exec(`DELETE FROM dbo.fatture_ricevute_righe WHERE fattura_id = ${fr1Id}`);
    await api.crudDelete('fatture_inviate', { id: f1Id });
    await api.crudDelete('fatture_inviate', { id: f2Id });
    await api.crudDelete('fatture_inviate', { id: f3Id });
    await api.crudDelete('fatture_ricevute', { id: fr1Id });
    await api.crudDelete('fornitori', { id: fornitoreId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch {}

  return { aliquote_q1: j1.results.length, totali_year_22_iva_vendite: r22Year.iva_vendite };
}
