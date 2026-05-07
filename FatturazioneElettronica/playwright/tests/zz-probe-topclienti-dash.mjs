/**
 * Probe top_clienti dashboard.
 */
import { newClienteRealistico } from '../_shared/test-data.mjs';

export const meta = {
  id: 'zz_probe_topcli',
  name: 'PROBE: dashboard top_clienti',
  area: 'workflow', needsUi: true, needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, log } = ctx;
  if (!page) { log('SKIP: no page'); return; }

  // Setup: 3 clienti con fatture annoyear corrente
  const cs = [
    await api.crudInsert('clienti', newClienteRealistico()),
    await api.crudInsert('clienti', newClienteRealistico()),
    await api.crudInsert('clienti', newClienteRealistico())
  ];
  const ids = cs.map(c => Number(c?.result ?? c?.id));
  const yearNow = new Date().getFullYear();
  const baseProg = 98000 + Number(Date.now().toString().slice(-4));
  const fatts = [];
  for (let i = 0; i < ids.length; i++) {
    const totale = (3 - i) * 5000; // 15k, 10k, 5k
    const f = await api.crudInsert('fatture_inviate', {
      progressivo: baseProg + i, anno: yearNow, data_documento: `${yearNow}-03-15`,
      cliente_id: ids[i], causale: '_e2e_topcli ' + i, stato: 'EMESSA',
      imponibile: totale * 0.82, iva: totale * 0.18, totale
    });
    fatts.push(Number(f?.result ?? f?.id));
  }

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/top_clienti/dashboard?bust=${Date.now()}`,
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
  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_topcli_dash_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: false });
  log(`screenshot: ${snap}`);

  // Cleanup
  try {
    for (const id of fatts) await api.crudDelete('fatture_inviate', { id });
    for (const id of ids) await api.crudDelete('clienti', { id });
  } catch {}
}
