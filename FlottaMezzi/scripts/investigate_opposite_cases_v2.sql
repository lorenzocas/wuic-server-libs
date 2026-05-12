SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

PRINT '=== A) Boolean flags (hide_in_edit / hide_in_list / grant_default / val_required) ==='
PRINT 'route                     | col                                | prop              | kiara | fe | flotta | crm'

DECLARE @cases_bool TABLE (route NVARCHAR(200), col NVARCHAR(200), prop NVARCHAR(50));
INSERT INTO @cases_bool VALUES
  (' metadati  colonne', 'mc_logic_cascade_filteringParent', 'mchideinlist'),
  (' metadati  colonne', 'mc_syntax_builder', 'mchideinedit'),
  (' metadati  colonne', 'mc_ui_slider_largestep', 'mchideinedit'),
  (' metadati  colonne', 'mc_id', 'mcgrantbydefault'),
  (' metadati  tabelle', 'md_detail_grid_routes', 'mchideinedit'),
  (' metadati  tabelle', 'md_tabs_ordered_list', 'mchideinedit'),
  ('_metadati_condition_item', 'FK_CG_Id', 'mc_validation_required');

DECLARE @route NVARCHAR(200), @col NVARCHAR(200), @prop NVARCHAR(50);
DECLARE c CURSOR LOCAL FOR SELECT route, col, prop FROM @cases_bool;
OPEN c;
FETCH NEXT FROM c INTO @route, @col, @prop;
WHILE @@FETCH_STATUS=0
BEGIN
  DECLARE @sql NVARCHAR(MAX) = N'
SELECT ''' + @route + N''' AS route, ''' + @col + N''' AS col, ''' + @prop + N''' AS prop,
  ISNULL((SELECT TOP 1 ' + @prop + N' FROM Kiara_wuic_new.dbo._metadati__colonne k JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + @route + N''' AND k.mc_nome_colonna=''' + @col + N'''),0) AS kiara,
  ISNULL((SELECT TOP 1 ' + @prop + N' FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne k JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + @route + N''' AND k.mc_nome_colonna=''' + @col + N'''),0) AS fe,
  ISNULL((SELECT TOP 1 ' + @prop + N' FROM FlottaMezzi_Metadata.dbo._metadati__colonne k JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + @route + N''' AND k.mc_nome_colonna=''' + @col + N'''),0) AS flotta,
  ISNULL((SELECT TOP 1 ' + @prop + N' FROM MetadataCRM.dbo._metadati__colonne k JOIN MetadataCRM.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=''' + @route + N''' AND k.mc_nome_colonna=''' + @col + N'''),0) AS crm';
  EXEC sp_executesql @sql;
  FETCH NEXT FROM c INTO @route, @col, @prop;
END
CLOSE c; DEALLOCATE c;

PRINT '=== B) col_type string properties ==='
SELECT ' metadati  colonne' AS route, 'mc_ui_grid_column_data_template' AS col,
  (SELECT TOP 1 mc_ui_column_type FROM Kiara_wuic_new.dbo._metadati__colonne k JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_grid_column_data_template') AS kiara,
  (SELECT TOP 1 mc_ui_column_type FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne k JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_grid_column_data_template') AS fe,
  (SELECT TOP 1 mc_ui_column_type FROM FlottaMezzi_Metadata.dbo._metadati__colonne k JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_grid_column_data_template') AS flotta,
  (SELECT TOP 1 mc_ui_column_type FROM MetadataCRM.dbo._metadati__colonne k JOIN MetadataCRM.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_grid_column_data_template') AS crm
UNION ALL
SELECT ' metadati  colonne', 'mc_id',
  (SELECT TOP 1 mc_ui_column_type FROM Kiara_wuic_new.dbo._metadati__colonne k JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_id'),
  (SELECT TOP 1 mc_ui_column_type FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne k JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_id'),
  (SELECT TOP 1 mc_ui_column_type FROM FlottaMezzi_Metadata.dbo._metadati__colonne k JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_id'),
  (SELECT TOP 1 mc_ui_column_type FROM MetadataCRM.dbo._metadati__colonne k JOIN MetadataCRM.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_id')
UNION ALL
SELECT ' metadati  colonne', 'mc_ui_is_password',
  (SELECT TOP 1 mc_ui_column_type FROM Kiara_wuic_new.dbo._metadati__colonne k JOIN Kiara_wuic_new.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_is_password'),
  (SELECT TOP 1 mc_ui_column_type FROM FatturazioneElettronica_Metadata.dbo._metadati__colonne k JOIN FatturazioneElettronica_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_is_password'),
  (SELECT TOP 1 mc_ui_column_type FROM FlottaMezzi_Metadata.dbo._metadati__colonne k JOIN FlottaMezzi_Metadata.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_is_password'),
  (SELECT TOP 1 mc_ui_column_type FROM MetadataCRM.dbo._metadati__colonne k JOIN MetadataCRM.dbo._metadati__tabelle kt ON kt.md_id=k.md_id WHERE kt.mdroutename=' metadati  colonne' AND k.mc_nome_colonna='mc_ui_is_password');
