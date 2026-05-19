-- =============================================================================
-- E2E Test — Side-by-side comparison legacy vs new
-- =============================================================================
-- Per ogni (program_legacy_guid, year, measure), confronta:
--   SUM(measure) nel source DB legacy (filtrato a programs migrati)
-- vs SUM(measure) nel target CostCnh_Data (filtrato a (program, time_month_id)
--   coppie che derivano effettivamente da source via guid_map).
--
-- 3 misure controllate: planned, actual, balance (mapping diretto ETL phase 4).
-- (committed: NULL in source legacy → escluso; reserved/forecast_*: EAV non migrato yet.)
-- Placeholders:
--   <<TEST_RUN_ID>>   — BIGINT
--   <<SOURCE_DB>>     — es. [Cost_Offhighway_Test_Mock]
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;

-- ─── Materializza migrated (program_legacy_guid → program_id, year) ──────────
DECLARE @mig TABLE (
    program_id INT NOT NULL,
    legacy_guid UNIQUEIDENTIFIER NOT NULL,
    year_num INT NOT NULL,
    src_planned   DECIMAL(38,4) NULL,
    src_actual    DECIMAL(38,4) NULL,
    src_balance   DECIMAL(38,4) NULL,
    src_count     BIGINT NULL,
    tgt_planned   DECIMAL(38,4) NULL,
    tgt_actual    DECIMAL(38,4) NULL,
    tgt_balance   DECIMAL(38,4) NULL,
    tgt_count     BIGINT NULL,
    PRIMARY KEY (program_id, year_num)
);

-- SOURCE side: SUM per (legacy_guid, year) di facts in CostPlanning_Facts
INSERT INTO @mig (program_id, legacy_guid, year_num, src_planned, src_actual, src_balance, src_count)
SELECT m.new_id, m.legacy_guid, cf.[Id_Time_Month] / 100 AS year_num,
       SUM(CAST(cf.[planned]              AS DECIMAL(38,4))),
       SUM(CAST(cf.[actual]               AS DECIMAL(38,4))),
       SUM(CAST(ISNULL(cf.[balance], 0)   AS DECIMAL(38,4))),
       COUNT(*)
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program]
 GROUP BY m.new_id, m.legacy_guid, cf.[Id_Time_Month] / 100;

-- TARGET side: SUM su facts filtrato a (program, time_month_id) coppie che corrispondono
-- a source per il guid_map dato. Esclude eventuali seed extra (perf, baseline cloning).
;WITH migrated_keys AS (
    SELECT DISTINCT m.new_id AS program_id, cf.[Id_Time_Month] AS time_month_id
      FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
      INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program]
)
UPDATE m SET
    tgt_planned = t.tgt_planned,
    tgt_actual  = t.tgt_actual,
    tgt_balance = t.tgt_balance,
    tgt_count   = t.tgt_count
  FROM @mig m
  CROSS APPLY (
      SELECT SUM(f.planned)            AS tgt_planned,
             SUM(f.actual)             AS tgt_actual,
             SUM(ISNULL(f.balance, 0)) AS tgt_balance,
             COUNT(*)                  AS tgt_count
        FROM [cp].[facts] f
        INNER JOIN migrated_keys k ON k.program_id = f.program_id AND k.time_month_id = f.time_month_id
       WHERE f.program_id = m.program_id
         AND f.time_month_id / 100 = m.year_num
  ) t;

-- ─── Test A — Total migrated programs counted ────────────────────────────────
DECLARE @cnt BIGINT = (SELECT COUNT(*) FROM @mig);
EXEC [tt].[assert_nonzero] @run_id=@tr, @category='side-by-side',
     @test_name=N'side-by-side: at least one (program, year) bucket compared',
     @actual=@cnt;

-- ─── Test B — Per-(program, year) row-count match ────────────────────────────
DECLARE @rowcount_mismatches BIGINT = (
    SELECT COUNT(*) FROM @mig
     WHERE ISNULL(src_count, 0) <> ISNULL(tgt_count, 0)
);
EXEC [tt].[assert_zero] @run_id=@tr, @category='side-by-side',
     @test_name=N'per (program, year): source row_count = target row_count',
     @actual=@rowcount_mismatches;

-- ─── Test C — Per-(program, year) planned SUM match ──────────────────────────
DECLARE @planned_delta_count BIGINT = (
    SELECT COUNT(*) FROM @mig
     WHERE ABS(ISNULL(src_planned, 0) - ISNULL(tgt_planned, 0)) > 0.05
);
EXEC [tt].[assert_zero] @run_id=@tr, @category='side-by-side',
     @test_name=N'per (program, year): |SUM(src.planned) - SUM(tgt.planned)| ≤ 0.05',
     @actual=@planned_delta_count;

