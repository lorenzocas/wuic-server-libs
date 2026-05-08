-- =============================================================================
-- Patch: fix lookup textField su tutti i lookup verso clienti/fornitori.
--
-- Stato pre-patch: tutti i `mc_ui_column_type='lookupByID'` con
--   mcuilookupentityname IN ('clienti','fornitori')
-- avevano `mcuilookupdata_text_field='codice_destinatario'`.
-- `codice_destinatario` e' il codice SDI 7-char (es. "0000000" per i
-- soggetti non-PA), quindi il dropdown del lookup mostrava sempre
-- "0000000" come testo per tutte le righe -> bug "compare sempre 000000".
--
-- Fix: usare `ragione_sociale` come textField (campo human-readable
-- presente sia su anagrafica clienti sia fornitori).
--
-- Idempotente: aggiorna SOLO i record con valore corrente
-- 'codice_destinatario' (non sovrascrive customizzazioni utente).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

UPDATE mc
   SET mc.mcuilookupdata_text_field = 'ragione_sociale'
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE mc.mc_ui_column_type = 'lookupByID'
   AND mc.mcuilookupentityname IN ('clienti','fornitori')
   AND mc.mcuilookupdata_text_field = 'codice_destinatario';

SELECT t.mdroutename AS route,
       mc.mc_nome_colonna AS col,
       mc.mcuilookupentityname AS entity,
       mc.mcuilookupdata_text_field AS textF
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE mc.mc_ui_column_type = 'lookupByID'
   AND mc.mcuilookupentityname IN ('clienti','fornitori')
 ORDER BY t.mdroutename, mc.mc_nome_colonna;
