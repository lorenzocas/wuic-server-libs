-- =============================================================================
-- CostCnh_Data — Sprint 6: chart-ready aggregate views per 5 reporting dashboards
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

-- ── rep.vw_chart_programs_by_status ─────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_programs_by_status]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_programs_by_status];
GO
CREATE VIEW [rep].[vw_chart_programs_by_status]
AS
SELECT
    ps.id AS status_id,
    ps.name AS status_name,
    COUNT(p.id) AS program_count
FROM [core].[program_status] ps
LEFT JOIN [core].[program] p ON p.program_status_id = ps.id AND ISNULL(p.cancellato, 0) = 0
WHERE ISNULL(ps.cancellato, 0) = 0
GROUP BY ps.id, ps.name;
GO
PRINT '[82] rep.vw_chart_programs_by_status created';
GO

-- ── rep.vw_chart_programs_by_site ───────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_programs_by_site]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_programs_by_site];
GO
CREATE VIEW [rep].[vw_chart_programs_by_site]
AS
SELECT
    s.id AS site_id,
    s.name AS site_name,
    s.business_unit_id,
    COUNT(p.id) AS program_count
FROM [core].[site] s
LEFT JOIN [core].[program] p ON p.site_id = s.id AND ISNULL(p.cancellato, 0) = 0
WHERE ISNULL(s.cancellato, 0) = 0
GROUP BY s.id, s.name, s.business_unit_id;
GO
PRINT '[82] rep.vw_chart_programs_by_site created';
GO

-- ── rep.vw_chart_programs_by_class ──────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_programs_by_class]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_programs_by_class];
GO
CREATE VIEW [rep].[vw_chart_programs_by_class]
AS
SELECT
    pc.id AS project_class_id,
    pc.name AS project_class_name,
    COUNT(p.id) AS program_count
FROM [core].[project_class] pc
LEFT JOIN [core].[program] p ON p.project_class_id = pc.id AND ISNULL(p.cancellato, 0) = 0
WHERE ISNULL(pc.cancellato, 0) = 0
GROUP BY pc.id, pc.name;
GO
PRINT '[82] rep.vw_chart_programs_by_class created';
GO

-- ── rep.vw_chart_xbs_by_kind ────────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_xbs_by_kind]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_xbs_by_kind];
GO
CREATE VIEW [rep].[vw_chart_xbs_by_kind]
AS
SELECT
    tk.id AS tree_kind_id,
    tk.code AS tree_kind_code,
    tk.name AS tree_kind_name,
    COUNT(n.id) AS node_count
FROM [xbs].[tree_kind] tk
LEFT JOIN [xbs].[node] n ON n.tree_kind_id = tk.id AND ISNULL(n.cancellato, 0) = 0
GROUP BY tk.id, tk.code, tk.name;
GO
PRINT '[82] rep.vw_chart_xbs_by_kind created';
GO

-- ── rep.vw_chart_xbs_by_depth ───────────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_xbs_by_depth]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_xbs_by_depth];
GO
CREATE VIEW [rep].[vw_chart_xbs_by_depth]
AS
SELECT
    n.depth,
    CAST('Livello ' + CAST(n.depth AS NVARCHAR(10)) AS NVARCHAR(20)) AS depth_label,
    COUNT(*) AS node_count
FROM [xbs].[node] n
WHERE ISNULL(n.cancellato, 0) = 0
GROUP BY n.depth;
GO
PRINT '[82] rep.vw_chart_xbs_by_depth created';
GO

-- ── rep.vw_chart_resources_by_site ──────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_resources_by_site]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_resources_by_site];
GO
CREATE VIEW [rep].[vw_chart_resources_by_site]
AS
SELECT
    s.id AS site_id,
    s.name AS site_name,
    s.business_unit_id,
    COUNT(r.id) AS resource_count
FROM [core].[site] s
LEFT JOIN [wf].[resource] r ON r.site_id = s.id AND ISNULL(r.cancellato, 0) = 0
WHERE ISNULL(s.cancellato, 0) = 0
GROUP BY s.id, s.name, s.business_unit_id;
GO
PRINT '[82] rep.vw_chart_resources_by_site created';
GO

-- ── rep.vw_chart_cost_trend_by_month ────────────────────────────────────────
IF OBJECT_ID(N'[rep].[vw_chart_cost_trend_by_month]', N'V') IS NOT NULL DROP VIEW [rep].[vw_chart_cost_trend_by_month];
GO
CREATE VIEW [rep].[vw_chart_cost_trend_by_month]
AS
SELECT
    a.time_month_id,
    CAST(dt.year AS NVARCHAR(4)) + '-' + RIGHT('0' + CAST(dt.month AS NVARCHAR(2)), 2) AS month_label,
    CAST(ISNULL(SUM(a.cost_amount), 0) AS DECIMAL(19,2)) AS total_cost,
    CAST(ISNULL(SUM(a.hours), 0)       AS DECIMAL(14,2)) AS total_hours,
    COUNT(DISTINCT a.resource_id) AS active_resources
FROM [wf].[allocation] a
INNER JOIN [core].[dim_time] dt ON dt.month_id = a.time_month_id
WHERE ISNULL(a.cancellato, 0) = 0
GROUP BY a.time_month_id, dt.year, dt.month;
GO
PRINT '[82] rep.vw_chart_cost_trend_by_month created';
GO

PRINT '[82-reporting-views] DONE';
GO