-- ─── Test D — Per-(program, year) actual SUM match ───────────────────────────
DECLARE @actual_delta_count BIGINT = (
    SELECT COUNT(*) FROM @mig
     WHERE ABS(ISNULL(src_actual, 0) - ISNULL(tgt_actual, 0)) > 0.05
);
EXEC [tt].[assert_zero] @run_id=@tr, @category='side-by-side',
     @test_name=N'per (program, year): |SUM(src.actual) - SUM(tgt.actual)| ≤ 0.05',
     @actual=@actual_delta_count;

-- ─── Test E — Per-(program, year) balance SUM match ──────────────────────────
DECLARE @balance_delta_count BIGINT = (
    SELECT COUNT(*) FROM @mig
     WHERE ABS(ISNULL(src_balance, 0) - ISNULL(tgt_balance, 0)) > 0.05
);
EXEC [tt].[assert_zero] @run_id=@tr, @category='side-by-side',
     @test_name=N'per (program, year): |SUM(src.balance) - SUM(tgt.balance)| ≤ 0.05',
     @actual=@balance_delta_count;

-- ─── Test F — Grand-total planned (source vs target) ─────────────────────────
DECLARE @grand_src_pl DECIMAL(38,4) = (SELECT ISNULL(SUM(src_planned), 0) FROM @mig);
DECLARE @grand_tgt_pl DECIMAL(38,4) = (SELECT ISNULL(SUM(tgt_planned), 0) FROM @mig);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='side-by-side',
     @test_name=N'grand-total planned: source = target (all migrated keys)',
     @expected=@grand_src_pl, @actual=@grand_tgt_pl, @tolerance=0.05;

DECLARE @grand_src_ac DECIMAL(38,4) = (SELECT ISNULL(SUM(src_actual), 0) FROM @mig);
DECLARE @grand_tgt_ac DECIMAL(38,4) = (SELECT ISNULL(SUM(tgt_actual), 0) FROM @mig);
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='side-by-side',
     @test_name=N'grand-total actual: source = target (all migrated keys)',
     @expected=@grand_src_ac, @actual=@grand_tgt_ac, @tolerance=0.05;

-- ─── Test G — Per-(program, year, month) breakdown — detailed comparison ─────
-- Cattura mismatches in tt.test_result note se ce ne sono (no assert, solo log)
DECLARE @month_mismatch_count BIGINT;
;WITH src_monthly AS (
    SELECT m.new_id AS program_id, cf.[Id_Time_Month] AS time_month_id,
           SUM(CAST(cf.[planned] AS DECIMAL(38,4))) AS src_pl,
           SUM(CAST(cf.[actual]  AS DECIMAL(38,4))) AS src_ac
      FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
      INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program]
     GROUP BY m.new_id, cf.[Id_Time_Month]
), tgt_monthly AS (
    SELECT f.program_id, f.time_month_id,
           SUM(f.planned) AS tgt_pl,
           SUM(f.actual)  AS tgt_ac
      FROM [cp].[facts] f
     WHERE EXISTS (
        SELECT 1 FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
                 INNER JOIN [etl].[guid_map] m
                         ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program]
         WHERE m.new_id = f.program_id AND cf.[Id_Time_Month] = f.time_month_id
       )
     GROUP BY f.program_id, f.time_month_id
)
SELECT @month_mismatch_count = COUNT(*)
  FROM src_monthly s
  FULL OUTER JOIN tgt_monthly t
    ON s.program_id = t.program_id AND s.time_month_id = t.time_month_id
 WHERE ABS(ISNULL(s.src_pl, 0) - ISNULL(t.tgt_pl, 0)) > 0.05
    OR ABS(ISNULL(s.src_ac, 0) - ISNULL(t.tgt_ac, 0)) > 0.05;

EXEC [tt].[assert_zero] @run_id=@tr, @category='side-by-side',
     @test_name=N'monthly granularity: 0 (program, time_month_id) buckets with planned/actual mismatch',
     @actual=@month_mismatch_count;

-- ─── Test H — Optional: stampa breakdown completo come INFO (per debug) ──────
IF (SELECT @rowcount_mismatches + @planned_delta_count + @actual_delta_count + @balance_delta_count + @month_mismatch_count) > 0
BEGIN
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, expected, actual, message)
    SELECT @tr, 'side-by-side',
           CONCAT(N'BREAKDOWN program_id=', program_id, N' year=', year_num),
           'info', NULL, NULL,
           CONCAT(N'src_count=', src_count, N' tgt_count=', tgt_count,
                  N' src_planned=', src_planned, N' tgt_planned=', tgt_planned,
                  N' src_actual=',  src_actual,  N' tgt_actual=',  tgt_actual,
                  N' src_balance=', src_balance, N' tgt_balance=', tgt_balance)
      FROM @mig
     ORDER BY program_id, year_num;
END

PRINT '[tt-side-by-side] all asserts executed for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
