-- =============================================================================
-- Fix 19 phantom columns:
--   - 3 history views: valid_for_seconds → valid_for_days (rename, view già corretta)
--   - xbs_node_history: aggiungo path_string + tree_kind_code alla view
--   - DELETE per le restanti phantom senza fix possibile
-- =============================================================================
SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON;
GO

-- ─── 1. Ricreo xbs.vw_node_history con path_string + tree_kind_code ──────────
USE [CostCnh_Data];
GO
IF OBJECT_ID(N'[xbs].[vw_node_history]', N'V') IS NOT NULL
    DROP VIEW [xbs].[vw_node_history];
GO
CREATE VIEW [xbs].[vw_node_history]
AS
SELECT
    n.id, n.code, n.name, n.description,
    n.tree_kind_id,
    tk.code AS tree_kind_code,
    tk.name AS tree_kind_name,
    n.site_id, n.program_id, n.depth, n.is_leaf, n.sort_order,
    CAST(n.node_path.ToString() AS NVARCHAR(900)) AS path_string,
    n.sys_start, n.sys_end,
    DATEDIFF(DAY, n.sys_start, CASE WHEN n.sys_end >= CAST('2200-01-01' AS DATETIME2(3))
                                    THEN CAST('2200-01-01' AS DATETIME2(3))
                                    ELSE n.sys_end END) AS valid_for_days,
    CASE WHEN n.sys_end >= CAST('9999-12-31' AS DATETIME2(3)) THEN 1 ELSE 0 END AS is_current_version,
    n.utente_modifica, n.data_modifica
FROM [xbs].[node] FOR SYSTEM_TIME ALL n
LEFT JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id;
GO
PRINT '[fix] xbs.vw_node_history rebuilt (with path_string + tree_kind_code)';
GO

-- ─── 2. Rename valid_for_seconds → valid_for_days nel metadata ───────────────
USE [CostCnh_Metadata];
GO
UPDATE _metadati__colonne
   SET mcrealcolumnname = 'valid_for_days',
       mc_nome_colonna  = 'valid_for_days',
       mc_display_string_in_view = N'Validità (giorni)'
 WHERE mcrealcolumnname = 'valid_for_seconds';
PRINT '[fix] valid_for_seconds renamed to valid_for_days: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- ─── 3. DELETE delle phantom restanti ────────────────────────────────────────
-- Lista nota:
--   metadati  tabelle.{button_*, colonna_075_testo, genera_codice} → template demo
--   metadati  tabelle_cloned.mcslctonchangingcustomfunction → template demo
--   dialog.{button_*, colonna_075_testo, genera_codice} → template demo
--   dummysinglevalue.valore → demo

-- Pre-stage tabella reale
USE [CostCnh_Metadata];
IF OBJECT_ID(N'tempdb..#real_cols') IS NOT NULL DROP TABLE #real_cols;
CREATE TABLE #real_cols (
    schema_name SYSNAME NOT NULL,
    table_name  SYSNAME NOT NULL,
    column_name SYSNAME NOT NULL,
    PRIMARY KEY (schema_name, table_name, column_name)
);
INSERT INTO #real_cols
SELECT s.name COLLATE Latin1_General_CI_AS, o.name COLLATE Latin1_General_CI_AS, c.name COLLATE Latin1_General_CI_AS
FROM [CostCnh_Data].sys.columns c
INNER JOIN [CostCnh_Data].sys.objects o ON o.object_id = c.object_id
INNER JOIN [CostCnh_Data].sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U','V');
INSERT INTO #real_cols
SELECT s.name COLLATE Latin1_General_CI_AS, o.name COLLATE Latin1_General_CI_AS, c.name COLLATE Latin1_General_CI_AS
FROM sys.columns c
INNER JOIN sys.objects o ON o.object_id = c.object_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U','V')
  AND NOT EXISTS (SELECT 1 FROM #real_cols r WHERE r.schema_name = s.name AND r.table_name = o.name AND r.column_name = c.name);

-- Identifica le bad ancora rimanenti
IF OBJECT_ID(N'tempdb..#bad_cols') IS NOT NULL DROP TABLE #bad_cols;
SELECT c.mc_id
INTO #bad_cols
FROM _metadati__colonne c
INNER JOIN _metadati__tabelle t ON t.md_id = c.md_id
WHERE c.mcrealcolumnname IS NOT NULL
  AND c.mcrealcolumnname <> ''
  AND NOT EXISTS (
      SELECT 1 FROM #real_cols r
       WHERE r.schema_name COLLATE Latin1_General_CI_AS = ISNULL(t.mdschemaname COLLATE Latin1_General_CI_AS, 'dbo')
         AND r.table_name  COLLATE Latin1_General_CI_AS = t.md_nome_tabella COLLATE Latin1_General_CI_AS
         AND r.column_name COLLATE Latin1_General_CI_AS = c.mcrealcolumnname COLLATE Latin1_General_CI_AS
  );

DECLARE @nbad INT = (SELECT COUNT(*) FROM #bad_cols);
PRINT 'Phantom residue: ' + CAST(@nbad AS VARCHAR);

DELETE FROM _metadati__u_i__stili__colonne WHERE mc_id IN (SELECT mc_id FROM #bad_cols);
PRINT 'Style col rows deleted: ' + CAST(@@ROWCOUNT AS VARCHAR);

DELETE FROM _metadati__colonne WHERE mc_id IN (SELECT mc_id FROM #bad_cols);
PRINT 'Phantom column metadata removed: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- ─── 4. Bump version
UPDATE sys_info SET projectmetadataversion = CONVERT(VARCHAR(20), SYSUTCDATETIME(), 112)
                                            + REPLACE(CONVERT(VARCHAR(8), SYSUTCDATETIME(), 108), ':', '');
DECLARE @nv VARCHAR(50) = (SELECT projectmetadataversion FROM sys_info);
PRINT '[fix] projectmetadataversion = ' + @nv;

PRINT '=== Phantom column fix done ===';
GO
