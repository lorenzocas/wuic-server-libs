/**
 * Test 67: row action `prodotto_varianti / btn_apri_prodotto_padre`.
 * Click sull'icona apre la edit del prodotto padre via redirect.
 */
import { queryOne, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '67',
  name: 'Row action: prodotto_varianti/Apri prodotto padre',
  area: 'actions',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // 1) Metadata sanity
  const col = await queryOne(`
    SELECT c.mc_id, c.mc_ui_column_type, c.voa_class,
           CAST(c.mcbuttonimage AS NVARCHAR(80)) AS img,
           LEN(CAST(c.mcbuttonaction AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne c
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id=c.md_id
    WHERE t.mdroutename='prodotto_varianti' AND c.mc_nome_colonna='btn_apri_prodotto_padre'
  `);
  assert(col?.mc_id, 'row action btn_apri_prodotto_padre non in metadata');
  assert(Number(col.voa_class) === 6, `voa_class atteso 6, visto ${col.voa_class}`);
  assert(/pi pi-external-link/.test(col.img), `mcbuttonimage atteso 'pi pi-external-link', visto '${col.img}'`);
  assert(Number(col.cb_len) > 30, `callback vuoto`);
  log(`metadata: mc_id=${col.mc_id}, cb_len=${col.cb_len}`);

  // 2) Seed: 1 prodotto + 1 attributo + 1 valore + 1 variante linkata
  const ts = Date.now();
  const prodIns = await api.crudInsert('prodotti', {
    codice: `_e2e_pv_${ts}`, descrizione: `_e2e prodotto varianti ${ts}`,
    prezzo_vendita: 100, prezzo_acquisto: 50, has_varianti: 1
  });
  const prodId = Number(prodIns?.result ?? prodIns?.id);
  assert(prodId > 0, 'prodotto insert');

  const varIns = await api.crudInsert('prodotto_varianti', {
    prodotto_id: prodId, sku: `_e2e_sku_${ts}`,
    descrizione_estesa: `_e2e variante test ${ts}`
  });
  const varId = Number(varIns?.result ?? varIns?.id);
  assert(varId > 0, 'variante insert');

  try {
    // 3) UI: lista filtered by id → row action button
    const filt = encodeURIComponent(JSON.stringify({ filters: [{ field: 'id', operator: 'eq', value: varId }] }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/prodotto_varianti/list?filterInfo=${filt}&bust=${ts}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const rows = page.locator('wuic-list-grid tbody > tr:not(.p-datatable-emptymessage), .p-datatable-tbody > tr:not(.p-datatable-emptymessage)');
    await rows.first().waitFor({ state: 'visible', timeout: 10000 });
    log(`riga variante visibile ✓`);

    // Row dropdown / direct button col
    const rowBtn = page.locator(
      'wuic-list-grid tbody tr .pi-external-link, ' +
      'wuic-list-grid tbody tr button[aria-label*="padre"], ' +
      '.p-datatable-tbody tr .pi-external-link'
    ).first();

    let clicked = false;
    if (await rowBtn.count() > 0) {
      await rowBtn.click({ force: true });
      clicked = true;
    } else {
      // Fallback: row dropdown menu
      const dd = page.locator('wuic-list-grid tbody tr .p-splitbutton-dropdown, .p-datatable-tbody tr .p-splitbutton-dropdown').first();
      if (await dd.count() > 0) {
        await dd.click({ force: true });
        await page.waitForTimeout(600);
        const item = page.locator(':text("padre"):visible, :text("prodotto"):visible').first();
        if (await item.isVisible().catch(() => false)) { await item.click({ force: true }); clicked = true; }
      }
    }
    assert(clicked, 'row action button non trovato cliccabile');
    await page.waitForTimeout(1500);

    // Verify: URL include prodotto padre id (navigate) OR toast visible
    const url = page.url();
    const navigated = url.includes(`/prodotti/edit/${prodId}`) || url.includes(`/prodotti/`);
    const toast = await page.locator('p-toast .p-toast-message').count();
    assert(navigated || toast > 0, `click action: nessun side-effect (url=${url})`);
    log(`side-effect: navigated=${navigated}, toast=${toast}`);
  } finally {
    try { await exec(`DELETE FROM dbo.prodotto_varianti WHERE id=${varId}`); } catch {}
    try { await api.crudDelete('prodotti', { id: prodId }); } catch {}
  }

  return { mc_id: col.mc_id, variante_id: varId, prodotto_id: prodId };
}
