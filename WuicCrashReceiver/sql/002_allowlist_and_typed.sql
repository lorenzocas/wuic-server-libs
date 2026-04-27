/*
 * WuicCrashes — migration 002: typed-error payload + receiver allowlist.
 * ──────────────────────────────────────────────────────────────────────
 *  Skill crash-reporting Commit 8b (B+M3):
 *    B. Payload arricchito: error_code / args_json / is_typed
 *       Permette di raggruppare per `errorCode` invece che per `stackHash`
 *       (lo stack puo' variare, l'errorCode no) → triage piu' coerente.
 *    M3 ibrido. Il client filtra una blacklist hardcoded di prefix
 *       zero-value (vedi `CrashReportingService` lato client). Il
 *       receiver applica un secondo filtro DB-driven con allowlist +
 *       rate-limit per (client_id, error_code, ora) + sample rate
 *       deterministico per stack_hash.
 *
 *  Idempotente: ogni statement protetto da sys-catalog check / IF NOT EXISTS.
 *  Eseguire DOPO 001_init.sql contro lo stesso DB WuicCrashes.
 */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE WuicCrashes;
GO

-- ── 1. Estendi _wuic_crash_reports con i campi typed-error ─────────────
IF COL_LENGTH('dbo._wuic_crash_reports', 'error_code') IS NULL
BEGIN
    PRINT 'Adding column [error_code] to [_wuic_crash_reports]...';
    ALTER TABLE dbo._wuic_crash_reports
        ADD error_code NVARCHAR(128) NULL;
END
ELSE
    PRINT 'Column [error_code] already exists.';
GO

IF COL_LENGTH('dbo._wuic_crash_reports', 'args_json') IS NULL
BEGIN
    PRINT 'Adding column [args_json] to [_wuic_crash_reports]...';
    ALTER TABLE dbo._wuic_crash_reports
        ADD args_json NVARCHAR(MAX) NULL;
END
ELSE
    PRINT 'Column [args_json] already exists.';
GO

IF COL_LENGTH('dbo._wuic_crash_reports', 'is_typed') IS NULL
BEGIN
    PRINT 'Adding column [is_typed] to [_wuic_crash_reports]...';
    ALTER TABLE dbo._wuic_crash_reports
        ADD is_typed BIT NOT NULL CONSTRAINT DF_crash_is_typed DEFAULT 0;
END
ELSE
    PRINT 'Column [is_typed] already exists.';
GO

-- Filtered index per la dashboard "group by errorCode" (Commit 10).
-- Sparso: solo le righe con errorCode non-null contribuiscono → index
-- piccolo + scan velocissimo per i raggruppamenti.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_crash_error_code' AND object_id=OBJECT_ID('dbo._wuic_crash_reports'))
    CREATE INDEX IX_crash_error_code ON dbo._wuic_crash_reports(error_code, last_seen DESC) WHERE error_code IS NOT NULL;
GO

