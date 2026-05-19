-- =============================================================================
-- E2E Test — Consistency: referential integrity + aggregate sanity
-- =============================================================================
-- Placeholders:
--   <<TEST_RUN_ID>>   — BIGINT, tt.test_run.id
--   <<SOURCE_DB>>     — es. [Cost_Offhighway_Test_Mock]
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;
DECLARE @cnt BIGINT;

-- ─── 1. ORPHAN FK CHECKS — target post-ETL deve avere zero orphans ───────────
-- 1.a core.program.site_id orphan
SELECT @cnt = COUNT(*) FROM [core].[program] p
  WHERE p.site_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [core].[site] s WHERE s.id = p.site_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.program.site_id: zero orphans', @actual=@cnt;

-- 1.b core.program.project_class_id orphan
SELECT @cnt = COUNT(*) FROM [core].[program] p
  WHERE p.project_class_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [core].[project_class] pc WHERE pc.id = p.project_class_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.program.project_class_id: zero orphans', @actual=@cnt;

-- 1.c core.project.program_id orphan
SELECT @cnt = COUNT(*) FROM [core].[project] p
  WHERE p.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [core].[program] pr WHERE pr.id = p.program_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.project.program_id: zero orphans', @actual=@cnt;

-- 1.d cp.facts.program_id orphan
SELECT @cnt = COUNT(*) FROM [cp].[facts] f
  WHERE NOT EXISTS (SELECT 1 FROM [core].[program] pr WHERE pr.id = f.program_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'cp.facts.program_id: zero orphans', @actual=@cnt;

-- 1.e cp.facts.xbs_node_id orphan (NULL-friendly: solo non-null devono risolvere)
SELECT @cnt = COUNT(*) FROM [cp].[facts] f
  WHERE f.xbs_node_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM [xbs].[node] xn WHERE xn.id = f.xbs_node_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'cp.facts.xbs_node_id: zero orphans (non-null)', @actual=@cnt;

-- 1.f cp.facts.time_month_id orphan
SELECT @cnt = COUNT(*) FROM [cp].[facts] f
  WHERE NOT EXISTS (SELECT 1 FROM [core].[dim_time] dt WHERE dt.month_id = f.time_month_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'cp.facts.time_month_id: zero orphans', @actual=@cnt;

-- 1.g etl.guid_map / int_map consistency: target IDs devono esistere
SELECT @cnt = COUNT(*) FROM [etl].[guid_map] m
  WHERE m.entity_type = 'program' AND NOT EXISTS (SELECT 1 FROM [core].[program] p WHERE p.id = m.new_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'etl.guid_map program → core.program: zero dangling', @actual=@cnt;

SELECT @cnt = COUNT(*) FROM [etl].[int_map] m
  WHERE m.entity_type = 'site' AND NOT EXISTS (SELECT 1 FROM [core].[site] s WHERE s.id = m.new_id);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'etl.int_map site → core.site: zero dangling', @actual=@cnt;

-- ─── 2. AGGREGATE CONSISTENCY — SUM facts.planned per program match ──────────
-- Per ogni program migrato, somma planned in source DEVE = somma planned in target.
-- Calcola per ogni programma migrato il delta e verifica delta totale = 0.
DECLARE @src_sum DECIMAL(38, 4), @tgt_sum DECIMAL(38, 4);

-- Filtro target: SOLO facts che hanno (program_id, time_month_id) corrispondente
-- a una row in source. Esclude i facts seedati per perf test (Phase H.12) o altri batch.
SELECT @src_sum = ISNULL(SUM(CAST(cf.[planned] AS DECIMAL(38,4))), 0)
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program];

DECLARE @migrated_keys TABLE (program_id INT, time_month_id INT, PRIMARY KEY (program_id, time_month_id));
INSERT INTO @migrated_keys
SELECT DISTINCT m.new_id, cf.[Id_Time_Month]
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program];

SELECT @tgt_sum = ISNULL(SUM(f.planned), 0)
  FROM [cp].[facts] f
  INNER JOIN @migrated_keys k ON k.program_id = f.program_id AND k.time_month_id = f.time_month_id;
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='consistency',
     @test_name=N'cp.facts.planned: SUM source = SUM target (only migrated keys)',
     @expected=@src_sum, @actual=@tgt_sum, @tolerance=0.01;

SELECT @src_sum = ISNULL(SUM(CAST(cf.[actual] AS DECIMAL(38,4))), 0)
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program];
SELECT @tgt_sum = ISNULL(SUM(f.actual), 0)
  FROM [cp].[facts] f
  INNER JOIN @migrated_keys k ON k.program_id = f.program_id AND k.time_month_id = f.time_month_id;
