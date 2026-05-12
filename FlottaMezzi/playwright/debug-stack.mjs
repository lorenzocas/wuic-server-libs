import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', err => errs.push({ msg: err.message, stack: err.stack }));
page.on('console', msg => {
  if (msg.type() === 'error') {
    msg.args().forEach(async (arg) => {
      try {
        const json = await arg.jsonValue();
        errs.push({ console: msg.text(), arg: JSON.stringify(json).slice(0, 800) });
      } catch {}
    });
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
await page.waitForTimeout(4000);

console.log(`captured ${errs.length} errors`);
errs.slice(0, 5).forEach((e, i) => {
  console.log(`--- error ${i} ---`);
  console.log(JSON.stringify(e, null, 2).slice(0, 1500));
});

// Estrai source dal bundle Angular
const sourceLine = await page.evaluate(async () => {
  const url = 'http://localhost:4200/chunk-U4A3QQWE.js';
  const r = await fetch(url);
  const txt = await r.text();
  // Trova la zona attorno alla position 4514:54 (ma il chunk è single-line minified, quindi cerco line-content)
  const lines = txt.split('\n');
  if (lines.length < 4514) {
    return { totalLines: lines.length, note: 'minified single-line' };
  }
  return { totalLines: lines.length, line4509: lines[4508]?.slice(0, 300), line4514: lines[4513]?.slice(0, 300) };
});
console.log('\n--- bundle inspection ---');
console.log(JSON.stringify(sourceLine, null, 2));

await browser.close();
