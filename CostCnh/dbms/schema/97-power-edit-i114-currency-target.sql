-- =============================================================================
-- Task 11.4 + 11.5 + 11.13 — PowerEdit @target_currency_id + reporting cross-currency + audit
-- =============================================================================
-- 11.4: estende cp.sp_load_power_edit con @target_currency_id (NULL = raw)
-- 11.5: estende rep.sp_run_summary_cost con @target_currency_id
-- 11.13: aggiunge audit trail conversione (campi in cp.spreadsheet_change_log)
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

-- ─── 11.13: extend cp.spreadsheet_change_log with currency conversion audit ──
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE name = 'source_currency_id' AND object_id = OBJECT_ID(N'[cp].[spreadsheet_change_log]'))
BEGIN
    ALTER TABLE [cp].[spreadsheet_change_log]
        ADD source_currency_id INT NULL,
            display_currency_id INT NULL,
            applied_rate DECIMAL(19,8) NULL,
            applied_rate_date DATE NULL;
    PRINT '[97-I.11.13] cp.spreadsheet_change_log: 4 currency-audit cols added';
END
GO

-- ─── 11.4: extend cp.sp_load_power_edit con @target_currency_id ──────────────
-- Quando passato, applica fn_convert_currency a ogni cella usando first-day-of-month
-- come @as_of_date. Raw (NULL) = comportamento legacy.
IF OBJECT_ID(N'[cp].[sp_load_power_edit]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_load_power_edit];
GO
CREATE PROCEDURE [cp].[sp_load_power_edit]
    @program_id INT,
    @year_num INT,
    @project_scenario_id INT = NULL,
    @target_currency_id INT = NULL    -- Task 11.4
AS
BEGIN
    SET NOCOUNT ON;

    IF @target_currency_id IS NULL AND @project_scenario_id IS NULL
    BEGIN
        -- Fast path: cached pivot, no conversion
        SELECT
            id, program_id, year_num, tree_kind_id, xbs_node_id,
            CAST(xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
            xbs_depth, xbs_code, xbs_name, parent_node_id, is_leaf,
            pl_m1,pl_m2,pl_m3,pl_m4,pl_m5,pl_m6,pl_m7,pl_m8,pl_m9,pl_m10,pl_m11,pl_m12,
            ac_m1,ac_m2,ac_m3,ac_m4,ac_m5,ac_m6,ac_m7,ac_m8,ac_m9,ac_m10,ac_m11,ac_m12,
            fc_m1,fc_m2,fc_m3,fc_m4,fc_m5,fc_m6,fc_m7,fc_m8,fc_m9,fc_m10,fc_m11,fc_m12,
            bl_m1,bl_m2,bl_m3,bl_m4,bl_m5,bl_m6,bl_m7,bl_m8,bl_m9,bl_m10,bl_m11,bl_m12,
            last_rebuild_utc,
            CAST(NULL AS INT) AS project_scenario_id,
            CAST(NULL AS INT) AS target_currency_id
        FROM [cp].[facts_pivot]
        WHERE program_id = @program_id AND year_num = @year_num
        ORDER BY tree_kind_id, xbs_path;
        RETURN;
    END

    -- Target currency conversion: applica fn_convert_currency a ogni cella
    -- usando first-day-of-month come @as_of_date.
    -- Source currency: la default del program (program_currency_id) — fetch upfront.
    DECLARE @source_currency_id INT;
    SELECT @source_currency_id = currency_id
      FROM [core].[program] WHERE id = @program_id;
    IF @source_currency_id IS NULL SET @source_currency_id = (SELECT TOP 1 id FROM [core].[currency] ORDER BY id);

    DECLARE @date_m1 DATE = DATEFROMPARTS(@year_num, 1, 1);
    DECLARE @date_m2 DATE = DATEFROMPARTS(@year_num, 2, 1);
    DECLARE @date_m3 DATE = DATEFROMPARTS(@year_num, 3, 1);
    DECLARE @date_m4 DATE = DATEFROMPARTS(@year_num, 4, 1);
    DECLARE @date_m5 DATE = DATEFROMPARTS(@year_num, 5, 1);
    DECLARE @date_m6 DATE = DATEFROMPARTS(@year_num, 6, 1);
    DECLARE @date_m7 DATE = DATEFROMPARTS(@year_num, 7, 1);
    DECLARE @date_m8 DATE = DATEFROMPARTS(@year_num, 8, 1);
    DECLARE @date_m9 DATE = DATEFROMPARTS(@year_num, 9, 1);
    DECLARE @date_m10 DATE = DATEFROMPARTS(@year_num, 10, 1);
    DECLARE @date_m11 DATE = DATEFROMPARTS(@year_num, 11, 1);
    DECLARE @date_m12 DATE = DATEFROMPARTS(@year_num, 12, 1);

    -- Per perf: pre-fetch rate per ogni mese (1 lookup × 12 mesi invece di 48)
    DECLARE @r1 DECIMAL(19,8), @r2 DECIMAL(19,8), @r3 DECIMAL(19,8), @r4 DECIMAL(19,8),
            @r5 DECIMAL(19,8), @r6 DECIMAL(19,8), @r7 DECIMAL(19,8), @r8 DECIMAL(19,8),
            @r9 DECIMAL(19,8), @r10 DECIMAL(19,8), @r11 DECIMAL(19,8), @r12 DECIMAL(19,8);

    IF @target_currency_id IS NOT NULL AND @target_currency_id <> @source_currency_id
    BEGIN
        SELECT TOP 1 @r1 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m1);
        SELECT TOP 1 @r2 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m2);
        SELECT TOP 1 @r3 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m3);
        SELECT TOP 1 @r4 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m4);
        SELECT TOP 1 @r5 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m5);
        SELECT TOP 1 @r6 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m6);
        SELECT TOP 1 @r7 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m7);
        SELECT TOP 1 @r8 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m8);
        SELECT TOP 1 @r9 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m9);
        SELECT TOP 1 @r10 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m10);
        SELECT TOP 1 @r11 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m11);
        SELECT TOP 1 @r12 = effective_rate FROM [cp].[fn_convert_currency](1, @source_currency_id, @target_currency_id, @date_m12);

        -- Strict missing-rate check (W0.3 = a)
        IF @r1 IS NULL OR @r2 IS NULL OR @r3 IS NULL OR @r4 IS NULL OR @r5 IS NULL OR @r6 IS NULL
           OR @r7 IS NULL OR @r8 IS NULL OR @r9 IS NULL OR @r10 IS NULL OR @r11 IS NULL OR @r12 IS NULL
        BEGIN
            DECLARE @err NVARCHAR(400) = CONCAT(
                'Missing exchange rate: program=', @program_id, ' year=', @year_num,
                ' from=', @source_currency_id, ' to=', @target_currency_id,
                '. Insert cp.exchange_rate rows covering all months.');
            RAISERROR(@err, 16, 1);
            RETURN;
        END
    END
    ELSE
    BEGIN
        SET @r1 = 1; SET @r2 = 1; SET @r3 = 1; SET @r4 = 1; SET @r5 = 1; SET @r6 = 1;
        SET @r7 = 1; SET @r8 = 1; SET @r9 = 1; SET @r10 = 1; SET @r11 = 1; SET @r12 = 1;
    END

    -- SELECT con cast moltiplicato per il rate
    SELECT
        id, program_id, year_num, tree_kind_id, xbs_node_id,
        CAST(xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
        xbs_depth, xbs_code, xbs_name, parent_node_id, is_leaf,
        CAST(pl_m1 * @r1 AS DECIMAL(19,4)) AS pl_m1, CAST(pl_m2 * @r2 AS DECIMAL(19,4)) AS pl_m2,
        CAST(pl_m3 * @r3 AS DECIMAL(19,4)) AS pl_m3, CAST(pl_m4 * @r4 AS DECIMAL(19,4)) AS pl_m4,
        CAST(pl_m5 * @r5 AS DECIMAL(19,4)) AS pl_m5, CAST(pl_m6 * @r6 AS DECIMAL(19,4)) AS pl_m6,
        CAST(pl_m7 * @r7 AS DECIMAL(19,4)) AS pl_m7, CAST(pl_m8 * @r8 AS DECIMAL(19,4)) AS pl_m8,
        CAST(pl_m9 * @r9 AS DECIMAL(19,4)) AS pl_m9, CAST(pl_m10 * @r10 AS DECIMAL(19,4)) AS pl_m10,
        CAST(pl_m11 * @r11 AS DECIMAL(19,4)) AS pl_m11, CAST(pl_m12 * @r12 AS DECIMAL(19,4)) AS pl_m12,
        CAST(ac_m1 * @r1 AS DECIMAL(19,4)) AS ac_m1, CAST(ac_m2 * @r2 AS DECIMAL(19,4)) AS ac_m2,
        CAST(ac_m3 * @r3 AS DECIMAL(19,4)) AS ac_m3, CAST(ac_m4 * @r4 AS DECIMAL(19,4)) AS ac_m4,
        CAST(ac_m5 * @r5 AS DECIMAL(19,4)) AS ac_m5, CAST(ac_m6 * @r6 AS DECIMAL(19,4)) AS ac_m6,
        CAST(ac_m7 * @r7 AS DECIMAL(19,4)) AS ac_m7, CAST(ac_m8 * @r8 AS DECIMAL(19,4)) AS ac_m8,
        CAST(ac_m9 * @r9 AS DECIMAL(19,4)) AS ac_m9, CAST(ac_m10 * @r10 AS DECIMAL(19,4)) AS ac_m10,
        CAST(ac_m11 * @r11 AS DECIMAL(19,4)) AS ac_m11, CAST(ac_m12 * @r12 AS DECIMAL(19,4)) AS ac_m12,
        CAST(fc_m1 * @r1 AS DECIMAL(19,4)) AS fc_m1, CAST(fc_m2 * @r2 AS DECIMAL(19,4)) AS fc_m2,
        CAST(fc_m3 * @r3 AS DECIMAL(19,4)) AS fc_m3, CAST(fc_m4 * @r4 AS DECIMAL(19,4)) AS fc_m4,
        CAST(fc_m5 * @r5 AS DECIMAL(19,4)) AS fc_m5, CAST(fc_m6 * @r6 AS DECIMAL(19,4)) AS fc_m6,
        CAST(fc_m7 * @r7 AS DECIMAL(19,4)) AS fc_m7, CAST(fc_m8 * @r8 AS DECIMAL(19,4)) AS fc_m8,
        CAST(fc_m9 * @r9 AS DECIMAL(19,4)) AS fc_m9, CAST(fc_m10 * @r10 AS DECIMAL(19,4)) AS fc_m10,
        CAST(fc_m11 * @r11 AS DECIMAL(19,4)) AS fc_m11, CAST(fc_m12 * @r12 AS DECIMAL(19,4)) AS fc_m12,
        CAST(bl_m1 * @r1 AS DECIMAL(19,4)) AS bl_m1, CAST(bl_m2 * @r2 AS DECIMAL(19,4)) AS bl_m2,
        CAST(bl_m3 * @r3 AS DECIMAL(19,4)) AS bl_m3, CAST(bl_m4 * @r4 AS DECIMAL(19,4)) AS bl_m4,
        CAST(bl_m5 * @r5 AS DECIMAL(19,4)) AS bl_m5, CAST(bl_m6 * @r6 AS DECIMAL(19,4)) AS bl_m6,
        CAST(bl_m7 * @r7 AS DECIMAL(19,4)) AS bl_m7, CAST(bl_m8 * @r8 AS DECIMAL(19,4)) AS bl_m8,
        CAST(bl_m9 * @r9 AS DECIMAL(19,4)) AS bl_m9, CAST(bl_m10 * @r10 AS DECIMAL(19,4)) AS bl_m10,
        CAST(bl_m11 * @r11 AS DECIMAL(19,4)) AS bl_m11, CAST(bl_m12 * @r12 AS DECIMAL(19,4)) AS bl_m12,
        last_rebuild_utc,
        @project_scenario_id AS project_scenario_id,
        @target_currency_id AS target_currency_id
    FROM [cp].[facts_pivot]
    WHERE program_id = @program_id AND year_num = @year_num
    ORDER BY tree_kind_id, xbs_path;
END
GO
PRINT '[97-I.11.4] cp.sp_load_power_edit extended with @target_currency_id (RAISERROR strict on missing rate)';
GO

-- ─── 11.5: extend rep.sp_run_summary_cost con @target_currency_id ────────────
IF OBJECT_ID(N'[rep].[sp_run_summary_cost_cc]', N'P') IS NOT NULL
    DROP PROCEDURE [rep].[sp_run_summary_cost_cc];
GO
CREATE PROCEDURE [rep].[sp_run_summary_cost_cc]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @yf INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to') AS INT);
    DECLARE @target_currency INT = TRY_CAST(JSON_VALUE(@params_json, '$.target_currency_id') AS INT);
    DECLARE @as_of_date DATE = COALESCE(TRY_CAST(JSON_VALUE(@params_json, '$.as_of_date') AS DATE), CAST(SYSUTCDATETIME() AS DATE));

    IF @prog IS NULL
    BEGIN
        SET @result_json = N'{"error":"program_id required"}';
        SET @result_row_count = 0;
        RETURN;
    END

    DECLARE @src INT;
    SELECT @src = currency_id FROM [core].[program] WHERE id = @prog;
    IF @target_currency IS NULL SET @target_currency = @src;

    ;WITH base_with_conv AS (
        SELECT
            f.program_id, f.time_month_id, f.xbs_node_id,
            ISNULL(cc_pl.converted_amount, 0) AS planned_target,
            ISNULL(cc_ac.converted_amount, 0) AS actual_target,
            ISNULL(cc_cm.converted_amount, 0) AS committed_target
        FROM [cp].[facts] f
        OUTER APPLY [cp].[fn_convert_currency] (f.planned,   f.currency_id, @target_currency, @as_of_date) cc_pl
        OUTER APPLY [cp].[fn_convert_currency] (f.actual,    f.currency_id, @target_currency, @as_of_date) cc_ac
        OUTER APPLY [cp].[fn_convert_currency] (f.committed, f.currency_id, @target_currency, @as_of_date) cc_cm
        WHERE f.program_id = @prog
          AND ISNULL(f.cancellato, 0) = 0
          AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
          AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)
    )
    SELECT @result_json = (
        SELECT
            @target_currency AS target_currency_id,
            (SELECT code FROM [core].[currency] WHERE id = @target_currency) AS target_currency_code,
            JSON_QUERY((
                SELECT
                    COUNT(*) AS rows_count,
                    SUM(planned_target) AS total_planned_target,
                    SUM(actual_target) AS total_actual_target,
                    SUM(committed_target) AS total_committed_target
                FROM base_with_conv FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            )) AS totals
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- CTE scope ends after the previous statement; re-derive count from base predicates.
    SELECT @result_row_count = COUNT(*)
      FROM [cp].[facts] f
     WHERE f.program_id = @prog
       AND ISNULL(f.cancellato, 0) = 0
       AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
       AND (@yt IS NULL OR f.time_month_id <= @yt*100+12);
END
GO
PRINT '[97-I.11.5] rep.sp_run_summary_cost_cc (cross-currency variant) created';
GO

-- Register reporting definition
IF NOT EXISTS (SELECT 1 FROM [rep].[report_definition] WHERE code = 'SUMMARY_COST_CC')
BEGIN
    INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, default_params_json, output_format, is_active, data_creazione, utente_creazione)
    VALUES ('SUMMARY_COST_CC', N'Summary Cost (cross-currency)',
            N'Variante cross-currency di SUMMARY_COST con @target_currency_id.',
            N'Reporting', 'rep.sp_run_summary_cost_cc',
            N'{"program_id":null,"year_from":null,"year_to":null,"target_currency_id":null,"as_of_date":null}',
            'json', 1, SYSUTCDATETIME(), 1);
    PRINT '[97-I.11.5] report_definition SUMMARY_COST_CC registered';
END
GO

PRINT '[97-I.11.4+5+13] === deployed ===';
GO
