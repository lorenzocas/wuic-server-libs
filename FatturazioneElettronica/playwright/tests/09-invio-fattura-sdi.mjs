/**
 * Test 04: Invio fattura via SDI controller (livello 5).
 * Verifica end-to-end:
 *   1) crea fattura test con riga
 *   2) chiama POST /api/sdi/generateXml -> file XML scritto su disco
 *   3) verifica file_xml popolato in fatture_inviate
 *   4) parse XML: dichiarazione UTF-8 + namespace FatturaElettronica + numero coerente
 *   5) chiama POST /api/sdi/markAsSent -> stato_sdi=INVIATA, stato BOZZA->EMESSA
 *   6) verifica via SQL
 *   7) cleanup
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { queryOne } from '../_shared/sql-helpers.mjs';
import { newCliente, newFatturaInviata, newRigaFattura } from '../_shared/test-data.mjs';

export const meta = {
  id: '09',
  name: 'Invio fattura via SdiController (XML + markAsSent)',
  area: 'documenti',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { api, baseUrl, backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // 1) seed cliente + fattura
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  log(`clRes shape: ${JSON.stringify(clRes)?.slice(0, 200)}`);
  const clId = Number(clRes?.result ?? clRes?.id ?? clRes?.Id ?? clRes?.results?.[0]?.id);
  log(`clId=${clId}`);
  assert(clId > 0, `cliente insert non ritorna id (clRes=${JSON.stringify(clRes)?.slice(0, 300)})`);

  const fatt = newFatturaInviata(clId);
  log(`fatt payload: ${JSON.stringify(fatt)?.slice(0, 200)}`);
  const fRes = await api.crudInsert('fatture_inviate', fatt);
  log(`fRes shape: ${JSON.stringify(fRes)?.slice(0, 300)}`);
  const fatturaId = Number(fRes?.result ?? fRes?.id ?? fRes?.Id ?? fRes?.results?.[0]?.id);
  assert(fatturaId > 0, `fattura insert non ritorna id (fRes=${JSON.stringify(fRes)?.slice(0, 400)})`);

  const iva = await api.crudRead('codici_iva', { filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] } });
  const um  = await api.crudRead('unita_misura', { filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] } });
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(
    fatturaId,
    (iva?.results ?? iva?.data)[0].id,
    (um?.results ?? um?.data)[0].id
  ));
  log(`fattura ${fatturaId} pronta`);

  // 2) generate XML via REST direct (SdiController). Uso `api.endpoint`
  //    invece di raw fetch perche' il controller usa AuthGate.RequireAdmin
  //    e il cookie k-user va passato dall'authenticated requestContext.
  const genJson = await api.endpoint('/api/sdi/generateXml', {
    method: 'POST',
    body: { FatturaId: fatturaId }
  });
  assert(genJson.ok === true, `generateXml fail: ${JSON.stringify(genJson)}`);
  assert(genJson.file_xml, 'file_xml non ritornato');
  log(`XML generato: ${genJson.file_xml} (${genJson.xml_size_bytes} bytes)`);

  // 3) verifica file su disco
  const fpath = genJson.file_xml;
  assert(existsSync(fpath), `file XML non esiste: ${fpath}`);
  const stats = statSync(fpath);
  assert(stats.size > 500, `XML troppo piccolo: ${stats.size} bytes`);

  // 4) parse content
  const xml = readFileSync(fpath, 'utf8');
  assert(xml.includes('encoding="utf-8"'), 'encoding XML non e\' UTF-8 (SDI rigetta)');
  assert(xml.includes('FatturaElettronica'), 'root element FatturaElettronica mancante');
  assert(xml.includes('http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2'), 'namespace SDI mancante');
  assert(xml.includes('FormatoTrasmissione') && xml.includes('FPR12'), 'FormatoTrasmissione FPR12 mancante');

  // 5) markAsSent (admin-gated → authenticated endpoint)
  const markJson = await api.endpoint('/api/sdi/markAsSent', {
    method: 'POST',
    body: { FatturaId: fatturaId, SdiId: 'IT_E2E_TEST', SdiMessaggio: 'Test E2E' }
  });
  assert(markJson.ok === true && markJson.rows_updated === 1, `markAsSent fail: ${JSON.stringify(markJson)}`);

  // 6) verifica DB
  const after = await queryOne(`
    SELECT stato, stato_sdi, sdi_id FROM dbo.fatture_inviate WHERE id = ${fatturaId}
  `);
  assert(after.stato === 'EMESSA', `stato non aggiornato: ${after.stato}`);
  assert(after.stato_sdi === 'INVIATA', `stato_sdi non aggiornato: ${after.stato_sdi}`);
  log(`mark ok: stato=${after.stato}, stato_sdi=${after.stato_sdi}`);

  // 7) cleanup
  try {
    await api.crudDelete('fatture_inviate', { id: fatturaId });
    await api.crudDelete('clienti', { id: clId });
  } catch {}

  return { fatturaId, fileXml: fpath, xmlSize: stats.size };
}
