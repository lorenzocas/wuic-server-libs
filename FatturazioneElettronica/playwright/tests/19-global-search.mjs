/**
 * Test 19: Workflow #12 — Search globale cross-route (versione full-text-like).
 *
 * Verifica che sp_global_search v2 (file 23_sp_global_search_v2.sql) cerchi in
 * TUTTI i campi testo significativi delle anagrafiche e documenti, non solo
 * codice/ragione_sociale.
 *
 * Setup: 1 cliente con dati distintivi su piu' campi:
 *   - ragione_sociale: nome fantasy + suffisso univoco "(e2e<RUN_ID>)"
 *   - partita_iva: 11-cifre random univoche
 *   - email: contiene RUN_ID
 *   - citta: "Bergamo" (valore raro nella popolazione di test)
 *
 * Test:
 *   A. Search per il suffisso univoco RUN_ID → trova il cliente in ragione_sociale
 *   B. Search per la P.IVA univoca → trova il cliente
 *   C. Search per l'email univoca → trova il cliente (campo "email" → score 55)
 *   D. Search per "Bergamo" (citta) → trova il cliente
 *   E. Query troppo corta (<2 char) → empty results
 *   F. UI: digita il suffisso univoco nel command palette → dropdown → click → naviga
 */
import { newClienteRealistico, RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '19',
  name: 'Search globale full-text-like (codice/p.iva/email/citta + UI dropdown)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // Setup: cliente fantasy con dati distintivi su piu' campi
  // Generiamo P.IVA univoca a partire da timestamp (11 cifre)
  const ts = Date.now().toString();
  const pivaUniq = ('1' + ts.slice(-10)).slice(0, 11);  // 11 cifre
  const emailToken = `acme_test_${RUN_ID.slice(0, 6)}@example.it`;
  const ragSocSuffix = `(e2e ${RUN_ID})`;

  const cl = newClienteRealistico({
    // Override per garantire token univoci cercabili in piu' campi
    partita_iva: pivaUniq,
    codice_fiscale: pivaUniq,
    email: emailToken,
    citta: 'Bergamo',  // valore raro per il test D
    provincia: 'BG'
  });
  // suffisso univoco anche nella ragione_sociale per il test A
  cl.ragione_sociale = cl.ragione_sociale.replace(' (e2e)', ` ${ragSocSuffix}`);

  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');
  log(`cliente test id=${clienteId} ragione="${cl.ragione_sociale}" piva=${pivaUniq} email=${emailToken} citta=Bergamo`);

  // === Test A: search per suffisso univoco in ragione_sociale ===
  let r = await fetch(`${apiBase}/api/search/global?q=${encodeURIComponent(RUN_ID)}&top=5`);
  let j = await r.json();
  assert(j.ok === true, `A: search fail: ${JSON.stringify(j)?.slice(0,200)}`);
  let found = j.results?.find(x => x.entity_type === 'cliente' && Number(x.id) === clienteId);
  assert(found, `A: cliente non trovato cercando RUN_ID="${RUN_ID}" in ragione_sociale`);
  assert(found.route === 'clienti', `A: route errata: ${found.route}`);
  log(`Test A: search per RUN_ID → trovato cliente id=${clienteId} score=${found.score}`);

  // === Test B: search per P.IVA univoca ===
  r = await fetch(`${apiBase}/api/search/global?q=${encodeURIComponent(pivaUniq)}&top=5`);
  j = await r.json();
  found = j.results?.find(x => x.entity_type === 'cliente' && Number(x.id) === clienteId);
  assert(found, `B: cliente non trovato cercando P.IVA "${pivaUniq}"`);
  assert(found.score >= 70, `B: score per match P.IVA atteso >=70, visto ${found.score}`);
  log(`Test B: search per P.IVA "${pivaUniq}" → trovato score=${found.score} (atteso >=70)`);

  // === Test C: search per email ===
  r = await fetch(`${apiBase}/api/search/global?q=${encodeURIComponent(emailToken)}&top=5`);
  j = await r.json();
  found = j.results?.find(x => x.entity_type === 'cliente' && Number(x.id) === clienteId);
  assert(found, `C: cliente non trovato cercando email "${emailToken}"`);
  assert(found.score >= 55, `C: score email atteso >=55, visto ${found.score}`);
  log(`Test C: search per email → trovato score=${found.score}`);

  // === Test D: search per citta ===
  r = await fetch(`${apiBase}/api/search/global?q=Bergamo&top=20`);
  j = await r.json();
  found = j.results?.find(x => x.entity_type === 'cliente' && Number(x.id) === clienteId);
  assert(found, `D: cliente non trovato cercando citta "Bergamo"`);
  // Score 40 per citta (free text)
  log(`Test D: search per citta "Bergamo" → trovato score=${found.score}`);

  // === Test E: query troppo corta ===
  r = await fetch(`${apiBase}/api/search/global?q=a`);
  j = await r.json();
  assert(j.ok === true && (!j.results || j.results.length === 0),
    `E: query troppo corta deve ritornare empty: ${JSON.stringify(j)?.slice(0,100)}`);
  log(`Test E: query corta → empty (atteso)`);

  // === Test F: UI flow command palette ===
  if (ctx.page) {
    const { page } = ctx;
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/clienti/list?bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(800);

    // Cleanup pre-test dialog stale
    try {
      const okBtn = page.locator('wuic-error-dialog .p-dialog button:has-text("ok")').first();
      if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await okBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    } catch {}

    const fab = page.locator('#app_global_search_fab');
    await fab.waitFor({ state: 'visible', timeout: 10000 });
    await fab.click();
    await page.waitForTimeout(500);

    const searchInput = page.locator('#app_global_search_input');
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    await searchInput.fill(RUN_ID);
    await page.waitForTimeout(1500);

    const dropdown = page.locator('.app-global-search__results');
    await dropdown.waitFor({ state: 'visible', timeout: 5000 });
    const items = await page.locator('.app-global-search__item').count();
    assert(items >= 1, `F: dropdown >=1 item, visti ${items}`);
    log(`Test F UI: dropdown shows ${items} item(s)`);

    const targetItem = page.locator(`.app-global-search__item[data-entity="cliente"][data-id="${clienteId}"]`).first();
    await targetItem.waitFor({ state: 'visible', timeout: 3000 });

    const snapBeforeClick = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_19_dropdown_${Date.now()}.png`;
    await page.screenshot({ path: snapBeforeClick, fullPage: false });

    await targetItem.click();
    await page.waitForTimeout(2500);
    const url = page.url();
    assert(url.includes(`/clienti/edit/${clienteId}`),
      `F: URL dopo click: "${url}"`);
    log(`Test F UI: navigato a ${url}`);

    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_19_global_search_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    log(`screenshot: ${snapPath}`);
  }

  // Cleanup
  try { await api.crudDelete('clienti', { id: clienteId }); } catch {}

  return { clienteId, fields_tested: 4 };
}
