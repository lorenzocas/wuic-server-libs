-- =============================================================================
-- CostCnh_Data — xbs hotfix: rimuovi vincolo unicita' globale su node_path
-- =============================================================================
-- Lo schema iniziale aveva `UNIQUE CLUSTERED INDEX cix_xbs_node_path ON xbs.node(node_path)`
-- ma con multi-tree-kind (XBS+WBS+OBS+CBS nella stessa tabella) i path collidono
-- perche' tutti partono dallo stesso ROOT '/'. Sostituiamo con:
--   - CLUSTERED non-unique su node_path (preserva ordering depth-first)
--   - UNIQUE NC composito su (tree_kind_id, node_path) (preserva integrita')
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

DECLARE @needs_fix BIT = 0;
SELECT @needs_fix = is_unique FROM sys.indexes
 WHERE name = 'cix_xbs_node_path' AND object_id = OBJECT_ID(N'[xbs].[node]');

IF @needs_fix = 1
BEGIN
    -- Drop schemabound views che bloccano ALTER
    IF OBJECT_ID(N'[xbs].[vw_node_with_ancestors]', N'V') IS NOT NULL DROP VIEW [xbs].[vw_node_with_ancestors];
    IF OBJECT_ID(N'[xbs].[vw_node_flat]',           N'V') IS NOT NULL DROP VIEW [xbs].[vw_node_flat];

    -- Disattiva SYSTEM_VERSIONING per poter dropare cluster index
    ALTER TABLE [xbs].[node] SET (SYSTEM_VERSIONING = OFF);
    DROP INDEX cix_xbs_node_path ON [xbs].[node];
    CREATE CLUSTERED INDEX cix_xbs_node_path ON [xbs].[node](node_path);
    CREATE UNIQUE NONCLUSTERED INDEX ux_xbs_node_kind_path ON [xbs].[node](tree_kind_id, node_path);
    ALTER TABLE [xbs].[node] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [xbs].[node_history], DATA_CONSISTENCY_CHECK = ON));
    PRINT '[22-xbs-multikind-fix] cix_xbs_node_path replaced (non-unique + composite UQ). Re-applicare 21-xbs-views.sql.';
END
ELSE
    PRINT '[22-xbs-multikind-fix] skipped (already applied)';
GO
