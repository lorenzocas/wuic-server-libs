-- =============================================================================
-- CostCnh_Data — Sprint 2 sample XBS tree seed (Cost Breakdown Structure)
-- =============================================================================
-- Crea un albero XBS realistico per test: Material > Steel > Plates/Bars,
-- Material > Plastic > ABS/PP, Labor > Direct/Indirect, Overhead.
-- Idempotente: skippa se gia' esistono nodi XBS root.
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

-- Skip XBS branch se gia' seedato (idempotente per branch indipendenti)
IF EXISTS (SELECT 1 FROM [xbs].[node] WHERE tree_kind_id = 1 AND depth = 1 AND code = 'MATERIAL' AND ISNULL(cancellato,0)=0)
BEGIN
    PRINT '[seed] xbs.node: XBS sample tree already seeded';
    GOTO WBS_BRANCH;
END

DECLARE @root  HIERARCHYID = HIERARCHYID::GetRoot();   -- '/'

-- Level 1 roots
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, description, is_leaf, sort_order)
VALUES
    (@root.GetDescendant(NULL, NULL),                                    1, 'MATERIAL', N'Material',  N'Materiali e componenti', 0, 10);
DECLARE @p_mat HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='MATERIAL' AND depth=1);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, description, is_leaf, sort_order)
VALUES
    (@root.GetDescendant(@p_mat, NULL),                                  1, 'LABOR',    N'Labor',     N'Manodopera diretta e indiretta', 0, 20);
DECLARE @p_lab HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='LABOR' AND depth=1);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, description, is_leaf, sort_order)
VALUES
    (@root.GetDescendant(@p_lab, NULL),                                  1, 'OVERHEAD', N'Overhead',  N'Costi indiretti / overhead', 1, 30);

-- Level 2 under Material
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_mat.GetDescendant(NULL, NULL), 1, 'STEEL', N'Steel', 0, 10);
DECLARE @p_steel HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='STEEL' AND depth=2);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_mat.GetDescendant(@p_steel, NULL), 1, 'PLASTIC', N'Plastic', 0, 20);
DECLARE @p_plastic HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='PLASTIC' AND depth=2);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_mat.GetDescendant(@p_plastic, NULL), 1, 'ELECTRONICS', N'Electronics', 0, 30);

-- Level 2 under Labor
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_lab.GetDescendant(NULL, NULL), 1, 'LBR_DIRECT', N'Direct Labor', 0, 10);
DECLARE @p_lab_dir HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='LBR_DIRECT' AND depth=2);

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_lab.GetDescendant(@p_lab_dir, NULL), 1, 'LBR_INDIRECT', N'Indirect Labor', 1, 20);

-- Level 3 under Steel
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_steel.GetDescendant(NULL, NULL), 1, 'STEEL_PLATES', N'Steel Plates', 1, 10);
DECLARE @p_st_pl HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='STEEL_PLATES');

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_steel.GetDescendant(@p_st_pl, NULL), 1, 'STEEL_BARS', N'Steel Bars', 1, 20);
DECLARE @p_st_br HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='STEEL_BARS');

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_steel.GetDescendant(@p_st_br, NULL), 1, 'STEEL_TUBES', N'Steel Tubes', 1, 30);

-- Level 3 under Plastic
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_plastic.GetDescendant(NULL, NULL), 1, 'PLAS_ABS', N'ABS', 1, 10);
DECLARE @p_pl_abs HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='PLAS_ABS');

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_plastic.GetDescendant(@p_pl_abs, NULL), 1, 'PLAS_PP', N'Polypropylene', 1, 20);

-- Level 3 under Direct Labor
INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_lab_dir.GetDescendant(NULL, NULL), 1, 'WELDER', N'Welder', 1, 10);
DECLARE @p_weld HIERARCHYID = (SELECT node_path FROM [xbs].[node] WHERE tree_kind_id=1 AND code='WELDER');

INSERT INTO [xbs].[node] (node_path, tree_kind_id, code, name, is_leaf, sort_order)
VALUES (@p_lab_dir.GetDescendant(@p_weld, NULL), 1, 'ASSEMBLER', N'Assembler', 1, 20);

PRINT '[seed] xbs.node: sample XBS tree created (3 levels, 14 nodes)';

WBS_BRANCH:
IF EXISTS (SELECT 1 FROM [xbs].[node] WHERE tree_kind_id = 2 AND code = 'PROG_MGMT')
BEGIN
    PRINT '[seed] xbs.node: WBS already seeded';
    RETURN;
END

-- Build a sample WBS tree (Work Breakdown Structure) — simpler
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

PRINT '[seed] xbs.node: sample WBS tree created (5 nodes)';
PRINT '[seed] xbs DONE';
GO
