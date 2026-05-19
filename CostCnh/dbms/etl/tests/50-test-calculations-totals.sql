-- =============================================================================
-- E2E Test — Totals: PowerEdit aggregates + reporting cross-currency
-- =============================================================================
-- Verifica che gli SP di lettura aggregata (PowerEdit pivot, reporting totals)
-- producano risultati coerenti con i facts sottostanti, sia raw che cross-currency.
--
-- Placeholders:
--   <<TEST_RUN_ID>>   — BIGINT
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;
DECLARE @program_id INT, @year_num INT;
DECLARE @src_cur INT, @tgt_cur INT;

-- ─── Scegli la (program_id, year) più grande disponibile per i test ──────────
SELECT TOP 1 @program_id = program_id, @year_num = time_month_id/100
  FROM [cp].[facts]
 WHERE ISNULL(cancellato, 0) = 0
 GROUP BY program_id, time_month_id/100
 ORDER BY COUNT(*) DESC;

IF @program_id IS NULL OR @year_num IS NULL
BEGIN
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, message)
    VALUES (@tr, 'totals', 'setup', 'skip', 'No facts in cp.facts → cannot run totals tests');
    PRINT '[totals] skip: no facts';
    RETURN;
END

-- Source currency = program currency
SELECT @src_cur = currency_id FROM [core].[program] WHERE id = @program_id;
IF @src_cur IS NULL SET @src_cur = (SELECT TOP 1 currency_id FROM [cp].[facts] WHERE program_id = @program_id AND currency_id IS NOT NULL);
IF @src_cur IS NULL SET @src_cur = (SELECT TOP 1 id FROM [core].[currency] ORDER BY id);

-- Target currency = una diversa dalla source
SELECT TOP 1 @tgt_cur = id FROM [core].[currency] WHERE id <> @src_cur ORDER BY id;

PRINT '[totals] Using program_id=' + CAST(@program_id AS VARCHAR(20))
    + ' year=' + CAST(@year_num AS VARCHAR(20))
    + ' src_cur=' + CAST(@src_cur AS VARCHAR(20))
    + ' tgt_cur=' + ISNULL(CAST(@tgt_cur AS VARCHAR(20)), 'NULL');

-- =============================================================================
-- A. cp.sp_load_power_edit raw (target_currency_id=NULL → fast path su facts_pivot)
-- =============================================================================
-- SUM(pl_m1..pl_m12) per tutte le righe leaf = SUM(planned) in cp.facts
-- per (program_id, year). Test che il pivot non perde dati.

-- Tabella temp per catturare l'output dello SP
IF OBJECT_ID(N'tempdb..#pe_raw') IS NOT NULL DROP TABLE #pe_raw;
CREATE TABLE #pe_raw (
    id BIGINT, program_id INT, year_num INT, tree_kind_id TINYINT, xbs_node_id BIGINT,
    xbs_path_str NVARCHAR(4000), xbs_depth SMALLINT, xbs_code NVARCHAR(80), xbs_name NVARCHAR(255),
    parent_node_id BIGINT, is_leaf BIT,
    pl_m1 DECIMAL(19,4), pl_m2 DECIMAL(19,4), pl_m3 DECIMAL(19,4), pl_m4 DECIMAL(19,4),
    pl_m5 DECIMAL(19,4), pl_m6 DECIMAL(19,4), pl_m7 DECIMAL(19,4), pl_m8 DECIMAL(19,4),
    pl_m9 DECIMAL(19,4), pl_m10 DECIMAL(19,4), pl_m11 DECIMAL(19,4), pl_m12 DECIMAL(19,4),
    ac_m1 DECIMAL(19,4), ac_m2 DECIMAL(19,4), ac_m3 DECIMAL(19,4), ac_m4 DECIMAL(19,4),
    ac_m5 DECIMAL(19,4), ac_m6 DECIMAL(19,4), ac_m7 DECIMAL(19,4), ac_m8 DECIMAL(19,4),
    ac_m9 DECIMAL(19,4), ac_m10 DECIMAL(19,4), ac_m11 DECIMAL(19,4), ac_m12 DECIMAL(19,4),
    fc_m1 DECIMAL(19,4), fc_m2 DECIMAL(19,4), fc_m3 DECIMAL(19,4), fc_m4 DECIMAL(19,4),
    fc_m5 DECIMAL(19,4), fc_m6 DECIMAL(19,4), fc_m7 DECIMAL(19,4), fc_m8 DECIMAL(19,4),
    fc_m9 DECIMAL(19,4), fc_m10 DECIMAL(19,4), fc_m11 DECIMAL(19,4), fc_m12 DECIMAL(19,4),
    bl_m1 DECIMAL(19,4), bl_m2 DECIMAL(19,4), bl_m3 DECIMAL(19,4), bl_m4 DECIMAL(19,4),
    bl_m5 DECIMAL(19,4), bl_m6 DECIMAL(19,4), bl_m7 DECIMAL(19,4), bl_m8 DECIMAL(19,4),
    bl_m9 DECIMAL(19,4), bl_m10 DECIMAL(19,4), bl_m11 DECIMAL(19,4), bl_m12 DECIMAL(19,4),
    last_rebuild_utc DATETIME2(3), project_scenario_id INT, target_currency_id INT
);

