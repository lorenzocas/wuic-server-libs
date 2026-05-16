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

IF NOT EXISTS (SELECT 1 FROM [xbs].[node] WHERE tree_kind_id = 2 AND code = 'PROG_MGMT')
BEGIN
    DECLARE @root HIERARCHYID = HIERARCHYID::GetRoot();

    INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
    VALUES (@root.GetDescendant(NULL, NULL), 2, 'PROG_MGMT', N'Program Management', 0, 10);
    DECLARE @p_pm HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=2 AND code='PROG_MGMT' AND depth=1);

    INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
    VALUES (@root.GetDescendant(@p_pm, NULL), 2, 'ENG_DESIGN', N'Engineering Design', 0, 20);
    DECLARE @p_ed HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=2 AND code='ENG_DESIGN' AND depth=1);

    INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
    VALUES (@root.GetDescendant(@p_ed, NULL), 2, 'PROTOTYPING', N'Prototyping', 1, 30);

    INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
    VALUES (@p_ed.GetDescendant(NULL, NULL), 2, 'CAD', N'CAD Modeling', 1, 10);
    DECLARE @p_cad HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=2 AND code='CAD');

    INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
    VALUES (@p_ed.GetDescendant(@p_cad, NULL), 2, 'FEA', N'Finite Element Analysis', 1, 20);

    PRINT '[seed] WBS sample tree created';
END
ELSE
    PRINT '[seed] WBS already seeded';
GO
