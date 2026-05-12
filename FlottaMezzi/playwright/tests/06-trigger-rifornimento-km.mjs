/**
 * Test 06 — trigger DB tr_rifornimenti_aggiorna_km
 *
 * Verifica: dopo INSERT su rifornimenti con km_veicolo > km_attuali del mezzo,
 * il trigger aggiorna mezzi.km_attuali = MAX(km_veicolo).
 *
 * Pattern: INSERT via API (crud), verifica via SQL diretta (per leggere
 * effetto del trigger DB che non e' visibile via metadata standard).
 */
import { exec, queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '06',
  name: 'Trigger rifornimenti aggiorna km'
};

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.rifornimenti WHERE distributore = N'_E2E_TEST_06'");
}

export async function run(ctx) {
  // 1) Trova un mezzo esistente (AB123CD) e leggi km_attuali pre-test
  const pre = await queryOne(
    "SELECT id, targa, km_attuali FROM dbo.mezzi WHERE targa = N'AB123CD' AND ISNULL(cancellato,0)=0"
  );
  ctx.assert(pre != null, 'mezzo AB123CD non trovato (seed mancante?)');
  const mezzo_id = parseInt(pre.id);
  const km_pre = parseInt(pre.km_attuali);
  ctx.log(`mezzo ${pre.targa} km_attuali pre = ${km_pre}`);

  // 2) INSERT via API CRUD (AsmxProxy MetaService.insertRecord)
  // NB: la colonna SQL `data` viene rinominata da scaffoldTable in `data_field`
  // come friendly metadata key (metaModelRaw.cs:2896 — riserva "data"/"row"/"default").
  // Il payload deve usare `data_field`, NON `data`.
  const km_test = km_pre + 5000;
  const insertResp = await ctx.api.crudInsert('rifornimenti', {
    mezzo_id,
    data_field: new Date().toISOString().slice(0, 19).replace('T', ' '),
    litri: 40,
    costo_totale: 75,
    prezzo_litro: 1.875,
    km_veicolo: km_test,
    distributore: '_E2E_TEST_06',
    note: 'test 06 trigger km via API'
  });
  ctx.assert(insertResp != null, 'crudInsert ha ritornato null');
  ctx.log(`rifornimento inserito via API (km_veicolo=${km_test}, result=${JSON.stringify(insertResp).slice(0, 100)})`);

  // 3) Verifica via SQL che km_attuali sia stato aggiornato dal trigger
  const post = await queryOne(
    `SELECT km_attuali FROM dbo.mezzi WHERE id = ${mezzo_id}`
  );
  const km_post = parseInt(post.km_attuali);
  ctx.log(`mezzo km_attuali post = ${km_post} (atteso >= ${km_test})`);
  ctx.assert(km_post >= km_test, `trigger NON ha aggiornato km_attuali: pre=${km_pre} post=${km_post} atteso>=${km_test}`);

  return { km_pre, km_test, km_post, delta: km_post - km_pre };
}
