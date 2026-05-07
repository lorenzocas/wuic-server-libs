/**
 * Test 27: Workflow #19 — Saved Searches per utente.
 *
 * A. POST /api/saved-searches { route: 'clienti', user_id: U, label: 'VIP', filter_json: ... } → ok, id
 * B. GET /api/saved-searches?route=clienti&user_id=U → contiene la entry salvata
 * C. POST seconda search per stesso user/route → list ne ha 2
 * D. DELETE /api/saved-searches/{id}?user_id=U → list ne ha 1
 * E. Isolation: userB non vede searches di userA
 * F. Validation: POST senza route/label/filter_json → 400
 * G. POST con route diversa → GET filtrato per quella route ritorna solo quella
 */
import { queryOne, exec, dbConfig } from '../_shared/sql-helpers.mjs';
const META_DB = dbConfig.DEFAULT_META_DB;

export const meta = {
  id: '27',
  name: 'Saved Searches per utente (CRUD API + isolation + multi-route filter)',
  area: 'workflow',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { backendBaseUrl, assert, log } = ctx;
  const apiBase = backendBaseUrl.replace(/\/$/, '');
  const userA = 8842, userB = 8843;

  // Cleanup pre-test
  try {
    await exec(`DELETE FROM dbo.user_saved_searches WHERE user_id IN (${userA}, ${userB})`, META_DB);
  } catch {}

  // === A: POST salva search ===
  const filter1 = JSON.stringify({
    filters: [{ field: 'tipo_soggetto', operator: 'eq', value: 'AZIENDA' },
              { field: 'nazione', operator: 'eq', value: 'IT' }]
  });
  let r = await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'clienti', user_id: userA, label: 'VIP italiani', filter_json: filter1 })
  });
  let j = await r.json();
  assert(j.ok === true && j.id > 0, `A: POST fail: ${JSON.stringify(j)}`);
  const id1 = j.id;
  log(`Test A: POST id=${id1} label="VIP italiani"`);

  // === B: GET list ===
  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userA}`);
  j = await r.json();
  assert(j.ok === true && Array.isArray(j.results), `B: GET fail: ${JSON.stringify(j)}`);
  assert(j.results.length === 1, `B: attesa 1 search, viste ${j.results.length}`);
  assert(j.results[0].id === id1, `B: id mismatch`);
  assert(j.results[0].label === 'VIP italiani', `B: label mismatch`);
  assert(j.results[0].filter_json === filter1, `B: filter_json mismatch`);
  log(`Test B: GET ritorna ${j.results.length} entry con label="${j.results[0].label}"`);

  // === C: POST seconda search ===
  const filter2 = JSON.stringify({ filters: [{ field: 'cap', operator: 'startswith', value: '00' }] });
  r = await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'clienti', user_id: userA, label: 'Roma area', filter_json: filter2 })
  });
  j = await r.json();
  assert(j.ok === true, `C: POST seconda search fail`);
  const id2 = j.id;

  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userA}`);
  j = await r.json();
  assert(j.results.length === 2, `C: attese 2 searches, viste ${j.results.length}`);
  log(`Test C: 2 searches per userA / clienti`);

  // === D: DELETE ===
  r = await fetch(`${apiBase}/api/saved-searches/${id1}?user_id=${userA}`, { method: 'DELETE' });
  j = await r.json();
  assert(j.ok === true && j.deleted === 1, `D: DELETE fail: ${JSON.stringify(j)}`);

  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userA}`);
  j = await r.json();
  assert(j.results.length === 1, `D: dopo DELETE attesa 1 search, viste ${j.results.length}`);
  assert(j.results[0].id === id2, `D: la search rimasta deve essere id2`);
  log(`Test D: DELETE id=${id1} ok, 1 entry rimasta`);

  // === E: Isolation user B ===
  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userB}`);
  j = await r.json();
  assert(j.ok === true && j.results.length === 0, `E: userB deve vedere 0 searches: ${JSON.stringify(j)}`);
  log(`Test E: isolation ok — userB vede 0 searches`);

  // userB salva una sua search → userA non la vede
  await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'clienti', user_id: userB, label: 'B-only', filter_json: '{"filters":[]}' })
  });
  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userA}`);
  j = await r.json();
  assert(j.results.length === 1 && j.results[0].label === 'Roma area',
    `E: cross-user: userA non deve vedere search di userB`);
  log(`  cross-user isolation ok: userA continua a vedere solo "Roma area"`);

  // === F: Validation ===
  r = await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userA, label: 'no route', filter_json: '{}' })
  });
  assert(r.status === 400, `F: senza route deve essere 400, visto ${r.status}`);
  r = await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'x', user_id: userA, filter_json: '{}' })
  });
  assert(r.status === 400, `F: senza label deve essere 400, visto ${r.status}`);
  r = await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'x', user_id: userA, label: 'X' })
  });
  assert(r.status === 400, `F: senza filter_json deve essere 400, visto ${r.status}`);
  log(`Test F: validation 400 per route/label/filter_json mancanti`);

  // === G: Multi-route filter ===
  await fetch(`${apiBase}/api/saved-searches`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'fatture_inviate', user_id: userA, label: 'EMESSE', filter_json: '{"filters":[{"field":"stato","operator":"eq","value":"EMESSA"}]}' })
  });
  // GET per clienti → solo "Roma area"
  r = await fetch(`${apiBase}/api/saved-searches?route=clienti&user_id=${userA}`);
  j = await r.json();
  assert(j.results.length === 1 && j.results[0].label === 'Roma area',
    `G: clienti → 1 entry "Roma area"`);
  // GET per fatture_inviate → solo "EMESSE"
  r = await fetch(`${apiBase}/api/saved-searches?route=fatture_inviate&user_id=${userA}`);
  j = await r.json();
  assert(j.results.length === 1 && j.results[0].label === 'EMESSE',
    `G: fatture_inviate → 1 entry "EMESSE"`);
  log(`Test G: filter per route ok (clienti vs fatture_inviate)`);

  // Cleanup finale
  try {
    await exec(`DELETE FROM dbo.user_saved_searches WHERE user_id IN (${userA}, ${userB})`, META_DB);
  } catch {}

  return { userA, userB, total_tests: 7 };
}
