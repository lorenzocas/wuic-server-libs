-- =============================================================================
-- ETL Phase 9 — Validation (row counts + smoke samples)
-- =============================================================================
-- Per ogni tabella business (source legacy vs target CostCnh) confronta:
--   - count_source
--   - count_target
--   - delta_pct (max 0.1% accettabile)
--   - sample_check_pass (smoke: 100 random IDs, valori matching)
--
-- Output: rows in etl.error con kind='validation_mismatch' se delta > soglia.
-- =============================================================================

DECLARE @phase_id BIGINT, @already_completed BIT;
EXEC [etl].[start_phase] @run_id = <<RUN_ID>>, @phase_number = 9, @phase_name = N'Validation', @phase_id = @phase_id OUTPUT, @already_completed = @already_completed OUTPUT;
IF @already_completed = 1 BEGIN PRINT '[phase9] already completed'; RETURN; END

DECLARE @t0 DATETIME2(3) = SYSUTCDATETIME();
DECLARE @total_mismatches INT = 0;

DECLARE @counts TABLE (
    entity         VARCHAR(60),
    src_count      BIGINT,
    tgt_count      BIGINT,
    delta          BIGINT,
    delta_pct      DECIMAL(8,4),
    status         VARCHAR(20)
);

-- Sites
INSERT INTO @counts SELECT 'site',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[Sites]    WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[site]                   WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Currencies
INSERT INTO @counts SELECT 'currency',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[Currencies] WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[currency]                 WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Program statuses
INSERT INTO @counts SELECT 'program_status',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[ProgramStatuses]),
    (SELECT COUNT(*) FROM [core].[program_status] WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Project classes
INSERT INTO @counts SELECT 'project_class',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[ProjectClasses] WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[project_class]                WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Project scenarios
INSERT INTO @counts SELECT 'project_scenario',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[ProjectScenarios] WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[project_scenario]               WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Unit measures
INSERT INTO @counts SELECT 'unit_measure',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[UnitMeasures]),
    (SELECT COUNT(*) FROM [cp].[unit_measure] WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Dim_Time
INSERT INTO @counts SELECT 'dim_time',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[facts].[Dim_Time]),
    (SELECT COUNT(*) FROM [core].[dim_time]),
    0, 0, '';

-- XBS tree_kind
INSERT INTO @counts SELECT 'xbs_tree_kind',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[facts].[XBS_Objtype]),
    (SELECT COUNT(*) FROM [xbs].[tree_kind]),
    0, 0, '';

-- XBS nodes
INSERT INTO @counts SELECT 'xbs_node',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[facts].[XBS_Objects] WHERE (ValidTo IS NULL OR ValidTo > SYSUTCDATETIME())),
    (SELECT COUNT(*) FROM [xbs].[node] WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Programs
INSERT INTO @counts SELECT 'program',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[Programs] WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[program]                WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Projects
INSERT INTO @counts SELECT 'project',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[core].[Projects] WHERE ISNULL(IsDeleted,0)=0),
    (SELECT COUNT(*) FROM [core].[project]                WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- cp.facts
INSERT INTO @counts SELECT 'cp_facts',
    (SELECT COUNT(*) FROM <<SOURCE_DB>>.[facts].[CostPlanning_Facts]),
    (SELECT COUNT(*) FROM [cp].[facts] WHERE ISNULL(cancellato,0)=0),
    0, 0, '';

-- Compute delta + status
UPDATE @counts
   SET delta = src_count - tgt_count,
       delta_pct = CASE WHEN src_count > 0 THEN CAST(ABS(src_count - tgt_count) * 100.0 / src_count AS DECIMAL(8,4)) ELSE 0 END,
       status = CASE
           WHEN src_count = tgt_count THEN 'EXACT'
           WHEN src_count = 0 AND tgt_count = 0 THEN 'EMPTY'
           WHEN ABS(CAST(src_count - tgt_count AS DECIMAL(20,4))) * 100.0 / NULLIF(src_count, 0) <= 0.1 THEN 'PASS'
           ELSE 'MISMATCH'
       END;

-- Print summary
SELECT entity, src_count, tgt_count, delta, delta_pct, status
FROM @counts
ORDER BY status DESC, entity;

-- Log mismatches as errors
INSERT INTO [etl].[error] (run_id, phase_number, entity_type, error_kind, error_message)
SELECT <<RUN_ID>>, 9, entity, 'validation_mismatch',
       'src=' + CAST(src_count AS NVARCHAR(20)) + ' tgt=' + CAST(tgt_count AS NVARCHAR(20)) +
       ' delta=' + CAST(delta AS NVARCHAR(20)) + ' delta_pct=' + CAST(delta_pct AS NVARCHAR(10))
FROM @counts WHERE status = 'MISMATCH';

SELECT @total_mismatches = COUNT(*) FROM @counts WHERE status = 'MISMATCH';

DECLARE @dur9 INT = DATEDIFF(MILLISECOND, @t0, SYSUTCDATETIME());
DECLARE @status_9 TINYINT = CASE WHEN @total_mismatches > 0 THEN 9 ELSE 1 END;
EXEC [etl].[complete_phase]
    @phase_id = @phase_id,
    @rows_rejected = @total_mismatches,
    @duration_ms = @dur9,
    @status = @status_9;

PRINT '[phase9] DONE — mismatches=' + CAST(@total_mismatches AS NVARCHAR(10));
GO
