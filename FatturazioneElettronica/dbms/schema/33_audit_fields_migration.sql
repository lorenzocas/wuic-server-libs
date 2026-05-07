-- ====================================================================
-- 33_audit_fields_migration.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Block 6 #26: aggiunge le colonne audit mancanti su tabelle critiche.
--
-- Standard framework WUIC (campi auto-popolati dal CRUD layer quando
-- mdloggingenable=1 e i fieldname corrispondenti sono valorizzati nel
-- _metadati__tabelle):
--   - cancellato         BIT       NOT NULL DEFAULT 0   (logic-delete)
--   - data_creazione     DATETIME  NOT NULL DEFAULT GETDATE()
--   - data_modifica      DATETIME  NULL
--   - utente_creazione   INT       NULL
--   - utente_modifica    INT       NULL
--
-- Idempotente: ogni ALTER e' guarded con IF COL_LENGTH IS NULL.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE FatturazioneElettronica_Data;
GO

-- ── clienti: + utente_creazione, utente_modifica ─────────────────
IF COL_LENGTH('dbo.clienti','utente_creazione') IS NULL
    ALTER TABLE dbo.clienti ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.clienti','utente_modifica') IS NULL
    ALTER TABLE dbo.clienti ADD utente_modifica INT NULL;
GO

-- ── fornitori: + utente_creazione, utente_modifica ──────────────
IF COL_LENGTH('dbo.fornitori','utente_creazione') IS NULL
    ALTER TABLE dbo.fornitori ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.fornitori','utente_modifica') IS NULL
    ALTER TABLE dbo.fornitori ADD utente_modifica INT NULL;
GO

-- ── fatture_ricevute: + utente_creazione, utente_modifica ──────
IF COL_LENGTH('dbo.fatture_ricevute','utente_creazione') IS NULL
    ALTER TABLE dbo.fatture_ricevute ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.fatture_ricevute','utente_modifica') IS NULL
    ALTER TABLE dbo.fatture_ricevute ADD utente_modifica INT NULL;
GO

-- ── prodotti: + utente_creazione, utente_modifica ──────────────
IF COL_LENGTH('dbo.prodotti','utente_creazione') IS NULL
    ALTER TABLE dbo.prodotti ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.prodotti','utente_modifica') IS NULL
    ALTER TABLE dbo.prodotti ADD utente_modifica INT NULL;
GO

-- ── scadenze: + data_modifica, utente_creazione, utente_modifica
IF COL_LENGTH('dbo.scadenze','data_modifica') IS NULL
    ALTER TABLE dbo.scadenze ADD data_modifica DATETIME NULL;
IF COL_LENGTH('dbo.scadenze','utente_creazione') IS NULL
    ALTER TABLE dbo.scadenze ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.scadenze','utente_modifica') IS NULL
    ALTER TABLE dbo.scadenze ADD utente_modifica INT NULL;
GO

-- ── movimenti_bancari: + tutti i campi audit (mancano TUTTI) ────
IF COL_LENGTH('dbo.movimenti_bancari','cancellato') IS NULL
    ALTER TABLE dbo.movimenti_bancari ADD cancellato BIT NOT NULL CONSTRAINT DF_movbnc_cancellato DEFAULT 0;
IF COL_LENGTH('dbo.movimenti_bancari','data_creazione') IS NULL
    ALTER TABLE dbo.movimenti_bancari ADD data_creazione DATETIME NOT NULL CONSTRAINT DF_movbnc_data_creazione DEFAULT GETDATE();
IF COL_LENGTH('dbo.movimenti_bancari','data_modifica') IS NULL
    ALTER TABLE dbo.movimenti_bancari ADD data_modifica DATETIME NULL;
IF COL_LENGTH('dbo.movimenti_bancari','utente_creazione') IS NULL
    ALTER TABLE dbo.movimenti_bancari ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.movimenti_bancari','utente_modifica') IS NULL
    ALTER TABLE dbo.movimenti_bancari ADD utente_modifica INT NULL;
GO

-- ── email_template: + utente_creazione, utente_modifica ────────
IF COL_LENGTH('dbo.email_template','utente_creazione') IS NULL
    ALTER TABLE dbo.email_template ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.email_template','utente_modifica') IS NULL
    ALTER TABLE dbo.email_template ADD utente_modifica INT NULL;
