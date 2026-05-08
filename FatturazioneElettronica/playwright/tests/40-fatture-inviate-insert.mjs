/**
 * Test 40: insert end-to-end FATTURE INVIATE via UI.
 * Vedi `_shared/document-insert-flow.mjs` per il flow completo.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '40',
  name: 'Fatture inviate - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'fatture_inviate',
    route: 'fatture_inviate',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: true,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '40-fatture-inviate'
  });
}
