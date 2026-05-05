/**
 * Wrapper sottile su `backend-api-client.mjs` del framework
 * (regola 26 AGENTS: SEMPRE usare quel client per chiamare il backend).
 *
 * Il file canonico vive in:
 *   ../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs
 *
 * Lo importiamo via path relativo cosi' i test e2e di questa app
 * restano allineati a qualsiasi fix/aggiornamento del client framework
 * senza copia stale. Se il path framework cambia, sistema **qui** —
 * il resto della suite non se ne accorge.
 */
import {
  createBackendApiClient,
  createE2ESession
} from '../../../KonvergenceCore/wwwroot/my-workspace/playwright/docs/_shared/backend-api-client.mjs';

export { createBackendApiClient, createE2ESession };