INSERT INTO #pe_raw
EXEC [cp].[sp_load_power_edit] @program_id = @program_id, @year_num = @year_num;

DECLARE @pe_row_count BIGINT = (SELECT COUNT(*) FROM #pe_raw);
DECLARE @pivot_row_count BIGINT = (SELECT COUNT(*) FROM [cp].[facts_pivot] WHERE program_id = @program_id AND year_num = @year_num);

EXEC [tt].[assert_equal] @run_id=@tr, @category='totals',
     @test_name=N'sp_load_power_edit: row count matches facts_pivot for (program, year)',
     @expected=@pivot_row_count, @actual=@pe_row_count;

-- A.2 SUM(pl_*) su leaf rows == SUM(planned) in cp.facts (filtered by program, year)
DECLARE @sum_pl_pe DECIMAL(38,4) = (
    SELECT ISNULL(SUM(
        ISNULL(pl_m1,0)+ISNULL(pl_m2,0)+ISNULL(pl_m3,0)+ISNULL(pl_m4,0)+
        ISNULL(pl_m5,0)+ISNULL(pl_m6,0)+ISNULL(pl_m7,0)+ISNULL(pl_m8,0)+
        ISNULL(pl_m9,0)+ISNULL(pl_m10,0)+ISNULL(pl_m11,0)+ISNULL(pl_m12,0)
    ), 0)
    FROM #pe_raw WHERE is_leaf = 1
);
-- Filtra facts a quelle che mappano effettivamente a una leaf in facts_pivot.
-- (Facts su parent nodes o xbs_node_id NULL non sono inclusi nelle leaves.)
DECLARE @sum_pl_facts DECIMAL(38,4) = (
    SELECT ISNULL(SUM(f.planned), 0)
      FROM [cp].[facts] f
      INNER JOIN #pe_raw p ON p.xbs_node_id = f.xbs_node_id AND p.is_leaf = 1
     WHERE f.program_id = @program_id
       AND f.time_month_id / 100 = @year_num
       AND ISNULL(f.cancellato, 0) = 0
);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
     @test_name=N'sp_load_power_edit: SUM(pl on leaves) = SUM(facts.planned) [leaf-mapped only]',
     @expected=@sum_pl_facts, @actual=@sum_pl_pe, @tolerance=0.05;

-- A.3 SUM(ac_*) su leaf rows == SUM(actual) in cp.facts
DECLARE @sum_ac_pe DECIMAL(38,4) = (
    SELECT ISNULL(SUM(
        ISNULL(ac_m1,0)+ISNULL(ac_m2,0)+ISNULL(ac_m3,0)+ISNULL(ac_m4,0)+
        ISNULL(ac_m5,0)+ISNULL(ac_m6,0)+ISNULL(ac_m7,0)+ISNULL(ac_m8,0)+
        ISNULL(ac_m9,0)+ISNULL(ac_m10,0)+ISNULL(ac_m11,0)+ISNULL(ac_m12,0)
    ), 0)
    FROM #pe_raw WHERE is_leaf = 1
);
DECLARE @sum_ac_facts DECIMAL(38,4) = (
    SELECT ISNULL(SUM(f.actual), 0)
      FROM [cp].[facts] f
      INNER JOIN #pe_raw p ON p.xbs_node_id = f.xbs_node_id AND p.is_leaf = 1
     WHERE f.program_id = @program_id
       AND f.time_month_id / 100 = @year_num
       AND ISNULL(f.cancellato, 0) = 0
);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
     @test_name=N'sp_load_power_edit: SUM(ac on leaves) = SUM(facts.actual) [leaf-mapped only]',
     @expected=@sum_ac_facts, @actual=@sum_ac_pe, @tolerance=0.05;

-- =============================================================================
-- B. sp_load_power_edit con @target_currency_id = source → identity
-- =============================================================================
IF @src_cur IS NOT NULL
BEGIN
    IF OBJECT_ID(N'tempdb..#pe_same') IS NOT NULL DROP TABLE #pe_same;
    SELECT * INTO #pe_same FROM #pe_raw WHERE 1 = 0;

    BEGIN TRY
        INSERT INTO #pe_same
        EXEC [cp].[sp_load_power_edit]
            @program_id = @program_id,
            @year_num = @year_num,
            @target_currency_id = @src_cur;

        DECLARE @sum_pl_same DECIMAL(38,4) = (
            SELECT ISNULL(SUM(
                ISNULL(pl_m1,0)+ISNULL(pl_m2,0)+ISNULL(pl_m3,0)+ISNULL(pl_m4,0)+
                ISNULL(pl_m5,0)+ISNULL(pl_m6,0)+ISNULL(pl_m7,0)+ISNULL(pl_m8,0)+
                ISNULL(pl_m9,0)+ISNULL(pl_m10,0)+ISNULL(pl_m11,0)+ISNULL(pl_m12,0)
            ), 0)
            FROM #pe_same WHERE is_leaf = 1
        );
        EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
             @test_name=N'sp_load_power_edit @target=source: SUM(pl) identity vs raw',
             @expected=@sum_pl_pe, @actual=@sum_pl_same, @tolerance=0.05;
    END TRY
    BEGIN CATCH
        INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, message)
        VALUES (@tr, 'totals', N'sp_load_power_edit @target=source identity', 'fail',
                CONCAT('Unexpected error: ', ERROR_MESSAGE()));
    END CATCH;
