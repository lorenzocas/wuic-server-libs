/**
 * Test 50: Save guard del DocumentEditFormComponent.
 *
 * Verifica il guard `installSaveValidationGuard` che monkey-patcha
 * `parametricDialog.submitData` per bloccare il save quando:
 *   (a) `righeDs.resultInfo.dato.length === 0`  (nessuna riga prodotti)
 *   (b) almeno una riga ha `prodotto_id` non valorizzato
 *
 * Pattern UI:
 *  - Apri dialog __new di `fatture_inviate/list` → toolbar "+Aggiungi"
 *  - Pick cliente lookup (counterparty obbligatorio per il default flow)
 *  - Caso (a): click Salva subito (zero righe in righeDs.dato) → toast warn
 *              "almeno una riga prodotti" + dialog ANCORA APERTO.
 *  - Cleanup: chiudi dialog tramite ESC.
 *
 * Caso (b) (riga senza prodotto) NON e' coperto qui: aggiungere una riga
 * via UI senza prodotto richiede di interagire col list-grid nested e
 * inline-cell-editing, fragile in headless. La logica del guard sulla
 * riga vuota e' comunque verificata indirettamente dallo stesso codepath
 * di submitData (vedi document-edit-form.component.ts:265-307).
 *
 * Nota: il toast PrimeNG ha auto-dismiss; usiamo `waitForSelector` con
 * timeout breve sul container `.p-toast-message`.
 */
import { newCliente } from '../_shared/test-data.mjs';

export const meta = {
  id: '50',
  name: 'Fattura - save guard blocca salvataggio senza righe',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // 1) Setup: cliente di test via API. Ragione sociale con tag unico per
  //    permettere ricerca lookup deterministica (il textField del lookup
  //    cliente_id e' `ragione_sociale`).
  const uniqTag = `T50-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const cl = newCliente({ ragione_sociale: `${uniqTag} S.r.l. (e2e)` });
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert');
  log(`cliente id=${clienteId} (${cl.ragione_sociale})`);

  try {
    // 2) Hard-reload list + click +Aggiungi
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
    await page.waitForTimeout(1500); // wait component init + saveGuard install
    log('dialog __new aperto');

    // 3) Pick cliente lookup (cosi' il save tenta davvero di andare avanti).
    //    Senza counterparty, framework potrebbe bloccare prima di toccare il guard.
    const clInput = page.locator(
      'wuic-field-editor[data-field-name="cliente_id"] p-autocomplete input'
    ).first();
    await clInput.waitFor({ state: 'visible', timeout: 10000 });
    await clInput.click();
    await clInput.fill('');
    // ricerca per uniqTag (parte ricercabile del ragione_sociale, univoco per run)
    const searchTerm = uniqTag;
    await clInput.type(searchTerm, { delay: 30 });
    await page.waitForTimeout(900);
    const opts = page.locator(
      '.p-autocomplete-overlay .p-autocomplete-option, .p-autocomplete-list .p-autocomplete-option'
    );
    const optCnt = await opts.count();
    assert(optCnt > 0, `lookup cliente non ha opzioni per "${searchTerm}"`);
    await opts.first().click({ force: true });
    await page.waitForTimeout(400);
    log('cliente lookup selezionato');

    // 4) Click Salva con righeDs.dato.length === 0 (zero righe prodotti).
    //    Atteso: toast warn + dialog ancora aperto.
    // Save btn = toolbar parametric-dialog `p-button[icon="pi pi-save"]`
    // (vedi clickSaveButton in edit-form-e2e-utils.mjs)
    const saveBtn = page.locator(
      '.parametric-dialog-toolbar p-button[icon="pi pi-save"] button'
    ).first();
    await saveBtn.waitFor({ state: 'visible', timeout: 8000 });
    await saveBtn.click({ force: true });
    log('click Salva (no rows)');

    // 5) Toast atteso: severity=warn con il messaggio "almeno una riga prodotti".
    //    Il guard usa WtoolboxService.messageNotificationService.add({severity:'warn',
    //    summary:'Validazione', detail:'Impossibile salvare il documento: aggiungi almeno una riga prodotti.'})
    const toast = page.locator(
      'p-toast .p-toast-message-warn:has-text("riga prodotti"), ' +
      'p-toast .p-toast-message:has-text("almeno una riga prodotti")'
    ).first();
    await toast.waitFor({ state: 'visible', timeout: 4000 });
    log('toast "Validazione: almeno una riga prodotti" visibile ✓');

    // 6) Dialog ancora aperto (NON sottomesso, NON chiuso). Per le route con
    //    `md_edit_template` (qui `fatture_inviate` -> DocumentEditFormComponent),
    //    il framework renderizza il custom component via `ngComponentOutlet`,
    //    NON la `<form class="parametric-dialog-form">`. Usiamo il selector
    //    della custom form class o, in alternativa, il wrapper framework
    //    `.form-edit-wrapper`.
    const dialogLoc = page.locator(
      'wuic-parametric-dialog form.document-edit-form, wuic-parametric-dialog .form-edit-wrapper'
    ).first();
    const stillVisible = await dialogLoc.isVisible().catch(() => false);
    assert(stillVisible, 'dialog NON aperto post-save bloccato (atteso: dialog ancora visibile)');
    log('dialog ancora aperto post-blocco ✓');

    // 7) Verifica server-side: nessuna fattura con cliente_id appena creato e' stata persistita
    const found = await api.crudRead('fatture_inviate', {
      filterInfo: { logic: 'AND', filters: [{ field: 'cliente_id', operatore: 'eq', value: String(clienteId), __descriptorManaged: true }] }
    });
    const arr = found?.results || found?.Data || found?.data || (Array.isArray(found) ? found : []);
    assert(arr.length === 0, `save NON bloccato lato server: trovate ${arr.length} fatture con cliente_id=${clienteId}`);
    log(`server-side: 0 fatture persistite per cliente_id=${clienteId} ✓`);

    // 8) Cleanup UI: chiudi dialog via ESC (no-op se gia' chiuso)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  } finally {
    try { await api.crudDelete('clienti', { id: clienteId }); } catch { /* */ }
  }

  return { clienteId };
}
