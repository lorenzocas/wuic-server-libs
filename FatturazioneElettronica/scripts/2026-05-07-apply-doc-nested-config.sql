-- =============================================================================
-- Patch metadata: master-detail config per documenti commerciali
-- =============================================================================
-- Data:     2026-05-07
-- DB:       FatturazioneElettronica_Metadata
-- Scope:    Aggiunge mdnestedgridroutes su fatture_ricevute / preventivi /
--           ordini (fatture_inviate gia' configurato) e abilita inline edit
--           + batch save sulle 4 tabelle righe per editing inline a la Aruba.
-- Idempotente: solo UPDATE.
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- ---------------------------------------------------------------------------
-- mdnestedgridroutes: master -> nested grid (formato CSV pipe del framework)
--   <route>||<parentKey=id>||<fkKey>||<caption>||,...
-- ---------------------------------------------------------------------------
UPDATE _metadati__tabelle
   SET mdnestedgridroutes = 'fatture_ricevute_righe||id||fattura_id||Dettaglio righe fattura ricevuta||'
 WHERE mdroutename = 'fatture_ricevute';

UPDATE _metadati__tabelle
   SET mdnestedgridroutes = 'preventivi_righe||id||preventivo_id||Dettaglio righe preventivo||'
 WHERE mdroutename = 'preventivi';

UPDATE _metadati__tabelle
   SET mdnestedgridroutes = 'ordini_righe||id||ordine_id||Dettaglio righe ordine||'
 WHERE mdroutename = 'ordini';

-- ---------------------------------------------------------------------------
-- md_inline_edit + md_batch_save sulle 4 tabelle righe.
--   md_inline_edit  (mdinlineedit)  -> abilita editing inline row-level
--   md_batch_save   (mdbatchsave)   -> abilita Save changes / Cancel changes
-- ---------------------------------------------------------------------------
UPDATE _metadati__tabelle
   SET mdinlineedit = 1, mdbatchsave = 1
 WHERE mdroutename IN ('fatture_inviate_righe','fatture_ricevute_righe',
                       'preventivi_righe','ordini_righe');

-- Verifica post-patch
SELECT mdroutename, ISNULL(mdinlineedit,0) AS il, ISNULL(mdbatchsave,0) AS bs,
       LEFT(ISNULL(mdnestedgridroutes,''), 80) AS nested
  FROM _metadati__tabelle
 WHERE mdroutename IN ('fatture_inviate','fatture_ricevute','preventivi','ordini',
                       'fatture_inviate_righe','fatture_ricevute_righe',
                       'preventivi_righe','ordini_righe')
 ORDER BY mdroutename;
