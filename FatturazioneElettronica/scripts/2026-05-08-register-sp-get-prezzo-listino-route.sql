-- =============================================================================
-- Patch: registra `sp_get_prezzo_listino` come stored route in _metadati__tabelle
-- per renderla chiamabile via MetaService.getFlatDataFromStored.
--
-- `_Metadati_methods.GetFlatDataFromStored` cerca la stored come route in
-- _metadati__tabelle; se non registrata lancia NRE -> 500.
-- (Bug framework noto: _Metadati_methods.cs:3860 dereferenzia metaStored.md_props_bag
--  PRIMA del null-check a riga 3869. Notify+ask al maintainer del framework.)
--
-- Pattern identico a `2026-05-08-register-sp-calcola-scadenze-route.sql`:
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

DECLARE @propsbag NVARCHAR(MAX) = N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@cliente_id","Type":"number","value":""},{"Name":"@fornitore_id","Type":"number","value":""},{"Name":"@listino_id","Type":"number","value":""},{"Name":"@data","Type":"date","value":""}]}';

IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = 'sp_get_prezzo_listino')
BEGIN
  DECLARE @next_md_id INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
  SELECT * INTO #tmp_clone FROM _metadati__tabelle WHERE mdroutename = 'pagamenti';
  UPDATE #tmp_clone SET
    md_id = @next_md_id,
    mdroutename = 'sp_get_prezzo_listino',
    md_nome_tabella = 'sp_get_prezzo_listino',
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
         md_nome_tabella = 'sp_get_prezzo_listino',
         mdconnname    = 'DataSQLConnection',
         mdschemaname  = 'dbo'
   WHERE mdroutename = 'sp_get_prezzo_listino';
END

SELECT mdroutename, mdisstored, mdconnname, mdschemaname, LEN(mdpropsbag) AS propsbag_len
  FROM _metadati__tabelle WHERE mdroutename = 'sp_get_prezzo_listino';
