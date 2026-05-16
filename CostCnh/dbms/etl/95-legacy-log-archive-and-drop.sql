-- =============================================================================
-- ETL Sprint 9 — Legacy *_Log archive + DROP (eseguire su SOURCE DB post-cutover)
-- =============================================================================
-- 5 tabelle log scattered nel legacy → consolidate in CostCnh.audit.access_log
-- (single append-only partitioned table) + cp.spreadsheet_change_log +
-- uploads.processing_log + integrations.message_envelope.
--
-- LEGACY → NEW mapping:
--   facts.CostPlanning_Facts_Log    → cp.spreadsheet_change_log (PowerEdit edits)
--                                   + audit.access_log (general entity audit)
--   core.ForecastCutoffLogs         → audit.access_log (entity=fc.forecast_cutoff)
--   core.ConversionConsolidateLog   → audit.access_log (entity=cp.facts, action=consolidate)
--   facts.AddinBulkOperationLog     → uploads.processing_log + cp.spreadsheet_change_log
--   core.MACRequestsLogs            → integrations.message_envelope (system=mac)
--
-- POLITICA: NON migriamo le righe legacy (info-loss controllato per ridurre
-- complessità ETL + tagliare retention storica >24m). Le tabelle vengono
-- archiviate read-only nel source DB per 6 mesi (compliance), poi droppate.
--
-- PRE-REQUISITI:
--   1. CostCnh cutover completato + verifica 24h smoke E2E passed
--   2. ETL Sprint 9.1 phase 1-4 completate su Cost_Offhighway_Test
--   3. audit.access_log scrive correttamente dal nuovo backend (verificare con
--      `SELECT TOP 10 * FROM CostCnh_Data.audit.access_log ORDER BY id DESC`
--      dopo aver fatto qualche login + CRUD)
--   4. Backup completo source DB (full + log) negli ultimi 24h
--
-- SAFETY MODE: questo script ESEGUE prima un archive (CREATE TABLE AS SELECT) +
-- imposta READ_ONLY sul filegroup, poi (separato) DROP. Mantenere il DROP
-- commentato fino a T+30 giorni dopo cutover per safety.
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ⚠️ Eseguire su SOURCE DB (es. Cost_Offhighway_Test), NON su CostCnh_Data
USE [<<SOURCE_DB>>];
GO

-- ── 0. Pre-flight: verifica che CostCnh.audit.access_log abbia dati recenti ─
-- (non possiamo accedere cross-DB facilmente; manual check raccomandato)
PRINT 'Pre-flight checklist:';
PRINT '  [ ] CostCnh.audit.access_log ha rows con event_time degli ultimi 24h?';
PRINT '  [ ] CostCnh.cp.spreadsheet_change_log esiste e ha indexes?';
PRINT '  [ ] Backup source DB <72h fa?';
PRINT '  [ ] Smoke E2E Playwright passing dopo cutover?';
PRINT 'Se anche solo uno e NO → STOP. Non eseguire il drop.';
PRINT '';

-- ── 1. Inventory: legacy *_Log tables presenti ─────────────────────────────
PRINT '── Inventory legacy *_Log tables ──';
SELECT
    SCHEMA_NAME(t.schema_id) + '.' + t.name AS tbl,
    p.rows AS row_count,
    CAST(SUM(au.data_pages) * 8.0 / 1024 AS DECIMAL(10,2)) AS mb
FROM sys.tables t
INNER JOIN sys.partitions p   ON p.object_id = t.object_id AND p.index_id IN (0, 1)
INNER JOIN sys.allocation_units au ON au.container_id = p.partition_id
WHERE t.name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs')
GROUP BY SCHEMA_NAME(t.schema_id), t.name, p.rows
ORDER BY tbl;
GO

-- ── 2. Archive: rename schema (set di tabelle in schema 'archive_legacy_logs') ─
-- Approccio: creare schema archive_legacy_logs e spostare le tabelle.
-- Le tabelle rimangono accessibili in sola lettura (no FK su di esse, no app reads).
IF SCHEMA_ID('archive_legacy_logs') IS NULL
    EXEC('CREATE SCHEMA [archive_legacy_logs]');
GO

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'ALTER SCHEMA [archive_legacy_logs] TRANSFER ['
                   + SCHEMA_NAME(t.schema_id) + N'].[' + t.name + N'];' + CHAR(10)
FROM sys.tables t
WHERE t.name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs')
  AND SCHEMA_NAME(t.schema_id) <> 'archive_legacy_logs';

IF LEN(@sql) > 0
BEGIN
    PRINT '── Archive: transferring to schema archive_legacy_logs ──';
    PRINT @sql;
    EXEC sp_executesql @sql;
    PRINT 'Done.';
