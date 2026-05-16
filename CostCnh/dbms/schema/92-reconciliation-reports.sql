-- =============================================================================
-- Task 8.5 — Forecast vs Workforce reconciliation report
-- =============================================================================
-- Detect over/under-allocation: confronta SUM(fc.facts.value) per (program, year)
-- contro SUM(wf.allocation.cost_amount) convertito in target currency.
--
-- Output: 1 row per (program, year, target_currency) con:
--   - forecast_total_target   (da fc.facts WHERE forecast_code='F2' default)
--   - workforce_total_target  (da wf.allocation.cost_amount converted)
--   - delta = forecast - workforce
--   - status: 'over' / 'under' / 'balanced' (threshold ±5%)
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

IF OBJECT_ID(N'[rep].[sp_run_forecast_workforce_recon]', N'P') IS NOT NULL
    DROP PROCEDURE [rep].[sp_run_forecast_workforce_recon];
GO
CREATE PROCEDURE [rep].[sp_run_forecast_workforce_recon]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @year INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_num') AS INT);
    DECLARE @target_currency INT = TRY_CAST(JSON_VALUE(@params_json, '$.target_currency_id') AS INT);
    DECLARE @forecast_code VARCHAR(8) = COALESCE(JSON_VALUE(@params_json, '$.forecast_code'), 'F2');
    DECLARE @as_of_date DATE = COALESCE(TRY_CAST(JSON_VALUE(@params_json, '$.as_of_date') AS DATE), CAST(SYSUTCDATETIME() AS DATE));

    IF @prog IS NULL OR @year IS NULL OR @target_currency IS NULL
    BEGIN
        SET @result_json = N'{"error":"program_id + year_num + target_currency_id required"}';
        SET @result_row_count = 0;
        RETURN;
    END

    -- Forecast totals (converted to target currency)
    ;WITH fc_total AS (
        SELECT
            SUM(cc.converted_amount) AS forecast_total_target
        FROM [fc].[facts] f
        OUTER APPLY [cp].[fn_convert_currency] (f.value, f.currency_id, @target_currency, @as_of_date) cc
        WHERE f.program_id = @prog
          AND f.time_month_id BETWEEN @year*100+1 AND @year*100+12
          AND f.forecast_code = @forecast_code
          AND ISNULL(f.cancellato, 0) = 0
    ),
    -- Workforce totals (converted)
    wf_total AS (
        SELECT
            SUM(cc.converted_amount) AS workforce_total_target,
            SUM(a.hours)              AS workforce_total_hours,
            SUM(a.fte_percent)        AS workforce_total_fte
        FROM [wf].[allocation] a
        OUTER APPLY [cp].[fn_convert_currency] (a.cost_amount, a.currency_id, @target_currency, @as_of_date) cc
        WHERE a.program_id = @prog
          AND a.time_month_id BETWEEN @year*100+1 AND @year*100+12
          AND ISNULL(a.cancellato, 0) = 0
    ),
    -- Per-month breakdown
    monthly AS (
        SELECT
            mt.time_month_id,
            ISNULL(fc.forecast_target, 0) AS forecast_target,
            ISNULL(wf.workforce_target, 0) AS workforce_target,
            ISNULL(fc.forecast_target, 0) - ISNULL(wf.workforce_target, 0) AS delta
        FROM (SELECT DISTINCT time_month_id FROM (
                  SELECT time_month_id FROM [fc].[facts] WHERE program_id = @prog AND time_month_id BETWEEN @year*100+1 AND @year*100+12 AND ISNULL(cancellato, 0) = 0 AND forecast_code = @forecast_code
                  UNION
                  SELECT time_month_id FROM [wf].[allocation] WHERE program_id = @prog AND time_month_id BETWEEN @year*100+1 AND @year*100+12 AND ISNULL(cancellato, 0) = 0
              ) u) mt
        LEFT JOIN (
            SELECT f.time_month_id, SUM(cc.converted_amount) AS forecast_target
              FROM [fc].[facts] f
              OUTER APPLY [cp].[fn_convert_currency] (f.value, f.currency_id, @target_currency, @as_of_date) cc
             WHERE f.program_id = @prog AND f.forecast_code = @forecast_code AND ISNULL(f.cancellato, 0) = 0
             GROUP BY f.time_month_id
        ) fc ON fc.time_month_id = mt.time_month_id
        LEFT JOIN (
            SELECT a.time_month_id, SUM(cc.converted_amount) AS workforce_target
              FROM [wf].[allocation] a
              OUTER APPLY [cp].[fn_convert_currency] (a.cost_amount, a.currency_id, @target_currency, @as_of_date) cc
             WHERE a.program_id = @prog AND ISNULL(a.cancellato, 0) = 0
             GROUP BY a.time_month_id
        ) wf ON wf.time_month_id = mt.time_month_id
    )
    SELECT @result_json = (
        SELECT
            (SELECT id, code, name FROM [core].[program] WHERE id = @prog FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS program,
            @year AS year_num,
            @target_currency AS target_currency_id,
            (SELECT code FROM [core].[currency] WHERE id = @target_currency) AS target_currency_code,
            @forecast_code AS forecast_code,
            (
                SELECT
                    fct.forecast_total_target,
                    wt.workforce_total_target,
                    fct.forecast_total_target - wt.workforce_total_target AS delta_total,
                    CASE
                        WHEN fct.forecast_total_target IS NULL OR fct.forecast_total_target = 0 THEN NULL
                        ELSE CAST((wt.workforce_total_target - fct.forecast_total_target) / fct.forecast_total_target * 100 AS DECIMAL(10,2))
                    END AS workforce_vs_forecast_pct,
                    CASE
                        WHEN ABS(ISNULL(fct.forecast_total_target, 0) - ISNULL(wt.workforce_total_target, 0)) / NULLIF(ABS(fct.forecast_total_target), 0) > 0.05 THEN
                            CASE WHEN wt.workforce_total_target > fct.forecast_total_target THEN 'over_allocated' ELSE 'under_allocated' END
                        ELSE 'balanced'
                    END AS status,
                    wt.workforce_total_hours,
                    wt.workforce_total_fte
                FROM fc_total fct CROSS JOIN wf_total wt
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS totals,
            (
                SELECT time_month_id, forecast_target, workforce_target, delta
                FROM monthly ORDER BY time_month_id
                FOR JSON PATH
            ) AS monthly_breakdown
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT @result_row_count = COUNT(*) FROM monthly;
END
GO
PRINT '[92-rep] rep.sp_run_forecast_workforce_recon deployed';
GO

-- Register report in rep.report_definition
IF NOT EXISTS (SELECT 1 FROM [rep].[report_definition] WHERE code = 'FORECAST_WORKFORCE_RECON')
BEGIN
    INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, default_params_json, output_format, is_active, data_creazione, utente_creazione)
    VALUES ('FORECAST_WORKFORCE_RECON',
            N'Forecast vs Workforce reconciliation',
            N'Confronta forecast cost vs workforce allocation cost in target currency, con status over/under/balanced ±5%.',
            N'Reconciliation',
            'rep.sp_run_forecast_workforce_recon',
            N'{"program_id":null,"year_num":2026,"target_currency_id":null,"forecast_code":"F2"}',
            'json', 1,
            SYSUTCDATETIME(), 1);
    PRINT '[92-rep] report_definition FORECAST_WORKFORCE_RECON registered';
END
GO
