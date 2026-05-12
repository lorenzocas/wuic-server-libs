/**
 * Test 10 — endpoint custom POST /api/Reporting/ReportCostiMezzo
 *
 * Verifica:
 * - 401 senza auth (raw fetch senza cookie)
 * - 200 con admin_test_2 via api.endpoint() (cookie auto-propagato)
 * - body coerente: count > 0, costo_totale = manutenzioni + carburante + sinistri
 */
import { query } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '10',
  name: 'Controller Reporting.ReportCostiMezzo'
};

export async function run(ctx) {
  const url = `${ctx.backendBaseUrl}/api/Reporting/ReportCostiMezzo`;

  // 1) 401 senza cookie
  const noAuth = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mezzo_id: 0 })
  });
  ctx.assert(noAuth.status === 401, `senza auth atteso 401, ricevuto ${noAuth.status}`);
  ctx.log('401 senza auth: OK');

  // 2) 200 con cookie admin_test_2 (api.endpoint usa requestContext autenticato)
  const body = await ctx.api.endpoint('/api/Reporting/ReportCostiMezzo', {
    method: 'POST',
    body: { mezzo_id: 0 }
  });
  ctx.assert(body.ok === true, `body.ok=${body.ok}`);
  ctx.assert(Array.isArray(body.results), 'body.results non e\' array');
  ctx.log(`count=${body.count} mezzi`);
  ctx.assert(body.count >= 1, `atteso >=1 mezzo nel report, ricevuto ${body.count}`);

  // 3) Sanity check: somma componenti = totale
  for (const r of body.results) {
    const sum = parseFloat(r.costo_manutenzioni || 0) + parseFloat(r.costo_carburante || 0) + parseFloat(r.costo_sinistri || 0);
    const tot = parseFloat(r.costo_totale || 0);
    ctx.assert(Math.abs(sum - tot) < 0.01, `mezzo ${r.targa}: sum=${sum} != tot=${tot}`);
  }

  // 4) Cross-check SQL sul top mezzo
  const top = body.results[0];
  if (top) {
    const sqlRow = await query(`
      SELECT ISNULL(SUM(importo), 0) AS tot FROM (
        SELECT costo AS importo FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0 AND mezzo_id = ${top.mezzo_id}
        UNION ALL SELECT costo_totale FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0 AND mezzo_id = ${top.mezzo_id}
        UNION ALL SELECT costo_stimato FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0 AND mezzo_id = ${top.mezzo_id}
      ) u
    `);
    const sqlTot = parseFloat(sqlRow[0].tot);
    const apiTot = parseFloat(top.costo_totale);
    ctx.assert(Math.abs(sqlTot - apiTot) < 0.01, `top mezzo ${top.targa}: SQL tot=${sqlTot} vs API tot=${apiTot}`);
    ctx.log(`top mezzo ${top.targa}: costo_totale=${apiTot} (SQL match OK)`);
  }

  return { count: body.count, top: top?.targa };
}
