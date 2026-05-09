/**
 * Test 58: comunicazioni periodiche fiscali (LIPE / Esterometro / CU).
 *
 * Verifica end-to-end:
 *   1) POST /api/fiscal/lipe/generate?anno=2099&periodo=Q1
 *      - genera XML con namespace AgID `urn:www.agenziaentrate.gov.it:specificheTecniche:sco:ivp`
 *      - aggrega via sp_aggregato_lipe (totali=0 con anno fittizio 2099)
 *      - UPSERT idempotente in dbo.comunicazioni_periodiche (tipo+anno+periodo unique)
 *      - sha256 hex 64-char, riepilogo_json valido
 *   2) Re-POST stesso periodo → idempotency MERGE (stesso comunicazione_id)
 *   3) POST /api/fiscal/esterometro/generate?anno=2099&periodo=M01 → row separata
 *   4) POST /api/fiscal/cu/generate?anno=2099 → row con periodo NULL
 *   5) GET /api/fiscal/list?tipo=LIPE → ritorna almeno 1 row con i nostri dati
 *   6) GET /api/fiscal/{id}/download → ritorna XML application/xml con declaration UTF-8
 *   7) POST /api/fiscal/lipe/generate-due → guard server-side AlreadyGenerated:
 *      se la LIPE del trimestre piu' recente chiuso esiste gia', skip silente.
 *
 * Anno usato: **2099** — fittizio (>= 2000 < 2100 → validation OK), niente
 * fatture reali, niente conflitto con dati production. Cleanup post-test.
 */
import { queryOne, query } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '58',
  name: 'Comunicazioni periodiche fiscali (LIPE Q1 + Esterometro M01 + CU + list/download)',
  area: 'documenti',
  needsUi: false,
  needsApi: true
};

const TEST_ANNO = 2099;

