import { runCrudFlow } from '../_shared/anagrafica-crud-flow.mjs';
import { exec } from '../_shared/sql-helpers.mjs';

export const meta = { id: '02', name: 'CRUD UI conducenti', needsUi: true };

export async function cleanup(ctx) {
  await exec("DELETE FROM dbo.conducenti WHERE codice_fiscale = N'_E2ECF02ZZZZZZZZ'");
}

export async function run(ctx) {
  return runCrudFlow(ctx, {
    route: 'conducenti',
    textFields: {
      nome: 'TestNome',
      cognome: 'CognomeE2E',
      codice_fiscale: '_E2ECF02ZZZZZZZZ',
      telefono: '+39 333 0000002',
      email: 'e2e02@flotta.local'
    },
    filterField: 'codice_fiscale',
    editField: 'cognome',
    editValue: 'CognomeE2E EDITED'
  });
}
