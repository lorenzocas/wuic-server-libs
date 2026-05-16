-- =============================================================================
-- Task 8.7 — Workforce dashboard upgrade: 4° tile "Top allocated resources YTD"
-- + chart heatmap "resource utilization"
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

-- ─── Top allocated resources YTD (per cost_center filter) ─────────────────────
IF OBJECT_ID(N'[wf].[vw_top_allocated_resources_ytd]', N'V') IS NOT NULL
    DROP VIEW [wf].[vw_top_allocated_resources_ytd];
GO
CREATE VIEW [wf].[vw_top_allocated_resources_ytd] AS
SELECT TOP (50)
    r.id AS resource_id,
    r.code AS resource_code,
    ISNULL(r.first_name, '') + ' ' + ISNULL(r.last_name, '') AS resource_name,
    ro.code AS role_code,
    cc.code AS cost_center_code,
    cc.name AS cost_center_name,
    SUM(a.fte_percent) AS total_fte_percent,
    SUM(a.hours) AS total_hours,
    SUM(a.cost_amount) AS total_cost,
    COUNT(*) AS allocation_count,
    MIN(a.time_month_id) AS first_month,
    MAX(a.time_month_id) AS last_month
  FROM [wf].[allocation] a
  INNER JOIN [wf].[resource] r ON r.id = a.resource_id AND ISNULL(r.cancellato, 0) = 0
  LEFT JOIN [wf].[role] ro ON ro.id = r.role_id AND ISNULL(ro.cancellato, 0) = 0
  LEFT JOIN [wf].[cost_center] cc ON cc.id = r.cost_center_id AND ISNULL(cc.cancellato, 0) = 0
 WHERE a.time_month_id >= (YEAR(SYSUTCDATETIME()) * 100 + 1)   -- YTD
   AND a.time_month_id <= (YEAR(SYSUTCDATETIME()) * 100 + MONTH(SYSUTCDATETIME()))
   AND ISNULL(a.cancellato, 0) = 0
 GROUP BY r.id, r.code, r.first_name, r.last_name, ro.code, cc.code, cc.name
 ORDER BY total_cost DESC;
GO
PRINT '[81-wf] wf.vw_top_allocated_resources_ytd created';
GO

-- ─── Heatmap utilization: resource × month → fte_pct (last 12 months) ─────────
IF OBJECT_ID(N'[wf].[vw_resource_utilization_heatmap]', N'V') IS NOT NULL
    DROP VIEW [wf].[vw_resource_utilization_heatmap];
GO
CREATE VIEW [wf].[vw_resource_utilization_heatmap] AS
SELECT
    r.id AS resource_id,
    r.code AS resource_code,
    ISNULL(r.first_name, '') + ' ' + ISNULL(r.last_name, '') AS resource_name,
    a.time_month_id,
    SUM(a.fte_percent) AS total_fte_percent,
    CASE
        WHEN SUM(a.fte_percent) > 110 THEN 'overload'
        WHEN SUM(a.fte_percent) >= 80 THEN 'fully_loaded'
        WHEN SUM(a.fte_percent) >= 30 THEN 'partial'
        WHEN SUM(a.fte_percent) > 0 THEN 'low'
        ELSE 'idle'
    END AS utilization_band
  FROM [wf].[resource] r
  LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id AND ISNULL(a.cancellato, 0) = 0
     AND a.time_month_id >= ((YEAR(SYSUTCDATETIME())-1) * 100 + MONTH(SYSUTCDATETIME()))
 WHERE ISNULL(r.cancellato, 0) = 0
 GROUP BY r.id, r.code, r.first_name, r.last_name, a.time_month_id;
GO
PRINT '[81-wf] wf.vw_resource_utilization_heatmap created';
GO
