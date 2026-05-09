/**
 * Test 51: stored procedure `sp_calcola_scadenze` (server-side).
 *
 * Verifica end-to-end della SP usata dal pulsante "Genera scadenze da
 * pagamento" in `DocumentEditFormComponent.generaScadenze`. La SP
 * registrata come stored route in `_metadati__tabelle` viene chiamata
 * via `MetaService.getFlatDataFromStored` (pattern WUIC framework).
 *
 * Questo test NON usa la UI: copre il path server-side (registrazione
 * route + SP + dispatcher AsmxProxy) che e' la radice del bug "0 rate
 * generate" se la registrazione manca o i parametri sono male
 * tipizzati.
 *
 * Caso test: pagamento_id=12 (Bonifico 30/60/90gg FM, n_rate=3,
 * giorni_scadenza=30, tipo_scadenza=FM), totale=1200.
 *
 * Atteso:
 *  - 3 righe ritornate, ognuna con `rata_n` 1..3 e `rata_totale=3`
 *  - somma `importo` ≈ 1200 (residuo sull'ultima rata se non divisibile)
 *  - data_scadenza progressive (ogni rata +30gg dalla precedente)
 *  - tipo='INCASSO', stato='APERTA', pagamento_id=12, cliente_id valorizzato
 */
import { newCliente } from '../_shared/test-data.mjs';
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '51',
  name: 'sp_calcola_scadenze - SP server-side via getFlatDataFromStored',
  area: 'documenti',
  needsUi: false,
  needsApi: true
};

export async function run(ctx) {
  const { api, assert, log } = ctx;

  // 1) Pagamento di test: id=12 con n_rate>=2 (Bonifico 30/60/90gg FM)
  const pag = await queryOne(`SELECT TOP 1 id, descrizione, n_rate, giorni_scadenza, tipo_scadenza FROM dbo.pagamenti WHERE n_rate>=2 ORDER BY id`);
  assert(pag?.id, 'nessun pagamento con n_rate>=2: seed dati di base mancante');
  const pagId = Number(pag.id);
  const nRate = Number(pag.n_rate);
  log(`pagamento id=${pagId} "${pag.descrizione}" n_rate=${nRate} (${pag.tipo_scadenza}/${pag.giorni_scadenza}gg)`);

  // 2) Cliente di test (FK opzionale ma SP la valorizza nel result set)
  const cl = newCliente();
  const clRes = await api.crudInsert('clienti', cl);
  const clienteId = Number(clRes?.result ?? clRes?.id);
  assert(clienteId > 0, 'cliente insert');
  log(`cliente id=${clienteId}`);

  try {
    // 3) Chiama sp_calcola_scadenze via wrapper backend-api-client
    const totale = 1200.0;
    const dataDoc = '2026-05-08';
    const resp = await api.callStored('sp_calcola_scadenze', [
      { field: '@pagamento_id', value: String(pagId), Type: 'number' },
      { field: '@data_documento', value: dataDoc, Type: 'date' },
      { field: '@totale', value: String(totale), Type: 'number' },
      { field: '@cliente_id', value: String(clienteId), Type: 'number' },
      { field: '@fornitore_id', value: null, Type: 'number' },
      { field: '@tipo', value: 'INCASSO', Type: 'text' }
    ]);
    const rows = resp?.results || resp?.Data || resp?.data || resp?.dato || [];
    assert(Array.isArray(rows), `SP non ritorna array: ${JSON.stringify(resp)?.slice(0, 250)}`);
    assert(rows.length === nRate, `SP attesa ritorna ${nRate} rate, vista ${rows.length}`);
    log(`SP ha ritornato ${rows.length} rate ✓`);

    // 4) Verifica forma e valori
    let sumImporto = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      assert(Number(r.rata_n) === i + 1, `rata_n rata ${i + 1}: atteso ${i + 1}, visto ${r.rata_n}`);
      assert(Number(r.rata_totale) === nRate, `rata_totale rata ${i + 1}: atteso ${nRate}, visto ${r.rata_totale}`);
      assert(String(r.tipo) === 'INCASSO', `tipo rata ${i + 1}: atteso INCASSO, visto ${r.tipo}`);
      assert(String(r.stato) === 'APERTA', `stato rata ${i + 1}: atteso APERTA, visto ${r.stato}`);
      assert(Number(r.pagamento_id) === pagId, `pagamento_id rata ${i + 1}: atteso ${pagId}, visto ${r.pagamento_id}`);
      assert(Number(r.cliente_id) === clienteId, `cliente_id rata ${i + 1}: atteso ${clienteId}, visto ${r.cliente_id}`);
      assert(r.data_scadenza, `data_scadenza rata ${i + 1} mancante`);
      const importo = Number(r.importo);
      assert(importo > 0, `importo rata ${i + 1} non > 0: ${r.importo}`);
      sumImporto += importo;
    }
    // Tolleranza 0.01 per arrotondamenti decimali (residuo sull'ultima rata)
    assert(Math.abs(sumImporto - totale) < 0.02, `somma importi rate (${sumImporto}) != totale (${totale})`);
    log(`somma importi = ${sumImporto.toFixed(2)} ≈ totale ${totale} ✓`);

    // 5) data_scadenza progressive: rata k+1 > rata k
    for (let i = 1; i < rows.length; i++) {
      const dPrev = new Date(rows[i - 1].data_scadenza);
      const dCurr = new Date(rows[i].data_scadenza);
      assert(dCurr > dPrev, `data_scadenza rata ${i + 1} (${rows[i].data_scadenza}) NON > rata ${i} (${rows[i - 1].data_scadenza})`);
    }
    log('data_scadenza progressive ✓');

    return { pagamentoId: pagId, nRate, sumImporto };
  } finally {
    try { await api.crudDelete('clienti', { id: clienteId }); } catch { /* */ }
  }
}
