-- =============================================================================
-- ETL E2E Tests — Framework (schema tt = "transit tests")
-- =============================================================================
-- Pattern: ogni test produce una row in tt.test_result con status pass/fail.
-- SP helper:
--   tt.start_run        — apre una test_run row
--   tt.assert_equal     — INT/BIGINT equality
--   tt.assert_zero      — count must be 0 (orphan FK pattern)
--   tt.assert_nonzero   — count must be > 0
--   tt.assert_decimal_close — DECIMAL equality with tolerance
--   tt.complete_run     — chiude la run, summary pass/fail/total
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

IF SCHEMA_ID('tt') IS NULL EXEC('CREATE SCHEMA tt');
GO

-- ── tt.test_run ──────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[test_run]', N'U') IS NULL
BEGIN
    CREATE TABLE [tt].[test_run] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tt_test_run PRIMARY KEY CLUSTERED,
        etl_run_id BIGINT NULL,
        source_db NVARCHAR(128) NULL,
        started_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_tt_test_run_started_at DEFAULT (SYSUTCDATETIME()),
        completed_at_utc DATETIME2(3) NULL,
        total_count INT NULL,
        pass_count INT NULL,
        fail_count INT NULL
    );
    PRINT '[tt] test_run table created';
END
GO

-- ── tt.test_result ───────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[test_result]', N'U') IS NULL
BEGIN
    CREATE TABLE [tt].[test_result] (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_tt_test_result PRIMARY KEY CLUSTERED,
        test_run_id BIGINT NOT NULL CONSTRAINT FK_tt_result_run REFERENCES [tt].[test_run](id),
        category VARCHAR(40) NOT NULL,                  -- 'congruence' | 'consistency' | 'integrity'
        test_name NVARCHAR(200) NOT NULL,
        status VARCHAR(10) NOT NULL,                    -- 'pass' | 'fail' | 'skip'
        expected NVARCHAR(200) NULL,
        actual NVARCHAR(200) NULL,
        message NVARCHAR(1000) NULL,
        executed_at_utc DATETIME2(3) NOT NULL CONSTRAINT DF_tt_result_at DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_tt_result_run_status ON [tt].[test_result](test_run_id, status);
    PRINT '[tt] test_result table created';
END
GO

-- ── tt.start_run ─────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[start_run]', N'P') IS NOT NULL DROP PROCEDURE [tt].[start_run];
GO
CREATE PROCEDURE [tt].[start_run]
    @etl_run_id BIGINT = NULL,
    @source_db NVARCHAR(128) = NULL,
    @run_id BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [tt].[test_run] (etl_run_id, source_db) VALUES (@etl_run_id, @source_db);
    SET @run_id = SCOPE_IDENTITY();
END
GO

-- ── tt.assert_equal ──────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[assert_equal]', N'P') IS NOT NULL DROP PROCEDURE [tt].[assert_equal];
GO
CREATE PROCEDURE [tt].[assert_equal]
    @run_id BIGINT,
    @category VARCHAR(40),
    @test_name NVARCHAR(200),
    @expected BIGINT,
    @actual BIGINT,
    @tolerance BIGINT = 0       -- 0 = exact, > 0 = allowed ±
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ok BIT = CASE WHEN ABS(ISNULL(@expected, 0) - ISNULL(@actual, 0)) <= ISNULL(@tolerance, 0) THEN 1 ELSE 0 END;
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, expected, actual, message)
    VALUES (@run_id, @category, @test_name,
            CASE WHEN @ok = 1 THEN 'pass' ELSE 'fail' END,
            CAST(@expected AS NVARCHAR(200)), CAST(@actual AS NVARCHAR(200)),
            CASE WHEN @ok = 1 THEN NULL ELSE CONCAT('expected=', @expected, ' actual=', @actual, ' tolerance=', @tolerance) END);
END
GO

