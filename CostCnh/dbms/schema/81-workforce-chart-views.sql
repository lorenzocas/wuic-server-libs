-- =============================================================================
-- CostCnh_Data — Sprint 5c: chart-ready aggregate views per dashboard
-- =============================================================================
-- Le viste vw_cost_center_summary / vw_business_unit_summary hanno granularita'
-- per-mese: ottimo per la list-grid pivot, ma il chart "FTE per cost_center"
-- vuole UNA RIGA per cost_center con il totale aggregato sui mesi attivi.
-- Creo 4 viste chart-ready: 1 row per dimensione, no time dimension.
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

-- ── wf.vw_chart_fte_by_cost_center (1 row per CC, avg FTE su 12 mesi) ───────
IF OBJECT_ID(N'[wf].[vw_chart_fte_by_cost_center]', N'V') IS NOT NULL DROP VIEW [wf].[vw_chart_fte_by_cost_center];
GO
CREATE VIEW [wf].[vw_chart_fte_by_cost_center]
AS
SELECT
    cc.id                                            AS cost_center_id,
    cc.code                                          AS cost_center_code,
    cc.name                                          AS cost_center_name,
    cc.business_unit_id,
    COUNT(DISTINCT r.id)                             AS resource_count,
    CAST(ISNULL(SUM(a.fte_percent), 0) / NULLIF(COUNT(DISTINCT a.time_month_id), 0) / 100.0 AS DECIMAL(10,2)) AS avg_fte,
    CAST(ISNULL(SUM(a.hours), 0)        AS DECIMAL(14,2)) AS total_hours,
    CAST(ISNULL(SUM(a.cost_amount), 0)  AS DECIMAL(19,2)) AS total_cost
FROM [wf].[cost_center] cc
LEFT JOIN [wf].[resource] r   ON r.cost_center_id = cc.id AND ISNULL(r.cancellato, 0) = 0
LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id     AND ISNULL(a.cancellato, 0) = 0
WHERE ISNULL(cc.cancellato, 0) = 0
GROUP BY cc.id, cc.code, cc.name, cc.business_unit_id;
GO
PRINT '[81-wf-chart] wf.vw_chart_fte_by_cost_center created';
GO

-- ── wf.vw_chart_cost_by_cost_center (cost totale per CC) ───────────────────
IF OBJECT_ID(N'[wf].[vw_chart_cost_by_role]', N'V') IS NOT NULL DROP VIEW [wf].[vw_chart_cost_by_role];
GO
CREATE VIEW [wf].[vw_chart_cost_by_role]
AS
SELECT
    rl.id                                            AS role_id,
    rl.code                                          AS role_code,
    rl.name                                          AS role_name,
    rl.category                                      AS role_category,
    COUNT(DISTINCT r.id)                             AS resource_count,
    CAST(ISNULL(SUM(a.hours), 0) AS DECIMAL(14,2))   AS total_hours,
    CAST(ISNULL(SUM(a.cost_amount), 0) AS DECIMAL(19,2)) AS total_cost
FROM [wf].[role] rl
LEFT JOIN [wf].[resource] r ON r.role_id = rl.id    AND ISNULL(r.cancellato, 0) = 0
LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id AND ISNULL(a.cancellato, 0) = 0
WHERE ISNULL(rl.cancellato, 0) = 0
GROUP BY rl.id, rl.code, rl.name, rl.category;
GO
PRINT '[81-wf-chart] wf.vw_chart_cost_by_role created';
GO

-- ── wf.vw_chart_fte_by_business_unit ───────────────────────────────────────
IF OBJECT_ID(N'[wf].[vw_chart_fte_by_business_unit]', N'V') IS NOT NULL DROP VIEW [wf].[vw_chart_fte_by_business_unit];
GO
CREATE VIEW [wf].[vw_chart_fte_by_business_unit]
AS
SELECT
    r.business_unit_id,
    CASE r.business_unit_id
        WHEN 1 THEN N'Off-Highway'
        WHEN 2 THEN N'On-Highway'
        WHEN 3 THEN N'CNH HQ'
        ELSE CAST(r.business_unit_id AS NVARCHAR(20))
    END AS business_unit_name,
    COUNT(DISTINCT r.id)                              AS resource_count,
    COUNT(DISTINCT r.cost_center_id)                  AS cost_center_count,
    CAST(ISNULL(SUM(a.fte_percent), 0) / NULLIF(COUNT(DISTINCT a.time_month_id), 0) / 100.0 AS DECIMAL(10,2)) AS avg_fte,
    CAST(ISNULL(SUM(a.hours), 0)        AS DECIMAL(14,2)) AS total_hours,
    CAST(ISNULL(SUM(a.cost_amount), 0)  AS DECIMAL(19,2)) AS total_cost
FROM [wf].[resource] r
LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id AND ISNULL(a.cancellato, 0) = 0
WHERE ISNULL(r.cancellato, 0) = 0
GROUP BY r.business_unit_id;
GO
PRINT '[81-wf-chart] wf.vw_chart_fte_by_business_unit created';
GO

-- ── wf.vw_chart_resources_by_business_unit (resource count per BU) ─────────
IF OBJECT_ID(N'[wf].[vw_chart_resources_by_role]', N'V') IS NOT NULL DROP VIEW [wf].[vw_chart_resources_by_role];
GO
CREATE VIEW [wf].[vw_chart_resources_by_role]
AS
SELECT
    rl.id                                       AS role_id,
    rl.name                                     AS role_name,
    rl.category                                 AS role_category,
    COUNT(r.id)                                 AS resource_count
FROM [wf].[role] rl
LEFT JOIN [wf].[resource] r ON r.role_id = rl.id AND ISNULL(r.cancellato, 0) = 0
WHERE ISNULL(rl.cancellato, 0) = 0
GROUP BY rl.id, rl.name, rl.category;
GO
PRINT '[81-wf-chart] wf.vw_chart_resources_by_role created';
GO

PRINT '[81-workforce-chart-views] DONE';
GO
