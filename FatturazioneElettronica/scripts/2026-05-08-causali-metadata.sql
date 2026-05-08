-- =============================================================================
-- Patch: registra route metadata `causali` + aggiunge colonna `causale_id`
-- su fatture_inviate (lookupByID -> causali). Sostituisce `causale` (text)
-- nel md_edit_template controparteFields.
--
-- Pattern: clone-from-existing-route (template = pagamenti) per ereditare
-- tutti i NOT NULL default su _metadati__tabelle, poi override dei campi
-- chiave. Stessa tecnica di 2026-05-07-register-sp-next-progressivo-route.sql.
--
-- Idempotente: usa NOT EXISTS per ogni step.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- 1) Registra route 'causali' clonando da 'pagamenti' --------------------------
IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = 'causali')
BEGIN
  DECLARE @next_md_id INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
  SELECT * INTO #tmp_clone FROM _metadati__tabelle WHERE mdroutename = 'pagamenti';
  UPDATE #tmp_clone SET
    md_id = @next_md_id,
    mdroutename       = 'causali',
    md_nome_tabella   = 'causali',
    mdisstored        = 0,
    mdconnname        = 'DataSQLConnection',
    mdschemaname      = 'dbo',
    md_editable       = 1, md_deletable = 1, md_insertable = 1,
    mddetailaction    = 1,
    mdedittemplate    = NULL, mddetailtemplate = NULL,
    mdnestedgridroutes= NULL,
    mdpropsbag        = NULL;
  INSERT INTO _metadati__tabelle SELECT * FROM #tmp_clone;
  DROP TABLE #tmp_clone;
END
GO

-- 2) Scaffolda colonne metadata per la route 'causali' -----------------------
-- mc_id e' IDENTITY: clone via temp table + DROP mc_id prima dell'INSERT.
DECLARE @md_causali INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'causali');
DECLARE @md_pag     INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'pagamenti');

-- causali.id
IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id=@md_causali AND mc_nome_colonna='id')
BEGIN
  SELECT * INTO #c_id FROM _metadati__colonne WHERE md_id=@md_pag AND mc_nome_colonna='id';
  UPDATE #c_id SET md_id=@md_causali;
  ALTER TABLE #c_id DROP COLUMN mc_id;
  INSERT INTO _metadati__colonne SELECT * FROM #c_id;
  DROP TABLE #c_id;
END

-- causali.codice
IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id=@md_causali AND mc_nome_colonna='codice')
BEGIN
  SELECT * INTO #c_cod FROM _metadati__colonne WHERE md_id=@md_pag AND mc_nome_colonna='descrizione';
  UPDATE #c_cod SET
    md_id = @md_causali,
    mc_nome_colonna           = 'codice',
    mcrealcolumnname          = 'codice',
    mc_display_string_in_view = 'codice',
    mc_display_string_in_edit = 'codice',
    mcordine = 10;
  ALTER TABLE #c_cod DROP COLUMN mc_id;
  INSERT INTO _metadati__colonne SELECT * FROM #c_cod;
  DROP TABLE #c_cod;
END

-- causali.descrizione
IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id=@md_causali AND mc_nome_colonna='descrizione')
BEGIN
  SELECT * INTO #c_desc FROM _metadati__colonne WHERE md_id=@md_pag AND mc_nome_colonna='descrizione';
  UPDATE #c_desc SET
    md_id = @md_causali,
    mc_nome_colonna           = 'descrizione',
    mcrealcolumnname          = 'descrizione',
    mc_display_string_in_view = 'descrizione',
    mc_display_string_in_edit = 'descrizione',
    mcordine = 20;
  ALTER TABLE #c_desc DROP COLUMN mc_id;
  INSERT INTO _metadati__colonne SELECT * FROM #c_desc;
  DROP TABLE #c_desc;
END
GO

-- 3) Aggiungi causale_id su fatture_inviate metadata come lookupByID ---------
DECLARE @md_fi INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'fatture_inviate');

IF NOT EXISTS (SELECT 1 FROM _metadati__colonne WHERE md_id=@md_fi AND mc_nome_colonna='causale_id')
BEGIN
  SELECT * INTO #c_caus FROM _metadati__colonne
   WHERE md_id=@md_fi AND mc_nome_colonna='cliente_id';
  UPDATE #c_caus SET
    md_id                      = @md_fi,
    mc_nome_colonna            = 'causale_id',
    mcrealcolumnname           = 'causale_id',
    mc_display_string_in_view  = 'causale',
    mc_display_string_in_edit  = 'causale',
    mc_ui_column_type          = 'lookupByID',
    mcuilookupentityname       = 'causali',
    mcuilookupdata_value_field = 'id',
    mcuilookupdata_text_field  = 'descrizione',
    mc_validation_required     = 0,
    mc_logic_nullable          = 1,
    mcordine                   = 80;
  ALTER TABLE #c_caus DROP COLUMN mc_id;
  INSERT INTO _metadati__colonne SELECT * FROM #c_caus;
  DROP TABLE #c_caus;
END
GO

-- 4) Nascondi la vecchia colonna text 'causale' (legacy backward-compat) -----
UPDATE mc
   SET mc.mchideinedit = 1, mc.mc_logic_editable = 0
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE t.mdroutename = 'fatture_inviate'
   AND mc.mc_nome_colonna = 'causale';
GO

-- 5) Verifica finale ----------------------------------------------------------
SELECT 'route causali:' AS info, mdroutename, md_nome_tabella, mdconnname, md_editable, md_insertable
  FROM _metadati__tabelle WHERE mdroutename='causali';

SELECT 'cols causali:' AS info, mc_nome_colonna, mc_ui_column_type
  FROM _metadati__colonne mc JOIN _metadati__tabelle t ON t.md_id=mc.md_id
 WHERE t.mdroutename='causali' ORDER BY mc.mcordine;

SELECT 'fatture_inviate.causale_id:' AS info, mc.mc_nome_colonna, mc.mc_ui_column_type,
       mc.mcuilookupentityname, mc.mcuilookupdata_text_field, mc.mcuilookupdata_value_field
  FROM _metadati__colonne mc JOIN _metadati__tabelle t ON t.md_id=mc.md_id
 WHERE t.mdroutename='fatture_inviate' AND mc.mc_nome_colonna IN ('causale','causale_id');
