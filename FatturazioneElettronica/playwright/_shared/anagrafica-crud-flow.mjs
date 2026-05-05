/**
 * Helper riusabile: CRUD end-to-end di un'anagrafica con verifica
 * presenza in list-grid (SELECT via UI) + assertion API.
 *
 * Riusa SOLO utility framework esistenti
 * (`edit-form-e2e-utils.mjs`, `e2e-login-utils.mjs`) — niente
 * duplicazione di waitForFieldEditor / setTextFieldValue / clickSave.
 *
 * Esempio (test 02-anagrafica-fornitori-crud.mjs):
 *
 *   import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
 *   export async function run(ctx) {
 *     return runAnagraficaCrud(ctx, {
 *       route: 'fornitori',
 *       data: { codice: '...', ragione_sociale: '...' },
 *       displayField: 'ragione_sociale',
 *       editField: 'ragione_sociale',
 *       editValue: 'Fornitore E2E EDITED',
 *       lookups: [],          // [{ field, optionLabel }]  per FK
 *       numberFields: [],     // [{ field, value }]  per inputNumber
 *       textareas: []         // [{ field, value }]  per text-area
 *     });
 *   }
 */
import {
  navigateRoute, clickNewRecord, countRows, findRowByText, snap,
  waitForFieldEditor, setTextFieldValue, setNumberFieldValue, setTextAreaFieldValue,
  selectLookupOption, selectDictionaryOption,
  clickSaveButton, waitForSaveSuccess, navigateToEditForm
} from './ui-helpers.mjs';

/**
 * Esegue il flow CRUD con verifica SELECT UI ad ogni step:
 *  1) navigate <route>/list (action=list, archetype default)
 *  2) clickNewRecord -> apre edit-form
 *  3) fill text/number/textarea/lookup via framework utils
 *  4) clickSaveButton + waitForSaveSuccess
 *  5) **SELECT UI**: navigate <route>/list, find riga via findRowByText(displayValue)
 *  6) API verify INSERT (crudRead per codice o displayField)
 *  7) dblclick row -> edit-form, modifica editField, save
 *  8) **SELECT UI post-edit**: find riga con editValue
 *  9) API verify UPDATE
 * 10) API DELETE + **SELECT UI post-delete** (riga rimossa)
 */
