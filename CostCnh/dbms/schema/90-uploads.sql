-- =============================================================================
-- CostCnh_Data — Sprint 6: bulk uploads staging schema
-- =============================================================================
-- Pipeline: client POST CSV → uploads.batch + uploads.row (staging) →
--   outbox event 'uploads_process' → scheduler outbox_dispatch dispatcha per kind
--   → handler scrive in tabella target (wf.allocation, cp.facts, ecc.) →
--   uploads.processing_log audita per-row.
--
-- Sostituisce facts.AddinBulkOperationLog + ProcessUploadJob (Hangfire) legacy.
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

IF SCHEMA_ID('uploads') IS NULL EXEC('CREATE SCHEMA [uploads]');
GO

-- ── uploads.batch (header) ───────────────────────────────────────────────────
IF OBJECT_ID(N'[uploads].[batch]', N'U') IS NULL
BEGIN
    CREATE TABLE [uploads].[batch] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_uploads_batch PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_uploads_batch_public_id DEFAULT (NEWSEQUENTIALID()),
        upload_kind             VARCHAR(40) NOT NULL,                          -- 'workforce' | 'planned' | 'baseline'
        program_id              INT NULL CONSTRAINT FK_uploads_batch_program REFERENCES [core].[program](id),
        scenario_id             INT NULL CONSTRAINT FK_uploads_batch_scenario REFERENCES [core].[project_scenario](id),
        original_filename       NVARCHAR(400) NULL,
        row_count               INT NOT NULL CONSTRAINT DF_uploads_batch_row_count DEFAULT (0),
        accepted_count          INT NOT NULL CONSTRAINT DF_uploads_batch_accepted_count DEFAULT (0),
        rejected_count          INT NOT NULL CONSTRAINT DF_uploads_batch_rejected_count DEFAULT (0),
        status                  TINYINT NOT NULL CONSTRAINT DF_uploads_batch_status DEFAULT (0),
                                -- 0=staged, 1=processing, 2=completed, 9=failed
        outbox_id               BIGINT NULL,                                   -- riferimento all'evento di processing
        last_error              NVARCHAR(2000) NULL,
        started_at_utc          DATETIME2(3) NULL,
        completed_at_utc        DATETIME2(3) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_uploads_batch_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_uploads_batch_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_uploads_batch_public_id UNIQUE (public_id)
    );
    CREATE INDEX ix_uploads_batch_kind_status ON [uploads].[batch](upload_kind, status, data_creazione DESC) WHERE cancellato = 0;
    CREATE INDEX ix_uploads_batch_program ON [uploads].[batch](program_id) WHERE cancellato = 0 AND program_id IS NOT NULL;
    PRINT '[90] uploads.batch created';
END
GO

-- ── uploads.row (payload staging — append-only) ──────────────────────────────
IF OBJECT_ID(N'[uploads].[row]', N'U') IS NULL
BEGIN
    CREATE TABLE [uploads].[row] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_uploads_row PRIMARY KEY CLUSTERED,
        batch_id                BIGINT NOT NULL CONSTRAINT FK_uploads_row_batch REFERENCES [uploads].[batch](id) ON DELETE CASCADE,
        row_number              INT NOT NULL,
        payload_json            NVARCHAR(MAX) NOT NULL,
        processing_status       TINYINT NOT NULL CONSTRAINT DF_uploads_row_processing_status DEFAULT (0),
                                -- 0=pending, 1=accepted, 2=rejected
        error_message           NVARCHAR(2000) NULL,
        target_id               BIGINT NULL,                                   -- id riga inserita nella tabella target dopo processing
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_uploads_row_data_creazione DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_uploads_row_batch ON [uploads].[row](batch_id, processing_status);
    PRINT '[90] uploads.row created';
END
GO

-- ── uploads.processing_log (per-row audit dopo processing) ──────────────────
IF OBJECT_ID(N'[uploads].[processing_log]', N'U') IS NULL
BEGIN
    CREATE TABLE [uploads].[processing_log] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_uploads_processing_log PRIMARY KEY CLUSTERED,
        batch_id                BIGINT NOT NULL CONSTRAINT FK_uploads_processing_log_batch REFERENCES [uploads].[batch](id) ON DELETE CASCADE,
        row_id                  BIGINT NULL CONSTRAINT FK_uploads_processing_log_row REFERENCES [uploads].[row](id),
        log_level               TINYINT NOT NULL,                              -- 0=info, 1=warn, 2=error
        message                 NVARCHAR(2000) NOT NULL,
        details_json            NVARCHAR(MAX) NULL,
        logged_at_utc           DATETIME2(3) NOT NULL CONSTRAINT DF_uploads_processing_log_logged_at_utc DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_uploads_processing_log_batch_level ON [uploads].[processing_log](batch_id, log_level);
    PRINT '[90] uploads.processing_log created';
END
GO

PRINT '[90-uploads] DONE';
GO
