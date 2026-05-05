/**
 * Test 02: Anagrafica Fornitori — CRUD UI + SELECT verify.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { newFornitore, PREFIX } from '../_shared/test-data.mjs';

export const meta = {
  id: '02',
  name: 'Anagrafica Fornitori CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const f = newFornitore();
  return runAnagraficaCrud(ctx, {
    route: 'fornitori',
    data: f,
    displayField: 'ragione_sociale',
    editField: 'ragione_sociale',
    editValue: `${f.ragione_sociale} V2`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('fornitori', {
      filterInfo: { filters: [{ field: 'codice', operator: 'startsWith', value: PREFIX }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('fornitori', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
