/* ============================================================
   41_sdi_notifications.sql

   Schema per il tracking delle notifiche SDI ricevute da Agenzia
   delle Entrate dopo l'invio di una fattura. Tipi notifica
   (codice 3-char nel filename .xml o nel content):
     RC = Ricevuta di Consegna       -> stato_sdi=CONSEGNATA
     MC = Mancata Consegna           -> stato_sdi=MANCATA_CONSEGNA
     NS = Notifica di Scarto         -> stato_sdi=SCARTATA
     NE = Notifica Esito (PA)        -> stato_sdi=ACCETTATA o RIFIUTATA
     AT = Attestazione Trasmissione  -> nessun cambio stato (info)
     DT = Decorrenza Termini (PA)    -> stato_sdi=DECORRENZA_TERMINI

   Tabella `sdi_notifications`: una riga per ogni notifica ricevuta.
   Linkata a fatture_inviate via sdi_id (Message-ID o Identificativo
   Sdi assegnato dal provider/AdE). Audit immutabile: solo INSERT,
   no UPDATE/DELETE (le notifiche SDI sono fonte di verita').
   ============================================================ */
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;

IF OBJECT_ID('dbo.sdi_notifications', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sdi_notifications (
        id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        fattura_id      INT NULL,        -- FK opzionale (la notifica puo' precedere il match con fattura locale)
        sdi_identificativo NVARCHAR(64) NULL, -- IdentificativoSdI assegnato dall'Agenzia (univoco lato AdE)
        message_id      NVARCHAR(256) NULL, -- Message-ID PEC mittente (per match DirectPec invio)
        notification_type CHAR(2) NOT NULL,  -- RC | MC | NS | NE | AT | DT
        nome_file       NVARCHAR(256) NULL,  -- nome file notifica originale (es. ITxxx_00001_RC_001.xml)
        ricevuta_xml    NVARCHAR(MAX) NULL,  -- payload XML ricevuto (per audit / re-process)
        ricevuta_pec_id NVARCHAR(256) NULL,  -- Message-ID della PEC ricevuta (DirectPec poller)
        data_ricezione  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        applied_to_fattura BIT NOT NULL DEFAULT 0, -- 1 quando il poller ha aggiornato fatture_inviate.stato_sdi
        applied_at      DATETIME2 NULL,
        applied_error   NVARCHAR(2000) NULL, -- se l'apply fallisce (es. fattura non trovata), il messaggio
        provider_source NVARCHAR(64) NOT NULL DEFAULT 'unknown' -- DirectPec | ArubaPec | FatturePec | ...
    );
    PRINT 'Created table dbo.sdi_notifications';
END
ELSE
    PRINT 'Table dbo.sdi_notifications already exists';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sdi_notifications_fattura' AND object_id = OBJECT_ID('dbo.sdi_notifications'))
    CREATE INDEX IX_sdi_notifications_fattura ON dbo.sdi_notifications(fattura_id, data_ricezione);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sdi_notifications_sdiid' AND object_id = OBJECT_ID('dbo.sdi_notifications'))
    CREATE INDEX IX_sdi_notifications_sdiid ON dbo.sdi_notifications(sdi_identificativo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sdi_notifications_msgid' AND object_id = OBJECT_ID('dbo.sdi_notifications'))
    CREATE INDEX IX_sdi_notifications_msgid ON dbo.sdi_notifications(message_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sdi_notifications_pending' AND object_id = OBJECT_ID('dbo.sdi_notifications'))
    CREATE INDEX IX_sdi_notifications_pending ON dbo.sdi_notifications(applied_to_fattura, data_ricezione)
        WHERE applied_to_fattura = 0;

PRINT 'Indexes ensured';
