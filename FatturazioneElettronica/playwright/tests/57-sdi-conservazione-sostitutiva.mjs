/**
 * Test 57: pipeline conservazione sostitutiva post-notifica SDI (10 anni AgID).
 *
 * Verifica end-to-end:
 *   1) Setup: cliente + fattura + submit Mock + apply RC notification
 *      (precondizione tipica: si conserva DOPO ricezione notifica positiva).
 *   2) POST /api/sdi/conservation/seal/{fatturaId}:
 *      - provider auto-selected (Filesystem default in dev)
 *      - calcola SHA-256 del file .xml.p7m
 *      - opzionalmente ottiene timestamp RFC 3161 (no-op in dev senza TSA URL)
 *      - INSERT in dbo.conservazione_index
 *      - retention_until = +10 anni AgID
 *      - metadata_json estratto (numero/anno/totale/cliente)
 *   3) GET /api/sdi/conservation/verify/{conservationIndexId}:
 *      - re-hash del file
 *      - sha256_actual == sha256_expected
 *      - last_verified_at + last_verified_ok aggiornati su conservazione_index
 *   4) DB sanity: conservazione_index riga creata con tutti i campi corretti
 *      (provider, sealed_by_user_id, retention_until 10y, sha256 hex 64-char)
 *   5) Verifica idempotency assertiva: il sigillo NON deve generare bell
 *      (operazione amministrativa, non workflow user-facing).
 */
import { queryOne } from '../_shared/sql-helpers.mjs';
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';

