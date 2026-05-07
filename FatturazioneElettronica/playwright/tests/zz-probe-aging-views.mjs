/**
 * Probe (non-test): verifica visiva che le 3 viste aging crediti scaffoldate
 * rendano correttamente come list-grid framework + chart archetype.
 *
 * Non e' un test pass/fail — solo screenshot per ispezione manuale prima di
 * investire effort in boardcontent dashboard.
 */
import { newClienteRealistico } from '../_shared/test-data.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: 'zz_probe_aging',
  name: 'PROBE: 3 viste aging crediti standalone (list+chart)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, assert, log } = ctx;
  if (!page) { log('SKIP: no page'); return; }

  // Setup minimal: 1 cliente + 1 fattura + 5 scadenze cross-bucket
  const c = await api.crudInsert('clienti', newClienteRealistico());
  const cId = Number(c?.result ?? c?.id);
  const fProg = 95000 + Number(Date.now().toString().slice(-4));
  const f = await api.crudInsert('fatture_inviate', {
    progressivo: fProg, anno: 2027, data_documento: '2027-01-01',
    cliente_id: cId, causale: '_e2e_probe aging', stato: 'EMESSA',
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
  log(`setup: cliente=${cId} fattura=${fId} 5 scadenze cross-bucket`);

  // Helper: navigate + dismiss stale + screenshot
  const probe = async (path, label) => {
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${path}?bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);
    try {
      const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok")').first();
      if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await okBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {}
    const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_${label}_${Date.now()}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    log(`  ${label}: ${snap}`);
    return snap;
  };

  await probe('vw_aging_crediti_totali/list',  'totali_list');
  await probe('vw_aging_crediti_buckets/list', 'buckets_list');
  await probe('vw_aging_crediti_buckets/chart','buckets_chart');
  await probe('vw_aging_crediti_clienti/list', 'clienti_list');
  await probe('vw_aging_crediti_clienti/chart','clienti_chart');

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id = ${fId}`);
    await api.crudDelete('fatture_inviate', { id: fId });
    await api.crudDelete('clienti', { id: cId });
  } catch {}
}
