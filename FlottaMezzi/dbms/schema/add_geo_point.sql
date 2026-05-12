SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('mezzi') AND name='geo_point')
  ALTER TABLE dbo.mezzi ADD geo_point NVARCHAR(MAX) NULL;
GO

UPDATE m
SET geo_point = '{"lat":' + CAST(latitudine AS NVARCHAR(20)) + ',"lng":' + CAST(longitudine AS NVARCHAR(20)) + '}'
FROM dbo.mezzi m
WHERE m.latitudine IS NOT NULL AND m.longitudine IS NOT NULL;
GO

SELECT COUNT(*) AS populated_geo_point FROM dbo.mezzi WHERE geo_point IS NOT NULL;
