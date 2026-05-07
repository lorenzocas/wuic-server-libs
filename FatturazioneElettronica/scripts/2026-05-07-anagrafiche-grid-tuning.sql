-- =============================================================================
-- Patch metadata: anagrafiche grid tuning @ 1920x1080
-- =============================================================================
-- Data:     2026-05-07
-- DB:       FatturazioneElettronica_Metadata (MetaDataSQLConnection)
-- Scope:    7 anagrafiche + 1 view
--           clienti, fornitori, prodotti, banche, codici_iva, pagamenti,
--           unita_misura, vw_anagrafica_unificata
-- Obiettivo:
--   1) larghezze colonne (mcuigridsizewidth) coerenti al contenuto a 1920x1080
--   2) nascondere (mchideinlist=1) colonne meno importanti per evitare scroll
--      orizzontale + truncation con "..."
--   3) abilitare md_detail_action=1 (mddetailaction) cosi' l'utente apre la
--      vista detail (parametric-dialog read-only) e vede TUTTI i campi.
-- Idempotente: solo UPDATE su righe esistenti (matching mc_nome_colonna).
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

DECLARE @md_clienti      INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'clienti');
DECLARE @md_fornitori    INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'fornitori');
DECLARE @md_prodotti     INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'prodotti');
DECLARE @md_banche       INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'banche');
DECLARE @md_codiva       INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'codici_iva');
DECLARE @md_pagamenti    INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'pagamenti');
DECLARE @md_unitamisura  INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'unita_misura');
DECLARE @md_vwanag       INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'vw_anagrafica_unificata');

-- ---------------------------------------------------------------------------
-- md_detail_action = 1 su tutte le 8 anagrafiche
-- ---------------------------------------------------------------------------
UPDATE _metadati__tabelle SET mddetailaction = 1
 WHERE md_id IN (@md_clienti, @md_fornitori, @md_prodotti, @md_banche,
                 @md_codiva, @md_pagamenti, @md_unitamisura, @md_vwanag);

-- ---------------------------------------------------------------------------
-- CLIENTI (md_id = @md_clienti)
-- ---------------------------------------------------------------------------
-- Allarga
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'codice';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'ragione_sociale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'partita_iva';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'citta';
UPDATE _metadati__colonne SET mcuigridsizewidth = 60,  mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'provincia';
UPDATE _metadati__colonne SET mcuigridsizewidth = 220, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'email';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'telefono';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'pagamento_default';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_clienti AND mc_nome_colonna = 'attivo';
-- Nascondi
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_clienti AND mc_nome_colonna IN
  ('tipo_soggetto','codice_fiscale','indirizzo','cap','nazione','pec','codice_destinatario',
   'sito_web','sconto_default','fido','note','cancellato','data_creazione','data_modifica');

-- ---------------------------------------------------------------------------
-- FORNITORI (md_id = @md_fornitori)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'codice';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'ragione_sociale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'partita_iva';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'citta';
UPDATE _metadati__colonne SET mcuigridsizewidth = 60,  mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'provincia';
UPDATE _metadati__colonne SET mcuigridsizewidth = 220, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'email';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'telefono';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'pagamento_default';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_fornitori AND mc_nome_colonna = 'attivo';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_fornitori AND mc_nome_colonna IN
  ('tipo_soggetto','codice_fiscale','indirizzo','cap','nazione','pec','codice_destinatario',
   'sito_web','iban','note','cancellato','data_creazione','data_modifica');

-- ---------------------------------------------------------------------------
-- PRODOTTI (md_id = @md_prodotti)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'codice';
UPDATE _metadati__colonne SET mcuigridsizewidth = 300, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'tipo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'unita_misura_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'codice_iva_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'prezzo_vendita';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'prezzo_acquisto';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'categoria';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_prodotti AND mc_nome_colonna = 'attivo';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_prodotti AND mc_nome_colonna IN
  ('sconto_default','note','cancellato','data_creazione','data_modifica');

-- ---------------------------------------------------------------------------
-- BANCHE (md_id = @md_banche)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'nome_banca';
UPDATE _metadati__colonne SET mcuigridsizewidth = 220, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 220, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'iban';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'bic_swift';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'intestatario';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'saldo_iniziale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'valuta';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'predefinita';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_banche AND mc_nome_colonna = 'attivo';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_banche AND mc_nome_colonna IN
  ('abi','cab','note','cancellato','data_creazione');

-- ---------------------------------------------------------------------------
-- CODICI_IVA (md_id = @md_codiva)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'codice';
UPDATE _metadati__colonne SET mcuigridsizewidth = 260, mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'aliquota';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'natura_sdi';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'indetraibile';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'perc_indetraib';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_codiva AND mc_nome_colonna = 'attivo';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_codiva AND mc_nome_colonna IN
  ('note','cancellato','data_creazione','data_modifica');

-- ---------------------------------------------------------------------------
-- PAGAMENTI (md_id = @md_pagamenti)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'codice_sdi';
UPDATE _metadati__colonne SET mcuigridsizewidth = 300, mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'giorni_scadenza';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'tipo_scadenza';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'n_rate';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_pagamenti AND mc_nome_colonna = 'attivo';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_pagamenti AND mc_nome_colonna IN
  ('note','cancellato','data_creazione');

-- ---------------------------------------------------------------------------
-- UNITA_MISURA (md_id = @md_unitamisura) - struttura semplice, mantengo auto
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_unitamisura AND mc_nome_colonna IN
  ('cancellato','data_creazione');

-- ---------------------------------------------------------------------------
-- VW_ANAGRAFICA_UNIFICATA (md_id = @md_vwanag)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'tipo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'codice_cliente';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'codice_fornitore';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'ragione_sociale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'partita_iva';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'citta';
UPDATE _metadati__colonne SET mcuigridsizewidth = 60,  mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'provincia';
UPDATE _metadati__colonne SET mcuigridsizewidth = 220, mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'email';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_vwanag AND mc_nome_colonna = 'telefono';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_vwanag AND mc_nome_colonna IN
  ('codice_fiscale','tipo_soggetto','indirizzo','cap','nazione','pec');

-- ---------------------------------------------------------------------------
-- Verifica post-patch
-- ---------------------------------------------------------------------------
SELECT t.mdroutename, ISNULL(t.mddetailaction,0) AS detail_btn,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=0 THEN 1 ELSE 0 END) AS visible_cols,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=1 THEN 1 ELSE 0 END) AS hidden_cols,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=0 THEN ISNULL(c.mcuigridsizewidth,0) ELSE 0 END) AS sum_width
  FROM _metadati__tabelle t
  LEFT JOIN _metadati__colonne c ON c.md_id = t.md_id
 WHERE t.md_id IN (@md_clienti, @md_fornitori, @md_prodotti, @md_banche,
                   @md_codiva, @md_pagamenti, @md_unitamisura, @md_vwanag)
 GROUP BY t.mdroutename, t.mddetailaction
 ORDER BY t.mdroutename;