export const meta = {
  id: '57',
  name: 'Conservazione sostitutiva post-notifica SDI (Filesystem provider, 10y AgID)',
  area: 'documenti',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { api, assert, log } = ctx;

  const me = await api.me();
  const myUserId = Number(me?.user_id ?? me?.userId);
  assert(myUserId > 0, 'session user_id valido');
  log(`session user_id=${myUserId}`);

  const createdClienti = [];
  const createdFatture = [];
  let conservationIndexId = null;

  try {
    // ── 1) Setup: cliente + fattura + righe ─────────────────────────────
    const cl = newCliente();
    const clRes = await api.crudInsert('clienti', cl);
    const clienteId = Number(clRes?.result ?? clRes?.id);
    assert(clienteId > 0, 'cliente insert');
    createdClienti.push(clienteId);

    const fatt = newFatturaInviata(clienteId, { causale: `Fattura E2E test57 conservazione ${Date.now()}` });
    const fIns = await api.crudInsert('fatture_inviate', fatt);
    const fatturaId = Number(fIns?.result ?? fIns?.id);
    assert(fatturaId > 0, 'fattura insert');
    createdFatture.push(fatturaId);

    const iva = await api.crudRead('codici_iva', {
      filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] }
    });
    const um = await api.crudRead('unita_misura', {
      filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] }
    });
    const ivaId = (iva?.results ?? iva?.data)?.[0]?.id;
    const umId  = (um?.results ?? um?.data)?.[0]?.id;
    await api.crudInsert('fatture_inviate_righe', newRigaFattura(fatturaId, ivaId, umId));
    log(`fattura id=${fatturaId} pronta`);

    // ── 2) Submit Mock → genera file .xml.p7m + sdi_id ──────────────────
    const sub = await api.endpoint('/api/sdi/submit', {
      method: 'POST',
      body: { FatturaId: fatturaId }
    });
    assert(sub.ok === true, `submit: ${JSON.stringify(sub)?.slice(0, 300)}`);
    log(`submit: sdi_id=${sub.sdi_id} signed_file=${sub.signed_file_name} bytes=${sub.signed_bytes}`);

    // ── 3) Apply RC notification per simulare workflow tipico ───────────
    const fattInfo = await queryOne(`SELECT progressivo FROM dbo.fatture_inviate WHERE id = ${fatturaId}`);
    const rcXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<RicevutaConsegna xmlns="http://www.fatturapa.gov.it/sdi/messaggi/v1.0" versione="1.0">` +
      `<IdentificativoSdI>${sub.sdi_id}</IdentificativoSdI>` +
      `<NomeFile>IT01234567890_${String(fattInfo.progressivo).padStart(5, '0')}.xml.p7m</NomeFile>` +
      `<DataOraRicezione>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraRicezione>` +
      `<DataOraConsegna>${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</DataOraConsegna>` +
      `<MessageId>e2e-test57-rc-${Date.now()}</MessageId>` +
      `</RicevutaConsegna>`;
    const apply = await api.endpoint('/api/sdi/notifications/apply-raw', {
      method: 'POST',
      body: { Items: [{
        Xml: rcXml,
        FileName: `IT01234567890_RC_${String(fattInfo.progressivo).padStart(5, '0')}.xml`,
        PecMessageId: `e2e-test57-rc-pec-${Date.now()}`,
        ProviderSource: 'Test'
      }] }
    });
    assert(apply.ok === true && apply.applied === 1, `apply RC: ${JSON.stringify(apply)?.slice(0, 200)}`);
    log(`fattura accettata da SDI: stato_sdi=CONSEGNATA ✓`);

    // ── 4) POST /api/sdi/conservation/seal/{fatturaId} ─────────────────
    const seal = await api.endpoint(`/api/sdi/conservation/seal/${fatturaId}`, { method: 'POST' });
    assert(seal?.ok === true, `seal: ${JSON.stringify(seal)?.slice(0, 400)}`);
    assert(seal.provider === 'Filesystem' || /Aruba|InfoCert/.test(seal.provider),
      `provider atteso Filesystem/Aruba/InfoCert, visto '${seal.provider}'`);
    assert(typeof seal.conservation_index_id === 'number' && seal.conservation_index_id > 0,
      `conservation_index_id mancante: ${JSON.stringify(seal)?.slice(0, 200)}`);
    assert(/^[a-f0-9]{64}$/i.test(seal.sha256 || ''),
      `sha256 atteso hex 64-char, visto '${seal.sha256}'`);
    assert(seal.storage_location && seal.storage_location.length > 5,
      `storage_location mancante: '${seal.storage_location}'`);
    conservationIndexId = seal.conservation_index_id;
    log(`seal: provider=${seal.provider} idx=${conservationIndexId} sha256=${seal.sha256.slice(0, 16)}... loc=${seal.storage_location.slice(0, 60)} ✓`);

    // ── 5) DB sanity: conservazione_index ───────────────────────────────
    const idx = await queryOne(`
      SELECT TOP 1 fattura_id, nome_file, file_size_bytes, sha256_hash,
             provider, storage_location, sealed_by_user_id,
             DATEDIFF(year, sealed_at, retention_until) AS retention_years,
             ISNULL(metadata_json, '') AS metadata_json
      FROM dbo.conservazione_index
      WHERE id = ${conservationIndexId}`);
    assert(idx, `conservazione_index row ${conservationIndexId} non trovata`);
    assert(Number(idx.fattura_id) === fatturaId, `fattura_id mismatch: ${idx.fattura_id} vs ${fatturaId}`);
    assert(/\.(xml|p7m)$/i.test(idx.nome_file), `nome_file inatteso: '${idx.nome_file}'`);
    assert(Number(idx.file_size_bytes) > 100, `file_size_bytes troppo piccolo: ${idx.file_size_bytes}`);
    assert(idx.sha256_hash === seal.sha256, `sha256 DB vs response mismatch`);
    assert(Number(idx.retention_years) === 10,
      `retention_years atteso 10 (AgID), visto ${idx.retention_years}`);
    assert(/"numero"/.test(idx.metadata_json),
      `metadata_json non ha 'numero': ${idx.metadata_json?.slice(0, 200)}`);
    log(`conservazione_index OK: fatt=${idx.fattura_id} provider=${idx.provider} retention=10y ✓`);

    // ── 6) GET /api/sdi/conservation/verify/{id} ────────────────────────
    const verify = await api.endpoint(`/api/sdi/conservation/verify/${conservationIndexId}`, { method: 'GET' });
    assert(verify?.ok === true, `verify: ${JSON.stringify(verify)?.slice(0, 300)}`);
    assert(verify.sha256_expected === seal.sha256, `sha256 expected mismatch`);
    assert(verify.sha256_actual === seal.sha256, `sha256 actual mismatch (file alterato?)`);
    log(`verify: sha256 match ✓ timestamp_valid=${verify.timestamp_valid} (no-op in dev senza TSA)`);

    // ── 7) DB sanity post-verify: last_verified_at popolato ─────────────
    const idxPost = await queryOne(`
      SELECT last_verified_at, last_verified_ok
      FROM dbo.conservazione_index WHERE id = ${conservationIndexId}`);
    assert(idxPost?.last_verified_at, `last_verified_at non popolato dopo verify`);
    assert(Number(idxPost.last_verified_ok) === 1,
      `last_verified_ok atteso 1, visto ${idxPost.last_verified_ok}`);
    log(`verify audit: last_verified_at=${idxPost.last_verified_at} ok=${idxPost.last_verified_ok} ✓`);

    // ── 8) Sigillo NON deve generare bell (e' op amministrativa) ────────
    // (assertivo: nessuna riga _notifications con type 'sdi.conservation.*'
    //  per myUserId negli ultimi 60s)
    const bellSpurio = await queryOne(`
      SELECT COUNT(*) AS n FROM dbo._notifications
      WHERE user_id = ${myUserId}
        AND type LIKE 'sdi.conservation.%'
        AND created_at >= DATEADD(second, -60, SYSUTCDATETIME())`,
      'FatturazioneElettronica_Metadata');
    assert(Number(bellSpurio?.n ?? 0) === 0,
      `bell spuria sul sigillo: count=${bellSpurio?.n} (operazione amministrativa, no notifica utente)`);
    log(`bell: nessuna notifica sul sigillo (amministrativo) ✓`);

    return {
      fatturaId,
      conservationIndexId,
      provider: seal.provider,
      sha256: seal.sha256
    };
  } finally {
    // Cleanup conservation index e fattura — l'ordine FK e'
    // conservazione_index → fatture_inviate (no FK cascade in schema, va manuale)
    if (conservationIndexId) {
      try {
        await api.endpoint(`/api/sdi/conservation/${conservationIndexId}`, { method: 'DELETE' });
      } catch { /* endpoint puo' non esistere — DELETE diretto SQL come fallback */ }
      try {
        await api.callStored?.('sp_delete_conservation_test', [
          { field: '@id', value: conservationIndexId }
        ]);
      } catch { /* */ }
      // Fallback: DELETE diretto via crudDelete sulla route metadata se esiste
      try { await api.crudDelete('conservazione_index', { id: conservationIndexId }); }
      catch { /* */ }
    }
    for (const fid of createdFatture.reverse()) {
      try { await api.crudDelete('fatture_inviate', { id: fid }); } catch { /* */ }
    }
    for (const cid of createdClienti.reverse()) {
      try { await api.crudDelete('clienti', { id: cid }); } catch { /* */ }
    }
  }
}
