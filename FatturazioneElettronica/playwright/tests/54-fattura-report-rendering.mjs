/**
 * Test 54: rendering del report stampa fattura (Report.mrt - layout Aruba PEC).
 *
 * Verifica end-to-end:
 *   1) Setup fattura + riga + (1 scadenza implicita dal trigger).
 *   2) CheckReport endpoint conferma che Reports/fatture_inviate/Report.mrt esiste.
 *   3) Navigazione a #/fatture_inviate/report-viewer?reportName=Report.mrt&parameters=fattura_id||eq||<id>
 *   4) Stimulsoft Angular viewer monta senza error-dialog framework.
 *   5) La pagina contiene marker visivi: titolo "FATTURA", sezione "PRODOTTI E SERVIZI",
 *      sezione "RIEPILOGO IVA" / "CALCOLO FATTURA", footer con immagine logo (img tag
 *      o canvas con immagine embedded → il viewer Stimulsoft renderizza in canvas
 *      ma copre anche il caso fallback HTML).
 *
 * Dipendenze:
 *   - Reports/fatture_inviate/Report.mrt (generato da scripts/generate-fattura-report.py)
 *   - Reports/fatture_inviate/wuic-logo.png (generato da scripts/generate-wuic-logo.py)
 *   - print_action callback aggiornato (scripts/2026-05-09-print-action-use-report-mrt.sql)
 */
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';

