-- =============================================================================
-- ETL Phase 4 — CostPlanning_Facts → cp.facts (partition-by-partition)
-- =============================================================================
-- BIGGEST: legacy facts.CostPlanning_Facts puo' avere miliardi di righe.
--
-- Strategia partition-by-partition:
--   FOR @month IN (sorted asc DESC dim_time):
--     - INSERT ... SELECT ... WHERE Id_Time_Month = @month
--     - Rows are pre-filtered + transformed (XBS_Objects_1..5 → xbs_node_id)
--     - WITH (TABLOCK) per skip log per BULK insert
--     - Commit ogni mese; restartable
--
-- Transformation chiave: 5 colonne XBS legacy → 1 sola xbs_node_id.
-- Politica: prende l'XBS_Objects_N piu' profondo (5 prima, poi 4, ..., poi 1).
-- Risultato: assegnazione xbs_node_id a livello piu' specifico disponibile.
-- (Documentato come info-loss controllata.)
--
-- Parametri:
--   @month_from / @month_to: range YYYYMM (default = tutto)
--   @batch_size_months: quanti mesi processare in un singolo run
-- =============================================================================

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 4, @phase_name = N'cp.facts (partition-by-partition)', @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1 BEGIN PRINT '[phase4] already completed'; RETURN; END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @inserted BIGINT = 0, @rejected BIGINT = 0;
DECLARE @month_from INT = ISNULL(<<MONTH_FROM>>, 201801);
DECLARE @month_to   INT = ISNULL(<<MONTH_TO>>,   203012);
DECLARE @current_month INT = @month_from;

WHILE @current_month <= @month_to
BEGIN
    DECLARE @t_month DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @month_rows BIGINT;

    BEGIN TRY
        -- INSERT batch for current month
        ;WITH src AS (
            SELECT
                cf.[Id]                  AS legacy_id,
                cf.[Id_Time_Month]       AS time_month_id,
                cf.[Id_Program]          AS legacy_program_guid,
                cf.[Id_XBS_Objects_5]    AS xbs5,
                cf.[Id_XBS_Objects_4]    AS xbs4,
                cf.[Id_XBS_Objects_3]    AS xbs3,
                cf.[Id_XBS_Objects_2]    AS xbs2,
                cf.[Id_XBS_Objects_1]    AS xbs1,
                cf.[Id_UnitMeasure]      AS legacy_unit_id,
                CAST(cf.[planned]   AS DECIMAL(19,4)) AS planned,
                CAST(cf.[actual]    AS DECIMAL(19,4)) AS actual,
                CAST(cf.[balance]   AS DECIMAL(19,4)) AS balance
                -- reserved/forecast_* sono EAV → finiscono in cp.facts_measure (Sprint 9.2)
            FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
            WHERE cf.[Id_Time_Month] = @current_month
        ),
        joined AS (
            SELECT
                s.legacy_id, s.time_month_id, s.planned, s.actual, s.balance,
                pmap.new_id AS program_id,
                umap.new_id AS unit_measure_id,
                COALESCE(
                    xbs5_map.new_id, xbs4_map.new_id, xbs3_map.new_id, xbs2_map.new_id, xbs1_map.new_id
                ) AS xbs_node_id
            FROM src s
            LEFT JOIN [etl].[guid_map] pmap     ON pmap.entity_type = 'program'      AND pmap.legacy_guid = s.legacy_program_guid
            LEFT JOIN [etl].[int_map]  umap     ON umap.entity_type = 'unit_measure' AND umap.legacy_id   = s.legacy_unit_id
            LEFT JOIN [etl].[guid_map] xbs5_map ON xbs5_map.entity_type = 'xbs_node' AND xbs5_map.legacy_guid = s.xbs5
            LEFT JOIN [etl].[guid_map] xbs4_map ON xbs4_map.entity_type = 'xbs_node' AND xbs4_map.legacy_guid = s.xbs4
            LEFT JOIN [etl].[guid_map] xbs3_map ON xbs3_map.entity_type = 'xbs_node' AND xbs3_map.legacy_guid = s.xbs3
            LEFT JOIN [etl].[guid_map] xbs2_map ON xbs2_map.entity_type = 'xbs_node' AND xbs2_map.legacy_guid = s.xbs2
            LEFT JOIN [etl].[guid_map] xbs1_map ON xbs1_map.entity_type = 'xbs_node' AND xbs1_map.legacy_guid = s.xbs1
        )
        INSERT INTO [cp].[facts] WITH (TABLOCK)
            (time_month_id, program_id, project_id, project_scenario_id, xbs_node_id, unit_measure_id, currency_id,
             actual, planned, committed, balance, cancellato)
        SELECT
            j.time_month_id,
            j.program_id,
            NULL,                                  -- legacy CostPlanning_Facts non aveva Id_Project diretto
            NULL,                                  -- nor Id_ProjectScenario
            j.xbs_node_id,
            ISNULL(j.unit_measure_id, 1),          -- fallback unit_measure_id=1 se unmapped
            NULL,                                  -- currency_id derivable da program.currency_id (post-pass)
            j.actual,
            j.planned,
            NULL,                                  -- committed: not in legacy schema
            j.balance,
            0
        FROM joined j
        WHERE j.program_id IS NOT NULL;            -- skip facts orfani

        SELECT @month_rows = @@ROWCOUNT;
        SET @inserted = @inserted + @month_rows;

        PRINT '[phase4] month=' + CAST(@current_month AS NVARCHAR(10))
              + ' rows=' + CAST(@month_rows AS NVARCHAR(20))
              + ' duration_ms=' + CAST(DATEDIFF(MILLISECOND, @t_month, SYSUTCDATETIME()) AS NVARCHAR(20));
    END TRY
    BEGIN CATCH
        INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message)
        VALUES (<<RUN_ID>>, 4, 'cp_facts', CAST(@current_month AS NVARCHAR(10)), 'partition_failed', ERROR_MESSAGE());
        PRINT '[phase4] FAILED month=' + CAST(@current_month AS NVARCHAR(10)) + ': ' + ERROR_MESSAGE();
    END CATCH

    -- Increment month: 202401 → 202402 → ... → 202412 → 202501
    SET @current_month = @current_month + 1;
    IF (@current_month % 100) = 13 SET @current_month = ((@current_month / 100) + 1) * 100 + 1;
END

DECLARE @dur4 INT = DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME());
EXEC [etl].[complete_phase]
    @phase_id = @phase_id,
    @rows_inserted = @inserted,
    @rows_rejected = @rejected,
    @duration_ms = @dur4;
PRINT '[phase4] DONE — total rows_inserted=' + CAST(@inserted AS NVARCHAR(20));
GO
