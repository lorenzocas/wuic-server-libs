/**
 * Test 11 — permessi readonly su anagrafica mezzi.
 * Verifica via API: con utente readonly_test, crudInsert su mezzi fallisce 4xx.
 */
import { createBackendApiClient } from '../_shared/api-client.mjs';

export const meta = { id: '11', name: 'Permessi readonly: insert mezzi NEGATO' };

export async function run(ctx) {
  const { backendBaseUrl, assert, log } = ctx;

  // API client con utente readonly_test
  const ro = await createBackendApiClient({
    backendBaseUrl,
    user: 'readonly_test',
    password: 'Test123!'
  });
  log('readonly_test logged in');

  let denied = false;
  try {
    await ro.crudInsert('mezzi', {
      targa: 'AA000ZZ',
      marca: 'TestRO',
      modello: 'TestRO',
      anno: 2024
    });
  } catch (e) {
    denied = true;
    log(`insert fallito (atteso): ${e.message?.slice(0, 150)}`);
  } finally {
    await ro.dispose();
  }
  assert(denied, 'readonly_test NON ha ricevuto rejection sull\'insert mezzi');

  return { denied };
}
