/**
 * Test 43: insert end-to-end DDT via UI.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '43',
  name: 'DDT - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'ddt',
    route: 'ddt',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: false,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '43-ddt'
  });
}
