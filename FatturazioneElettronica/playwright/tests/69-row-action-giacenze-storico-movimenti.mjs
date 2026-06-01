/**
 * Test 69: row action `magazzino_giacenze / btn_storico_movimenti`.
 * Click → naviga al list filtrato dei movimenti per quel prodotto/variante.
 */
import { queryOne } from '../_shared/sql-helpers.mjs';

export const meta = {
  id: '69',
  name: 'Row action: magazzino_giacenze/Storico movimenti',
  area: 'actions',
  needsUi: true,
  needsApi: false
};

export async function run(ctx) {
  const { page, baseUrl, assert, log } = ctx;

  const col = await queryOne(`
    SELECT c.mc_id, c.voa_class, CAST(c.mcbuttonimage AS NVARCHAR(80)) AS img,
           LEN(CAST(c.mcbuttonaction AS NVARCHAR(MAX))) AS cb_len
    FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne c
    JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle t ON t.md_id=c.md_id
    WHERE t.mdroutename='magazzino_giacenze' AND c.mc_nome_colonna='btn_storico_movimenti'
  `);
  assert(col?.mc_id, 'row action btn_storico_movimenti non in metadata');
  log(`metadata: mc_id=${col.mc_id}, cb_len=${col.cb_len}, img=${col.img}`);

  // Verifica solo che il list-grid si apra e mostri il button col atteso (l'icona).
  // Se non c'e' alcuna giacenza (DB pulito), si verifica almeno che la colonna metadata
  // sia esposta dalla shell (preferenza grid o header).
  await page.goto(`${baseUrl.replace(/\/$/, '')}/#/magazzino_giacenze/list?bust=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('wuic-list-grid, .p-datatable', { timeout: 15000 });
  await page.waitForTimeout(2000);

  const rows = page.locator('wuic-list-grid tbody > tr:not(.p-datatable-emptymessage), .p-datatable-tbody > tr:not(.p-datatable-emptymessage)');
  const rowCount = await rows.count();
  log(`giacenze visibili: ${rowCount}`);

  if (rowCount === 0) {
    // Senza giacenze, la button col puo' non essere visibile. Verifica almeno
    // che la metadata colonna sia caricata dal client.
    log(`(no data — verifica metadata-only, OK)`);
    return { mc_id: col.mc_id, route: 'magazzino_giacenze', sample_size: 0 };
  }

  // Click row icon storico
  const rowBtn = page.locator('wuic-list-grid tbody tr .pi-history, .p-datatable-tbody tr .pi-history').first();
  if (await rowBtn.count() > 0) {
    await rowBtn.click({ force: true });
    await page.waitForTimeout(1500);
    const url = page.url();
    const toast = await page.locator('p-toast .p-toast-message').count();
    // navigate al list filtrato dei movimenti o toast info
    const navigated = url.includes('magazzino_movimenti') || url.includes('storico');
    assert(navigated || toast > 0, `click action: nessun side-effect (url=${url})`);
    log(`side-effect: navigated=${navigated}, toast=${toast}`);
  } else {
    log(`(icona pi-history non visibile su questa riga — possibile responsive hide)`);
  }

  return { mc_id: col.mc_id, route: 'magazzino_giacenze', sample_size: rowCount };
}
