-- =============================================================================
-- Phase H.10 — Custom scenarios support per PowerEdit
-- =============================================================================
-- Aggiunge @project_scenario_id alla load e save SP:
--   - NULL  → comportamento legacy (legge da cp.facts_pivot cached, fast)
--   - INT   → on-the-fly aggregation da cp.facts/fc.facts filtrato per scenario
--             (slower ma flessibile, no esplosione cardinality nel pivot table)
--
-- Il save SP aggiunge @project_scenario_id come scope alle UPSERT su cp.facts.
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

-- ─── 1. Load SP scenario-aware ────────────────────────────────────────────────
IF OBJECT_ID(N'[cp].[sp_load_power_edit]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_load_power_edit];
GO

CREATE PROCEDURE [cp].[sp_load_power_edit]
    @program_id          INT,
    @year_num            INT,
    @project_scenario_id INT = NULL   -- H.10: NULL = cached pivot (fast), INT = on-the-fly
AS
BEGIN
    SET NOCOUNT ON;

    IF @project_scenario_id IS NULL
    BEGIN
        -- FAST PATH: read pre-materialized pivot table
        SELECT
            id, program_id, year_num, tree_kind_id, xbs_node_id,
            CAST(xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
            xbs_depth, xbs_code, xbs_name,
            parent_node_id, is_leaf,
            pl_m1,pl_m2,pl_m3,pl_m4,pl_m5,pl_m6,pl_m7,pl_m8,pl_m9,pl_m10,pl_m11,pl_m12,
            ac_m1,ac_m2,ac_m3,ac_m4,ac_m5,ac_m6,ac_m7,ac_m8,ac_m9,ac_m10,ac_m11,ac_m12,
            fc_m1,fc_m2,fc_m3,fc_m4,fc_m5,fc_m6,fc_m7,fc_m8,fc_m9,fc_m10,fc_m11,fc_m12,
            bl_m1,bl_m2,bl_m3,bl_m4,bl_m5,bl_m6,bl_m7,bl_m8,bl_m9,bl_m10,bl_m11,bl_m12,
            last_rebuild_utc,
            CAST(NULL AS INT) AS project_scenario_id
        FROM [cp].[facts_pivot]
        WHERE program_id = @program_id AND year_num = @year_num
        ORDER BY tree_kind_id, xbs_path;
        RETURN;
    END

    -- SLOW PATH: scenario-scoped on-the-fly aggregation
    ;WITH leaf_facts AS (
        SELECT
            f.time_month_id % 100 AS month_num,
            f.xbs_node_id,
            SUM(f.planned) AS planned,
            SUM(f.actual)  AS actual,
            CAST(NULL AS DECIMAL(19,4)) AS forecast,
            CAST(NULL AS DECIMAL(19,4)) AS baseline
        FROM [cp].[facts] f
        WHERE f.program_id = @program_id
          AND f.project_scenario_id = @project_scenario_id
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
          AND f.project_scenario_id = @project_scenario_id
          AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
          AND ISNULL(f.cancellato, 0) = 0 AND f.xbs_node_id IS NOT NULL
          AND fm.measure_code = 'F2'
        GROUP BY f.time_month_id, f.xbs_node_id

        UNION ALL
        SELECT f.time_month_id % 100, f.xbs_node_id, NULL, NULL, NULL, SUM(f.value)
        FROM [fc].[facts] f
        WHERE f.program_id = @program_id
          AND f.project_scenario_id = @project_scenario_id
          AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
          AND ISNULL(f.cancellato, 0) = 0 AND f.forecast_code = 'BL' AND f.xbs_node_id IS NOT NULL
        GROUP BY f.time_month_id, f.xbs_node_id
    ),
    leaf_pivoted AS (
        SELECT xbs_node_id,
            SUM(CASE WHEN month_num=1  THEN planned END) AS pl_m1, SUM(CASE WHEN month_num=2 THEN planned END) AS pl_m2,
            SUM(CASE WHEN month_num=3  THEN planned END) AS pl_m3, SUM(CASE WHEN month_num=4 THEN planned END) AS pl_m4,
            SUM(CASE WHEN month_num=5  THEN planned END) AS pl_m5, SUM(CASE WHEN month_num=6 THEN planned END) AS pl_m6,
            SUM(CASE WHEN month_num=7  THEN planned END) AS pl_m7, SUM(CASE WHEN month_num=8 THEN planned END) AS pl_m8,
            SUM(CASE WHEN month_num=9  THEN planned END) AS pl_m9, SUM(CASE WHEN month_num=10 THEN planned END) AS pl_m10,
            SUM(CASE WHEN month_num=11 THEN planned END) AS pl_m11,SUM(CASE WHEN month_num=12 THEN planned END) AS pl_m12,
            SUM(CASE WHEN month_num=1  THEN actual END) AS ac_m1, SUM(CASE WHEN month_num=2 THEN actual END) AS ac_m2,
            SUM(CASE WHEN month_num=3  THEN actual END) AS ac_m3, SUM(CASE WHEN month_num=4 THEN actual END) AS ac_m4,
            SUM(CASE WHEN month_num=5  THEN actual END) AS ac_m5, SUM(CASE WHEN month_num=6 THEN actual END) AS ac_m6,
            SUM(CASE WHEN month_num=7  THEN actual END) AS ac_m7, SUM(CASE WHEN month_num=8 THEN actual END) AS ac_m8,
            SUM(CASE WHEN month_num=9  THEN actual END) AS ac_m9, SUM(CASE WHEN month_num=10 THEN actual END) AS ac_m10,
            SUM(CASE WHEN month_num=11 THEN actual END) AS ac_m11,SUM(CASE WHEN month_num=12 THEN actual END) AS ac_m12,
            SUM(CASE WHEN month_num=1  THEN forecast END) AS fc_m1,SUM(CASE WHEN month_num=2 THEN forecast END) AS fc_m2,
            SUM(CASE WHEN month_num=3  THEN forecast END) AS fc_m3,SUM(CASE WHEN month_num=4 THEN forecast END) AS fc_m4,
            SUM(CASE WHEN month_num=5  THEN forecast END) AS fc_m5,SUM(CASE WHEN month_num=6 THEN forecast END) AS fc_m6,
            SUM(CASE WHEN month_num=7  THEN forecast END) AS fc_m7,SUM(CASE WHEN month_num=8 THEN forecast END) AS fc_m8,
            SUM(CASE WHEN month_num=9  THEN forecast END) AS fc_m9,SUM(CASE WHEN month_num=10 THEN forecast END) AS fc_m10,
            SUM(CASE WHEN month_num=11 THEN forecast END) AS fc_m11,SUM(CASE WHEN month_num=12 THEN forecast END) AS fc_m12,
            SUM(CASE WHEN month_num=1  THEN baseline END) AS bl_m1,SUM(CASE WHEN month_num=2 THEN baseline END) AS bl_m2,
            SUM(CASE WHEN month_num=3  THEN baseline END) AS bl_m3,SUM(CASE WHEN month_num=4 THEN baseline END) AS bl_m4,
            SUM(CASE WHEN month_num=5  THEN baseline END) AS bl_m5,SUM(CASE WHEN month_num=6 THEN baseline END) AS bl_m6,
            SUM(CASE WHEN month_num=7  THEN baseline END) AS bl_m7,SUM(CASE WHEN month_num=8 THEN baseline END) AS bl_m8,
            SUM(CASE WHEN month_num=9  THEN baseline END) AS bl_m9,SUM(CASE WHEN month_num=10 THEN baseline END) AS bl_m10,
            SUM(CASE WHEN month_num=11 THEN baseline END) AS bl_m11,SUM(CASE WHEN month_num=12 THEN baseline END) AS bl_m12
        FROM leaf_facts
        GROUP BY xbs_node_id
    ),
    rolled_up AS (
        SELECT
            n.id AS xbs_node_id, n.tree_kind_id, n.node_path AS xbs_path, n.depth AS xbs_depth,
            n.code AS xbs_code, n.name AS xbs_name,
            SUM(lp.pl_m1) pl_m1,SUM(lp.pl_m2) pl_m2,SUM(lp.pl_m3) pl_m3,SUM(lp.pl_m4) pl_m4,
            SUM(lp.pl_m5) pl_m5,SUM(lp.pl_m6) pl_m6,SUM(lp.pl_m7) pl_m7,SUM(lp.pl_m8) pl_m8,
            SUM(lp.pl_m9) pl_m9,SUM(lp.pl_m10) pl_m10,SUM(lp.pl_m11) pl_m11,SUM(lp.pl_m12) pl_m12,
            SUM(lp.ac_m1) ac_m1,SUM(lp.ac_m2) ac_m2,SUM(lp.ac_m3) ac_m3,SUM(lp.ac_m4) ac_m4,
            SUM(lp.ac_m5) ac_m5,SUM(lp.ac_m6) ac_m6,SUM(lp.ac_m7) ac_m7,SUM(lp.ac_m8) ac_m8,
            SUM(lp.ac_m9) ac_m9,SUM(lp.ac_m10) ac_m10,SUM(lp.ac_m11) ac_m11,SUM(lp.ac_m12) ac_m12,
            SUM(lp.fc_m1) fc_m1,SUM(lp.fc_m2) fc_m2,SUM(lp.fc_m3) fc_m3,SUM(lp.fc_m4) fc_m4,
            SUM(lp.fc_m5) fc_m5,SUM(lp.fc_m6) fc_m6,SUM(lp.fc_m7) fc_m7,SUM(lp.fc_m8) fc_m8,
            SUM(lp.fc_m9) fc_m9,SUM(lp.fc_m10) fc_m10,SUM(lp.fc_m11) fc_m11,SUM(lp.fc_m12) fc_m12,
            SUM(lp.bl_m1) bl_m1,SUM(lp.bl_m2) bl_m2,SUM(lp.bl_m3) bl_m3,SUM(lp.bl_m4) bl_m4,
            SUM(lp.bl_m5) bl_m5,SUM(lp.bl_m6) bl_m6,SUM(lp.bl_m7) bl_m7,SUM(lp.bl_m8) bl_m8,
            SUM(lp.bl_m9) bl_m9,SUM(lp.bl_m10) bl_m10,SUM(lp.bl_m11) bl_m11,SUM(lp.bl_m12) bl_m12
        FROM leaf_pivoted lp
        INNER JOIN [xbs].[node] leaf ON leaf.id = lp.xbs_node_id
        INNER JOIN [xbs].[node] n    ON leaf.node_path.IsDescendantOf(n.node_path) = 1
                                    AND n.tree_kind_id = leaf.tree_kind_id
                                    AND ISNULL(n.cancellato, 0) = 0
        GROUP BY n.id, n.tree_kind_id, n.node_path, n.depth, n.code, n.name
    )
    SELECT
        CAST(0 AS BIGINT) AS id,             -- on-the-fly, no pivot row id
        @program_id AS program_id, @year_num AS year_num, ru.tree_kind_id, ru.xbs_node_id,
        CAST(ru.xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
        ru.xbs_depth, ru.xbs_code, ru.xbs_name,
        (SELECT TOP 1 p.id FROM [xbs].[node] p
          WHERE p.node_path = ru.xbs_path.GetAncestor(1)
            AND p.tree_kind_id = ru.tree_kind_id
            AND ISNULL(p.cancellato, 0) = 0) AS parent_node_id,
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
        SYSUTCDATETIME() AS last_rebuild_utc,
        @project_scenario_id AS project_scenario_id
    FROM rolled_up ru
    ORDER BY ru.tree_kind_id, ru.xbs_path;
END
GO
PRINT '[97-H.10] cp.sp_load_power_edit UPDATED with @project_scenario_id support';
GO

-- ─── 2. Save SP scenario-aware (extends H.8 SP) ───────────────────────────────
-- Update il save SP per UPSERT con project_scenario_id (NULL-friendly).
-- Riusa la SP corrente di H.8 + ALTER per aggiungere @project_scenario_id.
IF OBJECT_ID(N'[cp].[sp_save_power_edit_cells]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_save_power_edit_cells];
GO

CREATE PROCEDURE [cp].[sp_save_power_edit_cells]
    @program_id INT,
    @year_num   INT,
    @user_id    INT,
    @changes    [cp].[tvp_power_edit_cell_changes] READONLY,
    @lock_token UNIQUEIDENTIFIER = NULL,
    @project_scenario_id INT = NULL    -- H.10
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @applied INT = 0;
    DECLARE @failed  INT = 0;
    DECLARE @lock_id BIGINT = NULL;

    -- H.8 lock gating (immutato)
    IF @lock_token IS NOT NULL
    BEGIN
        SELECT @lock_id = id
          FROM [cp].[spreadsheet_lock]
         WHERE lock_token = @lock_token
           AND released_at_utc IS NULL
           AND lock_expires_utc > @now
           AND program_id = @program_id
           AND (year_num IS NULL OR year_num = @year_num);
        IF @lock_id IS NULL
        BEGIN
            DECLARE @err NVARCHAR(400) = 'Lock token validation failed.';
            RAISERROR(@err, 16, 1);
            RETURN;
        END
        UPDATE [cp].[spreadsheet_lock]
           SET last_heartbeat_utc = @now,
               cells_changed_count = cells_changed_count + (SELECT COUNT(*) FROM @changes)
         WHERE id = @lock_id;
    END

    IF EXISTS (SELECT 1 FROM @changes WHERE facet_code = 'baseline')
    BEGIN
        RAISERROR('Baseline e read-only.', 16, 1);
        RETURN;
    END

    -- Validazione leaf-only: skip se @project_scenario_id non NULL (no pivot table check)
    IF @project_scenario_id IS NULL AND EXISTS (
        SELECT 1 FROM @changes c
        INNER JOIN [cp].[facts_pivot] fp
                ON fp.program_id = @program_id AND fp.year_num = @year_num
               AND fp.xbs_node_id = c.xbs_node_id
        WHERE fp.is_leaf = 0
    )
    BEGIN
        RAISERROR('Edit non consentito su nodi non-leaf (rollup-only).', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;

    DECLARE @changes_with_time TABLE (
        xbs_node_id BIGINT, time_month_id INT, facet_code VARCHAR(8), new_value DECIMAL(19,4) NULL
    );
    INSERT INTO @changes_with_time
    SELECT c.xbs_node_id, @year_num*100 + c.month_num, c.facet_code, c.new_value FROM @changes c;

    -- UPSERT cp.facts (planned/actual) — con scope project_scenario_id
    ;WITH plan_targets AS (
        SELECT cw.xbs_node_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw WHERE cw.facet_code = 'planned'
    )
    MERGE [cp].[facts] AS tgt
    USING plan_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.xbs_node_id = src.xbs_node_id
      AND ISNULL(tgt.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET planned = src.new_value,
                   data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, planned,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, @project_scenario_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
                src.new_value, @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    ;WITH act_targets AS (
        SELECT cw.xbs_node_id, cw.time_month_id, cw.new_value
        FROM @changes_with_time cw WHERE cw.facet_code = 'actual'
    )
    MERGE [cp].[facts] AS tgt
    USING act_targets AS src
       ON tgt.program_id = @program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.xbs_node_id = src.xbs_node_id
      AND ISNULL(tgt.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET actual = src.new_value,
                   data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, actual,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, @project_scenario_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
                src.new_value, @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    -- Forecast (skip scenarized forecast per ora — same as before, uses NULL scenario default)
    INSERT INTO [cp].[facts] (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id,
                              data_creazione, utente_creazione)
    SELECT cw.time_month_id, @program_id, @project_scenario_id, cw.xbs_node_id,
           (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
           @now, @user_id
      FROM @changes_with_time cw
     WHERE cw.facet_code = 'forecast'
       AND NOT EXISTS (
           SELECT 1 FROM [cp].[facts] f
           WHERE f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
             AND ISNULL(f.cancellato, 0) = 0
       );

    DECLARE @fc_targets TABLE (facts_id BIGINT, time_month_id INT, new_value DECIMAL(19,4));
    INSERT INTO @fc_targets
    SELECT f.id, cw.time_month_id, cw.new_value
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'forecast';

    MERGE [cp].[facts_measure] AS tgt
    USING @fc_targets AS src
       ON tgt.facts_id = src.facts_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.measure_code = 'F2'
    WHEN MATCHED THEN UPDATE SET value = ISNULL(src.new_value, 0)
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (facts_id, time_month_id, measure_code, value)
        VALUES (src.facts_id, src.time_month_id, 'F2', ISNULL(src.new_value, 0));
    SET @applied = @applied + @@ROWCOUNT;

    -- Audit log
    INSERT INTO [cp].[spreadsheet_change_log] (
        lock_id, facts_id, time_month_id, program_id, cell_field,
        old_value, new_value, changed_at_utc, changed_by_user_id
    )
    SELECT @lock_id,
           (SELECT TOP 1 f.id FROM [cp].[facts] f
             WHERE f.program_id = @program_id
               AND f.time_month_id = cw.time_month_id
               AND f.xbs_node_id = cw.xbs_node_id
               AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
               AND ISNULL(f.cancellato, 0) = 0),
           cw.time_month_id, @program_id,
           cw.facet_code, NULL, cw.new_value, @now, @user_id
      FROM @changes_with_time cw;

    -- Ancestor refresh: SOLO se scenario_id NULL (pivot table cache only valid per all-scenarios agg)
    IF @project_scenario_id IS NULL
    BEGIN
        DECLARE @affected_paths TABLE (tree_kind_id TINYINT NOT NULL, xbs_path HIERARCHYID NOT NULL,
                                       PRIMARY KEY (tree_kind_id, xbs_path));
        INSERT INTO @affected_paths
        SELECT DISTINCT leaf.tree_kind_id, leaf.node_path.GetAncestor(d.val)
          FROM @changes c
          INNER JOIN [xbs].[node] leaf ON leaf.id = c.xbs_node_id
          CROSS APPLY (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS d(val)
         WHERE d.val <= leaf.depth;

        ;WITH affected_nodes AS (
            SELECT n.id, n.tree_kind_id, n.node_path
              FROM [xbs].[node] n
              INNER JOIN @affected_paths ap ON ap.xbs_path = n.node_path AND ap.tree_kind_id = n.tree_kind_id
             WHERE ISNULL(n.cancellato, 0) = 0
        ),
        leaf_facts AS (
            SELECT f.time_month_id % 100 AS month_num, f.xbs_node_id,
                   SUM(f.planned) AS planned, SUM(f.actual) AS actual,
                   CAST(NULL AS DECIMAL(19,4)) AS forecast, CAST(NULL AS DECIMAL(19,4)) AS baseline
            FROM [cp].[facts] f
            WHERE f.program_id = @program_id
              AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
              AND ISNULL(f.cancellato, 0) = 0 AND f.xbs_node_id IS NOT NULL
            GROUP BY f.time_month_id, f.xbs_node_id
            UNION ALL
            SELECT f.time_month_id % 100, f.xbs_node_id, NULL, NULL, SUM(fm.value), NULL
            FROM [cp].[facts] f
            INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
            WHERE f.program_id = @program_id
              AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
              AND ISNULL(f.cancellato, 0) = 0 AND f.xbs_node_id IS NOT NULL AND fm.measure_code = 'F2'
            GROUP BY f.time_month_id, f.xbs_node_id
            UNION ALL
            SELECT f.time_month_id % 100, f.xbs_node_id, NULL, NULL, NULL, SUM(f.value)
            FROM [fc].[facts] f
            WHERE f.program_id = @program_id
              AND f.time_month_id BETWEEN @year_num*100+1 AND @year_num*100+12
              AND ISNULL(f.cancellato, 0) = 0 AND f.forecast_code='BL' AND f.xbs_node_id IS NOT NULL
            GROUP BY f.time_month_id, f.xbs_node_id
        ),
        recomputed AS (
            SELECT an.id AS xbs_node_id,
                SUM(CASE WHEN lf.month_num=1  THEN lf.planned END) pl_m1,SUM(CASE WHEN lf.month_num=2  THEN lf.planned END) pl_m2,
                SUM(CASE WHEN lf.month_num=3  THEN lf.planned END) pl_m3,SUM(CASE WHEN lf.month_num=4  THEN lf.planned END) pl_m4,
                SUM(CASE WHEN lf.month_num=5  THEN lf.planned END) pl_m5,SUM(CASE WHEN lf.month_num=6  THEN lf.planned END) pl_m6,
                SUM(CASE WHEN lf.month_num=7  THEN lf.planned END) pl_m7,SUM(CASE WHEN lf.month_num=8  THEN lf.planned END) pl_m8,
                SUM(CASE WHEN lf.month_num=9  THEN lf.planned END) pl_m9,SUM(CASE WHEN lf.month_num=10 THEN lf.planned END) pl_m10,
                SUM(CASE WHEN lf.month_num=11 THEN lf.planned END) pl_m11,SUM(CASE WHEN lf.month_num=12 THEN lf.planned END) pl_m12,
                SUM(CASE WHEN lf.month_num=1  THEN lf.actual END) ac_m1,SUM(CASE WHEN lf.month_num=2  THEN lf.actual END) ac_m2,
                SUM(CASE WHEN lf.month_num=3  THEN lf.actual END) ac_m3,SUM(CASE WHEN lf.month_num=4  THEN lf.actual END) ac_m4,
                SUM(CASE WHEN lf.month_num=5  THEN lf.actual END) ac_m5,SUM(CASE WHEN lf.month_num=6  THEN lf.actual END) ac_m6,
                SUM(CASE WHEN lf.month_num=7  THEN lf.actual END) ac_m7,SUM(CASE WHEN lf.month_num=8  THEN lf.actual END) ac_m8,
                SUM(CASE WHEN lf.month_num=9  THEN lf.actual END) ac_m9,SUM(CASE WHEN lf.month_num=10 THEN lf.actual END) ac_m10,
                SUM(CASE WHEN lf.month_num=11 THEN lf.actual END) ac_m11,SUM(CASE WHEN lf.month_num=12 THEN lf.actual END) ac_m12,
                SUM(CASE WHEN lf.month_num=1  THEN lf.forecast END) fc_m1,SUM(CASE WHEN lf.month_num=2  THEN lf.forecast END) fc_m2,
                SUM(CASE WHEN lf.month_num=3  THEN lf.forecast END) fc_m3,SUM(CASE WHEN lf.month_num=4  THEN lf.forecast END) fc_m4,
                SUM(CASE WHEN lf.month_num=5  THEN lf.forecast END) fc_m5,SUM(CASE WHEN lf.month_num=6  THEN lf.forecast END) fc_m6,
                SUM(CASE WHEN lf.month_num=7  THEN lf.forecast END) fc_m7,SUM(CASE WHEN lf.month_num=8  THEN lf.forecast END) fc_m8,
                SUM(CASE WHEN lf.month_num=9  THEN lf.forecast END) fc_m9,SUM(CASE WHEN lf.month_num=10 THEN lf.forecast END) fc_m10,
                SUM(CASE WHEN lf.month_num=11 THEN lf.forecast END) fc_m11,SUM(CASE WHEN lf.month_num=12 THEN lf.forecast END) fc_m12,
                SUM(CASE WHEN lf.month_num=1  THEN lf.baseline END) bl_m1,SUM(CASE WHEN lf.month_num=2  THEN lf.baseline END) bl_m2,
                SUM(CASE WHEN lf.month_num=3  THEN lf.baseline END) bl_m3,SUM(CASE WHEN lf.month_num=4  THEN lf.baseline END) bl_m4,
                SUM(CASE WHEN lf.month_num=5  THEN lf.baseline END) bl_m5,SUM(CASE WHEN lf.month_num=6  THEN lf.baseline END) bl_m6,
                SUM(CASE WHEN lf.month_num=7  THEN lf.baseline END) bl_m7,SUM(CASE WHEN lf.month_num=8  THEN lf.baseline END) bl_m8,
                SUM(CASE WHEN lf.month_num=9  THEN lf.baseline END) bl_m9,SUM(CASE WHEN lf.month_num=10 THEN lf.baseline END) bl_m10,
                SUM(CASE WHEN lf.month_num=11 THEN lf.baseline END) bl_m11,SUM(CASE WHEN lf.month_num=12 THEN lf.baseline END) bl_m12
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
            p.pl_m1=r.pl_m1,p.pl_m2=r.pl_m2,p.pl_m3=r.pl_m3,p.pl_m4=r.pl_m4,p.pl_m5=r.pl_m5,p.pl_m6=r.pl_m6,
            p.pl_m7=r.pl_m7,p.pl_m8=r.pl_m8,p.pl_m9=r.pl_m9,p.pl_m10=r.pl_m10,p.pl_m11=r.pl_m11,p.pl_m12=r.pl_m12,
            p.ac_m1=r.ac_m1,p.ac_m2=r.ac_m2,p.ac_m3=r.ac_m3,p.ac_m4=r.ac_m4,p.ac_m5=r.ac_m5,p.ac_m6=r.ac_m6,
            p.ac_m7=r.ac_m7,p.ac_m8=r.ac_m8,p.ac_m9=r.ac_m9,p.ac_m10=r.ac_m10,p.ac_m11=r.ac_m11,p.ac_m12=r.ac_m12,
            p.fc_m1=r.fc_m1,p.fc_m2=r.fc_m2,p.fc_m3=r.fc_m3,p.fc_m4=r.fc_m4,p.fc_m5=r.fc_m5,p.fc_m6=r.fc_m6,
            p.fc_m7=r.fc_m7,p.fc_m8=r.fc_m8,p.fc_m9=r.fc_m9,p.fc_m10=r.fc_m10,p.fc_m11=r.fc_m11,p.fc_m12=r.fc_m12,
            p.bl_m1=r.bl_m1,p.bl_m2=r.bl_m2,p.bl_m3=r.bl_m3,p.bl_m4=r.bl_m4,p.bl_m5=r.bl_m5,p.bl_m6=r.bl_m6,
            p.bl_m7=r.bl_m7,p.bl_m8=r.bl_m8,p.bl_m9=r.bl_m9,p.bl_m10=r.bl_m10,p.bl_m11=r.bl_m11,p.bl_m12=r.bl_m12,
            p.last_rebuild_utc=@now
          FROM [cp].[facts_pivot] p INNER JOIN recomputed r ON r.xbs_node_id = p.xbs_node_id
         WHERE p.program_id=@program_id AND p.year_num=@year_num;
    END

    COMMIT TRANSACTION;

    -- Output: affected rows. NULL scenario → pivot table rows; INT scenario → on-the-fly row re-aggregated.
    IF @project_scenario_id IS NULL
    BEGIN
        SELECT
            fp.id, fp.program_id, fp.year_num, fp.tree_kind_id, fp.xbs_node_id,
            CAST(fp.xbs_path AS NVARCHAR(4000)) AS xbs_path_str,
            fp.xbs_depth, fp.xbs_code, fp.xbs_name, fp.parent_node_id, fp.is_leaf,
            fp.pl_m1,fp.pl_m2,fp.pl_m3,fp.pl_m4,fp.pl_m5,fp.pl_m6,fp.pl_m7,fp.pl_m8,fp.pl_m9,fp.pl_m10,fp.pl_m11,fp.pl_m12,
            fp.ac_m1,fp.ac_m2,fp.ac_m3,fp.ac_m4,fp.ac_m5,fp.ac_m6,fp.ac_m7,fp.ac_m8,fp.ac_m9,fp.ac_m10,fp.ac_m11,fp.ac_m12,
            fp.fc_m1,fp.fc_m2,fp.fc_m3,fp.fc_m4,fp.fc_m5,fp.fc_m6,fp.fc_m7,fp.fc_m8,fp.fc_m9,fp.fc_m10,fp.fc_m11,fp.fc_m12,
            fp.bl_m1,fp.bl_m2,fp.bl_m3,fp.bl_m4,fp.bl_m5,fp.bl_m6,fp.bl_m7,fp.bl_m8,fp.bl_m9,fp.bl_m10,fp.bl_m11,fp.bl_m12,
            fp.last_rebuild_utc, @applied AS applied, @failed AS failed, @lock_id AS lock_id,
            CAST(NULL AS INT) AS project_scenario_id
        FROM [cp].[facts_pivot] fp
        INNER JOIN @affected_paths ap ON ap.xbs_path = fp.xbs_path AND ap.tree_kind_id = fp.tree_kind_id
        WHERE fp.program_id = @program_id AND fp.year_num = @year_num
        ORDER BY fp.tree_kind_id, fp.xbs_path;
    END
    ELSE
    BEGIN
        -- Scenario-scoped: ritorna applied count senza ancestor rows (client farà un nuovo load se serve)
        SELECT CAST(0 AS BIGINT) AS id, @program_id AS program_id, @year_num AS year_num,
               CAST(0 AS TINYINT) AS tree_kind_id, CAST(0 AS BIGINT) AS xbs_node_id,
               CAST('' AS NVARCHAR(4000)) AS xbs_path_str,
               CAST(0 AS SMALLINT) AS xbs_depth, CAST(NULL AS NVARCHAR(80)) AS xbs_code,
               CAST(NULL AS NVARCHAR(255)) AS xbs_name,
               CAST(NULL AS BIGINT) AS parent_node_id, CAST(1 AS BIT) AS is_leaf,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m1, CAST(NULL AS DECIMAL(19,4)) AS pl_m2,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m3, CAST(NULL AS DECIMAL(19,4)) AS pl_m4,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m5, CAST(NULL AS DECIMAL(19,4)) AS pl_m6,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m7, CAST(NULL AS DECIMAL(19,4)) AS pl_m8,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m9, CAST(NULL AS DECIMAL(19,4)) AS pl_m10,
               CAST(NULL AS DECIMAL(19,4)) AS pl_m11, CAST(NULL AS DECIMAL(19,4)) AS pl_m12,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m1, CAST(NULL AS DECIMAL(19,4)) AS ac_m2,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m3, CAST(NULL AS DECIMAL(19,4)) AS ac_m4,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m5, CAST(NULL AS DECIMAL(19,4)) AS ac_m6,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m7, CAST(NULL AS DECIMAL(19,4)) AS ac_m8,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m9, CAST(NULL AS DECIMAL(19,4)) AS ac_m10,
               CAST(NULL AS DECIMAL(19,4)) AS ac_m11, CAST(NULL AS DECIMAL(19,4)) AS ac_m12,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m1, CAST(NULL AS DECIMAL(19,4)) AS fc_m2,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m3, CAST(NULL AS DECIMAL(19,4)) AS fc_m4,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m5, CAST(NULL AS DECIMAL(19,4)) AS fc_m6,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m7, CAST(NULL AS DECIMAL(19,4)) AS fc_m8,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m9, CAST(NULL AS DECIMAL(19,4)) AS fc_m10,
               CAST(NULL AS DECIMAL(19,4)) AS fc_m11, CAST(NULL AS DECIMAL(19,4)) AS fc_m12,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m1, CAST(NULL AS DECIMAL(19,4)) AS bl_m2,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m3, CAST(NULL AS DECIMAL(19,4)) AS bl_m4,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m5, CAST(NULL AS DECIMAL(19,4)) AS bl_m6,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m7, CAST(NULL AS DECIMAL(19,4)) AS bl_m8,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m9, CAST(NULL AS DECIMAL(19,4)) AS bl_m10,
               CAST(NULL AS DECIMAL(19,4)) AS bl_m11, CAST(NULL AS DECIMAL(19,4)) AS bl_m12,
               SYSUTCDATETIME() AS last_rebuild_utc,
               @applied AS applied, @failed AS failed, @lock_id AS lock_id,
               @project_scenario_id AS project_scenario_id
        WHERE 1=0;   -- empty result, client riloada
    END
END
GO

PRINT '[97-H.10] cp.sp_save_power_edit_cells UPDATED with scenario_id support';
GO
