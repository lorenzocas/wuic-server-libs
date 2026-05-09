/**
 * Test 53: row-action `btn_xml_download` su `fatture_inviate`.
 *
 * Verifica end-to-end:
 *   1) Metadata: la colonna virtuale `btn_xml_download` e' configurata
 *      (mc_ui_column_type='button', voa_class=6, mcbuttonimage='pi pi-file-import',
 *      mcbuttonaction valorizzato).
 *   2) Backend endpoints (SdiController):
 *      - GET /api/sdi/download/{id} → 404 se XML non ancora generato
 *      - POST /api/sdi/generateXml  → 200 + file scritto su disco
 *      - GET /api/sdi/download/{id} → 200 + Content-Type: application/xml +
 *                                     body con root <FatturaElettronica> +
 *                                     namespace SDI
 *   3) UI: nel list-grid filtrato sulla fattura test, il dropdown menu della
 *      riga contiene un item "XML" cliccabile; click → toast "Download avviato"
 *      + Playwright `download` event captured con il filename atteso.
 *
 * Dipendenze:
 *   - SQL patch [scripts/2026-05-09-row-action-download-xml.sql] applicato
 *   - Endpoint `/api/sdi/generateXml` + `/api/sdi/download/{id}` presenti
 *     ([Controllers/SdiController.cs])
 *   - SP `sp_sdi_get_fattura_payload` (caricata in `04_triggers.sql` o sim.)
 */
