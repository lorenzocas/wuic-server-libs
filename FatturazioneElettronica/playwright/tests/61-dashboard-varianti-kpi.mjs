/**
 * Test 61: Dashboard `varianti_kpi` render + screenshot.
 * Format: 4 KPI tile + vertical grouped bar (per attributo) + tabella ranking.
 */
import { statSync } from 'node:fs';
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '61',
  name: 'Dashboard varianti_kpi (4 KPI + bar per attributo + ranking)',
  area: 'dashboard',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  const board = await queryOne(`
    SELECT boardroute, DATALENGTH(boardcontent) AS bytes
    FROM FatturazioneElettronica_Metadata.dbo.dom_board
    WHERE boardroute = 'varianti_kpi'
  `);
  assert(board?.boardroute === 'varianti_kpi', 'varianti_kpi non in dom_board');
  assert(Number(board.bytes) > 50000, `boardcontent too small: ${board.bytes}b`);
  log(`boardcontent persistito: ${board.bytes}b`);

  await page.evaluate(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try { await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); }); } catch {}
  });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/varianti_kpi/dashboard?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  const errDialog = await page.locator('p-dialog .p-dialog-header, p-confirmdialog .p-dialog-header').count();
  assert(errDialog === 0, `error dialog visible (count=${errDialog})`);

  const counts = await page.evaluate(() => ({
    dataSource: document.querySelectorAll('wuic-data-source').length,
    dataRepeater: document.querySelectorAll('wuic-data-repeater').length,
    listGrid: document.querySelectorAll('wuic-list-grid').length,
    charts: document.querySelectorAll('canvas').length,
    dashboardInnerLen: document.querySelector('wuic-dashboard')?.innerHTML?.length ?? 0
  }));
  log(`DOM: ds=${counts.dataSource}, dr=${counts.dataRepeater}, lg=${counts.listGrid}, charts=${counts.charts}, dashInner=${counts.dashboardInnerLen}`);
  assert(counts.dashboardInnerLen > 5000, `dashboard near-empty (innerHTML=${counts.dashboardInnerLen})`);
  assert(counts.dataSource >= 4, `expected >=4 datasource, got ${counts.dataSource}`);
  assert(counts.charts >= 1, `expected >=1 chart canvas, got ${counts.charts}`);
  assert(counts.listGrid >= 1, `expected >=1 list-grid (ranking varianti), got ${counts.listGrid}`);

  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_61_varianti_kpi_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: true });
  const sz = statSync(snap).size;
  assert(sz > 30000, `screenshot too small (${sz}b)`);
  log(`screenshot OK: ${sz}b → ${snap}`);

  return { boardroute: 'varianti_kpi', screenshot: snap, size: sz, counts };
}
