-- =============================================================================
-- Task 8.1 — wf.sp_save_alloc_cells (clone pattern PowerEdit save, flat 2D)
-- =============================================================================
-- Equivalente di cp.sp_save_power_edit_cells ma per workforce:
--   - rows = resource (FLAT, no hierarchy → niente ancestor refresh)
--   - cols = 12 mesi × 3 measure (fte_percent / hours / cost_amount)
--
-- AUTO-COMPUTE COST: il trigger wf.tr_allocation_compute_cost (Phase I.1) fa
-- auto-fill di cost_amount via cp.fn_fte_to_cost se NULL. Quindi save di
-- fte_percent → cost_amount viene derivato automaticamente.
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

-- TVP type
IF TYPE_ID(N'[wf].[tvp_alloc_cell_changes]') IS NULL
BEGIN
    CREATE TYPE [wf].[tvp_alloc_cell_changes] AS TABLE (
        resource_id   INT          NOT NULL,
        month_num     TINYINT      NOT NULL,
        measure_code  VARCHAR(8)   NOT NULL,    -- 'fte' | 'hours' | 'cost'
        new_value     DECIMAL(19,4) NULL,
        last_seen_utc DATETIME2(3) NULL,        -- optimistic concurrency
        PRIMARY KEY (resource_id, month_num, measure_code)
    );
    PRINT '[98-wf] wf.tvp_alloc_cell_changes type created';
END
GO

-- Save SP
IF OBJECT_ID(N'[wf].[sp_save_alloc_cells]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_save_alloc_cells];
GO
CREATE PROCEDURE [wf].[sp_save_alloc_cells]
    @program_id INT,
    @year_num INT,
    @user_id INT,
    @changes [wf].[tvp_alloc_cell_changes] READONLY,
    @project_id INT = NULL   -- opzionale: scoping per progetto
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @applied INT = 0;

    -- Validazione measure code
    IF EXISTS (SELECT 1 FROM @changes WHERE measure_code NOT IN ('fte', 'hours', 'cost'))
    BEGIN
        RAISERROR('measure_code must be fte | hours | cost', 16, 1);
        RETURN;
    END

    -- Optimistic concurrency (analogo PowerEdit W1 3.5)
    IF EXISTS (
        SELECT 1
          FROM @changes c
          INNER JOIN [wf].[allocation] a
                  ON a.program_id = @program_id
                 AND a.time_month_id = @year_num*100 + c.month_num
                 AND a.resource_id = c.resource_id
                 AND ISNULL(a.cancellato, 0) = 0
                 AND (@project_id IS NULL OR a.project_id = @project_id)
         WHERE c.last_seen_utc IS NOT NULL
           AND a.data_modifica IS NOT NULL
           AND a.data_modifica > c.last_seen_utc
    )
    BEGIN
        RAISERROR('Optimistic concurrency conflict on wf.allocation. Reload and retry.', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;

    DECLARE @changes_with_time TABLE (
        resource_id INT, time_month_id INT, measure_code VARCHAR(8), new_value DECIMAL(19,4) NULL
    );
    INSERT INTO @changes_with_time
    SELECT c.resource_id, @year_num*100 + c.month_num, c.measure_code, c.new_value FROM @changes c;

    -- FTE upsert
    ;WITH fte_targets AS (
        SELECT cw.resource_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw WHERE cw.measure_code = 'fte'
    )
    MERGE [wf].[allocation] AS tgt
    USING fte_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.resource_id = src.resource_id
      AND (@project_id IS NULL OR tgt.project_id = @project_id)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET fte_percent = src.new_value, data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (resource_id, project_id, program_id, time_month_id, fte_percent,
                currency_id, data_creazione, utente_creazione)
        VALUES (src.resource_id, @project_id, @program_id, src.time_month_id, src.new_value,
                (SELECT TOP 1 currency_id FROM [wf].[allocation] WHERE resource_id = src.resource_id ORDER BY id DESC),
                @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    -- Hours upsert
    ;WITH h_targets AS (
        SELECT cw.resource_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw WHERE cw.measure_code = 'hours'
    )
    MERGE [wf].[allocation] AS tgt
    USING h_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.resource_id = src.resource_id
      AND (@project_id IS NULL OR tgt.project_id = @project_id)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET hours = src.new_value, data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (resource_id, project_id, program_id, time_month_id, hours, fte_percent,
                data_creazione, utente_creazione)
        VALUES (src.resource_id, @project_id, @program_id, src.time_month_id, src.new_value, 0,
                @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    -- Cost upsert (manual override del trigger auto-fill)
    ;WITH c_targets AS (
        SELECT cw.resource_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw WHERE cw.measure_code = 'cost'
    )
    MERGE [wf].[allocation] AS tgt
    USING c_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.resource_id = src.resource_id
      AND (@project_id IS NULL OR tgt.project_id = @project_id)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET cost_amount = src.new_value, data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (resource_id, project_id, program_id, time_month_id, cost_amount, fte_percent,
                data_creazione, utente_creazione)
        VALUES (src.resource_id, @project_id, @program_id, src.time_month_id, src.new_value, 0,
                @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    COMMIT TRANSACTION;

    -- Rebuild pivot per (program, year) — uno solo scope, no ancestor (flat)
    EXEC [wf].[sp_rebuild_alloc_pivot] @program_id = @program_id, @year_num = @year_num, @verbose = 0;

    -- Return updated rows (subset interessato dai changes)
    SELECT DISTINCT
        ap.id, ap.program_id, ap.year_num, ap.resource_id, ap.resource_code,
        ap.resource_name, ap.role_code, ap.cost_center_code,
        ap.fte_m1,ap.fte_m2,ap.fte_m3,ap.fte_m4,ap.fte_m5,ap.fte_m6,ap.fte_m7,ap.fte_m8,ap.fte_m9,ap.fte_m10,ap.fte_m11,ap.fte_m12,
        ap.hrs_m1,ap.hrs_m2,ap.hrs_m3,ap.hrs_m4,ap.hrs_m5,ap.hrs_m6,ap.hrs_m7,ap.hrs_m8,ap.hrs_m9,ap.hrs_m10,ap.hrs_m11,ap.hrs_m12,
        ap.cost_m1,ap.cost_m2,ap.cost_m3,ap.cost_m4,ap.cost_m5,ap.cost_m6,ap.cost_m7,ap.cost_m8,ap.cost_m9,ap.cost_m10,ap.cost_m11,ap.cost_m12,
        ap.last_rebuild_utc, @applied AS applied
    FROM [wf].[alloc_pivot] ap
    INNER JOIN (SELECT DISTINCT resource_id FROM @changes) c ON c.resource_id = ap.resource_id
    WHERE ap.program_id = @program_id AND ap.year_num = @year_num
    ORDER BY ap.cost_center_code, ap.role_code, ap.resource_code;
END
GO
PRINT '[98-wf] wf.sp_save_alloc_cells deployed';
GO
