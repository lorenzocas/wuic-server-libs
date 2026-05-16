-- =============================================================================
-- CostCnh_Data — integrations schema: cursor tables per Provider Symmetry
-- =============================================================================
-- Una sola riga per provider (PK = provider). Tracking di polling state:
--   - last_etag / last_message_id   → cursor incrementale del feed remoto
--   - last_polled_utc                → ultimo tick handler
--   - next_eligible_utc              → throttle: poll-now no-op se <NOW
--   - poll_state                     → 'idle' | 'running' | 'error'
--   - last_error_text / consecutive_errors → backoff esponenziale lato handler
--   - payload_json                   → state-bag opzionale del provider
--
-- Replica/sostituisce le legacy ProgramConsolidationQueue / ForecastCalc
-- + scattered SAP/BPM/Timesheet/MAC log tables.
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

IF SCHEMA_ID('integrations') IS NULL EXEC('CREATE SCHEMA [integrations]');
GO

-- ── integrations.provider_cursor ─────────────────────────────────────────────
-- Tabella unica per TUTTI i provider (sap/bpm/timesheet/mac).
-- Discriminata da `system` (varchar). Singolo row per (system,provider).
IF OBJECT_ID(N'[integrations].[provider_cursor]', N'U') IS NULL
BEGIN
    CREATE TABLE [integrations].[provider_cursor] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_provider_cursor PRIMARY KEY CLUSTERED,
        system                  VARCHAR(20) NOT NULL,                          -- 'sap' | 'bpm' | 'timesheet' | 'mac'
        provider                VARCHAR(20) NOT NULL,                          -- 'Stub' | 'Http' | future variants
        last_etag               VARCHAR(200) NULL,
        last_message_id         VARCHAR(200) NULL,
        last_polled_utc         DATETIME2(3) NULL,
        next_eligible_utc       DATETIME2(3) NULL,
        poll_state              VARCHAR(20) NOT NULL CONSTRAINT DF_provider_cursor_poll_state DEFAULT ('idle'),
        last_error_text         NVARCHAR(2000) NULL,
        consecutive_errors      INT NOT NULL CONSTRAINT DF_provider_cursor_consecutive_errors DEFAULT (0),
        payload_json            NVARCHAR(MAX) NULL,
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_provider_cursor_data_creazione DEFAULT (SYSUTCDATETIME()),
        data_modifica           DATETIME2(3) NULL,
        CONSTRAINT UQ_provider_cursor_system_provider UNIQUE (system, provider)
    );
    CREATE INDEX ix_provider_cursor_eligible ON [integrations].[provider_cursor](next_eligible_utc, poll_state)
        WHERE poll_state <> 'running';
    PRINT '[60-integrations] integrations.provider_cursor created';
END
GO

-- ── Helper SP: provider_cursor_upsert ────────────────────────────────────────
IF OBJECT_ID(N'[integrations].[provider_cursor_upsert]', N'P') IS NOT NULL DROP PROCEDURE [integrations].[provider_cursor_upsert];
GO
CREATE PROCEDURE [integrations].[provider_cursor_upsert]
    @system VARCHAR(20),
    @provider VARCHAR(20),
    @last_etag VARCHAR(200) = NULL,
    @last_message_id VARCHAR(200) = NULL,
    @poll_state VARCHAR(20) = 'idle',
    @last_error_text NVARCHAR(2000) = NULL,
    @next_eligible_utc DATETIME2(3) = NULL,
    @payload_json NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @now DATETIME2(3) = SYSUTCDATETIME();

    MERGE [integrations].[provider_cursor] AS tgt
    USING (SELECT @system AS s, @provider AS p) AS src
       ON tgt.system = src.s AND tgt.provider = src.p
    WHEN MATCHED THEN UPDATE SET
        last_etag         = COALESCE(@last_etag, tgt.last_etag),
        last_message_id   = COALESCE(@last_message_id, tgt.last_message_id),
        last_polled_utc   = @now,
        next_eligible_utc = COALESCE(@next_eligible_utc, tgt.next_eligible_utc),
        poll_state        = @poll_state,
        last_error_text   = CASE WHEN @poll_state = 'error' THEN @last_error_text ELSE NULL END,
        consecutive_errors = CASE
            WHEN @poll_state = 'error' THEN tgt.consecutive_errors + 1
            WHEN @poll_state = 'idle'  THEN 0
            ELSE tgt.consecutive_errors
        END,
        payload_json      = COALESCE(@payload_json, tgt.payload_json),
        data_modifica     = @now
    WHEN NOT MATCHED THEN INSERT (system, provider, last_etag, last_message_id, last_polled_utc, next_eligible_utc, poll_state, last_error_text, payload_json)
        VALUES (@system, @provider, @last_etag, @last_message_id, @now, @next_eligible_utc, @poll_state, CASE WHEN @poll_state = 'error' THEN @last_error_text ELSE NULL END, @payload_json);
END
GO
PRINT '[60-integrations] integrations.provider_cursor_upsert SP created';
GO

-- ── integrations.message_envelope (inbound + outbound history) ──────────────
-- Append-only log dei messaggi scambiati con i 4 sistemi esterni.
-- Sostituisce ProgramConsolidationLog / ForecastCalculationQueue / scattered
-- *Log tables del legacy.
IF OBJECT_ID(N'[integrations].[message_envelope]', N'U') IS NULL
BEGIN
    CREATE TABLE [integrations].[message_envelope] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_message_envelope PRIMARY KEY CLUSTERED,
        system                  VARCHAR(20) NOT NULL,                          -- sap/bpm/timesheet/mac
        direction               CHAR(3) NOT NULL,                              -- 'IN ' | 'OUT'
        message_id              VARCHAR(200) NULL,
        related_entity_schema   SYSNAME NULL,
        related_entity_name     SYSNAME NULL,
        related_entity_id       NVARCHAR(64) NULL,
        program_id              INT NULL,
        payload_json            NVARCHAR(MAX) NULL,
        status                  TINYINT NOT NULL CONSTRAINT DF_message_envelope_status DEFAULT (1),
                                -- 0=fail, 1=ok, 2=pending_ack
        outcome_text            NVARCHAR(2000) NULL,
        sent_at_utc             DATETIME2(3) NULL,
        received_at_utc         DATETIME2(3) NULL,
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_message_envelope_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL
    );
    CREATE INDEX ix_message_envelope_system_dir ON [integrations].[message_envelope](system, direction, data_creazione DESC);
    CREATE INDEX ix_message_envelope_entity ON [integrations].[message_envelope](related_entity_schema, related_entity_name, related_entity_id)
        WHERE related_entity_id IS NOT NULL;
    CREATE INDEX ix_message_envelope_program ON [integrations].[message_envelope](program_id, data_creazione DESC)
        WHERE program_id IS NOT NULL;
    PRINT '[60-integrations] integrations.message_envelope created (3 NC indexes)';
END
GO

PRINT '[60-integrations] DONE';
GO
