/**
 * Test 06: Anagrafica Codici IVA — CRUD UI + SELECT verify.
 */
import { runAnagraficaCrud } from '../_shared/anagrafica-crud-flow.mjs';
import { RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '06',
  name: 'Anagrafica Codici IVA CRUD',
  area: 'anagrafiche',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const codice = `_e2e${RUN_ID.slice(-4)}`.slice(0, 10);
  const desc = `IVA E2E ${RUN_ID}`;
  return runAnagraficaCrud(ctx, {
    route: 'codici_iva',
    data: {
      codice,
      descrizione: desc
    },
    numberFields: [{ field: 'aliquota', value: 10 }],
    displayField: 'descrizione',
    editField: 'descrizione',
    editValue: `${desc} V2`
  });
}

export async function cleanup(ctx) {
  try {
    const all = await ctx.api.crudRead('codici_iva', {
      filterInfo: { filters: [{ field: 'codice', operator: 'startsWith', value: '_e2e' }] }
    });
    for (const r of (all?.results ?? all?.data ?? [])) {
      try { await ctx.api.crudDelete('codici_iva', { id: r.id ?? r.Id }); } catch {}
    }
  } catch {}
}
