-- ============================================================================
-- FlottaMezzi DB Dati - Anagrafiche business
-- Eseguire su: FlottaMezzi_Data
-- DOPO 01-lookup-tables.sql
-- Ordine FK-safe (no circular FK):
--   conducenti -> mezzi -> manutenzioni / rifornimenti / contratti / revisioni / sinistri
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
-- conducenti (no outgoing FK)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'conducenti' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.conducenti (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        nome NVARCHAR(80) NOT NULL,
        cognome NVARCHAR(80) NOT NULL,
        codice_fiscale NVARCHAR(16) NULL,
        numero_patente NVARCHAR(40) NULL,
        categoria_patente NVARCHAR(10) NULL,
        scadenza_patente DATE NULL,
        telefono NVARCHAR(40) NULL,
        email NVARCHAR(150) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_conducenti_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_conducenti_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- mezzi (FK -> tipo_mezzo, stato_mezzo, conducenti)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mezzi' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.mezzi (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        targa NVARCHAR(15) NOT NULL,
        tipo_mezzo_id INT NULL,
        marca NVARCHAR(80) NULL,
        modello NVARCHAR(120) NULL,
        anno INT NULL,
        telaio NVARCHAR(60) NULL,
        alimentazione NVARCHAR(40) NULL,
        km_attuali INT NULL,
        stato_mezzo_id INT NULL,
        data_immatricolazione DATE NULL,
        conducente_assegnato_id INT NULL,
        latitudine FLOAT NULL,
        longitudine FLOAT NULL,
        data_ultima_posizione DATETIME NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_mezzi_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_mezzi_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL,
        CONSTRAINT UX_mezzi_targa UNIQUE (targa, cancellato)
    );
END
GO

-- ----------------------------------------------------------------------------
-- manutenzioni (FK -> mezzi, tipo_manutenzione)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'manutenzioni' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.manutenzioni (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        mezzo_id INT NOT NULL,
        tipo_manutenzione_id INT NULL,
        data DATE NOT NULL,
        km_alla_manutenzione INT NULL,
        descrizione NVARCHAR(500) NULL,
        costo DECIMAL(12,2) NULL,
        officina NVARCHAR(150) NULL,
        fattura_numero NVARCHAR(60) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_manutenzioni_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_manutenzioni_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- rifornimenti (FK -> mezzi, conducenti)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'rifornimenti' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.rifornimenti (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        mezzo_id INT NOT NULL,
        conducente_id INT NULL,
        data DATETIME NOT NULL,
        litri DECIMAL(8,2) NULL,
        costo_totale DECIMAL(10,2) NULL,
        prezzo_litro DECIMAL(8,4) NULL,
        km_veicolo INT NULL,
        distributore NVARCHAR(150) NULL,
        note NVARCHAR(500) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_rifornimenti_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_rifornimenti_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- contratti_assicurativi (FK -> mezzi)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'contratti_assicurativi' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.contratti_assicurativi (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        mezzo_id INT NOT NULL,
        compagnia NVARCHAR(150) NOT NULL,
        numero_polizza NVARCHAR(80) NULL,
        data_inizio DATE NULL,
        data_scadenza DATE NULL,
        costo_annuo DECIMAL(10,2) NULL,
        tipo_copertura NVARCHAR(100) NULL,
        broker NVARCHAR(150) NULL,
        note NVARCHAR(500) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_contratti_assicurativi_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_contratti_assicurativi_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- revisioni (FK -> mezzi)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'revisioni' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.revisioni (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        mezzo_id INT NOT NULL,
        data DATE NOT NULL,
        esito NVARCHAR(50) NULL,
        scadenza_prossima DATE NULL,
        centro_revisione NVARCHAR(150) NULL,
        costo DECIMAL(10,2) NULL,
        note NVARCHAR(500) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_revisioni_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_revisioni_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

-- ----------------------------------------------------------------------------
-- sinistri (FK -> mezzi, conducenti)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'sinistri' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.sinistri (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        mezzo_id INT NOT NULL,
        conducente_id INT NULL,
        data DATETIME NOT NULL,
        descrizione NVARCHAR(1000) NULL,
        controparte NVARCHAR(200) NULL,
        costo_stimato DECIMAL(10,2) NULL,
        stato_pratica NVARCHAR(50) NULL,
        numero_pratica NVARCHAR(80) NULL,
        cancellato BIT NOT NULL CONSTRAINT DF_sinistri_cancellato DEFAULT 0,
        data_creazione DATETIME NOT NULL CONSTRAINT DF_sinistri_data_creazione DEFAULT GETDATE(),
        data_modifica DATETIME NULL,
        data_eliminazione DATETIME NULL,
        utente_creazione INT NULL,
        utente_modifica INT NULL,
        utente_eliminazione INT NULL
    );
END
GO

PRINT '[ok] anagrafiche tables created (conducenti, mezzi, manutenzioni, rifornimenti, contratti_assicurativi, revisioni, sinistri)';
GO
