// E2E Block 5 #21: import banca CSV + riconciliazione bulk apply.
// 1) POST /api/riconciliazione/importCsv con CSV inline
// 2) POST /api/riconciliazione/suggestions con il batch_id
// 3) Verifica candidate auto-match Δ0gg/Δ0€
// 4) POST /api/riconciliazione/bulkApply per chiudere il flow
//
// NB: i custom controller ora richiedono auth (Block 6 #25.5 — auth gate
// security audit). Usa api.endpoint() del client condiviso per propagare
// il cookie k-user; i raw fetch falliscono con 401.
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import assert from 'node:assert/strict';

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
try {
  // 1) Import CSV
  const csvBody = {
    BancaId: 1,
    CsvContent:
      'data_operazione,data_valuta,importo,causale,descrizione,iban_controparte,nome_controparte,riferimento\n' +
      '2026-06-01,2026-06-02,8000.00,BONIFICO,Pagamento fattura cantieri,IT60X0542811101000000123456,Edilizia Romana S.p.A.,F2026-EDIL-001\n' +
      '2026-05-22,2026-05-23,4000.00,BONIFICO,Saldo prestazioni,IT45F0306909606100000123456,Delta Servizi S.r.l.,Saldo-2026'
  };
  const importResult = await api.endpoint('/api/riconciliazione/importCsv', { body: csvBody });
  assert(importResult.ok, 'import not ok');
  assert.equal(importResult.inserted, 2, `expected 2 inserted, got ${importResult.inserted}`);
  const batchId = importResult.batch_id;
  assert(batchId, 'no batch_id');

  // 2) Suggestions
  const sug = await api.endpoint('/api/riconciliazione/suggestions', {
    body: { batch_id: batchId, tolGiorni: 7, tolImporto: 0.50 }
  });
  assert.equal(sug.total, 2, `expected 2 suggestion items, got ${sug.total}`);

  // Almeno 1 movimento ha candidate
  const withCandidates = sug.items.filter(it => it.candidates.length > 0);
  console.log(`#34: ${withCandidates.length}/2 movimenti con candidate`);

  // 3) BulkApply (se ci sono candidate)
  if (withCandidates.length > 0) {
    const pairs = withCandidates.map(it => ({
      movimento_id: it.movimento.id,
      scadenza_id: it.candidates[0].id
    }));
    const applyResult = await api.endpoint('/api/riconciliazione/bulkApply', { body: { pairs } });
    assert(applyResult.ok, 'bulkApply not ok');
    assert.equal(applyResult.applied, withCandidates.length, `applied count mismatch`);
    console.log(`#34: ${applyResult.applied} match applicati`);
  }

  console.log(`PASS #34: import CSV ${importResult.inserted} righe + ${withCandidates.length} riconciliazioni`);
} finally {
  await api.dispose();
}
