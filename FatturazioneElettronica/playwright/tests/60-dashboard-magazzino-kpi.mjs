/**
 * Test 60: Dashboard `magazzino_kpi` render + screenshot.
 *
 * Verifica:
 *  1) Boardcontent presente in DB (DATALENGTH > 50KB)
 *  2) Navigate apre senza error dialog
 *  3) Counts elementi DOM coerenti col layout target (4 KPI + 1 chart + 1 list)
 *  4) Screenshot full-page > 30 KB salvato in playwright/screenshots/
 */
import { statSync } from 'node:fs';
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '60',
  name: 'Dashboard magazzino_kpi (4 KPI + stacked bar + tabella)',
  area: 'dashboard',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  // 1) Boardcontent persistito
  const board = await queryOne(`
    SELECT boardroute, boarddes, DATALENGTH(boardcontent) AS bytes
    FROM FatturazioneElettronica_Metadata.dbo.dom_board
    WHERE boardroute = 'magazzino_kpi'
  `);
  assert(board?.boardroute === 'magazzino_kpi', 'magazzino_kpi non in dom_board');
  assert(Number(board.bytes) > 50000, `boardcontent too small: ${board.bytes}b`);
  log(`boardcontent persistito: ${board.bytes}b`);

  // 2) Cleanup client cache + navigate
  await page.evaluate(async () => {
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    try { await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); }); } catch {}
  });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzino_kpi/dashboard?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(8000);

  // 3) NO error dialog (NON dismissare)
  const errDialog = await page.locator('p-dialog .p-dialog-header, p-confirmdialog .p-dialog-header').count();
  assert(errDialog === 0, `error dialog visible (count=${errDialog}). Fix root cause, no dismiss.`);

  // 4) Counts DOM coerenti col layout (4 KPI tile span + 1 chart canvas + 1 list-grid)
  const counts = await page.evaluate(() => ({
    dataSource: document.querySelectorAll('wuic-data-source').length,
    dataRepeater: document.querySelectorAll('wuic-data-repeater').length,
    listGrid: document.querySelectorAll('wuic-list-grid').length,
    charts: document.querySelectorAll('canvas').length,
    dashboardInnerLen: document.querySelector('wuic-dashboard')?.innerHTML?.length ?? 0
  }));
  log(`DOM: ds=${counts.dataSource}, dr=${counts.dataRepeater}, lg=${counts.listGrid}, charts=${counts.charts}, dashInner=${counts.dashboardInnerLen}`);
  assert(counts.dashboardInnerLen > 5000, `dashboard near-empty (innerHTML=${counts.dashboardInnerLen})`);
  assert(counts.dataSource >= 4, `expected >=4 datasource (1 KPI shared x4 tiles), got ${counts.dataSource}`);
  assert(counts.charts >= 1, `expected >=1 chart canvas, got ${counts.charts}`);
  assert(counts.listGrid >= 1, `expected >=1 list-grid (tabella dettaglio), got ${counts.listGrid}`);

  // 5) Screenshot full-page (obbligatorio)
  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_60_magazzino_kpi_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: true });
  const sz = statSync(snap).size;
  assert(sz > 30000, `screenshot too small (${sz}b) — dashboard likely empty`);
  log(`screenshot OK: ${sz}b → ${snap}`);

  return { boardroute: 'magazzino_kpi', screenshot: snap, size: sz, counts };
}
