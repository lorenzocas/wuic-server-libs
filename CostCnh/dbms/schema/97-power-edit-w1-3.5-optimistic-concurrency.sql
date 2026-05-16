-- =============================================================================
-- W1 3.5 — Optimistic concurrency check (data_modifica timestamp)
-- =============================================================================
-- Estende cp.tvp_power_edit_cell_changes con last_seen_utc DATETIME2(3) NULL.
-- Il client invia il timestamp di cp.facts.data_modifica letto durante snapshot.
-- Save SP rifiuta il batch se ALMENO UNA cella e' stata modificata dopo
-- last_seen_utc da altro utente.
--
-- BACKWARD COMPAT: client puo' continuare a mandare NULL → skip optimistic check.
-- Combinato con H.8 lock-token hard-gate, dà double-protection:
--   - Lock prevents concurrent editing dello stesso scope (program+year)
--   - Optimistic catch race condition tra acquire-lock e save (rara, ma possibile)
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

-- TVP non si puo' alterare → drop + create. Drop dipende da SP che lo usa.
IF OBJECT_ID(N'[cp].[sp_save_power_edit_cells]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_save_power_edit_cells];
GO

IF TYPE_ID(N'[cp].[tvp_power_edit_cell_changes]') IS NOT NULL
    DROP TYPE [cp].[tvp_power_edit_cell_changes];
GO

CREATE TYPE [cp].[tvp_power_edit_cell_changes] AS TABLE (
    xbs_node_id   BIGINT       NOT NULL,
    month_num     TINYINT      NOT NULL,
    facet_code    VARCHAR(8)   NOT NULL,
    new_value     DECIMAL(19,4) NULL,
    last_seen_utc DATETIME2(3) NULL,                  -- W1 3.5 optimistic concurrency
    PRIMARY KEY (xbs_node_id, month_num, facet_code)
);
GO
PRINT '[97-W1-3.5] cp.tvp_power_edit_cell_changes recreated with last_seen_utc';
GO

CREATE PROCEDURE [cp].[sp_save_power_edit_cells]
    @program_id INT,
    @year_num   INT,
    @user_id    INT,
    @changes    [cp].[tvp_power_edit_cell_changes] READONLY,
    @lock_token UNIQUEIDENTIFIER = NULL,
    @project_scenario_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @applied INT = 0;
    DECLARE @failed  INT = 0;
    DECLARE @lock_id BIGINT = NULL;

    -- ─── H.8 lock gating ──────────────────────────────────────────────────────
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
            RAISERROR('Lock token validation failed.', 16, 1);
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

    -- ─── W1 3.1: leaf-only via xbs.node ──────────────────────────────────────
    IF EXISTS (
        SELECT 1 FROM @changes c
        INNER JOIN [xbs].[node] n ON n.id = c.xbs_node_id AND ISNULL(n.cancellato, 0) = 0
        WHERE EXISTS (
            SELECT 1 FROM [xbs].[node] child
             WHERE child.node_path.GetAncestor(1) = n.node_path
               AND child.tree_kind_id = n.tree_kind_id
               AND ISNULL(child.cancellato, 0) = 0
        )
    )
    BEGIN
        RAISERROR('Edit non consentito su nodi non-leaf (xbs.node children exist).', 16, 1);
        RETURN;
    END

    -- ─── W1 3.5: OPTIMISTIC CONCURRENCY CHECK ────────────────────────────────
    -- Per ogni cella con last_seen_utc valorizzato, verifica che la row
    -- corrispondente in cp.facts NON sia stata modificata dopo quel timestamp.
    -- Se trovata anche solo 1 cella stale → rifiuta tutto il batch.
    IF EXISTS (
        SELECT 1
          FROM @changes c
          INNER JOIN [cp].[facts] f
                  ON f.program_id = @program_id
                 AND f.time_month_id = @year_num*100 + c.month_num
                 AND f.xbs_node_id = c.xbs_node_id
                 AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
                 AND ISNULL(f.cancellato, 0) = 0
         WHERE c.last_seen_utc IS NOT NULL
           AND f.data_modifica IS NOT NULL
           AND f.data_modifica > c.last_seen_utc
    )
    BEGIN
        RAISERROR('Optimistic concurrency conflict: una o piu celle sono state modificate da altro utente dopo lo snapshot. Ricarica e riprova.', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;

    DECLARE @changes_with_time TABLE (
        xbs_node_id BIGINT, time_month_id INT, facet_code VARCHAR(8), new_value DECIMAL(19,4) NULL
    );
    INSERT INTO @changes_with_time
    SELECT c.xbs_node_id, @year_num*100 + c.month_num, c.facet_code, c.new_value FROM @changes c;

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
        UPDATE SET planned = src.new_value, data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, planned,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, @project_scenario_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id), src.new_value, @now, @user_id);
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
        UPDATE SET actual = src.new_value, data_modifica = @now, utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, actual,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, @program_id, @project_scenario_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id), src.new_value, @now, @user_id);
    SET @applied = @applied + @@ROWCOUNT;

    -- Forecast (same pattern come H.10)
    INSERT INTO [cp].[facts] (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id,
                              data_creazione, utente_creazione)
    SELECT cw.time_month_id, @program_id, @project_scenario_id, cw.xbs_node_id,
           (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id), @now, @user_id
      FROM @changes_with_time cw
     WHERE cw.facet_code = 'forecast'
       AND NOT EXISTS (
           SELECT 1 FROM [cp].[facts] f
           WHERE f.program_id = @program_id AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
             AND ISNULL(f.cancellato, 0) = 0
       );

    DECLARE @fc_targets TABLE (facts_id BIGINT, time_month_id INT, new_value DECIMAL(19,4));
    INSERT INTO @fc_targets
    SELECT f.id, cw.time_month_id, cw.new_value
      FROM @changes_with_time cw
      INNER JOIN [cp].[facts] f
              ON f.program_id = @program_id AND f.time_month_id = cw.time_month_id
             AND f.xbs_node_id = cw.xbs_node_id
             AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
             AND ISNULL(f.cancellato, 0) = 0
     WHERE cw.facet_code = 'forecast';

    MERGE [cp].[facts_measure] AS tgt
    USING @fc_targets AS src
       ON tgt.facts_id = src.facts_id AND tgt.time_month_id = src.time_month_id AND tgt.measure_code = 'F2'
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
             WHERE f.program_id = @program_id AND f.time_month_id = cw.time_month_id
               AND f.xbs_node_id = cw.xbs_node_id
               AND ISNULL(f.project_scenario_id, -1) = ISNULL(@project_scenario_id, -1)
               AND ISNULL(f.cancellato, 0) = 0),
           cw.time_month_id, @program_id, cw.facet_code, NULL, cw.new_value, @now, @user_id
      FROM @changes_with_time cw;

    -- Ancestor refresh (NULL scenario)
    IF @project_scenario_id IS NULL
    BEGIN
        EXEC [cp].[sp_rebuild_power_edit_pivot] @program_id = @program_id, @year_num = @year_num, @verbose = 0;
    END

    COMMIT TRANSACTION;

    -- Output
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
        SELECT @applied AS applied, @failed AS failed, @lock_id AS lock_id,
               @project_scenario_id AS project_scenario_id
        WHERE 1=0;
    END
END
GO

PRINT '[97-W1-3.5] cp.sp_save_power_edit_cells UPDATED with optimistic concurrency check';
GO
