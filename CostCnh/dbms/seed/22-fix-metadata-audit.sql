-- =============================================================================
-- Audit globale metadata vs schema reale CostCnh_Data
-- =============================================================================
-- Per ogni route in _metadati__tabelle, scansiona _metadati__colonne. Se
-- mcrealcolumnname non esiste come colonna nella tabella sottostante:
--   - delete riga metadata (col fantasma)
-- Idempotente.
-- =============================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF; SET NOCOUNT ON;
GO

USE [CostCnh_Metadata];
GO

PRINT '=== Metadata column audit start ===';

-- Pre-stage: build lista colonne reali da CostCnh_Data (data DB)
IF OBJECT_ID(N'tempdb..#real_cols') IS NOT NULL DROP TABLE #real_cols;
CREATE TABLE #real_cols (
    schema_name SYSNAME NOT NULL,
    table_name  SYSNAME NOT NULL,
    column_name SYSNAME NOT NULL,
    PRIMARY KEY (schema_name, table_name, column_name)
);

-- Tutte le colonne di ogni tabella + view del DB Data (cross-DB query)
INSERT INTO #real_cols (schema_name, table_name, column_name)
SELECT s.name COLLATE Latin1_General_CI_AS, o.name COLLATE Latin1_General_CI_AS, c.name COLLATE Latin1_General_CI_AS
FROM [CostCnh_Data].sys.columns c
INNER JOIN [CostCnh_Data].sys.objects o ON o.object_id = c.object_id
INNER JOIN [CostCnh_Data].sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U','V');

-- Aggiungi anche le colonne delle tabelle in CostCnh_Metadata (route che lavorano su metadata stesso)
INSERT INTO #real_cols (schema_name, table_name, column_name)
SELECT s.name COLLATE Latin1_General_CI_AS, o.name COLLATE Latin1_General_CI_AS, c.name COLLATE Latin1_General_CI_AS
FROM sys.columns c
INNER JOIN sys.objects o ON o.object_id = c.object_id
INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('U','V')
  AND NOT EXISTS (SELECT 1 FROM #real_cols r WHERE r.schema_name = s.name AND r.table_name = o.name AND r.column_name = c.name);

DECLARE @col_total INT = (SELECT COUNT(*) FROM #real_cols);
PRINT 'Real columns indexed: ' + CAST(@col_total AS VARCHAR(20));

-- Audit: trova mc_id con mcrealcolumnname che non esiste
-- mdschemaname / md_nome_tabella sono i campi schema/tabella nella _metadati__tabelle
IF OBJECT_ID(N'tempdb..#bad_cols') IS NOT NULL DROP TABLE #bad_cols;
SELECT
    c.mc_id, c.md_id,
    t.mdroutename,
    t.mdschemaname,
    t.md_nome_tabella,
    c.mcrealcolumnname AS real_col,
    c.mc_nome_colonna  AS friendly_col
INTO #bad_cols
FROM _metadati__colonne c
INNER JOIN _metadati__tabelle t ON t.md_id = c.md_id
WHERE c.mcrealcolumnname IS NOT NULL
  AND c.mcrealcolumnname <> ''
  AND NOT EXISTS (
      SELECT 1 FROM #real_cols r
       WHERE r.schema_name COLLATE Latin1_General_CI_AS = ISNULL(t.mdschemaname COLLATE Latin1_General_CI_AS, 'dbo')
         AND r.table_name  COLLATE Latin1_General_CI_AS = t.md_nome_tabella COLLATE Latin1_General_CI_AS
         AND r.column_name COLLATE Latin1_General_CI_AS = c.mcrealcolumnname COLLATE Latin1_General_CI_AS
  );

DECLARE @bad_count INT = (SELECT COUNT(*) FROM #bad_cols);
PRINT 'Phantom columns found: ' + CAST(@bad_count AS VARCHAR(20));

-- Stampa per debug
SELECT TOP 100 mdroutename, ISNULL(mdschemaname,'') AS sch, md_nome_tabella AS tbl, real_col, friendly_col
FROM #bad_cols
ORDER BY mdroutename, real_col;

-- Delete dipendenze e poi le righe colonna fantasma
-- Note: _metadati__colonne ha PK su mc_id. Tabelle dipendenti:
--   _metadati__u_i__stili__colonne (style on column)
--   _mtdt__tnt__trizzazioni__colonne (authz on column)
-- Cleanup safe in ordine.

DELETE FROM _metadati__u_i__stili__colonne
 WHERE mc_id IN (SELECT mc_id FROM #bad_cols);
PRINT 'Style col rows deleted: ' + CAST(@@ROWCOUNT AS VARCHAR(20));

DELETE FROM _metadati__colonne
 WHERE mc_id IN (SELECT mc_id FROM #bad_cols);
DECLARE @deleted INT = @@ROWCOUNT;
PRINT 'Phantom column metadata removed: ' + CAST(@deleted AS VARCHAR(20));

-- Bump version
UPDATE sys_info SET projectmetadataversion = CONVERT(VARCHAR(20), SYSUTCDATETIME(), 112)
                                            + REPLACE(CONVERT(VARCHAR(8), SYSUTCDATETIME(), 108), ':', '');
DECLARE @nv VARCHAR(50) = (SELECT projectmetadataversion FROM sys_info);
PRINT '[audit] projectmetadataversion = ' + @nv;

PRINT '';
PRINT '=== Metadata audit done ===';
GO
