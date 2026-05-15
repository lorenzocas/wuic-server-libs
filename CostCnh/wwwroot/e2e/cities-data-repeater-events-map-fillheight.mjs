import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = 'http://localhost:4200';
const targetHash = '#/cities-data-repeater-events';
const outDir = path.resolve('e2e-artifacts', 'cities-data-repeater-events-map');
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
await page.waitForTimeout(1200);

await page.selectOption('#actionSelect', 'map');
await page.waitForTimeout(2500);

const details = page.locator('details.events-panel');
await details.evaluate((el) => {
  if (!el.open) el.open = true;
});
await page.waitForTimeout(1000);

const metrics = await page.evaluate(() => {
  const rect = (el) => (el ? el.getBoundingClientRect() : null);

  const viewportH = window.innerHeight;
  const shell = document.querySelector('.repeater-shell');
  const repeaterHost = document.querySelector('.repeater-shell wuic-data-repeater');
  const mapRoot = document.querySelector('.repeater-shell .map-list-root');
  const googleMap = document.querySelector('.repeater-shell google-map');
  const detailsEl = document.querySelector('details.events-panel');
  const mapRootComputed = mapRoot ? getComputedStyle(mapRoot) : null;

  return {
    href: window.location.href,
    viewportH,
    detailsOpen: !!detailsEl?.open,
    repeaterHostClass: repeaterHost?.className || '',
    shell: rect(shell),
    mapRoot: rect(mapRoot),
    mapRootInlineHeight: mapRoot instanceof HTMLElement ? mapRoot.style.height : '',
    mapRootComputedHeight: mapRootComputed?.height || '',
    mapRootComputedMaxHeight: mapRootComputed?.maxHeight || '',
    googleMap: rect(googleMap),
    eventsPanel: rect(detailsEl)
  };
});

await page.screenshot({ path: path.join(outDir, 'map-expanded-log-full.png'), fullPage: true });

const mapInShell = metrics.mapRoot && metrics.shell
  ? (metrics.mapRoot.bottom <= metrics.shell.bottom + 2 && metrics.mapRoot.top >= metrics.shell.top - 2)
  : false;

const mapVisible = metrics.mapRoot
  ? (metrics.mapRoot.top < metrics.viewportH && metrics.mapRoot.bottom > 0)
  : false;
const mapHasHeight = metrics.mapRoot ? (metrics.mapRoot.height >= 180) : false;

const eventsBottomOk = metrics.eventsPanel
  ? metrics.eventsPanel.bottom <= metrics.viewportH + 2
  : false;

await fs.writeFile(
  path.join(outDir, 'metrics.json'),
  JSON.stringify({ ...metrics, mapInShell, mapVisible, eventsBottomOk }, null, 2),
  'utf8'
);

console.log(JSON.stringify({
  href: metrics.href,
  detailsOpen: metrics.detailsOpen,
  mapInShell,
  mapVisible,
  mapHasHeight,
  eventsBottomOk,
  shell: metrics.shell,
  repeaterHostClass: metrics.repeaterHostClass,
  mapRoot: metrics.mapRoot,
  mapRootInlineHeight: metrics.mapRootInlineHeight,
  mapRootComputedHeight: metrics.mapRootComputedHeight,
  mapRootComputedMaxHeight: metrics.mapRootComputedMaxHeight,
  eventsPanel: metrics.eventsPanel,
  viewportH: metrics.viewportH
}, null, 2));

if (!metrics.detailsOpen) {
  console.error('FAIL: event log details is not open.');
  await browser.close();
  process.exit(1);
}

if (!mapInShell) {
  console.error('FAIL: map area overflows repeater shell after log expansion.');
  await browser.close();
  process.exit(1);
}

if (!mapVisible) {
  console.error('FAIL: map area is not visible in viewport.');
  await browser.close();
  process.exit(1);
}

if (!mapHasHeight) {
  console.error('FAIL: map area height is collapsed.');
  await browser.close();
  process.exit(1);
}

if (!eventsBottomOk) {
  console.error('FAIL: expanded event log overflows viewport.');
  await browser.close();
  process.exit(1);
}

await browser.close();
console.log('PASS');