EXEC [tt].[assert_decimal_close] @run_id=@tr, @category='consistency',
     @test_name=N'cp.facts.actual: SUM source = SUM target (only migrated keys)',
     @expected=@src_sum, @actual=@tgt_sum, @tolerance=0.01;

-- ─── 3. DUPLICATES CHECK — natural keys non duplicati ──────────────────────
SELECT @cnt = (SELECT COUNT(*) FROM (SELECT code, COUNT(*) AS c FROM [core].[site] WHERE ISNULL(cancellato, 0) = 0 GROUP BY code HAVING COUNT(*) > 1) d);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.site.code: no duplicates', @actual=@cnt;

SELECT @cnt = (SELECT COUNT(*) FROM (SELECT code, COUNT(*) AS c FROM [core].[currency] WHERE ISNULL(cancellato, 0) = 0 GROUP BY code HAVING COUNT(*) > 1) d);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.currency.code: no duplicates', @actual=@cnt;

SELECT @cnt = (SELECT COUNT(*) FROM (SELECT code, COUNT(*) AS c FROM [core].[program] WHERE ISNULL(cancellato, 0) = 0 GROUP BY code HAVING COUNT(*) > 1) d);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.program.code: no duplicates', @actual=@cnt;

SELECT @cnt = (SELECT COUNT(*) FROM (SELECT entity_type, legacy_id, COUNT(*) AS c FROM [etl].[int_map] GROUP BY entity_type, legacy_id HAVING COUNT(*) > 1) d);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'etl.int_map: no duplicate mappings per entity_type', @actual=@cnt;

SELECT @cnt = (SELECT COUNT(*) FROM (SELECT entity_type, legacy_guid, COUNT(*) AS c FROM [etl].[guid_map] GROUP BY entity_type, legacy_guid HAVING COUNT(*) > 1) d);
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'etl.guid_map: no duplicate mappings per entity_type', @actual=@cnt;

-- ─── 4. NULL-IN-NOT-NULL fields ──────────────────────────────────────────────
-- Es. core.site.code dovrebbe essere mai NULL (constraint)
SELECT @cnt = COUNT(*) FROM [core].[site] WHERE code IS NULL OR LTRIM(RTRIM(code)) = '';
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.site.code: not null/empty', @actual=@cnt;

SELECT @cnt = COUNT(*) FROM [core].[program] WHERE code IS NULL OR LTRIM(RTRIM(code)) = '';
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'core.program.code: not null/empty', @actual=@cnt;

SELECT @cnt = COUNT(*) FROM [cp].[facts] WHERE time_month_id IS NULL OR program_id IS NULL;
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'cp.facts: time_month_id & program_id not null', @actual=@cnt;

-- ─── 5. ETL PHASE STATUS ─────────────────────────────────────────────────────
SELECT @cnt = COUNT(*) FROM [etl].[run_phase] rp
  INNER JOIN [tt].[test_run] tr ON tr.id = @tr
  WHERE rp.run_id = tr.etl_run_id AND rp.status <> 1;     -- 1 = completed
EXEC [tt].[assert_zero] @run_id=@tr, @category='consistency', @test_name=N'etl.run_phase: all phases status=completed for this run', @actual=@cnt;

PRINT '[tt-consistency] all asserts executed for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
