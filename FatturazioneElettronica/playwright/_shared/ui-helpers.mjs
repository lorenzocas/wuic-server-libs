/**
 * Thin wrapper su utility e2e del framework — riuso diretto, no duplicazione.
 *
 * Path canonico framework:
 *   ../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/
 *
 * - Login: `e2e-login-utils.mjs` (gestione cookie k-user, ensureLoggedIn,
 *   loginAndNavigate, isIgnorableConsoleError) — vedi regola 26 AGENTS.
 * - Edit form: `edit-form-e2e-utils.mjs` (waitForFieldEditor,
 *   setTextFieldValue, setNumberFieldValue, setTextAreaFieldValue,
 *   selectDictionaryOption, selectLookupOption, clickSaveButton,
 *   waitForSaveSuccess, navigateToEditForm) — pattern allineato al
 *   componente <wuic-edit-form> reale del framework.
 *
 * Qui aggiungiamo SOLO helper specifici al list-grid/dispatcher (navigazione
 * route, find riga in grid, count, screenshot) che non sono coperti
 * dalle utility framework (focalizzate sull'edit-form).
 */
const FRAMEWORK_SHARED = '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared';

// ── Re-export framework login utils ─────────────────────────────────
export {
  DEFAULT_USER,
  DEFAULT_PASSWORD,
  resolveCredentials,
  preSetAuthCookie,
  ensureLoggedIn,
  loginAndNavigate,
  isIgnorableConsoleError
} from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/e2e-login-utils.mjs';

// ── Re-export framework edit-form utils ─────────────────────────────
export {
  parseEditLinkRoute,
  navigateToEditForm,
  waitForFieldEditor,
  readFieldRuntimeValue,
  waitForFieldRuntimeValue,
  readFieldEditorMeta,
  setNumberFieldValue,
  setTextFieldValue,
  setTextAreaFieldValue,
  toggleBooleanFieldValue,
  selectDictionaryOption,
  selectLookupOption,
  addMultiLookupOption,
  readMultiLookupChips,
  removeMultiLookupChip,
  readLookupDisplay,
  clickSaveButton,
  waitForSaveSuccess,
  hasFormValidationErrors,
  runEditFormScenario
} from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/edit-form-e2e-utils.mjs';

// ── Helper specifici dispatcher (non in framework utils) ─────────────

const DEFAULT_TIMEOUT = 30000;

/**
 * Naviga a `#/<route>/<action>` attendendo il bounded-repeater renderizzato.
 * Wrap intorno a `page.goto` con waitForSelector sul container framework.
 */
export async function navigateRoute(page, baseUrl, route, action = 'list') {
  const url = `${baseUrl.replace(/\/$/, '')}/#/${route}/${action}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(
    'wuic-data-repeater, wuic-list-grid, wuic-edit-form, wuic-scheduler-list, wuic-report-viewer',
    { timeout: DEFAULT_TIMEOUT }
  );
  await page.waitForTimeout(500);
}

/**
 * Click bottone "+Nuovo" toolbar list-grid (apre edit-form).
 */
export async function clickNewRecord(page) {
  const btn = page.locator(
    'wuic-list-grid p-button[icon*="plus"]:visible, wuic-list-grid button:has(.pi-plus):visible, [data-test="new-record"]:visible'
  ).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
  await page.waitForSelector('wuic-edit-form, p-dialog .p-dialog-content', { timeout: DEFAULT_TIMEOUT });
}

/** Numero righe visibili nella list-grid corrente. */
export async function countRows(page) {
  return await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
}

/** Locator per riga grid contenente un certo testo (per ricerca SELECT UI). */
export function findRowByText(page, text) {
  return page.locator(
    `wuic-list-grid tbody > tr:has-text("${text}"), .p-datatable-tbody > tr:has-text("${text}")`
  ).first();
}

/** Screenshot named in /screenshots/ — ritorna il path. */
export async function snap(page, name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `./screenshots/${stamp}_${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}
