/**
 * Probe (non-test): verifica visiva della dashboard `aging_crediti`
 * costruita via boardcontent + 4 widget bindati alle 3 viste aging crediti.
 *
 * Layout atteso (template 2x2):
 *   - Title row: "Aging analysis crediti"
 *   - Row 1: [KPI overview list] [Distribuzione bucket pie chart]
 *   - Row 2: [Stacked bar per cliente] [Tabella dettaglio cliente]
 */
import { newClienteRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: 'zz_probe_aging_dash',
  name: 'PROBE: dashboard aging_crediti (boardcontent + 4 widget)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, assert, log } = ctx;
  if (!page) { log('SKIP: no page'); return; }

  // Setup minimal: 1 cliente + scadenze cross-bucket
  const c = await api.crudInsert('clienti', newClienteRealistico());
  const cId = Number(c?.result ?? c?.id);
  const fProg = 96000 + Number(Date.now().toString().slice(-4));
  const f = await api.crudInsert('fatture_inviate', {
    progressivo: fProg, anno: 2027, data_documento: '2027-01-01',
    cliente_id: cId, causale: '_e2e_probe aging dash', stato: 'EMESSA',
    imponibile: 4000, iva: 880, totale: 4000
  });
  const fId = Number(f?.result ?? f?.id);
  await exec(`
    INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
    VALUES
      ('INCASSO', ${fId}, ${cId}, DATEADD(DAY,  15, CAST(GETDATE() AS DATE)), 1000, 0, 'APERTA', 1, 5, 0, GETDATE()),
      ('INCASSO', ${fId}, ${cId}, DATEADD(DAY, -10, CAST(GETDATE() AS DATE)),  300, 0, 'APERTA', 2, 5, 0, GETDATE()),
      ('INCASSO', ${fId}, ${cId}, DATEADD(DAY, -45, CAST(GETDATE() AS DATE)),  500, 0, 'APERTA', 3, 5, 0, GETDATE()),
      ('INCASSO', ${fId}, ${cId}, DATEADD(DAY, -75, CAST(GETDATE() AS DATE)),  800, 0, 'APERTA', 4, 5, 0, GETDATE()),
      ('INCASSO', ${fId}, ${cId}, DATEADD(DAY,-120, CAST(GETDATE() AS DATE)), 1400, 0, 'APERTA', 5, 5, 0, GETDATE());
  `);

  // Runtime board URL = `<boardroute>/dashboard` (verificato: home menu link = #/home/dashboard)
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/aging_crediti/dashboard?bust=${Date.now()}`,
                  { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Pre-cleanup eventuali dialog stale
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok"), .p-dialog button:has-text("ok")').first();
      if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await okBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      } else break;
    } catch { break; }
  }
  await page.waitForTimeout(1500);

  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_aging_dash_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: true });
  log(`screenshot fullPage: ${snap}`);

  // Anche screenshot con viewport piu' alto per inspection bottom widget
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.waitForTimeout(800);
  const snap2 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_aging_dash_tall_${Date.now()}.png`;
  await page.screenshot({ path: snap2, fullPage: false });
  log(`screenshot tall viewport: ${snap2}`);

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id = ${fId}`);
    await api.crudDelete('fatture_inviate', { id: fId });
    await api.crudDelete('clienti', { id: cId });
  } catch {}
}
