import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';
import { navigateRoute, clickNewRecord, waitForFieldEditor } from './_shared/ui-helpers.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await loginAndNavigate(page, 'http://localhost:4200', { user: 'admin_test', password: 'Test123!' });
// Clear caches
await page.evaluate(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await new Promise(r => { const req = indexedDB.deleteDatabase('MetaDB'); req.onsuccess = req.onerror = req.onblocked = () => r(); });
});
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);

await navigateRoute(page, 'http://localhost:4200', 'manutenzioni', 'list');
await clickNewRecord(page);
await waitForFieldEditor(page, 'mezzo_id', { timeout: 15000, requireValue: false });
await page.waitForTimeout(500);

const dom = await page.evaluate(() => {
  const editor = document.querySelector('wuic-field-editor[data-field-name="data_field"]');
  if (!editor) return { error: 'editor non trovato' };
  const inner = editor.querySelector('wuic-date-editor');
  const dp = editor.querySelector('p-datepicker');
  const inputs = Array.from(editor.querySelectorAll('input')).map(i => ({
    id: i.id, name: i.name, class: i.className, role: i.getAttribute('role'),
    ariaLabel: i.getAttribute('aria-label'), readOnly: i.readOnly
  }));
  return {
    fieldEditor: editor.outerHTML.slice(0, 200),
    hasInner: !!inner,
    hasPDatepicker: !!dp,
    inputs
  };
});
console.log(JSON.stringify(dom, null, 2));

// Prova type + Enter (4-digit year)
const input = page.locator('#data_field');
await input.click();
await page.keyboard.type('09/05/2026', { delay: 30 });
console.log('after type:', await input.inputValue());
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
console.log('after Enter:', await input.inputValue());
await page.screenshot({ path: './screenshots/debug_dp_after_fill.png' });

// Check ngModel value reading via DOM data-attr
const fieldVal = await page.evaluate(() => {
  const editor = document.querySelector('wuic-field-editor[data-field-name="data_field"]');
  return editor?.getAttribute('data-field-value');
});
console.log('field-value attr:', fieldVal);

await browser.close();