GO

-- ── banche: + data_modifica, utente_creazione, utente_modifica ──
IF COL_LENGTH('dbo.banche','data_modifica') IS NULL
    ALTER TABLE dbo.banche ADD data_modifica DATETIME NULL;
IF COL_LENGTH('dbo.banche','utente_creazione') IS NULL
    ALTER TABLE dbo.banche ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.banche','utente_modifica') IS NULL
    ALTER TABLE dbo.banche ADD utente_modifica INT NULL;
GO

-- ── pagamenti: + data_modifica, utente_creazione, utente_modifica
IF COL_LENGTH('dbo.pagamenti','data_modifica') IS NULL
    ALTER TABLE dbo.pagamenti ADD data_modifica DATETIME NULL;
IF COL_LENGTH('dbo.pagamenti','utente_creazione') IS NULL
    ALTER TABLE dbo.pagamenti ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.pagamenti','utente_modifica') IS NULL
    ALTER TABLE dbo.pagamenti ADD utente_modifica INT NULL;
GO

-- ── codici_iva: + utente_creazione, utente_modifica ────────────
IF COL_LENGTH('dbo.codici_iva','utente_creazione') IS NULL
    ALTER TABLE dbo.codici_iva ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.codici_iva','utente_modifica') IS NULL
    ALTER TABLE dbo.codici_iva ADD utente_modifica INT NULL;
GO

-- ── unita_misura: + data_modifica, utente_creazione, utente_modifica
IF COL_LENGTH('dbo.unita_misura','data_modifica') IS NULL
    ALTER TABLE dbo.unita_misura ADD data_modifica DATETIME NULL;
IF COL_LENGTH('dbo.unita_misura','utente_creazione') IS NULL
    ALTER TABLE dbo.unita_misura ADD utente_creazione INT NULL;
IF COL_LENGTH('dbo.unita_misura','utente_modifica') IS NULL
    ALTER TABLE dbo.unita_misura ADD utente_modifica INT NULL;
GO

PRINT '=== Step 1: Audit columns aggiunte ===';
SELECT 'clienti' AS tbl, COL_LENGTH('dbo.clienti','utente_creazione') AS u_creaz, COL_LENGTH('dbo.clienti','utente_modifica') AS u_modif
UNION ALL SELECT 'fornitori', COL_LENGTH('dbo.fornitori','utente_creazione'), COL_LENGTH('dbo.fornitori','utente_modifica')
UNION ALL SELECT 'fatture_ricevute', COL_LENGTH('dbo.fatture_ricevute','utente_creazione'), COL_LENGTH('dbo.fatture_ricevute','utente_modifica')
UNION ALL SELECT 'prodotti', COL_LENGTH('dbo.prodotti','utente_creazione'), COL_LENGTH('dbo.prodotti','utente_modifica')
UNION ALL SELECT 'scadenze', COL_LENGTH('dbo.scadenze','utente_creazione'), COL_LENGTH('dbo.scadenze','utente_modifica')
UNION ALL SELECT 'movimenti_bancari', COL_LENGTH('dbo.movimenti_bancari','utente_creazione'), COL_LENGTH('dbo.movimenti_bancari','utente_modifica')
UNION ALL SELECT 'email_template', COL_LENGTH('dbo.email_template','utente_creazione'), COL_LENGTH('dbo.email_template','utente_modifica')
UNION ALL SELECT 'banche', COL_LENGTH('dbo.banche','utente_creazione'), COL_LENGTH('dbo.banche','utente_modifica')
UNION ALL SELECT 'pagamenti', COL_LENGTH('dbo.pagamenti','utente_creazione'), COL_LENGTH('dbo.pagamenti','utente_modifica')
UNION ALL SELECT 'codici_iva', COL_LENGTH('dbo.codici_iva','utente_creazione'), COL_LENGTH('dbo.codici_iva','utente_modifica')
UNION ALL SELECT 'unita_misura', COL_LENGTH('dbo.unita_misura','utente_creazione'), COL_LENGTH('dbo.unita_misura','utente_modifica');
GO
