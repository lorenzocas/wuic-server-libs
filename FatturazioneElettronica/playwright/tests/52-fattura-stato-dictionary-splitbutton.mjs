/**
 * Test 52: due nuove feature visibili sul DocumentEditFormComponent.
 *
 *  A) `stato` come `mc_ui_column_type='dictionary'` (NON lookupByID)
 *     - Verifica metadata: la colonna `stato` di `fatture_inviate` deve
 *       avere `mc_ui_column_type='dictionary'` con `mcdictionaryvalue`
 *       formato `BOZZA@@Bozza||EMESSA@@Emessa||...`.
 *     - Verifica UI: in modalita' __new il widget e' un `p-select` con
 *       almeno 4 opzioni leggibili (BOZZA/EMESSA/ANNULLATA/PAGATA).
 *
 *  B) Splitbutton "Crea da documento esistente" visibile SOLO in __new.
 *     - __new mode: splitbutton presente nel DOM
 *     - edit di fattura esistente: splitbutton ASSENTE
 *
 * Selettori riferimento:
 *   document-edit-form.component.html:7  → `p-splitButton[label="Crea da documento esistente"]`
 *   document-edit-form.component.html:104 → wuic-field-editor[data-field-name=stato] p-select
 */
import { newCliente, newFatturaInviata } from '../_shared/test-data.mjs';
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '52',
  name: 'Fattura - stato dictionary widget + splitbutton solo in __new',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // ── A.1) Verify metadata: stato deve essere dictionary con mcdictionaryvalue ─
  //    NB: il parser di sql-helpers usa `-s "|"` come separatore colonne sqlcmd;
  //    il valore mcdictionaryvalue contiene `||` (es. `BOZZA@@Bozza||EMESSA@@Emessa`)
  //    che collide → split in DB con REPLACE(|| -> §§) e split in JS sui §§.
  const metaRow = await queryOne(`
    SELECT mc.mc_ui_column_type AS coltype,
           REPLACE(CAST(mc.mcdictionaryvalue AS NVARCHAR(MAX)), '||', '~~') AS dictval
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne mc
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle mt ON mc.md_id = mt.md_id
    WHERE mt.mdroutename = 'fatture_inviate' AND mc.mc_nome_colonna = 'stato'
  `);
  assert(metaRow?.coltype === 'dictionary',
    `stato.mc_ui_column_type atteso 'dictionary', visto '${metaRow?.coltype}'`);
  assert(metaRow.dictval && metaRow.dictval.includes('BOZZA@@'),
    `mcdictionaryvalue stato non contiene 'BOZZA@@': "${metaRow.dictval?.slice(0, 100)}"`);
  // Pattern atteso (dopo REPLACE): `KEY@@Label~~KEY@@Label~~...`
  const dictPairs = metaRow.dictval.split('~~').filter(Boolean);
  assert(dictPairs.length >= 4,
    `mcdictionaryvalue stato deve avere >=4 opzioni, viste ${dictPairs.length}: ${metaRow.dictval}`);
  for (const p of dictPairs) {
    assert(p.includes('@@'), `pair "${p}" non rispetta formato KEY@@Label`);
  }
  log(`metadata: stato dictionary con ${dictPairs.length} opzioni (${dictPairs.map(p => p.split('@@')[0]).join('/')}) ✓`);

  // ── A.2) Verify UI rendering: aprire __new fattura e ispezionare stato widget ─
  const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?bust=${bust}#/fatture_inviate/list`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('wuic-list-grid, wuic-data-repeater', { timeout: 15000 });
  await page.waitForTimeout(800);

  const newBtn = page.locator(
    'wuic-list-grid p-button[icon*="plus"]:visible, wuic-list-grid button:has(.pi-plus):visible'
  ).first();
  await newBtn.waitFor({ state: 'visible', timeout: 10000 });
  await newBtn.click();
  await page.waitForSelector('wuic-parametric-dialog', { timeout: 15000 });
  await page.waitForTimeout(1500);
  log('dialog __new aperto');

  // stato widget: deve essere p-select (NON p-autocomplete che e' lookup)
  const statoSelect = page.locator(
    'wuic-field-editor[data-field-name="stato"] p-select'
  ).first();
  const statoCount = await statoSelect.count();
  assert(statoCount > 0,
    'stato widget non rendered come p-select (atteso per mc_ui_column_type=dictionary)');
  // E NON deve essere p-autocomplete (sarebbe sintomo di lookupByID)
  const statoLookup = await page.locator(
    'wuic-field-editor[data-field-name="stato"] p-autocomplete'
  ).count();
  assert(statoLookup === 0,
    'stato widget rendered come p-autocomplete: dictionary configuration regression');
  log('stato widget rendered come p-select ✓');

  // Apri il dropdown e conta le opzioni visibili
  const trigger = statoSelect.locator(
    '.p-select-dropdown, .p-select-trigger, .p-select-label, [role="combobox"]'
  ).first();
  await trigger.click({ force: true });
  await page.waitForSelector(
    '.p-select-overlay, .p-select-list, [role="listbox"] [role="option"]',
    { timeout: 5000 }
  );
  const options = page.locator(
    '.p-select-option, .p-select-list-container li, [role="listbox"] [role="option"]'
  );
  const optTexts = (await options.allTextContents()).map(t => t.trim()).filter(Boolean);
  assert(optTexts.length >= 4,
    `dropdown stato dovrebbe avere >=4 opzioni, viste ${optTexts.length}: ${JSON.stringify(optTexts)}`);
  // Almeno "Bozza" e "Emessa" devono essere presenti (label umano-leggibile)
  const hasBozza = optTexts.some(t => /bozza/i.test(t));
  const hasEmessa = optTexts.some(t => /emessa/i.test(t));
  assert(hasBozza, `opzione "Bozza" mancante: ${JSON.stringify(optTexts)}`);
  assert(hasEmessa, `opzione "Emessa" mancante: ${JSON.stringify(optTexts)}`);
  log(`dropdown stato: ${optTexts.length} opzioni (Bozza+Emessa presenti) ✓`);

  // Chiudi dropdown
  await page.keyboard.press('Escape').catch(() => { });
  await page.waitForTimeout(300);

  // ── B.1) Splitbutton visibile in __new ─────────────────────────────────────
  const splitbtn = page.locator(
    'p-splitButton:has-text("Crea da documento esistente"), ' +
    '[label*="Crea da documento esistente"]'
  );
  const splitCnt = await splitbtn.count();
  assert(splitCnt > 0,
    'splitbutton "Crea da documento esistente" NON visibile in __new (atteso visible)');
  log('splitbutton visibile in __new ✓');

  // Chiudi dialog
  await page.keyboard.press('Escape').catch(() => { });
  await page.waitForTimeout(800);

  // ── B.2) Splitbutton ASSENTE in edit di fattura esistente ─────────────────
  // Crea fattura via API per avere un id da editare
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert');
  const fatt = newFatturaInviata(clienteId, { causale: `Fattura E2E test52 ${Date.now()}` });
  const fIns = await api.crudInsert('fatture_inviate', fatt);
  const fatturaId = Number(fIns?.result ?? fIns?.id);
  assert(fatturaId > 0, 'fattura insert');

  try {
    const bust2 = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`${baseUrl.replace(/\/$/, '')}/?bust=${bust2}#/fatture_inviate/edit/${fatturaId}`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('wuic-parametric-dialog, wuic-edit-form', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const splitCntEdit = await page.locator(
      'p-splitButton:has-text("Crea da documento esistente"), ' +
      '[label*="Crea da documento esistente"]'
    ).count();
    assert(splitCntEdit === 0,
      `splitbutton "Crea da documento esistente" visibile in EDIT mode (atteso ASSENTE): cnt=${splitCntEdit}`);
    log('splitbutton ASSENTE in edit di fattura esistente ✓');
  } finally {
    try { await api.crudDelete('fatture_inviate', { id: fatturaId }); } catch { /* */ }
    try { await api.crudDelete('clienti', { id: clienteId }); } catch { /* */ }
  }

  return { dictPairs: dictPairs.length, optTexts };
}
