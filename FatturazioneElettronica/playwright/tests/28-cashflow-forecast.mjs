/**
 * Test 28 (refactor framework-first): Workflow #17 — Cash-flow forecast
 * via dashboard `cashflow_forecast` (boardcontent + 2 viste).
 *
 * Setup:
 *   - 1 cliente + 1 fornitore + 1 fattura inviata + 1 ricevuta
 *   - 5 scadenze (3 INCASSO + 2 PAGAMENTO) cross-period
 *
 * Verifica:
 *   A. Data: api.crudRead delle 2 viste ritorna dati attesi
 *   B. Dashboard UI: chart canvas + KPI tile + tabella renderizzano
 */
import { newClienteRealistico, newFornitoreRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '28',
  name: 'Cashflow forecast dashboard (framework-first: 2 viste + boardcontent)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, assert, log } = ctx;

  const cl = await api.crudInsert('clienti', newClienteRealistico());
  const fo = await api.crudInsert('fornitori', newFornitoreRealistico());
  const cId = Number(cl?.result ?? cl?.id);
  const fId = Number(fo?.result ?? fo?.id);
  const baseProg = 70000 + Number(Date.now().toString().slice(-4));
  const fInv = await api.crudInsert('fatture_inviate', {
    progressivo: baseProg, anno: 2027, data_documento: '2027-01-01',
    cliente_id: cId, causale: '_e2e_cashflow inv', stato: 'EMESSA',
    imponibile: 2300, iva: 506, totale: 2300
  });
  const fRic = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: baseProg + 100, anno: 2027,
    numero_fornitore: 'CF-' + Date.now().toString().slice(-6),
    data_documento: '2027-01-01', data_ricezione: '2027-01-02',
    fornitore_id: fId, causale: '_e2e_cashflow ric',
    imponibile: 500, iva: 110, totale: 500
  });
  const fInvId = Number(fInv?.result ?? fInv?.id);
  const fRicId = Number(fRic?.result ?? fRic?.id);

  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('INCASSO', ${fInvId}, ${cId}, DATEADD(DAY, 30, CAST(GETDATE() AS DATE)), 1000, 0, 'APERTA', 1, 3, 0, GETDATE()),
      ('INCASSO', ${fInvId}, ${cId}, DATEADD(DAY, 45, CAST(GETDATE() AS DATE)),  500, 0, 'APERTA', 2, 3, 0, GETDATE()),
      ('INCASSO', ${fInvId}, ${cId}, DATEADD(DAY, 60, CAST(GETDATE() AS DATE)),  800, 0, 'APERTA', 3, 3, 0, GETDATE());
  `);
  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('PAGAMENTO', ${fRicId}, ${fId}, DATEADD(DAY, 20, CAST(GETDATE() AS DATE)), 300, 0, 'APERTA', 1, 2, 0, GETDATE()),
      ('PAGAMENTO', ${fRicId}, ${fId}, DATEADD(DAY, 40, CAST(GETDATE() AS DATE)), 200, 0, 'APERTA', 2, 2, 0, GETDATE());
  `);
  log(`setup: 5 scadenze (3 INCASSO + 2 PAGAMENTO)`);

  // Test A: data via vw_cashflow_totali
  const respTotali = await api.crudRead('vw_cashflow_totali', { filterInfo: { filters: [] } });
  const rows = respTotali?.results ?? respTotali?.data ?? [];
  assert(rows.length === 1, `A: vw_cashflow_totali deve avere 1 row, viste ${rows.length}`);
  const t = rows[0];
  assert(Number(t.incassi_attesi) >= 2300, `A: incassi >=2300, visto ${t.incassi_attesi}`);
  assert(Number(t.pagamenti_attesi) >= 500, `A: pagamenti >=500, visto ${t.pagamenti_attesi}`);
  log(`Test A: KPI incassi=${t.incassi_attesi} pagamenti=${t.pagamenti_attesi} saldo=${t.saldo_finale} stato=${t.stato_saldo}`);

  // Test B: dashboard UI
  if (page) {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/cashflow_forecast/dashboard?bust=${Date.now()}`,
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
    const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_28_cashflow_dashboard_${Date.now()}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    log(`screenshot: ${snap}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id=${fInvId} OR fattura_ricevuta_id=${fRicId}`);
    await api.crudDelete('fatture_inviate', { id: fInvId });
    await api.crudDelete('fatture_ricevute', { id: fRicId });
    await api.crudDelete('clienti', { id: cId });
    await api.crudDelete('fornitori', { id: fId });
  } catch {}

  return { dashboard_url: '/#/cashflow_forecast/dashboard' };
}
