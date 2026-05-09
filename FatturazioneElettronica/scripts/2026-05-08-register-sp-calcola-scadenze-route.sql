-- =============================================================================
-- Patch: registra `sp_calcola_scadenze` come stored route in _metadati__tabelle
-- per renderla chiamabile via MetaService.getFlatDataFromStored.
--
-- `_Metadati_methods.GetFlatDataFromStored` cerca la stored come route in
-- _metadati__tabelle; se non registrata lancia NRE -> 500.
--
-- Pattern identico a `2026-05-07-register-sp-next-progressivo-route.sql`:
-- clone della route 'pagamenti' come template, override dei campi chiave.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @propsbag NVARCHAR(MAX) = N'{"parameters":[{"Name":"@pagamento_id","Type":"number","value":""},{"Name":"@data_documento","Type":"date","value":""},{"Name":"@totale","Type":"number","value":""},{"Name":"@cliente_id","Type":"number","value":""},{"Name":"@fornitore_id","Type":"number","value":""},{"Name":"@tipo","Type":"text","value":""}]}';

IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = 'sp_calcola_scadenze')
BEGIN
  DECLARE @next_md_id INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
  SELECT * INTO #tmp_clone FROM _metadati__tabelle WHERE mdroutename = 'pagamenti';
  UPDATE #tmp_clone SET
    md_id = @next_md_id,
    mdroutename = 'sp_calcola_scadenze',
    md_nome_tabella = 'sp_calcola_scadenze',
    mdisstored = 1,
    mdconnname = 'DataSQLConnection',
    mdschemaname = 'dbo',
    md_editable = 0, md_deletable = 0, md_insertable = 0,
    mddetailaction = 0,
    mdedittemplate = NULL, mddetailtemplate = NULL,
    mdnestedgridroutes = NULL,
    mdpropsbag = @propsbag;
  INSERT INTO _metadati__tabelle SELECT * FROM #tmp_clone;
  DROP TABLE #tmp_clone;
END
ELSE
BEGIN
  UPDATE _metadati__tabelle
     SET mdpropsbag    = @propsbag,
         mdisstored    = 1,
         md_nome_tabella = 'sp_calcola_scadenze',
         mdconnname    = 'DataSQLConnection',
         mdschemaname  = 'dbo'
   WHERE mdroutename = 'sp_calcola_scadenze';
END

SELECT mdroutename, mdisstored, mdconnname, mdschemaname, LEN(mdpropsbag) AS propsbag_len
  FROM _metadati__tabelle WHERE mdroutename = 'sp_calcola_scadenze';
