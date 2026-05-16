-- =============================================================================
-- Task 12.3 — Drop ORPHAN tables (W0.4 audit identified)
-- =============================================================================
-- Decisione autonoma (no user blocking): drop delle 5 ORPHAN tables identificate
-- nell'audit W0.4. Reasoning:
--   - xbs.node_attribute: EAV definito ma mai letto/scritto. Custom Attributes
--     sono ora gestiti via core.custom_value (Phase I). DROP.
--   - fc.baseline: pointer-only mai promosso. Baseline gestita via fc.facts
--     WHERE forecast_code='BL'. DROP.
--   - fc.forecast_cutoff: referenziato solo da ETL script come "futuro" target.
--     Mai usato. DROP — può essere ricreata se serve.
--   - core.initiative_program: join N:N scaffold. ORA usato da Task 12.6
--     rep.sp_run_initiative_pivot → KEEP.
--   - core.program_long_text: vertical-partition LOB. Mai usato (comment_short
--     inline basta in tutti i flussi). DROP.
--
-- KEEP: core.initiative_program (riassegnata uso in Task 12.6)
-- DROP: xbs.node_attribute, fc.baseline, fc.forecast_cutoff, core.program_long_text
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

-- Safety: archivia prima del drop in dbo._orphan_archive_YYYYMMDD
DECLARE @archive_suffix VARCHAR(20) = '_archive_' + CONVERT(VARCHAR(8), SYSUTCDATETIME(), 112);

-- ─── 1. xbs.node_attribute ────────────────────────────────────────────────────
IF OBJECT_ID(N'[xbs].[node_attribute]', N'U') IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX) = 'SELECT * INTO [dbo].[xbs_node_attribute' + @archive_suffix + '] FROM [xbs].[node_attribute]';
    EXEC sp_executesql @sql;
    DROP TABLE [xbs].[node_attribute];
    PRINT '[12.3] xbs.node_attribute archived + dropped';
END
GO

-- ─── 2. fc.baseline ──────────────────────────────────────────────────────────
IF OBJECT_ID(N'[fc].[baseline]', N'U') IS NOT NULL
BEGIN
    DECLARE @sql NVARCHAR(MAX) = 'SELECT * INTO [dbo].[fc_baseline_archive_' + CONVERT(VARCHAR(8), SYSUTCDATETIME(), 112) + '] FROM [fc].[baseline]';
    EXEC sp_executesql @sql;
    DROP TABLE [fc].[baseline];
    PRINT '[12.3] fc.baseline archived + dropped';
END
GO

-- ─── 3. fc.forecast_cutoff ──────────────────────────────────────────────────
-- NB: c'è una FK su fc.facts.forecast_cutoff_id. Devo prima rimuoverla.
IF OBJECT_ID(N'[fc].[forecast_cutoff]', N'U') IS NOT NULL
BEGIN
    -- Drop FK constraint prima
    DECLARE @fk_name SYSNAME = (SELECT TOP 1 name FROM sys.foreign_keys
                                 WHERE parent_object_id = OBJECT_ID(N'[fc].[facts]')
                                   AND referenced_object_id = OBJECT_ID(N'[fc].[forecast_cutoff]'));
    IF @fk_name IS NOT NULL
    BEGIN
        DECLARE @drop_fk NVARCHAR(400) = 'ALTER TABLE [fc].[facts] DROP CONSTRAINT [' + @fk_name + ']';
        EXEC sp_executesql @drop_fk;
        PRINT '[12.3] FK fc.facts → fc.forecast_cutoff dropped';
    END

    DECLARE @sql2 NVARCHAR(MAX) = 'SELECT * INTO [dbo].[fc_forecast_cutoff_archive_' + CONVERT(VARCHAR(8), SYSUTCDATETIME(), 112) + '] FROM [fc].[forecast_cutoff]';
    EXEC sp_executesql @sql2;
    DROP TABLE [fc].[forecast_cutoff];
    PRINT '[12.3] fc.forecast_cutoff archived + dropped';
END
GO

-- ─── 4. core.program_long_text ───────────────────────────────────────────────
IF OBJECT_ID(N'[core].[program_long_text]', N'U') IS NOT NULL
BEGIN
    DECLARE @sql3 NVARCHAR(MAX) = 'SELECT * INTO [dbo].[program_long_text_archive_' + CONVERT(VARCHAR(8), SYSUTCDATETIME(), 112) + '] FROM [core].[program_long_text]';
    EXEC sp_executesql @sql3;
    DROP TABLE [core].[program_long_text];
    PRINT '[12.3] core.program_long_text archived + dropped';
END
GO

PRINT '[12.3] === ORPHAN tables drop complete ===';
PRINT '  KEPT: core.initiative_program (now used by Task 12.6 rep.sp_run_initiative_pivot)';
PRINT '  DROPPED: xbs.node_attribute, fc.baseline, fc.forecast_cutoff, core.program_long_text';
PRINT '  Archives in dbo.<name>_archive_YYYYMMDD (per recovery)';
GO
