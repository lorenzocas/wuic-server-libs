SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.vw_costi_per_mese','V') IS NOT NULL DROP VIEW dbo.vw_costi_per_mese;
GO

CREATE VIEW dbo.vw_costi_per_mese
AS
-- Aggregato per mese (NO breakdown categoria). 1 riga per mese.
-- Pre-formatta `etichetta_mese` come MM/yyyy per il chart label.
-- ROW_NUMBER su periodo cronologico ASC fornisce id stabile e ordinamento.
SELECT
  ROW_NUMBER() OVER (ORDER BY DATEFROMPARTS(YEAR(periodo), MONTH(periodo), 1)) AS id,
  YEAR(periodo) AS anno,
  MONTH(periodo) AS mese,
  DATEFROMPARTS(YEAR(periodo), MONTH(periodo), 1) AS periodo,
  RIGHT('00' + CAST(MONTH(periodo) AS VARCHAR(2)), 2) + '/' + CAST(YEAR(periodo) AS VARCHAR(4)) AS etichetta_mese,
  SUM(totale) AS totale_mese
FROM dbo.vw_costi_storici_mensili
GROUP BY YEAR(periodo), MONTH(periodo);
GO

SELECT TOP 12 * FROM dbo.vw_costi_per_mese ORDER BY periodo;
