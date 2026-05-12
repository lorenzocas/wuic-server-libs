/**
 * Debug: cattura payload POST insertRecord dal frontend per route X.
 * Confronta mezzi (PASS) vs manutenzioni (FAIL).
 */
import { chromium } from 'playwright';
import { loginAndNavigate } from './_shared/ui-helpers.mjs';
import {
  navigateRoute, clickNewRecord, waitForFieldEditor,
  setTextFieldValue, setNumberFieldValue, selectLookupOption,
  clickSaveButton
} from './_shared/ui-helpers.mjs';

const baseUrl = 'http://localhost:4200';
const route = process.argv[2] || 'manutenzioni';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('pageerror', err => consoleErrors.push(`[pageerror] ${err.message}`));
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(`[console.error] ${msg.text().slice(0, 300)}`);
});

await loginAndNavigate(page, baseUrl, { user: 'admin_test', password: 'Test123!' });
console.log('Login OK');

await navigateRoute(page, baseUrl, route, 'list');
console.log(`navigated to ${route}/list`);

// Intercetta payload POST insertRecord
let captured = null;
page.on('request', req => {
  if (req.url().includes('insertRecord') && req.method() === 'POST') {
    captured = req.postData();
  }
});

await clickNewRecord(page);
console.log('+Nuovo clicked');

if (route === 'mezzi') {
  await waitForFieldEditor(page, 'targa', { timeout: 8000, requireValue: false });
  await setTextFieldValue(page, 'targa', 'YY888YY');
  await setTextFieldValue(page, 'marca', 'DebugMarca');
  await setNumberFieldValue(page, 'anno', 2024);
  await selectLookupOption(page, 'tipo_mezzo_id', 'Auto');
} else if (route === 'manutenzioni') {
  await waitForFieldEditor(page, 'data_field', { timeout: 8000, requireValue: false });
  await setTextFieldValue(page, 'data_field', '2026-05-09 10:00:00');
  await setTextFieldValue(page, 'descrizione', 'Debug payload');
  await setTextFieldValue(page, 'fattura_numero', '_E2E_DEBUG');
  await setNumberFieldValue(page, 'costo', 100);
  await selectLookupOption(page, 'mezzo_id', 'AB123CD');
}
console.log('form filled');

await page.screenshot({ path: `./screenshots/debug_${route}_pre_save.png`, fullPage: true });

await clickSaveButton(page);
// dai tempo al request listener
await page.waitForTimeout(3000);

await page.screenshot({ path: `./screenshots/debug_${route}_post_save.png`, fullPage: true });

console.log('--- console errors ---');
consoleErrors.slice(-15).forEach(e => console.log(e));

if (captured) {
  console.log('--- POST body ---');
  try {
    const j = JSON.parse(captured);
    console.log('route:', j.route);
    console.log('entity keys:', Object.keys(j.entity || {}).sort().join(', '));
    // stampa tutti i campi audit-related
    const auditKeys = Object.keys(j.entity || {}).filter(k =>
      k.includes('data_') || k.includes('utente_') || k === 'cancellato' || k === 'id'
    );
    console.log('audit/system keys in entity:');
    for (const k of auditKeys) {
      console.log('  ', k, '=', JSON.stringify(j.entity[k]));
    }
  } catch (e) {
    console.log('raw body (first 500):', captured.slice(0, 500));
  }
} else {
  console.log('NO request captured (save might not have triggered POST)');
}

await browser.close();
