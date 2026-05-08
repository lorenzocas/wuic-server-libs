/**
 * Test 41: insert end-to-end PREVENTIVI via UI.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '41',
  name: 'Preventivi - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'preventivi',
    route: 'preventivi',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: false,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '41-preventivi'
  });
}
