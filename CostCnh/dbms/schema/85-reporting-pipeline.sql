-- =============================================================================
-- CostCnh_Data — Sprint 6b: background reporting pipeline
-- =============================================================================
-- Pattern (Long Running Task + Notification When Ready):
--   1. UI: click "Genera report" → POST /api/reports/run/<def_id>
--   2. ReportingController: INSERT rep.report_execution (status=0)
--                            audit.outbox_enqueue(event_kind='report_generate', entity_id=execId)
--                            → return immediato execution_id
--   3. SchedulerActionsController.OutboxDispatch (cron 30s) claima la riga
--   4. Handler dispatcha per event_kind='report_generate':
--      - UPDATE execution.status=1 (running)
--      - EXEC report_definition.stored_name @params_json, @execution_id OUTPUT
--      - SP scrive result_json in rep.report_execution
--      - UPDATE execution.status=2 + completed_at_utc + duration_ms
--      - INotificationRepository.EnqueueAsync(recipient_user_id, type='report.ready',
--                                              target='/rep_executions/edit/<id>')
--   5. User vede notification-bell badge → click → apre execution detail
--
-- Sostituisce ReportingController legacy 7533 LoC che girava report sync nel
-- request thread (timeout su Azure SQL App Gateway 230s).
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

IF SCHEMA_ID('rep') IS NULL EXEC('CREATE SCHEMA [rep]');
GO

-- ── rep.report_definition (catalog) ──────────────────────────────────────────
IF OBJECT_ID(N'[rep].[report_definition]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[report_definition] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_report_definition PRIMARY KEY CLUSTERED,
        code                    VARCHAR(60) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        category                NVARCHAR(60) NULL,                              -- 'Planning' | 'Workforce' | 'XBS' | 'Site' | 'Cost'
        stored_name             SYSNAME NOT NULL,                               -- e.g. 'rep.sp_run_program_overview'
        default_params_json     NVARCHAR(MAX) NULL,
        est_duration_seconds    INT NULL,                                       -- stima per UI ("~ 10 sec")
        output_format           VARCHAR(20) NOT NULL CONSTRAINT DF_report_definition_output_format DEFAULT ('json'),
                                                                                -- 'json' | 'xlsx' | 'pdf'
        is_active               BIT NOT NULL CONSTRAINT DF_report_definition_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_report_definition_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_report_definition_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rep_report_definition_code UNIQUE (code)
    );
    PRINT '[85] rep.report_definition created';
END
GO

-- ── rep.report_execution (history + result) ─────────────────────────────────
IF OBJECT_ID(N'[rep].[report_execution]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[report_execution] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_report_execution PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_rep_report_execution_public_id DEFAULT (NEWSEQUENTIALID()),
        report_definition_id    INT NOT NULL CONSTRAINT FK_rep_report_execution_def REFERENCES [rep].[report_definition](id),
        report_code             VARCHAR(60) NOT NULL,                           -- denormalized per fast filter
        params_json             NVARCHAR(MAX) NULL,
        status                  TINYINT NOT NULL CONSTRAINT DF_rep_report_execution_status DEFAULT (0),
                                                                                -- 0=queued, 1=running, 2=completed, 9=failed
        outbox_id               BIGINT NULL,                                    -- link a audit.outbox.id
        result_json             NVARCHAR(MAX) NULL,                             -- per output_format='json'
        result_path             NVARCHAR(1000) NULL,                            -- per output_format='xlsx'/'pdf'
        result_row_count        INT NULL,
        last_error              NVARCHAR(2000) NULL,
        requested_by_user_id    INT NULL,
        requested_at_utc        DATETIME2(3) NOT NULL CONSTRAINT DF_rep_report_execution_requested_at_utc DEFAULT (SYSUTCDATETIME()),
        started_at_utc          DATETIME2(3) NULL,
        completed_at_utc        DATETIME2(3) NULL,
        duration_ms             INT NULL,
        notification_id         BIGINT NULL,                                    -- link a notifica emessa
        cancellato              BIT NOT NULL CONSTRAINT DF_rep_report_execution_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rep_report_execution_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL
    );
    CREATE INDEX ix_rep_report_execution_status ON [rep].[report_execution](status, requested_at_utc DESC) WHERE cancellato = 0;
    CREATE INDEX ix_rep_report_execution_user_recent ON [rep].[report_execution](requested_by_user_id, requested_at_utc DESC)
        WHERE requested_by_user_id IS NOT NULL AND cancellato = 0;
    PRINT '[85] rep.report_execution created';
