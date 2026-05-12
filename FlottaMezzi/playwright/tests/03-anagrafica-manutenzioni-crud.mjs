import { runCrudFlow } from '../_shared/anagrafica-crud-flow.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = { id: '03', name: 'CRUD UI manutenzioni', needsUi: true };

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.manutenzioni WHERE fattura_numero = N'_E2E_FT_03'");
}

export async function run(ctx) {
  return runCrudFlow(ctx, {
    route: 'manutenzioni',
    textFields: {
      descrizione: 'Manutenzione test E2E 03',
      officina: 'Officina E2E',
      fattura_numero: '_E2E_FT_03'
    },
    dateFields: {
      // data_field: friendly key per la SQL col `data` (rename framework)
      data_field: '2026-05-09'
    },
    numberFields: {
      costo: 250.50,
      km_alla_manutenzione: 50000
    },
    lookups: [{ field: 'mezzo_id', optionLabel: 'AB123CD' }],
    filterField: 'fattura_numero',
    editField: 'descrizione',
    editValue: 'Manutenzione E2E EDITED'
  });
}
