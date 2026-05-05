/**
 * Test 03: Anagrafica Prodotti — CRUD UI + SELECT verify.
 * Include selezione dropdown FK su unita_misura + codici_iva.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { newProdotto, PREFIX } from '../_shared/test-data.mjs';

export const meta = {
  id: '03',
  name: 'Anagrafica Prodotti CRUD (con dropdown FK)',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const p = newProdotto();
  return runAnagraficaCrud(ctx, {
    route: 'prodotti',
    data: p,
    displayField: 'descrizione',
    editField: 'descrizione',
    editValue: `${p.descrizione} V2`,
    // FK lookup — usa selectLookupOption del framework (edit-form-e2e-utils).
    // Optional label = testo visibile nella display string del record lookup.
    lookups: [
      { field: 'unita_misura_id', optionLabel: 'Pezzi' },
      { field: 'codice_iva_id', optionLabel: '22' }
    ]
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('prodotti', {
      filterInfo: { filters: [{ field: 'codice', operator: 'startsWith', value: PREFIX }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('prodotti', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
