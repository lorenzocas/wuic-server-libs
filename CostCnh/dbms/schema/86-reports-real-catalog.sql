-- =============================================================================
-- CostCnh_Data — Sprint 6 follow-up: report catalog reale (mirror legacy core.Report)
-- =============================================================================
-- Sostituisce i 5 sample creati in 85-reporting-pipeline.sql con i report
-- reali del legacy `core.Report` di CostPlanningModel (visibili nel menu legacy):
--   PROGRAM_PIVOT, SUMMARY_COST, MONTHLY_STATUS, SITE_PLANNING, OVERALL_STATUS,
--   WORST_PLANNING_PROJECTS, FTE_REPORT
--
-- Per ogni report una mini-tabella `rep.params_<code>` con i filtri legacy
-- mappati ai nuovi campi CostCnh, gestita via framework parametric-dialog
-- (Opzione A: una tabella params per report).
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

-- ── ALTER rep.report_definition: add params_route + report_def_id helper col ─
IF COL_LENGTH('rep.report_definition', 'params_route') IS NULL
    ALTER TABLE [rep].[report_definition] ADD params_route VARCHAR(60) NULL;
GO

-- ── Clear sample data ────────────────────────────────────────────────────────
DELETE FROM [rep].[report_execution];
DELETE FROM [rep].[report_definition];
GO

-- ── Insert 7 real reports (codes match legacy core.Report.Name) ─────────────
INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, est_duration_seconds, default_params_json, output_format, params_route, is_active)
VALUES
    ('PROGRAM_PIVOT',           N'Program Pivot',           N'Cost pivot programs × scenarios × time. Filtri: site, project_class, program, scenario, year_from/to, aggregation.', N'Cost Reports',   'rep.sp_run_program_pivot',           20, N'{}', 'json', 'rep_params_program_pivot',           1),
    ('SUMMARY_COST',            N'Summary Cost',            N'Riepilogo costi per programma/scenario. Filtri: program, scenario, year range.',                                  N'Cost Reports',   'rep.sp_run_summary_cost',             8, N'{}', 'json', 'rep_params_summary_cost',            1),
    ('MONTHLY_STATUS',          N'Monthly Status',          N'Stato mensile programma (planned vs actual). Filtri: program, year, scenario.',                                   N'Cost Reports',   'rep.sp_run_monthly_status',          12, N'{}', 'json', 'rep_params_monthly_status',          1),
    ('SITE_PLANNING',           N'Site Planning',           N'Vista pianificazione per site (FTE + cost). Filtri: site (mandatory), project_class, year range.',                N'Cost Reports',   'rep.sp_run_site_planning',           10, N'{}', 'json', 'rep_params_site_planning',           1),
    ('OVERALL_STATUS',          N'Overall Status',          N'KPI overall programs (status, completion %). Filtri: site, project_class, scenario.',                             N'Cost Reports',   'rep.sp_run_overall_status',           6, N'{}', 'json', 'rep_params_overall_status',          1),
    ('WORST_PLANNING_PROJECTS', N'Worst Planning Projects', N'Top N progetti con worst planning (deviation > threshold). Filtri: site, project_class, threshold_pct, limit_n.', N'Cost Reports',   'rep.sp_run_worst_planning_projects',  8, N'{}', 'json', 'rep_params_worst_planning_projects', 1),
    ('FTE_REPORT',              N'FTE Report',              N'Allocazione FTE per risorsa/ruolo/mese. Filtri: site, role, cost_center, year, month range.',                     N'Workforce',     'rep.sp_run_fte_report',              15, N'{}', 'json', 'rep_params_fte_report',              1);
GO

PRINT '[86] rep.report_definition: 7 real reports inserted (mirror legacy core.Report)';
GO

-- =============================================================================
-- ── PARAMS TABLES (1 per report) ─────────────────────────────────────────────
-- =============================================================================

-- ── rep.params_program_pivot ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_program_pivot]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_program_pivot] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_program_pivot PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        site_id                 INT NULL CONSTRAINT FK_rpp_program_pivot_site         REFERENCES [core].[site](id),
        project_class_id        INT NULL CONSTRAINT FK_rpp_program_pivot_class        REFERENCES [core].[project_class](id),
        program_id              INT NULL CONSTRAINT FK_rpp_program_pivot_program      REFERENCES [core].[program](id),
        scenario_id             INT NULL CONSTRAINT FK_rpp_program_pivot_scenario     REFERENCES [core].[project_scenario](id),
        year_from               INT NULL,
        year_to                 INT NULL,
        aggregation             VARCHAR(20) NULL CONSTRAINT DF_rpp_program_pivot_aggregation DEFAULT ('monthly'),
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rpp_program_pivot_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rpp_program_pivot_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rpp_program_pivot_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rpp_program_pivot_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_program_pivot created';
END
GO

