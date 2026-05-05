/**
 * Test 05: Anagrafica Modalità di Pagamento — CRUD UI + SELECT verify.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '05',
  name: 'Anagrafica Pagamenti CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const desc = `Bonifico E2E ${RUN_ID}`;
  return runAnagraficaCrud(ctx, {
    route: 'pagamenti',
    data: {
      codice_sdi: 'MP05',
      descrizione: desc,
      tipo_scadenza: 'DF'
    },
    numberFields: [
      { field: 'giorni_scadenza', value: 30 },
      { field: 'n_rate', value: 1 }
    ],
    displayField: 'descrizione',
    editField: 'descrizione',
    editValue: `${desc} V2`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('pagamenti', {
      filterInfo: { filters: [{ field: 'descrizione', operator: 'startsWith', value: 'Bonifico E2E' }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('pagamenti', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