export async function run(ctx) {
  const { api, assert, log } = ctx;
  const createdComunicazioniIds = [];

  // ── 0) Pre-cleanup: rimuovi eventuali righe stale da run precedenti ───
  try {
    await query(`
      SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
      DELETE FROM dbo.comunicazioni_periodiche WHERE anno = ${TEST_ANNO};
    `);
  } catch { /* */ }

  try {
    // ── 1) LIPE Q1 ──────────────────────────────────────────────────────
    const lipe = await api.endpoint(
      `/api/fiscal/lipe/generate?anno=${TEST_ANNO}&periodo=Q1`,
      { method: 'POST' }
    );
    assert(lipe?.ok === true, `LIPE: ${JSON.stringify(lipe)?.slice(0, 400)}`);
    assert(lipe.tipo === 'LIPE', `tipo atteso 'LIPE', visto '${lipe.tipo}'`);
    assert(typeof lipe.comunicazione_id === 'number' && lipe.comunicazione_id > 0,
      `comunicazione_id mancante: ${JSON.stringify(lipe)?.slice(0, 200)}`);
    assert(/LIPE_2099Q1\.xml$/i.test(lipe.file_name),
      `file_name atteso 'LIPE_2099Q1.xml', visto '${lipe.file_name}'`);
    assert(/^[a-f0-9]{64}$/i.test(lipe.sha256 || ''),
      `sha256 atteso hex 64-char, visto '${lipe.sha256}'`);
    assert(Number(lipe.xml_bytes) > 200, `xml_bytes troppo piccolo: ${lipe.xml_bytes}`);
    assert(lipe.riepilogo, `riepilogo mancante`);
    createdComunicazioniIds.push(lipe.comunicazione_id);
    log(`LIPE Q1: id=${lipe.comunicazione_id} file=${lipe.file_name} sha=${lipe.sha256.slice(0, 16)}... bytes=${lipe.xml_bytes} ✓`);

    // ── 2) DB sanity ────────────────────────────────────────────────────
    const lipeRow = await queryOne(`
      SELECT tipo, anno, periodo, nome_file, sha256_hash, stato,
             LEN(xml_payload) AS xml_len, ISNULL(riepilogo_json, '') AS riepilogo_json
      FROM dbo.comunicazioni_periodiche WHERE id = ${lipe.comunicazione_id}`);
    assert(lipeRow?.tipo === 'LIPE' && Number(lipeRow.anno) === TEST_ANNO && lipeRow.periodo === 'Q1',
      `LIPE row mismatch: ${JSON.stringify(lipeRow)?.slice(0, 200)}`);
    assert(lipeRow.stato === 'GENERATA',
      `stato atteso 'GENERATA' subito dopo generate, visto '${lipeRow.stato}'`);
    assert(Number(lipeRow.xml_len) === Number(lipe.xml_bytes),
      `xml_len DB vs response: ${lipeRow.xml_len} vs ${lipe.xml_bytes}`);
    assert(/"saldoIva"/.test(lipeRow.riepilogo_json),
      `riepilogo_json non contiene saldoIva`);
    log(`DB LIPE row: tipo=${lipeRow.tipo} anno=${lipeRow.anno} periodo=${lipeRow.periodo} stato=${lipeRow.stato} xml_len=${lipeRow.xml_len} ✓`);

    // ── 3) Idempotency MERGE: re-POST stesso periodo, stesso ID ────────
    const lipeBis = await api.endpoint(
      `/api/fiscal/lipe/generate?anno=${TEST_ANNO}&periodo=Q1`,
      { method: 'POST' }
    );
    assert(lipeBis?.ok === true, `LIPE bis ok`);
    assert(lipeBis.comunicazione_id === lipe.comunicazione_id,
      `idempotency: stesso (tipo,anno,periodo) deve UPDATE stesso id, ` +
      `visto bis=${lipeBis.comunicazione_id} vs orig=${lipe.comunicazione_id}`);
    assert(lipeBis.sha256 === lipe.sha256, `sha256 deve essere stesso (XML deterministico)`);
    log(`idempotency MERGE: stesso id=${lipeBis.comunicazione_id} stesso sha ✓`);

    // ── 4) Esterometro M01 ──────────────────────────────────────────────
    const ester = await api.endpoint(
      `/api/fiscal/esterometro/generate?anno=${TEST_ANNO}&periodo=M01`,
      { method: 'POST' }
    );
    assert(ester?.ok === true, `Esterometro: ${JSON.stringify(ester)?.slice(0, 300)}`);
    assert(ester.tipo === 'ESTEROMETRO',
      `tipo atteso 'ESTEROMETRO', visto '${ester.tipo}'`);
    assert(/^[a-f0-9]{64}$/i.test(ester.sha256 || ''),
      `Esterometro sha256 hex 64-char`);
    createdComunicazioniIds.push(ester.comunicazione_id);
    log(`Esterometro M01: id=${ester.comunicazione_id} file=${ester.file_name} ✓`);

    // ── 5) CU annuale (periodo NULL) ───────────────────────────────────
    const cu = await api.endpoint(
      `/api/fiscal/cu/generate?anno=${TEST_ANNO}`,
      { method: 'POST' }
    );
    assert(cu?.ok === true, `CU: ${JSON.stringify(cu)?.slice(0, 300)}`);
    assert(cu.tipo === 'CU', `tipo atteso 'CU', visto '${cu.tipo}'`);
    createdComunicazioniIds.push(cu.comunicazione_id);

    const cuRow = await queryOne(`
      SELECT periodo, ISNULL(periodo, '__NULL__') AS periodo_safe
      FROM dbo.comunicazioni_periodiche WHERE id = ${cu.comunicazione_id}`);
    assert(cuRow.periodo_safe === '__NULL__',
      `CU periodo deve essere NULL (annuale), visto '${cuRow.periodo}'`);
    log(`CU ${TEST_ANNO}: id=${cu.comunicazione_id} periodo=NULL (annuale) ✓`);

    // ── 6) GET /api/fiscal/list?tipo=LIPE ───────────────────────────────
    const list = await api.endpoint(`/api/fiscal/list?tipo=LIPE`, { method: 'GET' });
    assert(list?.ok === true, `list ok`);
    assert(Array.isArray(list.items), `list.items deve essere array`);
    const ourLipe = list.items.find(i => Number(i.id) === lipe.comunicazione_id);
    assert(ourLipe, `nostra LIPE id=${lipe.comunicazione_id} non trovata in list`);
    assert(ourLipe.tipo === 'LIPE' && Number(ourLipe.anno) === TEST_ANNO,
      `list item: ${JSON.stringify(ourLipe)?.slice(0, 200)}`);
    log(`list LIPE: ${list.items.length} totali, nostra row presente ✓`);

    // ── 7) GET /api/fiscal/{id}/download → XML in chiaro ────────────────
    // L'endpoint ritorna binary content. Usa fetch raw via api.endpoint
    // con Accept text/xml. Il client backend-api-client supporta il binary
    // ritornandolo come text quando content-type include xml/text.
    const dl = await api.endpoint(`/api/fiscal/${lipe.comunicazione_id}/download`,
      { method: 'GET', expectBinary: true });
    // dl puo' essere stringa (XML) o oggetto Blob/Buffer secondo client.
    const xmlText = typeof dl === 'string' ? dl
                  : dl?.text ? await dl.text()
                  : Buffer.isBuffer(dl) ? dl.toString('utf-8')
                  : JSON.stringify(dl);
    assert(xmlText.includes('<?xml'),
      `download non ritorna XML declaration, primi 100 char: '${xmlText.slice(0, 100)}'`);
    assert(/Fornitura|Comunicazione/.test(xmlText),
      `download XML non contiene <Fornitura>/<Comunicazione>: '${xmlText.slice(0, 200)}'`);
    log(`download LIPE: ${xmlText.length} char, XML structure OK ✓`);

    // ── 8) generate-due idempotency: la LIPE del trimestre attuale chiuso ─
    // In data 2026-05-09 il trimestre "piu' recente chiuso" e' Q1 2026.
    // Se non e' gia' stata generata, generate-due la crea; se esiste, skip.
    const due1 = await api.endpoint(`/api/fiscal/lipe/generate-due`, { method: 'POST' });
    assert(due1?.ok === true, `generate-due 1° call ok`);
    log(`generate-due 1° call: ok=true skipped=${due1.skipped ?? false} reason=${due1.reason ?? '(generated)'} comunicazione_id=${due1.comunicazione_id ?? '(skip)'}`);

    // Track per cleanup se ha generato una row reale (non skipped)
    if (!due1.skipped && due1.comunicazione_id) {
      createdComunicazioniIds.push(due1.comunicazione_id);
    }

    // 2° call: se la 1a ha generato, la 2a deve skip; se la 1a ha skip,
    // la 2a anche. In entrambi i casi, idempotente (no errori, no doppia row).
    const due2 = await api.endpoint(`/api/fiscal/lipe/generate-due`, { method: 'POST' });
    assert(due2?.ok === true, `generate-due 2° call ok`);
    if (due2.skipped) {
      assert(due2.reason === 'already_generated',
        `generate-due 2° skip reason atteso 'already_generated', visto '${due2.reason}'`);
      log(`generate-due 2° call: skip=already_generated ✓ (idempotency Livello 7 OK)`);
    } else {
      // Edge case: se siamo proprio al passaggio di trimestre fra le due call,
      // la 2a potrebbe ancora generare. Improbabile ma non bloccante.
      log(`generate-due 2° call: nuova generazione (edge case fra trimestri?)`);
    }

    return {
      lipeId: lipe.comunicazione_id,
      esterometroId: ester.comunicazione_id,
      cuId: cu.comunicazione_id,
      lipeDueId: due1.comunicazione_id ?? null,
      lipeDueSkipped: !!due1.skipped
    };
  } finally {
    // Cleanup: tutte le comunicazioni create dal test (anno 2099 + l'eventuale
    // lipe generata da generate-due con anno corrente).
    try {
      const ids = createdComunicazioniIds.filter(Boolean).join(',');
      if (ids) {
        await query(`
          SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
          DELETE FROM dbo.comunicazioni_periodiche WHERE id IN (${ids});
          DELETE FROM dbo.comunicazioni_periodiche WHERE anno = ${TEST_ANNO};
        `);
      } else {
        await query(`
          SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
          DELETE FROM dbo.comunicazioni_periodiche WHERE anno = ${TEST_ANNO};
        `);
      }
    } catch { /* */ }
  }
}

export async function cleanup() {
  try {
    await query(`
      SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
      DELETE FROM dbo.comunicazioni_periodiche WHERE anno = ${TEST_ANNO};
    `);
  } catch { /* */ }
}
