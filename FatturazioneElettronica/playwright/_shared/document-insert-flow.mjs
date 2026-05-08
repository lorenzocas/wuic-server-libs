/**
 * Shared end-to-end flow per l'insert di un documento via UI.
 *
 * Pattern uniforme per le 8 route gestite dal custom DocumentEditFormComponent:
 *   - documenti emessi (fatture_inviate, preventivi, ordini, ddt,
 *     ordini_acquisto, proforma): autoComposeNumero=true. Il `numero`
 *     viene composto come `[serie ]<progressivo>/<anno>` dal custom
 *     component, readonly.
 *   - documenti ricevuti (fatture_ricevute, ordini_elettronici):
 *     autoComposeNumero=false. Il `numero_fornitore` / `numero_pa` e' un
 *     dato ESTERNO (fornitore / PA), il test deve compilarlo manualmente
 *     nel form prima del save. Il `progressivo_interno` resta auto-default.
 *
 * Verifiche puntuali in entrambi i casi:
 *   1. dialog aperto                         -> NO error-dialog framework
 *   2. data_documento default                = oggi
 *   3. anno default                          = anno corrente
 *   4. progressivo (o progressivo_interno)   = sp_next_progressivo > 0
 *   5. (autoCompose=true) numero auto-composto e readonly span
 *   6. NO dirty badge sui default
 *   7. lookup counterparty mostra label human-readable (assert NON tutti zeri)
 *   8. selezione counterparty -> dirty badge atteso
 *   9. (autoCompose=false) compila manualmente numero_fornitore/numero_pa
 *   10. click Salva                           -> NO error-dialog database
 *   11. dialog chiuso, toast Inserito
 *   12. nuova riga in grid contiene `captured.numero` ESATTO (no fallback)
 *   13. cleanup via api client (regola 26 AGENTS)
 *
 * Cfg shape:
 *   {
 *     route, progField,
 *     autoComposeNumero: bool, hasSerie: bool,
 *     counterpartyField, counterpartySearchTerm, counterpartyOptionRegex,
 *     // Solo se autoComposeNumero=false:
 *     manualNumeroField:  'numero_fornitore' | 'numero_pa' | ...
 *   }
 */
import {
  navigateRoute, clickNewRecord, snap,
  waitForFieldEditor, waitForFieldRuntimeValue, readFieldEditorMeta,
  clickSaveButton, readLookupDisplay
} from './ui-helpers.mjs';

const ANNO_CORR = new Date().getFullYear();

/**
 * Asserisce che NESSUN error-dialog framework sia visibile.
 * Selettore stabile da error-dialog.component.html: `[data-testid="wuic-error-dialog-body"]`.
 */
async function assertNoErrorDialog(page, label, where) {
  const dlg = page.locator('[data-testid="wuic-error-dialog-body"]:visible');
  const count = await dlg.count();
  if (count === 0) return;
  let body = '';
  try { body = (await dlg.first().innerText({ timeout: 1000 })).trim(); } catch { /* */ }
  throw new Error(`[${label}] error-dialog visibile @ ${where}: "${body.slice(0, 400)}"`);
}

async function openInsertDialog(page, baseUrl, route) {
  // Hard reload con cache-bust per resettare lo state Angular SPA tra test.
  // Hash-only navigation (e.g. `/#/`) NON ricarica la pagina, cosi'
  // dialog/toast/timer dei test precedenti possono persistere e degradare
  // i test successivi. Cache-bust query forza fresh fetch + Angular boot.
  const bust = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto(`${baseUrl.replace(/\/$/, '')}/?bust=${bust}#/${route}/list`, {
    waitUntil: 'domcontentloaded'
  });
  await page.waitForSelector(
    'wuic-data-repeater, wuic-list-grid, wuic-edit-form',
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);
  await clickNewRecord(page);
  await page.waitForTimeout(800);
}

