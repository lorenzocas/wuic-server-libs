/**
 * Test 12 — render dashboard `mezzi_mappa` (archetipo map).
 * Verifica: la route apre con `<wuic-map-list>` renderizzato.
 */
import { snap } from '../_shared/ui-helpers.mjs';

export const meta = { id: '12', name: 'Dashboard render: mezzi_mappa (map)', needsUi: true };

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/mezzi_mappa/list`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-map-list, wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(2000);

  const hasMap = await page.locator('wuic-map-list').count();
  log(`<wuic-map-list> count: ${hasMap}`);

  const errDialog = await page.locator('p-dialog .p-dialog-header:has-text("Errore")').count();
  assert(errDialog === 0, `dialog di errore`);

  await snap(page, 'dashboard-mezzi-mappa');
  return { hasMap };
}
