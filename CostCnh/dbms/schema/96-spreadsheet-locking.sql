-- =============================================================================
-- CostCnh_Data — Sprint 9.4: Spreadsheet editing locking + audit
-- =============================================================================
-- Lock pattern per spreadsheet PowerEdit:
--   - Un solo utente può editare un (program_id × scenario_id × year) alla volta
--   - Lock TTL 30 min (auto-release tramite scheduled task costcnh_spreadsheet_lock_sweep)
--   - Heartbeat keepalive ogni 60s → estende lock_expires_utc
--   - Su disconnect/blur, frontend chiama release-lock
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

-- ── cp.spreadsheet_lock ──────────────────────────────────────────────────────
IF OBJECT_ID(N'[cp].[spreadsheet_lock]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[spreadsheet_lock] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_spreadsheet_lock PRIMARY KEY CLUSTERED,
        program_id              INT NOT NULL CONSTRAINT FK_spreadsheet_lock_program REFERENCES [core].[program](id),
        project_scenario_id     INT NULL CONSTRAINT FK_spreadsheet_lock_scenario REFERENCES [core].[project_scenario](id),
        year_num                INT NULL,
        lock_token              UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_spreadsheet_lock_token DEFAULT (NEWID()),
        locked_by_user_id       INT NOT NULL,
        locked_by_session       NVARCHAR(80) NULL,
        acquired_at_utc         DATETIME2(3) NOT NULL CONSTRAINT DF_spreadsheet_lock_acquired_at DEFAULT (SYSUTCDATETIME()),
        last_heartbeat_utc      DATETIME2(3) NOT NULL CONSTRAINT DF_spreadsheet_lock_heartbeat DEFAULT (SYSUTCDATETIME()),
        lock_expires_utc        DATETIME2(3) NOT NULL,
        released_at_utc         DATETIME2(3) NULL,
        cells_changed_count     INT NOT NULL CONSTRAINT DF_spreadsheet_lock_cells_changed DEFAULT (0)
    );
    -- Uniqueness enforced in SP via UPDLOCK,HOLDLOCK su sezione attiva (no NULL-friendly index)
    CREATE INDEX ix_spreadsheet_lock_active_scope
        ON [cp].[spreadsheet_lock](program_id, project_scenario_id, year_num) WHERE released_at_utc IS NULL;
    CREATE INDEX ix_spreadsheet_lock_expiry ON [cp].[spreadsheet_lock](lock_expires_utc) WHERE released_at_utc IS NULL;
    PRINT '[96] cp.spreadsheet_lock created (unique active per program×scenario×year)';
END
GO

-- ── cp.spreadsheet_change_log (audit per batch save) ────────────────────────
IF OBJECT_ID(N'[cp].[spreadsheet_change_log]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[spreadsheet_change_log] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_spreadsheet_change_log PRIMARY KEY CLUSTERED,
        lock_id                 BIGINT NULL CONSTRAINT FK_spreadsheet_change_log_lock REFERENCES [cp].[spreadsheet_lock](id),
        facts_id                BIGINT NOT NULL,                                -- cp.facts.id modificato
        time_month_id           INT NOT NULL,
        program_id              INT NOT NULL,
        cell_field              VARCHAR(40) NOT NULL,                          -- 'planned' | 'actual' | 'committed' | 'balance' | 'R1'..'F3'
        old_value               DECIMAL(19,4) NULL,
        new_value               DECIMAL(19,4) NULL,
        changed_at_utc          DATETIME2(3) NOT NULL CONSTRAINT DF_spreadsheet_change_log_at DEFAULT (SYSUTCDATETIME()),
        changed_by_user_id      INT NULL
    );
    CREATE INDEX ix_spreadsheet_change_log_facts ON [cp].[spreadsheet_change_log](facts_id, changed_at_utc DESC);
    CREATE INDEX ix_spreadsheet_change_log_lock ON [cp].[spreadsheet_change_log](lock_id);
    PRINT '[96] cp.spreadsheet_change_log created (full change audit)';
END
GO

