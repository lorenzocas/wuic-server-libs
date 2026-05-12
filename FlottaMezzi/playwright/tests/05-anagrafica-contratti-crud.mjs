import { runCrudFlow } from '../_shared/anagrafica-crud-flow.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = { id: '05', name: 'CRUD UI contratti assicurativi', needsUi: true };

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.contratti_assicurativi WHERE numero_polizza = N'_E2E_POL_05'");
}

export async function run(ctx) {
  return runCrudFlow(ctx, {
    route: 'contratti_assicurativi',
    textFields: {
      compagnia: 'TestAssicurazioni E2E',
      numero_polizza: '_E2E_POL_05',
      tipo_copertura: 'RC',
      broker: 'BrokerE2E'
    },
    dateFields: {
      data_inizio: '2026-01-01',
      data_scadenza: '2027-01-01'
    },
    numberFields: {
      costo_annuo: 850.00
    },
    lookups: [{ field: 'mezzo_id', optionLabel: 'AB123CD' }],
    filterField: 'numero_polizza',
    editField: 'broker',
    editValue: 'BrokerE2E EDITED'
  });
}
