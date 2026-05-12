/**
 * Helper riusabile CRUD UI per anagrafiche FlottaMezzi.
 * Pattern: navigate list -> +Nuovo -> fill -> save -> UI verify -> API verify
 *          -> API update -> API verify -> API delete -> UI verify rimozione.
 *
 * Riusa SOLO utility framework (edit-form-e2e-utils, ui-helpers).
 */
import {
  navigateRoute, clickNewRecord, findRowByText, snap,
  waitForFieldEditor, setTextFieldValue, setNumberFieldValue, setTextAreaFieldValue,
  setDateFieldValue,
  selectLookupOption, clickSaveButton, waitForSaveSuccess
} from './ui-helpers.mjs';

/**
 * @param {object} ctx - dispatcher ctx { page, api, baseUrl, assert, log }
 * @param {object} opts
 * @param {string} opts.route - route name (es. 'conducenti')
 * @param {object} opts.textFields - {field: value, ...} text inputs
 * @param {object} [opts.numberFields] - {field: value, ...}
 * @param {object} [opts.textareaFields] - {field: value, ...}
 * @param {Array}  [opts.lookups] - [{field, optionLabel}, ...]
 * @param {string} opts.filterField - colonna per UI verify dopo insert (deve essere unique)
 * @param {string} opts.editField - colonna da modificare per verify UPDATE
 * @param {string} opts.editValue - nuovo valore (es. "EDITED")
 */
export async function runCrudFlow(ctx, opts) {
  const { page, api, baseUrl, assert, log } = ctx;
  const {
    route, textFields = {}, numberFields = {}, textareaFields = {}, dateFields = {},
    lookups = [], filterField, editField, editValue
  } = opts;

  const filterValue = textFields[filterField];
  assert(route && filterField && editField && editValue, 'opts mancanti');
  assert(filterValue, `filterField "${filterField}" non in textFields`);

  // 1) navigate list
  await navigateRoute(page, baseUrl, route, 'list');
  log(`${route}/list loaded`);

  // dismiss eventuali dialog + attendo detach completo dei masks
  // (race condition tra test consecutivi se dialog overlay e' in transition)
  const ok = page.locator('p-dialog button:has-text("OK"), p-confirmdialog button:has-text("OK")').first();
  if (await ok.isVisible().catch(() => false)) await ok.click({ force: true }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForFunction(() => {
    const masks = document.querySelectorAll('.p-dialog-mask, .p-overlay-mask');
    return masks.length === 0 || Array.from(masks).every(m =>
      getComputedStyle(m).pointerEvents === 'none' && getComputedStyle(m).opacity === '0'
    );
  }, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // 2) +Nuovo
  await clickNewRecord(page);
  log('+Nuovo cliccato');

  // 3) Attendo render completo dei campi del form (lazy dei wuic-field-editor).
  // Cerco un field tra TUTTI i tipi disponibili (testuali, lookup, date, number).
  // 30s timeout perche' su form complessi (10+ field) il primo render puo' tardare.
  const allFieldKeys = [
    ...Object.keys(textFields),
    ...Object.keys(numberFields),
    ...Object.keys(textareaFields),
    ...Object.keys(dateFields),
    ...lookups.map(l => l.field)
  ];
  if (allFieldKeys[0]) {
    await waitForFieldEditor(page, allFieldKeys[0], { timeout: 30000, requireValue: false });
  }
  await page.waitForTimeout(500);  // settle lazy-render

  for (const [field, value] of Object.entries(textFields)) {
    await setTextFieldValue(page, field, String(value));
  }
  for (const [field, value] of Object.entries(numberFields)) {
    await setNumberFieldValue(page, field, value);
  }
  for (const [field, value] of Object.entries(textareaFields)) {
    await setTextAreaFieldValue(page, field, value);
  }
  for (const [field, value] of Object.entries(dateFields)) {
    await setDateFieldValue(page, field, value);
  }
  for (const l of lookups) {
    await selectLookupOption(page, l.field, l.optionLabel);
  }
  log(`form filled: ${filterField}=${filterValue}`);

  // 4) save
  await clickSaveButton(page);
  await waitForSaveSuccess(page, { timeout: 15000 });
  log('saved');

  // 5) UI verify INSERT
  const filterParam = encodeURIComponent(JSON.stringify({
    filters: [{ field: filterField, operator: 'eq', value: filterValue }]
  }));
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}/list?filterInfo=${filterParam}`,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(800);
  const row = findRowByText(page, filterValue);
  await row.waitFor({ state: 'visible', timeout: 10000 });
  log(`UI verify INSERT ok: "${filterValue}" presente`);

  // 6) API verify INSERT
  const ins = await api.crudRead(route, {
    filterInfo: { filters: [{ field: filterField, operator: 'eq', value: filterValue }] }
  });
  const insRows = ins?.results ?? ins?.data ?? [];
  assert(insRows.length === 1, `API: insert non trovato (count=${insRows.length})`);
  const id = insRows[0].id ?? insRows[0].Id;
  assert(id > 0, 'API: id non valorizzato');
  log(`API verify INSERT ok (id=${id})`);

  // 7) API update
  await api.crudUpdate(route, { id, [editField]: editValue });
  log(`API update ${editField}="${editValue}"`);

  // 8) API verify update
  const upd = await api.crudRead(route, {
    filterInfo: { filters: [{ field: 'id', operator: 'eq', value: id }] }
  });
  const updRow = (upd?.results ?? upd?.data)?.[0];
  assert(updRow, 'API: row non trovata dopo update');
  const editedNow = String(updRow[editField] ?? '');
  assert(editedNow.includes(editValue.split(' ')[0]) || editedNow === editValue,
    `API: edit non propagato. ${editField}="${editedNow}" expected~"${editValue}"`);
  log(`API verify UPDATE ok (${editField}="${editedNow}")`);

  // 9) API delete + UI verify
  await api.crudDelete(route, { id });
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(300);
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/${route}/list?filterInfo=${filterParam}&bust=${Date.now()}`,
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid', { timeout: 30000 });
  await page.waitForTimeout(800);
  const rowsAfter = await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
  assert(rowsAfter === 0, `record visibile dopo delete (rows=${rowsAfter})`);
  log('UI verify DELETE ok');

  await snap(page, `${route}-crud-end`);
  return { route, id, filterValue };
}
