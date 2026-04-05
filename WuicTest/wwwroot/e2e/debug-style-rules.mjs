import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.goto('http://localhost:4200/#/cities-data-repeater-events', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
if (await page.locator('text=Login richiesto (Credenziali)').count()) {
  await page.locator('input[placeholder="Username"]').fill('admin');
  await page.locator('input[placeholder="Password"]').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForTimeout(2200);
  await page.goto('http://localhost:4200/#/cities-data-repeater-events', { waitUntil: 'domcontentloaded' });
}
await page.waitForTimeout(1200);
const found = await page.evaluate(() => {
  const hits = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      const txt = String((rule).cssText || '');
      if (txt.includes('wuic-map-list') || txt.includes('wuic-data-repeater-fill-height') || txt.includes('map-list-root')) {
        hits.push(txt.slice(0, 220));
      }
    }
  }
  return hits.slice(0, 30);
});
console.log(JSON.stringify(found, null, 2));
await browser.close();
