-- 2026-05-08 — Trasforma fatture_inviate.stato e fatture_inviate.stato_sdi
-- in campi dictionary (mc_ui_column_type='dictionary' + mcdictionaryvalue).
--
-- Razionale: i due campi hanno un set chiuso di valori canonici (BOZZA/EMESSA/...
-- per stato; INVIATA/CONSEGNATA/RIFIUTATA/... per stato_sdi). Non serve una
-- tabella di lookup separata - il rendering avviene da un dictionary inline
-- definito direttamente nel metadata della colonna.
--
-- Vedi skill: skills/metadata-tables-columns/SKILL.md "Casi speciali — column-type dictionary"

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- stato: status documento interno
UPDATE c
   SET c.mc_ui_column_type = 'dictionary',
       c.mcdictionaryvalue = N'BOZZA@@Bozza||EMESSA@@Emessa||ANNULLATA@@Annullata||PAGATA@@Pagata'
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename = 'fatture_inviate'
   AND c.mc_nome_colonna = 'stato';
GO

-- stato_sdi: stato workflow Sistema di Interscambio (Agenzia Entrate)
-- Codici canonici SDI: AT (attestazione trasm.), NS (notifica scarto),
-- NE (notifica esito), DT (decorrenza termini), MC (mancata consegna),
-- RC (ricevuta consegna). Esposti come stati user-friendly.
UPDATE c
   SET c.mc_ui_column_type = 'dictionary',
       c.mcdictionaryvalue = N'INVIATA@@Inviata||CONSEGNATA@@Consegnata||MANCATA_CONSEGNA@@Mancata consegna||RIFIUTATA@@Rifiutata||ACCETTATA@@Accettata||DECORRENZA_TERMINI@@Decorrenza termini'
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename = 'fatture_inviate'
   AND c.mc_nome_colonna = 'stato_sdi';
GO

-- Verifica idempotente
SELECT t.mdroutename, c.mc_nome_colonna, c.mc_ui_column_type,
       CAST(c.mcdictionaryvalue AS NVARCHAR(500)) AS dict
  FROM _metadati__colonne c
  JOIN _metadati__tabelle t ON t.md_id = c.md_id
 WHERE t.mdroutename = 'fatture_inviate'
   AND c.mc_nome_colonna IN ('stato','stato_sdi')
 ORDER BY c.mc_nome_colonna;
GO
