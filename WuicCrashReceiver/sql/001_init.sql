/*
 * WuicCrashes — initial schema
 * ─────────────────────────────────────────────────────────────────────────
 *  DB target: WuicCrashes (separato da WuicLicensing/dati app)
 *  Idempotente: ogni statement protetto da IF NOT EXISTS / sys-catalog check.
 *  Eseguire con `sqlcmd -S <server> -d master -i 001_init.sql`.
 *
 *  Riferimento: skills/crash-reporting/SKILL.md sezione 3.
 */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

-- ── 1. Database ────────────────────────────────────────────────────────
IF DB_ID('WuicCrashes') IS NULL
BEGIN
    PRINT 'Creating database [WuicCrashes]...';
    CREATE DATABASE WuicCrashes;
END
ELSE
    PRINT 'Database [WuicCrashes] already exists.';
GO

USE WuicCrashes;
GO

-- ── 2. _wuic_crash_reports ─────────────────────────────────────────────
IF OBJECT_ID('dbo._wuic_crash_reports', 'U') IS NULL
BEGIN
    PRINT 'Creating table [_wuic_crash_reports]...';
    CREATE TABLE dbo._wuic_crash_reports (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        client_id NVARCHAR(256) NOT NULL,           -- license email (source of truth)
        client_tier NVARCHAR(32) NOT NULL,          -- 'developer'|'professional'|'custom'
        machine_fingerprint NVARCHAR(128) NULL,
        release_tag NVARCHAR(64) NOT NULL,          -- "wuic@1.2.3" — `release` is reserved on some MSSQL setups
        source NVARCHAR(16) NOT NULL,               -- '.net' | 'js'
        type NVARCHAR(256) NOT NULL,                -- 'TypeError' | 'NullReferenceException'
        message NVARCHAR(2000) NOT NULL,
        stack_hash NVARCHAR(64) NOT NULL,           -- SHA-256 dello stack canonicalizzato
        stack_raw NVARCHAR(MAX) NOT NULL,           -- offuscato as-is (deobfuscation on demand)
        url NVARCHAR(1000) NULL,
        user_id NVARCHAR(128) NULL,
        user_agent NVARCHAR(500) NULL,
        breadcrumbs NVARCHAR(MAX) NULL,             -- JSON array ultimi N eventi
        extra NVARCHAR(MAX) NULL,                   -- JSON: headers, queryParams, route, ...
        first_seen DATETIME2 NOT NULL CONSTRAINT DF_crash_first_seen DEFAULT SYSUTCDATETIME(),
        last_seen DATETIME2 NOT NULL CONSTRAINT DF_crash_last_seen DEFAULT SYSUTCDATETIME(),
        occurrences INT NOT NULL CONSTRAINT DF_crash_occurrences DEFAULT 1,
        license_expired_at_ingest BIT NOT NULL CONSTRAINT DF_crash_lic_exp DEFAULT 0,
        resolved BIT NOT NULL CONSTRAINT DF_crash_resolved DEFAULT 0,
        resolved_at DATETIME2 NULL,
        resolved_by NVARCHAR(128) NULL,
        notes NVARCHAR(MAX) NULL
    );
END
ELSE
    PRINT 'Table [_wuic_crash_reports] already exists.';
GO

-- ── 3. Indexes — _wuic_crash_reports ───────────────────────────────────
-- Dedup unico (client+release+stack_hash). Una violazione → MERGE update
-- side dell'ingest service incrementa `occurrences` + `last_seen`.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_crash_dedup' AND object_id=OBJECT_ID('dbo._wuic_crash_reports'))
    CREATE UNIQUE INDEX UX_crash_dedup ON dbo._wuic_crash_reports(client_id, release_tag, stack_hash);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_crash_last_seen' AND object_id=OBJECT_ID('dbo._wuic_crash_reports'))
    CREATE INDEX IX_crash_last_seen ON dbo._wuic_crash_reports(last_seen DESC);
GO

-- Triage list view: filtered index su unresolved sort by last_seen desc
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_crash_unresolved' AND object_id=OBJECT_ID('dbo._wuic_crash_reports'))
    CREATE INDEX IX_crash_unresolved ON dbo._wuic_crash_reports(resolved, last_seen DESC) WHERE resolved = 0;
GO

-- ── 4. _wuic_crash_consents (GDPR audit trail) ─────────────────────────
IF OBJECT_ID('dbo._wuic_crash_consents', 'U') IS NULL
BEGIN
    PRINT 'Creating table [_wuic_crash_consents]...';
    CREATE TABLE dbo._wuic_crash_consents (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        client_id NVARCHAR(256) NOT NULL,
        license_email NVARCHAR(256) NOT NULL,
        consent_granted BIT NOT NULL,                -- true=enable, false=disable
        consent_timestamp DATETIME2 NOT NULL CONSTRAINT DF_consent_ts DEFAULT SYSUTCDATETIME(),
        consent_locale NVARCHAR(10) NULL,
        consent_disclaimer_version NVARCHAR(16) NOT NULL,
        machine_fingerprint NVARCHAR(128) NULL,
        client_ip NVARCHAR(64) NULL,
        user_agent NVARCHAR(500) NULL
    );
END
ELSE
    PRINT 'Table [_wuic_crash_consents] already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_consent_client' AND object_id=OBJECT_ID('dbo._wuic_crash_consents'))
    CREATE INDEX IX_consent_client ON dbo._wuic_crash_consents(client_id, consent_timestamp DESC);
GO

PRINT 'WuicCrashes schema migration 001_init applied successfully.';
GO
