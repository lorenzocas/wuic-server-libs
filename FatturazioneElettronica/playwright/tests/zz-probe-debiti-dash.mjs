import { newFornitoreRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';
export const meta = { id: 'zz_probe_debiti', name: 'PROBE: aging_debiti dash', area: 'workflow', needsUi: true, needsApi: true };
export async function run(ctx) {
  const { api, baseUrl, page, log } = ctx;
  if (!page) { log('SKIP'); return; }
  const f = await api.crudInsert('fornitori', newFornitoreRealistico());
  const fId = Number(f?.result ?? f?.id);
  const baseProg = 99000 + Number(Date.now().toString().slice(-4));
  const fr = await api.crudInsert('fatture_ricevute', {
    progressivo_interno: baseProg, anno: 2027,
    numero_fornitore: 'AD-' + Date.now().toString().slice(-6),
    data_documento: '2027-01-01', data_ricezione: '2027-01-02',
    fornitore_id: fId, causale: '_e2e_aging_debiti probe',
    imponibile: 2000, iva: 440, totale: 2000
  });
  const frId = Number(fr?.result ?? fr?.id);
  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_ricevuta_id, fornitore_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('PAGAMENTO', ${frId}, ${fId}, DATEADD(DAY, 20, CAST(GETDATE() AS DATE)), 800, 0, 'APERTA', 1, 3, 0, GETDATE()),
      ('PAGAMENTO', ${frId}, ${fId}, DATEADD(DAY, -50, CAST(GETDATE() AS DATE)), 400, 0, 'APERTA', 2, 3, 0, GETDATE()),
      ('PAGAMENTO', ${frId}, ${fId}, DATEADD(DAY, -100, CAST(GETDATE() AS DATE)), 800, 0, 'APERTA', 3, 3, 0, GETDATE());
  `);
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/aging_debiti/dashboard?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
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
  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_debiti_dash_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: false });
  log(`screenshot: ${snap}`);
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_ricevuta_id = ${frId}`);
    await api.crudDelete('fatture_ricevute', { id: frId });
    await api.crudDelete('fornitori', { id: fId });
  } catch {}
}
