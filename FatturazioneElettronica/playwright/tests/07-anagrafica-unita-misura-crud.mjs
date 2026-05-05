/**
 * Test 07: Anagrafica Unità di Misura — CRUD UI + SELECT verify.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '07',
  name: 'Anagrafica Unita misura CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const codice = `e2e${RUN_ID.slice(-4)}`.slice(0, 10);
  const desc = `UM E2E ${RUN_ID}`;
  return runAnagraficaCrud(ctx, {
    route: 'unita_misura',
    data: {
      codice,
      descrizione: desc
    },
    displayField: 'descrizione',
    editField: 'descrizione',
    editValue: `${desc} V2`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('unita_misura', {
      filterInfo: { filters: [{ field: 'codice', operator: 'startsWith', value: 'e2e' }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('unita_misura', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
