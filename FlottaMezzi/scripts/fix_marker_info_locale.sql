SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- mezzi_mappa: rimosso :'it' dai pipe number/date (locale non registrato → crash runtime)
DECLARE @md_mezzi INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename='mezzi_mappa');
UPDATE _metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"map":{"advancedFilter":true,"useClusterer":false,"filterByBoundaries":false,"center":{"lat":42,"lng":13},"zoom":6,"minZoom":3,"maxZoom":18,"titleField":"targa","infoField":"modello","markerColorField":"colore_marker","customMarkerImageSrcField":"svg_marker","itemTemplateString":"<div class=\"map-info\" style=\"min-width:240px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5\"><div style=\"font-weight:700;font-size:15px;margin-bottom:6px;color:#0f172a\">{{ rowData.record?.targa || rowData.title }}</div><div><b>{{ rowData.record?.marca }} {{ rowData.record?.modello }}</b><span *ngIf=\"rowData.record?.anno\"> ({{ rowData.record?.anno }})</span></div><div *ngIf=\"rowData.record?.tipo_mezzo___descrizione__tipo_mezzo_id\">Tipo: {{ rowData.record?.tipo_mezzo___descrizione__tipo_mezzo_id }}</div><div *ngIf=\"rowData.record?.alimentazione\">Alimentazione: {{ rowData.record?.alimentazione }}</div><div *ngIf=\"rowData.record?.km_attuali != null\">Km: {{ rowData.record?.km_attuali | number:''1.0-0'' }}</div><div *ngIf=\"rowData.record?.stato_mezzo___descrizione__stato_mezzo_id\" style=\"margin-top:4px\">Stato: <b>{{ rowData.record?.stato_mezzo___descrizione__stato_mezzo_id }}</b></div><div *ngIf=\"rowData.record?.conducenti___cognome__conducente_assegnato_id\" style=\"margin-top:4px\">Conducente: {{ rowData.record?.conducenti___nome__conducente_assegnato_id }} {{ rowData.record?.conducenti___cognome__conducente_assegnato_id }}</div></div>"}}}'
WHERE md_id = @md_mezzi;

-- vw_mezzi_posizioni_giorno
DECLARE @md_vw INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename='vw_mezzi_posizioni_giorno');
UPDATE _metadati__tabelle
SET mdpropsbag = N'{"archetypes":{"map":{"advancedFilter":true,"useClusterer":false,"filterByBoundaries":false,"center":{"lat":42.5,"lng":12.5},"zoom":6,"minZoom":3,"maxZoom":18,"titleField":"targa","infoField":"note","markerColorField":"colore_marker","customMarkerImageSrcField":"svg_marker","itemTemplateString":"<div class=\"map-info\" style=\"min-width:240px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5\"><div style=\"font-weight:700;font-size:15px;margin-bottom:6px;color:#0f172a\">{{ rowData.record?.targa || rowData.title }}</div><div *ngIf=\"rowData.record?.modello\"><b>{{ rowData.record?.modello }}</b></div><div *ngIf=\"rowData.record?.timestamp_pos\" style=\"margin-top:4px\">Ultimo aggiornamento:<br><b>{{ rowData.record?.timestamp_pos | date:''dd/MM/yyyy HH:mm'' }}</b></div><div *ngIf=\"rowData.record?.velocita_kmh != null\">Velocita: <b>{{ rowData.record?.velocita_kmh | number:''1.0-1'' }} km/h</b></div><div *ngIf=\"rowData.record?.note\" style=\"margin-top:4px;font-style:italic;color:#475569\">{{ rowData.record?.note }}</div></div>","polyline":{"enabled":true,"groupByField":"mezzo_id","orderByField":"timestamp_pos","colorField":"colore_marker","strokeColorByGroup":true,"strokeWeight":4,"strokeOpacity":0.85,"snapToRoads":true,"showMarkers":true,"travelMode":"WALKING","showWaypointDots":true,"waypointDotRadius":15}}}}'
WHERE md_id = @md_vw;

SELECT 'OK';
