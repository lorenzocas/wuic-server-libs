-- =============================================================================
-- Patch metadata: grid column visibility pass (Vendite + Acquisti + Documenti + Finanze)
-- =============================================================================
-- Data:     2026-05-07
-- DB:       FatturazioneElettronica_Metadata (MetaDataSQLConnection)
-- Scope:    13 route (estensione del pass anagrafiche del 2026-05-07)
--           Vendite:    preventivi, ordini, ordini_elettronici, ddt, proforma
--           Acquisti:   ordini_acquisto
--           Documenti:  fatture_inviate, fatture_ricevute, email_log, email_template
--           Finanze:    prima_nota, corrispettivi, movimenti_bancari
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

DECLARE @md_preventivi    INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'preventivi');
DECLARE @md_ordini        INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'ordini');
DECLARE @md_ord_el        INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'ordini_elettronici');
DECLARE @md_ddt           INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'ddt');
DECLARE @md_proforma      INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'proforma');
DECLARE @md_ord_acq       INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'ordini_acquisto');
DECLARE @md_fatt_inv      INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'fatture_inviate');
DECLARE @md_fatt_ric      INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'fatture_ricevute');
DECLARE @md_email_log     INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'email_log');
DECLARE @md_email_tpl     INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'email_template');
DECLARE @md_prima_nota    INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'prima_nota');
DECLARE @md_corrispettivi INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'corrispettivi');
DECLARE @md_mov_banc      INT = (SELECT md_id FROM _metadati__tabelle WHERE mdroutename = 'movimenti_bancari');

-- ---------------------------------------------------------------------------
-- md_detail_action = 1 su tutte le 13 route
-- ---------------------------------------------------------------------------
UPDATE _metadati__tabelle SET mddetailaction = 1
 WHERE md_id IN (@md_preventivi, @md_ordini, @md_ord_el, @md_ddt, @md_proforma,
                 @md_ord_acq, @md_fatt_inv, @md_fatt_ric, @md_email_log,
                 @md_email_tpl, @md_prima_nota, @md_corrispettivi, @md_mov_banc);

-- ---------------------------------------------------------------------------
-- PREVENTIVI (Vendite)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'data_validita';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'oggetto';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_preventivi AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_preventivi AND mc_nome_colonna IN ('progressivo','imponibile','iva','note');

-- ---------------------------------------------------------------------------
-- ORDINI (Vendite)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'data_consegna';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'riferimento_cliente';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_ordini AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_ordini AND mc_nome_colonna IN ('progressivo','imponibile','iva','note');

-- ---------------------------------------------------------------------------
-- ORDINI_ELETTRONICI (Vendite, NSO)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'numero_pa';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'data_ricezione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'cig';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_ord_el AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_ord_el AND mc_nome_colonna IN
  ('progressivo_interno','cup','file_xml','nso_message_id','imponibile','iva','note','cancellato','data_creazione');

-- ---------------------------------------------------------------------------
-- DDT (Vendite)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'causale_trasporto';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'vettore';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_ddt AND mc_nome_colonna = 'fattura_id';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_ddt AND mc_nome_colonna IN
  ('progressivo','aspetto_beni','n_colli','peso_lordo','porto','data_ora_trasporto','note');

-- ---------------------------------------------------------------------------
-- PROFORMA (Vendite)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_proforma AND mc_nome_colonna = 'fattura_id';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_proforma AND mc_nome_colonna IN ('progressivo','imponibile','iva','note');

-- ---------------------------------------------------------------------------
-- ORDINI_ACQUISTO (Acquisti)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'data_consegna';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'fornitore_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'riferimento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_ord_acq AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_ord_acq AND mc_nome_colonna IN ('progressivo','imponibile','iva','note');

-- ---------------------------------------------------------------------------
-- FATTURE_INVIATE (Documenti) - 22 col @50px = pasticcio totale
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'numero';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'serie';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_fatt_inv AND mc_nome_colonna = 'stato_sdi';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_fatt_inv AND mc_nome_colonna IN
  ('progressivo','pagamento_id','banca_id','causale','riferimento_ordine','bollo_valore',
   'sconto_globale_perc','imponibile','iva','sdi_id','sdi_messaggio','file_xml','note',
   'cancellato','data_creazione','data_modifica','utente_creazione','utente_modifica');

