SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @md_id INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename='vw_mezzi_posizioni_giorno');

UPDATE _metadati__tabelle
SET mdpropsbag = REPLACE(CAST(mdpropsbag AS NVARCHAR(MAX)), N'"travelMode":"DRIVING"', N'"travelMode":"WALKING"')
WHERE md_id = @md_id;

SELECT CAST(mdpropsbag AS NVARCHAR(MAX)) FROM _metadati__tabelle WHERE md_id = @md_id;
