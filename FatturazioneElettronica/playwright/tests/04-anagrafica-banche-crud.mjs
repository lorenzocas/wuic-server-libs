/**
 * Test 04: Anagrafica Banche — CRUD UI + SELECT verify.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '04',
  name: 'Anagrafica Banche CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const desc = `Banca E2E ${RUN_ID}`;
  return runAnagraficaCrud(ctx, {
    route: 'banche',
    data: {
      descrizione: desc,
      iban: `IT99X${RUN_ID}0000000000000000`.slice(0, 27),
      valuta: 'EUR',
      saldo_iniziale: 0
    },
    displayField: 'descrizione',
    editField: 'descrizione',
    editValue: `${desc} V2`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('banche', {
      filterInfo: { filters: [{ field: 'descrizione', operator: 'startsWith', value: 'Banca E2E' }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('banche', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
