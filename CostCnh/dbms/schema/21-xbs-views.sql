-- =============================================================================
-- CostCnh_Data — xbs schema: viste flat per list-grid + tree-view UI
-- =============================================================================
-- vw_xbs_node_flat espone xbs.node con campi human-readable (path string,
-- parent_id risolto da hierarchyid::GetAncestor(1), depth, tree_kind_code).
-- Usata dal list-grid metadata-driven; il custom controller XbsController.cs
-- lavora direttamente su xbs.node + hierarchyid per le operazioni tree.
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

IF OBJECT_ID(N'[xbs].[vw_node_flat]', N'V') IS NOT NULL
    DROP VIEW [xbs].[vw_node_flat];
GO

CREATE VIEW [xbs].[vw_node_flat]
WITH SCHEMABINDING
AS
SELECT
    n.id,
    n.public_id,
    CAST(n.node_path.ToString() AS NVARCHAR(900))         AS path_string,
    n.depth,
    n.tree_kind_id,
    tk.code                                                AS tree_kind_code,
    tk.name                                                AS tree_kind_name,
    n.site_id,
    n.program_id,
    n.code,
    n.name,
    n.description,
    n.is_leaf,
    n.sort_order,
    -- parent_id derivato via GetAncestor(1) — NULL per root
    CASE
        WHEN n.node_path.GetLevel() = 0 THEN NULL
        ELSE (
            SELECT TOP 1 p.id
            FROM [xbs].[node] p
            WHERE p.node_path = n.node_path.GetAncestor(1)
              AND p.tree_kind_id = n.tree_kind_id
              AND ISNULL(p.cancellato, 0) = 0
        )
    END                                                    AS parent_id,
    n.cancellato,
    n.data_creazione,
    n.utente_creazione,
    n.data_modifica,
    n.utente_modifica
FROM [xbs].[node] n
INNER JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id
WHERE ISNULL(n.cancellato, 0) = 0;
GO

PRINT '[21-xbs-views] xbs.vw_node_flat created';
GO

-- vw_xbs_node_with_ancestors — espande ogni nodo con la catena ancestori
-- (utile per breadcrumb display in detail view)
IF OBJECT_ID(N'[xbs].[vw_node_with_ancestors]', N'V') IS NOT NULL
    DROP VIEW [xbs].[vw_node_with_ancestors];
GO

CREATE VIEW [xbs].[vw_node_with_ancestors]
AS
SELECT
    n.id,
    n.tree_kind_id,
    tk.code AS tree_kind_code,
    n.code,
    n.name,
    n.depth,
    n.node_path.ToString() AS path_string,
    -- Costruisce breadcrumb: 'Root > L1 > L2 > Current'
    STUFF((
        SELECT N' > ' + a.name
        FROM [xbs].[node] a
        WHERE n.node_path.IsDescendantOf(a.node_path) = 1
          AND a.tree_kind_id = n.tree_kind_id
          AND ISNULL(a.cancellato, 0) = 0
        ORDER BY a.depth
        FOR XML PATH(''), TYPE
    ).value(N'.', N'NVARCHAR(MAX)'), 1, 3, '') AS breadcrumb
FROM [xbs].[node] n
INNER JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id
WHERE ISNULL(n.cancellato, 0) = 0;
GO

PRINT '[21-xbs-views] xbs.vw_node_with_ancestors created';
GO

PRINT '[21-xbs-views] DONE';
GO