async function verifyDefaultsAndReadonly(page, assert, log, cfg) {
  const { progField, autoComposeNumero, label } = cfg;

  await assertNoErrorDialog(page, label, 'post-open Aggiungi');

  await waitForFieldEditor(page, 'data_documento', { timeout: 8000, requireValue: false });
  await waitForFieldEditor(page, 'anno', { timeout: 8000, requireValue: false });
  await waitForFieldEditor(page, progField, { timeout: 8000, requireValue: false });
  await assertNoErrorDialog(page, label, 'post-waitForFieldEditor');

  // 2) data_documento = oggi
  const dataDoc = await waitForFieldRuntimeValue(page, 'data_documento', { timeout: 5000 });
  assert(dataDoc != null && String(dataDoc) !== '', `[${label}] data_documento vuota`);
  const today = new Date().toISOString().slice(0, 10);
  const dataDocStr = String(dataDoc).replace(/^"|"$/g, '');
  const matchesToday =
    dataDocStr.startsWith(today) ||
    dataDocStr.includes(today.split('-').reverse().join('/'));
  assert(matchesToday, `[${label}] data_documento != oggi: "${dataDocStr}" (atteso ${today})`);
  log(`[${label}] data_documento = ${dataDocStr} ✓`);

  // 3) anno
  const anno = await waitForFieldRuntimeValue(page, 'anno', { timeout: 5000 });
  assert(Number(anno) === ANNO_CORR, `[${label}] anno != ${ANNO_CORR}: "${anno}"`);
  log(`[${label}] anno = ${anno} ✓`);

  // 4) progressivo
  const progressivo = await waitForFieldRuntimeValue(page, progField, { timeout: 15000 });
  assert(progressivo != null && String(progressivo) !== '', `[${label}] ${progField} vuoto`);
  const progNum = Number(progressivo);
  assert(Number.isInteger(progNum) && progNum > 0, `[${label}] ${progField} non > 0: "${progressivo}"`);
  log(`[${label}] ${progField} = ${progressivo} (proposto da sp_next_progressivo) ✓`);

  let numero = null;
  if (autoComposeNumero) {
    // 5) numero composto + readonly
    numero = await waitForFieldRuntimeValue(page, 'numero', { timeout: 5000 });
    assert(numero != null && String(numero) !== '', `[${label}] numero non auto-composto`);
    const expected = `${progressivo}/${anno}`;
    const ok = String(numero) === expected || String(numero).endsWith(' ' + expected);
    assert(ok, `[${label}] numero atteso "${expected}", trovato "${numero}"`);
    log(`[${label}] numero = "${numero}" ✓`);

    const numMeta = await readFieldEditorMeta(page, 'numero');
    assert(numMeta?.editable === false, `[${label}] numero NON readonly: editable=${numMeta?.editable}`);
    log(`[${label}] numero readonly ✓`);
  } else {
    log(`[${label}] autoComposeNumero=false: ${cfg.manualNumeroField} sara' compilato manualmente`);
  }

  // 6) NO dirty badge sui default
  await page.waitForTimeout(800);
  const unsavedBadge = await page.locator('.pending-changes-cue.is-dirty:visible').count();
  assert(unsavedBadge === 0, `[${label}] record dirty post default (atteso 0 unsaved changes)`);
  log(`[${label}] no dirty post default ✓`);

  await assertNoErrorDialog(page, label, 'post-defaults');

  return { progressivo: progNum, anno: Number(anno), numero };
}

async function pickCounterpartyAndAssertDirty(page, assert, log, cfg) {
  const { counterpartyField, counterpartySearchTerm, counterpartyOptionRegex, label } = cfg;

  log(`[${label}] type "${counterpartySearchTerm}" su ${counterpartyField}...`);

  const inp = page.locator(
    `wuic-field-editor[data-field-name="${counterpartyField}"] p-autocomplete input`
  ).first();
  await inp.waitFor({ state: 'visible', timeout: 10000 });
  await inp.click();
  await inp.fill('');
  await inp.type(counterpartySearchTerm, { delay: 30 });
  await page.waitForTimeout(800);

  await assertNoErrorDialog(page, label, 'post-counterparty-search');

  const overlayOpts = page.locator(
    '.p-autocomplete-overlay .p-autocomplete-option, .p-autocomplete-list .p-autocomplete-option'
  );
  const optCount = await overlayOpts.count();
  assert(optCount > 0, `[${label}] lookup ${counterpartyField} non ha opzioni per "${counterpartySearchTerm}"`);
  const optTexts = (await overlayOpts.allTextContents()).map(t => t.trim());
  const allZeros = optTexts.every(t => /^0{6,}$/.test(t));
  assert(!allZeros,
    `[${label}] lookup mostra solo zeri (mc_ui_lookup_dataTextField puntato su colonna codice fissa?): ${JSON.stringify(optTexts)}`);
  log(`[${label}] lookup ${counterpartyField} options OK (${optTexts.length} hits, sample="${optTexts[0]}") ✓`);

  const targetOpt = page.locator(
    '.p-autocomplete-overlay .p-autocomplete-option, .p-autocomplete-list .p-autocomplete-option'
  ).filter({ hasText: counterpartyOptionRegex }).first();
  const targetCount = await targetOpt.count();
  assert(targetCount > 0,
    `[${label}] nessuna opzione lookup matcha regex ${counterpartyOptionRegex.source}; opzioni=${JSON.stringify(optTexts)}`);
  const pickedLabel = (await targetOpt.innerText()).trim();
  await targetOpt.click({ force: true });
  await page.waitForTimeout(500);

  const display = await readLookupDisplay(page, counterpartyField);
  assert(display.toLowerCase().includes(pickedLabel.toLowerCase().slice(0, 6)),
    `[${label}] lookup display non riflette selezione: atteso ~"${pickedLabel}", trovato "${display}"`);
  log(`[${label}] selezionato ${counterpartyField} = "${pickedLabel}" ✓`);

  await page.waitForTimeout(400);
  const dirtyAfterEdit = await page.locator('.pending-changes-cue.is-dirty:visible').count();
  assert(dirtyAfterEdit > 0, `[${label}] dirty badge atteso post-selezione lookup, ma assente`);
  log(`[${label}] dirty badge atteso post user-edit ✓`);

  return pickedLabel;
}

