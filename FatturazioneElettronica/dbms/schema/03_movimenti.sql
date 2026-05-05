/* ============================================================
   FatturazioneElettronica — Schema DB Dati: Movimenti
   ============================================================
   Tabelle:
     - scadenze              (FK a fatture inviate/ricevute)
     - prima_nota            (registro generico contabile)
     - corrispettivi         (registro corrispettivi giornalieri)
   View:
     - v_scadenzario         (scadenze aperte unite cliente/fornitore)
   Eseguire DOPO 02_documenti.sql.
   ============================================================ */

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

/* ---------- Scadenze (incassi e pagamenti previsti) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'scadenze')
BEGIN
  CREATE TABLE dbo.scadenze (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    tipo                VARCHAR(20)   NOT NULL,                 -- INCASSO|PAGAMENTO
    fattura_inviata_id  INT           NULL,
    fattura_ricevuta_id INT           NULL,
    cliente_id          INT           NULL,
    fornitore_id        INT           NULL,
    data_scadenza       DATE          NOT NULL,
    importo             DECIMAL(19,4) NOT NULL,
    importo_pagato      DECIMAL(19,4) NOT NULL DEFAULT 0,
    pagamento_id        INT           NULL,
    banca_id            INT           NULL,
    stato               VARCHAR(30)   NOT NULL DEFAULT 'APERTA', -- APERTA|PARZIALE|PAGATA|INSOLUTA
    data_pagamento      DATE          NULL,
    rata_n              INT           NOT NULL DEFAULT 1,
    rata_totale         INT           NOT NULL DEFAULT 1,
    note                VARCHAR(500)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_scad_fatt_inv  FOREIGN KEY (fattura_inviata_id)  REFERENCES dbo.fatture_inviate(id),
    CONSTRAINT FK_scad_fatt_ric  FOREIGN KEY (fattura_ricevuta_id) REFERENCES dbo.fatture_ricevute(id),
    CONSTRAINT FK_scad_cliente   FOREIGN KEY (cliente_id)          REFERENCES dbo.clienti(id),
    CONSTRAINT FK_scad_fornitore FOREIGN KEY (fornitore_id)        REFERENCES dbo.fornitori(id),
    CONSTRAINT FK_scad_pagamento FOREIGN KEY (pagamento_id)        REFERENCES dbo.pagamenti(id),
    CONSTRAINT FK_scad_banca     FOREIGN KEY (banca_id)            REFERENCES dbo.banche(id),
    CONSTRAINT CK_scad_tipo CHECK (tipo IN ('INCASSO','PAGAMENTO')),
    CONSTRAINT CK_scad_doc  CHECK (
        (tipo = 'INCASSO'   AND fattura_inviata_id  IS NOT NULL AND fattura_ricevuta_id IS NULL)
     OR (tipo = 'PAGAMENTO' AND fattura_ricevuta_id IS NOT NULL AND fattura_inviata_id  IS NULL)
    )
  );
  CREATE INDEX IX_scad_data ON dbo.scadenze(data_scadenza);
  CREATE INDEX IX_scad_stato ON dbo.scadenze(stato);
END
GO

/* ---------- Prima nota (registro contabile generico) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'prima_nota')
BEGIN
  CREATE TABLE dbo.prima_nota (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    data_movimento      DATE          NOT NULL,
    tipo                VARCHAR(20)   NOT NULL,                 -- ENTRATA|USCITA|GIROCONTO
    causale             VARCHAR(200)  NOT NULL,
    descrizione         VARCHAR(500)  NULL,
    importo             DECIMAL(19,4) NOT NULL,
    banca_id            INT           NULL,
    cliente_id          INT           NULL,
    fornitore_id        INT           NULL,
    fattura_inviata_id  INT           NULL,
    fattura_ricevuta_id INT           NULL,
    scadenza_id         INT           NULL,
    riferimento_doc     VARCHAR(100)  NULL,
    note                VARCHAR(MAX)  NULL,
    cancellato          BIT           NOT NULL DEFAULT 0,
    data_creazione      DATETIME      NOT NULL DEFAULT GETDATE(),
    utente_creazione    INT           NULL,
    CONSTRAINT FK_pn_banca     FOREIGN KEY (banca_id)            REFERENCES dbo.banche(id),
    CONSTRAINT FK_pn_cliente   FOREIGN KEY (cliente_id)          REFERENCES dbo.clienti(id),
    CONSTRAINT FK_pn_fornitore FOREIGN KEY (fornitore_id)        REFERENCES dbo.fornitori(id),
    CONSTRAINT FK_pn_fatt_inv  FOREIGN KEY (fattura_inviata_id)  REFERENCES dbo.fatture_inviate(id),
    CONSTRAINT FK_pn_fatt_ric  FOREIGN KEY (fattura_ricevuta_id) REFERENCES dbo.fatture_ricevute(id),
    CONSTRAINT FK_pn_scadenza  FOREIGN KEY (scadenza_id)         REFERENCES dbo.scadenze(id),
    CONSTRAINT CK_pn_tipo CHECK (tipo IN ('ENTRATA','USCITA','GIROCONTO'))
  );
  CREATE INDEX IX_pn_data ON dbo.prima_nota(data_movimento);
END
GO

/* ---------- Corrispettivi (registro giornaliero corrispettivi) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'corrispettivi')
BEGIN
  CREATE TABLE dbo.corrispettivi (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    data_giorno     DATE          NOT NULL,
    progressivo     INT           NOT NULL,                  -- progressivo del giorno
    descrizione     VARCHAR(200)  NULL,
    imponibile      DECIMAL(19,4) NOT NULL DEFAULT 0,
    iva             DECIMAL(19,4) NOT NULL DEFAULT 0,
    totale          DECIMAL(19,4) NOT NULL DEFAULT 0,
    codice_iva_id   INT           NULL,
    metodo_pagamento VARCHAR(30)  NULL,                      -- CONTANTI|POS|BONIFICO|ALTRO
    note            VARCHAR(500)  NULL,
    cancellato      BIT           NOT NULL DEFAULT 0,
    data_creazione  DATETIME      NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_corr_iva FOREIGN KEY (codice_iva_id) REFERENCES dbo.codici_iva(id)
  );
  CREATE UNIQUE INDEX UX_corr_giorno_prog ON dbo.corrispettivi(data_giorno, progressivo)
    WHERE cancellato = 0;
END
GO

/* ============================================================
   VIEW: v_scadenzario
   ============================================================ */

