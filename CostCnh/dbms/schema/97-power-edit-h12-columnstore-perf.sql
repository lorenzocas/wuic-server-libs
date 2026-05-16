-- =============================================================================
-- Phase H.12 — Perf indexes su cp.facts_pivot + perf seed
-- =============================================================================
-- NOTE Express edition: NCCI su tabelle con HIERARCHYID non supportato.
-- Fallback: B-tree thin covering NC index sulle value columns ad alta selettivita'.
-- L'ottimizzazione columnstore vera arriva in produzione Azure SQL/Standard Edition.
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

-- ─── 1. Thin covering NC index per analytics load ────────────────────────────
-- Pattern access: WHERE program_id = X AND year_num = Y ORDER BY xbs_path
-- → PK CLUSTERED (program_id, year_num, tree_kind_id, xbs_path) gia' coverage
-- → covering NC su (program_id, year_num) INCLUDE value cols accelera load se
--   il client filtra anche per tree_kind o is_leaf
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
     WHERE name = 'ix_facts_pivot_load_cover'
       AND object_id = OBJECT_ID(N'[cp].[facts_pivot]')
)
BEGIN
    CREATE INDEX ix_facts_pivot_load_cover
        ON [cp].[facts_pivot] (program_id, year_num, is_leaf)
        INCLUDE (
            xbs_node_id, xbs_depth, parent_node_id,
            pl_m1, pl_m2, pl_m3, pl_m4, pl_m5, pl_m6, pl_m7, pl_m8, pl_m9, pl_m10, pl_m11, pl_m12,
            ac_m1, ac_m2, ac_m3, ac_m4, ac_m5, ac_m6, ac_m7, ac_m8, ac_m9, ac_m10, ac_m11, ac_m12
        )
        WITH (DATA_COMPRESSION = PAGE);
    PRINT '[97-H.12] ix_facts_pivot_load_cover created (program+year+is_leaf with 24 INCLUDE)';
END
GO

-- ─── 2. Perf seed: 50 L2 + 1000 L3 + 12000 facts ──────────────────────────────
IF NOT EXISTS (SELECT 1 FROM [xbs].[node] WHERE code = 'PERF_L2_1' AND tree_kind_id = 1)
BEGIN
    PRINT '[97-H.12] Generating perf seed (1k XBS + 12k facts)...';

    DECLARE @parent_id BIGINT;
    SELECT TOP 1 @parent_id = id FROM [xbs].[node] WHERE code = 'MATERIAL' AND tree_kind_id = 1;
    IF @parent_id IS NULL
    BEGIN
        PRINT '[97-H.12] WARN: MATERIAL parent not found, skip seed';
    END
    ELSE
    BEGIN
        DECLARE @parent_path_str NVARCHAR(100);
        SELECT @parent_path_str = node_path.ToString() FROM [xbs].[node] WHERE id = @parent_id;
        PRINT '  parent path: ' + @parent_path_str;

        -- L2: 50 nuovi nodi
        ;WITH l2_seq AS (
            SELECT TOP 50 ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS rn
            FROM sys.all_objects a CROSS JOIN sys.all_objects b
        )
        INSERT INTO [xbs].[node](tree_kind_id, node_path, code, name, program_id, site_id)
        SELECT 1,
               HIERARCHYID::Parse(@parent_path_str + CAST(50000 + rn AS NVARCHAR(10)) + '/'),
               'PERF_L2_' + CAST(rn AS NVARCHAR(10)),
               'Perf seed L2 #' + CAST(rn AS NVARCHAR(10)),
               1, NULL
        FROM l2_seq;
        PRINT '  [seed] 50 L2 inserted';

        -- L3: 20 figli per ogni L2 = 1000 leaf
        ;WITH l2_nodes AS (
            SELECT id, node_path, ROW_NUMBER() OVER(ORDER BY id) AS l2_rn
            FROM [xbs].[node] WHERE code LIKE 'PERF_L2_%' AND tree_kind_id = 1
        ),
        l3_seq AS (
            SELECT TOP 20 ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS l3_rn
            FROM sys.all_objects
        )
        INSERT INTO [xbs].[node](tree_kind_id, node_path, code, name, program_id, site_id)
        SELECT 1,
               HIERARCHYID::Parse(l2.node_path.ToString() + CAST(60000 + l3_seq.l3_rn AS NVARCHAR(10)) + '/'),
               'PERF_L3_' + CAST(l2.l2_rn AS NVARCHAR(10)) + '_' + CAST(l3_seq.l3_rn AS NVARCHAR(10)),
               'Perf seed L3 #' + CAST(l2.l2_rn AS NVARCHAR(10)) + '.' + CAST(l3_seq.l3_rn AS NVARCHAR(10)),
               1, NULL
        FROM l2_nodes l2 CROSS JOIN l3_seq;
        PRINT '  [seed] 1000 L3 inserted';

        -- Facts: 12 mesi × 1000 L3 leaf = 12000 facts rows
        DECLARE @unit_id INT = (SELECT TOP 1 id FROM [cp].[unit_measure]);
        ;WITH months AS (
            SELECT TOP 12 ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) AS m
            FROM sys.all_objects
        ),
        leaves AS (
            SELECT id, ROW_NUMBER() OVER(ORDER BY id) AS rn
            FROM [xbs].[node] WHERE code LIKE 'PERF_L3_%' AND tree_kind_id = 1
        )
        INSERT INTO [cp].[facts] (
            time_month_id, program_id, xbs_node_id, unit_measure_id,
            planned, actual,
            data_creazione, utente_creazione
        )
        SELECT 2026 * 100 + m.m, 1, l.id, @unit_id,
               100 + (l.rn % 50) * 10 + m.m * 5,
               80  + (l.rn % 40) * 8  + m.m * 4,
               SYSUTCDATETIME(), 1
        FROM months m CROSS JOIN leaves l;
        PRINT '  [seed] 12000 cp.facts inserted';
    END
