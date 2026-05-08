-- =============================================================================
-- Patch: trasforma `causale` (text) di fatture_inviate in lookup verso una
-- nuova tabella `causali`.
--
-- Steps DB Dati (FatturazioneElettronica_Data):
--   1. CREATE TABLE causali (id, codice, descrizione, attivo)
--   2. Seed causali standard (vendita beni, prestazione, nota credito, ...)
--   3. ALTER fatture_inviate ADD causale_id INT NULL + FK
--
-- Idempotente: usa IF NOT EXISTS / NOT EXISTS su tutto.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;

-- 1) Tabella causali ----------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'causali')
BEGIN
  CREATE TABLE dbo.causali (
    id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_causali PRIMARY KEY,
    codice        VARCHAR(20)  NULL,
    descrizione   VARCHAR(200) NOT NULL,
    note          VARCHAR(500) NULL,
    attivo        BIT          NOT NULL CONSTRAINT DF_causali_attivo DEFAULT(1),
    cancellato    BIT          NOT NULL CONSTRAINT DF_causali_cancellato DEFAULT(0),
    data_creazione  DATETIME   NOT NULL CONSTRAINT DF_causali_data_creazione DEFAULT(GETDATE()),
    data_modifica   DATETIME   NULL,
    utente_creazione VARCHAR(100) NULL,
    utente_modifica  VARCHAR(100) NULL,
    CONSTRAINT UQ_causali_codice UNIQUE (codice)
  );
END
GO

-- 2) Seed -------------------------------------------------------------------
;WITH src(codice, descrizione) AS (
  SELECT 'VENDITA',     'Vendita di beni' UNION ALL
  SELECT 'SERVIZI',     'Prestazione di servizi' UNION ALL
  SELECT 'NOTA_CREDITO','Nota di credito' UNION ALL
  SELECT 'NOTA_DEBITO', 'Nota di debito' UNION ALL
  SELECT 'ACCONTO',     'Acconto su fornitura' UNION ALL
  SELECT 'SALDO',       'Saldo prestazione' UNION ALL
  SELECT 'CANONE',      'Canone periodico' UNION ALL
  SELECT 'CONSULENZA',  'Consulenza professionale' UNION ALL
  SELECT 'RIMBORSO',    'Rimborso spese' UNION ALL
  SELECT 'ALTRO',       'Altro'
)
INSERT INTO dbo.causali (codice, descrizione)
SELECT s.codice, s.descrizione
  FROM src s
 WHERE NOT EXISTS (SELECT 1 FROM dbo.causali c WHERE c.codice = s.codice);
GO

-- 3) ALTER fatture_inviate ----------------------------------------------------
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
   WHERE object_id = OBJECT_ID('dbo.fatture_inviate') AND name = 'causale_id'
)
BEGIN
  ALTER TABLE dbo.fatture_inviate ADD causale_id INT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_fatture_inviate_causali'
)
BEGIN
  ALTER TABLE dbo.fatture_inviate
    ADD CONSTRAINT FK_fatture_inviate_causali
    FOREIGN KEY (causale_id) REFERENCES dbo.causali(id);
END
GO

SELECT 'causali rows:' AS info, COUNT(*) AS n FROM dbo.causali;
SELECT TOP 5 id, codice, descrizione FROM dbo.causali ORDER BY id;
SELECT 'fatture_inviate.causale_id present:' AS info,
       CASE WHEN EXISTS (SELECT 1 FROM sys.columns
                          WHERE object_id = OBJECT_ID('dbo.fatture_inviate')
                            AND name = 'causale_id')
            THEN 'YES' ELSE 'NO' END AS check_;
