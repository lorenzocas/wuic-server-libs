/**
 * Test 65: toolbar action `magazzino_giacenze / Inventario fisico`.
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '65',
  name: 'Toolbar action: magazzino_giacenze/Inventario fisico',
  area: 'actions',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  const a = await queryOne(`
    SELECT a.id1, a.buttoncaption, LEN(CAST(a.actioncallback AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._mtdt__cstom__actions__tabelle a
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id = a.mdid
    WHERE t.mdroutename='magazzino_giacenze' AND a.buttoncaption LIKE '%nventario%fisico%'
  `);
  assert(a?.id1, 'action Inventario fisico non trovata');
  assert(Number(a.cb_len) > 100, `callback troppo corto`);
  log(`metadata: id1=${a.id1}, cb_len=${a.cb_len}`);

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzino_giacenze/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const tbDropdown = page.locator('wuic-list-grid .p-splitbutton-dropdown, .p-toolbar .p-splitbutton-dropdown').first();
  if (await tbDropdown.count() > 0) {
    await tbDropdown.click({ force: true });
    await page.waitForTimeout(600);
  }
  const actionItem = page.locator(':text("Inventario fisico"):visible').first();
  assert(await actionItem.isVisible().catch(() => false), '"Inventario fisico" non visibile');
  log(`button toolbar visibile ✓`);

  await actionItem.click({ force: true });
  await page.waitForTimeout(1500);

  const warnToast = await page.locator('p-toast .p-toast-message-warn, p-toast .p-toast-message:has-text("selezion")').first().isVisible().catch(() => false);
  const dialog = await page.locator('p-dialog:visible, .p-dialog:visible').count();
  assert(warnToast || dialog > 0, 'click action: nessun side-effect visibile');
  log(`side-effect OK: warnToast=${warnToast}, dialog=${dialog}`);

  return { actionId: a.id1, route: 'magazzino_giacenze', caption: 'Inventario fisico' };
}