END

-- =============================================================================
-- C. sp_load_power_edit con @target_currency_id missing-rate → RAISERROR (W0.3=a)
-- =============================================================================
DECLARE @raise_err NVARCHAR(400) = NULL;
DECLARE @bogus_currency INT = 99999;       -- non esistente in core.currency
BEGIN TRY
    IF OBJECT_ID(N'tempdb..#pe_bad') IS NOT NULL DROP TABLE #pe_bad;
    SELECT * INTO #pe_bad FROM #pe_raw WHERE 1 = 0;
    INSERT INTO #pe_bad
    EXEC [cp].[sp_load_power_edit]
        @program_id = @program_id, @year_num = @year_num,
        @target_currency_id = @bogus_currency;
END TRY
BEGIN CATCH
    SET @raise_err = ERROR_MESSAGE();
END CATCH;
DECLARE @did_raise BIGINT = CASE WHEN @raise_err LIKE 'Missing exchange rate%' THEN 1 ELSE 0 END;
EXEC [tt].[assert_equal] @run_id=@tr, @category='totals',
     @test_name=N'sp_load_power_edit @target=bogus_currency: RAISERROR strict (W0.3=a)',
     @expected=1, @actual=@did_raise;

-- =============================================================================
-- D. rep.sp_run_summary_cost_cc (cross-currency JSON output)
-- =============================================================================
DECLARE @params NVARCHAR(MAX);
DECLARE @json   NVARCHAR(MAX);
DECLARE @rows   INT;

SET @params = CONCAT(N'{"program_id":', @program_id,
                     N',"year_from":', @year_num,
                     N',"year_to":',   @year_num,
                     N',"target_currency_id":', @src_cur, N'}');

