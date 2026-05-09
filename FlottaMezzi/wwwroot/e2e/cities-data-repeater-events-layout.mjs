import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = 'http://localhost:4200';
const targetHash = '#/cities-data-repeater-events';
const outDir = path.resolve('e2e-artifacts', 'cities-data-repeater-events');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

async function doManualLoginIfNeeded() {
  await page.waitForTimeout(1200);
  const loginCard = page.locator('text=Login richiesto (Credenziali)');
  if (await loginCard.count() === 0) return false;

  await page.locator('input[placeholder="Username"]').fill('admin');
  await page.locator('input[placeholder="Password"]').fill('admin');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForTimeout(2500);
  return true;
}

await page.goto(`${baseUrl}/${targetHash}`, { waitUntil: 'domcontentloaded' });
await doManualLoginIfNeeded();
await page.goto(`${baseUrl}/${targetHash}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.cities-data-repeater-events-page', { timeout: 15000 });
await page.waitForTimeout(1500);

const details = page.locator('details.events-panel');
await details.evaluate((el) => {
  if (!el.open) el.open = true;
});
await page.waitForTimeout(600);

const metrics = await page.evaluate(() => {
  const viewportH = window.innerHeight;
  const pageRoot = document.querySelector('.cities-data-repeater-events-page');
  const shell = document.querySelector('.repeater-shell');
  const detailsEl = document.querySelector('details.events-panel');
  const paginator = document.querySelector('.repeater-shell .p-paginator');
  const footerSum = document.querySelector('.repeater-shell .footer-sum-grid') || document.querySelector('.repeater-shell [class*="footer"]');

  const rect = (el) => el ? el.getBoundingClientRect() : null;

  return {
    href: window.location.href,
    viewportH,
    pageRoot: rect(pageRoot),
    repeaterShell: rect(shell),
    eventsPanel: rect(detailsEl),
    paginator: rect(paginator),
    footerSum: rect(footerSum),
    detailsOpen: !!detailsEl?.open
  };
});

await page.screenshot({ path: path.join(outDir, 'layout-full.png'), fullPage: true });

const shellH = metrics.repeaterShell?.height ?? 0;
const pageH = metrics.pageRoot?.height ?? 0;
const shellRatio = pageH > 0 ? shellH / pageH : 0;

const eventsBottomOk = metrics.eventsPanel ? metrics.eventsPanel.bottom <= metrics.viewportH + 2 : false;
const paginatorVisible = metrics.paginator
  ? (metrics.paginator.top < metrics.viewportH && metrics.paginator.bottom > 0)
  : false;

await fs.writeFile(
  path.join(outDir, 'metrics.json'),
  JSON.stringify({ ...metrics, shellRatio, eventsBottomOk, paginatorVisible }, null, 2),
  'utf8'
);

console.log(JSON.stringify({
  href: metrics.href,
  detailsOpen: metrics.detailsOpen,
  shellRatio,
  eventsBottomOk,
  paginatorVisible,
  paginator: metrics.paginator,
  eventsPanel: metrics.eventsPanel,
  viewportH: metrics.viewportH
}, null, 2));

if (!metrics.detailsOpen) {
  console.error('FAIL: events details is not open.');
  await browser.close();
  process.exit(1);
}

if (!eventsBottomOk) {
  console.error('FAIL: events panel overflows viewport when expanded.');
  await browser.close();
  process.exit(1);
}

if (!paginatorVisible) {
  console.error('FAIL: paginator/footer area is not visible with expanded log.');
  await browser.close();
  process.exit(1);
}

await browser.close();
console.log('PASS');
