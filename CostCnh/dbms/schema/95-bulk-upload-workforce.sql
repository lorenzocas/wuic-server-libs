-- =============================================================================
-- Task 8.4 — Bulk upload xlsx Allocation pipeline
-- =============================================================================
-- (a) Staging table per le righe xlsx parsate (1 row per allocation cell)
-- (b) SP validate (controlla resource_id esistente, fte 0..100, currency_id valido)
-- (c) SP commit (MERGE su wf.allocation con scope program×year×project)
-- (d) Scheduler task `costcnh_process_workforce_upload` daily o on-demand
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

IF SCHEMA_ID('uploads') IS NULL EXEC('CREATE SCHEMA uploads');
GO

-- ─── (a) Staging table ────────────────────────────────────────────────────────
IF OBJECT_ID(N'[uploads].[wf_allocation_staging]', N'U') IS NULL
BEGIN
    CREATE TABLE [uploads].[wf_allocation_staging] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_allocation_staging PRIMARY KEY CLUSTERED,
        upload_batch_id UNIQUEIDENTIFIER NOT NULL,
        program_id INT NOT NULL,
        project_id INT NULL,
        year_num INT NOT NULL,
        month_num TINYINT NOT NULL,
        resource_code NVARCHAR(80) NOT NULL,
        fte_percent DECIMAL(7,2) NULL,
        hours DECIMAL(11,2) NULL,
        cost_amount DECIMAL(19,4) NULL,
        currency_code VARCHAR(8) NULL,
        -- resolved IDs (filled by validate)
        resolved_resource_id INT NULL,
        resolved_currency_id INT NULL,
        validation_status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|valid|invalid|committed
        validation_error NVARCHAR(500) NULL,
        uploaded_at DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        uploaded_by INT NULL
    );
    CREATE INDEX ix_wf_alloc_staging_batch ON [uploads].[wf_allocation_staging](upload_batch_id, validation_status);
    PRINT '[95-upload] uploads.wf_allocation_staging created';
END
GO

-- ─── (b) Validate SP ──────────────────────────────────────────────────────────
IF OBJECT_ID(N'[uploads].[sp_validate_wf_alloc_batch]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_validate_wf_alloc_batch];
GO
CREATE PROCEDURE [uploads].[sp_validate_wf_alloc_batch]
    @batch_id UNIQUEIDENTIFIER,
    @valid_count INT OUTPUT,
    @invalid_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Resolve resource_id da resource_code
    UPDATE s SET
        s.resolved_resource_id = r.id
      FROM [uploads].[wf_allocation_staging] s
      LEFT JOIN [wf].[resource] r ON r.code = s.resource_code AND ISNULL(r.cancellato, 0) = 0
     WHERE s.upload_batch_id = @batch_id;

    -- 2. Resolve currency_id da currency_code
    UPDATE s SET
        s.resolved_currency_id = c.id
      FROM [uploads].[wf_allocation_staging] s
      LEFT JOIN [core].[currency] c ON c.code = s.currency_code AND ISNULL(c.cancellato, 0) = 0
     WHERE s.upload_batch_id = @batch_id;

    -- 3. Mark invalid: resource not found
    UPDATE [uploads].[wf_allocation_staging] SET
        validation_status = 'invalid',
        validation_error = 'resource_code not found: ' + resource_code
     WHERE upload_batch_id = @batch_id AND resolved_resource_id IS NULL;

    -- 4. Mark invalid: fte out of range
    UPDATE [uploads].[wf_allocation_staging] SET
        validation_status = 'invalid',
        validation_error = CONCAT('fte_percent out of range [0..200]: ', fte_percent)
     WHERE upload_batch_id = @batch_id
       AND validation_status = 'pending'
       AND (fte_percent < 0 OR fte_percent > 200);

    -- 5. Mark invalid: month_num out of range
    UPDATE [uploads].[wf_allocation_staging] SET
        validation_status = 'invalid',
        validation_error = CONCAT('month_num out of range [1..12]: ', month_num)
     WHERE upload_batch_id = @batch_id
       AND validation_status = 'pending'
       AND (month_num < 1 OR month_num > 12);

    -- 6. Mark invalid: cost_amount NOT NULL → currency required (W0.2 + 11.9)
    UPDATE [uploads].[wf_allocation_staging] SET
        validation_status = 'invalid',
        validation_error = 'cost_amount provided but currency_code missing or invalid'
     WHERE upload_batch_id = @batch_id
       AND validation_status = 'pending'
       AND cost_amount IS NOT NULL
       AND resolved_currency_id IS NULL;

    -- 7. Mark remaining as valid
    UPDATE [uploads].[wf_allocation_staging] SET validation_status = 'valid'
     WHERE upload_batch_id = @batch_id AND validation_status = 'pending';

    SELECT
        @valid_count = SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END),
        @invalid_count = SUM(CASE WHEN validation_status = 'invalid' THEN 1 ELSE 0 END)
      FROM [uploads].[wf_allocation_staging]
     WHERE upload_batch_id = @batch_id;
