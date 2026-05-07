/**
 * Test 16: Workflow #8 — Conversione preventivo → fattura.
 *
 * 1) crea cliente + preventivo + 2 righe (totali calcolati da trigger preventivi)
 * 2) chiama POST /api/conversioni/preventivo-to-fattura
 * 3) verifica:
 *    a. fattura creata con stesso cliente, totali, righe
 *    b. preventivo passa a stato 'CONVERTITO'
 *    c. causale fattura = "Da preventivo #<id>"
 *    d. idempotenza: re-call ritorna stesso fattura_id
 * 4) cleanup
 */
import { newCliente } from '../_shared/test-data.mjs';
import { queryOne, query, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '16',
  name: 'Conversione preventivo → fattura (API + UI button)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // Setup
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');
  log(`cliente id=${clienteId}`);

  // Crea preventivo (testata) — totali a 0 inizialmente, riga li popola via trigger
  const prevPayload = {
    data_documento: '2026-05-05',
    data_validita: '2026-06-05',
    cliente_id: clienteId,
    oggetto: `Preventivo Test16 ${Date.now()}`,
    imponibile: 0,
    iva: 0,
    totale: 0,
    stato: 'BOZZA'
  };
  const prevRes = await api.crudInsert('preventivi', prevPayload);
  const preventivoId = Number(prevRes?.result ?? prevRes?.id);
  assert(preventivoId > 0, `preventivo insert fail: ${JSON.stringify(prevRes)?.slice(0, 200)}`);
  log(`preventivo id=${preventivoId}`);

  // Resolve FK lookups
  const ivaRow = await queryOne(`SELECT TOP 1 id FROM dbo.codici_iva WHERE codice='22'`);
  const umRow = await queryOne(`SELECT TOP 1 id FROM dbo.unita_misura WHERE codice='pz'`);
  assert(ivaRow?.id && umRow?.id, 'lookups codici_iva/unita_misura mancanti');

  // Aggiungi 2 righe
  await api.crudInsert('preventivi_righe', {
    preventivo_id: preventivoId, riga: 1, descrizione: 'Servizio A',
    quantita: 2, prezzo_unitario: 100, sconto_perc: 0,
    codice_iva_id: Number(ivaRow.id), unita_misura_id: Number(umRow.id),
    imponibile_riga: 200, iva_riga: 44, totale_riga: 244
  });
  await api.crudInsert('preventivi_righe', {
    preventivo_id: preventivoId, riga: 2, descrizione: 'Servizio B',
    quantita: 1, prezzo_unitario: 500, sconto_perc: 0,
    codice_iva_id: Number(ivaRow.id), unita_misura_id: Number(umRow.id),
    imponibile_riga: 500, iva_riga: 110, totale_riga: 610
  });

  // Verifica totali preventivo dopo trigger ricalcolo (se esiste)
  // — se non c'e' trigger totali su preventivi, valore rimane 0; aggiorno manualmente
  let prevDb = await queryOne(`SELECT id, imponibile, iva, totale, stato FROM dbo.preventivi WHERE id=${preventivoId}`);
  log(`preventivo dopo righe: imp=${prevDb.imponibile} iva=${prevDb.iva} tot=${prevDb.totale} stato=${prevDb.stato}`);
  if (Number(prevDb.totale) === 0) {
    await exec(`UPDATE dbo.preventivi SET imponibile=700, iva=154, totale=854 WHERE id=${preventivoId}`);
    log('  totali aggiornati manualmente (no trigger preventivi)');
  }

  // === Test conversion ===
  const convResp = await fetch(`${apiBase}/api/conversioni/preventivo-to-fattura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PreventivoId: preventivoId })
  });
  const convJson = await convResp.json();
  assert(convJson.ok === true, `conversione fail: ${JSON.stringify(convJson)?.slice(0, 300)}`);
  const fatturaId = Number(convJson.fattura_id);
  assert(fatturaId > 0, `fattura_id mancante: ${JSON.stringify(convJson)}`);
  log(`fattura creata id=${fatturaId}`);

  // Verifica testata fattura
  const fatt = await queryOne(`SELECT id, cliente_id, imponibile, iva, totale, stato, causale FROM dbo.fatture_inviate WHERE id=${fatturaId}`);
  assert(Number(fatt.cliente_id) === clienteId, `cliente_id non propagato: ${fatt.cliente_id}`);
  assert(Number(fatt.imponibile) === 700, `imponibile non propagato: ${fatt.imponibile}`);
  assert(Number(fatt.totale) === 854, `totale non propagato: ${fatt.totale}`);
  assert(fatt.causale.includes(`#${preventivoId}`), `causale errata: "${fatt.causale}"`);
  log(`testata fattura ok: causale="${fatt.causale}"`);

  // Verifica righe
  const righe = await query(`SELECT riga, descrizione, quantita, prezzo_unitario, totale_riga FROM dbo.fatture_inviate_righe WHERE fattura_id=${fatturaId} ORDER BY riga`);
  assert(righe.length === 2, `righe attese 2, viste ${righe.length}`);
  assert(righe[0].descrizione === 'Servizio A', `riga 1 descr: "${righe[0].descrizione}"`);
  assert(Number(righe[1].totale_riga) === 610, `riga 2 totale: ${righe[1].totale_riga}`);
  log(`righe ok: ${righe.length}`);

  // Verifica preventivo passato a CONVERTITO
  prevDb = await queryOne(`SELECT stato FROM dbo.preventivi WHERE id=${preventivoId}`);
  assert(prevDb.stato === 'CONVERTITO', `stato preventivo errato: ${prevDb.stato}`);
  log('preventivo stato=CONVERTITO');

  // === Idempotency: re-call ritorna stesso fattura_id ===
  const conv2 = await fetch(`${apiBase}/api/conversioni/preventivo-to-fattura`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PreventivoId: preventivoId })
  });
  const conv2Json = await conv2.json();
  assert(conv2Json.ok === true && Number(conv2Json.fattura_id) === fatturaId,
    `idempotenza fail: ricreata fattura ${conv2Json.fattura_id} (atteso ${fatturaId})`);
  log(`idempotenza ok: re-call ritorna stesso id=${fatturaId}`);

  // === UI verify: click reale dal browser su row action "Fattura" ===
  // Prima crea NUOVO preventivo (non quello gia' convertito) per testare il click
  // su uno stato BOZZA reale.
  if (ctx.page) {
    const { page, baseUrl } = ctx;

    // Capture console for diagnostics during click
    const consoleMsgs = [];
    const requests = [];
    page.on('console', m => { const t = m.text(); if (m.type()==='error' || m.type()==='warning' || /btn_converti/.test(t)) consoleMsgs.push(`[${m.type()}] ${t.slice(0, 250)}`); });
    page.on('request', r => { if (r.url().includes('/api/conversioni/')) requests.push(`REQ ${r.method()} ${r.url()}`); });
    page.on('response', r => { if (r.url().includes('/api/conversioni/')) requests.push(`RES ${r.status()} ${r.url()}`); });

    // Crea nuovo preventivo per il click UI
    const prev2Res = await api.crudInsert('preventivi', {
      data_documento: '2026-05-05', data_validita: '2026-06-05',
      cliente_id: clienteId, oggetto: `Preventivo UI click ${Date.now()}`,
      imponibile: 1000, iva: 220, totale: 1220, stato: 'BOZZA'
    });
    const preventivoUiId = Number(prev2Res?.result ?? prev2Res?.id);
    assert(preventivoUiId > 0, 'preventivo UI insert fail');
    await api.crudInsert('preventivi_righe', {
      preventivo_id: preventivoUiId, riga: 1, descrizione: 'Servizio UI',
      quantita: 1, prezzo_unitario: 1000, sconto_perc: 0,
      codice_iva_id: Number(ivaRow.id), unita_misura_id: Number(umRow.id),
      imponibile_riga: 1000, iva_riga: 220, totale_riga: 1220
    });
    await exec(`UPDATE dbo.preventivi SET imponibile=1000, iva=220, totale=1220 WHERE id=${preventivoUiId}`);

    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'id', operator: 'eq', value: preventivoUiId }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/preventivi/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // 1) Click sul `.p-splitbutton-dropdown` chevron blue dentro tbody tr.
    // (Il `.p-splitbutton-button` primary e' hidden — solo il dropdown side
    // e' visibile e cliccabile).
    const rowDropdownBtn = page.locator(
      'wuic-list-grid tbody tr .p-splitbutton-dropdown, ' +
      '.p-datatable-tbody tr .p-splitbutton-dropdown'
    ).first();
    await rowDropdownBtn.waitFor({ state: 'visible', timeout: 15000 });
    await rowDropdownBtn.click({ force: true });
    await page.waitForTimeout(800);

    // 2) Trova item "Fattura" nel popup PrimeNG aperto.
    // PrimeNG usa varie classi (p-menu/p-tieredmenu/p-menuitem); prendo
    // l'ultimo `:visible` text="Fattura" (che e' il piu' recente, non quello
    // della Metadata sidebar).
    const allFattura = page.locator('[role="menuitem"]:has-text("Fattura"), .p-menuitem:has-text("Fattura"), li:has-text("Fattura"):visible').filter({ hasText: /^\s*Fattura\s*$/ });
    const cnt = await allFattura.count();
    let menuItem = page.locator('a[role="menuitem"]:has-text("Fattura"):visible, .p-menuitem-link:has-text("Fattura"):visible').first();
    if (await menuItem.isVisible().catch(()=>false) === false) {
      // Try: any visible element with EXACTLY the text "Fattura"
      menuItem = page.getByRole('menuitem', { name: 'Fattura' });
      if (await menuItem.isVisible().catch(()=>false) === false) {
        menuItem = page.locator(':text-is("Fattura"):visible').first();
      }
    }
    await menuItem.waitFor({ state: 'visible', timeout: 8000 });
    log(`  UI: row dropdown aperto, item "Fattura" visibile (${cnt} candidati)`);

    // 3) Click sull'item "Fattura" → triggera fetch /api/conversioni/preventivo-to-fattura
    await menuItem.click({ force: true });
    await page.waitForTimeout(3000); // fetch + toast + DB visible

    // 4) Verifica: nuovo fattura creata in DB con causale "Da preventivo #<preventivoUiId>"
    const fattUi = await queryOne(
      `SELECT TOP 1 id, causale, totale FROM dbo.fatture_inviate ` +
      `WHERE causale = N'Da preventivo #${preventivoUiId}' AND ISNULL(cancellato,0)=0 ORDER BY id DESC`
    );
    if (!fattUi?.id) {
      log(`  DIAGNOSTICA: console=${consoleMsgs.length}, network=${requests.length}`);
      consoleMsgs.slice(0, 8).forEach(m => log(`    ${m}`));
      requests.forEach(r => log(`    ${r}`));
    }
    assert(fattUi?.id, `click UI non ha creato fattura per preventivo #${preventivoUiId}`);
    log(`  UI click ok: fattura creata via row action id=${fattUi.id}, totale=${fattUi.totale}`);

    // Snapshot del successo
    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_16_conversione_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });

    // Cleanup tile UI
    try {
      await exec(`DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id=${fattUi.id}`);
      await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id=${fattUi.id}`);
      await api.crudDelete('fatture_inviate', { id: Number(fattUi.id) });
      await exec(`DELETE FROM dbo.preventivi_righe WHERE preventivo_id=${preventivoUiId}`);
      await api.crudDelete('preventivi', { id: preventivoUiId });
    } catch {}
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id=${fatturaId}`);
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id=${fatturaId}`);
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await exec(`DELETE FROM dbo.preventivi_righe WHERE preventivo_id=${preventivoId}`);
    await api.crudDelete('preventivi', { id: preventivoId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch (e) { log(`cleanup warn: ${e.message?.slice(0, 100)}`); }

  return { preventivoId, fatturaId, righe: righe.length };
}
