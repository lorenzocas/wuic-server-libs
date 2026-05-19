-- =============================================================================
-- E2E Test — Source integrity (verifies ETL is read-only)
-- =============================================================================
-- Verifica CHECKSUM_AGG su source DB tables. Confronto con pre-snapshot.
-- Pre-snapshot atteso in tt.source_snapshot dove inserito prima dell'ETL.
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE [CostCnh_Data];
GO

-- Tabella per memorizzare pre/post snapshots
IF OBJECT_ID(N'[tt].[source_snapshot]', N'U') IS NULL
BEGIN
    CREATE TABLE [tt].[source_snapshot] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tt_source_snap PRIMARY KEY CLUSTERED,
        test_run_id BIGINT NULL,
        snapshot_kind VARCHAR(10) NOT NULL,                  -- 'pre' | 'post'
        source_db NVARCHAR(128) NOT NULL,
        table_name NVARCHAR(200) NOT NULL,
        row_count BIGINT NULL,
        checksum_agg BIGINT NULL,
        captured_at_utc DATETIME2(3) NOT NULL DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_tt_src_snap_run ON [tt].[source_snapshot](test_run_id, snapshot_kind);
END
GO

DECLARE @tr BIGINT = <<TEST_RUN_ID>>;
DECLARE @source NVARCHAR(128) = N'<<SOURCE_DB_NAME>>';   -- senza brackets per dynamic SQL

-- Snapshot post-ETL
DECLARE @sql NVARCHAR(MAX) = N'
INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''core.Sites'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[core].[Sites];

INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''core.Currencies'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[core].[Currencies];

INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''core.Programs'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[core].[Programs];

INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''core.ProjectScenarios'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[core].[ProjectScenarios];

INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''facts.XBS_Objects'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[facts].[XBS_Objects];

INSERT INTO [tt].[source_snapshot] (test_run_id, snapshot_kind, source_db, table_name, row_count, checksum_agg)
SELECT ' + CAST(@tr AS NVARCHAR(20)) + N', ''post'', ''' + @source + N''', ''facts.CostPlanning_Facts'',
       COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM [' + @source + N'].[facts].[CostPlanning_Facts];';

EXEC sp_executesql @sql;

-- Compare pre vs post: for each table, hash must match
DECLARE @cnt BIGINT;
SELECT @cnt = COUNT(*)
  FROM [tt].[source_snapshot] pre
  LEFT JOIN [tt].[source_snapshot] post
         ON post.test_run_id = @tr AND post.snapshot_kind = 'post'
        AND post.source_db = pre.source_db AND post.table_name = pre.table_name
  WHERE pre.test_run_id = @tr AND pre.snapshot_kind = 'pre'
    AND (post.checksum_agg IS NULL
         OR pre.checksum_agg <> post.checksum_agg
         OR pre.row_count <> post.row_count);

EXEC [tt].[assert_zero] @run_id=@tr, @category='integrity',
     @test_name=N'Source DB integrity: pre vs post snapshot hash match (all tables)',
     @actual=@cnt;

-- Per-table assertions (granulari per identificare quale table modificata)
DECLARE @table NVARCHAR(200), @pre_row BIGINT, @post_row BIGINT, @pre_hash BIGINT, @post_hash BIGINT;
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
  SELECT pre.table_name, pre.row_count, post.row_count, pre.checksum_agg, post.checksum_agg
    FROM [tt].[source_snapshot] pre
    LEFT JOIN [tt].[source_snapshot] post
           ON post.test_run_id = @tr AND post.snapshot_kind = 'post' AND post.table_name = pre.table_name
   WHERE pre.test_run_id = @tr AND pre.snapshot_kind = 'pre';

DECLARE @test_name_row NVARCHAR(200), @test_name_hash NVARCHAR(200);
OPEN cur; FETCH NEXT FROM cur INTO @table, @pre_row, @post_row, @pre_hash, @post_hash;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @test_name_row  = N'Source ' + @table + N': row_count unchanged';
    SET @test_name_hash = N'Source ' + @table + N': checksum_agg unchanged';
    EXEC [tt].[assert_equal] @run_id=@tr, @category='integrity', @test_name=@test_name_row,
         @expected=@pre_row, @actual=@post_row;
    EXEC [tt].[assert_equal] @run_id=@tr, @category='integrity', @test_name=@test_name_hash,
         @expected=@pre_hash, @actual=@post_hash;
    FETCH NEXT FROM cur INTO @table, @pre_row, @post_row, @pre_hash, @post_hash;
END
CLOSE cur; DEALLOCATE cur;

PRINT '[tt-integrity] source snapshot post + comparisons for run_id=' + CAST(@tr AS NVARCHAR(10));
GO
