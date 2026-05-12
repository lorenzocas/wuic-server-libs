/**
 * Re-export degli helper UI framework. Path canonico:
 *   KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/
 */
export {
  loginAndNavigate,
  ensureLoggedIn,
  isIgnorableConsoleError,
  DEFAULT_USER,
  DEFAULT_PASSWORD
} from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/e2e-login-utils.mjs';

export {
  navigateToEditForm,
  waitForFieldEditor,
  setTextFieldValue,
  setNumberFieldValue,
  setTextAreaFieldValue,
  selectLookupOption,
  selectDictionaryOption,
  clickSaveButton,
  waitForSaveSuccess,
  readFieldRuntimeValue
} from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/edit-form-e2e-utils.mjs';

const DEFAULT_TIMEOUT = 30000;

/** Naviga a #/<route>/<action> e attende il container framework renderizzato. */
export async function navigateRoute(page, baseUrl, route, action = 'list') {
  const url = `${baseUrl.replace(/\/$/, '')}/#/${route}/${action}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(
    'wuic-data-repeater, wuic-list-grid, wuic-edit-form, wuic-map-list',
    { timeout: DEFAULT_TIMEOUT }
  );
  await page.waitForTimeout(500);
}

/** Click toolbar "+Nuovo" della list-grid -> apre edit-form.
 *  Pre-clean: attende detach di eventuali dialog-mask residui (leave-active)
 *  da test/dialog precedenti che intercetterebbero il click. */
export async function clickNewRecord(page) {
  // Wait dismiss di eventuali dialog masks residui (animation leave-active ~300ms)
  await page.waitForFunction(() => {
    const masks = document.querySelectorAll('.p-dialog-mask, .p-overlay-mask');
    if (!masks.length) return true;
    return Array.from(masks).every(m =>
      m.classList.contains('p-overlay-mask-leave-to') === false &&
      getComputedStyle(m).pointerEvents === 'none'
    );
  }, { timeout: 5000 }).catch(() => {});

  const btn = page.locator(
    'wuic-list-grid p-button[icon*="plus"]:visible, wuic-list-grid button:has(.pi-plus):visible, [data-test="new-record"]:visible'
  ).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click({ force: true });
  await page.waitForSelector('wuic-edit-form, p-dialog .p-dialog-content', { timeout: DEFAULT_TIMEOUT });
}

/** Conta le righe visibili nella list-grid corrente. */
export async function countRows(page) {
  return await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
}

/** Locator per riga della grid contenente il testo. */
export function findRowByText(page, text) {
  return page.locator(
    `wuic-list-grid tbody > tr:has-text("${text}"), .p-datatable-tbody > tr:has-text("${text}")`
  ).first();
}

/**
 * Setter per campo `wuic-date-editor` (PrimeNG `<p-datepicker>` con dateFormat="dd/mm/yy").
 * Accetta data ISO `YYYY-MM-DD` o `YYYY-MM-DD HH:MM:SS` e la converte in `dd/mm/yy`.
 * Il framework wuic-text-editor non e' compatibile con `<p-datepicker>` — serve setter dedicato.
 */
export async function setDateFieldValue(page, fieldName, isoDate) {
  // Parse ISO date (yyyy-mm-dd or yyyy-mm-dd hh:mm:ss)
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`setDateFieldValue: ISO date non valida: ${isoDate}`);
  const [, yyyy, mm, dd] = m;
  const formatted = `${dd}/${mm}/${yyyy}`;  // p-datepicker dateFormat="dd/mm/yy" usa yy = 4-digit year

  // p-datepicker: input id = field.ang_name (= mc_nome_colonna).
  // NB: `fill()` + Tab svuota il valore (verificato 2026-05-09): il datepicker
  // accetta SOLO `keyboard.type()` + Enter per commit del ngModel.
  const input = page.locator(`p-datepicker input[id="${fieldName}"], #${fieldName}`).first();
  await input.waitFor({ state: 'visible', timeout: 5000 });
  await input.click();
  await input.fill('');  // clear eventuale valore precedente
  await page.keyboard.type(formatted, { delay: 20 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

/** Screenshot in screenshots/ — ritorna path. */
export async function snap(page, name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `./screenshots/${stamp}_${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}
