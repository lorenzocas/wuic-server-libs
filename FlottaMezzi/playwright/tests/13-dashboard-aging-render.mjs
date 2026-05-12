/**
 * Test 13 — render dashboard `aging_scadenze` (clone aging_crediti FE).
 */
import { snap } from '../_shared/ui-helpers.mjs';

export const meta = { id: '13', name: 'Dashboard render: aging_scadenze', needsUi: true };

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/aging_scadenze/dashboard`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-dashboard, wuic-data-repeater, wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const tiles = await page.locator('wuic-dashboard, wuic-data-repeater, wuic-list-grid').count();
  log(`tiles: ${tiles}`);
  assert(tiles >= 1, `attesi >=1 tile, trovati ${tiles}`);

  const errDialog = await page.locator('p-dialog .p-dialog-header:has-text("Errore")').count();
  assert(errDialog === 0, `dialog di errore`);

  await snap(page, 'dashboard-aging');
  return { tiles };
}
