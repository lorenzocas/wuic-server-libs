-- 2026-05-08 — Metadata overrides per listini, listini_prezzi e per le 2
-- nuove FK clienti.listino_id / fornitori.listino_id.
--
-- - Set route names (slug human-friendly).
-- - Display strings tabella + colonne.
-- - Lookup config su listini_prezzi.listino_id, listini_prezzi.prodotto_id,
--   clienti.listino_id, fornitori.listino_id.
-- - Hide audit columns (data_creazione, data_modifica, ecc.) in list/edit.
-- - Hide cancellato in list/edit (gestito dal soft-delete framework).

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Route names (slug) + display string tabella
UPDATE _metadati__tabelle SET mdroutename = 'listini', mm_display_string = 'Listini', mm_long_description = 'Listini prezzi' WHERE md_nome_tabella = 'listini' AND mddbname = 'FatturazioneElettronica_Data';
UPDATE _metadati__tabelle SET mdroutename = 'listini_prezzi', mm_display_string = 'Prezzi listino', mm_long_description = 'Prezzi prodotti per listino con periodo di validità' WHERE md_nome_tabella = 'listini_prezzi' AND mddbname = 'FatturazioneElettronica_Data';
GO

-- Permessi standard sulle 2 tabelle (editable/insertable/deletable + grant by default).
UPDATE _metadati__tabelle SET md_editable = 1, md_insertable = 1, md_deletable = 1, md_detail_action = 1, md_grant_by_default = 1 WHERE md_nome_tabella IN ('listini','listini_prezzi') AND mddbname = 'FatturazioneElettronica_Data';
GO

-- Display strings colonne (sempre meglio metterle parlanti)
UPDATE c SET c.mc_display_string_in_view = N'Nome', c.mc_display_string_in_edit = N'Nome'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'listini' AND c.mc_nome_colonna = 'nome' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Descrizione', c.mc_display_string_in_edit = N'Descrizione'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'listini' AND c.mc_nome_colonna = 'descrizione' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Attivo', c.mc_display_string_in_edit = N'Attivo'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella IN ('listini','listini_prezzi') AND c.mc_nome_colonna = 'attivo' AND t.mddbname = 'FatturazioneElettronica_Data';
GO

UPDATE c SET c.mc_display_string_in_view = N'Listino', c.mc_display_string_in_edit = N'Listino'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'listino_id' AND t.md_nome_tabella IN ('listini_prezzi','clienti','fornitori') AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Prodotto', c.mc_display_string_in_edit = N'Prodotto'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'prodotto_id' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Prezzo vendita', c.mc_display_string_in_edit = N'Prezzo vendita'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'prezzo_vendita' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Prezzo acquisto', c.mc_display_string_in_edit = N'Prezzo acquisto'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'prezzo_acquisto' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Sconto %', c.mc_display_string_in_edit = N'Sconto %'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'sconto_default' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Valido dal', c.mc_display_string_in_edit = N'Valido dal'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'valid_from' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';

UPDATE c SET c.mc_display_string_in_view = N'Valido al', c.mc_display_string_in_edit = N'Valido al'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE c.mc_nome_colonna = 'valid_to' AND t.md_nome_tabella = 'listini_prezzi' AND t.mddbname = 'FatturazioneElettronica_Data';
GO

-- LOOKUP CONFIG: listini_prezzi.listino_id → listini
UPDATE c
   SET c.mc_ui_column_type = 'lookupByID',
       c.mcuilookupentityname = 'listini',
       c.mcuilookupdata_value_field = 'id',
       c.mcuilookupdata_text_field = 'nome'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'listini_prezzi' AND c.mc_nome_colonna = 'listino_id' AND t.mddbname = 'FatturazioneElettronica_Data';

-- LOOKUP CONFIG: listini_prezzi.prodotto_id → prodotti
UPDATE c
   SET c.mc_ui_column_type = 'lookupByID',
       c.mcuilookupentityname = 'prodotti',
       c.mcuilookupdata_value_field = 'id',
       c.mcuilookupdata_text_field = 'descrizione'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'listini_prezzi' AND c.mc_nome_colonna = 'prodotto_id' AND t.mddbname = 'FatturazioneElettronica_Data';

-- LOOKUP CONFIG: clienti.listino_id → listini
UPDATE c
   SET c.mc_ui_column_type = 'lookupByID',
       c.mcuilookupentityname = 'listini',
       c.mcuilookupdata_value_field = 'id',
       c.mcuilookupdata_text_field = 'nome'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'clienti' AND c.mc_nome_colonna = 'listino_id' AND t.mddbname = 'FatturazioneElettronica_Data';

-- LOOKUP CONFIG: fornitori.listino_id → listini
UPDATE c
   SET c.mc_ui_column_type = 'lookupByID',
       c.mcuilookupentityname = 'listini',
       c.mcuilookupdata_value_field = 'id',
       c.mcuilookupdata_text_field = 'nome'
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella = 'fornitori' AND c.mc_nome_colonna = 'listino_id' AND t.mddbname = 'FatturazioneElettronica_Data';
GO

-- Hide audit + cancellato columns in list/edit (rumore UI, gestiti dal framework soft-delete + audit).
UPDATE c
   SET c.mchideinlist = 1, c.mchideinedit = 1
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.md_nome_tabella IN ('listini','listini_prezzi') AND t.mddbname = 'FatturazioneElettronica_Data'
   AND c.mc_nome_colonna IN ('cancellato','data_creazione','data_modifica','utente_creazione','utente_modifica','data_eliminazione','utente_eliminazione');
GO

-- Verifica
SELECT t.mdroutename, c.mc_nome_colonna, c.mc_ui_column_type, c.mcuilookupentityname
  FROM _metadati__colonne c JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE (t.md_nome_tabella IN ('listini','listini_prezzi') OR (t.md_nome_tabella IN ('clienti','fornitori') AND c.mc_nome_colonna = 'listino_id'))
   AND c.mc_ui_column_type = 'lookupByID'
   AND t.mddbname = 'FatturazioneElettronica_Data'
 ORDER BY t.mdroutename, c.mc_nome_colonna;
GO
