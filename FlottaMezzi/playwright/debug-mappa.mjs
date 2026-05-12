import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`pe:${e.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`ce:${m.text().slice(0, 200)}`); });

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
// Invalidate server-side metadata cache
await page.request.post('http://localhost:5100/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime', { data: {} });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.goto('http://localhost:4200/#/mezzi_mappa/map', { waitUntil: 'load' });
await page.waitForTimeout(8000);

const data = await page.evaluate(() => ({
  maps: document.querySelectorAll('wuic-map-list, wuic-map, google-map, gmp-map').length,
  mapDivs: document.querySelectorAll('div[role="region"]').length,
  markers: document.querySelectorAll('gmp-advanced-marker, [aria-label*="marker"]').length,
  bodyText: document.body.innerText.slice(0, 200),
  bodyScrollH: document.body.scrollHeight,
}));
console.log(JSON.stringify(data, null, 2));
console.log('Errors:', errs.slice(0, 10));
await page.screenshot({ path: './screenshots/dash_mezzi_mappa_FIXED.png', fullPage: false });
await browser.close();
