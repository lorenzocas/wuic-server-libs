/**
 * Test 08 — render dashboard `home` (board-only, /home/dashboard).
 * Verifica: la pagina apre senza errori, contiene il container board e
 * almeno N tile DATASOURCE attesi.
 */
import { snap } from '../_shared/ui-helpers.mjs';

export const meta = { id: '08', name: 'Dashboard render: home', needsUi: true };

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/home/dashboard`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-dashboard, wuic-data-repeater', { state: 'attached', timeout: 30000 });
  await page.waitForTimeout(2000);

  const datasources = await page.locator('wuic-dashboard, wuic-data-repeater, wuic-list-grid, wuic-data-source').count();
  log(`tiles found: ${datasources}`);
  assert(datasources >= 2, `attesi >=2 tile, trovati ${datasources}`);

  // Nessun dialog di errore visibile
  const errDialog = await page.locator('p-dialog .p-dialog-header:has-text("error"), p-dialog .p-dialog-header:has-text("Errore")').count();
  assert(errDialog === 0, `dialog di errore visibile`);

  await snap(page, 'dashboard-home');
  return { tiles: datasources };
}
