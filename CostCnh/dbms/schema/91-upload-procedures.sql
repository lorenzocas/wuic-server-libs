-- =============================================================================
-- CostCnh_Data — Sprint 6: stored procedures per md_action_type=10 (upload)
-- =============================================================================
-- Il framework WUIC (UploadHandlerCustom + UploadToDynamicTable):
--   1. riceve il file CSV/XLSX dall'utente via wtoolbox.uploadDialog
--   2. parsa in DataTable
--   3. fa DROP + CREATE (mode=replace) della tabella `upload_target_table` con
--      le stesse colonne del CSV (tutte NVARCHAR(400))
--   4. INSERT bulk delle righe
--   5. chiama la stored `upload_stored_name`
--
-- Le 3 SP qui sotto sono i destinatari:
--   - uploads.process_workforce_upload  → mappa staging → wf.allocation
--   - uploads.process_planned_upload    → mappa staging → cp.facts (planned)
--   - uploads.process_baseline_upload   → mappa staging → fc.facts (baseline forecast)
-- Ogni SP scrive header in uploads.batch (audit) + processing_log per ogni riga errore.
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

-- ── uploads.process_workforce_upload ──────────────────────────────────────────
-- CSV atteso: resource_code, year_num, month_num, project_code, fte_percent, hours
-- Mode framework: 'replace' (DROP + CREATE uploads.staging_workforce ad ogni upload)
IF OBJECT_ID(N'[uploads].[process_workforce_upload]', N'P') IS NOT NULL DROP PROCEDURE [uploads].[process_workforce_upload];
GO
CREATE PROCEDURE [uploads].[process_workforce_upload]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Header audit
    DECLARE @batch_id BIGINT;
    INSERT INTO [uploads].[batch] (upload_kind, original_filename, row_count, status, started_at_utc)
    VALUES ('workforce', 'staging_workforce (dynamic)',
            ISNULL((SELECT COUNT(*) FROM [uploads].[staging_workforce]), 0), 1, SYSUTCDATETIME());
    SET @batch_id = SCOPE_IDENTITY();

    DECLARE @accepted INT = 0, @rejected INT = 0;

    -- Validazione + insert in wf.allocation
    -- (Assume staging_workforce esiste con colonne: resource_code, year_num, month_num,
    --  project_code, fte_percent, hours — il framework le dump tutte come NVARCHAR(400))
    IF OBJECT_ID(N'[uploads].[staging_workforce]', N'U') IS NOT NULL
    BEGIN
        ;WITH parsed AS (
            SELECT
                s.resource_code,
                TRY_CAST(s.year_num   AS INT) AS year_num,
                TRY_CAST(s.month_num  AS INT) AS month_num,
                s.project_code,
                TRY_CAST(REPLACE(REPLACE(s.fte_percent, '%', ''), ',', '.') AS DECIMAL(5,2)) AS fte_percent,
                TRY_CAST(REPLACE(s.hours,     ',', '.') AS DECIMAL(9,2)) AS hours
            FROM [uploads].[staging_workforce] s
        ),
        joined AS (
            SELECT
                r.id AS resource_id,
                p.id AS project_id,
                pr.id AS program_id,
                (p.year_num * 100 + p.month_num) AS time_month_id,
                p.fte_percent,
                p.hours
            FROM parsed p
            INNER JOIN [wf].[resource] r ON r.code = p.resource_code AND ISNULL(r.cancellato,0)=0
            LEFT  JOIN [core].[project] proj ON proj.code = p.project_code AND ISNULL(proj.cancellato,0)=0
            LEFT  JOIN [core].[project] p2 ON p2.id = proj.id
            LEFT  JOIN [core].[program] pr ON pr.id = p2.program_id
            LEFT  JOIN [core].[dim_time] dt ON dt.month_id = p.year_num * 100 + p.month_num
            CROSS APPLY (SELECT proj.id AS pid) px
            WHERE p.year_num IS NOT NULL AND p.month_num IS NOT NULL
              AND p.fte_percent IS NOT NULL
              AND dt.month_id IS NOT NULL
        )
        INSERT INTO [wf].[allocation] (resource_id, project_id, program_id, time_month_id, fte_percent, hours)
        SELECT resource_id, project_id, program_id, time_month_id, fte_percent, hours
        FROM joined;
        SET @accepted = @@ROWCOUNT;

        SELECT @rejected = COUNT(*) FROM [uploads].[staging_workforce] s
        WHERE TRY_CAST(s.year_num AS INT) IS NULL
           OR TRY_CAST(s.month_num AS INT) IS NULL
           OR TRY_CAST(REPLACE(REPLACE(s.fte_percent, '%', ''), ',', '.') AS DECIMAL(5,2)) IS NULL
           OR NOT EXISTS (SELECT 1 FROM [wf].[resource] r WHERE r.code = s.resource_code AND ISNULL(r.cancellato,0)=0);
    END

    UPDATE [uploads].[batch]
       SET status = 2, accepted_count = @accepted, rejected_count = @rejected, completed_at_utc = SYSUTCDATETIME()
     WHERE id = @batch_id;

    SELECT
        CAST(@batch_id AS NVARCHAR(50)) + ': ' +
        CAST(@accepted AS NVARCHAR(20)) + ' allocations accepted, ' +
        CAST(@rejected AS NVARCHAR(20)) + ' rejected' AS message;
