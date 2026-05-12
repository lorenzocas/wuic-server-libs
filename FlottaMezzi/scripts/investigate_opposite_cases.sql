SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

-- Detail report: per ogni "caso opposto" (kiara mostra/non-richiede ma FE nasconde/richiede),
-- confronta i valori su tutti i 4 DB metadata disponibili.

DECLARE @cases TABLE (route NVARCHAR(200), col NVARCHAR(200), property NVARCHAR(50));
INSERT INTO @cases VALUES
  (' metadati  colonne', 'mc_logic_cascade_filteringParent', 'mchideinlist'),
  (' metadati  colonne', 'mc_syntax_builder', 'mchideinedit'),
  (' metadati  colonne', 'mc_ui_slider_largestep', 'mchideinedit'),
  (' metadati  colonne', 'mc_ui_grid_column_data_template', 'mc_ui_column_type'),
  (' metadati  colonne', 'mc_id', 'mc_ui_column_type'),
  (' metadati  colonne', 'mc_id', 'mcgrantbydefault'),
  (' metadati  colonne', 'mc_ui_is_password', 'mc_ui_column_type'),
  (' metadati  tabelle', 'md_detail_grid_routes', 'mchideinedit'),
  (' metadati  tabelle', 'md_tabs_ordered_list', 'mchideinedit'),
  ('_metadati_condition_item', 'FK_CG_Id', 'mc_validation_required');

DECLARE @sql NVARCHAR(MAX) = N'';

SELECT @sql = @sql + N'
SELECT ''' + c.route + N''' AS route, ''' + c.col + N''' AS col, ''' + c.property + N''' AS prop,
  (SELECT ' + c.property + N' FROM Kiara_wuic_new.dbo._metadati__colonne k JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + c.route + N''' AND k.mc_nome_colonna=''' + c.col + N''') AS kiara,
  (SELECT ' + c.property + N' FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne k JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + c.route + N''' AND k.mc_nome_colonna=''' + c.col + N''') AS fe,
  (SELECT ' + c.property + N' FROM FlottaMezzi_Metadata.dbo._metadati__colonne k JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + c.route + N''' AND k.mc_nome_colonna=''' + c.col + N''') AS flotta,
  (SELECT ' + c.property + N' FROM MetadataCRM.dbo._metadati__colonne k JOIN MetadataCRM.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + c.route + N''' AND k.mc_nome_colonna=''' + c.col + N''') AS crm
UNION ALL'
FROM @cases c;

SET @sql = LEFT(@sql, LEN(@sql) - 9); -- strip trailing UNION ALL
EXEC sp_executesql @sql;
