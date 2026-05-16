-- =============================================================================
-- CostCnh_Data — audit schema: access_log + outbox + DLQ
-- =============================================================================
-- Sostituisce i log scattered del legacy:
--   - CostPlanning_Facts_Log, ForecastCutoffLogs, ConversionConsolidateLog,
--     AddinBulkOperationLog, MACRequestsLogs
-- con UN solo audit.access_log centralizzato.
--
-- Sostituisce le queue Hangfire e legacy:
--   - hangfirejob.HangFireJobQueue
--   - core.ProgramConsolidationQueue
--   - facts.ForecastCalculationQueue
-- con audit.outbox + DLQ via filtered indexes + retry policy con backoff esponenziale.
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

-- ── audit.access_log (append-only, partition per mese) ───────────────────────
-- Partition function condivisa con cp.facts (pf_cp_facts_month) sul time_month_id calcolato.
IF OBJECT_ID(N'[audit].[access_log]', N'U') IS NULL
BEGIN
    CREATE TABLE [audit].[access_log] (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        event_time              DATETIME2(3) NOT NULL CONSTRAINT DF_access_log_event_time DEFAULT (SYSUTCDATETIME()),
        time_month_id           AS (YEAR(event_time) * 100 + MONTH(event_time)) PERSISTED NOT NULL,
        user_id                 INT NULL,
        session_id              UNIQUEIDENTIFIER NULL,
        app_module              NVARCHAR(64) NOT NULL,
        action                  NVARCHAR(64) NOT NULL,                         -- VIEW, INSERT, UPDATE, DELETE, EXPORT, IMPORT, LOGIN
        entity_schema           SYSNAME NULL,
        entity_name             SYSNAME NULL,
        entity_id               NVARCHAR(64) NULL,
        outcome                 TINYINT NOT NULL CONSTRAINT DF_access_log_outcome DEFAULT (1),   -- 0=fail, 1=success, 2=warning
        ip_address              VARBINARY(16) NULL,
        payload_json            NVARCHAR(MAX) NULL,
        CONSTRAINT PK_access_log PRIMARY KEY CLUSTERED (time_month_id, id)
            ON ps_cp_facts(time_month_id)
    );
    -- NC per query da Admin UI: "tutti gli accessi recenti di user X"
    CREATE INDEX ix_access_log_user_time ON [audit].[access_log](user_id, event_time DESC)
        WHERE user_id IS NOT NULL
        ON ps_cp_facts(time_month_id);
    -- NC per entity audit: "chi ha modificato program 42?"
    CREATE INDEX ix_access_log_entity ON [audit].[access_log](entity_schema, entity_name, entity_id)
        INCLUDE (user_id, action, event_time)
        ON ps_cp_facts(time_month_id);
    PRINT '[50-audit] audit.access_log created (partitioned, 2 NC indexes)';
END
GO

-- ── audit.outbox (sostituisce queue Hangfire) ────────────────────────────────
-- Polled dal framework dbo.scheduler (Metadata DB) ogni 5-30s via job
-- costcnh_outbox_dispatch (vedi seed/scheduler-tasks.sql).
IF OBJECT_ID(N'[audit].[outbox]', N'U') IS NULL
BEGIN
    CREATE TABLE [audit].[outbox] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_outbox PRIMARY KEY CLUSTERED,
        event_kind              NVARCHAR(64) NOT NULL,                         -- 'program_consolidation', 'forecast_calc', 'workforce_upload', ...
        entity_schema           SYSNAME NULL,
        entity_name             SYSNAME NULL,
        entity_id               NVARCHAR(64) NULL,
        payload_json            NVARCHAR(MAX) NOT NULL,
        status                  TINYINT NOT NULL CONSTRAINT DF_outbox_status DEFAULT (0),
                                -- 0=pending, 1=in_flight, 2=done, 9=dead
        attempt_count           INT NOT NULL CONSTRAINT DF_outbox_attempt_count DEFAULT (0),
        max_attempts            INT NOT NULL CONSTRAINT DF_outbox_max_attempts DEFAULT (5),
        last_error              NVARCHAR(2000) NULL,
        next_attempt_at         DATETIME2(3) NOT NULL CONSTRAINT DF_outbox_next_attempt_at DEFAULT (SYSUTCDATETIME()),
        locked_by               NVARCHAR(64) NULL,
        locked_at               DATETIME2(3) NULL,
        created_at              DATETIME2(3) NOT NULL CONSTRAINT DF_outbox_created_at DEFAULT (SYSUTCDATETIME()),
        enqueued_by_user_id     INT NULL,
        started_at              DATETIME2(3) NULL,
        done_at                 DATETIME2(3) NULL,
        duration_ms             INT NULL
    );

    -- Filtered index per dispatch SP (UPDATE TOP(N) ... WHERE next_attempt_at <= NOW AND status IN (0,1))
    CREATE INDEX ix_outbox_due
        ON [audit].[outbox](next_attempt_at, event_kind)
        INCLUDE (id, attempt_count, max_attempts, status)
        WHERE status IN (0, 1);

    -- Dead-letter queue index per Admin UI ("show me all failed jobs")
    CREATE INDEX ix_outbox_dead
        ON [audit].[outbox](event_kind, done_at DESC)
        INCLUDE (id, last_error, attempt_count)
        WHERE status = 9;

    -- Idempotency: query "is this entity event already enqueued and not yet done?"
    CREATE INDEX ix_outbox_entity_pending
        ON [audit].[outbox](entity_schema, entity_name, entity_id, event_kind)
        INCLUDE (status, next_attempt_at)
        WHERE status IN (0, 1);

    PRINT '[50-audit] audit.outbox created (3 filtered NC indexes)';