END
GO

-- ── Sample SP #1: program_overview ──────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_program_overview]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_program_overview];
GO
CREATE PROCEDURE [rep].[sp_run_program_overview]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- Simula long-running per testing background pattern
    -- WAITFOR DELAY '00:00:03';

    DECLARE @bu INT = TRY_CAST(JSON_VALUE(@params_json, '$.business_unit_id') AS INT);

    SELECT @result_json = (
        SELECT
            (SELECT COUNT(*) FROM [core].[program] WHERE ISNULL(cancellato,0)=0) AS total_programs,
            (SELECT COUNT(*) FROM [core].[project] WHERE ISNULL(cancellato,0)=0) AS total_projects,
            (
                SELECT ps.name AS status_name, COUNT(p.id) AS cnt
                FROM [core].[program_status] ps
                LEFT JOIN [core].[program] p ON p.program_status_id = ps.id AND ISNULL(p.cancellato,0)=0
                WHERE ISNULL(ps.cancellato,0)=0
                GROUP BY ps.name
                FOR JSON PATH
            ) AS programs_by_status,
            (
                SELECT s.name AS site_name, COUNT(p.id) AS cnt
                FROM [core].[site] s
                LEFT JOIN [core].[program] p ON p.site_id = s.id AND ISNULL(p.cancellato,0)=0
                WHERE ISNULL(s.cancellato,0)=0
                  AND (@bu IS NULL OR s.business_unit_id = @bu)
                GROUP BY s.name
                FOR JSON PATH
            ) AS programs_by_site
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SET @result_row_count = (SELECT COUNT(*) FROM [core].[program] WHERE ISNULL(cancellato,0)=0);
END
GO
PRINT '[85] rep.sp_run_program_overview created';
GO

-- ── Sample SP #2: workforce_utilization ─────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_workforce_utilization]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_workforce_utilization];
GO
CREATE PROCEDURE [rep].[sp_run_workforce_utilization]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT @result_json = (
        SELECT
            (SELECT COUNT(*) FROM [wf].[resource] WHERE ISNULL(cancellato,0)=0) AS total_resources,
            (SELECT COUNT(*) FROM [wf].[cost_center] WHERE ISNULL(cancellato,0)=0) AS total_cost_centers,
            (SELECT CAST(AVG(avg_fte) AS DECIMAL(10,2)) FROM [wf].[vw_chart_fte_by_cost_center]) AS avg_fte_overall,
            (
                SELECT cost_center_name, resource_count, avg_fte, total_cost
                FROM [wf].[vw_chart_fte_by_cost_center]
                ORDER BY total_cost DESC
                FOR JSON PATH
            ) AS top_cost_centers,
            (
                SELECT role_name, resource_count, total_cost
                FROM [wf].[vw_chart_cost_by_role]
                ORDER BY total_cost DESC
                FOR JSON PATH
            ) AS roles_breakdown
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SET @result_row_count = (SELECT COUNT(*) FROM [wf].[resource] WHERE ISNULL(cancellato,0)=0);
END
GO
PRINT '[85] rep.sp_run_workforce_utilization created';
GO

-- ── Sample SP #3: xbs_rollup ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_xbs_rollup]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_xbs_rollup];
GO
CREATE PROCEDURE [rep].[sp_run_xbs_rollup]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @result_json = (
        SELECT
            (SELECT COUNT(*) FROM [xbs].[node] WHERE ISNULL(cancellato,0)=0) AS total_nodes,
            (
                SELECT tk.code AS tree_kind_code, tk.name AS tree_kind_name, COUNT(n.id) AS node_count, MAX(n.depth) AS max_depth
                FROM [xbs].[tree_kind] tk
                LEFT JOIN [xbs].[node] n ON n.tree_kind_id = tk.id AND ISNULL(n.cancellato,0)=0
                GROUP BY tk.code, tk.name
                FOR JSON PATH
            ) AS by_kind,
            (
                SELECT depth, COUNT(*) AS node_count
                FROM [xbs].[node]
                WHERE ISNULL(cancellato,0)=0
                GROUP BY depth
                ORDER BY depth
                FOR JSON PATH
            ) AS by_depth
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [xbs].[node] WHERE ISNULL(cancellato,0)=0);
END
GO
PRINT '[85] rep.sp_run_xbs_rollup created';
GO

-- ── Sample SP #4: site_comparison ───────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_site_comparison]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_site_comparison];
GO
CREATE PROCEDURE [rep].[sp_run_site_comparison]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @result_json = (
        SELECT
            (
                SELECT s.code AS site_code, s.name AS site_name, s.business_unit_id,
                       COUNT(DISTINCT p.id) AS program_count,
                       (SELECT COUNT(*) FROM [wf].[resource] r WHERE r.site_id = s.id AND ISNULL(r.cancellato,0)=0) AS resource_count
                FROM [core].[site] s
                LEFT JOIN [core].[program] p ON p.site_id = s.id AND ISNULL(p.cancellato,0)=0
                WHERE ISNULL(s.cancellato,0)=0
                GROUP BY s.id, s.code, s.name, s.business_unit_id
                ORDER BY s.business_unit_id, s.code
                FOR JSON PATH
            ) AS sites
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [core].[site] WHERE ISNULL(cancellato,0)=0);
END
GO
PRINT '[85] rep.sp_run_site_comparison created';
GO

-- ── Sample SP #5: cost_trend ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[sp_run_cost_trend]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_cost_trend];
GO
CREATE PROCEDURE [rep].[sp_run_cost_trend]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT @result_json = (
        SELECT
            (
                SELECT time_month_id, month_label, total_cost, total_hours, active_resources
                FROM [rep].[vw_chart_cost_trend_by_month]
                WHERE total_cost > 0
                ORDER BY time_month_id
                FOR JSON PATH
            ) AS monthly_trend
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );
    SET @result_row_count = (SELECT COUNT(*) FROM [rep].[vw_chart_cost_trend_by_month] WHERE total_cost > 0);
END
GO
PRINT '[85] rep.sp_run_cost_trend created';
GO

-- ── Seed 5 report definitions ───────────────────────────────────────────────
INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, est_duration_seconds, default_params_json, output_format)
SELECT v.code, v.name, v.descr, v.cat, v.stored, v.est, v.params, 'json'
FROM (VALUES
    ('program_overview',     N'Program Overview',      N'KPI aggregati programmi (count per status/site/class)',  N'Planning',  'rep.sp_run_program_overview',     5,  N'{"business_unit_id":null}'),
    ('workforce_utilization',N'Workforce Utilization', N'Utilizzo workforce: avg FTE per cost center, top costi', N'Workforce', 'rep.sp_run_workforce_utilization',8,  N'{}'),
    ('xbs_rollup',           N'XBS Rollup',            N'Rollup nodi XBS/WBS per tree_kind e depth',             N'Masterdata',  'rep.sp_run_xbs_rollup',           3,  N'{}'),
    ('site_comparison',      N'Site Comparison',       N'Comparazione site: program count + resource count',     N'Planning',  'rep.sp_run_site_comparison',      4,  N'{}'),
    ('cost_trend',           N'Cost Trend',            N'Trend mensile costo workforce',                          N'Workforce', 'rep.sp_run_cost_trend',           5,  N'{}')
) v(code, name, descr, cat, stored, est, params)
WHERE NOT EXISTS (SELECT 1 FROM [rep].[report_definition] r WHERE r.code = v.code);
GO
PRINT '[85] rep.report_definition: 5 sample reports seeded';
GO

PRINT '[85-reporting-pipeline] DONE';
GO
