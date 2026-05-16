-- =============================================================================
-- CostCnh — Audit consolidation verification (run su CostCnh_Data)
-- =============================================================================
-- Verifica che le 5 categorie di log legacy abbiano un equivalente nel nuovo
-- design (NIENTE *_Log scattered, tutto consolidato).
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

-- ── 1. CHECK: nessun *_Log legacy table residuo ─────────────────────────────
DECLARE @legacy_count INT;
SELECT @legacy_count = COUNT(*)
FROM sys.tables
WHERE name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs');

IF @legacy_count > 0
BEGIN
    PRINT '[FAIL] Trovate ' + CAST(@legacy_count AS NVARCHAR(10)) + ' tabelle *_Log legacy in CostCnh_Data!';
    SELECT 'LEGACY_RESIDUE' AS status, name FROM sys.tables WHERE name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs');
END
ELSE
    PRINT '[OK] Nessun *_Log legacy residuo (greenfield consolidation completa)';
GO

-- ── 2. CHECK: audit.access_log scaffolded + partitioned + indexed ───────────
PRINT '';
PRINT '── audit.access_log structure ──';
SELECT
    'access_log_partitioning' AS check_name,
    pf.name                   AS partition_function,
    (SELECT COUNT(*) FROM sys.partition_range_values WHERE function_id = pf.function_id) AS partition_boundaries,
    (SELECT name FROM sys.partition_schemes WHERE function_id = pf.function_id) AS partition_scheme
FROM sys.indexes i
INNER JOIN sys.partition_schemes ps ON ps.data_space_id = i.data_space_id
INNER JOIN sys.partition_functions pf ON pf.function_id = ps.function_id
WHERE i.object_id = OBJECT_ID('audit.access_log') AND i.index_id = 1;
GO

SELECT
    name AS index_name,
    is_primary_key, is_unique,
    filter_definition
FROM sys.indexes
WHERE object_id = OBJECT_ID('audit.access_log') AND name IS NOT NULL
ORDER BY index_id;
GO

-- ── 3. Check Mapping coverage legacy → new ──────────────────────────────────
PRINT '';
PRINT '── Legacy → New mapping coverage ──';
;WITH mapping AS (
    SELECT 'facts.CostPlanning_Facts_Log'  AS legacy_table,
           'cp.spreadsheet_change_log + audit.access_log' AS new_target,
           CASE WHEN OBJECT_ID('cp.spreadsheet_change_log') IS NOT NULL AND OBJECT_ID('audit.access_log') IS NOT NULL THEN 'OK' ELSE 'MISSING' END AS status
    UNION ALL
    SELECT 'core.ForecastCutoffLogs',  'audit.access_log (entity=fc.forecast_cutoff)',
           CASE WHEN OBJECT_ID('audit.access_log') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
    UNION ALL
    SELECT 'core.ConversionConsolidateLog', 'audit.access_log + audit.outbox (event_kind=program_consolidation)',
           CASE WHEN OBJECT_ID('audit.access_log') IS NOT NULL AND OBJECT_ID('audit.outbox') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
    UNION ALL
    SELECT 'facts.AddinBulkOperationLog', 'uploads.processing_log + uploads.batch',
           CASE WHEN OBJECT_ID('uploads.processing_log') IS NOT NULL AND OBJECT_ID('uploads.batch') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
    UNION ALL
    SELECT 'core.MACRequestsLogs', 'integrations.message_envelope (system=mac) + mac.request + mac.response',
           CASE WHEN OBJECT_ID('integrations.message_envelope') IS NOT NULL AND OBJECT_ID('mac.request') IS NOT NULL AND OBJECT_ID('mac.response') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
)
SELECT * FROM mapping ORDER BY legacy_table;
GO

-- ── 4. Smoke test: insert audit.access_log + verify ─────────────────────────
PRINT '';
PRINT '── Smoke test: insert + read audit.access_log ──';
DECLARE @before_count BIGINT, @after_count BIGINT;
SELECT @before_count = COUNT(*) FROM [audit].[access_log];

INSERT INTO [audit].[access_log] (user_id, app_module, action, entity_schema, entity_name, entity_id, outcome, payload_json)
VALUES (101281, 'audit-consolidation', 'verify_smoke_test', 'audit', 'access_log', 'sprint9.cleanup',
        1, '{"source":"96-audit-consolidation-verify.sql","sprint":"9.cleanup"}');

SELECT @after_count = COUNT(*) FROM [audit].[access_log];

IF (@after_count - @before_count) = 1
    PRINT '[OK] audit.access_log accept INSERT (before=' + CAST(@before_count AS NVARCHAR(20)) + ' after=' + CAST(@after_count AS NVARCHAR(20)) + ')';
ELSE
    PRINT '[FAIL] audit.access_log INSERT FAILED';
GO

-- ── 5. Storage estimates per audit.access_log con retention 24m ────────────
PRINT '';
PRINT '── Storage estimate (rate stimato 1k events/day, 24m retention) ──';
SELECT
    '~1000 rows/day x 730 days' AS scenario,
    '~730,000 rows totale' AS row_count,
    '~140 MB raw + ~50 MB indexes' AS storage_estimate,
    'partitioned mensile (24 active + 24 archive)' AS partitioning;
GO

PRINT '';
PRINT '╔══════════════════════════════════════════════════════════════════════╗';
PRINT '║ Audit consolidation verification: COMPLETE                           ║';
PRINT '║ Tutto si scrive in CostCnh.audit.access_log (centralized) + table    ║';
PRINT '║ specifiche per use-case (spreadsheet/uploads/integrations).          ║';
PRINT '╚══════════════════════════════════════════════════════════════════════╝';
GO
