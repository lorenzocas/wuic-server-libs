import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const orphanRoutes = [];
page.on('response', async r => {
  const u = r.url();
  if (u.includes('getTableMetadata') && r.status() === 200) {
    try {
      const body = await r.json();
      const route = body?.tableMetadata?.mdroutename;
      const cols = body?.columnMetadata || [];
      for (const c of cols) {
        if (c.mc_ui_column_type === 'lookupByID') {
          const tgt = c.mc_ui_lookup_entity_name;
          if (!tgt || String(tgt).trim() === '') {
            orphanRoutes.push({ host: route, col: c.mc_nome_colonna, target: JSON.stringify(tgt), mdid: c.mcuilookupmdid });
          }
        }
      }
    } catch { }
  }
});

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.goto('http://localhost:4200/#/home/dashboard', { waitUntil: 'load' });
await page.waitForTimeout(6000);

console.log('orphan rows from network:', orphanRoutes.length);
orphanRoutes.forEach(o => console.log(' ', JSON.stringify(o)));

// Inspect dialog body if visible
const dlg = await page.evaluate(() => {
  const d = document.querySelector('.p-dialog-content, p-dialog .p-dialog-content');
  return d ? d.innerText.slice(0, 800) : null;
});
console.log('dialog text:', dlg);

await browser.close();
