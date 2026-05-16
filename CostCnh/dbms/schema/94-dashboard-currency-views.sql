-- =============================================================================
-- Task 11.7 — Dashboard KPI in target currency
-- =============================================================================
-- Helper views per dashboard tile cross-currency: tutti gli aggregati cost_amount/
-- planned/actual passati per fn_convert_currency.
--
-- USAGE: dashboard chart/tile call:
--   SELECT * FROM cp.fn_dashboard_program_kpis(@program_id, @target_currency_id, @as_of_date)
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

-- ─── Inline TVF: KPI dashboard cross-currency per programma ──────────────────
IF OBJECT_ID(N'[cp].[fn_dashboard_program_kpis]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_dashboard_program_kpis];
GO
CREATE FUNCTION [cp].[fn_dashboard_program_kpis] (
    @program_id INT,
    @target_currency_id INT,
    @as_of_date DATE
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        @program_id AS program_id,
        @target_currency_id AS target_currency_id,
        SUM(cc_pl.converted_amount) AS total_planned_target,
        SUM(cc_ac.converted_amount) AS total_actual_target,
        SUM(cc_cm.converted_amount) AS total_committed_target,
        SUM(cc_pl.converted_amount) - SUM(cc_ac.converted_amount) AS total_variance_target,
        SUM(cc_ac.converted_amount) / NULLIF(SUM(cc_pl.converted_amount), 0) AS spend_ratio,
        COUNT(*) AS facts_row_count
      FROM [cp].[facts] f
      OUTER APPLY [cp].[fn_convert_currency] (f.planned,   f.currency_id, @target_currency_id, @as_of_date) cc_pl
      OUTER APPLY [cp].[fn_convert_currency] (f.actual,    f.currency_id, @target_currency_id, @as_of_date) cc_ac
      OUTER APPLY [cp].[fn_convert_currency] (f.committed, f.currency_id, @target_currency_id, @as_of_date) cc_cm
     WHERE f.program_id = @program_id
       AND ISNULL(f.cancellato, 0) = 0;
GO
PRINT '[94-dash] cp.fn_dashboard_program_kpis (cross-currency, inline TVF) created';
GO

-- ─── Workforce KPI cross-currency ─────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[fn_dashboard_workforce_kpis]', N'IF') IS NOT NULL
    DROP FUNCTION [wf].[fn_dashboard_workforce_kpis];
GO
CREATE FUNCTION [wf].[fn_dashboard_workforce_kpis] (
    @program_id INT,
    @year_num INT,
    @target_currency_id INT,
    @as_of_date DATE
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        @program_id AS program_id,
        @year_num AS year_num,
        @target_currency_id AS target_currency_id,
        COUNT(DISTINCT a.resource_id) AS distinct_resources,
        SUM(a.fte_percent) AS total_fte_percent,
        SUM(a.hours) AS total_hours,
        SUM(cc.converted_amount) AS total_cost_target,
        SUM(cc.converted_amount) / NULLIF(COUNT(DISTINCT a.resource_id), 0) AS avg_cost_per_resource
      FROM [wf].[allocation] a
      OUTER APPLY [cp].[fn_convert_currency] (a.cost_amount, a.currency_id, @target_currency_id, @as_of_date) cc
     WHERE a.program_id = @program_id
       AND a.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
       AND ISNULL(a.cancellato, 0) = 0;
GO
PRINT '[94-dash] wf.fn_dashboard_workforce_kpis (cross-currency) created';
GO

PRINT '[94-dash] === Task 11.7 deployed ===';
GO
