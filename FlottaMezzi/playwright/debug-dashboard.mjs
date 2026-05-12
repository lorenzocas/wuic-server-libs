import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleMsgs = [];
const requests = [];
page.on('pageerror', err => consoleMsgs.push(`[pageerror] ${err.message}`));
page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning')
    consoleMsgs.push(`[${msg.type()}] ${msg.text().slice(0, 250)}`);
});
page.on('request', req => {
  if (req.url().includes('/api/') || req.url().includes('dom_board') || req.url().includes('home'))
    requests.push(`${req.method()} ${req.url().slice(0, 150)}`);
});
page.on('response', r => {
  if (r.status() >= 400) consoleMsgs.push(`[${r.status()}] ${r.url().slice(0, 150)}`);
});

await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
await page.evaluate(async () => {
  localStorage.clear(); sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

console.log('=== navigating /home/dashboard ===');
await page.goto('http://localhost:4200/#/home/dashboard', { waitUntil: 'load' });
await page.waitForTimeout(4000);

console.log('current URL:', page.url());

// Cosa ha caricato?
const bodyHtml = await page.evaluate(() => {
  const root = document.querySelector('app-root, body > *:not(script)');
  return {
    rootTag: root?.tagName,
    childTags: Array.from(document.querySelectorAll('app-root *')).map(e => e.tagName).filter(t => t.startsWith('WUIC')).slice(0, 10),
    h1: document.querySelector('h1, .page-title, .board-title')?.innerText?.slice(0, 100)
  };
});
console.log('DOM:', JSON.stringify(bodyHtml, null, 2));

console.log('\n--- Console messages ---');
consoleMsgs.slice(-15).forEach(m => console.log(m));

console.log('\n--- Backend requests ---');
requests.slice(-15).forEach(r => console.log(r));

await page.screenshot({ path: './screenshots/debug_dashboard.png', fullPage: true });
await browser.close();
