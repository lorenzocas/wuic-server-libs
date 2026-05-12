import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const ROUTES = ['home', 'aging_scadenze', 'costi_forecast', 'top_mezzi', 'mezzi_mappa'];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

const results = [];
for (const route of ROUTES) {
  const url = route === 'mezzi_mappa'
    ? `http://localhost:4200/#/${route}/list`
    : `http://localhost:4200/#/${route}/dashboard`;
  const errors = [];
  page.on('pageerror', err => errors.push(`pe:${err.message.slice(0, 200)}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(7000);

  const data = await page.evaluate(() => {
    const dlg = document.querySelector('.p-dialog-content, p-dialog .p-dialog-content');
    const dashboard = document.querySelector('wuic-dashboard');
    const charts = document.querySelectorAll('p-chart canvas, .p-chart canvas');
    const grids = document.querySelectorAll('wuic-list-grid');
    const maps = document.querySelectorAll('wuic-map-list, wuic-map');
    const dataRepeaters = document.querySelectorAll('wuic-data-repeater');
    return {
      dialog: dlg ? dlg.innerText.slice(0, 200) : null,
      dashboardHTML_len: dashboard?.innerHTML?.length ?? 0,
      charts_total: charts.length,
      charts_visible: Array.from(charts).filter(c => { const r = c.getBoundingClientRect(); return r.width > 30 && r.height > 30; }).length,
      grids_total: grids.length,
      grids_visible: Array.from(grids).filter(g => { const r = g.getBoundingClientRect(); return r.width > 50 && r.height > 50; }).length,
      maps_total: maps.length,
      dataRepeaters: dataRepeaters.length,
      bodyScrollHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
      hasOverflow: document.body.scrollHeight > window.innerHeight,
    };
  });
  await page.screenshot({ path: `./screenshots/dash_${route}_1920x1080.png`, fullPage: false });
  results.push({ route, ...data, errors: errors.slice(0, 3) });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
