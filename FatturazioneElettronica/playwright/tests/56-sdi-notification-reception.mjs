/**
 * Test 56: pipeline ricezione notifiche SDI (applier + bell + idempotency).
 *
 * Verifica end-to-end:
 *   1) Provider symmetry sanity: ISdiNotificationPoller risolve a un poller
 *      reale (PecImap path-free OR uno commerciale OR Null fallback).
 *   2) RC (RicevutaConsegna) → applier match via sdi_id + UPDATE
 *      fatture_inviate.stato_sdi='consegnata' + INSERT _notifications row
 *      per utente_creazione con type='sdi.rc'.
 *   3) NS (NotificaScarto) su una seconda fattura → stato_sdi='scartata'
 *      + bell con payload contenente CodiceErrore + DescrizioneErrore.
 *   4) Idempotency: re-POST della stessa notifica → applier dedup
 *      (skipped_duplicates incrementa, applied=0).
 *   5) Notifica unmatched (IdentificativoSdI bogus) → applied_to_fattura=0,
 *      applied_error popolato, NESSUNA bell row creata (no spam).
 *
 * Pattern: usa l'endpoint admin-only `POST /api/sdi/notifications/apply-raw`
 * che inietta direttamente notifiche RAW nell'applier (bypass poller).
 * Cosi' il test verifica il flow applier → DB → bell senza dover orchestrare
 * un provider commerciale o IMAP server di test.
 *
 * Pre-condizione: utente di test creato via Phase 5 della skill app-creation.
 *   - admin_test  (user_id auto, ricavato via api.me().user_id)
 */
import { queryOne, query } from '../_shared/sql-helpers.mjs';
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';

