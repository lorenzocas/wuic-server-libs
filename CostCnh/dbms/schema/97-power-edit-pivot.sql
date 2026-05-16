-- =============================================================================
-- CostCnh — Phase H.1: PowerEdit hierarchical pivot grid foundation
-- =============================================================================
-- Implementa la "materialized pivot table" cp.facts_pivot che alimenta il
-- componente custom <costcnh-power-edit> (Angular + PrimeNG p-treeTable).
--
-- DESIGN DECISIONS (utente, 2026-05-16):
--   (1b) Tabella materializzata, rebuild nightly via scheduler.
--   (2a + ricalcolo server-side) Roll-up calcolato server-side, save-cells
--        ritorna ancestor rows aggiornate.
--   (3c) Colonne raggruppate: 12 mesi x 4 facet = 48 value cols per row.
--
-- 4 FACET COVERED:
--   planned   (pl_*)  <- cp.facts.planned (hot column)
--   actual    (ac_*)  <- cp.facts.actual  (hot column)
--   forecast  (fc_*)  <- cp.facts_measure WHERE measure_code='F2' (likely scenario)
--   baseline  (bl_*)  <- fc.facts WHERE forecast_code='BL'
--
-- TIME GRAIN: anno solare (12 mesi). Per range multi-anno il client effettua
--   N chiamate (una per anno) e mergea — tradeoff per evitare 48*N colonne.
--
-- ROLLUP STRATEGY:
--   Aggregazione descendant -> ancestor via hierarchyid IsDescendantOf su tutti
--   i livelli di xbs.node. Una sola passata di INSERT con UNION dei livelli.
--   Idempotente per (program_id, year_num) — DELETE + INSERT.
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

-- ── 1. Materialized pivot table ──────────────────────────────────────────────
--
-- IMPORTANTE: xbs.node ha 4 tree_kind (CBS/WBS/OBS/...). Ogni tree kind ha la
-- propria root `/`, quindi xbs_path da solo NON e' unique. Includiamo tree_kind_id
-- nella PK e in tutti i JOIN IsDescendantOf per evitare collisioni cross-tree.
IF OBJECT_ID(N'[cp].[facts_pivot]', N'U') IS NOT NULL
    DROP TABLE [cp].[facts_pivot];

IF OBJECT_ID(N'[cp].[facts_pivot]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[facts_pivot] (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        program_id              INT NOT NULL,
        year_num                INT NOT NULL,
        tree_kind_id            TINYINT NOT NULL,
        xbs_node_id             BIGINT NOT NULL,
        xbs_path                HIERARCHYID NOT NULL,
        xbs_depth               SMALLINT NOT NULL,
        xbs_code                NVARCHAR(80) NULL,
        xbs_name                NVARCHAR(255) NULL,
        parent_node_id          BIGINT NULL,            -- self-FK per client tree build
        is_leaf                 BIT NOT NULL,            -- 1 = direct edit, 0 = rollup-only

        -- Planned (cp.facts.planned)
        pl_m1  DECIMAL(19,4) NULL, pl_m2  DECIMAL(19,4) NULL, pl_m3  DECIMAL(19,4) NULL,
        pl_m4  DECIMAL(19,4) NULL, pl_m5  DECIMAL(19,4) NULL, pl_m6  DECIMAL(19,4) NULL,
        pl_m7  DECIMAL(19,4) NULL, pl_m8  DECIMAL(19,4) NULL, pl_m9  DECIMAL(19,4) NULL,
        pl_m10 DECIMAL(19,4) NULL, pl_m11 DECIMAL(19,4) NULL, pl_m12 DECIMAL(19,4) NULL,

        -- Actual (cp.facts.actual)
        ac_m1  DECIMAL(19,4) NULL, ac_m2  DECIMAL(19,4) NULL, ac_m3  DECIMAL(19,4) NULL,
        ac_m4  DECIMAL(19,4) NULL, ac_m5  DECIMAL(19,4) NULL, ac_m6  DECIMAL(19,4) NULL,
        ac_m7  DECIMAL(19,4) NULL, ac_m8  DECIMAL(19,4) NULL, ac_m9  DECIMAL(19,4) NULL,
        ac_m10 DECIMAL(19,4) NULL, ac_m11 DECIMAL(19,4) NULL, ac_m12 DECIMAL(19,4) NULL,

        -- Forecast (cp.facts_measure WHERE measure_code='F2')
        fc_m1  DECIMAL(19,4) NULL, fc_m2  DECIMAL(19,4) NULL, fc_m3  DECIMAL(19,4) NULL,
        fc_m4  DECIMAL(19,4) NULL, fc_m5  DECIMAL(19,4) NULL, fc_m6  DECIMAL(19,4) NULL,
        fc_m7  DECIMAL(19,4) NULL, fc_m8  DECIMAL(19,4) NULL, fc_m9  DECIMAL(19,4) NULL,
        fc_m10 DECIMAL(19,4) NULL, fc_m11 DECIMAL(19,4) NULL, fc_m12 DECIMAL(19,4) NULL,

        -- Baseline (fc.facts WHERE forecast_code='BL')
        bl_m1  DECIMAL(19,4) NULL, bl_m2  DECIMAL(19,4) NULL, bl_m3  DECIMAL(19,4) NULL,
        bl_m4  DECIMAL(19,4) NULL, bl_m5  DECIMAL(19,4) NULL, bl_m6  DECIMAL(19,4) NULL,
        bl_m7  DECIMAL(19,4) NULL, bl_m8  DECIMAL(19,4) NULL, bl_m9  DECIMAL(19,4) NULL,
        bl_m10 DECIMAL(19,4) NULL, bl_m11 DECIMAL(19,4) NULL, bl_m12 DECIMAL(19,4) NULL,

        last_rebuild_utc        DATETIME2(3) NOT NULL CONSTRAINT DF_facts_pivot_last_rebuild DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_facts_pivot PRIMARY KEY CLUSTERED (program_id, year_num, tree_kind_id, xbs_path)
            WITH (DATA_COMPRESSION = PAGE),
        CONSTRAINT UQ_facts_pivot_node UNIQUE (program_id, year_num, xbs_node_id),
        CONSTRAINT FK_facts_pivot_program FOREIGN KEY (program_id) REFERENCES [core].[program](id),
        CONSTRAINT FK_facts_pivot_xbs_node FOREIGN KEY (xbs_node_id) REFERENCES [xbs].[node](id),
        CONSTRAINT FK_facts_pivot_tree_kind FOREIGN KEY (tree_kind_id) REFERENCES [xbs].[tree_kind](id)
    );

    -- NC indexes per access pattern
    CREATE INDEX ix_facts_pivot_program_year
        ON [cp].[facts_pivot](program_id, year_num)
        INCLUDE (xbs_node_id, tree_kind_id, xbs_depth, parent_node_id, is_leaf)
        WITH (DATA_COMPRESSION = PAGE);

    CREATE INDEX ix_facts_pivot_parent
        ON [cp].[facts_pivot](parent_node_id)
        WHERE parent_node_id IS NOT NULL
        WITH (DATA_COMPRESSION = PAGE);

    PRINT '[97-power-edit] cp.facts_pivot created (4 facet x 12 months = 48 value cols, PAGE compression, 2 NC indexes)';
