/**
 * Test 42: insert end-to-end ORDINI via UI.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '42',
  name: 'Ordini - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'ordini',
    route: 'ordini',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: false,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '42-ordini'
  });
}
