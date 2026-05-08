/**
 * Test 44: insert end-to-end PROFORMA via UI.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '44',
  name: 'Proforma - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'proforma',
    route: 'proforma',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: false,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '44-proforma'
  });
}
