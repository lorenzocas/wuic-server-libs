/**
 * Test 20: Workflow #13 — Anteprima PDF fattura via row action.
 *
 * 1) Crea fattura test con riga
 * 2) UI: navigate fatture_inviate/list, click chevron riga, click "PDF"
 * 3) Verifica navigazione a #/fatture_inviate/print/<id>
 * 4) Verifica componente FatturaPrintComponent renderizza titolo + righe
 */
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';
import { queryOne, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '20',
  name: 'Anteprima PDF fattura via row action button',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, assert, log } = ctx;

  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');

  const fattRes = await api.crudInsert('fatture_inviate', newFatturaInviata(clienteId, { causale: `PDF test ${Date.now()}` }));
  const fatturaId = Number(fattRes?.result ?? fattRes?.id);
  assert(fatturaId > 0, 'fattura insert fail');

  const iva22 = await queryOne(`SELECT TOP 1 id FROM dbo.codici_iva WHERE codice='22'`);
  const um = await queryOne(`SELECT TOP 1 id FROM dbo.unita_misura WHERE codice='pz'`);
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaId, Number(iva22.id), Number(um.id), {
    quantita: 2, prezzo_unitario: 50, imponibile_riga: 100, iva_riga: 22, totale_riga: 122
  }));
  log(`fattura test creata id=${fatturaId} con 1 riga`);

  if (ctx.page) {
    const { page } = ctx;
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'id', operator: 'eq', value: fatturaId }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/fatture_inviate/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Click sul chevron row dropdown
    const dropdown = page.locator('wuic-list-grid tbody tr .p-splitbutton-dropdown').first();
    await dropdown.waitFor({ state: 'visible', timeout: 10000 });
    await dropdown.click({ force: true });
    await page.waitForTimeout(800);

    // Click sull'item "PDF" nel popup
    const pdfItem = page.locator(':text-is("PDF"):visible, .p-menuitem-link:has-text("PDF"):visible').first();
    await pdfItem.waitFor({ state: 'visible', timeout: 5000 });
    log('  UI: dropdown aperto, item "PDF" visibile');
    await pdfItem.click({ force: true });
    await page.waitForTimeout(2500);

    // Verifica navigazione a #/fatture_inviate/print/<id>
    const url = page.url();
    assert(url.includes(`/fatture_inviate/print/${fatturaId}`),
      `URL post-click: "${url}" (atteso /fatture_inviate/print/${fatturaId})`);
    log(`  UI: navigato a ${url}`);

    // Verifica FatturaPrintComponent renderizza qualcosa di significativo
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    assert(bodyText.includes('Fattura') || bodyText.includes('Cliente') || bodyText.includes('imponibile') || bodyText.includes('Riepilogo'),
      `componente print non renderizza contenuto fattura. body[0:200]: "${bodyText.slice(0, 200)}"`);
    log(`  UI: FatturaPrintComponent renderizza contenuto`);

    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_20_pdf_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    log(`screenshot: ${snapPath}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.fatture_inviate_righe WHERE fattura_id=${fatturaId}`);
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id=${fatturaId}`);
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch {}

  return { fatturaId };
}
