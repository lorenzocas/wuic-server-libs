/**
 * Test 46: insert end-to-end FATTURE RICEVUTE via UI.
 *
 * Documento RICEVUTO da fornitore: il `numero_fornitore` e' un dato
 * ESTERNO (numero della fattura del fornitore) -> autoCompose=false +
 * compilazione manuale del campo nel form prima del save.
 * Il `progressivo_interno` resta auto-default da sp_next_progressivo.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '46',
  name: 'Fatture ricevute - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'fatture_ricevute',
    route: 'fatture_ricevute',
    progField: 'progressivo_interno',
    autoComposeNumero: false,
    manualNumeroField: 'numero_fornitore',
    hasSerie: false,
    counterpartyField: 'fornitore_id',
    counterpartySearchTerm: 'Bianchi',
    counterpartyOptionRegex: /Bianchi/i,
    testFilePrefix: '46-fatture-ricevute'
  });
}
