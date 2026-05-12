import { createBackendApiClient } from './_shared/backend-api-client.mjs';
const api = await createBackendApiClient({ backendBaseUrl: 'http://localhost:5100' });
try {
  const r = await api.invalidateMetadataRuntime();
  console.log('invalidate:', JSON.stringify(r));
  const v = await api.call('MetaService.getProjectMetadataVersion', {});
  console.log('version:', JSON.stringify(v));
} finally { await api.dispose(); }