-- ── rep.params_summary_cost ─────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_summary_cost]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_summary_cost] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_summary_cost PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        program_id              INT NOT NULL CONSTRAINT FK_rps_summary_cost_program  REFERENCES [core].[program](id),
        scenario_id             INT NULL CONSTRAINT FK_rps_summary_cost_scenario REFERENCES [core].[project_scenario](id),
        year_from               INT NULL,
        year_to                 INT NULL,
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rps_summary_cost_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rps_summary_cost_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rps_summary_cost_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rps_summary_cost_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_summary_cost created';
END
GO

-- ── rep.params_monthly_status ───────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_monthly_status]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_monthly_status] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_monthly_status PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        program_id              INT NOT NULL CONSTRAINT FK_rpm_monthly_status_program  REFERENCES [core].[program](id),
        year_num                INT NOT NULL,
        scenario_id             INT NULL CONSTRAINT FK_rpm_monthly_status_scenario REFERENCES [core].[project_scenario](id),
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rpm_monthly_status_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rpm_monthly_status_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rpm_monthly_status_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rpm_monthly_status_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_monthly_status created';
END
GO

-- ── rep.params_site_planning ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_site_planning]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_site_planning] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_site_planning PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        site_id                 INT NOT NULL CONSTRAINT FK_rps_site_planning_site REFERENCES [core].[site](id),
        project_class_id        INT NULL CONSTRAINT FK_rps_site_planning_class REFERENCES [core].[project_class](id),
        year_from               INT NULL,
        year_to                 INT NULL,
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rps_site_planning_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rps_site_planning_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rps_site_planning_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rps_site_planning_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_site_planning created';
END
GO

-- ── rep.params_overall_status ───────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_overall_status]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_overall_status] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_overall_status PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        site_id                 INT NULL CONSTRAINT FK_rpo_overall_status_site REFERENCES [core].[site](id),
        project_class_id        INT NULL CONSTRAINT FK_rpo_overall_status_class REFERENCES [core].[project_class](id),
        scenario_id             INT NULL CONSTRAINT FK_rpo_overall_status_scenario REFERENCES [core].[project_scenario](id),
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rpo_overall_status_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rpo_overall_status_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rpo_overall_status_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rpo_overall_status_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_overall_status created';
END
GO

-- ── rep.params_worst_planning_projects ──────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_worst_planning_projects]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_worst_planning_projects] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_worst_planning_projects PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        site_id                 INT NULL CONSTRAINT FK_rpw_worst_site REFERENCES [core].[site](id),
        project_class_id        INT NULL CONSTRAINT FK_rpw_worst_class REFERENCES [core].[project_class](id),
        threshold_pct           DECIMAL(5,2) NOT NULL CONSTRAINT DF_rpw_worst_threshold_pct DEFAULT (80.00),
        limit_n                 INT NOT NULL CONSTRAINT DF_rpw_worst_limit_n DEFAULT (10),
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rpw_worst_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rpw_worst_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rpw_worst_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rpw_worst_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_worst_planning_projects created';
END
GO

-- ── rep.params_fte_report ───────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[params_fte_report]', N'U') IS NULL
BEGIN
    CREATE TABLE [rep].[params_fte_report] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rep_params_fte_report PRIMARY KEY CLUSTERED,
        user_id                 INT NOT NULL,
        site_id                 INT NULL CONSTRAINT FK_rpf_fte_site REFERENCES [core].[site](id),
        role_id                 INT NULL CONSTRAINT FK_rpf_fte_role REFERENCES [wf].[role](id),
        cost_center_id          INT NULL CONSTRAINT FK_rpf_fte_cc REFERENCES [wf].[cost_center](id),
        year_num                INT NULL,
        month_from              INT NULL,
        month_to                INT NULL,
        saved_at                DATETIME2(3) NOT NULL CONSTRAINT DF_rpf_fte_saved_at DEFAULT (SYSUTCDATETIME()),
        cancellato              BIT NOT NULL CONSTRAINT DF_rpf_fte_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rpf_fte_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rpf_fte_user UNIQUE (user_id)
    );
    PRINT '[86] rep.params_fte_report created';
END
GO

PRINT '[86-reports-real-catalog] DDL DONE';
GO
