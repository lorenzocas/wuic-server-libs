SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.mezzi_posizioni','U') IS NULL
BEGIN
  CREATE TABLE dbo.mezzi_posizioni (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    mezzo_id            INT NOT NULL,
    timestamp_pos       DATETIME2(0) NOT NULL,
    latitudine          FLOAT NOT NULL,
    longitudine         FLOAT NOT NULL,
    velocita_kmh        DECIMAL(6,2) NULL,
    note                NVARCHAR(500) NULL,
    -- audit (regola 5-quater db-schema-scaffolding)
    data_creazione      DATETIME2(0) NOT NULL CONSTRAINT DF_mezzi_posizioni_data_creazione DEFAULT SYSUTCDATETIME(),
    utente_creazione    INT NULL,
    data_modifica       DATETIME2(0) NULL,
    utente_modifica     INT NULL,
    data_eliminazione   DATETIME2(0) NULL,
    utente_eliminazione INT NULL,
    cancellato          BIT NOT NULL CONSTRAINT DF_mezzi_posizioni_cancellato DEFAULT 0,
    CONSTRAINT FK_mezzi_posizioni_mezzo FOREIGN KEY (mezzo_id) REFERENCES dbo.mezzi(id)
  );
  CREATE INDEX IX_mezzi_posizioni_mezzo_ts ON dbo.mezzi_posizioni(mezzo_id, timestamp_pos);
END
GO

-- VIEW per dashboard percorsi (filtrabile per mezzo + giorno)
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
  p.velocita_kmh,
  p.note,
  ROW_NUMBER() OVER (PARTITION BY p.mezzo_id, CAST(p.timestamp_pos AS DATE) ORDER BY p.timestamp_pos) AS ordine
FROM dbo.mezzi_posizioni p
JOIN dbo.mezzi m ON m.id = p.mezzo_id
WHERE p.cancellato = 0;
GO
