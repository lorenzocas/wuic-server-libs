-- =============================================================================
-- 46_magazzino.sql — Modulo 2: Magazzino + giacenze + disponibilita'
-- =============================================================================
-- Pattern event-sourced ispirato a WideWorldImporters.Warehouse:
--   - magazzino_movimenti  = event log immutable (no UPDATE/DELETE)
--   - magazzino_giacenze   = snapshot running balance aggiornato via trigger MERGE
--
-- Chiave naturale giacenza: (magazzino_id, prodotto_id, variante_id NULL-safe).
-- Trigger doc→magazzino vive in `47_doc_to_magazzino_triggers.sql` separato
-- (NON in 04_triggers.sql totali) per non interferire con i 22 trigger esistenti.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- =====================================================================
-- 1) magazzini (anagrafica)
-- =====================================================================
IF OBJECT_ID('dbo.magazzini', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.magazzini (
        id                  INT IDENTITY(1,1) NOT NULL,
        codice              VARCHAR(40) NOT NULL,
        descrizione         VARCHAR(200) NOT NULL,
        tipo                VARCHAR(20) NOT NULL CONSTRAINT DF_magazzini_tipo DEFAULT ('FISICO'),
            -- FISICO | VIRTUALE | TRANSITO
        indirizzo           VARCHAR(200) NULL,
        cap                 VARCHAR(20) NULL,
        citta               VARCHAR(100) NULL,
        provincia           VARCHAR(10) NULL,
        nazione             VARCHAR(50) NOT NULL CONSTRAINT DF_magazzini_nazione DEFAULT ('IT'),
        responsabile        VARCHAR(200) NULL,
        predefinito         BIT NOT NULL CONSTRAINT DF_magazzini_predefinito DEFAULT (0),
        attivo              BIT NOT NULL CONSTRAINT DF_magazzini_attivo DEFAULT (1),
        cancellato          BIT NOT NULL CONSTRAINT DF_magazzini_cancellato DEFAULT (0),
        data_creazione      DATETIME NOT NULL CONSTRAINT DF_magazzini_data_creazione DEFAULT (GETDATE()),
        data_modifica       DATETIME NULL,
        utente_creazione    INT NULL,
        utente_modifica     INT NULL,
        data_eliminazione   DATETIME NULL,
        utente_eliminazione INT NULL,
        CONSTRAINT PK_magazzini PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_magazzini_codice UNIQUE (codice),
        CONSTRAINT CK_magazzini_tipo CHECK (tipo IN ('FISICO','VIRTUALE','TRANSITO'))
    );
END
GO

-- Seed 1 magazzino di default ('PRINCIPALE') se la tabella e' vuota
IF NOT EXISTS (SELECT 1 FROM dbo.magazzini WHERE codice = 'PRINCIPALE')
    INSERT INTO dbo.magazzini (codice, descrizione, tipo, predefinito)
    VALUES ('PRINCIPALE', 'Magazzino principale', 'FISICO', 1);
GO

-- =====================================================================
-- 2) magazzino_movimenti — event log IMMUTABLE (append-only)
-- =====================================================================
IF OBJECT_ID('dbo.magazzino_movimenti', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.magazzino_movimenti (
        id                  BIGINT IDENTITY(1,1) NOT NULL,
        magazzino_id        INT NOT NULL,
        prodotto_id         INT NOT NULL,
        variante_id         INT NULL,
        tipo_movimento      VARCHAR(30) NOT NULL,
            -- CARICO | SCARICO | RETTIFICA | TRASFERIMENTO_OUT | TRASFERIMENTO_IN
            -- | RISERVA | RILASCIO_RISERVA
        quantita            DECIMAL(19,4) NOT NULL,
            -- SIGNED: CARICO>0, SCARICO<0, RETTIFICA can be both
        prezzo_unitario     DECIMAL(18,4) NULL,
        valore_movimento    DECIMAL(18,4) NULL,
        causale             VARCHAR(200) NULL,
        -- soft FK al documento sorgente (no FK fisica, doc puo' essere cancellato)
        documento_tipo      VARCHAR(40) NULL,
            -- 'fatture_inviate' | 'fatture_ricevute' | 'ddt' | 'ordini' | 'MANUALE'
        documento_id        INT NULL,
        documento_riga_id   INT NULL,
        lotto               VARCHAR(80) NULL,
        data_movimento      DATETIME NOT NULL CONSTRAINT DF_magazzino_movimenti_data DEFAULT (GETDATE()),
        utente_id           INT NULL,
        note                VARCHAR(500) NULL,
        CONSTRAINT PK_magazzino_movimenti PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_mm_magazzino FOREIGN KEY (magazzino_id) REFERENCES dbo.magazzini(id),
        CONSTRAINT FK_mm_prodotto  FOREIGN KEY (prodotto_id)  REFERENCES dbo.prodotti(id),
        CONSTRAINT FK_mm_variante  FOREIGN KEY (variante_id)  REFERENCES dbo.prodotto_varianti(id),
        CONSTRAINT CK_mm_quantita_nonzero CHECK (quantita <> 0),
        CONSTRAINT CK_mm_tipo CHECK (tipo_movimento IN (
            'CARICO','SCARICO','RETTIFICA',
            'TRASFERIMENTO_OUT','TRASFERIMENTO_IN',
            'RISERVA','RILASCIO_RISERVA'
        ))
    );
    CREATE INDEX IX_magazzino_movimenti_doc
        ON dbo.magazzino_movimenti(documento_tipo, documento_id, documento_riga_id);
    CREATE INDEX IX_magazzino_movimenti_chiave
        ON dbo.magazzino_movimenti(magazzino_id, prodotto_id, variante_id, data_movimento);
END
GO

-- =====================================================================
-- 3) magazzino_giacenze — snapshot running balance per (mag, prodotto, variante)
-- =====================================================================
IF OBJECT_ID('dbo.magazzino_giacenze', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.magazzino_giacenze (
        id                      INT IDENTITY(1,1) NOT NULL,
        magazzino_id            INT NOT NULL,
        prodotto_id             INT NOT NULL,
        variante_id             INT NULL,
        quantita_disponibile    DECIMAL(19,4) NOT NULL CONSTRAINT DF_giacenze_qta DEFAULT (0),
        quantita_riservata      DECIMAL(19,4) NOT NULL CONSTRAINT DF_giacenze_qta_ris DEFAULT (0),
        quantita_ordinata       DECIMAL(19,4) NOT NULL CONSTRAINT DF_giacenze_qta_ord DEFAULT (0),
        costo_medio             DECIMAL(18,4) NULL,
            -- Weighted Average Cost — ricalcolato sui CARICO
        ultimo_costo            DECIMAL(18,4) NULL,
        livello_riordino        DECIMAL(19,4) NULL,
        livello_target          DECIMAL(19,4) NULL,
        bin_location            VARCHAR(40) NULL,
        data_ultimo_movimento   DATETIME NULL,
        attivo                  BIT NOT NULL CONSTRAINT DF_giacenze_attivo DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_giacenze_cancellato DEFAULT (0),
        data_creazione          DATETIME NOT NULL CONSTRAINT DF_giacenze_data_creazione DEFAULT (GETDATE()),
        data_modifica           DATETIME NULL,
        utente_creazione        INT NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT PK_magazzino_giacenze PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_gz_magazzino FOREIGN KEY (magazzino_id) REFERENCES dbo.magazzini(id),
        CONSTRAINT FK_gz_prodotto  FOREIGN KEY (prodotto_id)  REFERENCES dbo.prodotti(id),
        CONSTRAINT FK_gz_variante  FOREIGN KEY (variante_id)  REFERENCES dbo.prodotto_varianti(id)
    );
    -- UQ filtered: una sola riga per chiave naturale (NULL variante = generic stock)
    CREATE UNIQUE INDEX UX_giacenza_chiave
        ON dbo.magazzino_giacenze(magazzino_id, prodotto_id, variante_id)
        WHERE cancellato = 0;
END
GO

-- =====================================================================
-- 4) Trigger MERGE giacenza AFTER INSERT su movimenti
-- =====================================================================
IF OBJECT_ID('dbo.tr_magazzino_movimenti_giacenza', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_magazzino_movimenti_giacenza;
GO
CREATE TRIGGER dbo.tr_magazzino_movimenti_giacenza
ON dbo.magazzino_movimenti
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    -- Aggrega per (magazzino, prodotto, variante) tutti i movimenti inseriti
    -- in questo statement → un singolo MERGE per chiave.
    ;WITH delta AS (
        SELECT
            i.magazzino_id,
            i.prodotto_id,
            i.variante_id,
            SUM(CASE
                WHEN i.tipo_movimento IN ('CARICO','TRASFERIMENTO_IN') THEN i.quantita
                WHEN i.tipo_movimento IN ('SCARICO','TRASFERIMENTO_OUT') THEN i.quantita   -- gia' negativo per convenzione
                WHEN i.tipo_movimento = 'RETTIFICA' THEN i.quantita
                ELSE 0
            END) AS delta_disponibile,
            SUM(CASE
                WHEN i.tipo_movimento = 'RISERVA' THEN i.quantita                          -- gia' negativo
                WHEN i.tipo_movimento = 'RILASCIO_RISERVA' THEN i.quantita                 -- gia' positivo
                ELSE 0
            END) AS delta_riservata,
            -- Per WAC: somma dei carichi (qty * prezzo)
            SUM(CASE WHEN i.tipo_movimento = 'CARICO' AND i.prezzo_unitario IS NOT NULL
                     THEN i.quantita * i.prezzo_unitario ELSE 0 END) AS valore_carichi,
            SUM(CASE WHEN i.tipo_movimento = 'CARICO' AND i.prezzo_unitario IS NOT NULL
                     THEN i.quantita ELSE 0 END) AS qta_carichi,
            MAX(CASE WHEN i.tipo_movimento = 'CARICO' THEN i.prezzo_unitario END) AS ultimo_prezzo_carico,
            MAX(i.data_movimento) AS ultima_data
        FROM inserted i
        GROUP BY i.magazzino_id, i.prodotto_id, i.variante_id
    )
    MERGE dbo.magazzino_giacenze AS tgt
    USING delta AS src
    ON tgt.magazzino_id = src.magazzino_id
       AND tgt.prodotto_id = src.prodotto_id
       AND ((tgt.variante_id IS NULL AND src.variante_id IS NULL)
            OR tgt.variante_id = src.variante_id)
       AND tgt.cancellato = 0
    WHEN MATCHED THEN UPDATE SET
        quantita_disponibile = tgt.quantita_disponibile + src.delta_disponibile,
        quantita_riservata   = tgt.quantita_riservata + src.delta_riservata,
        costo_medio = CASE
            WHEN src.qta_carichi > 0 AND (tgt.quantita_disponibile + src.delta_disponibile) > 0 THEN
                ((ISNULL(tgt.costo_medio,0) * tgt.quantita_disponibile + src.valore_carichi)
                 / NULLIF(tgt.quantita_disponibile + src.qta_carichi, 0))
            ELSE tgt.costo_medio
        END,
        ultimo_costo = COALESCE(src.ultimo_prezzo_carico, tgt.ultimo_costo),
        data_ultimo_movimento = src.ultima_data,
        data_modifica = GETDATE()
    WHEN NOT MATCHED BY TARGET THEN INSERT
        (magazzino_id, prodotto_id, variante_id,
         quantita_disponibile, quantita_riservata,
         costo_medio, ultimo_costo, data_ultimo_movimento)
    VALUES
        (src.magazzino_id, src.prodotto_id, src.variante_id,
         src.delta_disponibile, src.delta_riservata,
         CASE WHEN src.qta_carichi > 0 THEN src.valore_carichi / NULLIF(src.qta_carichi, 0) END,
         src.ultimo_prezzo_carico, src.ultima_data);
END
GO

-- =====================================================================
-- 5) Stored sp_calcola_disponibilita_per_variante
--    Aggregato cross-magazzini per una specifica (prodotto, variante)
-- =====================================================================
IF OBJECT_ID('dbo.sp_calcola_disponibilita_per_variante', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_calcola_disponibilita_per_variante;
GO
CREATE PROCEDURE dbo.sp_calcola_disponibilita_per_variante
    @prodotto_id INT,
    @variante_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        SUM(g.quantita_disponibile)                         AS quantita_disponibile_totale,
        SUM(g.quantita_riservata)                           AS quantita_riservata_totale,
        SUM(g.quantita_disponibile - g.quantita_riservata)  AS quantita_libera_totale,
        COUNT(DISTINCT g.magazzino_id)                      AS num_magazzini
    FROM dbo.magazzino_giacenze g
    WHERE g.cancellato = 0
      AND g.prodotto_id = @prodotto_id
      AND ((@variante_id IS NULL AND g.variante_id IS NULL)
           OR g.variante_id = @variante_id);
END
GO

-- =====================================================================
-- 6) Stored sp_calcola_disponibilita_aggregata
--    Cross-magazzini + cross-varianti per un prodotto (badge catalog card)
-- =====================================================================
IF OBJECT_ID('dbo.sp_calcola_disponibilita_aggregata', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_calcola_disponibilita_aggregata;
GO
CREATE PROCEDURE dbo.sp_calcola_disponibilita_aggregata
    @prodotto_id INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        SUM(g.quantita_disponibile)                         AS quantita_disponibile_totale,
        SUM(g.quantita_riservata)                           AS quantita_riservata_totale,
        SUM(g.quantita_disponibile - g.quantita_riservata)  AS quantita_libera_totale,
        COUNT(DISTINCT g.magazzino_id)                      AS num_magazzini,
        COUNT(DISTINCT g.variante_id)                       AS num_varianti
    FROM dbo.magazzino_giacenze g
    WHERE g.cancellato = 0 AND g.prodotto_id = @prodotto_id;
END
GO

-- =====================================================================
-- 7) Stored sp_warmup_giacenze_da_movimenti
--    Rebuild idempotente di magazzino_giacenze ricalcolando da event log.
--    Utility per riconciliazione (es. scheduler settimanale).
-- =====================================================================
IF OBJECT_ID('dbo.sp_warmup_giacenze_da_movimenti', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_warmup_giacenze_da_movimenti;
GO
CREATE PROCEDURE dbo.sp_warmup_giacenze_da_movimenti
    @magazzino_id INT = NULL  -- NULL = tutti
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH aggregati AS (
        SELECT
            m.magazzino_id, m.prodotto_id, m.variante_id,
            SUM(CASE WHEN m.tipo_movimento IN ('CARICO','TRASFERIMENTO_IN','SCARICO','TRASFERIMENTO_OUT','RETTIFICA')
                     THEN m.quantita ELSE 0 END) AS qta_disponibile,
            SUM(CASE WHEN m.tipo_movimento IN ('RISERVA','RILASCIO_RISERVA')
                     THEN m.quantita ELSE 0 END) AS qta_riservata,
            MAX(m.data_movimento) AS ultima_data
        FROM dbo.magazzino_movimenti m
        WHERE (@magazzino_id IS NULL OR m.magazzino_id = @magazzino_id)
        GROUP BY m.magazzino_id, m.prodotto_id, m.variante_id
    )
    MERGE dbo.magazzino_giacenze AS tgt
    USING aggregati AS src
    ON tgt.magazzino_id = src.magazzino_id
       AND tgt.prodotto_id = src.prodotto_id
       AND ((tgt.variante_id IS NULL AND src.variante_id IS NULL) OR tgt.variante_id = src.variante_id)
       AND tgt.cancellato = 0
    WHEN MATCHED THEN UPDATE SET
        quantita_disponibile = src.qta_disponibile,
        quantita_riservata   = src.qta_riservata,
        data_ultimo_movimento = src.ultima_data,
        data_modifica = GETDATE()
    WHEN NOT MATCHED BY TARGET THEN INSERT
        (magazzino_id, prodotto_id, variante_id, quantita_disponibile, quantita_riservata, data_ultimo_movimento)
    VALUES
        (src.magazzino_id, src.prodotto_id, src.variante_id, src.qta_disponibile, src.qta_riservata, src.ultima_data);
END
GO

PRINT '46_magazzino.sql applicato: magazzini + movimenti + giacenze + trigger MERGE + 3 stored';
GO
