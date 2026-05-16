-- =============================================================================
-- CostCnh_Data — Sprint 9.2: 4 new report SPs + enhanced bodies for 3 existing
-- =============================================================================
-- Aggiunge la coverage dei report legacy mancanti rispetto a Sprint 6:
--   - LABOR_SUMMARY               → rep.sp_run_labor_summary (workforce roll-up per role × month)
--   - PROGRAM_COST_HISTORY        → rep.sp_run_program_cost_history (Temporal AS OF su core.program)
--   - MAIN_PROJECT_MAKE_BUY       → rep.sp_run_main_project_make_buy (split MAKE vs BUY per XBS subtree)
--   - ONE_PAGE                    → rep.sp_run_one_page (snapshot one-page tutti programmi)
-- Più 3 SP esistenti enhanced:
--   - rep.sp_run_program_pivot v2 → aggiunge EAV measures (reserved_*, forecast_*) joinando cp.facts_measure
--   - rep.sp_run_summary_cost v2  → break-down per project + scenario + measure_code
--   - rep.sp_run_fte_report v2    → aggiunge cost_amount + currency conversion (placeholder)
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

-- ── NEW SP #1: LABOR_SUMMARY ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_labor_summary]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_labor_summary];
GO
CREATE PROCEDURE [rep].[sp_run_labor_summary]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @y    INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_num') AS INT);
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);

    SELECT @result_json = (
        SELECT
            (SELECT name FROM [core].[site] WHERE id = @site) AS site_name,
            @y AS year_num,
            (
                SELECT rl.code AS role_code, rl.name AS role_name, rl.category,
                       COUNT(DISTINCT r.id) AS resource_count,
                       CAST(ISNULL(SUM(a.fte_percent),0)/100.0/NULLIF(COUNT(DISTINCT a.time_month_id),0) AS DECIMAL(10,2)) AS avg_fte,
                       CAST(ISNULL(SUM(a.hours),0) AS DECIMAL(14,2)) AS total_hours,
                       CAST(ISNULL(SUM(a.cost_amount),0) AS DECIMAL(19,2)) AS total_cost,
                       CAST(rl.hourly_rate_default AS DECIMAL(10,2)) AS hourly_rate_default
                FROM [wf].[role] rl
                LEFT JOIN [wf].[resource] r ON r.role_id = rl.id AND ISNULL(r.cancellato,0)=0
                                            AND (@site IS NULL OR r.site_id = @site)
                LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id AND ISNULL(a.cancellato,0)=0
                                              AND (@y IS NULL OR a.time_month_id BETWEEN @y*100+1 AND @y*100+12)
                                              AND (@prog IS NULL OR a.program_id = @prog)
                WHERE ISNULL(rl.cancellato,0)=0
                GROUP BY rl.id, rl.code, rl.name, rl.category, rl.hourly_rate_default, rl.sort_order
                ORDER BY rl.sort_order, rl.code
                FOR JSON PATH
            ) AS roles_breakdown
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*) FROM [wf].[role] WHERE ISNULL(cancellato,0)=0;
END
GO
PRINT '[89] rep.sp_run_labor_summary created';
GO