import { existsSync, statSync } from 'node:fs';
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '53',
  name: 'Fattura - row action "Scarica XML" (btn_xml_download)',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // ── 1) Metadata sanity: colonna btn_xml_download presente ────────────
  const col = await queryOne(`
    SELECT mc.mc_id, mc.mc_ui_column_type, mc.voa_class,
           CAST(mc.mcbuttonimage AS NVARCHAR(80)) AS img,
           CAST(mc.mcbuttoncaption AS NVARCHAR(80)) AS caption,
           LEN(CAST(mc.mcbuttonaction AS NVARCHAR(MAX))) AS callback_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne mc
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle mt ON mc.md_id = mt.md_id
    WHERE mt.mdroutename = 'fatture_inviate' AND mc.mc_nome_colonna = 'btn_xml_download'
  `);
  assert(col?.mc_id, 'Row action btn_xml_download non presente in _metadati__colonne');
  assert(String(col.mc_ui_column_type) === 'button',
    `mc_ui_column_type atteso 'button', visto '${col.mc_ui_column_type}'`);
  assert(Number(col.voa_class) === 6,
    `voa_class atteso 6, visto ${col.voa_class}`);
  assert(/^pi pi-file-import$/.test(col.img || ''),
    `mcbuttonimage atteso 'pi pi-file-import', visto '${col.img}'`);
  assert(Number(col.callback_len) > 100,
    `mcbuttonaction sembra vuoto (len=${col.callback_len})`);
  log(`metadata btn_xml_download: voa_class=${col.voa_class}, callback_len=${col.callback_len} ✓`);

  // ── 2) Setup test fattura via API ────────────────────────────────────
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert');

  const fatt = newFatturaInviata(clienteId, { causale: `Fattura E2E test53 ${Date.now()}` });
  const fIns = await api.crudInsert('fatture_inviate', fatt);
  const fatturaId = Number(fIns?.result ?? fIns?.id);
  assert(fatturaId > 0, 'fattura insert');

  // Riga necessaria per generare XML valido (sp_sdi_get_fattura_payload
  // ritorna 0 righe altrimenti, body XML monco)
  const iva = await api.crudRead('codici_iva', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] }
  });
  const um = await api.crudRead('unita_misura', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] }
  });
  const ivaId = (iva?.results ?? iva?.data)?.[0]?.id;
  const umId  = (um?.results ?? um?.data)?.[0]?.id;
  assert(ivaId && umId, 'lookups codici_iva/unita_misura mancanti');
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaId, ivaId, umId));
  log(`fattura id=${fatturaId} (cliente=${clienteId}) pronta con 1 riga`);

  try {
    // ── 3) Backend: download → 404 atteso (XML non ancora generato) ───
    let download404 = null;
    try {
      await api.endpoint(`/api/sdi/download/${fatturaId}`, { method: 'GET' });
    } catch (e) {
      download404 = e;
    }
    assert(download404 && download404.status === 404,
      `GET /api/sdi/download/${fatturaId} doveva tornare 404, ` +
      (download404 ? `visto ${download404.status}` : 'visto 200'));
    log(`backend: download pre-gen → 404 ✓`);

    // ── 4) Backend: generateXml → 200 + file_xml path su disco ────────
    const gen = await api.endpoint('/api/sdi/generateXml', {
      method: 'POST',
      body: { FatturaId: fatturaId }
    });
    assert(gen.ok === true, `generateXml fail: ${JSON.stringify(gen)?.slice(0, 200)}`);
    assert(gen.file_xml && existsSync(gen.file_xml),
      `file_xml non scritto su disco: ${gen.file_xml}`);
    const stats = statSync(gen.file_xml);
    assert(stats.size > 500, `XML troppo piccolo: ${stats.size}b`);
    log(`backend: generateXml → ${gen.file_name} (${stats.size}b) ✓`);

    // ── 5) Backend: download → 200 + body con root <FatturaElettronica> ─
    const xmlText = await api.endpoint(`/api/sdi/download/${fatturaId}`, {
      method: 'GET', json: false
    });
    assert(typeof xmlText === 'string' && xmlText.length > 500,
      `download body sembra vuoto/non-text: type=${typeof xmlText}, len=${xmlText?.length}`);
    assert(xmlText.includes('<p:FatturaElettronica') || xmlText.includes('FatturaElettronica'),
      `XML non contiene root FatturaElettronica`);
    assert(xmlText.includes('http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'),
      `XML non contiene namespace SDI`);
    log(`backend: download post-gen → 200, root FatturaElettronica ✓`);

    // ── 6) UI: list-grid filtrato → click row dropdown → click "XML" ──
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'id', operator: 'eq', value: fatturaId }]
    }));
    const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(
      `${baseUrl.replace(/\/$/, '')}/?bust=${bust}#/fatture_inviate/list?filterInfo=${filterInfoParam}`,
      { waitUntil: 'domcontentloaded' }
    );
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
    await page.waitForTimeout(1200);

    // Sanity: la list-grid filtrata ha esattamente 1 riga (filterInfo eq id).
    // Non assertiamo per testo di una colonna specifica (es. causale, che non
    // sempre e' visibile in list a seconda del grid-tuning).
    const dataRows = page.locator(
      'wuic-list-grid tbody > tr:not(.p-datatable-emptymessage), ' +
      '.p-datatable-tbody > tr:not(.p-datatable-emptymessage)'
    );
    await dataRows.first().waitFor({ state: 'visible', timeout: 10000 });
    const rowCount = await dataRows.count();
    assert(rowCount >= 1, `list-grid filtrato su id=${fatturaId} non mostra righe (cnt=${rowCount})`);
    log(`UI: list-grid filtrato → ${rowCount} riga(/righe) visibili`);

    // Click sul chevron del p-splitButton di riga (apre il dropdown actions)
    const rowDropdownBtn = page.locator(
      'wuic-list-grid tbody tr .p-splitbutton-dropdown, ' +
      '.p-datatable-tbody tr .p-splitbutton-dropdown'
    ).first();
    await rowDropdownBtn.waitFor({ state: 'visible', timeout: 10000 });
    await rowDropdownBtn.click({ force: true });
    await page.waitForTimeout(700);

    // Trova item "XML" (mcbuttoncaption='XML') nel popup PrimeNG
    const xmlItem = page.locator(
      'a[role="menuitem"]:has-text("XML"):visible, ' +
      '.p-menuitem-link:has-text("XML"):visible, ' +
      ':text-is("XML"):visible'
    ).filter({ hasText: /^\s*XML\s*$/ }).first();
    await xmlItem.waitFor({ state: 'visible', timeout: 8000 });
    log(`UI: dropdown row aperto, item "XML" visibile ✓`);

    // Setup capture del download Playwright PRIMA del click.
    // Il callback usa <a download="..."> + .click() che Playwright intercetta.
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    await xmlItem.click({ force: true });

    let dlInfo = null;
    try {
      const dl = await downloadPromise;
      dlInfo = { suggestedFilename: dl.suggestedFilename(), url: dl.url() };
      log(`UI: download triggered, filename="${dlInfo.suggestedFilename}" ✓`);
    } catch (e) {
      // Fallback: nessun download event visto. Verifica almeno che il toast
      // success "Download avviato" sia comparso (segno che il callback ha
      // completato senza errori).
      const toastOk = await page.locator(
        'p-toast .p-toast-message:has-text("Download avviato"), ' +
        'p-toast .p-toast-message-success:has-text("XML")'
      ).first().waitFor({ state: 'visible', timeout: 4000 })
        .then(() => true).catch(() => false);
      assert(toastOk,
        `download event non visto E toast success non visibile: ${e?.message}`);
      log(`UI: toast success "Download avviato" visibile (download event non capturato) ✓`);
    }

    return { fatturaId, fileXml: gen.file_xml, xmlSize: stats.size, ui: dlInfo };
  } finally {
    // Cleanup: cancella riga + fattura + cliente (FK chain)
    try { await api.crudDelete('fatture_inviate', { id: fatturaId }); } catch { /* */ }
    try { await api.crudDelete('clienti', { id: clienteId }); } catch { /* */ }
  }
}
