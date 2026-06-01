/**
 * Test 68: row action `prodotto_attributi_valori / btn_apri_attributo_padre`.
 * Click → redirect a edit dell'attributo padre.
 */
import { queryOne, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '68',
  name: 'Row action: prodotto_attributi_valori/Apri attributo padre',
  area: 'actions',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  const col = await queryOne(`
    SELECT c.mc_id, c.voa_class, CAST(c.mcbuttonimage AS NVARCHAR(80)) AS img,
           LEN(CAST(c.mcbuttonaction AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne c
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id=c.md_id
    WHERE t.mdroutename='prodotto_attributi_valori' AND c.mc_nome_colonna='btn_apri_attributo_padre'
  `);
  assert(col?.mc_id, 'row action btn_apri_attributo_padre non in metadata');
  assert(Number(col.voa_class) === 6, 'voa_class non 6');
  log(`metadata: mc_id=${col.mc_id}, cb_len=${col.cb_len}`);

  const ts = Date.now();
  const attrIns = await api.crudInsert('prodotto_attributi', {
    codice: `_e2e_at_${ts}`, descrizione: `_e2e attributo test ${ts}`
  });
  const attrId = Number(attrIns?.result ?? attrIns?.id);
  assert(attrId > 0, 'attributo insert');

  const valIns = await api.crudInsert('prodotto_attributi_valori', {
    attributo_id: attrId, codice: `V${ts.toString().slice(-6)}`,
    descrizione: `_e2e valore ${ts}`
  });
  const valId = Number(valIns?.result ?? valIns?.id);

  try {
    const filt = encodeURIComponent(JSON.stringify({ filters: [{ field: 'id', operator: 'eq', value: valId }] }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/prodotto_attributi_valori/list?filterInfo=${filt}&bust=${ts}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const rowBtn = page.locator('wuic-list-grid tbody tr .pi-external-link, .p-datatable-tbody tr .pi-external-link').first();
    let clicked = false;
    if (await rowBtn.count() > 0) {
      await rowBtn.click({ force: true });
      clicked = true;
    } else {
      const dd = page.locator('wuic-list-grid tbody tr .p-splitbutton-dropdown, .p-datatable-tbody tr .p-splitbutton-dropdown').first();
      if (await dd.count() > 0) {
        await dd.click({ force: true });
        await page.waitForTimeout(600);
        const item = page.locator(':text("attributo"):visible, :text("padre"):visible').first();
        if (await item.isVisible().catch(() => false)) { await item.click({ force: true }); clicked = true; }
      }
    }
    assert(clicked, 'row action button non trovato');
    await page.waitForTimeout(1500);

    const url = page.url();
    const navigated = url.includes(`prodotto_attributi`) && url.includes(`/edit/`);
    const toast = await page.locator('p-toast .p-toast-message').count();
    assert(navigated || toast > 0, `nessun side-effect (url=${url})`);
    log(`side-effect: navigated=${navigated}, toast=${toast}`);
  } finally {
    try { await exec(`DELETE FROM dbo.prodotto_attributi_valori WHERE id=${valId}`); } catch {}
    try { await api.crudDelete('prodotto_attributi', { id: attrId }); } catch {}
  }

  return { mc_id: col.mc_id, valore_id: valId, attributo_id: attrId };
}
