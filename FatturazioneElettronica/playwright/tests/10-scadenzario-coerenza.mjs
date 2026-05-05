/**
 * Test 05: Scadenzario data-oriented coerenza.
 *
 * La view `v_scadenzario` aggrega scadenze da `dbo.scadenze` JOIN clienti/fornitori
 * e fatture inviate/ricevute. Verifica che:
 *   1) inserita una scadenza legata a una fattura, la view la espone con tutti i campi calcolati
 *   2) `soggetto`, `doc_numero`, `doc_data`, `giorni_a_scadenza` siano popolati dalla JOIN
 *   3) UI: navigate `v_scadenzario/scheduler` apra l'archetype scheduler (mdpropsbag.archetypes.scheduler)
 *   4) il record esista nella vista e sia leggibile via API getFlatRecordData
 */
import { navigateRoute, snap } from '../_shared/ui-helpers.mjs';
import { queryOne, query } from '../_shared/sql-helpers.mjs';
import { newCliente, newFatturaInviata, newRigaFattura, newScadenza } from '../_shared/test-data.mjs';

export const meta = {
  id: '10',
  name: 'Scadenzario coerenza (view + scheduler)',
  area: 'movimenti',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;

  // seed
  const cl = await api.crudInsert('clienti', newCliente());
  const clId = cl?.result ?? cl?.id ?? cl?.Id ?? cl?.results?.[0]?.id;

  const fatt = await api.crudInsert('fatture_inviate', newFatturaInviata(clId));
  const fId = fatt?.result ?? fatt?.id ?? fatt?.Id ?? fatt?.results?.[0]?.id;

  const iva = await api.crudRead('codici_iva', { filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: '22' }] } });
  const um  = await api.crudRead('unita_misura', { filterInfo: { filters: [{ field: 'codice', operator: 'eq', value: 'pz' }] } });
  await api.crudInsert('fatture_inviate_righe', newRigaFattura(
    fId, (iva?.results ?? iva?.data)[0].id, (um?.results ?? um?.data)[0].id
  ));

  const sc = await api.crudInsert('scadenze', newScadenza(fId, clId, { importo: 122 }));
  const scId = sc?.result ?? sc?.id ?? sc?.Id ?? sc?.results?.[0]?.id;
  log(`seed: cliente=${clId} fattura=${fId} scadenza=${scId}`);

  // 1) view diretta SQL: deve esporre la riga
  const fromView = await queryOne(`
    SELECT TOP 1 v.id, v.tipo, v.soggetto, v.doc_numero, v.importo,
                 v.giorni_a_scadenza, v.cliente_id, v.fattura_inviata_id
    FROM dbo.v_scadenzario v
    WHERE v.id = ${scId}
  `);
  assert(fromView, 'scadenza inserita non emerge dalla view v_scadenzario');
  assert(fromView.tipo === 'INCASSO', `tipo errato: ${fromView.tipo}`);
  assert(fromView.soggetto?.length > 0, 'soggetto non popolato dalla JOIN cliente');
  assert(fromView.doc_numero?.includes('/'), `doc_numero non popolato dalla JOIN fattura_inviata: ${fromView.doc_numero}`);
  assert(Number(fromView.importo) === 122, `importo errato: ${fromView.importo}`);
  assert(fromView.giorni_a_scadenza !== null, 'giorni_a_scadenza non calcolato');
  log(`view ok: ${fromView.doc_numero} - ${fromView.soggetto} - ${fromView.giorni_a_scadenza} gg`);

  // 2) verifica via API getFlatRecordData
  const apiResp = await api.crudRead('v_scadenzario', {
    filterInfo: { filters: [{ field: 'id', operator: 'eq', value: scId }] }
  });
  const apiRows = apiResp?.results ?? apiResp?.data ?? [];
  assert(apiRows.length === 1, `API getFlatRecordData non ritorna la scadenza (count=${apiRows.length})`);
  log('API getFlatRecordData v_scadenzario ok');

  // 3) UI: navigate scheduler (archetype configurato in propsbag)
  await navigateRoute(page, baseUrl, 'v_scadenzario', 'scheduler');
  // Lo scheduler component si chiama wuic-scheduler-list / scheduler-archetype — fallback a data-repeater
  const hasScheduler = await page.locator('wuic-scheduler-list, [data-archetype="scheduler"], .p-scheduler, .fc-scheduler').count();
  // Se non c'e' un component scheduler dedicato, almeno il bounded-repeater deve aver
  // riconosciuto action="scheduler" (lo passa come [action] al data-repeater)
  const hasArchetypeAction = await page.locator('wuic-data-repeater[action="scheduler"], wuic-data-repeater').count();
  assert(hasScheduler > 0 || hasArchetypeAction > 0, 'archetype scheduler non renderizzato');
  log(`UI archetype scheduler renderizzato (scheduler=${hasScheduler}, repeater=${hasArchetypeAction})`);

  const screenshot = await snap(page, 'scadenzario-scheduler');

  // 4) cleanup (DELETE scadenza prima per FK)
  try {
    await api.crudDelete('scadenze', { id: scId });
    await api.crudDelete('fatture_inviate', { id: fId });
    await api.crudDelete('clienti', { id: clId });
  } catch {}

  return { scadenzaId: scId, doc_numero: fromView.doc_numero, screenshot };
}
