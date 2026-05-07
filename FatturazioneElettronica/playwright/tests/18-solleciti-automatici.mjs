/**
 * Test 18: Workflow #11 — Solleciti automatici scadenze SCADUTA.
 *
 * 1) Setup: cliente con email + fattura + scadenze (1 SCADUTA, 1 APERTA-overdue, 1 APERTA-future)
 * 2) Chiama API /api/conversioni/genera-solleciti
 * 3) Verifica DB: 2 record email_log PENDING (per le 2 scadute), 1 SCADUTA non genera doppio
 * 4) Idempotency: re-call subito → 0 nuovi solleciti (skip giorni_min)
 * 5) UI: navigate email_log/list → verifica 2 record PENDING visibili con subject corretto
 */
import { newCliente } from '../_shared/test-data.mjs';
import { queryOne, query, exec } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '18',
  name: 'Solleciti automatici scadenze SCADUTA (SP + UI verify)',
  area: 'workflow',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { api, backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // Cleanup pre-test
  await exec(`DELETE FROM dbo.email_log WHERE subject LIKE 'Sollecito pagamento scadenza%'`);

  // Setup
  const cl = newCliente({ email: 'sollecito-test@example.com', ragione_sociale: 'Cliente Sollecito Test' });
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert fail');

  // Crea fattura emessa
  const fRes = await api.crudInsert('fatture_inviate', {
    data_documento: '2026-04-01', cliente_id: clienteId,
    causale: `Sollecito test ${Date.now()}`, stato: 'EMESSA',
    imponibile: 1000, iva: 220, totale: 1220
  });
  const fatturaId = Number(fRes?.result ?? fRes?.id);
  assert(fatturaId > 0, 'fattura insert fail');

  // Crea 3 scadenze:
  //  - SCADUTA (data passata, stato gia' SCADUTA)
  //  - APERTA con data passata (overdue, sara' marcata SCADUTA dalla SP)
  //  - APERTA futura (NON deve generare sollecito)
  const ymd = (offsetDays) => {
    const d = new Date(); d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  await exec(`INSERT INTO dbo.scadenze (tipo, fattura_inviata_id, cliente_id, data_scadenza, importo, importo_pagato, stato, rata_n, rata_totale, cancellato, data_creazione)
              VALUES
                ('INCASSO', ${fatturaId}, ${clienteId}, '${ymd(-30)}', 400, 0, 'SCADUTA', 1, 3, 0, GETDATE()),
                ('INCASSO', ${fatturaId}, ${clienteId}, '${ymd(-5)}',  400, 0, 'APERTA',  2, 3, 0, GETDATE()),
                ('INCASSO', ${fatturaId}, ${clienteId}, '${ymd(30)}',  420, 0, 'APERTA',  3, 3, 0, GETDATE())`);
  log(`setup: cliente=${clienteId} fattura=${fatturaId} 3 scadenze (SCADUTA, APERTA-overdue, APERTA-future)`);

  // === Test A: chiama genera-solleciti ===
  const r1 = await fetch(`${apiBase}/api/conversioni/genera-solleciti`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  const j1 = await r1.json();
  assert(j1.ok === true, `genera-solleciti fail: ${JSON.stringify(j1)?.slice(0, 300)}`);
  // SP e' globale (cattura tutte le scadute del DB); verifico quanti per QUESTA fattura
  const generatedFatturaA = await queryOne(`SELECT COUNT(*) AS n FROM dbo.email_log WHERE fattura_id=${fatturaId} AND subject LIKE 'Sollecito pagamento scadenza%'`);
  assert(Number(generatedFatturaA.n) === 2,
    `attesi 2 solleciti per fattura ${fatturaId} (SCADUTA + APERTA-overdue), trovati ${generatedFatturaA.n} (totale globale: ${j1.generated})`);
  log(`Test A ok: 2 solleciti per fattura ${fatturaId} (totale globale: ${j1.generated})`);

  // Verifica DB: 2 email_log PENDING
  const emails = await query(`
    SELECT id, fattura_id, recipient_to, subject, status
    FROM dbo.email_log
    WHERE subject LIKE 'Sollecito pagamento scadenza%' AND fattura_id = ${fatturaId}
    ORDER BY id`);
  assert(emails.length === 2, `attese 2 email_log PENDING, viste ${emails.length}`);
  assert(emails.every(e => e.status === 'PENDING'), 'tutte le email_log devono avere status PENDING');
  assert(emails.every(e => e.recipient_to === 'sollecito-test@example.com'),
    `recipient_to non propagato: ${emails.map(e => e.recipient_to).join(', ')}`);
  log(`Test A DB ok: 2 email_log PENDING per cliente sollecito-test@example.com`);

  // Verifica APERTA-overdue → SCADUTA
  const stati = await query(`SELECT stato FROM dbo.scadenze WHERE fattura_inviata_id=${fatturaId} ORDER BY rata_n`);
  assert(stati[0].stato === 'SCADUTA', `rata 1 stato=${stati[0].stato} atteso SCADUTA`);
  assert(stati[1].stato === 'SCADUTA', `rata 2 stato=${stati[1].stato} (era APERTA overdue, atteso SCADUTA dopo SP)`);
  assert(stati[2].stato === 'APERTA',  `rata 3 stato=${stati[2].stato} (futura, deve restare APERTA)`);
  log(`Test A scadenze: rata 1 SCADUTA, rata 2 → SCADUTA, rata 3 APERTA (corretto)`);

  // === Test B: idempotenza re-call ===
  const beforeCount = (await queryOne(`SELECT COUNT(*) AS n FROM dbo.email_log WHERE fattura_id=${fatturaId} AND subject LIKE 'Sollecito%'`)).n;
  const r2 = await fetch(`${apiBase}/api/conversioni/genera-solleciti`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  const j2 = await r2.json();
  assert(j2.ok === true, `re-call fallita: ${JSON.stringify(j2)}`);
  const afterCount = (await queryOne(`SELECT COUNT(*) AS n FROM dbo.email_log WHERE fattura_id=${fatturaId} AND subject LIKE 'Sollecito%'`)).n;
  assert(Number(afterCount) === Number(beforeCount),
    `idempotenza fail per fattura ${fatturaId}: prima ${beforeCount}, dopo ${afterCount}`);
  log(`Test B idempotenza: ${beforeCount} solleciti per fattura ${fatturaId} restano invariati dopo re-call`);

  // === Test C: click UI vero su table action "Genera solleciti" sulla list scadenze ===
  if (ctx.page) {
    const { page, baseUrl } = ctx;

    // Reset email_log per fattura corrente per testare il click UI ex-novo
    await exec(`DELETE FROM dbo.email_log WHERE fattura_id = ${fatturaId}`);
    // Anche reset stato scadenze APERTA per generare nuovi solleciti
    await exec(`UPDATE dbo.scadenze SET stato = 'SCADUTA' WHERE fattura_inviata_id = ${fatturaId} AND data_scadenza < CAST(GETDATE() AS DATE)`);

    // Naviga a scadenze/list filtrato per fattura corrente
    const filterInfoParam = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'fattura_inviata_id', operator: 'eq', value: fatturaId }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/scadenze/list?filterInfo=${filterInfoParam}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1200);

    // Click sul button "actions" della toolbar list-grid (NON metadata sidebar).
    // Scope: SOLO header toolbar della list-grid (NOT metadata-editor sidebar).
    const actionsBtn = page.locator(
      'wuic-list-grid .p-toolbar p-button:has-text("actions"), ' +
      'wuic-list-grid .list-grid-toolbar button:has-text("actions"), ' +
      'wuic-list-grid > div p-button:has-text("actions")'
    ).first();
    await actionsBtn.waitFor({ state: 'visible', timeout: 10000 });
    await actionsBtn.click({ force: true });
    await page.waitForTimeout(800);

    // Trova item "Genera solleciti" nel popup PrimeNG (scope: overlay panel)
    // NON cliccare il "Genera solleciti" del Metadata sidebar (che ha il marker X)
    const sollecitiItem = page.locator(
      '.p-menu-overlay :text-is("Genera solleciti"), ' +
      '.p-overlaypanel-content :text-is("Genera solleciti"), ' +
      'body > .cdk-overlay-container :text-is("Genera solleciti"), ' +
      '.p-menuitem-link:has-text("Genera solleciti"):visible'
    ).first();
    await sollecitiItem.waitFor({ state: 'visible', timeout: 8000 });
    log(`  UI: actions toolbar menu aperto, item "Genera solleciti" visibile`);
    await sollecitiItem.click({ force: true });
    await page.waitForTimeout(2500);

    // Verifica DB: 2 nuovi solleciti generati via UI click
    const emailsUI = await query(`SELECT COUNT(*) AS n FROM dbo.email_log WHERE fattura_id = ${fatturaId} AND status='PENDING' AND subject LIKE 'Sollecito%'`);
    assert(Number(emailsUI[0].n) === 2,
      `UI click "Genera solleciti": attese 2 email_log PENDING, viste ${emailsUI[0].n}`);
    log(`  Test C UI click ok: ${emailsUI[0].n} solleciti generati via table action button`);

    // Naviga a email_log/list per verifica visiva finale
    const emailFilter = encodeURIComponent(JSON.stringify({
      filters: [{ field: 'fattura_id', operator: 'eq', value: fatturaId }]
    }));
    await page.goto(`${baseUrl.replace(/\/$/, '')}/#/email_log/list?filterInfo=${emailFilter}&bust=${Date.now()}`,
                    { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const rows = await page.locator('wuic-list-grid tbody tr, .p-datatable-tbody tr').count();
    assert(rows === 2, `UI email_log: attese 2 righe, viste ${rows}`);
    const txt = await page.locator('body').innerText();
    assert(txt.includes('PENDING'), `UI email_log: PENDING non visibile`);

    const snapPath = `C:\\src\\Wuic\\FatturazioneElettronica\\playwright\\screenshots\\PASS_18_solleciti_${Date.now()}.png`;
    await page.screenshot({ path: snapPath, fullPage: true });
    log(`  screenshot: ${snapPath}`);
  }

  // Cleanup
  try {
    await exec(`DELETE FROM dbo.email_log WHERE fattura_id = ${fatturaId}`);
    await exec(`DELETE FROM dbo.scadenze WHERE fattura_inviata_id = ${fatturaId}`);
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await api.crudDelete('clienti', { id: clienteId });
  } catch (e) { log(`cleanup warn: ${e.message?.slice(0, 100)}`); }

  return { fatturaId, clienteId, generated: j1.generated };
}