IF EXISTS (SELECT 1 FROM sys.views WHERE name = 'v_scadenzario')
  DROP VIEW dbo.v_scadenzario;
GO

CREATE VIEW dbo.v_scadenzario AS
SELECT
    s.id,
    s.tipo,
    s.data_scadenza,
    s.importo,
    s.importo_pagato,
    (s.importo - s.importo_pagato) AS importo_residuo,
    s.stato,
    s.rata_n,
    s.rata_totale,
    -- soggetto: cliente o fornitore
    COALESCE(c.ragione_sociale, f.ragione_sociale) AS soggetto,
    s.cliente_id,
    s.fornitore_id,
    -- documento di riferimento
    COALESCE(fi.numero, fr.numero_fornitore) AS doc_numero,
    COALESCE(fi.data_documento, fr.data_documento) AS doc_data,
    s.fattura_inviata_id,
    s.fattura_ricevuta_id,
    -- giorni alla scadenza (positivo=futura, negativo=scaduta)
    DATEDIFF(DAY, GETDATE(), s.data_scadenza) AS giorni_a_scadenza,
    p.descrizione AS modalita_pagamento,
    b.descrizione AS banca,
    s.note
FROM dbo.scadenze s
LEFT JOIN dbo.clienti c          ON c.id = s.cliente_id
LEFT JOIN dbo.fornitori f        ON f.id = s.fornitore_id
LEFT JOIN dbo.fatture_inviate fi ON fi.id = s.fattura_inviata_id
LEFT JOIN dbo.fatture_ricevute fr ON fr.id = s.fattura_ricevuta_id
LEFT JOIN dbo.pagamenti p        ON p.id = s.pagamento_id
LEFT JOIN dbo.banche b           ON b.id = s.banca_id
WHERE s.cancellato = 0;
GO

PRINT 'Schema movimenti + view scadenzario applicato.';
GO
