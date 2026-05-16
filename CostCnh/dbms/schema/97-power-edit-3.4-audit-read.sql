-- =============================================================================
-- Task 3.4 — Audit log read SP per UI history viewer
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

IF OBJECT_ID(N'[cp].[sp_read_change_log]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_read_change_log];
GO
CREATE PROCEDURE [cp].[sp_read_change_log]
    @program_id INT,
    @from_utc DATETIME2(3) = NULL,
    @to_utc DATETIME2(3) = NULL,
    @user_id INT = NULL,
    @cell_field VARCHAR(40) = NULL,
    @xbs_node_id BIGINT = NULL,
    @limit INT = 200
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@limit)
        cl.id, cl.lock_id, cl.facts_id, cl.time_month_id, cl.program_id,
        cl.cell_field, cl.old_value, cl.new_value, cl.changed_at_utc, cl.changed_by_user_id,
        cl.source_currency_id, cl.display_currency_id, cl.applied_rate, cl.applied_rate_date,
        f.xbs_node_id,
        xn.code AS xbs_code, xn.name AS xbs_name
      FROM [cp].[spreadsheet_change_log] cl
      LEFT JOIN [cp].[facts] f ON f.id = cl.facts_id
      LEFT JOIN [xbs].[node] xn ON xn.id = f.xbs_node_id
     WHERE cl.program_id = @program_id
       AND (@from_utc IS NULL OR cl.changed_at_utc >= @from_utc)
       AND (@to_utc IS NULL OR cl.changed_at_utc <= @to_utc)
       AND (@user_id IS NULL OR cl.changed_by_user_id = @user_id)
       AND (@cell_field IS NULL OR cl.cell_field = @cell_field)
       AND (@xbs_node_id IS NULL OR f.xbs_node_id = @xbs_node_id)
     ORDER BY cl.changed_at_utc DESC, cl.id DESC;
END
GO
PRINT '[97-3.4] cp.sp_read_change_log created';
GO

-- Aggregate view: stats per giorno × cell_field (per chart UI)
IF OBJECT_ID(N'[cp].[fn_change_log_stats]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_change_log_stats];
GO
CREATE FUNCTION [cp].[fn_change_log_stats] (
    @program_id INT,
    @from_utc DATETIME2(3),
    @to_utc DATETIME2(3)
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        CAST(cl.changed_at_utc AS DATE) AS day,
        cl.cell_field,
        cl.changed_by_user_id,
        COUNT(*) AS edit_count,
        SUM(ISNULL(cl.new_value, 0) - ISNULL(cl.old_value, 0)) AS net_delta
      FROM [cp].[spreadsheet_change_log] cl
     WHERE cl.program_id = @program_id
       AND cl.changed_at_utc BETWEEN @from_utc AND @to_utc
     GROUP BY CAST(cl.changed_at_utc AS DATE), cl.cell_field, cl.changed_by_user_id;
GO
PRINT '[97-3.4] cp.fn_change_log_stats (inline TVF) created';
GO