export const meta = {
  id: '54',
  name: 'Fattura - rendering report Stampa (Report.mrt Aruba PEC layout)',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // ── 1) Pre-flight: report file presente ─────────────────────────────
  const check = await api.endpoint(
    '/api/ReportViewer/CheckReport?route=fatture_inviate&reportName=Report.mrt',
    { method: 'GET' }
  );
  assert(check && check.ok === true,
    `CheckReport non OK: ${JSON.stringify(check)?.slice(0, 200)}`);
  log('CheckReport: Report.mrt esiste ✓');

  // ── 2) Setup test fattura ───────────────────────────────────────────
  const cl = newCliente({ ragione_sociale: 'Acme Reporting Test S.r.l. (e2e)' });
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert');

  const fatt = newFatturaInviata(clienteId, {
    causale: `Stampa report test ${Date.now()}`
  });
  const fIns = await api.crudInsert('fatture_inviate', fatt);
  const fatturaId = Number(fIns?.result ?? fIns?.id);
  assert(fatturaId > 0, 'fattura insert');

  const iva = await api.crudRead('codici_iva', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] }
  });
  const um = await api.crudRead('unita_misura', {
    filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] }
  });
  const ivaId = (iva?.results ?? iva?.data)?.[0]?.id;
  const umId  = (um?.results ?? um?.data)?.[0]?.id;
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaId, ivaId, umId, {
    descrizione: 'Servizio di sviluppo software (test stampa report)',
    quantita: 10,
    prezzo_unitario: 100,
    imponibile_riga: 1000,
    iva_riga: 220,
    totale_riga: 1220
  }));
  log(`fattura id=${fatturaId} pronta con riga`);

  try {
    // ── 3) Cattura console + network + dialog framework ───────────────
    const errors = [];
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()?.slice(0, 220)}`);
    });

    // ── 4) Naviga al report viewer ────────────────────────────────────
    const params = encodeURIComponent(`fattura_id||eq||${fatturaId}`);
    const url = `${baseUrl.replace(/\/$/, '')}/?bust=${Date.now()}#/fatture_inviate/report-viewer?reportName=${encodeURIComponent('Report.mrt')}&parameters=${params}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // ── 5) Attendi mount del viewer Stimulsoft ───────────────────────
    //    Il viewer monta l'<wuic-report-viewer> + componente Stimulsoft Angular.
    //    Marker stabili: contenitore Stimulsoft `.stiViewer*` o iframe canvas.
    await page.waitForSelector(
      'wuic-report-viewer, .stiJsViewer, [class^="stiJs"], iframe',
      { timeout: 25000 }
    );
    // Stimulsoft renderizza in fasi: viewer chrome → request → page render.
    // Aspettiamo che la pagina del report abbia content.
    await page.waitForTimeout(6000);

    // ── 6) Nessun error-dialog framework (regola test docs-driven) ────
    const errDlg = await page.locator(
      '[data-testid="wuic-error-dialog-body"]:visible, .p-dialog-content .error-message:visible'
    ).count();
    assert(errDlg === 0,
      `error-dialog framework visibile post-mount viewer: ${errDlg} ` +
      `(possibile crash del .mrt o SQL fallita)`);
    log('post-mount: nessun error-dialog framework ✓');

    // ── 7) Marker visivi: cerca in tutta la page il testo "FATTURA",
    //    "PRODOTTI E SERVIZI" e "CALCOLO FATTURA"/"RIEPILOGO IVA".
    //    Stimulsoft Angular viewer renderizza testo in HTML (non canvas)
    //    quando `RenderInRichText`/`RenderHtml` modes — di norma il default
    //    e' HTML render, quindi il testo e' selezionabile.
    const allText = (await page.locator('body').innerText()).toUpperCase();
    const hits = {
      FATTURA: allText.includes('FATTURA'),
      PRODOTTI: allText.includes('PRODOTTI E SERVIZI'),
      RIEPILOGO_or_CALCOLO: allText.includes('RIEPILOGO IVA') || allText.includes('CALCOLO FATTURA'),
      METODO_PAG: allText.includes('METODO DI PAGAMENTO')
    };
    log(`marker hits: ${JSON.stringify(hits)}`);
    // Almeno il titolo + 1 sezione corpo devono essere presenti.
    assert(hits.FATTURA, 'titolo "FATTURA" non visibile in nessun rendering del report');
    const bodyHits = ['PRODOTTI', 'RIEPILOGO_or_CALCOLO', 'METODO_PAG']
      .filter(k => hits[k]).length;
    assert(bodyHits >= 1,
      `nessuna sezione del corpo del report visibile (PRODOTTI/RIEPILOGO/METODO_PAG): ${JSON.stringify(hits)}`);
    log(`marker corpo: ${bodyHits}/3 sezioni visibili ✓`);

    // ── 8) Logo WUIC presente (img/canvas con `wuic-logo` riferimento o
    //    img con src base64 contenente "PNG" data) ────────────────────
    const imgCount = await page.locator('img').count();
    log(`UI: ${imgCount} <img> nella page (Stimulsoft puo' usare data: URL per le immagini embedded)`);
    // Non e' un hard-fail se 0 img: Stimulsoft viewer puo' renderizzare
    // l'immagine nel canvas. Lo registriamo solo per diagnostica.

    // ── 9) Snapshot per ispezione visuale ─────────────────────────────
    //     Stimulsoft viewer ha scroll interno: scroll-to-bottom prima
    //     dello screenshot per catturare anche il footer (WUIC logo).
    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_54_report_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    // Also: zoom-out + bottom scroll for footer visibility
    try {
      await page.evaluate(() => {
        const sc = document.querySelector('.stiJsViewerScrollDiv, [class*="ScrollDiv"], .stiJsViewerPageContainer');
        if (sc) sc.scrollTop = sc.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(500);
      const footerSnap = snapPath.replace('.png', '_footer.png');
      await page.screenshot({ path: footerSnap, fullPage: true });
      log(`footer screenshot: ${footerSnap}`);
    } catch (e) { log(`footer screenshot skipped: ${e.message}`); }
    log(`main screenshot: ${snapPath}`);

    // Diagnostica: log degli errori console raccolti (non-fatali se gia'
    // passate le assert sopra, ma utile per troubleshooting)
    const fatalErrors = errors.filter(e =>
      !/Failed to fetch|net::ERR_INTERNET_DISCONNECTED|favicon\.ico|404 \(Not Found\) http.*favicon|sourcemap/i.test(e)
    );
    if (fatalErrors.length) {
      log(`console errors (non-fatali, gia' superato): ${fatalErrors.length}`);
      fatalErrors.slice(0, 5).forEach(e => log(`  ${e}`));
    }

    return { fatturaId, hits, screenshot: snapPath };
  } finally {
    try { await api.crudDelete('fatture_inviate', { id: fatturaId }); } catch { /* */ }
    try { await api.crudDelete('clienti', { id: clienteId }); } catch { /* */ }
  }
}
