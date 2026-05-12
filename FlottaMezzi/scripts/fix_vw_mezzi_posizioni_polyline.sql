SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

DECLARE @md_id INT = (SELECT md_id FROM dbo._metadati__tabelle WHERE mdroutename='vw_mezzi_posizioni_giorno');

UPDATE dbo._metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"map":{"advancedFilter":true,"useClusterer":false,"filterByBoundaries":false,"center":{"lat":42.5,"lng":12.5},"zoom":6,"minZoom":3,"maxZoom":18,"titleField":"targa","infoField":"note","polyline":{"enabled":true,"groupByField":"mezzo_id","orderByField":"timestamp_pos","strokeColorByGroup":true,"strokeWeight":4,"strokeOpacity":0.85,"snapToRoads":true,"showMarkers":true,"travelMode":"DRIVING"}}}}'
WHERE md_id = @md_id;

-- geo_point come tipo point (auto-detect del map-list per coordinate marker + polyline)
UPDATE dbo._metadati__colonne SET mc_ui_column_type='point', mc_display_string_in_view='Posizione' WHERE md_id=@md_id AND mc_nome_colonna='geo_point';

-- Stesso per la tabella raw (anagrafica edit)
DECLARE @md_pos INT = (SELECT md_id FROM dbo._metadati__tabelle WHERE mdroutename='mezzi_posizioni');
UPDATE dbo._metadati__colonne SET mc_ui_column_type='point', mc_display_string_in_view='Posizione' WHERE md_id=@md_pos AND mc_nome_colonna='geo_point';
UPDATE dbo._metadati__colonne SET mchideinlist=1, mchideinedit=1 WHERE md_id=@md_pos AND mc_nome_colonna IN ('latitudine','longitudine');

-- Fai in modo che la filter-bar mostri SOLO i campi utili (mezzo, giorno).
-- Tutto il resto: hide-in-list (la mappa li usa, la lista no).
UPDATE dbo._metadati__colonne
SET mchideinlist = 1
WHERE md_id = @md_id
  AND mc_nome_colonna IN ('id','ordine','data_creazione','utente_creazione','data_modifica','utente_modifica','data_eliminazione','utente_eliminazione','cancellato','latitudine','longitudine');

-- mezzo_id come lookup per il filtro
UPDATE dbo._metadati__colonne
SET mc_ui_column_type='lookupByID', mcuilookupentityname='mezzi', mcuilookupdata_value_field='id', mcuilookupdata_text_field='targa', mc_display_string_in_view='Mezzo'
WHERE md_id=@md_id AND mc_nome_colonna='mezzo_id';

-- giorno: leggibile
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Giorno' WHERE md_id=@md_id AND mc_nome_colonna='giorno';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Targa' WHERE md_id=@md_id AND mc_nome_colonna='targa';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Modello' WHERE md_id=@md_id AND mc_nome_colonna='modello';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Data e ora' WHERE md_id=@md_id AND mc_nome_colonna='timestamp_pos';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Velocita (km/h)' WHERE md_id=@md_id AND mc_nome_colonna='velocita_kmh';

SELECT md_id, CAST(mdpropsbag AS NVARCHAR(MAX)) FROM dbo._metadati__tabelle WHERE md_id=@md_id;
