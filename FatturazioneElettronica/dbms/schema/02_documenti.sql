/* ============================================================
   FatturazioneElettronica — Schema DB Dati: Documenti commerciali
   ============================================================
   Pattern unificato testata + righe per ogni tipo documento.
   Tipi documento:
     - fatture_inviate / fatture_inviate_righe
     - fatture_ricevute / fatture_ricevute_righe
     - preventivi / preventivi_righe
     - ordini / ordini_righe                 (vendita)
     - ordini_elettronici / ordini_elettronici_righe (NSO/PA)
     - ddt / ddt_righe
     - proforma / proforma_righe
     - ordini_acquisto / ordini_acquisto_righe
   Eseguire DOPO 01_anagrafiche.sql.
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ============================================================
   TESTATE — pattern comune
   ============================================================ */

/* ---------- Fatture inviate (testata) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fatture_inviate')
BEGIN
  CREATE TABLE dbo.fatture_inviate (
    id                    INT IDENTITY(1,1) PRIMARY KEY,
    numero                VARCHAR(50)   NOT NULL,             -- "1/2026"
    serie                 VARCHAR(20)   NULL,
    progressivo           INT           NOT NULL,
    anno                  INT           NOT NULL,
    data_documento        DATE          NOT NULL,
    cliente_id            INT           NOT NULL,
    pagamento_id          INT           NULL,
    banca_id              INT           NULL,
    causale               VARCHAR(500)  NULL,
    riferimento_ordine    VARCHAR(100)  NULL,
    bollo_valore          DECIMAL(19,4) NOT NULL DEFAULT 0,
    sconto_globale_perc   DECIMAL(5,2)  NULL,
    imponibile            DECIMAL(19,4) NOT NULL DEFAULT 0,   -- calcolato
    iva                   DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale                DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato                 VARCHAR(30)   NOT NULL DEFAULT 'BOZZA',  -- BOZZA|EMESSA|CONSEGNATA|SCARTATA|ANNULLATA
    stato_sdi             VARCHAR(30)   NULL,                 -- INVIATA|ACCETTATA|RIFIUTATA|MANCATA_CONSEGNA|...
    sdi_id                VARCHAR(50)   NULL,
    sdi_messaggio         VARCHAR(MAX)  NULL,
    file_xml              VARCHAR(500)  NULL,                 -- path file XML SDI
    note                  VARCHAR(MAX)  NULL,
    cancellato            BIT           NOT NULL DEFAULT 0,
    data_creazione        DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica         DATETIME      NULL,
    utente_creazione      INT           NULL,
    utente_modifica       INT           NULL,
    CONSTRAINT FK_fatt_inv_cliente   FOREIGN KEY (cliente_id)   REFERENCES dbo.clienti(id),
    CONSTRAINT FK_fatt_inv_pagamento FOREIGN KEY (pagamento_id) REFERENCES dbo.pagamenti(id),
    CONSTRAINT FK_fatt_inv_banca     FOREIGN KEY (banca_id)     REFERENCES dbo.banche(id)
  );
  CREATE UNIQUE INDEX UX_fatture_inviate_numerazione ON dbo.fatture_inviate(anno, serie, progressivo)
    WHERE cancellato = 0;
  CREATE INDEX IX_fatture_inviate_data ON dbo.fatture_inviate(data_documento);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fatture_inviate_righe')
BEGIN
  CREATE TABLE dbo.fatture_inviate_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    fattura_id        INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    sconto_perc       DECIMAL(5,2)  NULL,
    codice_iva_id     INT           NOT NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_fatt_inv_righe_testata    FOREIGN KEY (fattura_id)      REFERENCES dbo.fatture_inviate(id) ON DELETE CASCADE,
    CONSTRAINT FK_fatt_inv_righe_prodotto   FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_fatt_inv_righe_um         FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_fatt_inv_righe_iva        FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
  CREATE INDEX IX_fatt_inv_righe_fattura ON dbo.fatture_inviate_righe(fattura_id);
END
GO

/* ---------- Fatture ricevute ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fatture_ricevute')
BEGIN
  CREATE TABLE dbo.fatture_ricevute (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero_fornitore    VARCHAR(50)   NOT NULL,
    progressivo_interno INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    data_ricezione      DATE          NOT NULL DEFAULT GETDATE(),
    fornitore_id        INT           NOT NULL,
    pagamento_id        INT           NULL,
    causale             VARCHAR(500)  NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_indetraibile    DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'NON_LETTA',  -- NON_LETTA|REGISTRATA|PAGATA|RIFIUTATA
    stato_sdi           VARCHAR(30)   NULL,
    file_xml            VARCHAR(500)  NULL,
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_fatt_ric_fornitore FOREIGN KEY (fornitore_id) REFERENCES dbo.fornitori(id),
    CONSTRAINT FK_fatt_ric_pagamento FOREIGN KEY (pagamento_id) REFERENCES dbo.pagamenti(id)
  );
  CREATE UNIQUE INDEX UX_fatture_ricevute_progressivo
    ON dbo.fatture_ricevute(anno, progressivo_interno) WHERE cancellato = 0;
  CREATE INDEX IX_fatture_ricevute_data ON dbo.fatture_ricevute(data_documento);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fatture_ricevute_righe')
BEGIN
  CREATE TABLE dbo.fatture_ricevute_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    fattura_id        INT           NOT NULL,
    riga              INT           NOT NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    codice_iva_id     INT           NOT NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_fatt_ric_righe_testata FOREIGN KEY (fattura_id)    REFERENCES dbo.fatture_ricevute(id) ON DELETE CASCADE,
    CONSTRAINT FK_fatt_ric_righe_iva     FOREIGN KEY (codice_iva_id) REFERENCES dbo.codici_iva(id)
  );
  CREATE INDEX IX_fatt_ric_righe_fattura ON dbo.fatture_ricevute_righe(fattura_id);
END
GO

/* ---------- Preventivi (testata + righe) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'preventivi')
BEGIN
  CREATE TABLE dbo.preventivi (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero              VARCHAR(50)   NOT NULL,
    progressivo         INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    data_validita       DATE          NULL,
    cliente_id          INT           NOT NULL,
    oggetto             VARCHAR(500)  NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'BOZZA',  -- BOZZA|INVIATO|ACCETTATO|RIFIUTATO|TRASFORMATO
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_prev_cliente FOREIGN KEY (cliente_id) REFERENCES dbo.clienti(id)
  );
  CREATE UNIQUE INDEX UX_preventivi_numerazione ON dbo.preventivi(anno, progressivo) WHERE cancellato = 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'preventivi_righe')
BEGIN
  CREATE TABLE dbo.preventivi_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    preventivo_id     INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    sconto_perc       DECIMAL(5,2)  NULL,
    codice_iva_id     INT           NOT NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_prev_righe_testata  FOREIGN KEY (preventivo_id)   REFERENCES dbo.preventivi(id) ON DELETE CASCADE,
    CONSTRAINT FK_prev_righe_prodotto FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_prev_righe_um       FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_prev_righe_iva      FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
END
GO

/* ---------- Ordini (vendita) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini')
BEGIN
  CREATE TABLE dbo.ordini (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero              VARCHAR(50)   NOT NULL,
    progressivo         INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    data_consegna       DATE          NULL,
    cliente_id          INT           NOT NULL,
    riferimento_cliente VARCHAR(100)  NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'APERTO',  -- APERTO|EVASO_PARZ|EVASO|ANNULLATO
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_ordini_cliente FOREIGN KEY (cliente_id) REFERENCES dbo.clienti(id)
  );
  CREATE UNIQUE INDEX UX_ordini_numerazione ON dbo.ordini(anno, progressivo) WHERE cancellato = 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_righe')
BEGIN
  CREATE TABLE dbo.ordini_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    ordine_id         INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    quantita_evasa    DECIMAL(19,4) NOT NULL DEFAULT 0,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    sconto_perc       DECIMAL(5,2)  NULL,
    codice_iva_id     INT           NOT NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_ordini_righe_testata  FOREIGN KEY (ordine_id)       REFERENCES dbo.ordini(id) ON DELETE CASCADE,
    CONSTRAINT FK_ordini_righe_prodotto FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_ordini_righe_um       FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_ordini_righe_iva      FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
END
GO

/* ---------- Ordini elettronici (NSO/PA) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_elettronici')
BEGIN
  CREATE TABLE dbo.ordini_elettronici (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero_pa           VARCHAR(50)   NOT NULL,                 -- numero PA mittente
    progressivo_interno INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    data_ricezione      DATE          NOT NULL DEFAULT GETDATE(),
    cliente_id          INT           NOT NULL,
    cig                 VARCHAR(50)   NULL,
    cup                 VARCHAR(50)   NULL,
    file_xml            VARCHAR(500)  NULL,
    nso_message_id      VARCHAR(100)  NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'RICEVUTO',  -- RICEVUTO|ACCETTATO|RIFIUTATO|EVASO
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ord_el_cliente FOREIGN KEY (cliente_id) REFERENCES dbo.clienti(id)
  );
  CREATE UNIQUE INDEX UX_ordini_el_progressivo ON dbo.ordini_elettronici(anno, progressivo_interno);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_elettronici_righe')
BEGIN
  CREATE TABLE dbo.ordini_elettronici_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    ordine_id         INT           NOT NULL,
    riga              INT           NOT NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    codice_iva_id     INT           NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_ord_el_righe_testata FOREIGN KEY (ordine_id)     REFERENCES dbo.ordini_elettronici(id) ON DELETE CASCADE,
    CONSTRAINT FK_ord_el_righe_iva     FOREIGN KEY (codice_iva_id) REFERENCES dbo.codici_iva(id)
  );
END
GO

/* ---------- DDT (Documento di trasporto) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ddt')
BEGIN
  CREATE TABLE dbo.ddt (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    numero             VARCHAR(50)   NOT NULL,
    progressivo        INT           NOT NULL,
    anno               INT           NOT NULL,
    data_documento     DATE          NOT NULL,
    cliente_id         INT           NOT NULL,
    causale_trasporto  VARCHAR(100)  NULL,
    aspetto_beni       VARCHAR(100)  NULL,
    n_colli            INT           NULL,
    peso_lordo         DECIMAL(19,4) NULL,
    porto              VARCHAR(50)   NULL,                  -- FRANCO|ASSEGNATO
    vettore            VARCHAR(200)  NULL,
    data_ora_trasporto DATETIME      NULL,
    stato              VARCHAR(30)   NOT NULL DEFAULT 'EMESSO',   -- EMESSO|FATTURATO|ANNULLATO
    fattura_id         INT           NULL,                  -- FK eventuale alla fattura emessa
    note               VARCHAR(MAX)  NULL,
    cancellato         BIT           NOT NULL DEFAULT 0,
    data_creazione     DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica      DATETIME      NULL,
    CONSTRAINT FK_ddt_cliente FOREIGN KEY (cliente_id) REFERENCES dbo.clienti(id),
    CONSTRAINT FK_ddt_fattura FOREIGN KEY (fattura_id) REFERENCES dbo.fatture_inviate(id)
  );
  CREATE UNIQUE INDEX UX_ddt_numerazione ON dbo.ddt(anno, progressivo) WHERE cancellato = 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ddt_righe')
BEGIN
  CREATE TABLE dbo.ddt_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    ddt_id            INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NULL,
    CONSTRAINT FK_ddt_righe_testata  FOREIGN KEY (ddt_id)          REFERENCES dbo.ddt(id) ON DELETE CASCADE,
    CONSTRAINT FK_ddt_righe_prodotto FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_ddt_righe_um       FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id)
  );
END
GO

/* ---------- Proforma ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'proforma')
BEGIN
  CREATE TABLE dbo.proforma (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero              VARCHAR(50)   NOT NULL,
    progressivo         INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    cliente_id          INT           NOT NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'EMESSA',   -- EMESSA|FATTURATA|ANNULLATA
    fattura_id          INT           NULL,
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_proforma_cliente FOREIGN KEY (cliente_id) REFERENCES dbo.clienti(id),
    CONSTRAINT FK_proforma_fattura FOREIGN KEY (fattura_id) REFERENCES dbo.fatture_inviate(id)
  );
  CREATE UNIQUE INDEX UX_proforma_numerazione ON dbo.proforma(anno, progressivo) WHERE cancellato = 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'proforma_righe')
BEGIN
  CREATE TABLE dbo.proforma_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    proforma_id       INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    sconto_perc       DECIMAL(5,2)  NULL,
    codice_iva_id     INT           NOT NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_proforma_righe_testata  FOREIGN KEY (proforma_id)    REFERENCES dbo.proforma(id) ON DELETE CASCADE,
    CONSTRAINT FK_proforma_righe_prodotto FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_proforma_righe_um       FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_proforma_righe_iva      FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
END
GO

/* ---------- Ordini di acquisto ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_acquisto')
BEGIN
  CREATE TABLE dbo.ordini_acquisto (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    numero              VARCHAR(50)   NOT NULL,
    progressivo         INT           NOT NULL,
    anno                INT           NOT NULL,
    data_documento      DATE          NOT NULL,
    data_consegna       DATE          NULL,
    fornitore_id        INT           NOT NULL,
    riferimento         VARCHAR(100)  NULL,
    imponibile          DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva                 DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale              DECIMAL(19,4) NOT NULL DEFAULT 0,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'APERTO',  -- APERTO|RICEVUTO_PARZ|RICEVUTO|ANNULLATO
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    data_modifica       DATETIME      NULL,
    CONSTRAINT FK_oa_fornitore FOREIGN KEY (fornitore_id) REFERENCES dbo.fornitori(id)
  );
  CREATE UNIQUE INDEX UX_oa_numerazione ON dbo.ordini_acquisto(anno, progressivo) WHERE cancellato = 0;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ordini_acquisto_righe')
BEGIN
  CREATE TABLE dbo.ordini_acquisto_righe (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    ordine_id         INT           NOT NULL,
    riga              INT           NOT NULL,
    prodotto_id       INT           NULL,
    descrizione       VARCHAR(500)  NOT NULL,
    quantita          DECIMAL(19,4) NOT NULL DEFAULT 1,
    quantita_ricevuta DECIMAL(19,4) NOT NULL DEFAULT 0,
    unita_misura_id   INT           NULL,
    prezzo_unitario   DECIMAL(19,4) NOT NULL DEFAULT 0,
    codice_iva_id     INT           NULL,
    imponibile_riga   DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva_riga          DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale_riga       DECIMAL(19,4) NOT NULL DEFAULT 0,
    CONSTRAINT FK_oa_righe_testata  FOREIGN KEY (ordine_id)       REFERENCES dbo.ordini_acquisto(id) ON DELETE CASCADE,
    CONSTRAINT FK_oa_righe_prodotto FOREIGN KEY (prodotto_id)     REFERENCES dbo.prodotti(id),
    CONSTRAINT FK_oa_righe_um       FOREIGN KEY (unita_misura_id) REFERENCES dbo.unita_misura(id),
    CONSTRAINT FK_oa_righe_iva      FOREIGN KEY (codice_iva_id)   REFERENCES dbo.codici_iva(id)
  );
END
GO

PRINT 'Schema documenti commerciali applicato.';
GO
