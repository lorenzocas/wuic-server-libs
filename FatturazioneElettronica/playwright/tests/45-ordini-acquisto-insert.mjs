/**
 * Test 45: insert end-to-end ORDINI DI ACQUISTO via UI.
 * Documento emesso verso fornitore -> autoCompose=true.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '45',
  name: 'Ordini acquisto - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'ordini_acquisto',
    route: 'ordini_acquisto',
    progField: 'progressivo',
    autoComposeNumero: true,
    hasSerie: false,
    counterpartyField: 'fornitore_id',
    counterpartySearchTerm: 'Bianchi',
    counterpartyOptionRegex: /Bianchi/i,
    testFilePrefix: '45-ordini-acquisto'
  });
}
