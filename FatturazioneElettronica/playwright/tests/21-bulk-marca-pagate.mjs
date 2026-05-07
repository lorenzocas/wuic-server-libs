/**
 * Test 21: Workflow #14 — Bulk action "Marca pagate" su scadenze multi-select.
 *
 * 1) Setup: cliente + 3 scadenze APERTA distinte (importi 100/200/300, date diverse)
 * 2) UI: navigate scadenze/list filtrato per cliente_id, click 2 checkbox righe
 * 3) Click "actions" toolbar → click "Marca pagate"
 * 4) Verifica DB: le 2 selezionate stato='PAGATA' importo_pagato=importo, la 3a APERTA
 * 5) Verifica UI refresh
 */
import { newClienteRealistico } from '../_shared/test-data.mjs';
import { queryOne, query, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '21',
  name: 'Bulk action: Marca pagate scadenze multi-select (UI checkbox + table action)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, assert, log } = ctx;

  // Setup
  const cl = newClienteRealistico();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');

  // Crea 3 scadenze APERTA (no fattura collegata, INCASSO da cliente)
  // Constraint CK_scad_doc richiede tipo=INCASSO+fattura_inviata_id NOT NULL.
  // Crea fattura placeholder
  const fRes = await api.crudInsert('fatture_inviate', {
    data_documento: '2026-04-01', cliente_id: clienteId,
    causale: `Bulk test ${Date.now()}`, stato: 'EMESSA',
    imponibile: 600, iva: 132, totale: 732
  });
  const fatturaId = Number(fRes?.result ?? fRes?.id);
  assert(fatturaId > 0, 'fattura insert fail');

  await exec(`INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
              VALUES
                ('INCASSO', ${fatturaId}, ${clienteId}, '2026-06-15', 100, 0, 'APERTA', 1, 3, 0, GETDATE()),
                ('INCASSO', ${fatturaId}, ${clienteId}, '2026-07-15', 200, 0, 'APERTA', 2, 3, 0, GETDATE()),
                ('INCASSO', ${fatturaId}, ${clienteId}, '2026-08-15', 300, 0, 'APERTA', 3, 3, 0, GETDATE())`);
  const scadenzeBefore = await query(`SELECT id, importo, stato FROM dbo.scadenze WHERE fattura_inviata_id = ${fatturaId} AND note IS NULL ORDER BY rata_n`);
  assert(scadenzeBefore.length === 3, `setup: attese 3 scadenze, viste ${scadenzeBefore.length}`);
  log(`setup: cliente=${clienteId} fattura=${fatturaId} 3 scadenze APERTA (ids ${scadenzeBefore.map(s => s.id).join(',')})`);

  if (ctx.page) {
    const { page } = ctx;
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'fattura_inviata_id', operator: 'eq', value: fatturaId }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/scadenze/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1500);

    // Verifica list-grid mostra 3 righe
    const rowCount = await page.locator('wuic-list-grid tbody tr, .p-datatable-tbody tr').count();
    assert(rowCount === 3, `list-grid: attese 3 righe, viste ${rowCount}`);

    // Click checkbox righe 1 e 2 (NON la 3a)
    // PrimeNG checkbox row: <p-tablecheckbox> dentro <td>
    const rowCheckboxes = page.locator('wuic-list-grid tbody tr p-tablecheckbox, .p-datatable-tbody tr p-tablecheckbox, wuic-list-grid tbody tr .p-checkbox-box');
    const total = await rowCheckboxes.count();
    log(`  checkboxes per riga: ${total}`);
    assert(total >= 3, `attesi >=3 checkbox riga, visti ${total}`);

    await rowCheckboxes.nth(0).click({ force: true });
    await page.waitForTimeout(300);
    await rowCheckboxes.nth(1).click({ force: true });
    await page.waitForTimeout(500);
    log('  UI: checkbox righe 1+2 cliccati');

    // Snapshot pre-bulk
    const snap1 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_21_pre_bulk_${Date.now()}.png`;
    await page.screenshot({ path: snap1, fullPage: false });

    // Click toolbar actions → "Marca pagate"
    const actionsBtn = page.locator(
      'wuic-list-grid .p-toolbar p-button:has-text("actions"), ' +
      'wuic-list-grid .list-grid-toolbar button:has-text("actions"), ' +
      'wuic-list-grid > div p-button:has-text("actions")'
    ).first();
    await actionsBtn.waitFor({ state: 'visible', timeout: 10000 });
    await actionsBtn.click({ force: true });
    await page.waitForTimeout(800);

    const item = page.locator(':text-is("Marca pagate"):visible, .p-menuitem-link:has-text("Marca pagate"):visible').first();
    await item.waitFor({ state: 'visible', timeout: 5000 });
    await item.click({ force: true });
    await page.waitForTimeout(2500);
    log('  UI: click "Marca pagate" sulla toolbar');

    // Verifica DB: 2 scadenze PAGATA, 1 APERTA
    const scadenzeAfter = await query(`SELECT id, stato, importo_pagato FROM dbo.scadenze WHERE fattura_inviata_id = ${fatturaId} AND note IS NULL ORDER BY rata_n`);
    const pagateCount = scadenzeAfter.filter(s => s.stato === 'PAGATA').length;
    const aperteCount = scadenzeAfter.filter(s => s.stato === 'APERTA').length;
    assert(pagateCount === 2, `attese 2 scadenze PAGATA dopo bulk, viste ${pagateCount}`);
    assert(aperteCount === 1, `attesa 1 APERTA, viste ${aperteCount}`);
    // Verifica importo_pagato = importo per le 2 PAGATE
    for (const s of scadenzeAfter.filter(s => s.stato === 'PAGATA')) {
      const importo = (await queryOne(`SELECT importo FROM dbo.scadenze WHERE id = ${s.id}`)).importo;
      assert(Number(s.importo_pagato) === Number(importo),
        `scadenza ${s.id}: importo_pagato=${s.importo_pagato} ≠ importo=${importo}`);
    }
    log(`  Test bulk OK: 2 PAGATA + 1 APERTA, importo_pagato propagato`);

    const snap2 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_21_post_bulk_${Date.now()}.png`;
    await page.screenshot({ path: snap2, fullPage: false });
    log(`  screenshot: ${snap2}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id = ${fatturaId}`);
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch {}

  return { fatturaId, clienteId };
}
