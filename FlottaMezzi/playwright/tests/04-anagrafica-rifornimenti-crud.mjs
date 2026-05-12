import { runCrudFlow } from '../_shared/anagrafica-crud-flow.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = { id: '04', name: 'CRUD UI rifornimenti', needsUi: true };

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.rifornimenti WHERE distributore = N'_E2E_DIST_04'");
}

export async function run(ctx) {
  return runCrudFlow(ctx, {
    route: 'rifornimenti',
    textFields: {
      distributore: '_E2E_DIST_04'
    },
    dateFields: {
      data_field: '2026-05-09'
    },
    numberFields: {
      litri: 35.5,
      costo_totale: 65.20,
      prezzo_litro: 1.836,
      km_veicolo: 38000
    },
    lookups: [{ field: 'mezzo_id', optionLabel: 'AB123CD' }],
    filterField: 'distributore',
    editField: 'distributore',
    editValue: '_E2E_DIST_04_EDIT'
  });
}
