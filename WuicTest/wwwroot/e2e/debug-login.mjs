import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('e2e-artifacts', 'cities-data-repeater-events');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('login') || u.includes('Auth') || u.includes('MetaService')) {
    console.log('RESP', r.status(), u);
  }
});

await page.goto('http://localhost:4200/#/cities-data-repeater-events', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);

await page.locator('input[placeholder="Username"]').fill('admin');
await page.locator('input[placeholder="Password"]').fill('admin');
await page.getByRole('button', { name: 'Login' }).click();
await page.waitForTimeout(3000);

const text = await page.locator('body').innerText();
console.log('HAS_LOGIN_CARD', text.includes('Login richiesto'));
console.log('URL', page.url());
await page.screenshot({ path: path.join(outDir, 'debug-after-login-click.png'), fullPage: true });

await browser.close();
