-- ============================================================================
-- FlottaMezzi DB Dati - Lookup tables
-- Eseguire su: FlottaMezzi_Data
-- Idempotente (IF NOT EXISTS guards)
-- ============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ----------------------------------------------------------------------------
-- tipo_mezzo
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tipo_mezzo' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.tipo_mezzo (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        descrizione NVARCHAR(100) NOT NULL,
        icon_name NVARCHAR(50) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_tipo_mezzo_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_tipo_mezzo_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- stato_mezzo
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'stato_mezzo' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.stato_mezzo (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        descrizione NVARCHAR(100) NOT NULL,
        colore_css NVARCHAR(50) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_stato_mezzo_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_stato_mezzo_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- tipo_manutenzione
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'tipo_manutenzione' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.tipo_manutenzione (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        descrizione NVARCHAR(100) NOT NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_tipo_manutenzione_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_tipo_manutenzione_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

PRINT '[ok] lookup tables created (tipo_mezzo, stato_mezzo, tipo_manutenzione)';
GO
