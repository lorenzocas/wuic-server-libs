-- =============================================================================
-- Fix bug post-seed:
--   1. vw_program_history / vw_project_history / vw_node_history: DATEDIFF overflow
--      su sys_end = '9999-12-31' (12B secondi > INT range). Cambio a DAY.
--   2. custom_values: rimuovo dal metadata la col 'attribute_code' che non esiste
--      su core.custom_value (il vero campo è custom_attribute_id → JOIN per code).
-- =============================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF; SET NOCOUNT ON;
GO

USE [CostCnh_Data];
GO

-- ─── 1. Fix vw_program_history ───────────────────────────────────────────────
IF OBJECT_ID(N'[core].[vw_program_history]', N'V') IS NOT NULL
    DROP VIEW [core].[vw_program_history];
GO
CREATE VIEW [core].[vw_program_history]
AS
SELECT
    p.id, p.code, p.name, p.short_description,
    p.site_id, s.name AS site_name,
    p.program_status_id, ps.name AS status_name,
    p.project_class_id, pc.name AS class_name,
    p.project_scenario_id, sc.name AS scenario_name,
    p.currency_id, p.is_working, p.is_private,
    p.launch_date, p.start_date, p.end_date,
    p.sys_start, p.sys_end,
    -- DAY invece di SECOND per evitare overflow su sys_end='9999-12-31'
    DATEDIFF(DAY, p.sys_start, CASE WHEN p.sys_end >= CAST('2200-01-01' AS DATETIME2(3))
                                    THEN CAST('2200-01-01' AS DATETIME2(3))
                                    ELSE p.sys_end END) AS valid_for_days,
    CASE WHEN p.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END AS is_current_version,
    p.utente_modifica, p.data_modifica
FROM [core].[program] FOR SYSTEM_TIME ALL p
LEFT JOIN [core].[site] s             ON s.id = p.site_id
LEFT JOIN [core].[program_status] ps  ON ps.id = p.program_status_id
LEFT JOIN [core].[project_class] pc   ON pc.id = p.project_class_id
LEFT JOIN [core].[project_scenario] sc ON sc.id = p.project_scenario_id;
GO

-- ─── 2. Fix vw_project_history ───────────────────────────────────────────────
IF OBJECT_ID(N'[core].[vw_project_history]', N'V') IS NOT NULL
    DROP VIEW [core].[vw_project_history];
GO
CREATE VIEW [core].[vw_project_history]
AS
SELECT
    p.id, p.code, p.name, p.description,
    p.program_id, pr.code AS program_code,
    p.is_active, p.sort_order,
    p.sys_start, p.sys_end,
    DATEDIFF(DAY, p.sys_start, CASE WHEN p.sys_end >= CAST('2200-01-01' AS DATETIME2(3))
                                    THEN CAST('2200-01-01' AS DATETIME2(3))
                                    ELSE p.sys_end END) AS valid_for_days,
    CASE WHEN p.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END AS is_current_version,
    p.utente_modifica, p.data_modifica
FROM [core].[project] FOR SYSTEM_TIME ALL p
LEFT JOIN [core].[program] pr ON pr.id = p.program_id;
GO

-- ─── 3. Fix vw_node_history (se esiste con stesso pattern) ──────────────────
IF OBJECT_ID(N'[xbs].[vw_node_history]', N'V') IS NOT NULL
    DROP VIEW [xbs].[vw_node_history];
GO
CREATE VIEW [xbs].[vw_node_history]
AS
SELECT
    n.id, n.code, n.name, n.description,
    n.tree_kind_id, n.site_id, n.program_id,
    n.depth, n.is_leaf, n.sort_order,
    n.sys_start, n.sys_end,
    DATEDIFF(DAY, n.sys_start, CASE WHEN n.sys_end >= CAST('2200-01-01' AS DATETIME2(3))
                                    THEN CAST('2200-01-01' AS DATETIME2(3))
                                    ELSE n.sys_end END) AS valid_for_days,
    CASE WHEN n.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END AS is_current_version,
    n.utente_modifica, n.data_modifica
FROM [xbs].[node] FOR SYSTEM_TIME ALL n;
GO

PRINT '[fix] history views rebuilt (DATEDIFF DAY, capped at 2200-01-01)';
GO

-- =============================================================================
-- 4. Fix metadata custom_values: rimuovo riferimenti a 'attribute_code'
-- =============================================================================
USE [CostCnh_Metadata];
GO

-- Trova md_id della route 'custom_values'
DECLARE @md INT = (SELECT TOP 1 md_id FROM _metadati__tabelle WHERE mdroutename = 'custom_values');
PRINT '[fix] custom_values md_id = ' + ISNULL(CAST(@md AS VARCHAR(10)), 'NULL');

IF @md IS NOT NULL
BEGIN
    -- Conta col che non esistono nella tabella reale
    DECLARE @bad INT = (
        SELECT COUNT(*) FROM _metadati__colonne c
         WHERE c.md_id = @md
           AND c.mcrealcolumnname NOT IN (
               'id','custom_attribute_id','entity_schema','entity_name','entity_id',
               'value_text','value_number','value_date','value_bool',
               'custom_lookup_id','year_num','ref_object_id',
               'cancellato','data_creazione','utente_creazione',
               'data_modifica','utente_modifica','data_eliminazione','utente_eliminazione'
           )
    );
    PRINT '[fix] bad cols in custom_values metadata = ' + CAST(@bad AS VARCHAR(10));

    -- Delete righe metadati colonne con nomi inesistenti
    DELETE FROM _metadati__colonne
     WHERE md_id = @md
       AND mcrealcolumnname NOT IN (
           'id','custom_attribute_id','entity_schema','entity_name','entity_id',
           'value_text','value_number','value_date','value_bool',
           'custom_lookup_id','year_num','ref_object_id',
           'cancellato','data_creazione','utente_creazione',
           'data_modifica','utente_modifica','data_eliminazione','utente_eliminazione'
       );
    PRINT '[fix] custom_values bad metadata cleaned, rows removed = ' + CAST(@@ROWCOUNT AS VARCHAR(10));
END

-- =============================================================================
-- 5. Bump projectmetadataversion
-- =============================================================================
UPDATE sys_info SET projectmetadataversion = CONVERT(VARCHAR(20), SYSUTCDATETIME(), 112)
                                            + REPLACE(CONVERT(VARCHAR(8), SYSUTCDATETIME(), 108), ':', '');
DECLARE @nv VARCHAR(50) = (SELECT projectmetadataversion FROM sys_info);
PRINT '[fix] projectmetadataversion = ' + @nv;

PRINT '';
PRINT '=== fixes applied ===';
GO