BEGIN TRY
    EXEC [rep].[sp_run_summary_cost_cc]
        @params_json = @params,
        @execution_id = 0,
        @result_json = @json OUTPUT,
        @result_row_count = @rows OUTPUT;

    DECLARE @json_planned DECIMAL(38,4) = TRY_CAST(JSON_VALUE(@json, '$.totals.total_planned_target') AS DECIMAL(38,4));
    DECLARE @json_actual  DECIMAL(38,4) = TRY_CAST(JSON_VALUE(@json, '$.totals.total_actual_target')  AS DECIMAL(38,4));
    DECLARE @json_rows    BIGINT        = TRY_CAST(JSON_VALUE(@json, '$.totals.rows_count')           AS BIGINT);

    -- L'SP usa ISNULL(converted,0): facts senza rate matching contano come 0.
    -- target=src ⇒ rate=1 SE f.currency_id = src (case @from=@to), altrimenti
    --              richiede rate cross-currency che potrebbe non esistere → 0.
    -- Expected = SUM(planned) per facts in (program, year) DOVE f.currency_id = @src_cur.
    -- (Per facts senza rate disponibile l'SP ritorna 0, quindi exclude.)
    DECLARE @sum_pl_in_src_cur DECIMAL(38,4) = (
        SELECT ISNULL(SUM(f.planned), 0)
          FROM [cp].[facts] f
         WHERE f.program_id = @program_id
           AND f.time_month_id / 100 = @year_num
           AND f.currency_id = @src_cur
           AND ISNULL(f.cancellato, 0) = 0
    );
    DECLARE @sum_ac_in_src_cur DECIMAL(38,4) = (
        SELECT ISNULL(SUM(f.actual), 0)
          FROM [cp].[facts] f
         WHERE f.program_id = @program_id
           AND f.time_month_id / 100 = @year_num
           AND f.currency_id = @src_cur
           AND ISNULL(f.cancellato, 0) = 0
    );
    EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
         @test_name=N'sp_run_summary_cost_cc: total_planned_target (same cur) = SUM(facts.planned WHERE cur=src)',
         @expected=@sum_pl_in_src_cur, @actual=@json_planned, @tolerance=0.05;
    EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
         @test_name=N'sp_run_summary_cost_cc: total_actual_target (same cur) = SUM(facts.actual WHERE cur=src)',
         @expected=@sum_ac_in_src_cur, @actual=@json_actual, @tolerance=0.05;

    -- rows_count = count(facts in range)
    DECLARE @facts_rows BIGINT = (
        SELECT COUNT(*) FROM [cp].[facts]
         WHERE program_id = @program_id
           AND time_month_id / 100 = @year_num
           AND ISNULL(cancellato, 0) = 0
    );
    EXEC [tt].[assert_equal] @run_id=@tr, @category='totals',
         @test_name=N'sp_run_summary_cost_cc: rows_count matches facts count',
         @expected=@facts_rows, @actual=@json_rows;
END TRY
BEGIN CATCH
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, message)
    VALUES (@tr, 'totals', N'sp_run_summary_cost_cc execution', 'fail',
            CONCAT('Error: ', ERROR_MESSAGE()));
END CATCH;

-- =============================================================================
-- E. cp.fn_facts_in_currency: cross-currency reporting view
-- =============================================================================
-- Identity ristretta: target = source → planned_target ≈ planned solo per facts
-- con currency_id = @src_cur (le altre devono convertire, rate potrebbe mancare).
IF @src_cur IS NOT NULL
BEGIN
    DECLARE @vw_sum_identity DECIMAL(38,4) = (
        SELECT ISNULL(SUM(v.planned_target), 0)
          FROM [cp].[fn_facts_in_currency](@src_cur, '2026-06-01') v
         WHERE v.program_id = @program_id
           AND v.time_month_id / 100 = @year_num
           AND v.source_currency_id = @src_cur
    );
    DECLARE @facts_pl_src_cur DECIMAL(38,4) = (
        SELECT ISNULL(SUM(f.planned), 0)
          FROM [cp].[facts] f
         WHERE f.program_id = @program_id
           AND f.time_month_id / 100 = @year_num
           AND f.currency_id = @src_cur
           AND ISNULL(f.cancellato, 0) = 0
    );
    EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='totals',
         @test_name=N'fn_facts_in_currency @target=source AND f.currency=source: identity SUM(planned)',
         @expected=@facts_pl_src_cur, @actual=@vw_sum_identity, @tolerance=0.05;
END

-- =============================================================================
-- Cleanup
-- =============================================================================
IF OBJECT_ID(N'tempdb..#pe_raw') IS NOT NULL DROP TABLE #pe_raw;
IF OBJECT_ID(N'tempdb..#pe_same') IS NOT NULL DROP TABLE #pe_same;
IF OBJECT_ID(N'tempdb..#pe_bad') IS NOT NULL DROP TABLE #pe_bad;

PRINT '[tt-calculations-totals] all asserts executed for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
