-- =============================================================================
-- Task 8.3 — Workforce scenario branching (Temporal Tables + scenario pointer)
-- =============================================================================
-- Approccio:
--   1. wf.allocation_scenario: tabella pointer per branching (analogo a core.baseline)
--   2. wf.allocation NON viene system-versioned globalmente (write-heavy, performance)
--      Invece: wf.allocation_history come append-only snapshot pre-modifica scenario.
--   3. SP wf.sp_branch_workforce_scenario(@source_scenario, @new_name) crea snapshot
--   4. SP wf.sp_promote_workforce_scenario(@scenario_id) promuove come "active"
--   5. SP wf.sp_diff_workforce_scenarios(@a, @b) diff per chart UI
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

-- ─── (1) wf.allocation_scenario (pointer) ─────────────────────────────────────
IF OBJECT_ID(N'[wf].[allocation_scenario]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[allocation_scenario] (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_alloc_scenario PRIMARY KEY CLUSTERED,
        program_id INT NOT NULL CONSTRAINT FK_wf_alloc_scenario_program REFERENCES [core].[program](id),
        scenario_code NVARCHAR(80) NOT NULL,
        scenario_name NVARCHAR(255) NOT NULL,
        descr NVARCHAR(1000) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft|active|archived|promoted
        parent_scenario_id INT NULL CONSTRAINT FK_wf_alloc_scenario_parent REFERENCES [wf].[allocation_scenario](id),
        is_baseline BIT NOT NULL DEFAULT 0,           -- 1 = baseline reference, immutable
        captured_at_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        captured_by_user_id INT NULL,
        promoted_at_utc DATETIME2(3) NULL,
        promoted_by_user_id INT NULL,
        cancellato BIT NOT NULL DEFAULT 0,
        data_creazione DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        utente_creazione INT NULL,
        data_modifica DATETIME2(3) NULL,
        utente_modifica INT NULL,
        CONSTRAINT UQ_wf_alloc_scenario_program_code UNIQUE (program_id, scenario_code)
    );
    CREATE INDEX ix_wf_alloc_scenario_program_status ON [wf].[allocation_scenario](program_id, status) WHERE cancellato = 0;
    CREATE INDEX ix_wf_alloc_scenario_parent ON [wf].[allocation_scenario](parent_scenario_id) WHERE parent_scenario_id IS NOT NULL;
    PRINT '[96-wfsc] wf.allocation_scenario created';
END
GO

-- ─── (2) wf.allocation_history (append-only snapshot per scenario) ───────────
IF OBJECT_ID(N'[wf].[allocation_history]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[allocation_history] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_alloc_history PRIMARY KEY CLUSTERED
            WITH (DATA_COMPRESSION = PAGE),
        scenario_id INT NOT NULL CONSTRAINT FK_wf_alloc_history_scenario REFERENCES [wf].[allocation_scenario](id),
        allocation_id BIGINT NOT NULL,
        resource_id INT NOT NULL,
        project_id INT NULL,
        program_id INT NOT NULL,
        time_month_id INT NOT NULL,
        fte_percent DECIMAL(7,2) NULL,
        hours DECIMAL(11,2) NULL,
        cost_amount DECIMAL(19,4) NULL,
        currency_id INT NULL,
        snapshot_at_utc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX ix_wf_alloc_history_scenario_alloc ON [wf].[allocation_history](scenario_id, allocation_id)
        WITH (DATA_COMPRESSION = PAGE);
    CREATE INDEX ix_wf_alloc_history_scenario_resource ON [wf].[allocation_history](scenario_id, resource_id, time_month_id);
    PRINT '[96-wfsc] wf.allocation_history created (append-only, page-compressed)';
END
GO

-- ─── (3) Branch scenario ──────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[sp_branch_workforce_scenario]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_branch_workforce_scenario];
GO
CREATE PROCEDURE [wf].[sp_branch_workforce_scenario]
    @program_id INT,
    @new_scenario_code NVARCHAR(80),
    @new_scenario_name NVARCHAR(255),
    @parent_scenario_id INT = NULL,
    @user_id INT = NULL,
    @new_scenario_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- Insert scenario row
    INSERT INTO [wf].[allocation_scenario] (
        program_id, scenario_code, scenario_name, parent_scenario_id, status,
        captured_at_utc, captured_by_user_id, data_creazione, utente_creazione
    ) VALUES (
        @program_id, @new_scenario_code, @new_scenario_name, @parent_scenario_id, 'draft',
        SYSUTCDATETIME(), @user_id, SYSUTCDATETIME(), @user_id
    );
    SET @new_scenario_id = SCOPE_IDENTITY();

    -- Snapshot delle wf.allocation correnti in allocation_history
    INSERT INTO [wf].[allocation_history] (
        scenario_id, allocation_id, resource_id, project_id, program_id, time_month_id,
        fte_percent, hours, cost_amount, currency_id
    )
    SELECT
        @new_scenario_id, a.id, a.resource_id, a.project_id, a.program_id, a.time_month_id,
        a.fte_percent, a.hours, a.cost_amount, a.currency_id
      FROM [wf].[allocation] a
     WHERE a.program_id = @program_id AND ISNULL(a.cancellato, 0) = 0;

    DECLARE @snapped INT = @@ROWCOUNT;
    PRINT '[branch] scenario ' + CAST(@new_scenario_id AS VARCHAR) + ' created with ' + CAST(@snapped AS VARCHAR) + ' allocation snapshots';

    COMMIT TRANSACTION;
