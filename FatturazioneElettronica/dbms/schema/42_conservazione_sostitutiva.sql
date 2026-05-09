/* ============================================================
   42_conservazione_sostitutiva.sql

   Schema per la conservazione sostitutiva (digitale a norma) delle
   fatture elettroniche per 10 anni, come richiesto da AgID
   (DPCM 3/12/2013, Linee Guida AgID 2021/12).

   Pacchetto di Conservazione (PdC) per ogni fattura: hash SHA-256
   del file + timestamp digitale RFC 3161 + metadati AgID + provider
   responsabile.

   Provider supportati (ISdiConservation):
     - Filesystem: locale (default), salva file + index DB + RFC3161 timestamp
     - Aruba    : API integration (a pagamento)
     - InfoCert : API integration (a pagamento)

   Tabella `conservazione_index`: una riga per ogni fattura conservata.
   Linkata a fatture_inviate via fattura_id. Audit immutabile (solo INSERT).
   ============================================================ */
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;

IF OBJECT_ID('dbo.conservazione_index', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.conservazione_index (
        id                  INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        fattura_id          INT NOT NULL,
        nome_file           NVARCHAR(256) NOT NULL,        -- es. ITxxx_00001.xml.p7m
        file_size_bytes     BIGINT NOT NULL,
        sha256_hash         CHAR(64) NOT NULL,             -- hex SHA-256
        provider            NVARCHAR(64) NOT NULL,         -- Filesystem | Aruba | InfoCert
        storage_location    NVARCHAR(1024) NOT NULL,       -- path filesystem o URN provider
        rfc3161_timestamp   VARBINARY(MAX) NULL,           -- TimeStampToken RFC 3161 (binario DER)
        rfc3161_tsa_url     NVARCHAR(512) NULL,            -- URL TSA usata (es. https://freetsa.org/tsr)
        rfc3161_serial_hex  VARCHAR(128) NULL,             -- serialNumber del token (per audit)
        sealed_at           DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        sealed_by_user_id   NVARCHAR(64) NULL,             -- chi ha sigillato (audit GDPR)
        retention_until     DATE NOT NULL DEFAULT DATEADD(YEAR, 10, GETUTCDATE()), -- 10 anni AgID
        metadata_json       NVARCHAR(MAX) NULL,            -- JSON con CedentePrestatore, CessionarioCommittente, anno, importo (estratti per ricerca)
        provider_response   NVARCHAR(MAX) NULL,            -- response payload del provider (Aruba/InfoCert) per audit
        last_verified_at    DATETIME2 NULL,                -- ultima verifica integrita' (re-hash + match)
        last_verified_ok    BIT NULL                       -- esito ultima verifica
    );
    PRINT 'Created table dbo.conservazione_index';
END
ELSE
    PRINT 'Table dbo.conservazione_index already exists';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_conservazione_fattura' AND object_id = OBJECT_ID('dbo.conservazione_index'))
    CREATE INDEX IX_conservazione_fattura ON dbo.conservazione_index(fattura_id, sealed_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_conservazione_hash' AND object_id = OBJECT_ID('dbo.conservazione_index'))
    CREATE INDEX IX_conservazione_hash ON dbo.conservazione_index(sha256_hash);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_conservazione_retention' AND object_id = OBJECT_ID('dbo.conservazione_index'))
    CREATE INDEX IX_conservazione_retention ON dbo.conservazione_index(retention_until)
        INCLUDE (fattura_id, provider);

PRINT 'Indexes ensured';
