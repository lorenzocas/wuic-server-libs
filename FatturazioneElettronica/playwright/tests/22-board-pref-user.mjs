/**
 * Test 22: Workflow #15 — Dashboard widget configurabili per utente.
 *
 * 1) API: GET /api/board-pref?route=home&user_id=42 → ok=true, layout_json=null
 * 2) API: POST /api/board-pref { route, user_id, layout_json } → saved=1
 * 3) API: GET ritorna layout_json salvato
 * 4) API: POST overwrite con nuovo JSON → saved=1, GET ritorna nuovo
 * 5) API: DELETE → deleted=1, GET ritorna null
 * 6) Verifica DB Metadati: riga in dom_board_user_pref dopo save, mancante dopo delete
 * 7) Test isolation per (user_id, board_route): user A non vede pref di user B
 */
import { queryOne, exec, dbConfig } from '../_shared/sql-helpers.mjs';
const META_DB = dbConfig.DEFAULT_META_DB;

export const meta = {
  id: '22',
  name: 'Dashboard widget pref per utente (CRUD API + DB persist + isolation)',
  area: 'workflow',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');

  // user_id univoci per test (>1000 per non collidere con utenti reali)
  const userA = 9942;
  const userB = 9943;
  const route = 'fatture_inviate/home';

  // Cleanup pre-test
  try { await exec(`DELETE FROM dbo.dom_board_user_pref WHERE user_id IN (${userA}, ${userB})`, META_DB); } catch {}

  // === Test A: GET pref vuoto ritorna layout_json=null ===
  let r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`);
  let j = await r.json();
  assert(j.ok === true, `GET vuoto fail: ${JSON.stringify(j)?.slice(0,200)}`);
  assert(j.layout_json === null || j.layout_json === undefined, `pre-save: layout deve essere null, visto ${j.layout_json}`);
  log('Test A: GET pref vuoto ok (layout_json=null)');

  // === Test B: POST salva layout ===
  const layout1 = JSON.stringify({
    widgets: [
      { id: 'kpi_clienti', visible: true, order: 1 },
      { id: 'kpi_fatture', visible: true, order: 2 },
      { id: 'chart_vendite', visible: false, order: 3 }
    ]
  });
  r = await fetch(`${apiBase}/api/board-pref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, user_id: userA, layout_json: layout1 })
  });
  j = await r.json();
  assert(j.ok === true && j.saved === 1, `POST save fail: ${JSON.stringify(j)?.slice(0,200)}`);
  log(`Test B: POST save ok (saved=${j.saved})`);

  // Verifica DB Metadati
  const rowDb = await queryOne(
    `SELECT user_id, board_route, layout_json FROM dbo.dom_board_user_pref WHERE user_id = ${userA} AND board_route = '${route}'`,
    META_DB
  );
  assert(rowDb && Number(rowDb.user_id) === userA, `DB row missing per user ${userA}`);
  assert(rowDb.layout_json === layout1, `DB layout mismatch`);
  log('  DB row presente con layout corretto');

  // === Test C: GET ritorna layout salvato ===
  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`);
  j = await r.json();
  assert(j.ok === true && j.layout_json === layout1, `GET dopo save: layout mismatch`);
  log('Test C: GET dopo save ritorna layout corretto');

  // === Test D: POST overwrite ===
  const layout2 = JSON.stringify({
    widgets: [
      { id: 'kpi_clienti', visible: false, order: 5 },
      { id: 'kpi_fatture', visible: true, order: 1 }
    ]
  });
  r = await fetch(`${apiBase}/api/board-pref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, user_id: userA, layout_json: layout2 })
  });
  j = await r.json();
  assert(j.ok === true && j.saved === 1, `POST overwrite fail: ${JSON.stringify(j)?.slice(0,200)}`);

  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`);
  j = await r.json();
  assert(j.layout_json === layout2, `overwrite: layout non aggiornato`);
  log('Test D: POST overwrite ok, GET ritorna nuovo JSON');

  // Verifica niente duplicati DB (PK su user_id+route)
  const cnt = await queryOne(
    `SELECT COUNT(*) AS c FROM dbo.dom_board_user_pref WHERE user_id = ${userA} AND board_route = '${route}'`,
    META_DB
  );
  assert(Number(cnt.c) === 1, `attesa 1 riga DB, viste ${cnt.c}`);
  log('  PK: 1 sola riga in DB (no duplicati)');

  // === Test E: Isolation user A vs user B ===
  // userB non ha mai salvato → GET ritorna null
  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userB}`);
  j = await r.json();
  assert(j.ok === true && (j.layout_json === null || j.layout_json === undefined),
    `isolation: userB deve vedere null, visto ${j.layout_json?.slice?.(0,80)}`);
  log('Test E: isolation ok — userB vede null mentre userA ha pref');

  // userB salva un layout diverso
  const layoutB = JSON.stringify({ widgets: [{ id: 'only_for_B', visible: true }] });
  await fetch(`${apiBase}/api/board-pref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, user_id: userB, layout_json: layoutB })
  });
  // userA NON deve vedere il layout di userB
  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`);
  j = await r.json();
  assert(j.layout_json === layout2, `isolation cross-user: userA vede layout di userB!`);
  log('  cross-user isolation ok (userA layout invariato dopo save di userB)');

  // === Test F: DELETE ===
  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`, { method: 'DELETE' });
  j = await r.json();
  assert(j.ok === true && j.deleted === 1, `DELETE fail: ${JSON.stringify(j)?.slice(0,200)}`);

  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}&user_id=${userA}`);
  j = await r.json();
  assert(j.ok === true && (j.layout_json === null || j.layout_json === undefined),
    `dopo DELETE deve ritornare null`);
  log('Test F: DELETE ok, GET ritorna null');

  // === Test G: validation route obbligatoria ===
  r = await fetch(`${apiBase}/api/board-pref?user_id=${userA}`);
  assert(r.status === 400, `GET senza route deve essere 400, visto ${r.status}`);
  log('Test G: validation route obbligatoria ok (400)');

  // === Test H: validation user_id obbligatorio ===
  r = await fetch(`${apiBase}/api/board-pref?route=${encodeURIComponent(route)}`);
  assert(r.status === 400, `GET senza user_id deve essere 400, visto ${r.status}`);
  log('Test H: validation user_id obbligatorio ok (400)');

  // Cleanup finale
  try { await exec(`DELETE FROM dbo.dom_board_user_pref WHERE user_id IN (${userA}, ${userB})`, META_DB); } catch {}

  return { userA, userB, route, layouts_tested: 2 };
}
