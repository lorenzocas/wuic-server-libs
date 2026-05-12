SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @md_id INT = 4729;

IF NOT EXISTS (SELECT 1 FROM dbo._metadati__colonne WHERE md_id=@md_id AND mc_nome_colonna='geo_point')
BEGIN
  INSERT INTO dbo._metadati__colonne (
    md_id, mc_nome_colonna, mcrealcolumnname, mc_db_column_type,
    mc_ui_column_type, mc_display_string_in_view, mcordine,
    mchideinlist, mchideinedit, mchideindetail, mchideinexport, mchideinservice
  ) VALUES (
    @md_id, 'geo_point', 'geo_point', 'NVARCHAR',
    'point', 'Posizione', 50,
    1, 1, 1, 0, 0
  );
END

UPDATE dbo._metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"map":{"advancedFilter":true,"useClusterer":false,"filterByBoundaries":false,"center":{"lat":42,"lng":13},"zoom":6,"minZoom":3,"maxZoom":18,"titleField":"targa","infoField":"modello"}}}'
WHERE md_id = @md_id;

SELECT mc_id, mc_nome_colonna, mc_ui_column_type FROM dbo._metadati__colonne WHERE md_id=@md_id AND mc_nome_colonna='geo_point';
SELECT mdroutename, CAST(mdpropsbag AS NVARCHAR(MAX)) AS bag FROM dbo._metadati__tabelle WHERE md_id=@md_id;
