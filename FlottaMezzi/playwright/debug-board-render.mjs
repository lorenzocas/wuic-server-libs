import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const route = process.argv[2] || 'home';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', err => errors.push(`[pageerror] ${err.message.slice(0, 300)}`));
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 300)}`);
});
page.on('response', r => {
  if (r.status() >= 400) errors.push(`[${r.status()}] ${r.url().slice(0, 150)}`);
});

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

console.log(`=== /${route}/dashboard ===`);
errors.length = 0;  // reset prima della navigate
await page.goto(`http://localhost:4200/#/${route}/dashboard`, { waitUntil: 'load' });
await page.waitForTimeout(8000);  // attesa lunga per chart rendering

const inner = await page.evaluate(() => {
  const dash = document.querySelector('wuic-dashboard');
  return {
    outer_first300: dash?.outerHTML?.slice(0, 300),
    inner_first500: dash?.innerHTML?.slice(0, 500),
    parent: dash?.parentElement?.tagName + ' attrs:' + Array.from(dash?.parentElement?.attributes || []).map(a => `${a.name}="${a.value}"`.slice(0,80)).join(' ')
  };
});
console.log('wuic-dashboard:', JSON.stringify(inner, null, 2));

const dom = await page.evaluate(() => ({
  dashboard_count: document.querySelectorAll('wuic-dashboard').length,
  dashboard_visible: Array.from(document.querySelectorAll('wuic-dashboard')).filter(e => {
    const s = getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }).length,
  dashboard_innerHTML_length: document.querySelector('wuic-dashboard')?.innerHTML?.length ?? 0,
  data_repeater: document.querySelectorAll('wuic-data-repeater').length,
  data_source: document.querySelectorAll('wuic-data-source').length,
  list_grid: document.querySelectorAll('wuic-list-grid').length,
  charts: document.querySelectorAll('p-chart, canvas').length,
  designer: document.querySelectorAll('wuic-designer').length,
  body_text_first200: document.body.innerText.slice(0, 200)
}));
console.log('DOM:', JSON.stringify(dom, null, 2));

console.log('\n--- Errors ---');
errors.slice(-25).forEach(e => console.log(e));

const visibility = await page.evaluate(() => {
  const designer = document.querySelector('wuic-designer');
  const dash = document.querySelector('wuic-dashboard');
  const charts = Array.from(document.querySelectorAll('p-chart canvas, .p-chart canvas'));
  const grids = Array.from(document.querySelectorAll('wuic-list-grid'));
  return {
    designer_rect: designer?.getBoundingClientRect(),
    dashboard_rect: dash?.getBoundingClientRect(),
    designer_display: designer ? getComputedStyle(designer).display : null,
    designer_visibility: designer ? getComputedStyle(designer).visibility : null,
    chart_rects: charts.map(c => { const r = c.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top }; }),
    grid_rects: grids.map(g => { const r = g.getBoundingClientRect(); return { w: r.width, h: r.height, top: r.top }; }),
    bodyScroll: { scrollHeight: document.body.scrollHeight }
  };
});
console.log('--- VISIBILITY ---');
console.log(JSON.stringify(visibility, null, 2));
await page.setViewportSize({ width: 1280, height: 2400 });
await page.waitForTimeout(500);
await page.screenshot({ path: './screenshots/debug_dashboard_fullpage.png', fullPage: true });
await browser.close();
