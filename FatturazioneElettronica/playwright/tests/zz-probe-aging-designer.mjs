/**
 * Probe (non-test): apre il designer dashboard per la board `aging_crediti`
 * (creata via build-board-aging-crediti.mjs). Verifica visiva:
 *   1. Designer carica
 *   2. I 4 widget cloned dal template 2x2 sono visibili nel canvas designer
 *   3. Screenshot della palette + dei widget per studiarne la struttura runtime
 *
 * Route: #/<boardroute>/dashboard (requireFeature: dashboard-designer).
 */
export const meta = {
  id: 'zz_probe_designer',
  name: 'PROBE: designer mode su aging_crediti board',
  area: 'workflow',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { baseUrl, page, log } = ctx;
  if (!page) { log('SKIP: no page'); return; }

  // Apri designer mode sulla board appena creata
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/aging_crediti/dashboard?bust=${Date.now()}`,
                  { waitUntil: 'load', timeout: 60000 });
  // Designer puo' impiegare a caricare lazy chunk
  await page.waitForTimeout(8000);

  // Dismiss eventuali dialog stale
  for (let i = 0; i < 5; i++) {
    try {
      const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok"), .p-dialog button:has-text("ok")').first();
      if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await okBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
      } else break;
    } catch { break; }
  }
  await page.waitForTimeout(2000);

  const url = page.url();
  log(`URL: ${url}`);

  const snap = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PROBE_designer_${Date.now()}.png`;
  await page.screenshot({ path: snap, fullPage: true });
  log(`screenshot: ${snap}`);

  // Anche raccolta delle html ids visibili (per capire palette structure)
  const ids = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[id]')).map(el => el.id).filter(id => id && !id.startsWith('cdk-')).slice(0, 50);
  });
  log(`first ${ids.length} element ids: ${ids.slice(0, 30).join(', ')}`);
}
