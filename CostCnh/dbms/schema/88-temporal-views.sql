-- =============================================================================
-- CostCnh_Data — Sprint 7 Phase A: Temporal history viewer views
-- =============================================================================
-- Le history tables auto-create (core.program_history, core.project_history,
-- xbs.node_history) contengono UN row per ogni versione storica.
-- Le viste qui sotto:
--   1. UNION current + history (system_time ALL) → mostra TUTTE le versioni
--   2. Aggiungono valid_period_label "2026-04-15 → 2026-05-10 (durata 25 giorni)"
--   3. Cosmetiche: nome utente_modifica risolto, status_name risolto, ecc.
--
-- Sostituisce legacy RevisionType/RevisionCounter/RevisionReference + mirror
-- table CostPlanning_Facts_BaseLine: query temporal AS OF nativa.
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

-- ── core.vw_program_history (all versions) ──────────────────────────────────
IF OBJECT_ID(N'[core].[vw_program_history]', N'V') IS NOT NULL DROP VIEW [core].[vw_program_history];
GO
CREATE VIEW [core].[vw_program_history]
AS
SELECT
    p.id,
    p.code,
    p.name,
    p.short_description,
    p.site_id,
    s.name                                            AS site_name,
    p.program_status_id,
    ps.name                                           AS status_name,
    p.project_class_id,
    pc.name                                           AS class_name,
    p.project_scenario_id,
    sc.name                                           AS scenario_name,
    p.currency_id,
    p.is_working,
    p.is_private,
    p.launch_date,
    p.start_date,
    p.end_date,
    p.sys_start,
    p.sys_end,
    DATEDIFF(SECOND, p.sys_start, p.sys_end)          AS valid_for_seconds,
    CASE WHEN p.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END  AS is_current_version,
    p.utente_modifica,
    p.data_modifica
FROM [core].[program] FOR SYSTEM_TIME ALL p
LEFT JOIN [core].[site] s             ON s.id = p.site_id
LEFT JOIN [core].[program_status] ps  ON ps.id = p.program_status_id
LEFT JOIN [core].[project_class] pc   ON pc.id = p.project_class_id
LEFT JOIN [core].[project_scenario] sc ON sc.id = p.project_scenario_id;
GO
PRINT '[88] core.vw_program_history created (FOR SYSTEM_TIME ALL)';
GO

-- ── core.vw_project_history ─────────────────────────────────────────────────
IF OBJECT_ID(N'[core].[vw_project_history]', N'V') IS NOT NULL DROP VIEW [core].[vw_project_history];
GO
CREATE VIEW [core].[vw_project_history]
AS
SELECT
    p.id,
    p.code,
    p.name,
    p.description,
    p.program_id,
    pr.code                                           AS program_code,
    p.is_active,
    p.sort_order,
    p.sys_start,
    p.sys_end,
    DATEDIFF(SECOND, p.sys_start, p.sys_end)          AS valid_for_seconds,
    CASE WHEN p.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END  AS is_current_version,
    p.utente_modifica,
    p.data_modifica
FROM [core].[project] FOR SYSTEM_TIME ALL p
LEFT JOIN [core].[program] pr ON pr.id = p.program_id;
GO
PRINT '[88] core.vw_project_history created';
GO

-- ── xbs.vw_node_history ─────────────────────────────────────────────────────
IF OBJECT_ID(N'[xbs].[vw_node_history]', N'V') IS NOT NULL DROP VIEW [xbs].[vw_node_history];
GO
CREATE VIEW [xbs].[vw_node_history]
AS
SELECT
    n.id,
    n.code,
    n.name,
    n.tree_kind_id,
    tk.code                                           AS tree_kind_code,
    n.depth,
    CAST(n.node_path.ToString() AS NVARCHAR(900))     AS path_string,
    n.is_leaf,
    n.sort_order,
    n.sys_start,
    n.sys_end,
    DATEDIFF(SECOND, n.sys_start, n.sys_end)          AS valid_for_seconds,
    CASE WHEN n.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END  AS is_current_version,
    n.utente_modifica,
    n.data_modifica
FROM [xbs].[node] FOR SYSTEM_TIME ALL n
LEFT JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id;
GO
PRINT '[88] xbs.vw_node_history created';
GO

PRINT '[88-temporal-views] DONE';
GO