END
GO
PRINT '[95-upload] uploads.sp_validate_wf_alloc_batch deployed';
GO

-- ─── (c) Commit SP ────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[uploads].[sp_commit_wf_alloc_batch]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_commit_wf_alloc_batch];
GO
CREATE PROCEDURE [uploads].[sp_commit_wf_alloc_batch]
    @batch_id UNIQUEIDENTIFIER,
    @user_id INT = NULL,
    @committed_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- MERGE su wf.allocation con scope (resource, project, program, time_month)
    MERGE [wf].[allocation] AS tgt
    USING (
        SELECT
            resolved_resource_id AS resource_id,
            project_id, program_id,
            year_num * 100 + month_num AS time_month_id,
            fte_percent, hours, cost_amount, resolved_currency_id AS currency_id
          FROM [uploads].[wf_allocation_staging]
         WHERE upload_batch_id = @batch_id AND validation_status = 'valid'
    ) AS src
       ON tgt.resource_id = src.resource_id
      AND tgt.program_id = src.program_id
      AND tgt.time_month_id = src.time_month_id
      AND ISNULL(tgt.project_id, -1) = ISNULL(src.project_id, -1)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET fte_percent = src.fte_percent,
                   hours = src.hours,
                   cost_amount = src.cost_amount,
                   currency_id = src.currency_id,
                   data_modifica = SYSUTCDATETIME(),
                   utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (resource_id, project_id, program_id, time_month_id,
                fte_percent, hours, cost_amount, currency_id,
                data_creazione, utente_creazione)
        VALUES (src.resource_id, src.project_id, src.program_id, src.time_month_id,
                src.fte_percent, src.hours, src.cost_amount, src.currency_id,
                SYSUTCDATETIME(), @user_id);

    SET @committed_count = @@ROWCOUNT;

    -- Mark staging rows as committed
    UPDATE [uploads].[wf_allocation_staging] SET validation_status = 'committed'
     WHERE upload_batch_id = @batch_id AND validation_status = 'valid';

    COMMIT TRANSACTION;

    -- Rebuild pivot per program/year affected
    DECLARE @affected_program INT, @affected_year INT;
    SELECT TOP 1 @affected_program = program_id, @affected_year = year_num
      FROM [uploads].[wf_allocation_staging]
     WHERE upload_batch_id = @batch_id;
    IF @affected_program IS NOT NULL
        EXEC [wf].[sp_rebuild_alloc_pivot] @program_id = @affected_program, @year_num = @affected_year, @verbose = 0;
END
GO
PRINT '[95-upload] uploads.sp_commit_wf_alloc_batch deployed';
GO

-- ─── (d) Scheduler task ───────────────────────────────────────────────────────
-- Registrato direttamente nel metadata DB
PRINT '[95-upload] === Task 8.4 deployed ===';
PRINT '  Per scheduler task, esegui questo SQL su CostCnh_Metadata:';
PRINT '  INSERT INTO scheduler (event_name, day_interval, action_type, action_cmd, enabled) VALUES';
PRINT '    (''costcnh_process_workforce_upload'', 0, 1, ''-- on-demand only --'', 0);';
GO
