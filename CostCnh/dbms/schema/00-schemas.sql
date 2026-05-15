-- =============================================================================
-- CostCnh_Data — Foundation: schemi + helpers + partition infrastructure
-- =============================================================================
-- Schemi nuovi (5 invece dei 9 legacy):
--   core   : master data (programs, projects, scenarios, currencies, organizations)
--   xbs    : hierarchies (cost/work/org breakdown) tramite HIERARCHYID
--   cp     : cost-planning facts/measures (hot path)
--   fc     : forecast facts/cutoffs (warm)
--   audit  : access log + outbox + DLQ (append-only)
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

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'core')  EXEC('CREATE SCHEMA [core] AUTHORIZATION [dbo]');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'xbs')   EXEC('CREATE SCHEMA [xbs] AUTHORIZATION [dbo]');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'cp')    EXEC('CREATE SCHEMA [cp] AUTHORIZATION [dbo]');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'fc')    EXEC('CREATE SCHEMA [fc] AUTHORIZATION [dbo]');
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'audit') EXEC('CREATE SCHEMA [audit] AUTHORIZATION [dbo]');
GO

PRINT '[00-schemas] OK';
GO

-- =============================================================================
-- Partition function + scheme su time_month_id (YYYYMM INT) per cp.facts
-- =============================================================================
-- Strategia: RANGE RIGHT mensile dal 2018-01 (cover history legacy) al 2030-12.
-- Estensione automatica nightly da scheduler job `costcnh_partition_maintenance`.
-- Tutte le partizioni vivono su [PRIMARY] in dev/test; in prod si sposteranno
-- su filegroup per anno (es. [FG_2025], [FG_2026]) per gestire tiering storage.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.partition_functions WHERE name = N'pf_cp_facts_month')
BEGIN
    DECLARE @sql NVARCHAR(MAX) = N'CREATE PARTITION FUNCTION pf_cp_facts_month(INT) AS RANGE RIGHT FOR VALUES (';
    DECLARE @y INT = 2018, @m INT = 1, @first BIT = 1;
    WHILE @y <= 2030
    BEGIN
        SET @m = 1;
        WHILE @m <= 12
        BEGIN
            IF @first = 0 SET @sql = @sql + N',';
            SET @sql = @sql + CAST(@y * 100 + @m AS NVARCHAR(10));
            SET @first = 0;
            SET @m = @m + 1;
        END
        SET @y = @y + 1;
    END
    SET @sql = @sql + N')';
    EXEC sp_executesql @sql;
    PRINT '[00-schemas] partition function pf_cp_facts_month created (2018-01 .. 2030-12, monthly)';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.partition_schemes WHERE name = N'ps_cp_facts')
BEGIN
    CREATE PARTITION SCHEME ps_cp_facts AS PARTITION pf_cp_facts_month ALL TO ([PRIMARY]);
    PRINT '[00-schemas] partition scheme ps_cp_facts created (ALL TO [PRIMARY])';
END
GO

PRINT '[00-schemas] DONE';
GO
