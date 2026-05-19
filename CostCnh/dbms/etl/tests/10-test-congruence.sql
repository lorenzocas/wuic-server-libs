-- =============================================================================
-- E2E Test — Congruence: source row counts = mapping count = target migrated count
-- =============================================================================
-- Placeholders:
--   <<TEST_RUN_ID>>   — BIGINT, tt.test_run.id
--   <<SOURCE_DB>>     — es. [Cost_Offhighway_Test_Mock]
--
-- Per ogni entity, 3 row count comparisons:
--   1. source row count (filtrato IsDeleted=0)
--   2. etl.int_map / guid_map count per entity_type
--   3. target row count (filtrato created_by_etl)
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;
DECLARE @src_count BIGINT, @map_count BIGINT, @tgt_count BIGINT;

-- ─── core.site ────────────────────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[Sites] WHERE ISNULL([IsDeleted], 0) = 0;
SELECT @map_count = COUNT(*) FROM [etl].[int_map] WHERE entity_type = 'site';
SELECT @tgt_count = COUNT(*) FROM [core].[site] cs
  INNER JOIN [etl].[int_map] m ON m.entity_type = 'site' AND m.new_id = cs.id;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.site: source vs map count',     @expected=@src_count, @actual=@map_count;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.site: map vs target count',     @expected=@map_count, @actual=@tgt_count;

-- ─── core.currency ────────────────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[Currencies] WHERE ISNULL([IsDeleted], 0) = 0;
SELECT @map_count = COUNT(*) FROM [etl].[int_map] WHERE entity_type = 'currency';
SELECT @tgt_count = COUNT(*) FROM [core].[currency] cc
  INNER JOIN [etl].[int_map] m ON m.entity_type = 'currency' AND m.new_id = cc.id;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.currency: source vs map count', @expected=@src_count, @actual=@map_count;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.currency: map vs target count', @expected=@map_count, @actual=@tgt_count;

-- ─── core.program_status ─────────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[ProgramStatuses];
SELECT @map_count = COUNT(*) FROM [etl].[int_map] WHERE entity_type = 'program_status';
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.program_status: source vs map count', @expected=@src_count, @actual=@map_count;

-- ─── core.project_class (GUID PK) ────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[ProjectClasses] WHERE ISNULL([IsDeleted], 0) = 0;
SELECT @map_count = COUNT(*) FROM [etl].[guid_map] WHERE entity_type = 'project_class';
SELECT @tgt_count = COUNT(*) FROM [core].[project_class] cpc
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'project_class' AND m.new_id = cpc.id;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.project_class: source vs map count', @expected=@src_count, @actual=@map_count;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.project_class: map vs target count', @expected=@map_count, @actual=@tgt_count;

-- ─── core.project_scenario (GUID PK) ─────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[ProjectScenarios] WHERE ISNULL([IsDeleted], 0) = 0;
SELECT @map_count = COUNT(*) FROM [etl].[guid_map] WHERE entity_type = 'project_scenario';
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.project_scenario: source vs map count', @expected=@src_count, @actual=@map_count;

-- ─── cp.unit_measure ─────────────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[UnitMeasures];
SELECT @map_count = COUNT(*) FROM [etl].[int_map] WHERE entity_type = 'unit_measure';
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'cp.unit_measure: source vs map count', @expected=@src_count, @actual=@map_count;

-- ─── xbs.node (GUID PK) ───────────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[facts].[XBS_Objects];
SELECT @map_count = COUNT(*) FROM [etl].[guid_map] WHERE entity_type = 'xbs_node';
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'xbs.node: source vs map count', @expected=@src_count, @actual=@map_count;

-- ─── core.program (GUID PK) ──────────────────────────────────────────────────
-- Per ogni source program, deve esistere in guid_map (oppure essere in etl.error con fk_unmapped per questo run).
-- Test: count source programs NOT IN guid_map e NOT IN etl.error per questo run = 0
DECLARE @etl_run BIGINT = (SELECT etl_run_id FROM [tt].[test_run] WHERE id = @tr);
DECLARE @unaccounted BIGINT;
SELECT @unaccounted = COUNT(*) FROM <<SOURCE_DB>>.[core].[Programs] src
  WHERE NOT EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'program' AND m.legacy_guid = src.[Id])
    AND NOT EXISTS (SELECT 1 FROM [etl].[error] e
                     WHERE e.entity_type = 'program' AND e.error_kind = 'fk_unmapped'
                       AND e.legacy_id = CAST(src.[Id] AS NVARCHAR(100)));
EXEC [tt].[assert_zero] @run_id=@tr, @category='congruence',
     @test_name=N'core.program: every source program is mapped OR has error log',
     @actual=@unaccounted;

-- ─── core.project (GUID PK) ──────────────────────────────────────────────────
SELECT @src_count = COUNT(*) FROM <<SOURCE_DB>>.[core].[Projects];
SELECT @map_count = COUNT(*) FROM [etl].[guid_map] WHERE entity_type = 'project';
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence', @test_name=N'core.project: source vs map count', @expected=@src_count, @actual=@map_count;

-- ─── cp.facts ────────────────────────────────────────────────────────────────
-- Target ha facts legacy migrati + seed perf (Phase H.12) per stesso program_id.
-- Filtro target SOLO su (program_id, time_month_id) coppie che esistono in source per mapped programs.
SELECT @src_count = COUNT(*)
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  WHERE EXISTS (SELECT 1 FROM [etl].[guid_map] m WHERE m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program]);

DECLARE @migrated_keys_c TABLE (program_id INT, time_month_id INT, PRIMARY KEY (program_id, time_month_id));
INSERT INTO @migrated_keys_c
SELECT DISTINCT m.new_id, cf.[Id_Time_Month]
  FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts] cf
  INNER JOIN [etl].[guid_map] m ON m.entity_type = 'program' AND m.legacy_guid = cf.[Id_Program];

SELECT @tgt_count = COUNT(*) FROM [cp].[facts] f
  INNER JOIN @migrated_keys_c k ON k.program_id = f.program_id AND k.time_month_id = f.time_month_id;
EXEC [tt].[assert_equal] @run_id=@tr, @category='congruence',
     @test_name=N'cp.facts: source-with-mapped-program vs migrated count (key-filtered)',
     @expected=@src_count, @actual=@tgt_count;

PRINT '[tt-congruence] all asserts executed for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
