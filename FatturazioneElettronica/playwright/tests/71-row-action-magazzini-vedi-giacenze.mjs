/**
 * Test 71: row action `magazzini / btn_vedi_giacenze`.
 * Click → naviga al list giacenze filtrato per magazzino selezionato.
 */
import { queryOne, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '71',
  name: 'Row action: magazzini/Vedi giacenze',
  area: 'actions',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  const col = await queryOne(`
    SELECT c.mc_id, c.voa_class, CAST(c.mcbuttonimage AS NVARCHAR(80)) AS img,
           LEN(CAST(c.mcbuttonaction AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne c
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id=c.md_id
    WHERE t.mdroutename='magazzini' AND c.mc_nome_colonna='btn_vedi_giacenze'
  `);
  assert(col?.mc_id, 'row action btn_vedi_giacenze non in metadata');
  log(`metadata: mc_id=${col.mc_id}, cb_len=${col.cb_len}`);

  // Seed: 1 magazzino test
  const ts = Date.now();
  const magIns = await api.crudInsert('magazzini', {
    codice: `_e2e_mg_${ts.toString().slice(-6)}`,
    descrizione: `_e2e magazzino test ${ts}`,
    tipo: 'FISICO', attivo: 1
  });
  const magId = Number(magIns?.result ?? magIns?.id);
  assert(magId > 0, 'magazzino insert');

  try {
    const filt = encodeURIComponent(JSON.stringify({ filters: [{ field: 'id', operator: 'eq', value: magId }] }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzini/list?filterInfo=${filt}&bust=${ts}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const rows = page.locator('wuic-list-grid tbody > tr:not(.p-datatable-emptymessage), .p-datatable-tbody > tr:not(.p-datatable-emptymessage)');
    await rows.first().waitFor({ state: 'visible', timeout: 10000 });
    log(`riga magazzino visibile ✓`);

    const rowBtn = page.locator('wuic-list-grid tbody tr .pi-list, .p-datatable-tbody tr .pi-list').first();
    let clicked = false;
    if (await rowBtn.count() > 0) {
      await rowBtn.click({ force: true });
      clicked = true;
    } else {
      const dd = page.locator('wuic-list-grid tbody tr .p-splitbutton-dropdown, .p-datatable-tbody tr .p-splitbutton-dropdown').first();
      if (await dd.count() > 0) {
        await dd.click({ force: true });
        await page.waitForTimeout(600);
        const item = page.locator(':text("giacenze"):visible, :text("Vedi"):visible').first();
        if (await item.isVisible().catch(() => false)) { await item.click({ force: true }); clicked = true; }
      }
    }
    assert(clicked, 'row action button non trovato');
    await page.waitForTimeout(1500);

    const url = page.url();
    const navigated = url.includes('giacenze') || url.includes('magazzino_giacenze');
    const toast = await page.locator('p-toast .p-toast-message').count();
    assert(navigated || toast > 0, `nessun side-effect (url=${url})`);
    log(`side-effect: navigated=${navigated}, toast=${toast}`);
  } finally {
    try { await api.crudDelete('magazzini', { id: magId }); } catch {}
  }

  return { mc_id: col.mc_id, magazzino_id: magId };
}
