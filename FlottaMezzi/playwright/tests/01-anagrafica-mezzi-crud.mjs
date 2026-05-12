/**
 * Test 01 — CRUD UI mezzi (pilota anagrafiche).
 *
 * Flow:
 *   1) navigate /mezzi/list
 *   2) click +Nuovo
 *   3) fill targa, marca, modello, anno + lookup tipo_mezzo
 *   4) save + waitForSaveSuccess
 *   5) UI verify: filterInfo + findRowByText (targa)
 *   6) API verify: crudRead route='mezzi'
 *   7) API edit (cambia modello)
 *   8) API verify update
 *   9) API delete + UI verify riga rimossa
 *
 * Cleanup pre-test: rimuove tutti i mezzi con targa LIKE '_E2E%'.
 */
import {
  navigateRoute, clickNewRecord, findRowByText, snap,
  waitForFieldEditor, setTextFieldValue, setNumberFieldValue,
  selectLookupOption, clickSaveButton, waitForSaveSuccess
} from '../_shared/ui-helpers.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '01',
  name: 'CRUD UI anagrafica mezzi',
  needsUi: true
};

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.mezzi WHERE targa LIKE 'XX___XX' OR targa = 'ZZ999ZZ'");
}

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // Targa univoca per il test (formato italiano valido per validazione regex)
  const targa = 'ZZ999ZZ';

  // ── 1) navigate list ─────────────────────────────────────────────
  await navigateRoute(page, baseUrl, 'mezzi', 'list');
  log('mezzi/list loaded');

  // dismiss eventuale dialog "modifiche non salvate"
  const ok = page.locator('p-dialog button:has-text("OK"), p-confirmdialog button:has-text("OK")').first();
  if (await ok.isVisible().catch(() => false)) await ok.click({ force: true }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  // ── 2) click +Nuovo ──────────────────────────────────────────────
  await clickNewRecord(page);
  log('+Nuovo cliccato, edit-form aperto');

  // ── 3) fill form ────────────────────────────────────────────────
  await waitForFieldEditor(page, 'targa', { timeout: 8000, requireValue: false });
  await setTextFieldValue(page, 'targa', targa);
  await setTextFieldValue(page, 'marca', 'TestMarca');
  await setTextFieldValue(page, 'modello', 'TestModello');
  await setNumberFieldValue(page, 'anno', 2024);
  await selectLookupOption(page, 'tipo_mezzo_id', 'Auto');
  // stato_mezzo_id, conducente_assegnato_id: nullable -> skip per ridurre flakiness viewport
  log(`form filled: targa=${targa}`);

  // ── 4) save ─────────────────────────────────────────────────────
  await clickSaveButton(page);
  await waitForSaveSuccess(page, { timeout: 15000 });
  log('saved');

  // ── 5) UI verify INSERT ─────────────────────────────────────────
  const filterInfoParam = encodeURIComponent(JSON.stringify({
    filters: [{ field: 'targa', operator: 'eq', value: targa }]
  }));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/mezzi/list?filterInfo=${filterInfoParam}`,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(800);
  const row = findRowByText(page, targa);
  await row.waitFor({ state: 'visible', timeout: 10000 });
  log(`UI verify INSERT ok: riga "${targa}" visibile`);

  // ── 6) API verify INSERT ────────────────────────────────────────
  const ins = await api.crudRead('mezzi', {
    filterInfo: { filters: [{ field: 'targa', operator: 'eq', value: targa }] }
  });
  const insRows = ins?.results ?? ins?.data ?? [];
  assert(insRows.length === 1, `API: insert non trovato (count=${insRows.length})`);
  const id = insRows[0].id ?? insRows[0].Id;
  assert(id > 0, 'API: id non valorizzato');
  log(`API verify INSERT ok (id=${id})`);

  // ── 7) API update (modello) ─────────────────────────────────────
  await api.crudUpdate('mezzi', { id, modello: 'TestModello EDITED' });
  log('API update modello OK');

  // ── 8) API verify update ────────────────────────────────────────
  const upd = await api.crudRead('mezzi', {
    filterInfo: { filters: [{ field: 'id', operator: 'eq', value: id }] }
  });
  const updRow = (upd?.results ?? upd?.data)?.[0];
  assert(updRow, 'API: row non trovata dopo update');
  assert(String(updRow.modello ?? '').includes('EDITED'),
    `API: edit non propagato. modello="${updRow.modello}"`);
  log(`API verify UPDATE ok (modello="${updRow.modello}")`);

  // ── 9) API delete + UI verify ───────────────────────────────────
  await api.crudDelete('mezzi', { id });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(300);
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/mezzi/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(800);
  const rowsAfter = await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
  assert(rowsAfter === 0, `record ancora visibile dopo delete (rows=${rowsAfter})`);
  log('UI verify DELETE ok (riga rimossa)');

  await snap(page, 'mezzi-crud-end');
  return { targa, id };
}