-- ── tt.assert_zero ───────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[assert_zero]', N'P') IS NOT NULL DROP PROCEDURE [tt].[assert_zero];
GO
CREATE PROCEDURE [tt].[assert_zero]
    @run_id BIGINT,
    @category VARCHAR(40),
    @test_name NVARCHAR(200),
    @actual BIGINT,
    @sample_message NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ok BIT = CASE WHEN ISNULL(@actual, 0) = 0 THEN 1 ELSE 0 END;
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, expected, actual, message)
    VALUES (@run_id, @category, @test_name,
            CASE WHEN @ok = 1 THEN 'pass' ELSE 'fail' END,
            '0', CAST(@actual AS NVARCHAR(200)),
            CASE WHEN @ok = 1 THEN NULL ELSE COALESCE(@sample_message, CONCAT('expected 0, found ', @actual)) END);
END
GO

-- ── tt.assert_nonzero ────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[assert_nonzero]', N'P') IS NOT NULL DROP PROCEDURE [tt].[assert_nonzero];
GO
CREATE PROCEDURE [tt].[assert_nonzero]
    @run_id BIGINT,
    @category VARCHAR(40),
    @test_name NVARCHAR(200),
    @actual BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ok BIT = CASE WHEN ISNULL(@actual, 0) > 0 THEN 1 ELSE 0 END;
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, expected, actual, message)
    VALUES (@run_id, @category, @test_name,
            CASE WHEN @ok = 1 THEN 'pass' ELSE 'fail' END,
            '>0', CAST(@actual AS NVARCHAR(200)),
            CASE WHEN @ok = 1 THEN NULL ELSE 'expected non-zero count, got 0' END);
END
GO

-- ── tt.assert_decimal_close ──────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[assert_decimal_close]', N'P') IS NOT NULL DROP PROCEDURE [tt].[assert_decimal_close];
GO
CREATE PROCEDURE [tt].[assert_decimal_close]
    @run_id BIGINT,
    @category VARCHAR(40),
    @test_name NVARCHAR(200),
    @expected DECIMAL(38,4),
    @actual DECIMAL(38,4),
    @tolerance DECIMAL(38,4) = 0.01
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @ok BIT = CASE WHEN ABS(ISNULL(@expected, 0) - ISNULL(@actual, 0)) <= ISNULL(@tolerance, 0) THEN 1 ELSE 0 END;
    INSERT INTO [tt].[test_result] (test_run_id, category, test_name, status, expected, actual, message)
    VALUES (@run_id, @category, @test_name,
            CASE WHEN @ok = 1 THEN 'pass' ELSE 'fail' END,
            CAST(@expected AS NVARCHAR(200)), CAST(@actual AS NVARCHAR(200)),
            CASE WHEN @ok = 1 THEN NULL ELSE CONCAT('expected ', @expected, ' actual ', @actual, ' tolerance ±', @tolerance) END);
END
GO

-- ── tt.complete_run ──────────────────────────────────────────────────────────
IF OBJECT_ID(N'[tt].[complete_run]', N'P') IS NOT NULL DROP PROCEDURE [tt].[complete_run];
GO
CREATE PROCEDURE [tt].[complete_run]
    @run_id BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [tt].[test_run]
       SET completed_at_utc = SYSUTCDATETIME(),
           total_count = (SELECT COUNT(*) FROM [tt].[test_result] WHERE test_run_id = @run_id),
           pass_count  = (SELECT COUNT(*) FROM [tt].[test_result] WHERE test_run_id = @run_id AND status = 'pass'),
           fail_count  = (SELECT COUNT(*) FROM [tt].[test_result] WHERE test_run_id = @run_id AND status = 'fail')
     WHERE id = @run_id;
END
GO

PRINT '[tt] === Test framework deployed ===';
PRINT '  Schema: tt';
PRINT '  Tables: test_run, test_result';
PRINT '  SPs: start_run, complete_run, assert_equal, assert_zero, assert_nonzero, assert_decimal_close';
GO