-- ── SP: cp.spreadsheet_acquire_lock ─────────────────────────────────────────
-- Acquisisce lock; ritorna lock_token + lock_expires_utc, oppure null se conflict.
IF OBJECT_ID(N'[cp].[spreadsheet_acquire_lock]', N'P') IS NOT NULL DROP PROCEDURE [cp].[spreadsheet_acquire_lock];
GO
CREATE PROCEDURE [cp].[spreadsheet_acquire_lock]
    @program_id INT,
    @project_scenario_id INT = NULL,
    @year_num INT = NULL,
    @locked_by_user_id INT,
    @locked_by_session NVARCHAR(80) = NULL,
    @ttl_minutes INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @expires DATETIME2(3) = DATEADD(MINUTE, @ttl_minutes, @now);

    -- Auto-release scaduti (best-effort)
    UPDATE [cp].[spreadsheet_lock]
       SET released_at_utc = @now
     WHERE released_at_utc IS NULL AND lock_expires_utc < @now;

    -- Tenta acquisizione
    DECLARE @existing_lock_id BIGINT, @existing_user INT, @existing_token UNIQUEIDENTIFIER, @existing_expires DATETIME2(3);
    SELECT TOP 1 @existing_lock_id = id, @existing_user = locked_by_user_id, @existing_token = lock_token, @existing_expires = lock_expires_utc
    FROM [cp].[spreadsheet_lock] WITH (UPDLOCK, HOLDLOCK)
    WHERE program_id = @program_id
      AND ISNULL(project_scenario_id, 0) = ISNULL(@project_scenario_id, 0)
      AND ISNULL(year_num, 0) = ISNULL(@year_num, 0)
      AND released_at_utc IS NULL;

    IF @existing_lock_id IS NOT NULL
    BEGIN
        -- Stesso user? Refresh il lock (heartbeat-style)
        IF @existing_user = @locked_by_user_id
        BEGIN
            UPDATE [cp].[spreadsheet_lock]
               SET last_heartbeat_utc = @now,
                   lock_expires_utc = @expires
             WHERE id = @existing_lock_id;
            SELECT 'refreshed' AS outcome, @existing_token AS lock_token, @existing_lock_id AS lock_id, @expires AS lock_expires_utc, NULL AS conflict_user_id;
            RETURN;
        END
        -- Altro user → conflict
        SELECT 'conflict' AS outcome, NULL AS lock_token, NULL AS lock_id, @existing_expires AS lock_expires_utc, @existing_user AS conflict_user_id;
        RETURN;
    END

    -- Insert nuovo lock
    DECLARE @new_lock_id BIGINT, @new_token UNIQUEIDENTIFIER = NEWID();
    INSERT INTO [cp].[spreadsheet_lock] (program_id, project_scenario_id, year_num, lock_token, locked_by_user_id, locked_by_session, lock_expires_utc)
    VALUES (@program_id, @project_scenario_id, @year_num, @new_token, @locked_by_user_id, @locked_by_session, @expires);
    SET @new_lock_id = SCOPE_IDENTITY();

    SELECT 'acquired' AS outcome, @new_token AS lock_token, @new_lock_id AS lock_id, @expires AS lock_expires_utc, NULL AS conflict_user_id;
END
GO
PRINT '[96] cp.spreadsheet_acquire_lock SP created';
GO

-- ── SP: cp.spreadsheet_release_lock ─────────────────────────────────────────
IF OBJECT_ID(N'[cp].[spreadsheet_release_lock]', N'P') IS NOT NULL DROP PROCEDURE [cp].[spreadsheet_release_lock];
GO
CREATE PROCEDURE [cp].[spreadsheet_release_lock]
    @lock_token UNIQUEIDENTIFIER,
    @released INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [cp].[spreadsheet_lock]
       SET released_at_utc = SYSUTCDATETIME()
     WHERE lock_token = @lock_token AND released_at_utc IS NULL;
    SET @released = @@ROWCOUNT;
END
GO
PRINT '[96] cp.spreadsheet_release_lock SP created';
GO

PRINT '[96-spreadsheet-locking] DONE';
GO
