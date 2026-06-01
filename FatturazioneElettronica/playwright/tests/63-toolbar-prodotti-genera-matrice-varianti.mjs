/**
 * Test 63: toolbar action `prodotti / Genera matrice varianti`.
 *
 * Verifica:
 *  1) Action metadata presente in _mtdt__cstom__actions__tabelle
 *  2) Navigate /prodotti/list → trovare il button toolbar "Genera matrice varianti"
 *  3) Click senza selezione → toast warn "selezione" (callback richiede 1 row)
 *  4) Cleanup nessuno (no side-effect senza selezione)
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '63',
  name: 'Toolbar action: prodotti/Genera matrice varianti',
  area: 'actions',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  // 1) Metadata sanity
  const a = await queryOne(`
    SELECT a.id1, a.buttoncaption,
           LEN(CAST(a.actioncallback AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._mtdt__cstom__actions__tabelle a
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id = a.mdid
    WHERE t.mdroutename='prodotti' AND a.buttoncaption LIKE '%matrice%'
  `);
  assert(a?.id1, 'action "Genera matrice varianti" su prodotti non trovata');
  assert(Number(a.cb_len) > 200, `callback troppo corto (${a.cb_len}b)`);
  log(`metadata action: id1=${a.id1}, cb_len=${a.cb_len}`);

  // 2) Navigate + cerca button toolbar
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/prodotti/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Toolbar action splitbutton menu — cerca menu item per testo
  const tbDropdown = page.locator('wuic-list-grid .p-splitbutton-dropdown, .p-toolbar .p-splitbutton-dropdown').first();
  const hasDropdown = await tbDropdown.count();
  if (hasDropdown > 0) {
    await tbDropdown.click({ force: true });
    await page.waitForTimeout(600);
  }

  const actionItem = page.locator(':text("Genera matrice varianti"):visible').first();
  const visible = await actionItem.isVisible().catch(() => false);
  assert(visible, '"Genera matrice varianti" non visibile in toolbar/menu');
  log(`button toolbar visibile ✓`);

  // 3) Click senza selezione → toast warn atteso (callback richiede 1 prodotto selezionato)
  await actionItem.click({ force: true });
  await page.waitForTimeout(1500);

  const warnToast = await page.locator(
    'p-toast .p-toast-message-warn, p-toast .p-toast-message:has-text("selezion")'
  ).first().isVisible().catch(() => false);
  // Anche un dialog conferma e' un side-effect accettabile (il callback puo'
  // mostrare un prompt prima di richiedere selezione).
  const dialog = await page.locator('p-dialog:visible, .p-dialog:visible').count();
  assert(warnToast || dialog > 0, 'click action senza selezione: ne toast warn ne dialog visibili');
  log(`side-effect OK: warnToast=${warnToast}, dialog=${dialog}`);

  return { actionId: a.id1, route: 'prodotti', caption: 'Genera matrice varianti' };
}
