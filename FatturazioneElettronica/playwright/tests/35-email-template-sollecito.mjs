// E2E Block 5 #23: email template + sollecito batch.
// Verifica: 4 template seed + send-from-template + send-sollecito-batch dryRun.
import { createBackendApiClient } from 'file:///C:/src/Wuic/KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';
import assert from 'node:assert/strict';

const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100', user: 'admin_test', password: 'Test123!' });
try {
  // 1) Template seed presenti
  const tpl = await api.crudRead('email_template', { pageInfo: { page: 1, pageSize: 50 } });
  assert(tpl.TotalRecords >= 4, `expected ≥4 template, got ${tpl.TotalRecords}`);

  // 2) send-from-template (Controller custom — admin gate)
  const result = await api.endpoint('/api/email/send-from-template', {
    body: { TemplateCodice: 'FATTURA_EMESSA_DEFAULT', FatturaId: 178, RecipientOverride: 'test@example.com' }
  });
  assert(result.ok, 'send-from-template not ok');
  assert(result.subject?.includes('Fattura'), 'subject substitution failed');

  // 3) Sollecito batch dry-run (admin gate)
  const batch = await api.endpoint('/api/email/send-sollecito-batch', {
    body: { GiorniScadutoMin: 1, MaxBatch: 50, DryRun: true }
  });
  assert(batch.ok && batch.dry_run);

  console.log(`PASS #35: ${tpl.TotalRecords} template + send singolo + sollecito ${batch.scadenze_processate} scadenze (dry)`);
} finally {
  await api.dispose();
}