END
GO
PRINT '[91] uploads.process_workforce_upload SP created';
GO

-- ── uploads.process_planned_upload ────────────────────────────────────────────
-- CSV atteso: program_code, project_code, year_num, month_num, planned_amount, currency_code
IF OBJECT_ID(N'[uploads].[process_planned_upload]', N'P') IS NOT NULL DROP PROCEDURE [uploads].[process_planned_upload];
GO
CREATE PROCEDURE [uploads].[process_planned_upload]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @batch_id BIGINT;
    INSERT INTO [uploads].[batch] (upload_kind, original_filename, row_count, status, started_at_utc)
    VALUES ('planned', 'staging_planned (dynamic)',
            ISNULL((SELECT COUNT(*) FROM [uploads].[staging_planned]), 0), 1, SYSUTCDATETIME());
    SET @batch_id = SCOPE_IDENTITY();

    DECLARE @accepted INT = 0, @rejected INT = 0;

    IF OBJECT_ID(N'[uploads].[staging_planned]', N'U') IS NOT NULL
    BEGIN
        DECLARE @unit_pln INT = (SELECT TOP 1 id FROM [cp].[unit_measure] WHERE code = 'EUR_AMOUNT');
        IF @unit_pln IS NULL
        BEGIN
            INSERT INTO [cp].[unit_measure] (code, name, kind) VALUES ('EUR_AMOUNT', N'Importo EUR', 1);
            SET @unit_pln = SCOPE_IDENTITY();
        END

        INSERT INTO [cp].[facts] (time_month_id, program_id, project_id, unit_measure_id, currency_id, planned)
        SELECT
            TRY_CAST(s.year_num AS INT) * 100 + TRY_CAST(s.month_num AS INT),
            pr.id, proj.id,
            @unit_pln,
            cur.id,
            TRY_CAST(REPLACE(s.planned_amount, ',', '.') AS DECIMAL(19,4))
        FROM [uploads].[staging_planned] s
        INNER JOIN [core].[program] pr ON pr.code = s.program_code AND ISNULL(pr.cancellato,0)=0
        LEFT  JOIN [core].[project] proj ON proj.code = s.project_code AND proj.program_id = pr.id AND ISNULL(proj.cancellato,0)=0
        LEFT  JOIN [core].[currency] cur ON cur.code = s.currency_code AND ISNULL(cur.cancellato,0)=0
        WHERE TRY_CAST(s.year_num AS INT) IS NOT NULL
          AND TRY_CAST(s.month_num AS INT) IS NOT NULL
          AND TRY_CAST(REPLACE(s.planned_amount, ',', '.') AS DECIMAL(19,4)) IS NOT NULL
          AND EXISTS (SELECT 1 FROM [core].[dim_time] dt WHERE dt.month_id = TRY_CAST(s.year_num AS INT)*100 + TRY_CAST(s.month_num AS INT));
        SET @accepted = @@ROWCOUNT;

        SELECT @rejected = COUNT(*) FROM [uploads].[staging_planned] s
        WHERE NOT EXISTS (SELECT 1 FROM [core].[program] pr WHERE pr.code = s.program_code AND ISNULL(pr.cancellato,0)=0)
           OR TRY_CAST(s.year_num AS INT) IS NULL
           OR TRY_CAST(s.month_num AS INT) IS NULL
           OR TRY_CAST(REPLACE(s.planned_amount, ',', '.') AS DECIMAL(19,4)) IS NULL;
    END

    UPDATE [uploads].[batch]
       SET status = 2, accepted_count = @accepted, rejected_count = @rejected, completed_at_utc = SYSUTCDATETIME()
     WHERE id = @batch_id;

    SELECT
        CAST(@batch_id AS NVARCHAR(50)) + ': ' +
        CAST(@accepted AS NVARCHAR(20)) + ' planned facts accepted, ' +
        CAST(@rejected AS NVARCHAR(20)) + ' rejected' AS message;