/**
 * Compila il campo "numero" manuale (numero_fornitore/numero_pa) per i
 * documenti ricevuti dove il numero principale e' un dato esterno.
 * Genera un valore deterministico `MAN-<progressivo>/<anno>` cosi' la
 * verifica grid post-save puo' cercarlo univocamente.
 * Aggiorna `captured.numero` in place per il check successivo.
 */
async function setManualNumero(page, assert, log, cfg, captured) {
  const { manualNumeroField, label } = cfg;
  assert(typeof manualNumeroField === 'string' && manualNumeroField !== '',
    `[${label}] manualNumeroField richiesto quando autoComposeNumero=false`);

  const value = `MAN-${captured.progressivo}/${captured.anno}`;
  log(`[${label}] type "${value}" su ${manualNumeroField}...`);

  const inp = page.locator(
    `wuic-field-editor[data-field-name="${manualNumeroField}"] input`
  ).first();
  await inp.waitFor({ state: 'visible', timeout: 8000 });
  await inp.click();
  await inp.fill('');
  await inp.type(value, { delay: 20 });
  // commit value via blur (text-editor onChange handler ascolta change/blur)
  await inp.evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await inp.blur();
  await page.waitForTimeout(300);

  // Verifica che il record abbia preso il valore digitato
  const written = await waitForFieldRuntimeValue(page, manualNumeroField, { timeout: 3000 });
  assert(String(written) === value,
    `[${label}] ${manualNumeroField} non riflette valore digitato: atteso "${value}" trovato "${written}"`);

  captured.numero = value;
  log(`[${label}] ${manualNumeroField} = "${value}" ✓`);
}

