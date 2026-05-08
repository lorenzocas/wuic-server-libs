-- =============================================================================
-- Patch: cambia `mc_ui_column_type` di `anno` da `number` a `text` su tutte
-- le route documenti.
--
-- Stato pre-patch: anno (INT in DB Dati) renderizzato dal framework come
-- p-inputNumber con `mode='decimal'` + locale `it-IT` -> applica thousands
-- separator: 2026 -> "2.026". Per un valore anno il separatore migliaia
-- non ha senso e induce l'utente a credere che sia stato mangiato il valore
-- (display "2.026" letto come 2 anziche' 2026).
--
-- Fix: usare mc_ui_column_type='text' -> text-editor render, niente
-- formattazione numerica. Il backend continua a serializzare in INT al save
-- perche' la colonna SQL e' INT (cast implicito JSON->int).
--
-- Idempotente: aggiorna SOLO i record con valore corrente 'number'.
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
   SET mc.mc_ui_column_type = 'text'
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE mc.mc_nome_colonna = 'anno'
   AND mc.mc_ui_column_type = 'number';

SELECT t.mdroutename AS route,
       mc.mc_nome_colonna AS col,
       mc.mc_ui_column_type AS type
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE mc.mc_nome_colonna = 'anno'
 ORDER BY t.mdroutename;
