-- =============================================================================
-- Patch: trasforma `riferimento_ordine` (varchar) di fatture_inviate in
-- lookup verso la tabella `ordini` (route ordini di vendita).
--
-- Step DB Dati:
--   1. ALTER fatture_inviate ADD riferimento_ordine_id INT NULL + FK ordini(id)
--
-- Idempotente: usa NOT EXISTS / IF NOT EXISTS.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
   WHERE object_id = OBJECT_ID('dbo.fatture_inviate') AND name = 'riferimento_ordine_id'
)
BEGIN
  ALTER TABLE dbo.fatture_inviate ADD riferimento_ordine_id INT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_fatture_inviate_riferimento_ordine'
)
BEGIN
  ALTER TABLE dbo.fatture_inviate
    ADD CONSTRAINT FK_fatture_inviate_riferimento_ordine
    FOREIGN KEY (riferimento_ordine_id) REFERENCES dbo.ordini(id);
END
GO

SELECT 'riferimento_ordine_id present:' AS info,
       CASE WHEN EXISTS (SELECT 1 FROM sys.columns
                          WHERE object_id = OBJECT_ID('dbo.fatture_inviate')
                            AND name = 'riferimento_ordine_id')
            THEN 'YES' ELSE 'NO' END AS check_;
