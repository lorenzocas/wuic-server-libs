-- =============================================================================
-- CostCnh_Data — Sprint 8 Phase A: MAC integration schema
-- =============================================================================
-- MAC = "Master Approval / Cost approval" workflow legacy CNH:
-- ogni cambio rilevante su programmi/budget genera una richiesta MAC esterna
-- che attende ACK del responsabile. Le risposte arrivano async tramite la PEC
-- / API esterna che il poller `costcnh_poll_mac` (Sprint 4) consuma.
--
-- Tabelle:
--   - mac.request   → richiesta uscente (status: 0=draft, 1=sent, 2=ack_received, 9=rejected)
--   - mac.response  → risposta inbound (matched to request via correlation_id)
--
-- Flusso:
--   1. user crea mac.request via list-grid (draft)
--   2. click custom action "Invia richiesta" → enqueue outbox event 'mac_send'
--   3. handler outbox: IMacRequestSender.SendMacRequestAsync (via Provider Symmetry)
--      → status=1, sent_at_utc
--      → integrations.message_envelope OUT logged
--   4. scheduler `costcnh_poll_mac` polla risposte esterne
--      → per ogni risposta: INSERT mac.response + match a mac.request via correlation
--      → UPDATE mac.request.status (2=ack o 9=reject)
--      → INotificationRepository.EnqueueAsync notifica user creator
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE [CostCnh_Data];
GO

IF SCHEMA_ID('mac') IS NULL EXEC('CREATE SCHEMA [mac]');
GO

-- ── mac.request ──────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[mac].[request]', N'U') IS NULL
BEGIN
    CREATE TABLE [mac].[request] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_mac_request PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_mac_request_public_id DEFAULT (NEWSEQUENTIALID()),
        correlation_id          VARCHAR(80) NOT NULL,                          -- echo a sistema esterno per match risposta
        request_code            VARCHAR(50) NOT NULL,                          -- es. 'MAC-2026-0001'
        program_id              INT NOT NULL CONSTRAINT FK_mac_request_program REFERENCES [core].[program](id),
        project_id              INT NULL CONSTRAINT FK_mac_request_project REFERENCES [core].[project](id),
        scenario_id             INT NULL CONSTRAINT FK_mac_request_scenario REFERENCES [core].[project_scenario](id),
        request_kind            VARCHAR(40) NOT NULL,                          -- 'baseline_change' | 'budget_increase' | 'scope_change' | ...
        subject                 NVARCHAR(500) NOT NULL,
        details                 NVARCHAR(MAX) NULL,
        amount                  DECIMAL(19,4) NULL,
        currency_id             INT NULL CONSTRAINT FK_mac_request_currency REFERENCES [core].[currency](id),
        status                  TINYINT NOT NULL CONSTRAINT DF_mac_request_status DEFAULT (0),
                                                                                -- 0=draft, 1=sent (awaiting ack), 2=ack_received, 9=rejected
        recipient_email         NVARCHAR(200) NULL,
        sent_at_utc             DATETIME2(3) NULL,
        ack_at_utc              DATETIME2(3) NULL,
        outbox_id               BIGINT NULL,                                   -- link evento `mac_send` in audit.outbox
        last_error              NVARCHAR(2000) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_mac_request_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_mac_request_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_mac_request_correlation UNIQUE (correlation_id),
        CONSTRAINT UQ_mac_request_code UNIQUE (request_code)
    );
    CREATE INDEX ix_mac_request_program_status ON [mac].[request](program_id, status, data_creazione DESC) WHERE cancellato = 0;
    CREATE INDEX ix_mac_request_status_pending ON [mac].[request](status, sent_at_utc) WHERE cancellato = 0 AND status IN (0,1);
    PRINT '[95] mac.request created (2 NC indexes)';
END
GO

-- ── mac.response ─────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[mac].[response]', N'U') IS NULL
BEGIN
    CREATE TABLE [mac].[response] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_mac_response PRIMARY KEY CLUSTERED,
        request_id              INT NULL CONSTRAINT FK_mac_response_request REFERENCES [mac].[request](id),
        correlation_id          VARCHAR(80) NOT NULL,
        external_message_id     VARCHAR(200) NULL,
        outcome                 TINYINT NOT NULL,                              -- 1=approved, 2=approved_with_changes, 9=rejected
        decision_notes          NVARCHAR(MAX) NULL,
        decided_by_external     NVARCHAR(200) NULL,
        decision_at_utc         DATETIME2(3) NULL,
        received_at_utc         DATETIME2(3) NOT NULL CONSTRAINT DF_mac_response_received_at_utc DEFAULT (SYSUTCDATETIME()),
        raw_payload_json        NVARCHAR(MAX) NULL,
        notification_id         BIGINT NULL,                                   -- link a notifica emessa al creatore
        cancellato              BIT NOT NULL CONSTRAINT DF_mac_response_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_mac_response_data_creazione DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_mac_response_request ON [mac].[response](request_id, received_at_utc DESC) WHERE request_id IS NOT NULL;
    CREATE INDEX ix_mac_response_correlation ON [mac].[response](correlation_id);
    PRINT '[95] mac.response created';
END
GO

PRINT '[95-mac-integration] DONE';
GO
