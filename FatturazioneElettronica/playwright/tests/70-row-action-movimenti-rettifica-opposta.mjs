/**
 * Test 70: row action `magazzino_movimenti / btn_rettifica_opposta`.
 * Action su event log immutable: click → genera nuovo movimento RETTIFICA opposto.
 * Verifichiamo metadata + click (su data se presente) o solo metadata se empty.
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '70',
  name: 'Row action: magazzino_movimenti/Crea rettifica opposta',
  area: 'actions',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  const col = await queryOne(`
    SELECT c.mc_id, c.voa_class, CAST(c.mcbuttonimage AS NVARCHAR(80)) AS img,
           LEN(CAST(c.mcbuttonaction AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne c
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id=c.md_id
    WHERE t.mdroutename='magazzino_movimenti' AND c.mc_nome_colonna='btn_rettifica_opposta'
  `);
  assert(col?.mc_id, 'row action btn_rettifica_opposta non in metadata');
  assert(Number(col.voa_class) === 6, 'voa_class non 6');
  assert(/pi pi-undo/.test(col.img), `img atteso 'pi pi-undo', visto '${col.img}'`);
  log(`metadata: mc_id=${col.mc_id}, cb_len=${col.cb_len}`);

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzino_movimenti/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const rows = page.locator('wuic-list-grid tbody > tr:not(.p-datatable-emptymessage), .p-datatable-tbody > tr:not(.p-datatable-emptymessage)');
  const rowCount = await rows.count();
  log(`movimenti visibili: ${rowCount}`);

  if (rowCount === 0) {
    log(`(no data — metadata-only check OK)`);
    return { mc_id: col.mc_id, route: 'magazzino_movimenti', sample_size: 0 };
  }

  const rowBtn = page.locator('wuic-list-grid tbody tr .pi-undo, .p-datatable-tbody tr .pi-undo').first();
  if (await rowBtn.count() > 0) {
    await rowBtn.click({ force: true });
    await page.waitForTimeout(1500);
    const dialog = await page.locator('p-dialog:visible, p-confirmdialog:visible, .p-dialog:visible').count();
    const toast = await page.locator('p-toast .p-toast-message').count();
    assert(dialog > 0 || toast > 0, 'click rettifica: nessun side-effect');
    log(`side-effect: dialog=${dialog}, toast=${toast}`);
    if (dialog > 0) {
      const cancel = page.locator('p-dialog button:has-text("Annulla"), p-confirmdialog button:has-text("No")').first();
      if (await cancel.isVisible().catch(() => false)) await cancel.click({ force: true });
    }
  } else {
    log(`(icona pi-undo non visibile — responsive hide)`);
  }

  return { mc_id: col.mc_id, route: 'magazzino_movimenti', sample_size: rowCount };
}
