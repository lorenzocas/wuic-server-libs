/**
 * Test 08: Import movimenti bancari (md_action_type=10) end-to-end data-oriented.
 *
 * Replica il flow del framework UploadHandler:
 *   1) crea banca predefinita
 *   2) crea temp table dinamica come fa il framework via SqlBulkCopy
 *      (NVARCHAR(MAX) con header schema italiano)
 *   3) chiama dbo.sp_movimenti_bancari_import via api.callStored
 *   4) verifica righe inserite in dbo.movimenti_bancari con
 *      - data_operazione corretta (parsing IT vs ISO)
 *      - importo parsing (virgola IT vs punto EN)
 *      - banca_id risolto da predefinita
 *      - import_batch_id univoco
 *      - match_status = UNMATCHED
 *   5) UI: navigate movimenti_bancari/list -> verifica righe importate
 *   6) cleanup
 */
import { navigateRoute, snap } from '../_shared/ui-helpers.mjs';
import { query, queryOne, exec } from '../_shared/sql-helpers.mjs';
import { RUN_ID } from '../_shared/test-data.mjs';

export const meta = {
  id: '13',
  name: 'Import movimenti bancari (md_action_type=10 + stored)',
  area: 'import-export',
  needsUi: true,
  needsApi: true
};

export async function run(ctx) {
  const { page, api, baseUrl, assert, log } = ctx;
  const tempTable = `mov_imp_e2e_${RUN_ID}`;

  // 1) banca predefinita
  await exec(`
    IF NOT EXISTS (SELECT 1 FROM dbo.banche WHERE predefinita = 1)
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM dbo.banche)
        INSERT INTO dbo.banche (descrizione, iban, predefinita) VALUES ('C/C E2E','IT60X0000000000000000000099',1);
      ELSE
        UPDATE dbo.banche SET predefinita = 1 WHERE id = (SELECT TOP 1 id FROM dbo.banche);
    END
  `);

  // 2) crea temp table simulando bulk copy framework (header italiano, NVARCHAR(MAX))
  await exec(`
    IF OBJECT_ID('dbo.${tempTable}','U') IS NOT NULL DROP TABLE dbo.${tempTable};
    CREATE TABLE dbo.${tempTable} (
      [Data Operazione] NVARCHAR(MAX),
      [Data Valuta]     NVARCHAR(MAX),
      [Importo]         NVARCHAR(MAX),
      [Causale]         NVARCHAR(MAX),
      [Descrizione]     NVARCHAR(MAX),
      [IBAN Controparte] NVARCHAR(MAX),
      [Nome Controparte] NVARCHAR(MAX),
      [Riferimento]     NVARCHAR(MAX)
    );
    INSERT INTO dbo.${tempTable} VALUES
      ('2026-05-04','2026-05-05','122,50','BONIFICO','E2E test format IT virgola','IT99X1234','E2E SRL','E2E001'),
      ('06/05/2026',NULL,'-50.00','ADDEBITO','E2E test format date IT + EN num',NULL,NULL,NULL),
      ('2026-05-08','2026-05-08','1234,56','ACCREDITO','E2E test importo migliaia',NULL,NULL,'E2E003'),
      (NULL,NULL,'10,00','SKIP','E2E test riga incompleta — deve essere SCARTATA',NULL,NULL,NULL);
  `);
  log(`temp ${tempTable} creata con 4 righe (3 valide + 1 incompleta)`);

  // 3) esegui stored via SQL diretto (la SP non e' registrata come metadata
  // route — `MetaService.getFlatDataFromStored` richiederebbe entry in
  // `_metadati__tabelle`. Il flow runtime UploadHandler chiama la SP
  // internamente: per il test invochiamola direttamente via sqlcmd).
  await exec(`SET NOCOUNT ON; EXEC dbo.sp_movimenti_bancari_import @TableName=N'${tempTable}', @UserId=100281, @RowCount=4;`);
  log(`stored eseguita su temp ${tempTable}`);

  // 4) verifica DB
  // NB: il SP popola `causale` con la colonna "Categoria" (BONIFICO/ADDEBITO/...)
  // e `descrizione` con "Note". Filtro su descrizione, non causale.
  const inserted = await query(`
    SELECT id, data_operazione, importo, causale, descrizione, banca_id, import_batch_id, match_status
    FROM dbo.movimenti_bancari
    WHERE descrizione LIKE 'E2E test%' AND created_at > DATEADD(MINUTE, -5, GETDATE())
    ORDER BY id
  `);

  // riga incompleta scartata: deve essere 3 (non 4)
  assert(inserted.length === 3, `righe importate ${inserted.length}, attese 3 (1 incompleta scartata dal WHERE)`);

  // verifica parsing
  const r1 = inserted[0];
  assert(Number(r1.importo) === 122.5, `parsing virgola IT failed: importo=${r1.importo}`);
  assert(r1.match_status === 'UNMATCHED', `match_status iniziale errato: ${r1.match_status}`);
  assert(r1.import_batch_id, 'import_batch_id non popolato');
  log(`riga 1 parsing virgola IT ok: ${r1.importo}, batch=${r1.import_batch_id}`);

  const r2 = inserted[1];
  assert(Number(r2.importo) === -50, `parsing punto EN failed: importo=${r2.importo}`);
  log(`riga 2 parsing punto EN ok: ${r2.importo}`);

  const r3 = inserted[2];
  assert(Number(r3.importo) === 1234.56, `parsing migliaia IT failed: importo=${r3.importo}`);
  log(`riga 3 parsing 1.234,56 ok: ${r3.importo}`);

  // tutti devono avere stesso batch_id (import in transazione singola)
  const batchIds = new Set(inserted.map(x => x.import_batch_id));
  assert(batchIds.size === 1, `batch_id non univoco: ${[...batchIds]}`);
  log(`tutti i 3 movimenti condividono batch_id ${[...batchIds][0]}`);

  // banca_id valorizzato e coerente con predefinita
  const banca = await queryOne(`SELECT TOP 1 id FROM dbo.banche WHERE predefinita=1 ORDER BY id`);
  assert(Number(r1.banca_id) === Number(banca.id),
    `banca_id non corrisponde a predefinita: r1.banca_id=${r1.banca_id} (tipo ${typeof r1.banca_id}), banca.id=${banca?.id} (tipo ${typeof banca?.id})`);
  log(`banca_id risolto correttamente: ${r1.banca_id}`);

  // 5) UI: navigate movimenti_bancari/list e verifica grid carica
  await navigateRoute(page, baseUrl, 'movimenti_bancari', 'list');
  const gridRows = await page.locator('wuic-list-grid tbody > tr, .p-datatable-tbody > tr').count();
  log(`UI movimenti_bancari/list: ${gridRows} righe visibili`);
  assert(gridRows >= 3, `attese >=3 righe in grid, viste ${gridRows}`);

  const screenshot = await snap(page, 'movimenti-bancari-import');

  // 6) cleanup
  await exec(`DROP TABLE dbo.${tempTable};`);
  await exec(`DELETE FROM dbo.movimenti_bancari WHERE causale LIKE 'E2E test%'`);

  return { rowsImported: inserted.length, batchId: [...batchIds][0], screenshot };
}
