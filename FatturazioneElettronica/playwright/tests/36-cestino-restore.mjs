// E2E Block 6 #25: cestino + audit + restore.
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import assert from 'node:assert/strict';

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
try {
  // 1) Baseline
  const baseline = await api.crudRead('clienti', { pageInfo: { page: 1, pageSize: 100 } });
  const baselineCount = baseline.TotalRecords;
  const demos = baseline.results.filter(c => (c.codice?.value || c.codice || '').startsWith('DEMO_CLI'));
  assert(demos.length > 0, 'no DEMO clienti');
  const target = demos[0];
  const targetId = target.id?.value || target.id;
  const targetCodice = target.codice?.value || target.codice;

  // 2) Soft delete
  const delResult = await api.crudDelete('clienti', { id: targetId });
  assert(delResult.result === '1', `delete result: ${delResult.result}`);

  // 3) Lista filtrata: count -1
  const after = await api.crudRead('clienti', { pageInfo: { page: 1, pageSize: 100 } });
  assert.equal(after.TotalRecords, baselineCount - 1, `count: ${baselineCount} → ${after.TotalRecords}`);

  // 4) Cestino contiene il cliente
  const cest1 = await api.crudRead('vw_cestino', { pageInfo: { page: 1, pageSize: 100 } });
  const inCestino = cest1.results.find(c => Number(c.id_originale?.value ?? c.id_originale) === targetId);
  assert(inCestino, `cliente ${targetCodice} not in cestino`);
  assert(inCestino.data_eliminazione?.value || inCestino.data_eliminazione, 'data_eliminazione missing');
  assert(inCestino.utente_eliminazione?.value || inCestino.utente_eliminazione, 'utente_eliminazione missing');

  // 5) Restore via Controller (admin gate — usa api.endpoint per propagare cookie)
  const restoreResult = await api.endpoint('/api/cestino/restore', {
    body: { Entita: 'clienti', IdOriginale: targetId }
  });
  assert(restoreResult.ok && restoreResult.restored === 1, 'restore failed');

  // 6) Cestino non contiene piu' il cliente
  const cest2 = await api.crudRead('vw_cestino', { pageInfo: { page: 1, pageSize: 100 } });
  const stillInCestino = cest2.results.find(c => Number(c.id_originale?.value ?? c.id_originale) === targetId);
  assert(!stillInCestino, `cliente ${targetCodice} still in cestino`);

  // Lista clienti torna alla baseline
  const final = await api.crudRead('clienti', { pageInfo: { page: 1, pageSize: 100 } });
  assert.equal(final.TotalRecords, baselineCount, 'final count != baseline');

  console.log(`PASS #36: ${targetCodice} soft-delete → cestino → restore → list count=${baselineCount}`);
} finally {
  await api.dispose();
}
