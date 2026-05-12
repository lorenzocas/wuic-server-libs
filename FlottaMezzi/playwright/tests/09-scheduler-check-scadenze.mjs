/**
 * Test 09 — endpoint scheduler /api/flotta/CheckScadenze
 *
 * Verifica: l'endpoint loopback chiamato dallo scheduler ritorna risultato
 * coerente con dati seedati. Nessuna auth richiesta (loopback by-design).
 */
import { query } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '09',
  name: 'Scheduler endpoint CheckScadenze'
};

export async function run(ctx) {
  const url = `${ctx.backendBaseUrl}/api/flotta/CheckScadenze`;
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  ctx.assert(resp.status === 200, `HTTP ${resp.status} (atteso 200)`);
  const body = await resp.json();
  ctx.assert(body.ok === true, `body.ok=${body.ok} (atteso true)`);
  ctx.assert(body.result, 'body.result mancante');
  ctx.log(`result: ${JSON.stringify(body.result)}`);

  // Cross-check via SQL diretta: i numeri devono coincidere
  const sql_check = await query(`
    SELECT
      (SELECT COUNT(*) FROM dbo.conducenti WHERE ISNULL(cancellato,0)=0
        AND scadenza_patente >= CAST(GETDATE() AS DATE)
        AND scadenza_patente <= DATEADD(day, 30, CAST(GETDATE() AS DATE))) AS patenti,
      (SELECT COUNT(*) FROM dbo.contratti_assicurativi WHERE ISNULL(cancellato,0)=0
        AND data_scadenza >= CAST(GETDATE() AS DATE)
        AND data_scadenza <= DATEADD(day, 30, CAST(GETDATE() AS DATE))) AS assicurazioni,
      (SELECT COUNT(*) FROM dbo.revisioni WHERE ISNULL(cancellato,0)=0
        AND scadenza_prossima >= CAST(GETDATE() AS DATE)
        AND scadenza_prossima <= DATEADD(day, 30, CAST(GETDATE() AS DATE))) AS revisioni
  `);
  const sql = sql_check[0];
  ctx.log(`SQL: patenti=${sql.patenti} assicurazioni=${sql.assicurazioni} revisioni=${sql.revisioni}`);

  ctx.assert(parseInt(body.result.patenti_30gg) === parseInt(sql.patenti),
    `patenti_30gg endpoint=${body.result.patenti_30gg} vs SQL=${sql.patenti}`);
  ctx.assert(parseInt(body.result.assicurazioni_30gg) === parseInt(sql.assicurazioni),
    `assicurazioni_30gg endpoint=${body.result.assicurazioni_30gg} vs SQL=${sql.assicurazioni}`);
  ctx.assert(parseInt(body.result.revisioni_30gg) === parseInt(sql.revisioni),
    `revisioni_30gg endpoint=${body.result.revisioni_30gg} vs SQL=${sql.revisioni}`);

  return body.result;
}