-- ── 2. _wuic_crash_allowlist — server-side hard filter ─────────────────
-- Pattern matching:
--   - exact: pattern senza '%' / '*' → match contro errorCode esatto
--   - prefix: pattern terminante con '%' (LIKE-style) → match per prefix
--   - "<unhandled>": speciale, matcha tutte le righe con errorCode IS NULL
--                   (eccezioni raw .NET / JS senza errorCode tipizzato)
IF OBJECT_ID('dbo._wuic_crash_allowlist', 'U') IS NULL
BEGIN
    PRINT 'Creating table [_wuic_crash_allowlist]...';
    CREATE TABLE dbo._wuic_crash_allowlist (
        id INT IDENTITY(1,1) PRIMARY KEY,
        pattern NVARCHAR(128) NOT NULL,
        enabled BIT NOT NULL CONSTRAINT DF_allowlist_enabled DEFAULT 1,
        rate_limit_per_hour INT NULL,        -- NULL = no rate limit
        sample_rate FLOAT NOT NULL CONSTRAINT DF_allowlist_sample DEFAULT 1.0,  -- 0.0..1.0
        notes NVARCHAR(500) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_allowlist_created DEFAULT SYSUTCDATETIME(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_allowlist_updated DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UX_allowlist_pattern ON dbo._wuic_crash_allowlist(pattern);
END
ELSE
    PRINT 'Table [_wuic_crash_allowlist] already exists.';
GO

-- ── 3. _wuic_crash_rate_buckets — per-(client, errorCode, hour) counters
-- Bucket sliding-hour: una riga per (client_id, error_code, hour_bucket_utc).
-- Il filtro incrementa il counter; se >= rate_limit_per_hour il payload
-- viene scartato. Pulizia opzionale via JOB/cleanup (vedi notes).
IF OBJECT_ID('dbo._wuic_crash_rate_buckets', 'U') IS NULL
BEGIN
    PRINT 'Creating table [_wuic_crash_rate_buckets]...';
    CREATE TABLE dbo._wuic_crash_rate_buckets (
        client_id NVARCHAR(256) NOT NULL,
        error_code NVARCHAR(128) NOT NULL,    -- '<unhandled>' per le untyped
        hour_bucket_utc DATETIME2 NOT NULL,
        counter INT NOT NULL,
        CONSTRAINT PK_rate_buckets PRIMARY KEY (client_id, error_code, hour_bucket_utc)
    );
END
ELSE
    PRINT 'Table [_wuic_crash_rate_buckets] already exists.';
GO

-- ── 4. Seed allowlist iniziale ─────────────────────────────────────────
-- Idempotente: MERGE WHEN NOT MATCHED. Se vuoi modificare i default li
-- aggiorni manualmente via UPDATE (no automatic update via re-run).

;WITH seed(pattern, enabled, rate_limit_per_hour, sample_rate, notes) AS (
    SELECT * FROM (VALUES
        -- Untyped (.NET unhandled, raw JS Error, ecc.) — sempre alta priorita'.
        (N'<unhandled>',                          1, 200,  1.0,   N'Raw exceptions without WUIC errorCode (NullReferenceException, TypeError, etc.) — top triage value'),

        -- Server-side WuicException categories.
        (N'errors.server.unhandled',              1, 200,  1.0,   N'Server unhandled — same as <unhandled> but the JsonExceptionFilter wrapped it'),
        (N'errors.db.sql_exception',              1, 100,  1.0,   N'SQL Server passthrough — full payload, no localization (DB outage, deadlock, schema drift)'),
        (N'errors.metadata.route.not_found',      1,  50,  0.5,   N'Route 404 from AsmxProxy — half-sample, frequent on user typos'),
        (N'errors.metadata.props_bag.malformed',  1,  20,  0.2,   N'Customer metadata corruption — sample 20% (frequent during designer iterations)'),

        -- Client-side WuicClientException categories — framework bugs.
        (N'errors.client.unknown',                1, 100,  1.0,   N'Catch-all client error pre-typing — full sample'),
        (N'errors.client.archetype.%',            1,  50,  1.0,   N'Archetype renderer crash (chart/kanban/scheduler/...) — framework bug'),
        (N'errors.client.metadata.lookup_orphan', 1,  30,  0.5,   N'Lookup field pointing to missing route — half-sample'),
        (N'errors.client.metadata.cache_miss',    1,  20,  0.1,   N'Cache miss after metadata bump — high frequency, sample 10%'),
        (N'errors.client.props_bag.malformed',    1,  20,  0.2,   N'Mirror of server-side props_bag malformed (parsed in JS)'),
        (N'errors.client.window.unhandled',       1, 100,  1.0,   N'Window-level error caught by global handler — full sample'),
        (N'errors.client.promise.unhandled',      1, 100,  1.0,   N'Promise rejection unhandled — full sample')

        -- INTENZIONALMENTE ASSENTI (zero-value, gia' droppati lato client):
        --   errors.client.user_callback.*   → codice utente nei converter/template
        --   errors.input.required, .invalid → validation utente
        --   errors.auth.unauthenticated     → sessione scaduta
        --   errors.auth.unauthorized        → permessi insufficienti
        --   errors.auth.operation_disabled  → md_editable=false
        --   errors.auth.cookie_malformed    → cookie tampering
    ) AS v(pattern, enabled, rate_limit_per_hour, sample_rate, notes)
)
MERGE dbo._wuic_crash_allowlist AS target
USING seed AS src ON target.pattern = src.pattern
WHEN NOT MATCHED THEN INSERT (pattern, enabled, rate_limit_per_hour, sample_rate, notes)
    VALUES (src.pattern, src.enabled, src.rate_limit_per_hour, src.sample_rate, src.notes);
GO

DECLARE @count INT = (SELECT COUNT(*) FROM dbo._wuic_crash_allowlist);
PRINT CONCAT('Allowlist patterns total: ', @count);
GO

PRINT 'WuicCrashes schema migration 002_allowlist_and_typed applied successfully.';
GO
