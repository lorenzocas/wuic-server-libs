/**
 * Test 14 — render dashboard `costi_forecast` (clone cashflow_forecast FE).
 */
import { snap } from '../_shared/ui-helpers.mjs';

export const meta = { id: '14', name: 'Dashboard render: costi_forecast', needsUi: true };

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/costi_forecast/dashboard`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-dashboard, wuic-data-repeater', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(2000);

  const tiles = await page.locator('wuic-dashboard, wuic-data-repeater, wuic-list-grid, wuic-data-source').count();
  log(`tiles: ${tiles}`);
  assert(tiles >= 1, `attesi >=1 tile, trovati ${tiles}`);

  const errDialog = await page.locator('p-dialog .p-dialog-header:has-text("Errore")').count();
  assert(errDialog === 0, `dialog di errore`);

  await snap(page, 'dashboard-costi-forecast');
  return { tiles };
}
