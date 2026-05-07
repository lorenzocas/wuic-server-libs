/**
 * Test 24: Workflow #16 — Quick-create modal (Alt+N + click button).
 *
 * 1) Visita home, click button "+" header → dialog "Crea nuovo" si apre
 * 2) Verifica 4 entita' (cliente / fornitore / fattura / preventivo)
 * 3) Click "Cliente" → URL contiene `/clienti/list` con `quickCreate=1`
 * 4) Visita altra pagina → premi shortcut Alt+N → dialog si apre
 * 5) Click "Fattura inviata" → URL contiene `/fatture_inviate/list`
 */

export const meta = {
  id: '24',
  name: 'Quick-create modal: Alt+N + button + 4 entita' + ' + navigate',
  area: 'workflow',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { baseUrl, page, assert, log } = ctx;
  if (!page) { log('SKIP: no page (UI test)'); return; }

  // === Step 1: home → click "+" button → dialog appare ===
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/clienti/list?bust=${Date.now()}`,
                  { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
  await page.waitForTimeout(800);

  // Pre-cleanup: chiudi eventuali dialog stale (errors.client.unknown,
  // p-dialog-mask) lasciati da test precedenti che bloccherebbero i click.
  try {
    // Dismiss wuic-error-dialog (button "ok" → chiude)
    const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok"), wuic-error-dialog .p-button-label:has-text("ok")').first();
    if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await okBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(300);
      log('  pre-cleanup: chiuso errors.client.unknown dialog stale');
    }
    // Dismiss qualsiasi altro p-dialog (es. board-pref) tramite Escape
    const masks = await page.locator('.p-dialog-mask').count();
    if (masks > 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      log(`  pre-cleanup: chiusi ${masks} dialog mask via Escape`);
    }
  } catch {}

  const fab = page.locator('#app_quick_create_fab');
  await fab.waitFor({ state: 'visible', timeout: 10000 });
  await fab.click();
  await page.waitForTimeout(500);

  const body = page.locator('#app_quick_create_body');
  await body.waitFor({ state: 'visible', timeout: 5000 });
  log('Step 1: dialog "Crea nuovo" aperto via button "+"');

  // === Step 2: 4 entita' ===
  const btns = page.locator('.app-quick-create__btn');
  const total = await btns.count();
  assert(total === 4, `attese 4 entita', viste ${total}`);

  const expected = ['cliente', 'fornitore', 'fattura', 'preventivo'];
  for (const k of expected) {
    const has = await page.locator(`.app-quick-create__btn[data-entity="${k}"]`).count();
    assert(has === 1, `entita' "${k}" mancante`);
  }
  log(`Step 2: 4 entita' presenti (${expected.join(', ')})`);

  // Snapshot dialog open
  const snap1 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_24_dialog_open_${Date.now()}.png`;
  await page.screenshot({ path: snap1, fullPage: false });
  log(`screenshot dialog: ${snap1}`);

  // === Step 3: click "Cliente" → URL contiene /clienti/list?quickCreate=1 ===
  await page.locator('#qc_btn_cliente').click();
  await page.waitForTimeout(1500);
  const url1 = page.url();
  assert(url1.includes('/clienti/list'),
    `dopo click Cliente: URL deve contenere /clienti/list, visto: ${url1}`);
  assert(url1.includes('quickCreate=1'),
    `URL deve contenere quickCreate=1, visto: ${url1}`);
  log(`Step 3: navigato a ${url1}`);

  // Verifica dialog chiuso
  const stillOpen = await body.isVisible().catch(() => false);
  assert(!stillOpen, 'dopo navigate: dialog deve essere chiuso');

  // === Step 4: shortcut Alt+N apre dialog ===
  // Resta sulla nuova route, premi Alt+N
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(500);
  const bodyAfterShortcut = await body.isVisible().catch(() => false);
  assert(bodyAfterShortcut, 'dopo Alt+N: dialog deve essere aperto');
  log('Step 4: shortcut Alt+N apre dialog');

  // === Step 5: click "Fattura inviata" → URL contiene /fatture_inviate/list ===
  await page.locator('#qc_btn_fattura').click();
  await page.waitForTimeout(1500);
  const url2 = page.url();
  assert(url2.includes('/fatture_inviate/list'),
    `dopo click Fattura: URL deve contenere /fatture_inviate/list, visto: ${url2}`);
  log(`Step 5: navigato a ${url2}`);

  const snap2 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_24_after_navigate_${Date.now()}.png`;
  await page.screenshot({ path: snap2, fullPage: false });
  log(`screenshot post-navigate: ${snap2}`);

  // === Step 6: Alt+N toggle (riapri/richiudi) ===
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(400);
  const opened = await body.isVisible().catch(() => false);
  assert(opened, 'Alt+N #2: dialog riaperto');
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(400);
  const closed = await body.isVisible().catch(() => false);
  assert(!closed, 'Alt+N #3: dialog richiuso');
  log('Step 6: Alt+N toggle ok (open/close)');

  return { entities_tested: 4, navigations_tested: 2 };
}
