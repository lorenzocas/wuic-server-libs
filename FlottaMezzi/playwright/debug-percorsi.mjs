import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', e => errs.push(`pe:${e.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error') errs.push(`ce:${m.text().slice(0, 400)}`); });
// Network capture: trovare quale route fetched da getTableMetadata ha lookup orfano
const orphans = [];
page.on('response', async r => {
  if (r.url().includes('getTableMetadata') && r.status() === 200) {
    try {
      const body = await r.json();
      const route = body?.tableMetadata?.mdroutename || body?.columnMetadata?.[0]?._Metadati_Tabelle?.mdroutename;
      for (const c of (body?.columnMetadata || [])) {
        if (c.mc_ui_column_type === 'lookupByID') {
          const tgt = c.mc_ui_lookup_entity_name;
          if (!tgt || String(tgt).trim() === '') {
            orphans.push({ route, col: c.mc_nome_colonna, target: JSON.stringify(tgt) });
          }
        }
      }
    } catch { }
  }
});

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });

// Server-side invalidate (regola 10 AGENTS) — autenticato via cookie k-user del context Playwright
const inv = await page.request.post('http://localhost:5100/api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime', {
  data: {}, headers: { 'Content-Type': 'application/json' }
});
console.log('invalidate:', inv.status(), (await inv.text()).slice(0, 200));
const ver = await page.request.post('http://localhost:5100/api/Meta/AsmxProxy/MetaService.getProjectMetadataVersion', {
  data: {}, headers: { 'Content-Type': 'application/json' }
});
console.log('version:', (await ver.text()).slice(0, 120));

// Client cache clear + reload
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

// Open the percorsi map
await page.goto('http://localhost:4200/#/vw_mezzi_posizioni_giorno/map', { waitUntil: 'load' });
// snap-to-roads is async (DirectionsService): give it time
await page.waitForTimeout(15000);

const data = await page.evaluate(() => ({
  polylines: document.querySelectorAll('map-polyline').length,
  markers: document.querySelectorAll('gmp-advanced-marker, map-advanced-marker').length,
  filterBars: document.querySelectorAll('wuic-filter-bar, .filter-bar, .filterbar').length,
  bodyScrollH: document.body.scrollHeight,
  bodyText: document.body.innerText.slice(0, 200),
}));
console.log(JSON.stringify(data, null, 2));
console.log('errors:', errs.slice(0, 8));
console.log('orphan rows from network:', orphans.length);
orphans.slice(0, 8).forEach(o => console.log(' ', JSON.stringify(o)));
await page.screenshot({ path: './screenshots/percorsi_first.png', fullPage: false });
await browser.close();
