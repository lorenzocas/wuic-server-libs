/**
 * Test 66: toolbar action `magazzino_giacenze / Riconcilia snapshot`.
 * Action non-distruttiva (rebuild snapshot da movimenti) → idempotente; click
 * diretto e verifica toast success o dialog.
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '66',
  name: 'Toolbar action: magazzino_giacenze/Riconcilia snapshot',
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
    WHERE t.mdroutename='magazzino_giacenze' AND a.buttoncaption LIKE '%iconcilia%snapshot%'
  `);
  assert(a?.id1, 'action Riconcilia snapshot non trovata');
  log(`metadata: id1=${a.id1}, cb_len=${a.cb_len}`);

  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzino_giacenze/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const tbDropdown = page.locator('wuic-list-grid .p-splitbutton-dropdown, .p-toolbar .p-splitbutton-dropdown').first();
  if (await tbDropdown.count() > 0) {
    await tbDropdown.click({ force: true });
    await page.waitForTimeout(600);
  }
  const actionItem = page.locator(':text("Riconcilia snapshot"):visible').first();
  assert(await actionItem.isVisible().catch(() => false), '"Riconcilia snapshot" non visibile');
  log(`button toolbar visibile ✓`);

  // Confirm dialog atteso (action mutativa). Click → ok dialog → toast/refresh.
  await actionItem.click({ force: true });
  await page.waitForTimeout(1500);

  const dialog = await page.locator('p-dialog:visible, .p-dialog:visible, p-confirmdialog:visible').count();
  const toastAny = await page.locator('p-toast .p-toast-message').count();
  assert(dialog > 0 || toastAny > 0, 'click action: ne dialog ne toast visibili');
  log(`side-effect OK: dialog=${dialog}, toast=${toastAny}`);

  // Cleanup: chiudi eventuali dialog/toast aperti
  if (dialog > 0) {
    const cancelBtn = page.locator('p-dialog button:has-text("Annulla"), p-confirmdialog button:has-text("No")').first();
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click({ force: true });
    }
  }

  return { actionId: a.id1, route: 'magazzino_giacenze', caption: 'Riconcilia snapshot' };
}
