SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('mezzi_posizioni') AND name='geo_point')
  ALTER TABLE dbo.mezzi_posizioni ADD geo_point NVARCHAR(MAX) NULL;
GO

UPDATE dbo.mezzi_posizioni
SET geo_point = '{"lat":' + CAST(latitudine AS NVARCHAR(20)) + ',"lng":' + CAST(longitudine AS NVARCHAR(20)) + '}'
WHERE latitudine IS NOT NULL AND longitudine IS NOT NULL;
GO

-- Ricreo la view per esporre geo_point
IF OBJECT_ID('dbo.vw_mezzi_posizioni_giorno','V') IS NOT NULL DROP VIEW dbo.vw_mezzi_posizioni_giorno;
GO
CREATE VIEW dbo.vw_mezzi_posizioni_giorno
AS
SELECT
  p.id,
  p.mezzo_id,
  m.targa,
  m.modello,
  CAST(p.timestamp_pos AS DATE) AS giorno,
  p.timestamp_pos,
  p.latitudine,
  p.longitudine,
  p.geo_point,
  p.velocita_kmh,
  p.note,
  ROW_NUMBER() OVER (PARTITION BY p.mezzo_id, CAST(p.timestamp_pos AS DATE) ORDER BY p.timestamp_pos) AS ordine
FROM dbo.mezzi_posizioni p
JOIN dbo.mezzi m ON m.id = p.mezzo_id
WHERE p.cancellato = 0;
GO

SELECT TOP 3 id, mezzo_id, geo_point FROM dbo.vw_mezzi_posizioni_giorno;
