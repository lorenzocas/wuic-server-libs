// E2E Block 5 #22: Export contabilità Profis primanota.
// Verifica endpoint backend GET /api/contabilita/export-primanota
// → ritorna flat-file pipe-delimited con header + N righe (V vendite + A acquisti).
//
// Auth: l'endpoint richiede cookie k-user (Block 6 auth gate).
// Usa api.endpoint con method:'GET' e json:false per leggere il flat file.
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import assert from 'node:assert/strict';

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
try {
  const text = await api.endpoint('/api/contabilita/export-primanota?anno=2026&mese=0&tipo=TUTTI', {
    method: 'GET',
    json: false
  });
  const lines = text.split('\n').filter(l => l.trim());
  assert(lines.length >= 2, `expected at least 2 lines (header + 1 row), got ${lines.length}`);

  // Header check
  assert(lines[0].includes('TIPO|DATA|NUMERO'), 'header malformed');
  assert(lines[0].includes('IMPONIBILE|IVA|TOTALE'), 'header missing imponibile/iva/totale');

  // Almeno una riga V (vendita) o A (acquisto)
  const dataRows = lines.slice(1);
  const venditeCount = dataRows.filter(l => l.startsWith('V|')).length;
  const acquistiCount = dataRows.filter(l => l.startsWith('A|')).length;
  assert(venditeCount > 0 || acquistiCount > 0, 'no V or A rows');

  console.log(`PASS #33: ${lines.length} righe (${venditeCount} V + ${acquistiCount} A)`);
} finally {
  await api.dispose();
}