END
GO

-- ── audit.outbox_dispatch SP (atomic claim) ──────────────────────────────────
-- Pattern: UPDATE TOP(N) ... OUTPUT INSERTED.* WITH (READPAST, UPDLOCK, ROWLOCK).
-- Esecuzione lato scheduler: poll questa SP, processa il batch, alla fine
-- chiama outbox_complete o outbox_fail per riga.
IF OBJECT_ID(N'[audit].[outbox_claim]', N'P') IS NOT NULL DROP PROCEDURE [audit].[outbox_claim];
GO
CREATE PROCEDURE [audit].[outbox_claim]
    @worker_id NVARCHAR(64),
    @batch_size INT = 50,
    @event_kind NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();

    -- Atomic claim: passa status 0→1 in una sola transazione, evita race
    UPDATE TOP (@batch_size) [audit].[outbox] WITH (READPAST, UPDLOCK, ROWLOCK)
        SET status = 1,
            locked_by = @worker_id,
            locked_at = @now,
            started_at = @now,
            attempt_count = attempt_count + 1
    OUTPUT INSERTED.id, INSERTED.event_kind, INSERTED.entity_schema, INSERTED.entity_name,
           INSERTED.entity_id, INSERTED.payload_json, INSERTED.attempt_count, INSERTED.max_attempts
    WHERE status = 0
      AND next_attempt_at <= @now
      AND attempt_count < max_attempts
      AND (@event_kind IS NULL OR event_kind = @event_kind);
END
GO
PRINT '[50-audit] audit.outbox_claim SP created';
GO

-- ── audit.outbox_complete ────────────────────────────────────────────────────
IF OBJECT_ID(N'[audit].[outbox_complete]', N'P') IS NOT NULL DROP PROCEDURE [audit].[outbox_complete];
GO
CREATE PROCEDURE [audit].[outbox_complete]
    @id BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    UPDATE [audit].[outbox]
       SET status = 2,
           done_at = @now,
           duration_ms = DATEDIFF(MILLISECOND, started_at, @now),
           last_error = NULL,
           locked_by = NULL,
           locked_at = NULL
     WHERE id = @id;
END
GO
PRINT '[50-audit] audit.outbox_complete SP created';
GO

-- ── audit.outbox_fail (con backoff esponenziale) ─────────────────────────────
IF OBJECT_ID(N'[audit].[outbox_fail]', N'P') IS NOT NULL DROP PROCEDURE [audit].[outbox_fail];
GO
CREATE PROCEDURE [audit].[outbox_fail]
    @id BIGINT,
    @error NVARCHAR(2000)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @attempt INT, @max INT;
    SELECT @attempt = attempt_count, @max = max_attempts FROM [audit].[outbox] WHERE id = @id;
    UPDATE [audit].[outbox]
       SET status = CASE WHEN @attempt >= @max THEN 9 ELSE 0 END,
           last_error = @error,
           -- backoff: 2^attempt min, capped at 60 min
           next_attempt_at = DATEADD(MINUTE, CASE WHEN POWER(2, @attempt) > 60 THEN 60 ELSE POWER(2, @attempt) END, @now),
           locked_by = NULL,
           locked_at = NULL,
           done_at = CASE WHEN @attempt >= @max THEN @now ELSE NULL END
     WHERE id = @id;
END
GO
PRINT '[50-audit] audit.outbox_fail SP created (with exponential backoff)';
GO

-- ── audit.outbox_enqueue (helper per application code) ───────────────────────
IF OBJECT_ID(N'[audit].[outbox_enqueue]', N'P') IS NOT NULL DROP PROCEDURE [audit].[outbox_enqueue];
GO
CREATE PROCEDURE [audit].[outbox_enqueue]
    @event_kind NVARCHAR(64),
    @entity_schema SYSNAME = NULL,
    @entity_name SYSNAME = NULL,
    @entity_id NVARCHAR(64) = NULL,
    @payload_json NVARCHAR(MAX),
    @enqueued_by_user_id INT = NULL,
    @id BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [audit].[outbox](event_kind, entity_schema, entity_name, entity_id, payload_json, enqueued_by_user_id)
    VALUES (@event_kind, @entity_schema, @entity_name, @entity_id, @payload_json, @enqueued_by_user_id);
    SET @id = SCOPE_IDENTITY();
END
GO
PRINT '[50-audit] audit.outbox_enqueue SP created';
GO

PRINT '[50-audit] DONE';
GO
