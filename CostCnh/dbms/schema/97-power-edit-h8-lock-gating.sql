-- =============================================================================
-- Phase H.8 — Hard server-side lock token gating in cp.sp_save_power_edit_cells
-- =============================================================================
-- Aggiunge @lock_token UNIQUEIDENTIFIER al SP save-cells. Quando passato:
--   - Verifica che il token esista in cp.spreadsheet_lock
--   - Verifica che sia ATTIVO (released_at_utc IS NULL)
--   - Verifica che NON sia scaduto (lock_expires_utc > now)
--   - Verifica che lo scope (program_id, year_num) matchi il payload
--   - Aggiorna last_heartbeat_utc + cells_changed_count
--   - Logga ogni cella in cp.spreadsheet_change_log per audit
--
-- BACKWARD COMPAT: @lock_token = NULL → comportamento legacy (best-effort).
-- Il client (PowerEditController) lo passa sempre quando l'utente ha lock attivo.
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

IF OBJECT_ID(N'[cp].[sp_save_power_edit_cells]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_save_power_edit_cells];
GO

CREATE PROCEDURE [cp].[sp_save_power_edit_cells]
    @program_id INT,
    @year_num   INT,
    @user_id    INT,
    @changes    [cp].[tvp_power_edit_cell_changes] READONLY,
    @lock_token UNIQUEIDENTIFIER = NULL    -- H.8: opzionale, ma se passato HARD-GATE
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @applied INT = 0;
    DECLARE @failed  INT = 0;
    DECLARE @lock_id BIGINT = NULL;

    -- ─── H.8: HARD LOCK GATING ────────────────────────────────────────────────
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
            -- Diagnostica: distingui token-not-found vs scope-mismatch vs expired
            DECLARE @diag_exists BIT = 0, @diag_expired BIT = 0, @diag_scope_mismatch BIT = 0;
            IF EXISTS (SELECT 1 FROM [cp].[spreadsheet_lock] WHERE lock_token = @lock_token)
                SET @diag_exists = 1;
            IF EXISTS (SELECT 1 FROM [cp].[spreadsheet_lock]
                       WHERE lock_token = @lock_token AND lock_expires_utc <= @now)
                SET @diag_expired = 1;
            IF EXISTS (SELECT 1 FROM [cp].[spreadsheet_lock]
                       WHERE lock_token = @lock_token AND released_at_utc IS NULL
                         AND lock_expires_utc > @now
                         AND (program_id <> @program_id OR (year_num IS NOT NULL AND year_num <> @year_num)))
                SET @diag_scope_mismatch = 1;

            DECLARE @err NVARCHAR(400) = CONCAT(
                'Lock token validation failed [token_exists=', @diag_exists,
                ' expired=', @diag_expired,
                ' scope_mismatch=', @diag_scope_mismatch,
                ' program=', @program_id, ' year=', @year_num, '].');
            RAISERROR(@err, 16, 1);
            RETURN;
        END

        -- Heartbeat implicito + counter cells changed
        UPDATE [cp].[spreadsheet_lock]
           SET last_heartbeat_utc = @now,
               cells_changed_count = cells_changed_count + (SELECT COUNT(*) FROM @changes)
         WHERE id = @lock_id;
    END

    -- Validazione: solo nodi LEAF possono essere editati
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

    IF EXISTS (SELECT 1 FROM @changes WHERE facet_code = 'baseline')
    BEGIN
        RAISERROR('Baseline e read-only.', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;

    DECLARE @changes_with_time TABLE (
        xbs_node_id   BIGINT,
        time_month_id INT,
        facet_code    VARCHAR(8),
        new_value     DECIMAL(19,4) NULL
    );

    INSERT INTO @changes_with_time
    SELECT c.xbs_node_id, @year_num * 100 + c.month_num, c.facet_code, c.new_value
    FROM @changes c;

    -- H.8 audit: snapshot old values PRIMA di update (per change_log)
    DECLARE @audit_pre TABLE (
        xbs_node_id BIGINT, time_month_id INT, facet_code VARCHAR(8),
        facts_id BIGINT NULL, old_value DECIMAL(19,4) NULL
    );

    -- Planned old values
    INSERT INTO @audit_pre (xbs_node_id, time_month_id, facet_code, facts_id, old_value)
    SELECT cw.xbs_node_id, cw.time_month_id, cw.facet_code, f.id, f.planned
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'planned';

    -- Actual old values
    INSERT INTO @audit_pre (xbs_node_id, time_month_id, facet_code, facts_id, old_value)
    SELECT cw.xbs_node_id, cw.time_month_id, cw.facet_code, f.id, f.actual
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'actual';

    -- Forecast old values
    INSERT INTO @audit_pre (xbs_node_id, time_month_id, facet_code, facts_id, old_value)
    SELECT cw.xbs_node_id, cw.time_month_id, cw.facet_code, f.id, fm.value
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id
             AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.cancellato, 0) = 0
      LEFT JOIN [cp].[facts_measure] fm
             ON fm.facts_id = f.id
            AND fm.time_month_id = f.time_month_id
            AND fm.measure_code = 'F2'
     WHERE cw.facet_code = 'forecast';

    -- ─── 1. UPSERT su cp.facts (planned/actual) ───────────────────────────────
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

    -- ─── 2. UPSERT forecast su cp.facts_measure (measure_code='F2') ──────────
    -- Assicura cp.facts row esiste prima
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

    -- ─── H.8: AUDIT log per ogni cella modificata ─────────────────────────────
    INSERT INTO [cp].[spreadsheet_change_log] (
        lock_id, facts_id, time_month_id, program_id, cell_field,
        old_value, new_value, changed_at_utc, changed_by_user_id
    )
    SELECT @lock_id,
           ISNULL(ap.facts_id,
                  (SELECT TOP 1 f.id FROM [cp].[facts] f
                    WHERE f.program_id = @program_id
                      AND f.time_month_id = cw.time_month_id
                      AND f.xbs_node_id = cw.xbs_node_id
                      AND ISNULL(f.cancellato, 0) = 0)),
           cw.time_month_id, @program_id,
           cw.facet_code, ap.old_value, cw.new_value, @now, @user_id
      FROM @changes_with_time cw
      LEFT JOIN @audit_pre ap
             ON ap.xbs_node_id = cw.xbs_node_id
            AND ap.time_month_id = cw.time_month_id
            AND ap.facet_code = cw.facet_code;

    -- ─── 3. Identifica ancestor da ri-pivotare (scoped per tree_kind) ─────────
    DECLARE @affected_paths TABLE (
        tree_kind_id TINYINT NOT NULL,
        xbs_path HIERARCHYID NOT NULL,
        PRIMARY KEY (tree_kind_id, xbs_path)
    );
    INSERT INTO @affected_paths (tree_kind_id, xbs_path)
    SELECT DISTINCT leaf.tree_kind_id, leaf.node_path.GetAncestor(d.val)
      FROM @changes c
      INNER JOIN [xbs].[node] leaf ON leaf.id = c.xbs_node_id
      CROSS APPLY (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9),(10)) AS d(val)
     WHERE d.val <= leaf.depth;

    -- ─── 4. Recompute pivot rows per gli ancestor toccati ────────────────────
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
        SELECT an.id AS xbs_node_id,
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

    -- ─── 5. Output: ancestor rows aggiornate ──────────────────────────────────
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
        @failed  AS failed,
        @lock_id AS lock_id
    FROM [cp].[facts_pivot] fp
    INNER JOIN @affected_paths ap ON ap.xbs_path = fp.xbs_path AND ap.tree_kind_id = fp.tree_kind_id
    WHERE fp.program_id = @program_id
      AND fp.year_num   = @year_num
    ORDER BY fp.tree_kind_id, fp.xbs_path;
END
GO

PRINT '[97-H.8] cp.sp_save_power_edit_cells UPDATED with hard lock gating + audit logging';
GO
