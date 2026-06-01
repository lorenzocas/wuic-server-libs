/**
 * Test 64: toolbar action `magazzini / Movimento manuale`.
 * Click senza selezione → toast warn atteso (callback richiede magazzino selezionato).
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '64',
  name: 'Toolbar action: magazzini/Movimento manuale',
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
    WHERE t.mdroutename='magazzini' AND a.buttoncaption LIKE '%ovimento%manuale%'
  `);
  assert(a?.id1, 'action Movimento manuale su magazzini non trovata');
  assert(Number(a.cb_len) > 100, `callback troppo corto (${a.cb_len}b)`);
  log(`metadata: id1=${a.id1}, cb_len=${a.cb_len}`);

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzini/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const tbDropdown = page.locator('wuic-list-grid .p-splitbutton-dropdown, .p-toolbar .p-splitbutton-dropdown').first();
  if (await tbDropdown.count() > 0) {
    await tbDropdown.click({ force: true });
    await page.waitForTimeout(600);
  }
  const actionItem = page.locator(':text("Movimento manuale"):visible').first();
  assert(await actionItem.isVisible().catch(() => false), '"Movimento manuale" non visibile');
  log(`button toolbar visibile ✓`);

  await actionItem.click({ force: true });
  await page.waitForTimeout(1500);

  const warnToast = await page.locator('p-toast .p-toast-message-warn, p-toast .p-toast-message:has-text("selezion")').first().isVisible().catch(() => false);
  const dialog = await page.locator('p-dialog:visible, .p-dialog:visible').count();
  assert(warnToast || dialog > 0, 'click action: ne toast warn ne dialog visibili');
  log(`side-effect OK: warnToast=${warnToast}, dialog=${dialog}`);

  return { actionId: a.id1, route: 'magazzini', caption: 'Movimento manuale' };
}
