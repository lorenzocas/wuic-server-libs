/**
 * Test 16 — endpoint POST /api/Geolocation/UpdatePosition
 *
 * Verifica:
 * - 401 senza auth
 * - 200 con admin_test_2 (auth + ruolo admin/gestore_flotta/autista)
 * - DB: latitudine/longitudine/data_ultima_posizione aggiornati su mezzi
 * - 400 con coordinate fuori range (-91 latitudine)
 * - 404 con mezzo_id inesistente
 */
import { query } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '16',
  name: 'Controller Geolocation.UpdatePosition'
};

export async function run(ctx) {
  const url = `${ctx.backendBaseUrl}/api/Geolocation/UpdatePosition`;

  // Setup: trova mezzo OP012QR
  const m = await query("SELECT id FROM dbo.mezzi WHERE targa = N'OP012QR'");
  const mezzo_id = parseInt(m[0].id);

  // 1) 401 senza cookie
  const noAuth = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mezzo_id, latitudine: 45.07, longitudine: 7.68 })
  });
  ctx.assert(noAuth.status === 401, `no-auth atteso 401, ricevuto ${noAuth.status}`);
  ctx.log('401 senza auth: OK');

  // 2) 200 con auth — coordinate Torino
  const body = await ctx.api.endpoint('/api/Geolocation/UpdatePosition', {
    method: 'POST',
    body: { mezzo_id, latitudine: 45.0703, longitudine: 7.6869 }
  });
  ctx.assert(body.ok === true, `body.ok=${body.ok}`);
  ctx.assert(body.updated_rows >= 1, `updated_rows=${body.updated_rows} (atteso >=1)`);
  ctx.log(`updated mezzo ${mezzo_id}: rows=${body.updated_rows}`);

  // 3) Verifica DB
  const post = await query(`SELECT latitudine, longitudine, data_ultima_posizione FROM dbo.mezzi WHERE id = ${mezzo_id}`);
  ctx.assert(post.length === 1);
  const lat = parseFloat(post[0].latitudine);
  const lng = parseFloat(post[0].longitudine);
  ctx.assert(Math.abs(lat - 45.0703) < 0.001, `lat DB=${lat} atteso 45.0703`);
  ctx.assert(Math.abs(lng - 7.6869) < 0.001, `lng DB=${lng} atteso 7.6869`);
  ctx.assert(post[0].data_ultima_posizione, 'data_ultima_posizione NULL dopo update');
  ctx.log(`DB: lat=${lat} lng=${lng} ts=${post[0].data_ultima_posizione}`);

  // 4) 400 con latitudine fuori range
  let got400 = false;
  try {
    await ctx.api.endpoint('/api/Geolocation/UpdatePosition', {
      method: 'POST',
      body: { mezzo_id, latitudine: -91, longitudine: 0 }
    });
  } catch (e) {
    if (e.status === 400) got400 = true;
  }
  ctx.assert(got400, '400 atteso per latitudine -91, ma non sollevato');
  ctx.log('400 latitudine fuori range: OK');

  // 5) 404 con mezzo_id inesistente
  let got404 = false;
  try {
    await ctx.api.endpoint('/api/Geolocation/UpdatePosition', {
      method: 'POST',
      body: { mezzo_id: 999999, latitudine: 0, longitudine: 0 }
    });
  } catch (e) {
    if (e.status === 404) got404 = true;
  }
  ctx.assert(got404, '404 atteso per mezzo_id 999999, ma non sollevato');
  ctx.log('404 mezzo inesistente: OK');

  return { mezzo_id, lat, lng, ts: post[0].data_ultima_posizione };
}