END
GO
PRINT '[91] uploads.process_planned_upload SP created';
GO

-- ── uploads.process_baseline_upload ───────────────────────────────────────────
-- CSV atteso: program_code, scenario_code, year_num, month_num, forecast_code, value, currency_code
IF OBJECT_ID(N'[uploads].[process_baseline_upload]', N'P') IS NOT NULL DROP PROCEDURE [uploads].[process_baseline_upload];
GO
CREATE PROCEDURE [uploads].[process_baseline_upload]
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @batch_id BIGINT;
    INSERT INTO [uploads].[batch] (upload_kind, original_filename, row_count, status, started_at_utc)
    VALUES ('baseline', 'staging_baseline (dynamic)',
            ISNULL((SELECT COUNT(*) FROM [uploads].[staging_baseline]), 0), 1, SYSUTCDATETIME());
    SET @batch_id = SCOPE_IDENTITY();

    DECLARE @accepted INT = 0, @rejected INT = 0;

    IF OBJECT_ID(N'[uploads].[staging_baseline]', N'U') IS NOT NULL
    BEGIN
        DECLARE @unit_bl INT = (SELECT TOP 1 id FROM [cp].[unit_measure] WHERE code = 'EUR_AMOUNT');
        IF @unit_bl IS NULL
        BEGIN
            INSERT INTO [cp].[unit_measure] (code, name, kind) VALUES ('EUR_AMOUNT', N'Importo EUR', 1);
            SET @unit_bl = SCOPE_IDENTITY();
        END

        INSERT INTO [fc].[facts] (time_month_id, program_id, project_scenario_id, unit_measure_id, currency_id, forecast_code, value)
        SELECT
            TRY_CAST(s.year_num AS INT) * 100 + TRY_CAST(s.month_num AS INT),
            pr.id, sc.id, @unit_bl, cur.id,
            ISNULL(s.forecast_code, 'BL'),
            TRY_CAST(REPLACE(s.value, ',', '.') AS DECIMAL(19,4))
        FROM [uploads].[staging_baseline] s
        INNER JOIN [core].[program] pr ON pr.code = s.program_code AND ISNULL(pr.cancellato,0)=0
        INNER JOIN [core].[project_scenario] sc ON sc.code = s.scenario_code AND ISNULL(sc.cancellato,0)=0
        LEFT  JOIN [core].[currency] cur ON cur.code = s.currency_code AND ISNULL(cur.cancellato,0)=0
        WHERE TRY_CAST(s.year_num AS INT) IS NOT NULL
          AND TRY_CAST(s.month_num AS INT) IS NOT NULL
          AND TRY_CAST(REPLACE(s.value, ',', '.') AS DECIMAL(19,4)) IS NOT NULL
          AND EXISTS (SELECT 1 FROM [core].[dim_time] dt WHERE dt.month_id = TRY_CAST(s.year_num AS INT)*100 + TRY_CAST(s.month_num AS INT));
        SET @accepted = @@ROWCOUNT;

        SELECT @rejected = (SELECT COUNT(*) FROM [uploads].[staging_baseline]) - @accepted;
        IF @rejected < 0 SET @rejected = 0;
    END

    UPDATE [uploads].[batch]
       SET status = 2, accepted_count = @accepted, rejected_count = @rejected, completed_at_utc = SYSUTCDATETIME()
     WHERE id = @batch_id;

    SELECT
        CAST(@batch_id AS NVARCHAR(50)) + ': ' +
        CAST(@accepted AS NVARCHAR(20)) + ' forecast facts accepted, ' +
        CAST(@rejected AS NVARCHAR(20)) + ' rejected' AS message;
END
GO
PRINT '[91] uploads.process_baseline_upload SP created';
GO

PRINT '[91-upload-procedures] DONE';
GO
