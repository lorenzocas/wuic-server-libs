/* ============================================================
   44_sdi_provider_cursor.sql

   Cursor di paginazione persistente per i poller SDI provider.
   Ogni provider commerciale (ArubaPec, FatturePec, PecIt, Notarify)
   espone un endpoint REST/SOAP per scaricare le notifiche pendenti.
   Per non riconsumare le notifiche già processate, ogni poller tiene
   un cursore opaco specifico (lastReceivedId, ultimo timestamp,
   pagina, ecc.) — il formato esatto e' provider-specifico, lo
   memorizziamo come stringa generica + `metadata_json` flessibile.

   La dedup di sicurezza e' comunque fatta lato applier
   (`sdi_notifications` UNIQUE su pec_message_id+notification_type+
   nome_file). Il cursore e' un'OTTIMIZZAZIONE per ridurre
   roundtrip e rispettare rate limit, non un meccanismo di
   correttezza: anche con cursore corrotto/perso il sistema resta
   idempotente.

   Target DB: DATA (DataSQLConnection) — vedi PecImapNotificationPoller
   che gia' usa DataConn. Coerenza con il resto della pipeline SDI
   (sdi_notifications, fatture_inviate sono sul DB Dati).
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

IF OBJECT_ID(N'dbo.sdi_provider_cursor', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sdi_provider_cursor (
        id                  INT IDENTITY(1,1) NOT NULL,
        provider_name       NVARCHAR(64)  NOT NULL,
        last_received_id    NVARCHAR(255) NULL,
        last_received_at    DATETIME2     NULL,
        last_poll_at        DATETIME2     NULL,
        last_poll_status    NVARCHAR(32)  NULL,   -- 'OK' | 'FAIL' | 'EMPTY'
        last_poll_message   NVARCHAR(MAX) NULL,
        items_pulled        INT           NOT NULL DEFAULT 0,
        metadata_json       NVARCHAR(MAX) NULL,   -- per-provider state opaco

        -- audit standard 7 colonne (regola db-schema-scaffolding 5-quater)
        cancellato                BIT          NOT NULL DEFAULT 0,
        data_creazione            DATETIME     NOT NULL DEFAULT GETDATE(),
        data_modifica             DATETIME     NULL,
        data_eliminazione         DATETIME     NULL,
        utente_creazione          INT          NULL,
        utente_modifica           INT          NULL,
        utente_eliminazione       INT          NULL,

        CONSTRAINT PK_sdi_provider_cursor PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_sdi_provider_cursor_name UNIQUE (provider_name)
    );

    PRINT 'CREATE TABLE dbo.sdi_provider_cursor';
END
ELSE
    PRINT 'SKIP: dbo.sdi_provider_cursor gia esistente';
GO