-- ---------------------------------------------------------------------------
-- FATTURE_RICEVUTE (Documenti) - 19 col @50px
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'numero_fornitore';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'anno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'data_documento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'data_ricezione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'fornitore_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 100, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'stato';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_fatt_ric AND mc_nome_colonna = 'stato_sdi';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_fatt_ric AND mc_nome_colonna IN
  ('progressivo_interno','pagamento_id','causale','imponibile','iva','iva_indetraibile',
   'file_xml','note','cancellato','data_creazione','data_modifica');

-- ---------------------------------------------------------------------------
-- EMAIL_LOG (Documenti)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'sent_at';
UPDATE _metadati__colonne SET mcuigridsizewidth = 200, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'recipient_to';
UPDATE _metadati__colonne SET mcuigridsizewidth = 260, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'subject';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'fattura_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'status';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_email_log AND mc_nome_colonna = 'smtp_response';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_email_log AND mc_nome_colonna IN
  ('recipient_cc','body','attachment_paths','created_at','utente_creazione');

-- ---------------------------------------------------------------------------
-- EMAIL_TEMPLATE (Documenti) - struttura snella, allargo solo
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_email_tpl AND mc_nome_colonna = 'codice';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_email_tpl AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_email_tpl AND mc_nome_colonna = 'categoria';
UPDATE _metadati__colonne SET mcuigridsizewidth = 300, mchideinlist = 0 WHERE md_id = @md_email_tpl AND mc_nome_colonna = 'oggetto';
UPDATE _metadati__colonne SET mcuigridsizewidth = 70,  mchideinlist = 0 WHERE md_id = @md_email_tpl AND mc_nome_colonna = 'attivo';

-- ---------------------------------------------------------------------------
-- PRIMA_NOTA (Finanze) - molti lookup, taglio i meno usati
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'data_movimento';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'tipo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'causale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'importo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'banca_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'cliente_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_prima_nota AND mc_nome_colonna = 'fornitore_id';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_prima_nota AND mc_nome_colonna IN
  ('fattura_inviata_id','fattura_ricevuta_id','scadenza_id','riferimento_doc','note');

-- ---------------------------------------------------------------------------
-- CORRISPETTIVI (Finanze)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'data_giorno';
UPDATE _metadati__colonne SET mcuigridsizewidth = 90,  mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'progressivo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'imponibile';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'iva';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'totale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'codice_iva_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_corrispettivi AND mc_nome_colonna = 'metodo_pagamento';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_corrispettivi AND mc_nome_colonna IN ('note');

-- ---------------------------------------------------------------------------
-- MOVIMENTI_BANCARI (Finanze)
-- ---------------------------------------------------------------------------
UPDATE _metadati__colonne SET mcuigridsizewidth = 140, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'banca_id';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'data_operazione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 120, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'importo';
UPDATE _metadati__colonne SET mcuigridsizewidth = 160, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'causale';
UPDATE _metadati__colonne SET mcuigridsizewidth = 240, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'descrizione';
UPDATE _metadati__colonne SET mcuigridsizewidth = 180, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'nome_controparte';
UPDATE _metadati__colonne SET mcuigridsizewidth = 110, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'match_status';
UPDATE _metadati__colonne SET mcuigridsizewidth = 130, mchideinlist = 0 WHERE md_id = @md_mov_banc AND mc_nome_colonna = 'scadenza_id';
UPDATE _metadati__colonne SET mchideinlist = 1 WHERE md_id = @md_mov_banc AND mc_nome_colonna IN
  ('data_valuta','iban_controparte','riferimento','match_score','import_batch_id','created_at');

-- ---------------------------------------------------------------------------
-- Verifica post-patch
-- ---------------------------------------------------------------------------
SELECT t.mdroutename, ISNULL(t.mddetailaction,0) AS detail_btn,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=0 THEN 1 ELSE 0 END) AS visible_cols,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=1 THEN 1 ELSE 0 END) AS hidden_cols,
       SUM(CASE WHEN ISNULL(c.mchideinlist,0)=0 THEN ISNULL(c.mcuigridsizewidth,0) ELSE 0 END) AS sum_width
  FROM _metadati__tabelle t
  LEFT JOIN _metadati__colonne c ON c.md_id = t.md_id
 WHERE t.md_id IN (@md_preventivi, @md_ordini, @md_ord_el, @md_ddt, @md_proforma,
                   @md_ord_acq, @md_fatt_inv, @md_fatt_ric, @md_email_log,
                   @md_email_tpl, @md_prima_nota, @md_corrispettivi, @md_mov_banc)
 GROUP BY t.mdroutename, t.mddetailaction
 ORDER BY t.mdroutename;
