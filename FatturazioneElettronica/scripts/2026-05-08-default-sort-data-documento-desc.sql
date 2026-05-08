-- =============================================================================
-- Patch: imposta `data_documento DESC` come default sort per le 8 route
-- documenti. Cosi' post-save il nuovo record (data_documento=oggi) appare
-- in cima alla grid -> niente paginazione race-condition nei test e2e.
--
-- Idempotente: pulisce qualsiasi sort default precedente sulle altre colonne
-- delle stesse tabelle (un solo campo "default sort" per route).
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @routes TABLE (route VARCHAR(100));
INSERT INTO @routes(route) VALUES
  ('fatture_inviate'), ('fatture_ricevute'),
  ('preventivi'), ('ordini'), ('ddt'),
  ('ordini_acquisto'), ('ordini_elettronici'), ('proforma');

-- 1) Reset default sort sulle altre colonne (mantiene un solo sort attivo
--    per route)
UPDATE mc
   SET mc.mcdefaultsort = NULL,
       mc.mcdefaultmultisortorder = NULL
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE t.mdroutename IN (SELECT route FROM @routes)
   AND mc.mc_nome_colonna <> 'data_documento';

-- 2) Imposta data_documento DESC come default sort
UPDATE mc
   SET mc.mcdefaultsort = 'DESC',
       mc.mcdefaultmultisortorder = 1
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE t.mdroutename IN (SELECT route FROM @routes)
   AND mc.mc_nome_colonna = 'data_documento';

-- Verifica
SELECT t.mdroutename, mc.mc_nome_colonna, mc.mcdefaultsort, mc.mcdefaultmultisortorder
  FROM _metadati__colonne mc
  JOIN _metadati__tabelle t ON t.md_id = mc.md_id
 WHERE t.mdroutename IN (SELECT route FROM @routes)
   AND mc.mcdefaultsort IS NOT NULL
 ORDER BY t.mdroutename;