async function saveAndVerifyGridRow(page, assert, log, cfg, captured, ctx) {
  const { label } = cfg;

  await snap(page, `${cfg.testFilePrefix || cfg.route}-pre-save`);
  log(`[${label}] click Salva...`);
  await clickSaveButton(page);

  // Sync deterministico post-save:
  //   1) Dialog chiuso (parametric-dialog smontato dal DOM)
  //   2) Grid loading overlay scomparso (p-table internal `[loading]` torna
  //      a false quando datasource.loading BS emette false dopo
  //      fetchData() completata; vedi list-grid.component.html:18 e
  //      list-grid.component.ts:3848 `ref.onClose -> fetchData()`).
  // Niente waitForTimeout cieco: il test attende il vero stato pronto.
  await page.locator('wuic-parametric-dialog .parametric-dialog-form')
    .waitFor({ state: 'detached', timeout: 10000 }).catch(() => { /* fallback */ });
  await page.locator('wuic-list-grid .p-datatable-loading-overlay, .p-datatable-loading-overlay')
    .waitFor({ state: 'detached', timeout: 12000 }).catch(() => { /* niente overlay = grid mai loaded oppure gia' done */ });

  // 10) NO error-dialog (regressione audit duplicate column)
  await assertNoErrorDialog(page, label, 'post-save');

  // 11) dialog chiuso
  const stillOpen = await page.locator('wuic-parametric-dialog .parametric-dialog-form:visible').count();
  assert(stillOpen === 0, `[${label}] dialog ancora aperto post-save (atteso chiuso)`);
  log(`[${label}] dialog chiuso post-save ✓`);

  // 11b) Toast Inserito (best-effort, indicativo del successo client-side).
  const toastSeen = await page
    .locator('p-toast .p-toast-message:has-text("Inserito"), p-toast .p-toast-message:has-text("Inserted"), p-toast .p-toast-message:has-text("inserted")')
    .first()
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true).catch(() => false);
  if (toastSeen) log(`[${label}] toast Inserito ✓`);
  else log(`[${label}] toast Inserito non visibile (auto-dismissed) — non blocking`);

  // 12) nuova riga grid contiene il numero ESATTO (auto-composto o manuale).
  //     Nessun fallback rilassato: se manca il valore atteso, fallisce.
  //     Pre-condizione: le 8 route documenti hanno default sort
  //     `data_documento DESC` (vedi scripts/2026-05-08-default-sort-data-documento-desc.sql)
  //     -> il record appena salvato (data_documento=oggi) e' SEMPRE in
  //     cima alla grid in pagina 1, niente paginazione da gestire.
  const expected = captured.numero;
  assert(expected != null && String(expected) !== '',
    `[${label}] captured.numero atteso non vuoto`);

  const rowSelector = `wuic-list-grid tbody tr:has-text("${expected}"), .p-datatable-tbody tr:has-text("${expected}")`;
  await page.locator(rowSelector).first()
    .waitFor({ state: 'visible', timeout: 5000 });
  const found = await page.locator(rowSelector).count();
  assert(found > 0, `[${label}] nuova riga grid con numero "${expected}" non trovata`);
  log(`[${label}] riga grid "${expected}" presente ✓`);

  await snap(page, `${cfg.testFilePrefix || cfg.route}-post-save`);
}

async function cleanupCreatedRecord(api, log, cfg, captured) {
  try {
    const filter = {
      logic: 'AND',
      filters: [
        { field: cfg.progField, operatore: 'eq', value: String(captured.progressivo), __descriptorManaged: true },
        { field: 'anno',        operatore: 'eq', value: String(captured.anno),        __descriptorManaged: true }
      ]
    };
    const rows = await api.crudRead(cfg.route, { filterInfo: filter });
    const arr = rows?.results || rows?.Data || rows?.data || (Array.isArray(rows) ? rows : []);
    if (!arr.length) {
      log(`[${cfg.label}] cleanup: nessun record da cancellare (${cfg.progField}=${captured.progressivo})`);
      return;
    }
    const target = arr[0];
    if (target.id == null) {
      log(`[${cfg.label}] cleanup: record trovato ma manca pkey id; skip`);
      return;
    }
    await api.crudDelete(cfg.route, { id: target.id });
    log(`[${cfg.label}] cleanup: record id=${target.id} cancellato ✓`);
  } catch (e) {
    log(`[${cfg.label}] cleanup failed (non-blocking): ${e?.message || e}`);
  }
}

/**
 * Entry point: esegue il flow insert end-to-end via UI per una singola route.
 */
export async function runDocumentInsertFlow(ctx, cfg) {
  const { page, baseUrl, api, assert, log } = ctx;

  let captured = null;
  try {
    log(`[${cfg.label}] step 1: open Aggiungi ${cfg.route}...`);
    await openInsertDialog(page, baseUrl, cfg.route);

    log(`[${cfg.label}] step 2-7: verify defaults + readonly + no-dirty...`);
    captured = await verifyDefaultsAndReadonly(page, assert, log, cfg);

    log(`[${cfg.label}] step 8-9: lookup ${cfg.counterpartyField} pick + dirty...`);
    await pickCounterpartyAndAssertDirty(page, assert, log, cfg);

    if (!cfg.autoComposeNumero) {
      log(`[${cfg.label}] step 9b: compila manualmente ${cfg.manualNumeroField}...`);
      await setManualNumero(page, assert, log, cfg, captured);
    }

    log(`[${cfg.label}] step 10-12: save + verify grid row...`);
    await saveAndVerifyGridRow(page, assert, log, cfg, captured, ctx);

    log(`[${cfg.label}] insert e2e PASS ✓`);
  } finally {
    if (captured) {
      await cleanupCreatedRecord(api, log, cfg, captured);
    }
  }
}
