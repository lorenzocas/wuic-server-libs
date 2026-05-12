SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Hide audit cols + cancellato in list/edit (regola db-schema-scaffolding 5-quater)
DECLARE @md_id INT = (SELECT md_id FROM dbo._metadati__tabelle WHERE mdroutename='mezzi_posizioni');
UPDATE dbo._metadati__tabelle SET mdhaslogicdelete=1, mdloggingenable=1 WHERE md_id=@md_id;

UPDATE dbo._metadati__colonne
SET mchideinlist=1, mchideinedit=1, mc_logic_editable=0
WHERE md_id=@md_id
  AND mc_nome_colonna IN ('data_creazione','utente_creazione','data_modifica','utente_modifica','data_eliminazione','utente_eliminazione','cancellato');

-- mezzo_id → lookup su mezzi
UPDATE dbo._metadati__colonne
SET mc_ui_column_type='lookupByID', mcuilookupentityname='mezzi', mcuilookupdata_value_field='id', mcuilookupdata_text_field='targa'
WHERE md_id=@md_id AND mc_nome_colonna='mezzo_id';

-- Display name colonne più leggibili
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Data e ora', mc_display_string_in_edit='Data e ora' WHERE md_id=@md_id AND mc_nome_colonna='timestamp_pos';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Velocita (km/h)', mc_display_string_in_edit='Velocita (km/h)' WHERE md_id=@md_id AND mc_nome_colonna='velocita_kmh';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Latitudine' WHERE md_id=@md_id AND mc_nome_colonna='latitudine';
UPDATE dbo._metadati__colonne SET mc_display_string_in_view='Longitudine' WHERE md_id=@md_id AND mc_nome_colonna='longitudine';

-- Stessa cura per la VIEW
DECLARE @md_view INT = (SELECT md_id FROM dbo._metadati__tabelle WHERE mdroutename='vw_mezzi_posizioni_giorno');
UPDATE dbo._metadati__colonne SET mchideinlist=1 WHERE md_id=@md_view AND mc_nome_colonna IN ('id','mezzo_id');

SELECT 'OK md_id', @md_id, 'view md_id', @md_view;
