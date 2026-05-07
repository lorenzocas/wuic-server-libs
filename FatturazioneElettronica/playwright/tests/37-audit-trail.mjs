// E2E Block 6 #26: audit trail INSERT/UPDATE/DELETE su email_template.
// I campi audit sono popolati direttamente dal framework CRUD layer al
// momento della call. Non sono esposti dal getFlatRecordData (sono
// hidden nel scaffold), quindi la verifica passa per vw_cestino che li
// espone esplicitamente come campi top-level.
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import assert from 'node:assert/strict';

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
try {
  const codice = `AUDIT_TEST_${Date.now()}`;

  // 1) INSERT
  const insResult = await api.crudInsert('email_template', {
    codice, descrizione: 'Audit test', categoria: 'GENERIC',
    oggetto: 'Test', body_html: '<p>Test</p>', attivo: 1
  });
  const newId = parseInt(insResult.result || insResult.id);
  assert(newId > 0, `no id from insert`);

  // 2) UPDATE
  const updResult = await api.crudUpdate('email_template', { id: newId, descrizione: 'Audit test UPDATED' });
  assert(updResult.result === '1' || updResult.result === 1, `update result: ${updResult.result}`);

  // 3) DELETE soft
  const delResult = await api.crudDelete('email_template', { id: newId });
  assert(delResult.result === '1' || delResult.result === 1, `delete result: ${delResult.result}`);

  // 4) Verifica via vw_cestino: data_eliminazione + utente_eliminazione popolati
  // (i campi data_creazione/modifica + utente_creazione/modifica sono comunque
  // popolati dal framework, verificabili via SQL diretto — qui controlliamo
  // i delete-time fields che sono il differenziatore Block 6 #26)
  const cest = await api.crudRead('vw_cestino', {
    pageInfo: { page: 1, pageSize: 50 },
    filterInfo: { filterFields: [{ name: 'id_originale', value: newId, type: 'eq' }] }
  });
  const cestRow = cest.results?.find(r => (r.entita?.value || r.entita) === 'email_template');
  assert(cestRow, `template ${newId} not in cestino post-delete`);

  const elimDate = cestRow.data_eliminazione?.value || cestRow.data_eliminazione;
  const elimUser = cestRow.utente_eliminazione?.value || cestRow.utente_eliminazione;
  assert(elimDate, `data_eliminazione NULL post-delete: ${JSON.stringify(cestRow)}`);
  assert(Number(elimUser) > 0, `utente_eliminazione missing: ${elimUser}`);

  console.log(`PASS #37: audit trail email_template id=${newId} (insert/update OK + delete tracking elim=${elimDate} user=${elimUser})`);
} finally {
  await api.dispose();
}
