SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @md_id INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename='vw_mezzi_posizioni_giorno');

UPDATE _metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"map":{"advancedFilter":true,"useClusterer":false,"filterByBoundaries":false,"center":{"lat":42.5,"lng":12.5},"zoom":6,"minZoom":3,"maxZoom":18,"titleField":"targa","infoField":"note","polyline":{"enabled":true,"groupByField":"mezzo_id","orderByField":"timestamp_pos","strokeColorByGroup":true,"strokeWeight":4,"strokeOpacity":0.85,"snapToRoads":true,"showMarkers":true,"travelMode":"WALKING","showWaypointDots":true,"waypointDotRadius":15}}}}'
WHERE md_id = @md_id;

SELECT CAST(mdpropsbag AS NVARCHAR(MAX)) FROM _metadati__tabelle WHERE md_id = @md_id;
