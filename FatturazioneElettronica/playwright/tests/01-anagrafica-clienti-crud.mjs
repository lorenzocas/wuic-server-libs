/**
 * Test 01: Anagrafica Clienti — CRUD UI completo + SELECT verify in grid.
 *
 * Pattern centralizzato in _shared/anagrafica-crud-flow.mjs:
 *   1) UI navigate /clienti/list (action=list, archetype default)
 *   2) UI insert (+Nuovo, fill form, save)
 *   3) UI SELECT verify: riga visibile in grid
 *   4) API verify INSERT
 *   5) UI edit (dblclick + modify ragione_sociale + save)
 *   6) UI SELECT verify post-edit: riga con nuovo testo visibile
 *   7) API verify UPDATE
 *   8) API DELETE + UI SELECT verify rimossa
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { newCliente, PREFIX } from '../_shared/test-data.mjs';

export const meta = {
  id: '01',
  name: 'Anagrafica Clienti CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const cliente = newCliente();
  return runAnagraficaCrud(ctx, {
    route: 'clienti',
    data: cliente,
    displayField: 'ragione_sociale',
    editField: 'ragione_sociale',
    editValue: `${cliente.ragione_sociale} EDITED`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('clienti', {
      filterInfo: { filters: [{ field: 'codice', operator: 'startsWith', value: PREFIX }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('clienti', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
