/**
 * Test 31 (refactor framework-first): Workflow #20 — Aging analysis debiti
 * fornitori via dashboard `aging_debiti` (boardcontent + 4 viste).
 */
import { newFornitoreRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '31',
  name: 'Aging debiti dashboard (framework-first)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, assert, log } = ctx;

  const fA = await api.crudInsert('fornitori', newFornitoreRealistico());
  const fB = await api.crudInsert('fornitori', newFornitoreRealistico());
  const idA = Number(fA?.result ?? fA?.id);
  const idB = Number(fB?.result ?? fB?.id);

  const baseProg = 92000 + Number(Date.now().toString().slice(-4));
  const frA = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: baseProg + 1, anno: 2027,
    numero_fornitore: 'FA-' + Date.now().toString().slice(-6),
    data_documento: '2027-01-01', data_ricezione: '2027-01-02',
    fornitore_id: idA, causale: '_e2e_aging_debiti A',
    imponibile: 1200, iva: 264, totale: 1200
  });
  const frB = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: baseProg + 2, anno: 2027,
    numero_fornitore: 'FB-' + Date.now().toString().slice(-6),
    data_documento: '2027-01-01', data_ricezione: '2027-01-02',
    fornitore_id: idB, causale: '_e2e_aging_debiti B',
    imponibile: 1450, iva: 319, totale: 1450
  });
  const fAId = Number(frA?.result ?? frA?.id);
  const fBId = Number(frB?.result ?? frB?.id);

  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('PAGAMENTO', ${fAId}, ${idA}, DATEADD(DAY, 20,  CAST(GETDATE() AS DATE)), 800, 0, 'APERTA', 1, 2, 0, GETDATE()),
      ('PAGAMENTO', ${fAId}, ${idA}, DATEADD(DAY, -50, CAST(GETDATE() AS DATE)), 400, 0, 'APERTA', 2, 2, 0, GETDATE()),
      ('PAGAMENTO', ${fBId}, ${idB}, DATEADD(DAY, -15,  CAST(GETDATE() AS DATE)), 250,  0, 'APERTA', 1, 2, 0, GETDATE()),
      ('PAGAMENTO', ${fBId}, ${idB}, DATEADD(DAY, -100, CAST(GETDATE() AS DATE)), 1200, 0, 'APERTA', 2, 2, 0, GETDATE());
  `);
  log(`setup: 4 scadenze PAGAMENTO`);

  // Test A: data via vw_aging_debiti_fornitori
  const respFor = await api.crudRead('vw_aging_debiti_fornitori', { filterInfo: { filters: [] } });
  const rowsFor = respFor?.results ?? respFor?.data ?? [];
  const ourA = rowsFor.find(r => Number(r.fornitore_id) === idA);
  const ourB = rowsFor.find(r => Number(r.fornitore_id) === idB);
  assert(ourA && Number(ourA.non_scaduto) === 800 && Number(ourA.scaduto_31_60) === 400,
    `A: fornitore A non_scaduto=${ourA?.non_scaduto} 31-60=${ourA?.scaduto_31_60} (atteso 800+400)`);
  assert(ourB && Number(ourB.scaduto_0_30) === 250 && Number(ourB.scaduto_over_90) === 1200,
    `A: fornitore B 0-30=${ourB?.scaduto_0_30} >90=${ourB?.scaduto_over_90} (atteso 250+1200)`);
  log(`Test A: 2 fornitori bucket corretti`);

  // Test B: dashboard UI
  if (page) {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/aging_debiti/dashboard?bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 3; i++) {
      try {
        const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok"), .p-dialog button:has-text("ok")').first();
        if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) { await okBtn.click({ force: true }).catch(() => {}); await page.waitForTimeout(400); }
        else break;
      } catch { break; }
    }
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.waitForTimeout(800);
    const chartCount = await page.locator('canvas').count();
    assert(chartCount >= 1, `B: atteso >=1 canvas, visto ${chartCount}`);
    log(`Test B UI: chart canvas=${chartCount}`);
    const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_31_aging_debiti_dashboard_${Date.now()}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    log(`screenshot: ${snap}`);
  }

  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_ricevuta_id IN (${fAId},${fBId})`);
    await api.crudDelete('fatture_ricevute', { id: fAId });
    await api.crudDelete('fatture_ricevute', { id: fBId });
    await api.crudDelete('fornitori', { id: idA });
    await api.crudDelete('fornitori', { id: idB });
  } catch {}

  return { dashboard_url: '/#/aging_debiti/dashboard' };
}