END
GO

-- ── 2. Rebuild SP: cp.sp_rebuild_power_edit_pivot ─────────────────────────────
IF OBJECT_ID(N'[cp].[sp_rebuild_power_edit_pivot]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_rebuild_power_edit_pivot];
GO

CREATE PROCEDURE [cp].[sp_rebuild_power_edit_pivot]
    @program_id INT  = NULL,   -- NULL = tutti i programs
    @year_num   INT  = NULL,   -- NULL = tutti gli anni con dati
    @verbose    BIT  = 0
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Materializza lo scope (program, year) candidati al rebuild
    DECLARE @scope TABLE (program_id INT NOT NULL, year_num INT NOT NULL, PRIMARY KEY (program_id, year_num));

    INSERT INTO @scope (program_id, year_num)
    SELECT DISTINCT program_id, year_num
      FROM (
          SELECT f.program_id, f.time_month_id / 100 AS year_num
            FROM [cp].[facts] f
           WHERE ISNULL(f.cancellato, 0) = 0
             AND (@program_id IS NULL OR f.program_id = @program_id)
             AND (@year_num   IS NULL OR f.time_month_id / 100 = @year_num)
          UNION
          SELECT f.program_id, f.time_month_id / 100
            FROM [fc].[facts] f
           WHERE ISNULL(f.cancellato, 0) = 0
             AND f.forecast_code = 'BL'
             AND (@program_id IS NULL OR f.program_id = @program_id)
             AND (@year_num   IS NULL OR f.time_month_id / 100 = @year_num)
      ) u;

    IF @verbose = 1
        SELECT '[rebuild] scope rows' AS step, COUNT(*) AS scope_count FROM @scope;

    -- 2. Delete delle righe pivot in scope (clean slate per quel (program, year))
    DELETE p FROM [cp].[facts_pivot] p
     INNER JOIN @scope s ON s.program_id = p.program_id AND s.year_num = p.year_num;

    -- 3. CTE: valori leaf (xbs_node_id originale dei facts) pivotati a 12 mesi
    --    Una row per (program, year, xbs_node_id, facet) -> 12 colonne mese.
    --    Poi roll-up: per ogni node n, somma su tutti i descendant nodes (incluso se stesso)
    --    via hierarchyid IsDescendantOf.
    --
    --    NB: il roll-up viene calcolato AGGREGANDO i leaf su TUTTI i path ancestor
    --    in una singola operazione, grazie a GetAncestor(d) per d=0..depth.
    --    Questo evita N query separate per ogni nodo ancestor.

    ;WITH leaf_facts AS (
        -- Planned + Actual da cp.facts
        SELECT
            f.program_id,
            f.time_month_id / 100 AS year_num,
            f.time_month_id % 100 AS month_num,
            f.xbs_node_id,
            SUM(f.planned)   AS planned,
            SUM(f.actual)    AS actual,
            CAST(NULL AS DECIMAL(19,4)) AS forecast,
            CAST(NULL AS DECIMAL(19,4)) AS baseline
        FROM [cp].[facts] f
        INNER JOIN @scope s ON s.program_id = f.program_id AND s.year_num = f.time_month_id / 100
        WHERE ISNULL(f.cancellato, 0) = 0
          AND f.xbs_node_id IS NOT NULL
        GROUP BY f.program_id, f.time_month_id, f.xbs_node_id

        UNION ALL

        -- Forecast da cp.facts_measure WHERE measure_code='F2'
        SELECT
            f.program_id,
            f.time_month_id / 100,
            f.time_month_id % 100,
            f.xbs_node_id,
            NULL, NULL,
            SUM(fm.value),
            NULL
        FROM [cp].[facts] f
        INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
        INNER JOIN @scope s ON s.program_id = f.program_id AND s.year_num = f.time_month_id / 100
        WHERE ISNULL(f.cancellato, 0) = 0
          AND f.xbs_node_id IS NOT NULL
          AND fm.measure_code = 'F2'
        GROUP BY f.program_id, f.time_month_id, f.xbs_node_id

        UNION ALL

        -- Baseline da fc.facts WHERE forecast_code='BL'
        SELECT
            f.program_id,
            f.time_month_id / 100,
            f.time_month_id % 100,
            f.xbs_node_id,
            NULL, NULL, NULL,
            SUM(f.value)
        FROM [fc].[facts] f
        INNER JOIN @scope s ON s.program_id = f.program_id AND s.year_num = f.time_month_id / 100
        WHERE ISNULL(f.cancellato, 0) = 0
          AND f.forecast_code = 'BL'
          AND f.xbs_node_id IS NOT NULL
        GROUP BY f.program_id, f.time_month_id, f.xbs_node_id
    ),
    leaf_pivoted AS (
        -- Pivot mese -> 12 colonne x 4 facet, raggruppato per (program, year, node)
        SELECT
            program_id, year_num, xbs_node_id,
            SUM(CASE WHEN month_num = 1  THEN planned  END) AS pl_m1,
            SUM(CASE WHEN month_num = 2  THEN planned  END) AS pl_m2,
            SUM(CASE WHEN month_num = 3  THEN planned  END) AS pl_m3,
            SUM(CASE WHEN month_num = 4  THEN planned  END) AS pl_m4,
            SUM(CASE WHEN month_num = 5  THEN planned  END) AS pl_m5,
            SUM(CASE WHEN month_num = 6  THEN planned  END) AS pl_m6,
            SUM(CASE WHEN month_num = 7  THEN planned  END) AS pl_m7,
            SUM(CASE WHEN month_num = 8  THEN planned  END) AS pl_m8,
            SUM(CASE WHEN month_num = 9  THEN planned  END) AS pl_m9,
            SUM(CASE WHEN month_num = 10 THEN planned  END) AS pl_m10,
            SUM(CASE WHEN month_num = 11 THEN planned  END) AS pl_m11,
            SUM(CASE WHEN month_num = 12 THEN planned  END) AS pl_m12,

            SUM(CASE WHEN month_num = 1  THEN actual   END) AS ac_m1,
            SUM(CASE WHEN month_num = 2  THEN actual   END) AS ac_m2,
            SUM(CASE WHEN month_num = 3  THEN actual   END) AS ac_m3,
            SUM(CASE WHEN month_num = 4  THEN actual   END) AS ac_m4,
            SUM(CASE WHEN month_num = 5  THEN actual   END) AS ac_m5,
            SUM(CASE WHEN month_num = 6  THEN actual   END) AS ac_m6,
            SUM(CASE WHEN month_num = 7  THEN actual   END) AS ac_m7,
            SUM(CASE WHEN month_num = 8  THEN actual   END) AS ac_m8,
            SUM(CASE WHEN month_num = 9  THEN actual   END) AS ac_m9,
            SUM(CASE WHEN month_num = 10 THEN actual   END) AS ac_m10,
            SUM(CASE WHEN month_num = 11 THEN actual   END) AS ac_m11,
            SUM(CASE WHEN month_num = 12 THEN actual   END) AS ac_m12,

            SUM(CASE WHEN month_num = 1  THEN forecast END) AS fc_m1,
            SUM(CASE WHEN month_num = 2  THEN forecast END) AS fc_m2,
            SUM(CASE WHEN month_num = 3  THEN forecast END) AS fc_m3,
            SUM(CASE WHEN month_num = 4  THEN forecast END) AS fc_m4,
            SUM(CASE WHEN month_num = 5  THEN forecast END) AS fc_m5,
            SUM(CASE WHEN month_num = 6  THEN forecast END) AS fc_m6,
            SUM(CASE WHEN month_num = 7  THEN forecast END) AS fc_m7,
            SUM(CASE WHEN month_num = 8  THEN forecast END) AS fc_m8,
            SUM(CASE WHEN month_num = 9  THEN forecast END) AS fc_m9,
            SUM(CASE WHEN month_num = 10 THEN forecast END) AS fc_m10,
            SUM(CASE WHEN month_num = 11 THEN forecast END) AS fc_m11,
            SUM(CASE WHEN month_num = 12 THEN forecast END) AS fc_m12,

            SUM(CASE WHEN month_num = 1  THEN baseline END) AS bl_m1,
            SUM(CASE WHEN month_num = 2  THEN baseline END) AS bl_m2,
            SUM(CASE WHEN month_num = 3  THEN baseline END) AS bl_m3,
            SUM(CASE WHEN month_num = 4  THEN baseline END) AS bl_m4,
            SUM(CASE WHEN month_num = 5  THEN baseline END) AS bl_m5,
            SUM(CASE WHEN month_num = 6  THEN baseline END) AS bl_m6,
            SUM(CASE WHEN month_num = 7  THEN baseline END) AS bl_m7,
            SUM(CASE WHEN month_num = 8  THEN baseline END) AS bl_m8,
            SUM(CASE WHEN month_num = 9  THEN baseline END) AS bl_m9,
            SUM(CASE WHEN month_num = 10 THEN baseline END) AS bl_m10,
            SUM(CASE WHEN month_num = 11 THEN baseline END) AS bl_m11,
            SUM(CASE WHEN month_num = 12 THEN baseline END) AS bl_m12
        FROM leaf_facts
        GROUP BY program_id, year_num, xbs_node_id
    ),
    -- Per ogni nodo ancestor: SUM su tutti i discendenti (incluso se stesso)
    -- via JOIN hierarchyid IsDescendantOf.
    --
    -- ALGORITMO: per ogni (program, year), per ogni xbs.node n,
    -- raccogli i leaf_pivoted dove leaf_node.node_path.IsDescendantOf(n.node_path) = 1.
    -- Implementato come JOIN xbs.node leaf ON leaf.id = lp.xbs_node_id
    --                  + JOIN xbs.node n   ON leaf.node_path.IsDescendantOf(n.node_path)=1
    rolled_up AS (
        SELECT
            lp.program_id, lp.year_num,
            n.id   AS xbs_node_id,
            n.tree_kind_id,
            n.node_path AS xbs_path,
            n.depth AS xbs_depth,
            n.code  AS xbs_code,
            n.name  AS xbs_name,
            SUM(lp.pl_m1)  AS pl_m1,  SUM(lp.pl_m2)  AS pl_m2,  SUM(lp.pl_m3)  AS pl_m3,
            SUM(lp.pl_m4)  AS pl_m4,  SUM(lp.pl_m5)  AS pl_m5,  SUM(lp.pl_m6)  AS pl_m6,
            SUM(lp.pl_m7)  AS pl_m7,  SUM(lp.pl_m8)  AS pl_m8,  SUM(lp.pl_m9)  AS pl_m9,
            SUM(lp.pl_m10) AS pl_m10, SUM(lp.pl_m11) AS pl_m11, SUM(lp.pl_m12) AS pl_m12,
            SUM(lp.ac_m1)  AS ac_m1,  SUM(lp.ac_m2)  AS ac_m2,  SUM(lp.ac_m3)  AS ac_m3,
            SUM(lp.ac_m4)  AS ac_m4,  SUM(lp.ac_m5)  AS ac_m5,  SUM(lp.ac_m6)  AS ac_m6,
            SUM(lp.ac_m7)  AS ac_m7,  SUM(lp.ac_m8)  AS ac_m8,  SUM(lp.ac_m9)  AS ac_m9,
            SUM(lp.ac_m10) AS ac_m10, SUM(lp.ac_m11) AS ac_m11, SUM(lp.ac_m12) AS ac_m12,
            SUM(lp.fc_m1)  AS fc_m1,  SUM(lp.fc_m2)  AS fc_m2,  SUM(lp.fc_m3)  AS fc_m3,
            SUM(lp.fc_m4)  AS fc_m4,  SUM(lp.fc_m5)  AS fc_m5,  SUM(lp.fc_m6)  AS fc_m6,
            SUM(lp.fc_m7)  AS fc_m7,  SUM(lp.fc_m8)  AS fc_m8,  SUM(lp.fc_m9)  AS fc_m9,
            SUM(lp.fc_m10) AS fc_m10, SUM(lp.fc_m11) AS fc_m11, SUM(lp.fc_m12) AS fc_m12,
            SUM(lp.bl_m1)  AS bl_m1,  SUM(lp.bl_m2)  AS bl_m2,  SUM(lp.bl_m3)  AS bl_m3,
            SUM(lp.bl_m4)  AS bl_m4,  SUM(lp.bl_m5)  AS bl_m5,  SUM(lp.bl_m6)  AS bl_m6,
            SUM(lp.bl_m7)  AS bl_m7,  SUM(lp.bl_m8)  AS bl_m8,  SUM(lp.bl_m9)  AS bl_m9,
            SUM(lp.bl_m10) AS bl_m10, SUM(lp.bl_m11) AS bl_m11, SUM(lp.bl_m12) AS bl_m12
        FROM leaf_pivoted lp
        INNER JOIN [xbs].[node] leaf ON leaf.id = lp.xbs_node_id
        INNER JOIN [xbs].[node] n    ON leaf.node_path.IsDescendantOf(n.node_path) = 1
                                    AND n.tree_kind_id = leaf.tree_kind_id    -- scope same tree
                                    AND ISNULL(n.cancellato, 0) = 0
        GROUP BY lp.program_id, lp.year_num, n.id, n.tree_kind_id, n.node_path, n.depth, n.code, n.name
    )
    INSERT INTO [cp].[facts_pivot] (
        program_id, year_num, tree_kind_id, xbs_node_id, xbs_path, xbs_depth, xbs_code, xbs_name,
        parent_node_id, is_leaf,
        pl_m1,pl_m2,pl_m3,pl_m4,pl_m5,pl_m6,pl_m7,pl_m8,pl_m9,pl_m10,pl_m11,pl_m12,
        ac_m1,ac_m2,ac_m3,ac_m4,ac_m5,ac_m6,ac_m7,ac_m8,ac_m9,ac_m10,ac_m11,ac_m12,
        fc_m1,fc_m2,fc_m3,fc_m4,fc_m5,fc_m6,fc_m7,fc_m8,fc_m9,fc_m10,fc_m11,fc_m12,
        bl_m1,bl_m2,bl_m3,bl_m4,bl_m5,bl_m6,bl_m7,bl_m8,bl_m9,bl_m10,bl_m11,bl_m12,
        last_rebuild_utc
    )
    SELECT
        ru.program_id, ru.year_num, ru.tree_kind_id, ru.xbs_node_id, ru.xbs_path, ru.xbs_depth, ru.xbs_code, ru.xbs_name,
        -- parent_node_id: nodo padre del path nello stesso tree_kind, NULL su root
        (SELECT TOP 1 p.id FROM [xbs].[node] p
          WHERE p.node_path = ru.xbs_path.GetAncestor(1)
            AND p.tree_kind_id = ru.tree_kind_id
            AND ISNULL(p.cancellato, 0) = 0) AS parent_node_id,
        -- is_leaf: nessun figlio diretto nello stesso tree
        CASE WHEN EXISTS (
            SELECT 1 FROM [xbs].[node] c
             WHERE c.node_path.GetAncestor(1) = ru.xbs_path
               AND c.tree_kind_id = ru.tree_kind_id
               AND ISNULL(c.cancellato, 0) = 0
        ) THEN 0 ELSE 1 END AS is_leaf,
        ru.pl_m1,ru.pl_m2,ru.pl_m3,ru.pl_m4,ru.pl_m5,ru.pl_m6,ru.pl_m7,ru.pl_m8,ru.pl_m9,ru.pl_m10,ru.pl_m11,ru.pl_m12,
        ru.ac_m1,ru.ac_m2,ru.ac_m3,ru.ac_m4,ru.ac_m5,ru.ac_m6,ru.ac_m7,ru.ac_m8,ru.ac_m9,ru.ac_m10,ru.ac_m11,ru.ac_m12,
        ru.fc_m1,ru.fc_m2,ru.fc_m3,ru.fc_m4,ru.fc_m5,ru.fc_m6,ru.fc_m7,ru.fc_m8,ru.fc_m9,ru.fc_m10,ru.fc_m11,ru.fc_m12,
        ru.bl_m1,ru.bl_m2,ru.bl_m3,ru.bl_m4,ru.bl_m5,ru.bl_m6,ru.bl_m7,ru.bl_m8,ru.bl_m9,ru.bl_m10,ru.bl_m11,ru.bl_m12,
        SYSUTCDATETIME()
    FROM rolled_up ru;

    DECLARE @inserted INT = @@ROWCOUNT;
    IF @verbose = 1
        PRINT CONCAT('[rebuild] cp.facts_pivot inserted rows: ', @inserted);
END
GO

PRINT '[97-power-edit] cp.sp_rebuild_power_edit_pivot created';
GO

-- ── 3. Load SP: cp.sp_load_power_edit (read-only snapshot per program×year) ───
IF OBJECT_ID(N'[cp].[sp_load_power_edit]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_load_power_edit];
GO

CREATE PROCEDURE [cp].[sp_load_power_edit]
    @program_id INT,
    @year_num   INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Ritorna le righe pivot ordinate depth-first (hierarchyid asc).
    -- Il client costruisce il tree usando parent_node_id come self-FK.
    SELECT
        id, program_id, year_num, tree_kind_id, xbs_node_id,
        CAST(xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
        xbs_depth, xbs_code, xbs_name,
        parent_node_id, is_leaf,
        pl_m1,pl_m2,pl_m3,pl_m4,pl_m5,pl_m6,pl_m7,pl_m8,pl_m9,pl_m10,pl_m11,pl_m12,
        ac_m1,ac_m2,ac_m3,ac_m4,ac_m5,ac_m6,ac_m7,ac_m8,ac_m9,ac_m10,ac_m11,ac_m12,
        fc_m1,fc_m2,fc_m3,fc_m4,fc_m5,fc_m6,fc_m7,fc_m8,fc_m9,fc_m10,fc_m11,fc_m12,
        bl_m1,bl_m2,bl_m3,bl_m4,bl_m5,bl_m6,bl_m7,bl_m8,bl_m9,bl_m10,bl_m11,bl_m12,
        last_rebuild_utc
    FROM [cp].[facts_pivot]
    WHERE program_id = @program_id
      AND year_num   = @year_num
    ORDER BY tree_kind_id, xbs_path;
END
GO

PRINT '[97-power-edit] cp.sp_load_power_edit created';
GO

-- ── 4. Save-cells SP: cp.sp_save_power_edit_cells ─────────────────────────────
-- Applica cambiamenti puntuali su cp.facts (planned/actual) o cp.facts_measure
-- (forecast F2) per le righe leaf. Baseline è read-only (gestito tramite fc.facts).
--
-- Input: TVP cp.tvp_power_edit_cell_changes con 1 row per cella editata.
-- Output: result set con le righe ancestor aggiornate (delta-update).
--
-- DELTA UPDATE STRATEGY:
--   1. Per ogni change, UPDATE/INSERT su cp.facts o cp.facts_measure.
--   2. Identifica i nodi ancestor toccati (path = leaf.node_path + tutti GetAncestor(d)).
--   3. Re-calcola pivot solo per quei nodi ancestor (subset di sp_rebuild).
--   4. UPDATE cp.facts_pivot con i nuovi valori.
--   5. SELECT ancestor rows aggiornate -> client riapplica.
-- =============================================================================

-- TVP type per i changes
IF TYPE_ID(N'[cp].[tvp_power_edit_cell_changes]') IS NULL
BEGIN
    CREATE TYPE [cp].[tvp_power_edit_cell_changes] AS TABLE (
        xbs_node_id BIGINT       NOT NULL,
        month_num   TINYINT      NOT NULL,    -- 1..12
        facet_code  VARCHAR(8)   NOT NULL,    -- 'planned' | 'actual' | 'forecast'  (baseline RO)
        new_value   DECIMAL(19,4) NULL,
        PRIMARY KEY (xbs_node_id, month_num, facet_code)
    );
    PRINT '[97-power-edit] cp.tvp_power_edit_cell_changes type created';
END
GO

IF OBJECT_ID(N'[cp].[sp_save_power_edit_cells]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_save_power_edit_cells];
GO

CREATE PROCEDURE [cp].[sp_save_power_edit_cells]
    @program_id INT,
    @year_num   INT,
    @user_id    INT,
    @changes    [cp].[tvp_power_edit_cell_changes] READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @applied INT = 0;
    DECLARE @failed  INT = 0;

    -- Validazione: solo nodi LEAF possono essere editati (no edit su rollup)
    IF EXISTS (
        SELECT 1 FROM @changes c
        INNER JOIN [cp].[facts_pivot] fp
                ON fp.program_id = @program_id
               AND fp.year_num   = @year_num
               AND fp.xbs_node_id = c.xbs_node_id
        WHERE fp.is_leaf = 0
    )
    BEGIN
        RAISERROR('Edit non consentito su nodi non-leaf (rollup-only).', 16, 1);
        RETURN;
    END

    -- Baseline è RO: rifiuta
    IF EXISTS (SELECT 1 FROM @changes WHERE facet_code = 'baseline')
    BEGIN
        RAISERROR('Baseline è read-only — modificare via fc.facts WHERE forecast_code=BL.', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;

    -- 1. Apply changes su cp.facts (planned/actual) e cp.facts_measure (forecast=F2)
    DECLARE @changes_with_time TABLE (
        xbs_node_id   BIGINT,
        time_month_id INT,
        facet_code    VARCHAR(8),
        new_value     DECIMAL(19,4) NULL
    );

    INSERT INTO @changes_with_time
    SELECT c.xbs_node_id, @year_num * 100 + c.month_num, c.facet_code, c.new_value
    FROM @changes c;

    -- Planned: UPSERT su cp.facts
    --   - Se row esiste (program, time, node): UPDATE planned = new_value
    --   - Else: INSERT placeholder (con planned, actual NULL, unit_measure default)
    ;WITH plan_targets AS (
        SELECT cw.xbs_node_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw
        WHERE cw.facet_code = 'planned'
    )
    MERGE [cp].[facts] AS tgt
    USING plan_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.xbs_node_id = src.xbs_node_id
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET planned = src.new_value,
                   data_modifica = @now,
                   utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, xbs_node_id, unit_measure_id, planned,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
                src.new_value, @now, @user_id);

    SET @applied = @applied + @@ROWCOUNT;

    -- Actual: stesso pattern
    ;WITH act_targets AS (
        SELECT cw.xbs_node_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw
        WHERE cw.facet_code = 'actual'
    )
    MERGE [cp].[facts] AS tgt
    USING act_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.xbs_node_id = src.xbs_node_id
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET actual = src.new_value,
                   data_modifica = @now,
                   utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, xbs_node_id, unit_measure_id, actual,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
                src.new_value, @now, @user_id);

    SET @applied = @applied + @@ROWCOUNT;

    -- Forecast: UPSERT su cp.facts_measure (richiede facts_id)
    DECLARE @fc_targets TABLE (facts_id BIGINT, time_month_id INT, new_value DECIMAL(19,4));
    INSERT INTO @fc_targets
    SELECT f.id, cw.time_month_id, cw.new_value
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'forecast';

    -- Se non esiste facts row, prima la creiamo per forecast
    INSERT INTO [cp].[facts] (time_month_id, program_id, xbs_node_id, unit_measure_id,
                              data_creazione, utente_creazione)
    SELECT cw.time_month_id, @program_id, cw.xbs_node_id,
           (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
           @now, @user_id
      FROM @changes_with_time cw
     WHERE cw.facet_code = 'forecast'
       AND NOT EXISTS (
           SELECT 1 FROM [cp].[facts] f
           WHERE f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
       );

    -- Rebuild @fc_targets dopo eventuali INSERT
    DELETE FROM @fc_targets;
    INSERT INTO @fc_targets
    SELECT f.id, cw.time_month_id, cw.new_value
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'forecast';

    MERGE [cp].[facts_measure] AS tgt
    USING @fc_targets AS src
       ON tgt.facts_id = src.facts_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.measure_code = 'F2'
    WHEN MATCHED THEN
        UPDATE SET value = ISNULL(src.new_value, 0)
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (facts_id, time_month_id, measure_code, value)
        VALUES (src.facts_id, src.time_month_id, 'F2', ISNULL(src.new_value, 0));

    SET @applied = @applied + @@ROWCOUNT;

    -- 2. Identifica gli ancestor da ri-pivotare (scoped per tree_kind)
    DECLARE @affected_paths TABLE (
        tree_kind_id TINYINT NOT NULL,
        xbs_path HIERARCHYID NOT NULL,
        PRIMARY KEY (tree_kind_id, xbs_path)
    );

    -- Tutti gli ancestor (incluso il leaf stesso) dei nodi toccati, scoped per tree_kind
    INSERT INTO @affected_paths (tree_kind_id, xbs_path)
    SELECT DISTINCT leaf.tree_kind_id, leaf.node_path.GetAncestor(d.val) AS xbs_path
      FROM @changes c
      INNER JOIN [xbs].[node] leaf ON leaf.id = c.xbs_node_id
      CROSS APPLY (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS d(val)
     WHERE d.val <= leaf.depth;

    -- 3. Recompute pivot row per gli ancestor toccati e UPDATE in place
    --    Riutilizza la stessa logica di sp_rebuild ma scoped al subset.
    ;WITH affected_nodes AS (
        SELECT n.id, n.tree_kind_id, n.node_path, n.depth, n.code, n.name
          FROM [xbs].[node] n
          INNER JOIN @affected_paths ap ON ap.xbs_path = n.node_path AND ap.tree_kind_id = n.tree_kind_id
         WHERE ISNULL(n.cancellato, 0) = 0
    ),
    leaf_facts AS (
        SELECT f.time_month_id % 100 AS month_num, f.xbs_node_id,
               SUM(f.planned)   AS planned,
               SUM(f.actual)    AS actual,
               CAST(NULL AS DECIMAL(19,4)) AS forecast,
               CAST(NULL AS DECIMAL(19,4)) AS baseline
        FROM [cp].[facts] f
        WHERE f.program_id = @program_id
          AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
          AND ISNULL(f.cancellato, 0) = 0
          AND f.xbs_node_id IS NOT NULL
        GROUP BY f.time_month_id, f.xbs_node_id

        UNION ALL

        SELECT f.time_month_id % 100, f.xbs_node_id,
               NULL, NULL, SUM(fm.value), NULL
        FROM [cp].[facts] f
        INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
        WHERE f.program_id = @program_id
          AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
          AND ISNULL(f.cancellato, 0) = 0
          AND f.xbs_node_id IS NOT NULL
          AND fm.measure_code = 'F2'
        GROUP BY f.time_month_id, f.xbs_node_id

        UNION ALL

        SELECT f.time_month_id % 100, f.xbs_node_id,
               NULL, NULL, NULL, SUM(f.value)
        FROM [fc].[facts] f
        WHERE f.program_id = @program_id
          AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
          AND ISNULL(f.cancellato, 0) = 0
          AND f.forecast_code = 'BL'
          AND f.xbs_node_id IS NOT NULL
        GROUP BY f.time_month_id, f.xbs_node_id
    ),
    recomputed AS (
        SELECT
            an.id AS xbs_node_id,
            SUM(CASE WHEN lf.month_num=1  THEN lf.planned END) AS pl_m1,
            SUM(CASE WHEN lf.month_num=2  THEN lf.planned END) AS pl_m2,
            SUM(CASE WHEN lf.month_num=3  THEN lf.planned END) AS pl_m3,
            SUM(CASE WHEN lf.month_num=4  THEN lf.planned END) AS pl_m4,
            SUM(CASE WHEN lf.month_num=5  THEN lf.planned END) AS pl_m5,
            SUM(CASE WHEN lf.month_num=6  THEN lf.planned END) AS pl_m6,
            SUM(CASE WHEN lf.month_num=7  THEN lf.planned END) AS pl_m7,
            SUM(CASE WHEN lf.month_num=8  THEN lf.planned END) AS pl_m8,
            SUM(CASE WHEN lf.month_num=9  THEN lf.planned END) AS pl_m9,
            SUM(CASE WHEN lf.month_num=10 THEN lf.planned END) AS pl_m10,
            SUM(CASE WHEN lf.month_num=11 THEN lf.planned END) AS pl_m11,
            SUM(CASE WHEN lf.month_num=12 THEN lf.planned END) AS pl_m12,
            SUM(CASE WHEN lf.month_num=1  THEN lf.actual  END) AS ac_m1,
            SUM(CASE WHEN lf.month_num=2  THEN lf.actual  END) AS ac_m2,
            SUM(CASE WHEN lf.month_num=3  THEN lf.actual  END) AS ac_m3,
            SUM(CASE WHEN lf.month_num=4  THEN lf.actual  END) AS ac_m4,
            SUM(CASE WHEN lf.month_num=5  THEN lf.actual  END) AS ac_m5,
            SUM(CASE WHEN lf.month_num=6  THEN lf.actual  END) AS ac_m6,
            SUM(CASE WHEN lf.month_num=7  THEN lf.actual  END) AS ac_m7,
            SUM(CASE WHEN lf.month_num=8  THEN lf.actual  END) AS ac_m8,
            SUM(CASE WHEN lf.month_num=9  THEN lf.actual  END) AS ac_m9,
            SUM(CASE WHEN lf.month_num=10 THEN lf.actual  END) AS ac_m10,
            SUM(CASE WHEN lf.month_num=11 THEN lf.actual  END) AS ac_m11,
            SUM(CASE WHEN lf.month_num=12 THEN lf.actual  END) AS ac_m12,
            SUM(CASE WHEN lf.month_num=1  THEN lf.forecast END) AS fc_m1,
            SUM(CASE WHEN lf.month_num=2  THEN lf.forecast END) AS fc_m2,
            SUM(CASE WHEN lf.month_num=3  THEN lf.forecast END) AS fc_m3,
            SUM(CASE WHEN lf.month_num=4  THEN lf.forecast END) AS fc_m4,
            SUM(CASE WHEN lf.month_num=5  THEN lf.forecast END) AS fc_m5,
            SUM(CASE WHEN lf.month_num=6  THEN lf.forecast END) AS fc_m6,
            SUM(CASE WHEN lf.month_num=7  THEN lf.forecast END) AS fc_m7,
            SUM(CASE WHEN lf.month_num=8  THEN lf.forecast END) AS fc_m8,
            SUM(CASE WHEN lf.month_num=9  THEN lf.forecast END) AS fc_m9,
            SUM(CASE WHEN lf.month_num=10 THEN lf.forecast END) AS fc_m10,
            SUM(CASE WHEN lf.month_num=11 THEN lf.forecast END) AS fc_m11,
            SUM(CASE WHEN lf.month_num=12 THEN lf.forecast END) AS fc_m12,
            SUM(CASE WHEN lf.month_num=1  THEN lf.baseline END) AS bl_m1,
            SUM(CASE WHEN lf.month_num=2  THEN lf.baseline END) AS bl_m2,
            SUM(CASE WHEN lf.month_num=3  THEN lf.baseline END) AS bl_m3,
            SUM(CASE WHEN lf.month_num=4  THEN lf.baseline END) AS bl_m4,
            SUM(CASE WHEN lf.month_num=5  THEN lf.baseline END) AS bl_m5,
            SUM(CASE WHEN lf.month_num=6  THEN lf.baseline END) AS bl_m6,
            SUM(CASE WHEN lf.month_num=7  THEN lf.baseline END) AS bl_m7,
            SUM(CASE WHEN lf.month_num=8  THEN lf.baseline END) AS bl_m8,
            SUM(CASE WHEN lf.month_num=9  THEN lf.baseline END) AS bl_m9,
            SUM(CASE WHEN lf.month_num=10 THEN lf.baseline END) AS bl_m10,
            SUM(CASE WHEN lf.month_num=11 THEN lf.baseline END) AS bl_m11,
            SUM(CASE WHEN lf.month_num=12 THEN lf.baseline END) AS bl_m12
        FROM affected_nodes an
        LEFT JOIN leaf_facts lf
               ON lf.xbs_node_id IN (
                  SELECT leaf.id FROM [xbs].[node] leaf
                   WHERE leaf.node_path.IsDescendantOf(an.node_path) = 1
                     AND leaf.tree_kind_id = an.tree_kind_id
                     AND ISNULL(leaf.cancellato, 0) = 0
               )
        GROUP BY an.id
    )
    UPDATE p SET
        p.pl_m1 = r.pl_m1, p.pl_m2 = r.pl_m2, p.pl_m3 = r.pl_m3, p.pl_m4 = r.pl_m4,
        p.pl_m5 = r.pl_m5, p.pl_m6 = r.pl_m6, p.pl_m7 = r.pl_m7, p.pl_m8 = r.pl_m8,
        p.pl_m9 = r.pl_m9, p.pl_m10 = r.pl_m10, p.pl_m11 = r.pl_m11, p.pl_m12 = r.pl_m12,
        p.ac_m1 = r.ac_m1, p.ac_m2 = r.ac_m2, p.ac_m3 = r.ac_m3, p.ac_m4 = r.ac_m4,
        p.ac_m5 = r.ac_m5, p.ac_m6 = r.ac_m6, p.ac_m7 = r.ac_m7, p.ac_m8 = r.ac_m8,
        p.ac_m9 = r.ac_m9, p.ac_m10 = r.ac_m10, p.ac_m11 = r.ac_m11, p.ac_m12 = r.ac_m12,
        p.fc_m1 = r.fc_m1, p.fc_m2 = r.fc_m2, p.fc_m3 = r.fc_m3, p.fc_m4 = r.fc_m4,
        p.fc_m5 = r.fc_m5, p.fc_m6 = r.fc_m6, p.fc_m7 = r.fc_m7, p.fc_m8 = r.fc_m8,
        p.fc_m9 = r.fc_m9, p.fc_m10 = r.fc_m10, p.fc_m11 = r.fc_m11, p.fc_m12 = r.fc_m12,
        p.bl_m1 = r.bl_m1, p.bl_m2 = r.bl_m2, p.bl_m3 = r.bl_m3, p.bl_m4 = r.bl_m4,
        p.bl_m5 = r.bl_m5, p.bl_m6 = r.bl_m6, p.bl_m7 = r.bl_m7, p.bl_m8 = r.bl_m8,
        p.bl_m9 = r.bl_m9, p.bl_m10 = r.bl_m10, p.bl_m11 = r.bl_m11, p.bl_m12 = r.bl_m12,
        p.last_rebuild_utc = @now
      FROM [cp].[facts_pivot] p
     INNER JOIN recomputed r ON r.xbs_node_id = p.xbs_node_id
     WHERE p.program_id = @program_id
       AND p.year_num   = @year_num;

    COMMIT TRANSACTION;

    -- 4. Output: ancestor rows aggiornate (client le riapplica al tree-table)
    SELECT
        fp.id, fp.program_id, fp.year_num, fp.tree_kind_id, fp.xbs_node_id,
        CAST(fp.xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
        fp.xbs_depth, fp.xbs_code, fp.xbs_name,
        fp.parent_node_id, fp.is_leaf,
        fp.pl_m1,fp.pl_m2,fp.pl_m3,fp.pl_m4,fp.pl_m5,fp.pl_m6,fp.pl_m7,fp.pl_m8,fp.pl_m9,fp.pl_m10,fp.pl_m11,fp.pl_m12,
        fp.ac_m1,fp.ac_m2,fp.ac_m3,fp.ac_m4,fp.ac_m5,fp.ac_m6,fp.ac_m7,fp.ac_m8,fp.ac_m9,fp.ac_m10,fp.ac_m11,fp.ac_m12,
        fp.fc_m1,fp.fc_m2,fp.fc_m3,fp.fc_m4,fp.fc_m5,fp.fc_m6,fp.fc_m7,fp.fc_m8,fp.fc_m9,fp.fc_m10,fp.fc_m11,fp.fc_m12,
        fp.bl_m1,fp.bl_m2,fp.bl_m3,fp.bl_m4,fp.bl_m5,fp.bl_m6,fp.bl_m7,fp.bl_m8,fp.bl_m9,fp.bl_m10,fp.bl_m11,fp.bl_m12,
        fp.last_rebuild_utc,
        @applied AS applied,
        @failed  AS failed
    FROM [cp].[facts_pivot] fp
    INNER JOIN @affected_paths ap ON ap.xbs_path = fp.xbs_path AND ap.tree_kind_id = fp.tree_kind_id
    WHERE fp.program_id = @program_id
      AND fp.year_num   = @year_num
    ORDER BY fp.tree_kind_id, fp.xbs_path;
END
GO

PRINT '[97-power-edit] cp.sp_save_power_edit_cells created';
GO

PRINT '[97-power-edit] === Phase H.1 SQL foundation deployed ===';
PRINT '  - cp.facts_pivot (materialized table, 48 value cols, 2 NC indexes)';
PRINT '  - cp.sp_rebuild_power_edit_pivot (nightly scheduler target)';
PRINT '  - cp.sp_load_power_edit (snapshot read)';
PRINT '  - cp.sp_save_power_edit_cells (delta-update + ancestor refresh)';
PRINT '  - cp.tvp_power_edit_cell_changes (TVP for batch save)';
GO
