-- 2026-05-08 — Gestione listini con periodi di validità prezzi prodotti.
-- Schema:
--   listini          : header listino (nome, attivo)
--   listini_prezzi   : prezzo per (listino_id, prodotto_id) con validity period
--   clienti.listino_id   : FK preferenziale del cliente verso un listino
--   fornitori.listino_id : FK preferenziale del fornitore verso un listino
-- Logica runtime: sp_get_prezzo_listino(prodotto_id, listino_id, data) ->
--   se trova match con validity period attivo, ritorna i prezzi del listino;
--   altrimenti il client cade sul fallback prodotti.prezzo_vendita/prezzo_acquisto.

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.listini', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.listini (
    id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_listini PRIMARY KEY,
    nome                 VARCHAR(100) NOT NULL,
    descrizione          VARCHAR(500) NULL,
    attivo               BIT NOT NULL CONSTRAINT DF_listini_attivo DEFAULT(1),
    cancellato           BIT NOT NULL CONSTRAINT DF_listini_cancellato DEFAULT(0),
    data_creazione       DATETIME NOT NULL CONSTRAINT DF_listini_data_creazione DEFAULT(SYSUTCDATETIME()),
    data_modifica        DATETIME NULL,
    utente_creazione     INT NULL,
    utente_modifica      INT NULL,
    data_eliminazione    DATETIME NULL,
    utente_eliminazione  INT NULL
  );
  CREATE UNIQUE INDEX UX_listini_nome ON dbo.listini(nome) WHERE cancellato = 0;
END
GO

IF OBJECT_ID('dbo.listini_prezzi', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.listini_prezzi (
    id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_listini_prezzi PRIMARY KEY,
    listino_id           INT NOT NULL,
    prodotto_id          INT NOT NULL,
    prezzo_vendita       DECIMAL(18,4) NULL,
    prezzo_acquisto      DECIMAL(18,4) NULL,
    sconto_default       DECIMAL(5,2) NULL,
    valid_from           DATE NOT NULL CONSTRAINT DF_listini_prezzi_valid_from DEFAULT('1900-01-01'),
    valid_to             DATE NULL,
    attivo               BIT NOT NULL CONSTRAINT DF_listini_prezzi_attivo DEFAULT(1),
    cancellato           BIT NOT NULL CONSTRAINT DF_listini_prezzi_cancellato DEFAULT(0),
    data_creazione       DATETIME NOT NULL CONSTRAINT DF_listini_prezzi_data_creazione DEFAULT(SYSUTCDATETIME()),
    data_modifica        DATETIME NULL,
    utente_creazione     INT NULL,
    utente_modifica      INT NULL,
    data_eliminazione    DATETIME NULL,
    utente_eliminazione  INT NULL,
    CONSTRAINT FK_listini_prezzi_listino FOREIGN KEY (listino_id) REFERENCES dbo.listini(id),
    CONSTRAINT FK_listini_prezzi_prodotto FOREIGN KEY (prodotto_id) REFERENCES dbo.prodotti(id)
  );
  CREATE INDEX IX_listini_prezzi_lookup ON dbo.listini_prezzi(listino_id, prodotto_id, valid_from, valid_to) WHERE cancellato = 0;
END
GO

-- FK clienti.listino_id (NULLable: cliente puo' non avere listino assegnato → fallback)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.clienti') AND name = 'listino_id')
BEGIN
  ALTER TABLE dbo.clienti ADD listino_id INT NULL;
  ALTER TABLE dbo.clienti ADD CONSTRAINT FK_clienti_listino FOREIGN KEY (listino_id) REFERENCES dbo.listini(id);
END
GO

-- FK fornitori.listino_id
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.fornitori') AND name = 'listino_id')
BEGIN
  ALTER TABLE dbo.fornitori ADD listino_id INT NULL;
  ALTER TABLE dbo.fornitori ADD CONSTRAINT FK_fornitori_listino FOREIGN KEY (listino_id) REFERENCES dbo.listini(id);
END
GO

-- Verifica
SELECT 'listini' AS tabella, COUNT(*) AS rows FROM dbo.listini
UNION ALL
SELECT 'listini_prezzi', COUNT(*) FROM dbo.listini_prezzi
UNION ALL
SELECT 'clienti.listino_id (col)', CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.clienti') AND name = 'listino_id') THEN 1 ELSE 0 END
UNION ALL
SELECT 'fornitori.listino_id (col)', CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.fornitori') AND name = 'listino_id') THEN 1 ELSE 0 END;
GO
