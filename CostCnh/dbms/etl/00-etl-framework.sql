-- =============================================================================
-- CostCnh_Data — Sprint 9.1 ETL framework: schema + mapping + audit
-- =============================================================================
-- L'ETL e' idempotente: ogni fase memorizza
--   - etl.run         → header batch (start/end/rows/duration/errors)
--   - etl.run_phase   → per-phase progress (skippable se gia' done)
--   - etl.guid_map    → mapping GUID legacy → INT id nuovo (per ogni entita')
--   - etl.error       → errori per-row (audit dettagliato)
--
-- I phases:
--   1 anagrafica (sites, currencies, statuses, classes, scenarios, unit_measures, dim_time)
--   2 xbs hierarchy (5 tree_kinds + flat nodes — depth=1 default)
--   3 programs + projects + initiatives
--   4 cp.facts (partition-by-partition, picks deepest non-null XBS_Objects_N)
--   5 fc.* (forecast cutoffs + forecast facts)
--   6 workforce (resources + allocations)
--   7 reports catalog (Report → rep.report_definition + ReportFilter → params)
--   8 mac requests (history)
--   9 validation (row counts, smoke samples)
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

IF SCHEMA_ID('etl') IS NULL EXEC('CREATE SCHEMA [etl]');
GO

-- ── etl.run (batch header) ───────────────────────────────────────────────────
IF OBJECT_ID(N'[etl].[run]', N'U') IS NULL
BEGIN
    CREATE TABLE [etl].[run] (
        id                  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_etl_run PRIMARY KEY CLUSTERED,
        source_dsn          NVARCHAR(500) NOT NULL,                            -- es. 'cnhiserver.database.windows.net/Cost_Offhighway_Test'
        dry_run             BIT NOT NULL CONSTRAINT DF_etl_run_dry_run DEFAULT (0),
        started_at_utc      DATETIME2(3) NOT NULL CONSTRAINT DF_etl_run_started DEFAULT (SYSUTCDATETIME()),
        completed_at_utc    DATETIME2(3) NULL,
        status              TINYINT NOT NULL CONSTRAINT DF_etl_run_status DEFAULT (0),
                                                                                -- 0=running, 1=completed, 9=failed
        total_rows_in       BIGINT NULL,
        total_rows_out      BIGINT NULL,
        total_errors        INT NULL,
        notes               NVARCHAR(MAX) NULL
    );
    PRINT '[etl] etl.run created';
END
GO

-- ── etl.run_phase (per-phase progress) ──────────────────────────────────────
IF OBJECT_ID(N'[etl].[run_phase]', N'U') IS NULL
BEGIN
    CREATE TABLE [etl].[run_phase] (
        id                  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_etl_run_phase PRIMARY KEY CLUSTERED,
        run_id              BIGINT NOT NULL CONSTRAINT FK_etl_run_phase_run REFERENCES [etl].[run](id),
        phase_number        TINYINT NOT NULL,
        phase_name          NVARCHAR(60) NOT NULL,
        started_at_utc      DATETIME2(3) NOT NULL CONSTRAINT DF_etl_run_phase_started DEFAULT (SYSUTCDATETIME()),
        completed_at_utc    DATETIME2(3) NULL,
        status              TINYINT NOT NULL CONSTRAINT DF_etl_run_phase_status DEFAULT (0),
                                                                                -- 0=running, 1=completed, 9=failed, 2=skipped (already done)
        rows_in             BIGINT NULL,
        rows_inserted       BIGINT NULL,
        rows_updated        BIGINT NULL,
        rows_skipped        BIGINT NULL,
        rows_rejected       BIGINT NULL,
        duration_ms         INT NULL,
        last_error          NVARCHAR(2000) NULL,
        CONSTRAINT UQ_etl_run_phase_run_phase UNIQUE (run_id, phase_number)
    );
    CREATE INDEX ix_etl_run_phase_status ON [etl].[run_phase](status, phase_number);
    PRINT '[etl] etl.run_phase created';
END
GO

-- ── etl.guid_map (GUID legacy → INT nuovo per ogni entita') ─────────────────
-- Permette di ri-mappare le FK durante le fasi successive (es. legacy
-- Programs.Id_Site UNIQUEIDENTIFIER → nuovo core.program.site_id INT).
IF OBJECT_ID(N'[etl].[guid_map]', N'U') IS NULL
BEGIN
    CREATE TABLE [etl].[guid_map] (
        entity_type         VARCHAR(60) NOT NULL,                              -- 'site', 'program', 'project', 'xbs_node', etc.
        legacy_guid         UNIQUEIDENTIFIER NOT NULL,
        new_id              BIGINT NOT NULL,
        mapped_at_utc       DATETIME2(3) NOT NULL CONSTRAINT DF_etl_guid_map_mapped_at_utc DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_etl_guid_map PRIMARY KEY CLUSTERED (entity_type, legacy_guid),
        CONSTRAINT UQ_etl_guid_map_entity_new_id UNIQUE (entity_type, new_id)
    );
    CREATE INDEX ix_etl_guid_map_new_id ON [etl].[guid_map](entity_type, new_id);
    PRINT '[etl] etl.guid_map created';
END
GO

-- ── etl.int_map (INT legacy → INT nuovo per entita' con PK INT) ─────────────
-- Es. legacy Sites.Id INT → nuovo core.site.id INT (PK diversa, serve mapping)
IF OBJECT_ID(N'[etl].[int_map]', N'U') IS NULL
BEGIN
    CREATE TABLE [etl].[int_map] (
        entity_type         VARCHAR(60) NOT NULL,
        legacy_id           BIGINT NOT NULL,
        new_id              BIGINT NOT NULL,
        mapped_at_utc       DATETIME2(3) NOT NULL CONSTRAINT DF_etl_int_map_mapped_at_utc DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_etl_int_map PRIMARY KEY CLUSTERED (entity_type, legacy_id)
    );
    CREATE INDEX ix_etl_int_map_new_id ON [etl].[int_map](entity_type, new_id);
    PRINT '[etl] etl.int_map created';
END
GO

-- ── etl.error (per-row audit log) ───────────────────────────────────────────
IF OBJECT_ID(N'[etl].[error]', N'U') IS NULL
BEGIN
    CREATE TABLE [etl].[error] (
        id                  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_etl_error PRIMARY KEY CLUSTERED,
        run_id              BIGINT NOT NULL CONSTRAINT FK_etl_error_run REFERENCES [etl].[run](id),
        phase_number        TINYINT NOT NULL,
        entity_type         VARCHAR(60) NOT NULL,
        legacy_id           NVARCHAR(100) NULL,
        error_kind          VARCHAR(40) NOT NULL,                              -- 'fk_unmapped', 'validation', 'duplicate', 'cast_failed', 'unknown'
        error_message       NVARCHAR(2000) NOT NULL,
        raw_payload         NVARCHAR(MAX) NULL,
        logged_at_utc       DATETIME2(3) NOT NULL CONSTRAINT DF_etl_error_logged_at_utc DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX ix_etl_error_run_phase ON [etl].[error](run_id, phase_number, error_kind);
    PRINT '[etl] etl.error created';
END
GO

-- ── Helper SPs ────────────────────────────────────────────────────────────────
-- etl.start_run: crea row in etl.run e ritorna l'id
IF OBJECT_ID(N'[etl].[start_run]', N'P') IS NOT NULL DROP PROCEDURE [etl].[start_run];
GO
CREATE PROCEDURE [etl].[start_run]
    @source_dsn NVARCHAR(500),
    @dry_run BIT = 0,
    @run_id BIGINT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [etl].[run] (source_dsn, dry_run) VALUES (@source_dsn, @dry_run);
    SET @run_id = SCOPE_IDENTITY();
END
GO

-- etl.start_phase: crea row in etl.run_phase (o ritorna l'esistente se gia' done)
IF OBJECT_ID(N'[etl].[start_phase]', N'P') IS NOT NULL DROP PROCEDURE [etl].[start_phase];
GO
CREATE PROCEDURE [etl].[start_phase]
    @run_id BIGINT,
    @phase_number TINYINT,
    @phase_name NVARCHAR(60),
    @phase_id BIGINT OUTPUT,
    @already_completed BIT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @already_completed = 0;

    DECLARE @existing_id BIGINT, @existing_status TINYINT;
    SELECT TOP 1 @existing_id = id, @existing_status = status
    FROM [etl].[run_phase]
    WHERE run_id = @run_id AND phase_number = @phase_number;

    IF @existing_id IS NOT NULL
    BEGIN
        SET @phase_id = @existing_id;
        IF @existing_status = 1 SET @already_completed = 1;
        RETURN;
    END

    INSERT INTO [etl].[run_phase] (run_id, phase_number, phase_name) VALUES (@run_id, @phase_number, @phase_name);
    SET @phase_id = SCOPE_IDENTITY();
END
GO

-- etl.complete_phase
IF OBJECT_ID(N'[etl].[complete_phase]', N'P') IS NOT NULL DROP PROCEDURE [etl].[complete_phase];
GO
CREATE PROCEDURE [etl].[complete_phase]
    @phase_id BIGINT,
    @rows_in BIGINT = NULL,
    @rows_inserted BIGINT = NULL,
    @rows_updated BIGINT = NULL,
    @rows_skipped BIGINT = NULL,
    @rows_rejected BIGINT = NULL,
    @duration_ms INT = NULL,
    @last_error NVARCHAR(2000) = NULL,
    @status TINYINT = 1   -- 1=completed
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [etl].[run_phase]
       SET completed_at_utc = SYSUTCDATETIME(),
           status = @status,
           rows_in = @rows_in,
           rows_inserted = @rows_inserted,
           rows_updated = @rows_updated,
           rows_skipped = @rows_skipped,
           rows_rejected = @rows_rejected,
           duration_ms = @duration_ms,
           last_error = @last_error
     WHERE id = @phase_id;
END
GO

-- etl.log_error
IF OBJECT_ID(N'[etl].[log_error]', N'P') IS NOT NULL DROP PROCEDURE [etl].[log_error];
GO
CREATE PROCEDURE [etl].[log_error]
    @run_id BIGINT,
    @phase_number TINYINT,
    @entity_type VARCHAR(60),
    @legacy_id NVARCHAR(100) = NULL,
    @error_kind VARCHAR(40),
    @error_message NVARCHAR(2000),
    @raw_payload NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO [etl].[error] (run_id, phase_number, entity_type, legacy_id, error_kind, error_message, raw_payload)
    VALUES (@run_id, @phase_number, @entity_type, @legacy_id, @error_kind, @error_message, @raw_payload);
END
GO

PRINT '[etl] 4 helper SPs created (start_run, start_phase, complete_phase, log_error)';
GO

PRINT '[00-etl-framework] DONE';
GO
