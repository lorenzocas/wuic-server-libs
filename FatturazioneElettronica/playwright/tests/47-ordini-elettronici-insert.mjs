/**
 * Test 47: insert end-to-end ORDINI ELETTRONICI (NSO/PA ricevuti) via UI.
 *
 * Documento RICEVUTO dalla Pubblica Amministrazione: il `numero_pa` e' il
 * numero dato dalla PA (dato ESTERNO) -> autoCompose=false + compilazione
 * manuale del campo nel form. Il `progressivo_interno` resta auto-default.
 */
import { runDocumentInsertFlow } from '../_shared/document-insert-flow.mjs';

export const meta = {
  id: '47',
  name: 'Ordini elettronici - insert end-to-end via UI',
  area: 'documenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  await runDocumentInsertFlow(ctx, {
    label: 'ordini_elettronici',
    route: 'ordini_elettronici',
    progField: 'progressivo_interno',
    autoComposeNumero: false,
    manualNumeroField: 'numero_pa',
    hasSerie: false,
    counterpartyField: 'cliente_id',
    counterpartySearchTerm: 'Acme',
    counterpartyOptionRegex: /Acme\s+Forniture\s+S\.r\.l\.\s*$/i,
    testFilePrefix: '47-ordini-elettronici'
  });
}