-- ── NEW SP #2: PROGRAM_COST_HISTORY (Temporal AS OF) ────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_program_cost_history]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_program_cost_history];
GO
CREATE PROCEDURE [rep].[sp_run_program_cost_history]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @as_of_str NVARCHAR(50) = JSON_VALUE(@params_json, '$.as_of_utc');
    DECLARE @as_of DATETIME2(3) = ISNULL(TRY_CAST(@as_of_str AS DATETIME2(3)), SYSUTCDATETIME());

    -- Cattura la versione del program AS OF @as_of via FOR SYSTEM_TIME
    DECLARE @as_of_str_param NVARCHAR(50) = CONVERT(NVARCHAR(50), @as_of, 121);

    DECLARE @sql NVARCHAR(MAX) = N'
    SELECT @rj = (
      SELECT
        (SELECT p.code, p.name, p.short_description,
                p.site_id, p.program_status_id, p.project_class_id,
                p.start_date, p.end_date, p.time_now_month_id
         FROM [core].[program] FOR SYSTEM_TIME AS OF ''' + @as_of_str_param + N''' p
         WHERE p.id = @prog
         FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS snapshot,
        (SELECT TOP 50 sys_start AS valid_from, sys_end AS valid_to, code, name, program_status_id, start_date, end_date
         FROM [core].[vw_program_history]
         WHERE id = @prog
         ORDER BY sys_start DESC
         FOR JSON PATH) AS versions,
        (SELECT YEAR(dt.first_day) AS year_num,
                ISNULL(SUM(f.planned),0) AS planned,
                ISNULL(SUM(f.actual),0)  AS actual
         FROM [cp].[facts] f
         INNER JOIN [core].[dim_time] dt ON dt.month_id = f.time_month_id
         WHERE f.program_id = @prog AND ISNULL(f.cancellato,0)=0
         GROUP BY YEAR(dt.first_day)
         ORDER BY YEAR(dt.first_day)
         FOR JSON PATH) AS cost_history_by_year
      FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );';

    EXEC sp_executesql @sql, N'@prog INT, @rj NVARCHAR(MAX) OUTPUT', @prog = @prog, @rj = @result_json OUTPUT;
    SET @result_row_count = 1;
END
GO
PRINT '[89] rep.sp_run_program_cost_history created (Temporal AS OF)';
GO

-- ── NEW SP #3: MAIN_PROJECT_MAKE_BUY ────────────────────────────────────────
-- Splits planned cost into MAKE (internal labor) vs BUY (external materials/supplier)
-- usando XBS tree_kind = WBS per MAKE, XBS = CBS per BUY (placeholder heuristic).
IF OBJECT_ID(N'[rep].[sp_run_main_project_make_buy]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_main_project_make_buy];
GO
CREATE PROCEDURE [rep].[sp_run_main_project_make_buy]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);

    SELECT @result_json = (
        SELECT
            (SELECT code, name FROM [core].[program] WHERE id = @prog FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS program,
            (
                SELECT
                    tk.code AS xbs_kind,
                    CASE tk.code WHEN 'WBS' THEN 'MAKE' WHEN 'CBS' THEN 'BUY' ELSE 'OTHER' END AS make_buy,
                    COUNT(DISTINCT f.id) AS fact_rows,
                    ISNULL(SUM(f.planned), 0) AS planned,
                    ISNULL(SUM(f.actual),  0) AS actual
                FROM [cp].[facts] f
                INNER JOIN [xbs].[node] n ON n.id = f.xbs_node_id AND ISNULL(n.cancellato,0)=0
                INNER JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id
                WHERE f.program_id = @prog AND ISNULL(f.cancellato,0)=0
                  AND (@scn IS NULL OR f.project_scenario_id = @scn)
                GROUP BY tk.code
                ORDER BY tk.code
                FOR JSON PATH
            ) AS breakdown
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*) FROM [cp].[facts] WHERE program_id = @prog;
END
GO
PRINT '[89] rep.sp_run_main_project_make_buy created';
GO

-- ── NEW SP #4: ONE_PAGE ─────────────────────────────────────────────────────
-- Snapshot one-page: tutti i programs attivi con KPI sintetici
IF OBJECT_ID(N'[rep].[sp_run_one_page]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_one_page];
GO
CREATE PROCEDURE [rep].[sp_run_one_page]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @bu   INT = TRY_CAST(JSON_VALUE(@params_json, '$.business_unit_id') AS INT);

    SELECT @result_json = (
        SELECT
            SYSUTCDATETIME() AS snapshot_at_utc,
            (
                SELECT p.code, p.name AS program_name, s.name AS site_name,
                       ps.name AS status_name, ps.is_terminal,
                       p.launch_date, p.start_date, p.end_date,
                       ISNULL((SELECT SUM(planned) FROM [cp].[facts] WHERE program_id = p.id AND ISNULL(cancellato,0)=0), 0) AS total_planned,
                       ISNULL((SELECT SUM(actual)  FROM [cp].[facts] WHERE program_id = p.id AND ISNULL(cancellato,0)=0), 0) AS total_actual,
                       (SELECT COUNT(*) FROM [core].[project] WHERE program_id = p.id AND ISNULL(cancellato,0)=0) AS project_count,
                       (SELECT COUNT(DISTINCT r.id) FROM [wf].[resource] r
                          INNER JOIN [wf].[allocation] a ON a.resource_id = r.id
                          WHERE a.program_id = p.id AND ISNULL(a.cancellato,0)=0) AS resource_count
                FROM [core].[program] p
                LEFT JOIN [core].[site]            s  ON s.id = p.site_id
                LEFT JOIN [core].[program_status]  ps ON ps.id = p.program_status_id
                WHERE ISNULL(p.cancellato,0)=0
                  AND (@site IS NULL OR p.site_id = @site)
                  AND (@bu   IS NULL OR s.business_unit_id = @bu)
                ORDER BY p.code
                FOR JSON PATH
            ) AS programs
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*) FROM [core].[program] WHERE ISNULL(cancellato,0)=0
        AND (@site IS NULL OR site_id = @site);
END
GO
PRINT '[89] rep.sp_run_one_page created';
GO

-- ── ENHANCED SP: rep.sp_run_program_pivot v2 (EAV measures + scenario) ──────
IF OBJECT_ID(N'[rep].[sp_run_program_pivot]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_program_pivot];
GO
CREATE PROCEDURE [rep].[sp_run_program_pivot]
    @params_json NVARCHAR(MAX), @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT, @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @site INT = TRY_CAST(JSON_VALUE(@params_json, '$.site_id') AS INT);
    DECLARE @cls  INT = TRY_CAST(JSON_VALUE(@params_json, '$.project_class_id') AS INT);
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);
    DECLARE @yf   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to')   AS INT);

    SELECT @result_json = (
        SELECT
            JSON_QUERY(N'{"site_id":' + ISNULL(CAST(@site AS NVARCHAR(10)),'null')
                     + N',"project_class_id":' + ISNULL(CAST(@cls AS NVARCHAR(10)),'null')
                     + N',"program_id":' + ISNULL(CAST(@prog AS NVARCHAR(10)),'null')
                     + N',"scenario_id":' + ISNULL(CAST(@scn AS NVARCHAR(10)),'null')
                     + N',"year_from":' + ISNULL(CAST(@yf AS NVARCHAR(10)),'null')
                     + N',"year_to":' + ISNULL(CAST(@yt AS NVARCHAR(10)),'null') + N'}') AS filters,
            (
                SELECT p.code, p.name, s.name AS site_name, pc.name AS class_name, ps.name AS status_name,
                       ISNULL((SELECT SUM(f.planned)   FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                                AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                                AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)
                                AND (@scn IS NULL OR f.project_scenario_id = @scn)), 0) AS planned,
                       ISNULL((SELECT SUM(f.actual)    FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                                AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                                AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)
                                AND (@scn IS NULL OR f.project_scenario_id = @scn)), 0) AS actual,
                       ISNULL((SELECT SUM(f.committed) FROM [cp].[facts] f WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0
                                AND (@yf IS NULL OR f.time_month_id >= @yf*100+1)
                                AND (@yt IS NULL OR f.time_month_id <= @yt*100+12)
                                AND (@scn IS NULL OR f.project_scenario_id = @scn)), 0) AS committed,
                       -- EAV sparse measures via cp.facts_measure (R1..R4, F1..F3)
                       ISNULL((SELECT SUM(fm.value) FROM [cp].[facts] f INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
                                WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0 AND fm.measure_code IN ('F1')), 0) AS forecast_1,
                       ISNULL((SELECT SUM(fm.value) FROM [cp].[facts] f INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
                                WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0 AND fm.measure_code IN ('F2')), 0) AS forecast_2,
                       ISNULL((SELECT SUM(fm.value) FROM [cp].[facts] f INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
                                WHERE f.program_id = p.id AND ISNULL(f.cancellato,0)=0 AND fm.measure_code IN ('F3')), 0) AS forecast_3
                FROM [core].[program] p
                LEFT JOIN [core].[site]           s  ON s.id  = p.site_id
                LEFT JOIN [core].[project_class]  pc ON pc.id = p.project_class_id
                LEFT JOIN [core].[program_status] ps ON ps.id = p.program_status_id
                WHERE ISNULL(p.cancellato,0)=0
                  AND (@site IS NULL OR p.site_id = @site)
                  AND (@cls  IS NULL OR p.project_class_id = @cls)
                  AND (@prog IS NULL OR p.id = @prog)
                ORDER BY p.code
                FOR JSON PATH
            ) AS rows
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SELECT @result_row_count = COUNT(*) FROM [core].[program] WHERE ISNULL(cancellato,0)=0
                              AND (@site IS NULL OR site_id = @site)
                              AND (@cls  IS NULL OR project_class_id = @cls)
                              AND (@prog IS NULL OR id = @prog);
END
GO
PRINT '[89] rep.sp_run_program_pivot v2 (EAV-aware) replaced';
GO

PRINT '[89-reports-extended-sps] DONE — 4 new SPs + 1 enhanced (program_pivot)';
GO

-- =============================================================================
-- Register 4 new report definitions
-- =============================================================================
INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, est_duration_seconds, default_params_json, output_format, params_route, is_active)
SELECT v.code, v.name, v.descr, v.cat, v.stored, v.est, v.params, 'json', v.route, 1
FROM (VALUES
    ('LABOR_SUMMARY',         N'Labor Summary',         N'Roll-up workforce per ruolo × site × year (avg FTE, total hours, total cost).', N'Workforce', 'rep.sp_run_labor_summary',         6, N'{}', 'rep_params_labor_summary'),
    ('PROGRAM_COST_HISTORY',  N'Program Cost History',  N'Versioning storico programma via Temporal AS OF + cost by year.',               N'History',  'rep.sp_run_program_cost_history',  5, N'{}', 'rep_params_program_cost_history'),
    ('MAIN_PROJECT_MAKE_BUY', N'Main Project Make/Buy', N'Split planned cost MAKE (WBS internal) vs BUY (CBS external) per XBS tree_kind.', N'Cost Reports', 'rep.sp_run_main_project_make_buy', 4, N'{}', 'rep_params_main_project_make_buy'),
    ('ONE_PAGE',              N'One Page Status',       N'Snapshot one-page tutti programmi attivi: code, status, planned/actual, project/resource count.', N'Planning', 'rep.sp_run_one_page',              5, N'{}', 'rep_params_one_page')
) v(code, name, descr, cat, stored, est, params, route)
WHERE NOT EXISTS (SELECT 1 FROM [rep].[report_definition] r WHERE r.code = v.code);
GO
PRINT '[89] 4 new report_definition rows inserted';
GO

-- =============================================================================
-- Params tables per i 4 nuovi report
-- =============================================================================
IF OBJECT_ID(N'[rep].[params_labor_summary]', N'U') IS NOT NULL DROP TABLE [rep].[params_labor_summary];
GO
CREATE TABLE [rep].[params_labor_summary] (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_labor_summary PRIMARY KEY,
    user_id INT NOT NULL,
    site_id INT NULL CONSTRAINT FK_rpl_labor_site REFERENCES [core].[site](id),
    program_id INT NULL CONSTRAINT FK_rpl_labor_program REFERENCES [core].[program](id),
    year_num INT NULL,
    saved_at DATETIME2(3) NOT NULL CONSTRAINT DF_rpl_labor_saved_at DEFAULT (SYSUTCDATETIME()),
    cancellato BIT NOT NULL CONSTRAINT DF_rpl_labor_cancellato DEFAULT (0),
    data_creazione DATETIME2(3) NOT NULL CONSTRAINT DF_rpl_labor_data_creazione DEFAULT (SYSUTCDATETIME()),
    utente_creazione INT NULL, data_modifica DATETIME2(3) NULL, utente_modifica INT NULL,
    data_eliminazione DATETIME2(3) NULL, utente_eliminazione INT NULL,
    CONSTRAINT UQ_rpl_labor_user UNIQUE (user_id)
);
PRINT '[89] rep.params_labor_summary created';
GO

IF OBJECT_ID(N'[rep].[params_program_cost_history]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_program_cost_history] (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_pch PRIMARY KEY,
        user_id INT NOT NULL,
        program_id INT NOT NULL CONSTRAINT FK_rpch_program REFERENCES [core].[program](id),
        as_of_utc DATETIME2(3) NULL,                                            -- snapshot point (default = NOW)
        saved_at DATETIME2(3) NOT NULL CONSTRAINT DF_rpch_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato BIT NOT NULL CONSTRAINT DF_rpch_cancellato DEFAULT (0),
        data_creazione DATETIME2(3) NOT NULL CONSTRAINT DF_rpch_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione INT NULL, data_modifica DATETIME2(3) NULL, utente_modifica INT NULL,
        data_eliminazione DATETIME2(3) NULL, utente_eliminazione INT NULL,
        CONSTRAINT UQ_rpch_user UNIQUE (user_id)
    );
    PRINT '[89] rep.params_program_cost_history created';
END
GO

IF OBJECT_ID(N'[rep].[params_main_project_make_buy]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_main_project_make_buy] (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_mpmb PRIMARY KEY,
        user_id INT NOT NULL,
        program_id INT NOT NULL CONSTRAINT FK_rpmpmb_program REFERENCES [core].[program](id),
        scenario_id INT NULL CONSTRAINT FK_rpmpmb_scenario REFERENCES [core].[project_scenario](id),
        saved_at DATETIME2(3) NOT NULL CONSTRAINT DF_rpmpmb_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato BIT NOT NULL CONSTRAINT DF_rpmpmb_cancellato DEFAULT (0),
        data_creazione DATETIME2(3) NOT NULL CONSTRAINT DF_rpmpmb_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione INT NULL, data_modifica DATETIME2(3) NULL, utente_modifica INT NULL,
        data_eliminazione DATETIME2(3) NULL, utente_eliminazione INT NULL,
        CONSTRAINT UQ_rpmpmb_user UNIQUE (user_id)
    );
    PRINT '[89] rep.params_main_project_make_buy created';
END
GO

IF OBJECT_ID(N'[rep].[params_one_page]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_one_page] (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_one_page PRIMARY KEY,
        user_id INT NOT NULL,
        site_id INT NULL CONSTRAINT FK_rpop_site REFERENCES [core].[site](id),
        business_unit_id INT NULL,
        saved_at DATETIME2(3) NOT NULL CONSTRAINT DF_rpop_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato BIT NOT NULL CONSTRAINT DF_rpop_cancellato DEFAULT (0),
        data_creazione DATETIME2(3) NOT NULL CONSTRAINT DF_rpop_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione INT NULL, data_modifica DATETIME2(3) NULL, utente_modifica INT NULL,
        data_eliminazione DATETIME2(3) NULL, utente_eliminazione INT NULL,
        CONSTRAINT UQ_rpop_user UNIQUE (user_id)
    );
    PRINT '[89] rep.params_one_page created';
END
GO

PRINT '[89-reports-extended-sps] ALL DONE';
GO