export const meta = {
  id: '56',
  name: 'Ricezione notifiche SDI (applier + bell + idempotency)',
  area: 'documenti',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { api, assert, log } = ctx;

  // ── 0) Recupera user_id corrente (utente_creazione di tutto cio' che il test crea) ─
  const me = await api.me();
  const myUserId = Number(me?.user_id ?? me?.userId);
  assert(myUserId > 0, `api.me() non ritorna user_id valido: ${JSON.stringify(me)?.slice(0, 200)}`);
  log(`session user_id=${myUserId} (${me?.username ?? me?.userName})`);

  // ── 1) Sanity: il poller risolto da DI esiste ed e' uno dei previsti ─
  // (Aruba/FatturePec/PecIt/Notarify/PecImap/Null). Il poll-now con Mock+Null
  // ritorna 0 items ma senza errori → conferma DI auto-selection wiring.
  const pollSanity = await api.endpoint('/api/sdi/notifications/poll-now', { method: 'POST' });
  assert(pollSanity?.ok === true,
    `poll-now sanity check failed: ${JSON.stringify(pollSanity)?.slice(0, 300)}`);
  log(`poll-now sanity: ok=true parsed=${pollSanity.parsed} errors=${pollSanity.errors}`);

  // Setup tracker di rollback
  const createdClienti = [];
  const createdFatture = [];

  try {
    // ── 2) RC path: cliente + fattura + submit Mock per ottenere sdi_id reale ─
    const cl = newCliente();
    const clRes = await api.crudInsert('clienti', cl);
    const clienteId = Number(clRes?.result ?? clRes?.id);
    assert(clienteId > 0, `cliente insert: ${JSON.stringify(clRes)?.slice(0, 300)}`);
    createdClienti.push(clienteId);

    const fatt = newFatturaInviata(clienteId, { causale: `Fattura E2E test56 RC ${Date.now()}` });
    const fIns = await api.crudInsert('fatture_inviate', fatt);
    const fatturaIdRC = Number(fIns?.result ?? fIns?.id);
    assert(fatturaIdRC > 0, `fattura RC insert`);
    createdFatture.push(fatturaIdRC);

    const iva = await api.crudRead('codici_iva', {
      filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] }
    });
    const um = await api.crudRead('unita_misura', {
      filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] }
    });
    const ivaId = (iva?.results ?? iva?.data)?.[0]?.id;
    const umId  = (um?.results ?? um?.data)?.[0]?.id;
    await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaIdRC, ivaId, umId));

    // Verifica utente_creazione popolato dal framework con la sessione corrente
    const ownerCheck = await queryOne(
      `SELECT utente_creazione, progressivo FROM dbo.fatture_inviate WHERE id = ${fatturaIdRC}`);
    assert(Number(ownerCheck?.utente_creazione) === myUserId,
      `utente_creazione atteso ${myUserId}, visto ${ownerCheck?.utente_creazione}`);
    log(`fattura RC id=${fatturaIdRC} utente_creazione=${ownerCheck.utente_creazione} progressivo=${ownerCheck.progressivo} ✓`);

    const sub = await api.endpoint('/api/sdi/submit', {
      method: 'POST',
      body: { FatturaId: fatturaIdRC }
    });
    assert(sub.ok === true, `submit RC: ${JSON.stringify(sub)?.slice(0, 300)}`);
    const sdiIdRC = sub.sdi_id;
    log(`submit RC: sdi_id=${sdiIdRC} provider=${sub.provider}`);

    // Snapshot _notifications PRE-apply per il delta check
    const bellBefore = await queryOne(
      `SELECT COUNT(*) AS n FROM dbo._notifications WHERE user_id = ${myUserId} AND type LIKE 'sdi.%'`,
      'FatturazioneElettronica_Metadata');
    const bellCountBefore = Number(bellBefore?.n ?? 0);

    // ── 3) Inietta RC notification XML via apply-raw ────────────────────
    const rcFileName = `IT01234567890_RC_${String(ownerCheck.progressivo).padStart(5, '0')}.xml`;
    const rcXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<RicevutaConsegna xmlns="http://www.fatturapa.gov.it/sdi/messaggi/v1.0" versione="1.0">` +
      `<IdentificativoSdI>${sdiIdRC}</IdentificativoSdI>` +
      `<NomeFile>${rcFileName.replace('_RC_', '_')}.p7m</NomeFile>` +
      `<DataOraRicezione>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraRicezione>` +
      `<DataOraConsegna>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraConsegna>` +
      `<MessageId>e2e-test56-rc-${Date.now()}</MessageId>` +
      `</RicevutaConsegna>`;

    // Stesso PecMessageId per le due call (re-scan della stessa PEC).
    // Il dedup applier matcha su (notification_type + ricevuta_pec_id + nome_file):
    // se cambiamo PecMessageId fra le due call, il dedup non scatta.
    const rcPecMessageId = `e2e-test56-rc-pecid-${Date.now()}`;
    const applyRC = await api.endpoint('/api/sdi/notifications/apply-raw', {
      method: 'POST',
      body: {
        Items: [{
          Xml: rcXml,
          FileName: rcFileName,
          PecMessageId: rcPecMessageId,
          ProviderSource: 'Test'
        }]
      }
    });
    assert(applyRC?.ok === true, `apply-raw RC: ${JSON.stringify(applyRC)?.slice(0, 300)}`);
    assert(applyRC.parsed === 1, `parsed atteso 1, visto ${applyRC.parsed}`);
    assert(applyRC.persisted === 1, `persisted atteso 1, visto ${applyRC.persisted}`);
    assert(applyRC.applied === 1, `applied atteso 1, visto ${applyRC.applied} (applier non ha matchato la fattura?)`);
    assert(applyRC.skipped_duplicates === 0, `skipped atteso 0, visto ${applyRC.skipped_duplicates}`);
    assert(applyRC.errors === 0, `errors atteso 0, visto ${applyRC.errors}`);
    log(`apply-raw RC: parsed=${applyRC.parsed} applied=${applyRC.applied} ✓`);

    // ── 4) DB sanity post-RC ─────────────────────────────────────────────
    const fattAfterRC = await queryOne(
      `SELECT stato_sdi, sdi_messaggio FROM dbo.fatture_inviate WHERE id = ${fatturaIdRC}`);
    assert(/^(consegnata|ricevuta)$/i.test(fattAfterRC.stato_sdi),
      `stato_sdi atteso 'consegnata'|'ricevuta', visto '${fattAfterRC.stato_sdi}'`);
    log(`fattura RC dopo apply: stato_sdi=${fattAfterRC.stato_sdi} ✓`);

    const auditRC = await queryOne(`
      SELECT TOP 1 notification_type, applied_to_fattura, fattura_id,
                   ISNULL(applied_error, '') AS applied_error
      FROM dbo.sdi_notifications
      WHERE notification_type = 'RC' AND fattura_id = ${fatturaIdRC}
      ORDER BY id DESC`);
    assert(auditRC?.notification_type === 'RC', `audit RC mancante`);
    assert(Number(auditRC.applied_to_fattura) === 1,
      `applied_to_fattura atteso 1, visto ${auditRC.applied_to_fattura}`);
    log(`audit sdi_notifications RC: applied=${auditRC.applied_to_fattura} fattura_id=${auditRC.fattura_id} ✓`);

    // ── 5) Bell: nuova riga _notifications per myUserId con type='sdi.rc' ─
    // Sleep breve per dare tempo al push framework (best-effort, gia' sync)
    const bellAfter = await queryOne(
      `SELECT COUNT(*) AS n FROM dbo._notifications WHERE user_id = ${myUserId} AND type LIKE 'sdi.%'`,
      'FatturazioneElettronica_Metadata');
    const delta = Number(bellAfter?.n ?? 0) - bellCountBefore;
    assert(delta >= 1, `_notifications row attesa per RC, delta=${delta}`);

    const bellRowRC = await queryOne(`
      SELECT TOP 1 type, message, target_json, payload_json, source, is_read
      FROM dbo._notifications
      WHERE user_id = ${myUserId} AND type = 'sdi.rc'
      ORDER BY id DESC`, 'FatturazioneElettronica_Metadata');
    assert(bellRowRC, `_notifications row sdi.rc non trovata`);
    assert(/Fattura consegnata/i.test(bellRowRC.message),
      `message RC atteso 'Fattura consegnata — ...', visto: '${bellRowRC.message}'`);
    assert(bellRowRC.target_json?.includes(`/fatture_inviate/edit/${fatturaIdRC}`),
      `target_json deep-link mancante: '${bellRowRC.target_json?.slice(0, 200)}'`);
    assert(bellRowRC.payload_json?.includes(`"fatturaId":${fatturaIdRC}`),
      `payload_json fatturaId mancante: '${bellRowRC.payload_json?.slice(0, 200)}'`);
    assert(bellRowRC.source === 'SdiNotificationApplier',
      `source atteso 'SdiNotificationApplier', visto '${bellRowRC.source}'`);
    assert(Number(bellRowRC.is_read) === 0, `bell row appena creata dovrebbe avere is_read=0`);
    log(`bell sdi.rc: message="${bellRowRC.message?.slice(0, 60)}" target=${bellRowRC.target_json?.slice(0, 60)} ✓`);

    // ── 6) Idempotency: re-POST stessa notifica RC con STESSO PecMessageId ─
    // Simulazione real-world: il poller IMAP ri-scarica la stessa email PEC
    // (stesso Message-ID), il dedup applier scatta su
    // (notification_type + ricevuta_pec_id + nome_file).
    const applyRCBis = await api.endpoint('/api/sdi/notifications/apply-raw', {
      method: 'POST',
      body: {
        Items: [{
          Xml: rcXml,
          FileName: rcFileName,
          PecMessageId: rcPecMessageId,  // STESSO message id → dedup scatta
          ProviderSource: 'Test'
        }]
      }
    });
    assert(applyRCBis?.ok === true, `apply-raw RC bis ok`);
    assert(applyRCBis.skipped_duplicates >= 1,
      `idempotency: skipped_duplicates atteso >=1, visto ${applyRCBis.skipped_duplicates}`);
    assert(applyRCBis.applied === 0,
      `applied atteso 0 dopo dedup, visto ${applyRCBis.applied}`);
    log(`idempotency: skipped_duplicates=${applyRCBis.skipped_duplicates} applied=${applyRCBis.applied} ✓`);

    // ── 7) NS path: nuova fattura → submit → notifica scarto ───────────
    const fatt2 = newFatturaInviata(clienteId, { causale: `Fattura E2E test56 NS ${Date.now()}` });
    const f2Ins = await api.crudInsert('fatture_inviate', fatt2);
    const fatturaIdNS = Number(f2Ins?.result ?? f2Ins?.id);
    assert(fatturaIdNS > 0, `fattura NS insert`);
    createdFatture.push(fatturaIdNS);
    await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaIdNS, ivaId, umId));

    const sub2 = await api.endpoint('/api/sdi/submit', {
      method: 'POST',
      body: { FatturaId: fatturaIdNS }
    });
    assert(sub2.ok === true, `submit NS ok`);
    const sdiIdNS = sub2.sdi_id;

    const fatt2Info = await queryOne(
      `SELECT progressivo FROM dbo.fatture_inviate WHERE id = ${fatturaIdNS}`);
    const nsFileName = `IT01234567890_NS_${String(fatt2Info.progressivo).padStart(5, '0')}.xml`;
    const nsXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<NotificaScarto xmlns="http://www.fatturapa.gov.it/sdi/messaggi/v1.0" versione="1.0">` +
      `<IdentificativoSdI>${sdiIdNS}</IdentificativoSdI>` +
      `<NomeFile>${nsFileName.replace('_NS_', '_')}.p7m</NomeFile>` +
      `<DataOraRicezione>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraRicezione>` +
      `<ListaErrori>` +
      `<Errore><Codice>00200</Codice><Descrizione>File non conforme al formato</Descrizione></Errore>` +
      `</ListaErrori>` +
      `<MessageId>e2e-test56-ns-${Date.now()}</MessageId>` +
      `</NotificaScarto>`;

    const applyNS = await api.endpoint('/api/sdi/notifications/apply-raw', {
      method: 'POST',
      body: {
        Items: [{
          Xml: nsXml,
          FileName: nsFileName,
          PecMessageId: `e2e-test56-ns-pecid-${Date.now()}`,
          ProviderSource: 'Test'
        }]
      }
    });
    assert(applyNS?.ok === true && applyNS.applied === 1,
      `apply-raw NS: ${JSON.stringify(applyNS)?.slice(0, 300)}`);

    const fattAfterNS = await queryOne(
      `SELECT stato_sdi, sdi_messaggio FROM dbo.fatture_inviate WHERE id = ${fatturaIdNS}`);
    assert(/^scartata$/i.test(fattAfterNS.stato_sdi),
      `stato_sdi atteso 'scartata', visto '${fattAfterNS.stato_sdi}'`);
    log(`fattura NS dopo apply: stato_sdi=${fattAfterNS.stato_sdi} ✓`);

    const bellRowNS = await queryOne(`
      SELECT TOP 1 type, message, payload_json
      FROM dbo._notifications
      WHERE user_id = ${myUserId} AND type = 'sdi.ns'
      ORDER BY id DESC`, 'FatturazioneElettronica_Metadata');
    assert(bellRowNS, `bell row sdi.ns non trovata`);
    assert(/Fattura scartata/i.test(bellRowNS.message),
      `message NS atteso 'Fattura scartata da SDI — ...', visto: '${bellRowNS.message}'`);
    assert(bellRowNS.payload_json?.includes('"notificationType":"NS"'),
      `payload_json NS mancante notificationType: '${bellRowNS.payload_json?.slice(0, 200)}'`);
    log(`bell sdi.ns: message="${bellRowNS.message?.slice(0, 60)}" ✓`);

    // ── 8) Unmatched notification: IdentificativoSdI bogus ──────────────
    const unmatchedXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<RicevutaConsegna xmlns="http://www.fatturapa.gov.it/sdi/messaggi/v1.0" versione="1.0">` +
      `<IdentificativoSdI>BOGUS-9999999999</IdentificativoSdI>` +
      `<NomeFile>IT99999999999_99999.xml.p7m</NomeFile>` +
      `<DataOraRicezione>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraRicezione>` +
      `<MessageId>e2e-test56-orphan-${Date.now()}</MessageId>` +
      `</RicevutaConsegna>`;

    const bellOrphanBefore = await queryOne(
      `SELECT COUNT(*) AS n FROM dbo._notifications WHERE user_id = ${myUserId} AND type LIKE 'sdi.%'`,
      'FatturazioneElettronica_Metadata');

    const applyOrphan = await api.endpoint('/api/sdi/notifications/apply-raw', {
      method: 'POST',
      body: {
        Items: [{
          Xml: unmatchedXml,
          FileName: `IT99999999999_RC_99999.xml`,
          PecMessageId: `e2e-test56-orphan-pecid-${Date.now()}`,
          ProviderSource: 'Test'
        }]
      }
    });
    assert(applyOrphan?.ok === true, `apply-raw orphan ok`);
    assert(applyOrphan.parsed === 1, `parsed atteso 1`);
    assert(applyOrphan.persisted === 1, `persisted atteso 1 (audit anche se unmatched)`);
    assert(applyOrphan.applied === 0,
      `applied atteso 0 (no fattura match), visto ${applyOrphan.applied}`);
    log(`orphan: parsed=1 persisted=1 applied=0 ✓`);

    const orphanAudit = await queryOne(`
      SELECT TOP 1 applied_to_fattura, ISNULL(applied_error, '') AS applied_error
      FROM dbo.sdi_notifications
      WHERE sdi_identificativo = 'BOGUS-9999999999'
      ORDER BY id DESC`);
    assert(Number(orphanAudit?.applied_to_fattura) === 0,
      `orphan: applied_to_fattura deve essere 0`);
    assert(/non trovata/i.test(orphanAudit.applied_error || ''),
      `orphan applied_error atteso 'Fattura non trovata...', visto '${orphanAudit.applied_error}'`);
    log(`orphan audit: applied_error="${orphanAudit.applied_error}" ✓`);

    const bellOrphanAfter = await queryOne(
      `SELECT COUNT(*) AS n FROM dbo._notifications WHERE user_id = ${myUserId} AND type LIKE 'sdi.%'`,
      'FatturazioneElettronica_Metadata');
    assert(Number(bellOrphanAfter.n) === Number(bellOrphanBefore.n),
      `bell NON deve avere nuove righe per orphan (no spam admin): ` +
      `before=${bellOrphanBefore.n}, after=${bellOrphanAfter.n}`);
    log(`orphan: nessuna bell row creata (no spam) ✓`);

    return {
      fatturaIdRC,
      fatturaIdNS,
      sdiIdRC,
      sdiIdNS,
      bellRowsCreated: Number(bellAfter.n) - bellCountBefore + 1
    };
  } finally {
    // Cleanup in ordine inverso (fatture prima dei clienti per FK)
    for (const fid of createdFatture.reverse()) {
      try { await api.crudDelete('fatture_inviate', { id: fid }); } catch { /* */ }
    }
    for (const cid of createdClienti.reverse()) {
      try { await api.crudDelete('clienti', { id: cid }); } catch { /* */ }
    }
    // Cleanup sdi_notifications + _notifications residui del test
    try {
      await query(`
        SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
        DELETE FROM dbo.sdi_notifications
        WHERE provider_source = 'Test' AND ricevuta_pec_id LIKE 'e2e-test56-%';
        DELETE FROM dbo.sdi_notifications
        WHERE sdi_identificativo = 'BOGUS-9999999999';
      `);
    } catch { /* */ }
    try {
      await query(`
        SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
        DELETE FROM dbo._notifications
        WHERE user_id = ${myUserId} AND source = 'SdiNotificationApplier'
          AND created_at >= DATEADD(minute, -10, SYSUTCDATETIME());
      `, 'FatturazioneElettronica_Metadata');
    } catch { /* */ }
  }
}

export async function cleanup() {
  // Opzionale: il try/finally del run gia' fa cleanup. Qui solo guard idempotente
  // se il run e' interrotto a meta'.
  try {
    await query(`
      SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
      DELETE FROM dbo.sdi_notifications
      WHERE provider_source = 'Test' AND ricevuta_pec_id LIKE 'e2e-test56-%';
      DELETE FROM dbo.sdi_notifications
      WHERE sdi_identificativo = 'BOGUS-9999999999';
    `);
  } catch { /* */ }
}
