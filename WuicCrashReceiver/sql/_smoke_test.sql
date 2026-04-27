/*
 * Smoke test del schema 001_init.
 * Eseguito con: sqlcmd -d WuicCrashes -i _smoke_test.sql
 * Tutto idempotente — fa cleanup all'inizio e alla fine.
 */
USE WuicCrashes;
SET NOCOUNT ON;

PRINT '=== Cleanup ===';
DELETE FROM _wuic_crash_reports WHERE client_id LIKE 'smoke@%';
DELETE FROM _wuic_crash_consents WHERE client_id LIKE 'smoke@%';

PRINT '=== INSERT 1 — first occurrence ===';
INSERT INTO _wuic_crash_reports (client_id, client_tier, machine_fingerprint, release_tag, source, type, message, stack_hash, stack_raw, url, breadcrumbs, extra)
VALUES ('smoke@example.com', 'developer', 'fp-deadbeef', 'wuic@1.0.0', 'js', 'TypeError', 'Cannot read properties of null', 'h_aaaa1111', 'TypeError: ...\n  at foo (bundle.js:42)', '/cities/list', '[]', '{}');
SELECT id, client_id, occurrences, first_seen, last_seen FROM _wuic_crash_reports WHERE client_id='smoke@example.com';

PRINT '=== INSERT 2 — same dedup key (must hit unique constraint) ===';
BEGIN TRY
    INSERT INTO _wuic_crash_reports (client_id, client_tier, release_tag, source, type, message, stack_hash, stack_raw)
    VALUES ('smoke@example.com', 'developer', 'wuic@1.0.0', 'js', 'TypeError', 'Cannot read', 'h_aaaa1111', '...');
    PRINT 'UNEXPECTED: insert duplicate succeeded';
END TRY
BEGIN CATCH
    PRINT 'EXPECTED: dedup constraint hit -> ' + ERROR_MESSAGE();
END CATCH;

PRINT '=== MERGE — production dedup pattern (insert OR update occurrences/last_seen) ===';
DECLARE @client NVARCHAR(256) = 'smoke@example.com';
DECLARE @release NVARCHAR(64) = 'wuic@1.0.0';
DECLARE @hash NVARCHAR(64) = 'h_aaaa1111';

MERGE _wuic_crash_reports AS target
USING (SELECT @client AS client_id, @release AS release_tag, @hash AS stack_hash) AS src
   ON target.client_id = src.client_id AND target.release_tag = src.release_tag AND target.stack_hash = src.stack_hash
WHEN MATCHED THEN UPDATE SET
    last_seen = SYSUTCDATETIME(),
    occurrences = target.occurrences + 1
WHEN NOT MATCHED THEN
    INSERT (client_id, client_tier, release_tag, source, type, message, stack_hash, stack_raw)
    VALUES (@client, 'developer', @release, 'js', 'TypeError', 'Cannot read', @hash, '...');

SELECT id, client_id, occurrences, first_seen, last_seen FROM _wuic_crash_reports WHERE client_id=@client;

PRINT '=== MERGE 2 — different stack_hash → new row ===';
SET @hash = 'h_bbbb2222';
MERGE _wuic_crash_reports AS target
USING (SELECT @client AS client_id, @release AS release_tag, @hash AS stack_hash) AS src
   ON target.client_id = src.client_id AND target.release_tag = src.release_tag AND target.stack_hash = src.stack_hash
WHEN MATCHED THEN UPDATE SET last_seen = SYSUTCDATETIME(), occurrences = target.occurrences + 1
WHEN NOT MATCHED THEN
    INSERT (client_id, client_tier, release_tag, source, type, message, stack_hash, stack_raw)
    VALUES (@client, 'developer', @release, 'js', 'ReferenceError', 'foo is not defined', @hash, '...other stack...');

SELECT id, client_id, stack_hash, occurrences FROM _wuic_crash_reports WHERE client_id=@client ORDER BY id;

PRINT '=== Consent test — INSERT 2 rows (consent on/off) ===';
INSERT INTO _wuic_crash_consents (client_id, license_email, consent_granted, consent_locale, consent_disclaimer_version, machine_fingerprint, client_ip, user_agent)
VALUES ('smoke@example.com', 'smoke@example.com', 1, 'it-IT', 'v1', 'fp-deadbeef', '1.2.3.4', 'Mozilla/...');
INSERT INTO _wuic_crash_consents (client_id, license_email, consent_granted, consent_locale, consent_disclaimer_version)
VALUES ('smoke@example.com', 'smoke@example.com', 0, 'it-IT', 'v1');

SELECT id, consent_granted, consent_disclaimer_version, consent_timestamp FROM _wuic_crash_consents WHERE client_id='smoke@example.com' ORDER BY id;

PRINT '=== Filtered index check (unresolved) ===';
SELECT id, last_seen, resolved FROM _wuic_crash_reports WHERE client_id='smoke@example.com' AND resolved = 0 ORDER BY last_seen DESC;

PRINT '=== Cleanup ===';
DELETE FROM _wuic_crash_reports WHERE client_id LIKE 'smoke@%';
DELETE FROM _wuic_crash_consents WHERE client_id LIKE 'smoke@%';

PRINT '=== Smoke test completed successfully ===';