END
ELSE
    PRINT 'Archive skipped: nessuna tabella nei loro schema originali.';
GO

-- ── 3. Revoca permessi scrittura (sola read) ────────────────────────────────
-- Pattern: revoca INSERT/UPDATE/DELETE su ognuna, mantieni SELECT per
-- compliance/auditing.
DECLARE @sql2 NVARCHAR(MAX) = N'';
SELECT @sql2 = @sql2 + N'DENY INSERT, UPDATE, DELETE ON [archive_legacy_logs].[' + t.name + N'] TO public;' + CHAR(10)
FROM sys.tables t
WHERE SCHEMA_NAME(t.schema_id) = 'archive_legacy_logs'
  AND t.name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs');

IF LEN(@sql2) > 0
BEGIN
    PRINT '── Revoking write permissions on archived logs ──';
    PRINT @sql2;
    EXEC sp_executesql @sql2;
END
GO

-- ── 4. Extended Property: marker archive date + reason ──────────────────────
DECLARE @sql3 NVARCHAR(MAX) = N'';
DECLARE @marker NVARCHAR(200) = N'Archived ' + CONVERT(NVARCHAR(20), SYSUTCDATETIME(), 121) + N' (CostCnh cutover Sprint 9). Retention 6 months. DO NOT WRITE.';
SELECT @sql3 = @sql3 + N'
IF EXISTS (SELECT 1 FROM sys.extended_properties WHERE major_id = OBJECT_ID(''[archive_legacy_logs].['+t.name+']'') AND name = ''ARCHIVE_NOTE'')
   EXEC sp_updateextendedproperty @name = N''ARCHIVE_NOTE'', @value = N''' + @marker + N''', @level0type = N''SCHEMA'', @level0name = N''archive_legacy_logs'', @level1type = N''TABLE'', @level1name = N''' + t.name + N''';
ELSE
   EXEC sp_addextendedproperty    @name = N''ARCHIVE_NOTE'', @value = N''' + @marker + N''', @level0type = N''SCHEMA'', @level0name = N''archive_legacy_logs'', @level1type = N''TABLE'', @level1name = N''' + t.name + N''';
'
FROM sys.tables t
WHERE SCHEMA_NAME(t.schema_id) = 'archive_legacy_logs'
  AND t.name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs');
EXEC sp_executesql @sql3;
PRINT '── Extended property ARCHIVE_NOTE applied ──';
GO

-- ── 5. Verifica post-archive: confermare che NESSUN procedure/view referenzia ──
PRINT '── Post-archive: dependent objects (should be 0) ──';
SELECT
    referencing_schema_name = SCHEMA_NAME(o.schema_id),
    referencing_entity_name = o.name,
    referencing_class = o.type_desc,
    sed.referenced_entity_name AS legacy_log_referenced
FROM sys.sql_expression_dependencies sed
INNER JOIN sys.objects o ON o.object_id = sed.referencing_id
WHERE sed.referenced_entity_name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs')
ORDER BY o.name;
PRINT 'Se ci sono referenze residue → fix prima del DROP definitivo (step 6).';
GO

-- ── 6. DROP definitivo (COMMENTED OUT — uncommentare dopo T+30 giorni) ─────
/*
-- ⚠️ ESEGUIRE SOLO T+30 GIORNI POST-CUTOVER, dopo conferma compliance team
USE [<<SOURCE_DB>>];
GO

DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop = @drop + N'DROP TABLE [archive_legacy_logs].[' + t.name + N'];' + CHAR(10)
FROM sys.tables t
WHERE SCHEMA_NAME(t.schema_id) = 'archive_legacy_logs'
  AND t.name IN ('CostPlanning_Facts_Log','ForecastCutoffLogs','ConversionConsolidateLog','AddinBulkOperationLog','MACRequestsLogs');

PRINT @drop;
EXEC sp_executesql @drop;

-- Drop empty schema
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE schema_id = SCHEMA_ID('archive_legacy_logs'))
    DROP SCHEMA [archive_legacy_logs];
*/

PRINT '';
PRINT '╔══════════════════════════════════════════════════════════════════════╗';
PRINT '║ Sprint 9 audit consolidation — archive done                          ║';
PRINT '║                                                                      ║';
PRINT '║ Next steps:                                                          ║';
PRINT '║   1. Monitor CostCnh audit.access_log writes for 30 days             ║';
PRINT '║   2. Confirm no app/report query references archive_legacy_logs.*    ║';
PRINT '║   3. Run DROP block (step 6) after T+30 days                         ║';
PRINT '║   4. Remove archive_legacy_logs schema                               ║';
PRINT '╚══════════════════════════════════════════════════════════════════════╝';
GO