export async function runAnagraficaCrud(ctx, opts) {
  const { page, api, baseUrl, assert, log } = ctx;
  const {
    route, data, displayField, editField, editValue,
    lookups = [], dictionaries = [], numberFields = [], textareas = []
  } = opts;
  assert(route && data && displayField && editField,
    'opts mancanti (route, data, displayField, editField)');

  const findValue = data[displayField];
  assert(findValue, `data.${displayField} non valorizzato`);

  // ── 1) UI navigate list ──────────────────────────────────────────
  await navigateRoute(page, baseUrl, route, 'list');
  log(`UI ${route}/list (action=list, archetype default) caricato`);
  log(`  initial rows: ${await countRows(page)}`);

  // Click "OK" su qualsiasi confirm-dialog "modifiche non salvate" residuo
  // (apparizione comune quando un test precedente ha lasciato un edit-form
  // aperto e questo test ha navigato con `page.goto` triggerando il guard).
  const confirmOk = page.locator('p-dialog .p-dialog-content button:has-text("OK"), p-confirmdialog button:has-text("OK")').first();
  if (await confirmOk.isVisible().catch(() => false)) {
    await confirmOk.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(200);

  // ── 2) clickNewRecord → edit-form ────────────────────────────────
  await clickNewRecord(page);
  log('  +Nuovo cliccato, edit-form aperto');

  // ── 3) fill fields via framework utils ───────────────────────────
  // Calcola set di field "speciali" da escludere dal flow text
  const numericSet = new Set(numberFields.map(n => n.field));
  const textareaSet = new Set(textareas.map(t => t.field));
  const lookupSet = new Set(lookups.map(l => l.field));
  const dictSet = new Set(dictionaries.map(d => d.field));

  for (const [field, value] of Object.entries(data)) {
    if (value == null) continue;
    if (numericSet.has(field) || textareaSet.has(field) ||
        lookupSet.has(field) || dictSet.has(field)) continue;
    try {
      await waitForFieldEditor(page, field, { timeout: 5000, requireValue: false });
      await setTextFieldValue(page, field, String(value));
    } catch (e) {
      log(`  [warn] field "${field}" non rendered: ${e.message?.slice(0, 80)}`);
    }
  }
  for (const n of numberFields) {
    await waitForFieldEditor(page, n.field, { timeout: 5000, requireValue: false });
    await setNumberFieldValue(page, n.field, n.value);
  }
  for (const t of textareas) {
    await waitForFieldEditor(page, t.field, { timeout: 5000, requireValue: false });
    await setTextAreaFieldValue(page, t.field, t.value);
  }
  for (const l of lookups) {
    await waitForFieldEditor(page, l.field, { timeout: 5000, requireValue: false });
    await selectLookupOption(page, l.field, l.optionLabel);
    log(`  lookup ${l.field} -> "${l.optionLabel}"`);
  }
  for (const d of dictionaries) {
    await waitForFieldEditor(page, d.field, { timeout: 5000, requireValue: false });
    await selectDictionaryOption(page, d.field, d.optionLabel);
  }

  // ── 4) save ──────────────────────────────────────────────────────
  await clickSaveButton(page);
  await waitForSaveSuccess(page, { timeout: 15000 });
  log('  saved (via framework clickSaveButton+waitForSaveSuccess)');

  // ── 5) SELECT UI verify INSERT ───────────────────────────────────
  // Usa URL filterInfo (regola 11 AGENTS) per evitare paginazione: il
  // grid filtrato mostra solo la riga inserita. Filter su `codice` se
  // disponibile (univoco), altrimenti `displayField`.
  const navFilterField = data.codice ? 'codice' : displayField;
  const navFilterValue = data.codice ?? findValue;
  const filterInfoParam = encodeURIComponent(JSON.stringify({
    filters: [{ field: navFilterField, operator: 'eq', value: navFilterValue }]
  }));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}/list?filterInfo=${filterInfoParam}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, wuic-data-repeater', { timeout: 30000 });
  await page.waitForTimeout(800);
  const insertedRow = findRowByText(page, findValue);
  await insertedRow.waitFor({ state: 'visible', timeout: 10000 });
  log(`  SELECT UI ok: riga "${findValue}" presente in grid (filterInfo ${navFilterField}=${navFilterValue})`);

  // ── 6) API verify INSERT ─────────────────────────────────────────
  const filterField = data.codice ? 'codice' : displayField;
  const filterValue = data.codice ?? findValue;
  const ins = await api.crudRead(route, {
    filterInfo: { filters: [{ field: filterField, operator: 'eq', value: filterValue }] }
  });
  const insRows = ins?.results ?? ins?.data ?? [];
  assert(insRows.length === 1, `API: insert non trovato (count=${insRows.length})`);
  const id = insRows[0].id ?? insRows[0].Id;
  assert(id > 0, 'API: id non valorizzato');
  log(`  API verify INSERT ok (id=${id})`);

  // ── 7) UI: edit via navigateToEditForm (route diretto + bounded-repeater) ─
  // dblclick non e' uniformemente abilitato per tutte le route in WUIC;
  // navigateToEditForm va sempre via `<route>/edit/<id>` che e' la
  // forma supportata canonical dal framework (vedi edit-form-e2e-utils
  // sezione "lazy parametric-dialog mount").
  await navigateToEditForm(page, baseUrl, `${route}/edit/${id}`, { timeout: 30000 });
  await waitForFieldEditor(page, editField, { timeout: 10000, requireValue: false });
  await setTextFieldValue(page, editField, editValue);
  await clickSaveButton(page);
  await waitForSaveSuccess(page, { timeout: 15000 });
  log(`  edit saved (${editField} -> "${editValue}")`);

  // ── 8) SELECT UI verify UPDATE ───────────────────────────────────
  // Filter sull'`id` (invariante dopo edit; la `descrizione` cambia).
  const filterInfoById = encodeURIComponent(JSON.stringify({
    filters: [{ field: 'id', operator: 'eq', value: id }]
  }));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}/list?filterInfo=${filterInfoById}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, wuic-data-repeater', { timeout: 30000 });
  await page.waitForTimeout(800);
  const editedRow = findRowByText(page, editValue);
  await editedRow.waitFor({ state: 'visible', timeout: 10000 });
  log(`  SELECT UI post-edit ok: riga "${editValue}" presente`);

  // ── 9) API verify UPDATE ─────────────────────────────────────────
  const upd = await api.crudRead(route, {
    filterInfo: { filters: [{ field: 'id', operator: 'eq', value: id }] }
  });
  const updRow = (upd?.results ?? upd?.data)?.[0];
  assert(updRow, 'API: row non trovata dopo update');
  assert(String(updRow[editField] ?? '').includes(editValue.split(' ')[0]),
    `API: edit non propagato. ${editField}="${updRow[editField]}"`);
  log(`  API verify UPDATE ok (${editField}="${updRow[editField]}")`);

  // ── 10) DELETE + SELECT UI verify ────────────────────────────────
  await api.crudDelete(route, { id });
  // Naviga PRIMA a una pagina diversa per sganciare la grid cached, poi
  // torna a list?filterInfo=id (cache-bust). Il `?bust=...` aggiunge
  // un query param univoco per forzare ricarica anche se URL identico.
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(300);
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}/list?filterInfo=${filterInfoById}&bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, wuic-data-repeater', { timeout: 30000 });
  await page.waitForTimeout(800);
  const rowsAfterDelete = await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
  assert(rowsAfterDelete === 0,
    `record ancora visibile in grid dopo delete (rows=${rowsAfterDelete}, id=${id})`);
  log('  SELECT UI post-delete ok (riga rimossa)');

  const screenshot = await snap(page, `${route}-crud-end`);
  return { route, id, screenshot, insertedDisplay: findValue, editedDisplay: editValue };
}
