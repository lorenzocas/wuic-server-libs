/* ============================================================
   FatturazioneElettronica — Schema DB Dati: Anagrafiche
   ============================================================
   Idempotente: usare CREATE TABLE IF NOT EXISTS pattern via
   IF NOT EXISTS. Eseguire su DB FatturazioneElettronica_Data.
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ---------- 1) Codici IVA (lookup) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'codici_iva')
BEGIN
  CREATE TABLE dbo.codici_iva (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    codice          VARCHAR(10)   NOT NULL UNIQUE,
    descrizione     VARCHAR(200)  NOT NULL,
    aliquota        DECIMAL(5,2)  NOT NULL,                 -- es 22.00
    natura_sdi      VARCHAR(10)   NULL,                     -- N1..N7 per esenti
    indetraibile    BIT           NOT NULL DEFAULT 0,
    perc_indetraib  DECIMAL(5,2)  NULL,
    note            VARCHAR(500)  NULL,
    attivo          BIT           NOT NULL DEFAULT 1,
    cancellato      BIT           NOT NULL DEFAULT 0,
    data_creazione  DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica   DATETIME      NULL
  );
END
GO

/* ---------- 2) Unita' di misura (lookup) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'unita_misura')
BEGIN
  CREATE TABLE dbo.unita_misura (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    codice          VARCHAR(10)   NOT NULL UNIQUE,           -- es. 'pz','kg','h'
    descrizione     VARCHAR(100)  NOT NULL,
    attivo          BIT           NOT NULL DEFAULT 1,
    cancellato      BIT           NOT NULL DEFAULT 0,
    data_creazione  DATETIME      NOT NULL DEFAULT GETDATE()
  );
END
GO

/* ---------- 3) Modalita' di pagamento (lookup) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pagamenti')
BEGIN
  CREATE TABLE dbo.pagamenti (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    codice_sdi        VARCHAR(10)   NOT NULL,                -- MP01..MP23 SDI (non UNIQUE: ammette varianti per scadenza)
    descrizione       VARCHAR(200)  NOT NULL,
    giorni_scadenza   INT           NOT NULL DEFAULT 30,
    tipo_scadenza     VARCHAR(20)   NOT NULL DEFAULT 'DF',   -- DF = Data Fattura, FM = Fine Mese
    n_rate            INT           NOT NULL DEFAULT 1,
    note              VARCHAR(500)  NULL,
    attivo            BIT           NOT NULL DEFAULT 1,
    cancellato        BIT           NOT NULL DEFAULT 0,
    data_creazione    DATETIME      NOT NULL DEFAULT GETDATE()
  );
END
GO

/* ---------- 4) Banche (anagrafica conti correnti propri) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'banche')
BEGIN
  CREATE TABLE dbo.banche (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    descrizione     VARCHAR(200)  NOT NULL,                 -- "C/C principale", "Conto Aruba"
    iban            VARCHAR(34)   NOT NULL,
    bic_swift       VARCHAR(11)   NULL,
    intestatario    VARCHAR(200)  NULL,
    nome_banca      VARCHAR(200)  NULL,
    abi             VARCHAR(5)    NULL,
    cab             VARCHAR(5)    NULL,
    saldo_iniziale  DECIMAL(19,4) NOT NULL DEFAULT 0,
    valuta          VARCHAR(3)    NOT NULL DEFAULT 'EUR',
    note            VARCHAR(500)  NULL,
    predefinita     BIT           NOT NULL DEFAULT 0,
    attivo          BIT           NOT NULL DEFAULT 1,
    cancellato      BIT           NOT NULL DEFAULT 0,
    data_creazione  DATETIME      NOT NULL DEFAULT GETDATE()
  );
END
GO

/* ---------- 5) Clienti ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'clienti')
BEGIN
  CREATE TABLE dbo.clienti (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    codice              VARCHAR(20)   NOT NULL UNIQUE,
    ragione_sociale     VARCHAR(300)  NOT NULL,
    tipo_soggetto       VARCHAR(20)   NOT NULL DEFAULT 'AZIENDA', -- AZIENDA | PRIVATO | PA
    partita_iva         VARCHAR(20)   NULL,
    codice_fiscale      VARCHAR(20)   NULL,
    indirizzo           VARCHAR(300)  NULL,
    cap                 VARCHAR(10)   NULL,
    citta               VARCHAR(100)  NULL,
    provincia           VARCHAR(2)    NULL,
    nazione             VARCHAR(2)    NOT NULL DEFAULT 'IT',
    pec                 VARCHAR(200)  NULL,
    codice_destinatario VARCHAR(7)    NULL,                 -- SDI receiver code
    email               VARCHAR(200)  NULL,
    telefono            VARCHAR(50)   NULL,
    sito_web            VARCHAR(200)  NULL,
    pagamento_default   INT           NULL,
    sconto_default      DECIMAL(5,2)  NULL,
    fido                DECIMAL(19,4) NULL,
    note                VARCHAR(MAX)  NULL,
    attivo              BIT           NOT NULL DEFAULT 1,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_clienti_pagamenti FOREIGN KEY (pagamento_default) REFERENCES dbo.pagamenti(id)
  );
  CREATE INDEX IX_clienti_ragione_sociale ON dbo.clienti(ragione_sociale);
  CREATE INDEX IX_clienti_partita_iva     ON dbo.clienti(partita_iva);
END
GO

/* ---------- 6) Fornitori ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fornitori')
BEGIN
  CREATE TABLE dbo.fornitori (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    codice              VARCHAR(20)   NOT NULL UNIQUE,
    ragione_sociale     VARCHAR(300)  NOT NULL,
    tipo_soggetto       VARCHAR(20)   NOT NULL DEFAULT 'AZIENDA',
    partita_iva         VARCHAR(20)   NULL,
    codice_fiscale      VARCHAR(20)   NULL,
    indirizzo           VARCHAR(300)  NULL,
    cap                 VARCHAR(10)   NULL,
    citta               VARCHAR(100)  NULL,
    provincia           VARCHAR(2)    NULL,
    nazione             VARCHAR(2)    NOT NULL DEFAULT 'IT',
    pec                 VARCHAR(200)  NULL,
    codice_destinatario VARCHAR(7)    NULL,
    email               VARCHAR(200)  NULL,
    telefono            VARCHAR(50)   NULL,
    sito_web            VARCHAR(200)  NULL,
    iban                VARCHAR(34)   NULL,
    pagamento_default   INT           NULL,
    note                VARCHAR(MAX)  NULL,
    attivo              BIT           NOT NULL DEFAULT 1,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_fornitori_pagamenti FOREIGN KEY (pagamento_default) REFERENCES dbo.pagamenti(id)
  );
  CREATE INDEX IX_fornitori_ragione_sociale ON dbo.fornitori(ragione_sociale);
  CREATE INDEX IX_fornitori_partita_iva     ON dbo.fornitori(partita_iva);
END
GO

/* ---------- 7) Prodotti / Servizi ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'prodotti')
BEGIN
  CREATE TABLE dbo.prodotti (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    codice            VARCHAR(50)   NOT NULL UNIQUE,
    descrizione       VARCHAR(500)  NOT NULL,
    tipo              VARCHAR(20)   NOT NULL DEFAULT 'BENE',  -- BENE | SERVIZIO
    unita_misura_id   INT           NULL,
    codice_iva_id     INT           NULL,
    prezzo_vendita    DECIMAL(19,4) NOT NULL DEFAULT 0,
    prezzo_acquisto   DECIMAL(19,4) NULL,
    sconto_default    DECIMAL(5,2)  NULL,
    categoria         VARCHAR(100)  NULL,
    note              VARCHAR(MAX)  NULL,
    attivo            BIT           NOT NULL DEFAULT 1,
    cancellato        BIT           NOT NULL DEFAULT 0,
    data_creazione    DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica     DATETIME      NULL,
    CONSTRAINT FK_prodotti_unita_misura FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_prodotti_codice_iva   FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
  CREATE INDEX IX_prodotti_descrizione ON dbo.prodotti(descrizione);
END
GO

PRINT 'Schema anagrafiche applicato.';
GO
