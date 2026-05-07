/**
 * Test 29 (refactor framework-first): Workflow #18 — Top clienti per fatturato
 * via dashboard `top_clienti` (boardcontent + 2 viste).
 */
import { newClienteRealistico } from '../_shared/test-data.mjs';

export const meta = {
  id: '29',
  name: 'Top clienti dashboard (framework-first)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, page, assert, log } = ctx;
  const yearNow = new Date().getFullYear();

  const cl1 = await api.crudInsert('clienti', newClienteRealistico());
  const cl2 = await api.crudInsert('clienti', newClienteRealistico());
  const cl3 = await api.crudInsert('clienti', newClienteRealistico());
  const idA = Number(cl1?.result ?? cl1?.id);
  const idB = Number(cl2?.result ?? cl2?.id);
  const idC = Number(cl3?.result ?? cl3?.id);

  const baseProg = 80000 + Number(Date.now().toString().slice(-4));
  const fIds = [];
  // Cliente A: 8000, B: 4000, C: 2000
  const data = [
    { cId: idA, totale: 5000, prog: baseProg + 1, data: `${yearNow}-01-15` },
    { cId: idA, totale: 3000, prog: baseProg + 2, data: `${yearNow}-02-20` },
    { cId: idB, totale: 4000, prog: baseProg + 3, data: `${yearNow}-01-10` },
    { cId: idC, totale: 1500, prog: baseProg + 4, data: `${yearNow}-02-01` },
    { cId: idC, totale:  500, prog: baseProg + 5, data: `${yearNow}-03-05` }
  ];
  for (const d of data) {
    const f = await api.crudInsert('fatture_inviate', {
      progressivo: d.prog, anno: yearNow, data_documento: d.data,
      cliente_id: d.cId, causale: '_e2e_topcli', stato: 'EMESSA',
      imponibile: d.totale * 0.82, iva: d.totale * 0.18, totale: d.totale
    });
    fIds.push(Number(f?.result ?? f?.id));
  }
  log(`setup: 3 clienti A=8k B=4k C=2k`);

  // Test A: data via vw_top_clienti_anno
  const respAnno = await api.crudRead('vw_top_clienti_anno', { filterInfo: { filters: [] } });
  const rowsAnno = respAnno?.results ?? respAnno?.data ?? [];
  const ourA = rowsAnno.find(r => Number(r.cliente_id) === idA);
  const ourB = rowsAnno.find(r => Number(r.cliente_id) === idB);
  const ourC = rowsAnno.find(r => Number(r.cliente_id) === idC);
  assert(ourA && Number(ourA.totale_fatturato) === 8000, `A: cliente A totale=8000, visto ${ourA?.totale_fatturato}`);
  assert(ourB && Number(ourB.totale_fatturato) === 4000, `A: cliente B totale=4000, visto ${ourB?.totale_fatturato}`);
  assert(ourC && Number(ourC.totale_fatturato) === 2000, `A: cliente C totale=2000, visto ${ourC?.totale_fatturato}`);
  log(`Test A: 3 clienti aggregati corretti via vw_top_clienti_anno`);

  // Test B: dashboard UI
  if (page) {
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
    const chartCount = await page.locator('canvas').count();
    assert(chartCount >= 1, `B: atteso >=1 canvas, visto ${chartCount}`);
    log(`Test B UI: chart canvas=${chartCount}`);
    const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_29_top_clienti_dashboard_${Date.now()}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    log(`screenshot: ${snap}`);
  }

  try {
    for (const fid of fIds) await api.crudDelete('fatture_inviate', { id: fid });
    await api.crudDelete('clienti', { id: idA });
    await api.crudDelete('clienti', { id: idB });
    await api.crudDelete('clienti', { id: idC });
  } catch {}

  return { dashboard_url: '/#/top_clienti/dashboard' };
}
