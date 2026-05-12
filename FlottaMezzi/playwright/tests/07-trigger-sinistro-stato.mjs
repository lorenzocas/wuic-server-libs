/**
 * Test 07 — trigger DB tr_sinistri_stato_mezzo
 *
 * Verifica: dopo INSERT su sinistri, il trigger imposta
 * mezzi.stato_mezzo_id = (SELECT id FROM stato_mezzo WHERE descrizione='in_riparazione').
 */
import { exec, queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '07',
  name: 'Trigger sinistro -> stato_mezzo in_riparazione'
};

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.sinistri WHERE numero_pratica LIKE N'_E2E_PRAT_07_%'");
}

export async function run(ctx) {
  // 1) Setup: garantisci che il mezzo OP012QR sia 'attivo' all'inizio
  const stato_attivo = await queryOne(
    "SELECT id FROM dbo.stato_mezzo WHERE descrizione = N'attivo'"
  );
  ctx.assert(stato_attivo != null, 'stato_mezzo "attivo" non trovato');
  const id_attivo = parseInt(stato_attivo.id);

  await exec(
    `UPDATE dbo.mezzi SET stato_mezzo_id = ${id_attivo} WHERE targa = N'OP012QR'`
  );

  const pre = await queryOne(
    "SELECT id, stato_mezzo_id FROM dbo.mezzi WHERE targa = N'OP012QR'"
  );
  ctx.assert(pre != null, 'mezzo OP012QR non trovato');
  const mezzo_id = parseInt(pre.id);
  ctx.log(`mezzo OP012QR pre stato = ${pre.stato_mezzo_id} (atteso: ${id_attivo} attivo)`);
  ctx.assert(parseInt(pre.stato_mezzo_id) === id_attivo, 'reset stato pre-test fallito');

  // 2) INSERT via API (AsmxProxy) — usa `data_field` (rename automatico
  // dello scaffoldTable per parole riservate metaModelRaw.cs:2896).
  const ts = Date.now();
  await ctx.api.crudInsert('sinistri', {
    mezzo_id,
    data_field: new Date().toISOString().slice(0, 19).replace('T', ' '),
    descrizione: 'Test 07 trigger stato',
    controparte: 'E2E test',
    costo_stimato: 100,
    stato_pratica: 'Aperta',
    numero_pratica: `_E2E_PRAT_07_${ts}`
  });
  ctx.log(`sinistro inserito via API (numero_pratica=_E2E_PRAT_07_${ts})`);

  // 3) Verifica trigger ha cambiato stato a in_riparazione
  const stato_rip = await queryOne(
    "SELECT id FROM dbo.stato_mezzo WHERE descrizione = N'in_riparazione'"
  );
  const id_rip = parseInt(stato_rip.id);

  const post = await queryOne(
    `SELECT stato_mezzo_id FROM dbo.mezzi WHERE id = ${mezzo_id}`
  );
  const post_stato = parseInt(post.stato_mezzo_id);
  ctx.log(`mezzo post stato = ${post_stato} (atteso: ${id_rip} in_riparazione)`);
  ctx.assert(post_stato === id_rip, `trigger NON ha cambiato stato: pre=${id_attivo} post=${post_stato} atteso=${id_rip}`);

  return { stato_pre: id_attivo, stato_post: post_stato, expected: id_rip };
}