END
GO
PRINT '[96-wfsc] wf.sp_branch_workforce_scenario created';
GO

-- ─── (4) Promote scenario (replace wf.allocation with scenario snapshot) ─────
IF OBJECT_ID(N'[wf].[sp_promote_workforce_scenario]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_promote_workforce_scenario];
GO
CREATE PROCEDURE [wf].[sp_promote_workforce_scenario]
    @scenario_id INT,
    @user_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @program_id INT;
    SELECT @program_id = program_id FROM [wf].[allocation_scenario] WHERE id = @scenario_id;
    IF @program_id IS NULL
    BEGIN
        RAISERROR('Scenario %d not found', 16, 1, @scenario_id);
        RETURN;
    END

    BEGIN TRANSACTION;

    -- Auto-snapshot current state into "pre-promote-<scenario>-backup"
    DECLARE @backup_scenario_id INT;
    EXEC [wf].[sp_branch_workforce_scenario]
        @program_id = @program_id,
        @new_scenario_code = N'auto_backup_pre_promote',
        @new_scenario_name = N'Auto backup pre-promote (scenario_id=@scenario_id)',
        @user_id = @user_id,
        @new_scenario_id = @backup_scenario_id OUTPUT;
    PRINT '[promote] auto-backup scenario id=' + CAST(@backup_scenario_id AS VARCHAR);

    -- Soft-delete current allocations + INSERT from scenario history
    UPDATE [wf].[allocation]
       SET cancellato = 1, data_eliminazione = SYSUTCDATETIME(), utente_eliminazione = @user_id
     WHERE program_id = @program_id AND ISNULL(cancellato, 0) = 0;

    INSERT INTO [wf].[allocation] (
        resource_id, project_id, program_id, time_month_id,
        fte_percent, hours, cost_amount, currency_id,
        data_creazione, utente_creazione
    )
    SELECT
        h.resource_id, h.project_id, h.program_id, h.time_month_id,
        h.fte_percent, h.hours, h.cost_amount, h.currency_id,
        SYSUTCDATETIME(), @user_id
      FROM [wf].[allocation_history] h
     WHERE h.scenario_id = @scenario_id;

    -- Mark scenario as promoted
    UPDATE [wf].[allocation_scenario]
       SET status = 'promoted', promoted_at_utc = SYSUTCDATETIME(), promoted_by_user_id = @user_id
     WHERE id = @scenario_id;

    COMMIT TRANSACTION;

    -- Rebuild pivot
    EXEC [wf].[sp_rebuild_alloc_pivot] @program_id = @program_id, @verbose = 0;
END
GO
PRINT '[96-wfsc] wf.sp_promote_workforce_scenario created';
GO

-- ─── (5) Diff scenarios ──────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[sp_diff_workforce_scenarios]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_diff_workforce_scenarios];
GO
CREATE PROCEDURE [wf].[sp_diff_workforce_scenarios]
    @scenario_a INT,
    @scenario_b INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Diff per (resource_id, time_month_id): a vs b
    SELECT
        COALESCE(a.resource_id, b.resource_id) AS resource_id,
        COALESCE(a.time_month_id, b.time_month_id) AS time_month_id,
        a.fte_percent AS fte_a,
        b.fte_percent AS fte_b,
        ISNULL(b.fte_percent, 0) - ISNULL(a.fte_percent, 0) AS fte_delta,
        a.hours AS hours_a,
        b.hours AS hours_b,
        ISNULL(b.hours, 0) - ISNULL(a.hours, 0) AS hours_delta,
        a.cost_amount AS cost_a,
        b.cost_amount AS cost_b,
        ISNULL(b.cost_amount, 0) - ISNULL(a.cost_amount, 0) AS cost_delta,
        CASE
            WHEN a.allocation_id IS NULL THEN 'added'
            WHEN b.allocation_id IS NULL THEN 'removed'
            WHEN ISNULL(a.fte_percent, 0) <> ISNULL(b.fte_percent, 0)
              OR ISNULL(a.hours, 0) <> ISNULL(b.hours, 0)
              OR ISNULL(a.cost_amount, 0) <> ISNULL(b.cost_amount, 0)
            THEN 'modified'
            ELSE 'unchanged'
        END AS change_type
      FROM (SELECT * FROM [wf].[allocation_history] WHERE scenario_id = @scenario_a) a
      FULL OUTER JOIN (SELECT * FROM [wf].[allocation_history] WHERE scenario_id = @scenario_b) b
                   ON b.resource_id = a.resource_id AND b.time_month_id = a.time_month_id
                  AND ISNULL(b.project_id, -1) = ISNULL(a.project_id, -1)
     ORDER BY change_type DESC, COALESCE(a.resource_id, b.resource_id), COALESCE(a.time_month_id, b.time_month_id);
END
GO
PRINT '[96-wfsc] wf.sp_diff_workforce_scenarios created';
GO

PRINT '[96-wfsc] === Task 8.3 deployed ===';
PRINT '  - wf.allocation_scenario (pointer)';
PRINT '  - wf.allocation_history (append-only snapshot)';
PRINT '  - wf.sp_branch_workforce_scenario';
PRINT '  - wf.sp_promote_workforce_scenario (with auto-backup)';
PRINT '  - wf.sp_diff_workforce_scenarios';
GO
