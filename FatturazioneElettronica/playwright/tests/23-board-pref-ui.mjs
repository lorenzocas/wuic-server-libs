/**
 * Test 23: Workflow #15 — Dashboard widget pref UI flow.
 *
 * 1) Click FAB gear icon → dialog "Personalizza dashboard" appare
 * 2) 5 checkbox widget caricati (catalog hardcoded in BoardPrefComponent)
 * 3) Toggle 2 checkbox (es. nascondi 'kpi_clienti' e 'chart_vendite')
 * 4) Click "Salva" → dialog chiude → DB ha riga con layout aggiornato
 * 5) Riapri dialog → checkbox state preserved (kpi_clienti=false, chart_vendite=false)
 * 6) Click "Reset" → DELETE pref → dialog ricarica defaults (tutti visibili)
 */
import { queryOne, exec, dbConfig } from '../_shared/sql-helpers.mjs';
const META_DB = dbConfig.DEFAULT_META_DB;

export const meta = {
  id: '23',
  name: 'Board pref UI: FAB + dialog + checkbox toggle + save + reset',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { baseUrl, page, assert, log } = ctx;
  if (!page) { log('SKIP: no page (UI test)'); return; }

  // Naviga a clienti/list per avere una route stabile come "current"
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/clienti/list?bust=${Date.now()}`,
                  { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
  await page.waitForTimeout(1000);

  // Cleanup pre-test (qualsiasi user_id) - puliamo per route 'clienti/list'
  // Il user_id viene dal cookie/session; accettiamo qualsiasi valore e
  // cancelliamo per route esatta
  try {
    await exec(`DELETE FROM dbo.dom_board_user_pref WHERE board_route LIKE 'clienti%'`, META_DB);
  } catch {}

  // === Step 1: Click FAB gear ===
  const fab = page.locator('#app_board_pref_fab');
  await fab.waitFor({ state: 'visible', timeout: 10000 });
  await fab.click();
  await page.waitForTimeout(500);

  const body = page.locator('#app_board_pref_dialog_body');
  await body.waitFor({ state: 'visible', timeout: 5000 });
  log('Step 1: dialog "Personalizza dashboard" aperto');

  // === Step 2: 5 checkbox caricati ===
  await page.waitForTimeout(800); // attende fetch GET /api/board-pref
  const rows = page.locator('.app-board-pref__row');
  const rowCount = await rows.count();
  assert(rowCount === 5, `attesi 5 widget catalog, visti ${rowCount}`);
  log(`Step 2: ${rowCount} widget caricati`);

  // Snapshot pre-toggle
  const snap1 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_23_dialog_open_${Date.now()}.png`;
  await page.screenshot({ path: snap1, fullPage: false });
  log(`screenshot pre-toggle: ${snap1}`);

  // === Step 3: Toggle checkbox 1 (kpi_clienti) e 4 (chart_vendite) ===
  const cb1 = page.locator('.app-board-pref__row[data-widget-id="kpi_clienti"] p-checkbox .p-checkbox-box');
  const cb4 = page.locator('.app-board-pref__row[data-widget-id="chart_vendite"] p-checkbox .p-checkbox-box');
  await cb1.click({ force: true });
  await page.waitForTimeout(200);
  await cb4.click({ force: true });
  await page.waitForTimeout(300);
  log('Step 3: toggled kpi_clienti + chart_vendite (off)');

  // === Step 4: Click Salva ===
  const saveBtn = page.locator('#app_board_pref_save');
  await saveBtn.click();
  await page.waitForTimeout(1500);

  // Dialog deve essersi chiuso
  const bodyVisibleAfterSave = await body.isVisible().catch(() => false);
  assert(!bodyVisibleAfterSave, `dopo Salva dialog dovrebbe chiudersi, ancora visibile`);
  log('Step 4: salvato, dialog chiuso');

  // (sqlcmd tronca layout_json oltre ~256 char → leggiamo via API GET).
  // Trova user_id dalla query, poi GET /api/board-pref per il JSON completo.
  const uidRow = await queryOne(
    `SELECT TOP 1 user_id FROM dbo.dom_board_user_pref WHERE board_route LIKE 'clienti%' ORDER BY updated_at DESC`,
    META_DB
  );
  assert(uidRow, 'attesa una riga DB dopo save');
  const uid = Number(uidRow.user_id);
  const apiBase = ctx.backendBaseUrl.replace(/\/$/, '');
  const r = await fetch(`${apiBase}/api/board-pref?route=clienti%2Flist&user_id=${uid}`);
  const j = await r.json();
  assert(j.ok && j.layout_json, `GET /api/board-pref fail: ${JSON.stringify(j)?.slice(0,200)}`);
  const layoutObj = JSON.parse(j.layout_json);
  const kpic = layoutObj.widgets.find(w => w.id === 'kpi_clienti');
  const chartv = layoutObj.widgets.find(w => w.id === 'chart_vendite');
  assert(kpic && kpic.visible === false, `kpi_clienti.visible deve essere false, visto ${kpic?.visible}`);
  assert(chartv && chartv.visible === false, `chart_vendite.visible deve essere false, visto ${chartv?.visible}`);
  // verifica che gli altri 3 sono ancora visible=true
  const visibleCount = layoutObj.widgets.filter(w => w.visible === true).length;
  assert(visibleCount === 3, `attesi 3 visible=true, visti ${visibleCount}`);
  log(`  DB OK: layout_json salvato (kpi_clienti=false, chart_vendite=false, 3 visible)`);

  // === Step 5: Riapri dialog → checkbox state preserved ===
  await fab.click();
  await page.waitForTimeout(500);
  await body.waitFor({ state: 'visible', timeout: 5000 });
  await page.waitForTimeout(1000); // attende fetch

  // Verifica via ngModel su attributo data-pc-state-checked / aria-checked dell'input
  // PrimeNG p-checkbox renderizza un input[type=checkbox] hidden col [checked]
  const cb1Input = page.locator('.app-board-pref__row[data-widget-id="kpi_clienti"] input[type="checkbox"]');
  const cb1IsChecked = await cb1Input.evaluate((el) => (el).checked).catch(() => null);
  assert(cb1IsChecked === false, `riapertura: kpi_clienti deve essere unchecked, visto checked=${cb1IsChecked}`);
  const cb4Input = page.locator('.app-board-pref__row[data-widget-id="chart_vendite"] input[type="checkbox"]');
  const cb4IsChecked = await cb4Input.evaluate((el) => (el).checked).catch(() => null);
  assert(cb4IsChecked === false, `riapertura: chart_vendite deve essere unchecked, visto checked=${cb4IsChecked}`);
  // gli altri devono essere checked (3)
  const allInputs = page.locator('.app-board-pref__row input[type="checkbox"]');
  const total = await allInputs.count();
  let checkedCount = 0;
  for (let i = 0; i < total; i++) {
    const c = await allInputs.nth(i).evaluate((el) => (el).checked).catch(() => false);
    if (c) checkedCount++;
  }
  assert(checkedCount === 3, `riapertura: attesi 3 widget visible (checked), visti ${checkedCount}`);
  log('Step 5: riapertura dialog conserva state (2 unchecked, 3 checked)');

  const snap2 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_23_state_preserved_${Date.now()}.png`;
  await page.screenshot({ path: snap2, fullPage: false });

  // === Step 6: Click Reset → DELETE pref → tutti visibili ===
  const resetBtn = page.locator('#app_board_pref_reset');
  await resetBtn.click();
  await page.waitForTimeout(1500);

  // verifica DB: nessuna riga per route
  const rowAfterReset = await queryOne(
    `SELECT COUNT(*) AS c FROM dbo.dom_board_user_pref WHERE board_route LIKE 'clienti%'`,
    META_DB
  );
  assert(Number(rowAfterReset.c) === 0, `dopo reset: 0 righe attese, viste ${rowAfterReset.c}`);
  // verifica UI: 5 input checked (tutti visible)
  await page.waitForTimeout(500);
  const inputsAfter = page.locator('.app-board-pref__row input[type="checkbox"]');
  const totalAfter = await inputsAfter.count();
  let checkedAfter = 0;
  for (let i = 0; i < totalAfter; i++) {
    const c = await inputsAfter.nth(i).evaluate((el) => (el).checked).catch(() => false);
    if (c) checkedAfter++;
  }
  assert(checkedAfter === 5, `dopo reset: attesi 5 visible, visti ${checkedAfter}`);
  log('Step 6: reset → 0 righe DB, 5 widget visible');

  const snap3 = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_23_after_reset_${Date.now()}.png`;
  await page.screenshot({ path: snap3, fullPage: false });
  log(`screenshot post-reset: ${snap3}`);

  // Chiusura dialog (Annulla) per non lasciare la mask attiva e bloccare i test successivi.
  try {
    const cancelBtn = page.locator('#app_board_pref_cancel');
    if (await cancelBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }
  } catch {}

  // Cleanup finale
  try { await exec(`DELETE FROM dbo.dom_board_user_pref WHERE board_route LIKE 'clienti%'`, META_DB); } catch {}

  return { widgets_tested: 5, route: 'clienti/list' };
}
