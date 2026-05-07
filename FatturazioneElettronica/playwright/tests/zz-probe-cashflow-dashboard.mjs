/**
 * Probe (non-test): verifica visiva dashboard cashflow_forecast (refactor #17).
 */
import { newClienteRealistico, newFornitoreRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: 'zz_probe_cashflow_dash',
  name: 'PROBE: dashboard cashflow_forecast',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, log } = ctx;
  if (!page) { log('SKIP: no page'); return; }

  // Setup minimal: 1 cliente + 1 fornitore + 1 fatt + scadenze cross-bucket
  const c = await api.crudInsert('clienti', newClienteRealistico());
  const f = await api.crudInsert('fornitori', newFornitoreRealistico());
  const cId = Number(c?.result ?? c?.id);
  const fId = Number(f?.result ?? f?.id);
  const baseProg = 97000 + Number(Date.now().toString().slice(-4));
  const fInv = await api.crudInsert('fatture_inviate', {
    progressivo: baseProg, anno: 2027, data_documento: '2027-01-01',
    cliente_id: cId, causale: '_e2e_cf inviata', stato: 'EMESSA',
    imponibile: 3000, iva: 660, totale: 3000
  });
  const fRic = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: baseProg + 100, anno: 2027,
    numero_fornitore: 'CF-' + Date.now().toString().slice(-6),
    data_documento: '2027-01-01', data_ricezione: '2027-01-02',
    fornitore_id: fId, causale: '_e2e_cf ricevuta',
    imponibile: 800, iva: 176, totale: 800
  });
  const fInvId = Number(fInv?.result ?? fInv?.id);
  const fRicId = Number(fRic?.result ?? fRic?.id);

  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('INCASSO', ${fInvId}, ${cId}, DATEADD(DAY, 20, CAST(GETDATE() AS DATE)), 1500, 0, 'APERTA', 1, 2, 0, GETDATE()),
      ('INCASSO', ${fInvId}, ${cId}, DATEADD(DAY, 50, CAST(GETDATE() AS DATE)), 1500, 0, 'APERTA', 2, 2, 0, GETDATE());
  `);
  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('PAGAMENTO', ${fRicId}, ${fId}, DATEADD(DAY, 30, CAST(GETDATE() AS DATE)), 800, 0, 'APERTA', 1, 1, 0, GETDATE());
  `);

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
  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_cashflow_dash_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: false });
  log(`screenshot: ${snap}`);

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id = ${fInvId} OR fattura_ricevuta_id = ${fRicId}`);
    await api.crudDelete('fatture_inviate', { id: fInvId });
    await api.crudDelete('fatture_ricevute', { id: fRicId });
    await api.crudDelete('clienti', { id: cId });
    await api.crudDelete('fornitori', { id: fId });
  } catch {}
}