END
ELSE
BEGIN
    PRINT '[97-H.12] Perf seed already present, skip';
END
GO

-- ─── 3. Rebuild pivot + benchmark ─────────────────────────────────────────────
PRINT '[97-H.12] Rebuilding cp.facts_pivot for (program=1, year=2026)...';
DECLARE @t0 DATETIME2 = SYSUTCDATETIME();
EXEC [cp].[sp_rebuild_power_edit_pivot] @program_id=1, @year_num=2026, @verbose=0;
DECLARE @t1 DATETIME2 = SYSUTCDATETIME();
PRINT '  [perf] rebuild took ' + CAST(DATEDIFF(MILLISECOND, @t0, @t1) AS VARCHAR(10)) + ' ms';

SELECT
    'cp.facts_pivot (1, 2026)' AS scope,
    COUNT(*) AS total_rows,
    SUM(CASE WHEN is_leaf=1 THEN 1 ELSE 0 END) AS leaf_rows,
    SUM(CASE WHEN is_leaf=0 THEN 1 ELSE 0 END) AS rollup_rows,
    MAX(xbs_depth) AS max_depth
FROM [cp].[facts_pivot] WHERE program_id=1 AND year_num=2026;
GO

-- ─── 4. Benchmark load ────────────────────────────────────────────────────────
PRINT '[97-H.12] Benchmark sp_load_power_edit...';
DECLARE @t2 DATETIME2 = SYSUTCDATETIME();
EXEC [cp].[sp_load_power_edit] @program_id=1, @year_num=2026;
DECLARE @t3 DATETIME2 = SYSUTCDATETIME();
PRINT '  [perf] load took ' + CAST(DATEDIFF(MILLISECOND, @t2, @t3) AS VARCHAR(10)) + ' ms';
GO

PRINT '[97-H.12] === Phase H.12 deployed ===';
PRINT '  - ix_facts_pivot_load_cover (B-tree covering NC, page-compressed)';
PRINT '  - Perf seed: 50 L2 + 1000 L3 + 12000 facts';
PRINT '  - Benchmark eseguito (vedi messaggi sopra)';
GO
