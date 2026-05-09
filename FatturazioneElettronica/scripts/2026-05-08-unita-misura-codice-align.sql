-- 2026-05-08 — Allinea mc_ui_lookup_dataTextField = 'codice' su tutte le
-- colonne `unita_misura_id` (7 routes: prodotti + 6 row routes).
--
-- Razionale: il combo della lookup `prodotto_id` (fatture_inviate_righe e
-- altre row routes) ritorna l'oggetto correlato di `prodotti` con la chiave
-- joined `unita_misura___<textField>__unita_misura_id`, dove <textField>
-- viene preso dai metadata della colonna `prodotti.unita_misura_id`. Se la
-- colonna `<row_route>.unita_misura_id` ha `tf=codice` ma `prodotti.unita_misura_id`
-- ha ancora `tf=descrizione`, document-edit-form trova undefined per
-- `lookup['unita_misura___codice__unita_misura_id']` -> setRowLookup popola
-- `__lookup_obj = { id, codice: undefined }` -> p-autoComplete optionLabel
-- 'codice' di un object con campo undefined -> stringifica come "[object Object]".
--
-- Allineamento app-wide: codice ovunque per unita_misura.

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

UPDATE c
   SET c.mcuilookupdata_text_field = 'codice'
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'unita_misura_id'
   AND t.mdroutename IN (
        'prodotti',
        'fatture_inviate_righe',
        'ddt_righe',
        'ordini_righe',
        'ordini_acquisto_righe',
        'preventivi_righe',
        'proforma_righe'
   );
GO

-- Verifica idempotente: tutte e 7 le righe devono mostrare 'codice'.
SELECT t.mdroutename, c.mc_nome_colonna, c.mcuilookupdata_text_field
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'unita_misura_id'
   AND t.mdroutename IN (
        'prodotti',
        'fatture_inviate_righe',
        'ddt_righe',
        'ordini_righe',
        'ordini_acquisto_righe',
        'preventivi_righe',
        'proforma_righe'
   )
 ORDER BY t.mdroutename;
GO

-- DOPO l'esecuzione: invalidare il metadata runtime via AsmxProxy
-- (regola 10 AGENTS.md). Non aggiornare sys_info.projectmetadataversion via SQL.
--
--   POST /api/Meta/AsmxProxy/MetaService.invalidateMetadataRuntime
--   POST /api/Meta/AsmxProxy/MetaService.getProjectMetadataVersion
--
-- Cookie k-user da MetaService.login (admin/admin).
