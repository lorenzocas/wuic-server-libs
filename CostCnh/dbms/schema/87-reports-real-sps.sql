-- =============================================================================
-- CostCnh_Data — Sprint 6 follow-up: 7 SP skeleton mirror legacy report SPs
-- =============================================================================
-- Ogni SP:
--   - Riceve @params_json (JSON con valori dal parametric-dialog)
--   - Legge filtri con JSON_VALUE($.field)
--   - Esegue aggregazione filtrata sui nuovi schemi CostCnh
--   - Restituisce @result_json con shape compatibile (per Sprint 9 ETL si
--     ri-mappa al formato legacy in transit, ma client viewer e' nuovo)
--
-- LOGICA REPORT: skeleton con dati base + filtri applicati. La logica completa
-- (formule pivot per scenario × forecast × baseline × variance) verra' portata
-- in Sprint 9 dal codice legacy report/*.sql (~62 SP).
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

-- Drop old sample SPs
IF OBJECT_ID(N'[rep].[sp_run_program_overview]',     N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_program_overview];
IF OBJECT_ID(N'[rep].[sp_run_workforce_utilization]',N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_workforce_utilization];
IF OBJECT_ID(N'[rep].[sp_run_xbs_rollup]',           N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_xbs_rollup];
IF OBJECT_ID(N'[rep].[sp_run_site_comparison]',      N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_site_comparison];
IF OBJECT_ID(N'[rep].[sp_run_cost_trend]',           N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_cost_trend];
GO

-- ── rep.sp_run_program_pivot ─────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_program_pivot]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_program_pivot];
GO
CREATE PROCEDURE [rep].[sp_run_program_pivot]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT  = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @cls  INT  = TRY_CAST(JSON_VALUE(@params_json, '$.project_class_id') AS INT);
    DECLARE @prog INT  = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @scn  INT  = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);
    DECLARE @yf   INT  = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt   INT  = TRY_CAST(JSON_VALUE(@params_json, '$.year_to')   AS INT);

    SELECT @result_json = (
        SELECT
            @site AS filter_site_id, @cls AS filter_project_class_id, @prog AS filter_program_id,
            @scn AS filter_scenario_id, @yf AS filter_year_from, @yt AS filter_year_to,
            (
                SELECT p.code, p.name, p.site_id, p.project_class_id, p.program_status_id,
                       s.name AS site_name, pc.name AS class_name, ps.name AS status_name,
                       (SELECT ISNULL(SUM(f.planned),0) FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                          AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                          AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)) AS planned,
                       (SELECT ISNULL(SUM(f.actual),0)  FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                          AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                          AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)) AS actual
                FROM [core].[program] p
                LEFT JOIN [core].[site]            s  ON s.id  = p.site_id
                LEFT JOIN [core].[project_class]   pc ON pc.id = p.project_class_id
                LEFT JOIN [core].[program_status]  ps ON ps.id = p.program_status_id
                WHERE ISNULL(p.cancellato, 0) = 0
                  AND (@site IS NULL OR p.site_id = @site)
                  AND (@cls  IS NULL OR p.project_class_id = @cls)
                  AND (@prog IS NULL OR p.id = @prog)
                ORDER BY p.code
                FOR JSON PATH
            ) AS rows
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [core].[program]
                              WHERE ISNULL(cancellato,0)=0
                                AND (@site IS NULL OR site_id = @site)
                                AND (@cls  IS NULL OR project_class_id = @cls)
                                AND (@prog IS NULL OR id = @prog));
END
GO
PRINT '[87] rep.sp_run_program_pivot created';
GO

-- ── rep.sp_run_summary_cost ──────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_summary_cost]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_summary_cost];
GO
CREATE PROCEDURE [rep].[sp_run_summary_cost]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);
    DECLARE @yf   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to') AS INT);

    SELECT @result_json = (
        SELECT
            (SELECT code FROM [core].[program] WHERE id = @prog) AS program_code,
            ISNULL((SELECT SUM(planned)   FROM [cp].[facts] WHERE program_id = @prog AND ISNULL(cancellato,0)=0
                     AND (@yf IS NULL OR time_month_id >= @yf*100+1)
                     AND (@yt IS NULL OR time_month_id <= @yt*100+12)
                     AND (@scn IS NULL OR project_scenario_id = @scn)), 0) AS total_planned,
            ISNULL((SELECT SUM(actual)    FROM [cp].[facts] WHERE program_id = @prog AND ISNULL(cancellato,0)=0
                     AND (@yf IS NULL OR time_month_id >= @yf*100+1)
                     AND (@yt IS NULL OR time_month_id <= @yt*100+12)
                     AND (@scn IS NULL OR project_scenario_id = @scn)), 0) AS total_actual,
            ISNULL((SELECT SUM(committed) FROM [cp].[facts] WHERE program_id = @prog AND ISNULL(cancellato,0)=0
                     AND (@yf IS NULL OR time_month_id >= @yf*100+1)
                     AND (@yt IS NULL OR time_month_id <= @yt*100+12)
                     AND (@scn IS NULL OR project_scenario_id = @scn)), 0) AS total_committed,
            (
                SELECT YEAR(dt.first_day) AS year_num,
                       ISNULL(SUM(f.planned),0) AS planned,
                       ISNULL(SUM(f.actual),0) AS actual,
                       ISNULL(SUM(f.committed),0) AS committed
                FROM [cp].[facts] f
                INNER JOIN [core].[dim_time] dt ON dt.month_id = f.time_month_id
                WHERE f.program_id = @prog AND ISNULL(f.cancellato,0)=0
                  AND (@scn IS NULL OR f.project_scenario_id = @scn)
                GROUP BY YEAR(dt.first_day)
                ORDER BY YEAR(dt.first_day)
                FOR JSON PATH
            ) AS by_year
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [cp].[facts] WHERE program_id = @prog AND ISNULL(cancellato,0)=0);
END
GO
PRINT '[87] rep.sp_run_summary_cost created';
GO

-- ── rep.sp_run_monthly_status ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_monthly_status]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_monthly_status];
GO
CREATE PROCEDURE [rep].[sp_run_monthly_status]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @y    INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_num') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);

    SELECT @result_json = (
        SELECT
            (
                SELECT dt.month AS month_num, dt.month_id,
                       ISNULL(SUM(f.planned),0)   AS planned,
                       ISNULL(SUM(f.actual),0)    AS actual,
                       ISNULL(SUM(f.actual),0) - ISNULL(SUM(f.planned),0) AS variance,
                       CASE WHEN ISNULL(SUM(f.planned),0) = 0 THEN NULL
                            ELSE CAST((ISNULL(SUM(f.actual),0)/SUM(f.planned))*100 AS DECIMAL(8,2)) END AS percent_complete
                FROM [core].[dim_time] dt
                LEFT JOIN [cp].[facts] f ON f.time_month_id = dt.month_id AND f.program_id = @prog AND ISNULL(f.cancellato,0)=0
                                         AND (@scn IS NULL OR f.project_scenario_id = @scn)
                WHERE dt.year = @y
                GROUP BY dt.month, dt.month_id
                ORDER BY dt.month
                FOR JSON PATH
            ) AS months
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = 12;
END
GO
PRINT '[87] rep.sp_run_monthly_status created';
GO

-- ── rep.sp_run_site_planning ─────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_site_planning]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_site_planning];
GO
CREATE PROCEDURE [rep].[sp_run_site_planning]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @cls  INT = TRY_CAST(JSON_VALUE(@params_json, '$.project_class_id') AS INT);
    DECLARE @yf   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to') AS INT);

    SELECT @result_json = (
        SELECT
            (SELECT name FROM [core].[site] WHERE id = @site) AS site_name,
            (
                SELECT p.code, p.name AS program_name,
                       (SELECT ISNULL(SUM(f.planned),0) FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                          AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                          AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)) AS planned,
                       (SELECT ISNULL(SUM(a.fte_percent)/100.0,0) FROM [wf].[allocation] a
                          INNER JOIN [wf].[resource] r ON r.id = a.resource_id
                          WHERE a.program_id = p.id AND r.site_id = @site AND ISNULL(a.cancellato,0)=0) AS total_fte
                FROM [core].[program] p
                WHERE p.site_id = @site AND ISNULL(p.cancellato,0)=0
                  AND (@cls IS NULL OR p.project_class_id = @cls)
                ORDER BY p.code
                FOR JSON PATH
            ) AS programs
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [core].[program] WHERE site_id = @site AND ISNULL(cancellato,0)=0);
END
GO
PRINT '[87] rep.sp_run_site_planning created';
GO

-- ── rep.sp_run_overall_status ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_overall_status]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_overall_status];
GO
CREATE PROCEDURE [rep].[sp_run_overall_status]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @cls  INT = TRY_CAST(JSON_VALUE(@params_json, '$.project_class_id') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);

    SELECT @result_json = (
        SELECT
            (
                SELECT p.code, p.name, p.launch_date, p.start_date, p.end_date,
                       ps.name AS status_name, ps.is_terminal,
                       s.name AS site_name, pc.name AS class_name,
                       ISNULL((SELECT SUM(planned) FROM [cp].[facts] WHERE program_id = p.id AND ISNULL(cancellato,0)=0
                                AND (@scn IS NULL OR project_scenario_id = @scn)), 0) AS total_planned,
                       ISNULL((SELECT SUM(actual)  FROM [cp].[facts] WHERE program_id = p.id AND ISNULL(cancellato,0)=0
                                AND (@scn IS NULL OR project_scenario_id = @scn)), 0) AS total_actual,
                       CASE WHEN p.end_date IS NULL OR p.start_date IS NULL THEN NULL
                            ELSE CAST(DATEDIFF(day, p.start_date, CONVERT(date, SYSUTCDATETIME())) * 100.0
                                      / NULLIF(DATEDIFF(day, p.start_date, p.end_date), 0) AS DECIMAL(6,2))
                       END AS elapsed_pct
                FROM [core].[program] p
                LEFT JOIN [core].[program_status]  ps ON ps.id = p.program_status_id
                LEFT JOIN [core].[site]            s  ON s.id  = p.site_id
                LEFT JOIN [core].[project_class]   pc ON pc.id = p.project_class_id
                WHERE ISNULL(p.cancellato,0)=0
                  AND (@site IS NULL OR p.site_id = @site)
                  AND (@cls  IS NULL OR p.project_class_id = @cls)
                ORDER BY p.code
                FOR JSON PATH
            ) AS programs
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [core].[program] WHERE ISNULL(cancellato,0)=0
                               AND (@site IS NULL OR site_id = @site)
                               AND (@cls  IS NULL OR project_class_id = @cls));
END
GO
PRINT '[87] rep.sp_run_overall_status created';
GO

-- ── rep.sp_run_worst_planning_projects ──────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_worst_planning_projects]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_worst_planning_projects];
GO
CREATE PROCEDURE [rep].[sp_run_worst_planning_projects]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @cls  INT = TRY_CAST(JSON_VALUE(@params_json, '$.project_class_id') AS INT);
    DECLARE @thr  DECIMAL(5,2) = ISNULL(TRY_CAST(JSON_VALUE(@params_json, '$.threshold_pct') AS DECIMAL(5,2)), 80.00);
    DECLARE @lim  INT = ISNULL(TRY_CAST(JSON_VALUE(@params_json, '$.limit_n') AS INT), 10);

    DECLARE @results TABLE (program_code VARCHAR(30), project_code VARCHAR(50), project_name NVARCHAR(500),
                            planned DECIMAL(19,4), actual DECIMAL(19,4), variance_pct DECIMAL(8,2));

    INSERT INTO @results
    SELECT TOP (@lim)
        pr.code AS program_code, pj.code AS project_code, pj.name AS project_name,
        ISNULL(SUM(f.planned),0) AS planned,
        ISNULL(SUM(f.actual),0)  AS actual,
        CASE WHEN ISNULL(SUM(f.planned),0) = 0 THEN NULL
             ELSE CAST(ABS(ISNULL(SUM(f.actual),0) - ISNULL(SUM(f.planned),0)) * 100.0
                       / NULLIF(SUM(f.planned), 0) AS DECIMAL(8,2)) END AS variance_pct
    FROM [core].[project] pj
    INNER JOIN [core].[program] pr ON pr.id = pj.program_id AND ISNULL(pr.cancellato,0)=0
    LEFT  JOIN [cp].[facts] f       ON f.project_id = pj.id AND ISNULL(f.cancellato,0)=0
    WHERE ISNULL(pj.cancellato,0)=0
      AND (@site IS NULL OR pr.site_id = @site)
      AND (@cls  IS NULL OR pr.project_class_id = @cls)
    GROUP BY pr.code, pj.code, pj.name
    HAVING ISNULL(SUM(f.planned),0) > 0
       AND ABS(ISNULL(SUM(f.actual),0) - ISNULL(SUM(f.planned),0)) * 100.0 / SUM(f.planned) >= @thr
    ORDER BY variance_pct DESC;

    SELECT @result_json = (
        SELECT @thr AS threshold_pct, @lim AS limit_n,
               (SELECT * FROM @results ORDER BY variance_pct DESC FOR JSON PATH) AS rows
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*) FROM @results;
END
GO
PRINT '[87] rep.sp_run_worst_planning_projects created';
GO

-- ── rep.sp_run_fte_report ────────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_fte_report]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_fte_report];
GO
CREATE PROCEDURE [rep].[sp_run_fte_report]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @rl   INT = TRY_CAST(JSON_VALUE(@params_json, '$.role_id') AS INT);
    DECLARE @cc   INT = TRY_CAST(JSON_VALUE(@params_json, '$.cost_center_id') AS INT);
    DECLARE @y    INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_num') AS INT);
    DECLARE @mf   INT = TRY_CAST(JSON_VALUE(@params_json, '$.month_from') AS INT);
    DECLARE @mt   INT = TRY_CAST(JSON_VALUE(@params_json, '$.month_to') AS INT);

    DECLARE @from INT = CASE WHEN @y IS NULL THEN NULL ELSE @y * 100 + ISNULL(@mf, 1)  END;
    DECLARE @to   INT = CASE WHEN @y IS NULL THEN NULL ELSE @y * 100 + ISNULL(@mt, 12) END;

    SELECT @result_json = (
        SELECT
            (
                SELECT r.code AS resource_code,
                       r.first_name + N' ' + r.last_name AS resource_name,
                       rl.name AS role_name, cc.name AS cost_center_name,
                       s.name AS site_name,
                       a.time_month_id, a.fte_percent, a.hours, a.cost_amount
                FROM [wf].[allocation] a
                INNER JOIN [wf].[resource]    r  ON r.id  = a.resource_id    AND ISNULL(r.cancellato,0)=0
                INNER JOIN [wf].[role]        rl ON rl.id = r.role_id
                INNER JOIN [wf].[cost_center] cc ON cc.id = r.cost_center_id
                LEFT  JOIN [core].[site]      s  ON s.id  = r.site_id
                WHERE ISNULL(a.cancellato,0)=0
                  AND (@site IS NULL OR r.site_id = @site)
                  AND (@rl   IS NULL OR r.role_id = @rl)
                  AND (@cc   IS NULL OR r.cost_center_id = @cc)
                  AND (@from IS NULL OR a.time_month_id >= @from)
                  AND (@to   IS NULL OR a.time_month_id <= @to)
                ORDER BY r.code, a.time_month_id
                FOR JSON PATH
            ) AS allocations
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*)
    FROM [wf].[allocation] a INNER JOIN [wf].[resource] r ON r.id = a.resource_id
    WHERE ISNULL(a.cancellato,0)=0 AND ISNULL(r.cancellato,0)=0
      AND (@site IS NULL OR r.site_id = @site) AND (@rl IS NULL OR r.role_id = @rl)
      AND (@cc IS NULL OR r.cost_center_id = @cc)
      AND (@from IS NULL OR a.time_month_id >= @from) AND (@to IS NULL OR a.time_month_id <= @to);
END
GO
PRINT '[87] rep.sp_run_fte_report created';
GO

PRINT '[87-reports-real-sps] DONE — 7 SP skeleton ready (full logic porting in Sprint 9)';
GO
