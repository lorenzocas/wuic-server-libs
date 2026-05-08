-- =============================================================================
-- Patch: registra `sp_next_progressivo` come stored route in _metadati__tabelle
-- per renderla chiamabile via MetaService.getFlatDataFromStored.
--
-- `_Metadati_methods.GetFlatDataFromStored` line 3737 cerca la stored come
-- route in _metadati__tabelle e, se non registrata, lancia NRE -> 500.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- Idempotente: clona da una route esistente (pagamenti) overridendo identita'
IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = 'sp_next_progressivo')
BEGIN
  DECLARE @next_md_id INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
  -- Clone della route 'pagamenti' come template, override solo i campi chiave
  -- Cosi' tutte le NOT NULL (mdgroupable, mdscrollable, ecc.) ereditano default da una route esistente
  SELECT * INTO #tmp_clone FROM _metadati__tabelle WHERE mdroutename = 'pagamenti';
  UPDATE #tmp_clone SET
    md_id = @next_md_id,
    mdroutename = 'sp_next_progressivo',
    md_nome_tabella = 'sp_next_progressivo',
    mdisstored = 1,
    mdconnname = 'DataSQLConnection',
    mdschemaname = 'dbo',
    md_editable = 0, md_deletable = 0, md_insertable = 0,
    mddetailaction = 0,
    mdedittemplate = NULL, mddetailtemplate = NULL,
    mdnestedgridroutes = NULL,
    mdpropsbag = N'{"parameters":[{"Name":"@route","Type":"text","value":""},{"Name":"@anno","Type":"text","value":""},{"Name":"@serie","Type":"text","value":""}]}';
  INSERT INTO _metadati__tabelle SELECT * FROM #tmp_clone;
  DROP TABLE #tmp_clone;
END
ELSE
BEGIN
  UPDATE _metadati__tabelle
     SET mdpropsbag = N'{"parameters":[{"Name":"@route","Type":"text","value":""},{"Name":"@anno","Type":"text","value":""},{"Name":"@serie","Type":"text","value":""}]}',
         mdisstored = 1,
         md_nome_tabella = 'sp_next_progressivo',
         mdconnname = 'DataSQLConnection',
         mdschemaname = 'dbo'
   WHERE mdroutename = 'sp_next_progressivo';
END

SELECT mdroutename, mdisstored, mdconnname, mdschemaname, LEN(mdpropsbag) AS propsbag_len
  FROM _metadati__tabelle WHERE mdroutename = 'sp_next_progressivo';
