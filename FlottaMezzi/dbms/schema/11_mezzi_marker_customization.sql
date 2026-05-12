SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('mezzi') AND name='colore_marker')
  ALTER TABLE dbo.mezzi ADD colore_marker NVARCHAR(7) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('mezzi') AND name='svg_marker')
  ALTER TABLE dbo.mezzi ADD svg_marker NVARCHAR(MAX) NULL;
GO

-- Re-create view per portare colore_marker + svg_marker dentro vw_mezzi_posizioni_giorno
IF OBJECT_ID('dbo.vw_mezzi_posizioni_giorno','V') IS NOT NULL DROP VIEW dbo.vw_mezzi_posizioni_giorno;
GO
CREATE VIEW dbo.vw_mezzi_posizioni_giorno
AS
SELECT
  p.id,
  p.mezzo_id,
  m.targa,
  m.modello,
  m.colore_marker,
  m.svg_marker,
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

-- Seed colori distinti per ogni mezzo + SVG per IL789MN per testare priorità
UPDATE dbo.mezzi SET colore_marker = '#dc2626' WHERE targa = 'AB123CD'; -- rosso
UPDATE dbo.mezzi SET colore_marker = '#16a34a' WHERE targa = 'EF456GH'; -- verde
UPDATE dbo.mezzi SET colore_marker = '#7c3aed' WHERE targa = 'IL789MN'; -- viola (override-ato dall'SVG sotto)
UPDATE dbo.mezzi SET colore_marker = '#ea580c' WHERE targa = 'OP012QR'; -- arancione

-- SVG inline truck icon per IL789MN: dovrebbe sovrascrivere il colore
UPDATE dbo.mezzi
SET svg_marker = N'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="#0ea5e9" stroke="#0c4a6e" stroke-width="0.8"><path d="M3 17h2v-7h11v7h2.05a2.5 2.5 0 0 1 4.9 0H22v-3l-2-3-2-2h-3V5H3v12zm15-8.5h2.4L22 11h-4V8.5zM6 18.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm12 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z"/></svg>'
WHERE targa = 'IL789MN';

SELECT id, targa, colore_marker, CASE WHEN svg_marker IS NULL THEN '' ELSE 'SVG('+CAST(LEN(svg_marker) AS VARCHAR)+'B)' END AS svg FROM dbo.mezzi ORDER BY id;
