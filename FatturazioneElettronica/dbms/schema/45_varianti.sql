-- =============================================================================
-- 45_varianti.sql — Modulo 1: Varianti prodotto (taglia/colore/modello/...)
-- =============================================================================
-- Schema: prodotto_attributi + prodotto_attributi_valori (M:N → prodotto_varianti)
--         + ALTER prodotti.has_varianti + ALTER 7 righe-doc + ALTER listini_prezzi
--
-- Idempotenza: tutto IF NOT EXISTS / IF OBJECT_ID — relancia safe.
-- Audit-aware: 7-colonne (attivo, cancellato, data_creazione, data_modifica,
--   utente_creazione, utente_modifica, data_eliminazione, utente_eliminazione)
--   come da regola db-schema-scaffolding 5-quater.
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
-- 1) prodotto_attributi (TAGLIA, COLORE, MODELLO, MATERIALE, ...)
-- =====================================================================
IF OBJECT_ID('dbo.prodotto_attributi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.prodotto_attributi (
        id                  INT IDENTITY(1,1) NOT NULL,
        codice              VARCHAR(40) NOT NULL,
        descrizione         VARCHAR(200) NOT NULL,
        ordine              INT NOT NULL CONSTRAINT DF_prodotto_attributi_ordine DEFAULT (0),
        attivo              BIT NOT NULL CONSTRAINT DF_prodotto_attributi_attivo DEFAULT (1),
        cancellato          BIT NOT NULL CONSTRAINT DF_prodotto_attributi_cancellato DEFAULT (0),
        data_creazione      DATETIME NOT NULL CONSTRAINT DF_prodotto_attributi_data_creazione DEFAULT (GETDATE()),
        data_modifica       DATETIME NULL,
        utente_creazione    INT NULL,
        utente_modifica     INT NULL,
        data_eliminazione   DATETIME NULL,
        utente_eliminazione INT NULL,
        CONSTRAINT PK_prodotto_attributi PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_prodotto_attributi_codice UNIQUE (codice)
    );
END
GO

-- =====================================================================
-- 2) prodotto_attributi_valori (S/M/L per TAGLIA; Rosso/Blu per COLORE)
-- =====================================================================
IF OBJECT_ID('dbo.prodotto_attributi_valori', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.prodotto_attributi_valori (
        id                  INT IDENTITY(1,1) NOT NULL,
        attributo_id        INT NOT NULL,
        codice              VARCHAR(40) NOT NULL,
        descrizione         VARCHAR(200) NOT NULL,
        ordine              INT NOT NULL CONSTRAINT DF_prodotto_attributi_valori_ordine DEFAULT (0),
        hex_color           VARCHAR(9) NULL, -- per COLORE: '#FF0000' o '#FF0000FF'
        attivo              BIT NOT NULL CONSTRAINT DF_prodotto_attributi_valori_attivo DEFAULT (1),
        cancellato          BIT NOT NULL CONSTRAINT DF_prodotto_attributi_valori_cancellato DEFAULT (0),
        data_creazione      DATETIME NOT NULL CONSTRAINT DF_prodotto_attributi_valori_data_creazione DEFAULT (GETDATE()),
        data_modifica       DATETIME NULL,
        utente_creazione    INT NULL,
        utente_modifica     INT NULL,
        data_eliminazione   DATETIME NULL,
        utente_eliminazione INT NULL,
        CONSTRAINT PK_prodotto_attributi_valori PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_prodotto_attributi_valori_attributo
            FOREIGN KEY (attributo_id) REFERENCES dbo.prodotto_attributi(id),
        CONSTRAINT UQ_prodotto_attributi_valori_codice UNIQUE (attributo_id, codice)
    );
END
GO

-- =====================================================================
-- 3) prodotti.has_varianti — flag indicizzato per query veloci
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.prodotti') AND name = 'has_varianti')
BEGIN
    ALTER TABLE dbo.prodotti
        ADD has_varianti BIT NOT NULL CONSTRAINT DF_prodotti_has_varianti DEFAULT (0);
END
GO

-- =====================================================================
-- 4) prodotto_varianti — la combinazione concreta (SKU univoco)
-- =====================================================================
IF OBJECT_ID('dbo.prodotto_varianti', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.prodotto_varianti (
        id                          INT IDENTITY(1,1) NOT NULL,
        prodotto_id                 INT NOT NULL,
        sku                         VARCHAR(80) NOT NULL,
        barcode                     VARCHAR(80) NULL,
        descrizione_estesa          VARCHAR(400) NULL,
        prezzo_vendita_override     DECIMAL(18,4) NULL,
        prezzo_acquisto_override    DECIMAL(18,4) NULL,
        peso_grammi                 INT NULL,
        immagine_url                VARCHAR(500) NULL,
        attivo                      BIT NOT NULL CONSTRAINT DF_prodotto_varianti_attivo DEFAULT (1),
        cancellato                  BIT NOT NULL CONSTRAINT DF_prodotto_varianti_cancellato DEFAULT (0),
        data_creazione              DATETIME NOT NULL CONSTRAINT DF_prodotto_varianti_data_creazione DEFAULT (GETDATE()),
        data_modifica               DATETIME NULL,
        utente_creazione            INT NULL,
        utente_modifica             INT NULL,
        data_eliminazione           DATETIME NULL,
        utente_eliminazione         INT NULL,
        CONSTRAINT PK_prodotto_varianti PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_prodotto_varianti_prodotto
            FOREIGN KEY (prodotto_id) REFERENCES dbo.prodotti(id),
        CONSTRAINT UQ_prodotto_varianti_sku UNIQUE (sku)
    );
    CREATE INDEX IX_prodotto_varianti_prodotto ON dbo.prodotto_varianti(prodotto_id) WHERE cancellato = 0;
END
GO

-- =====================================================================
-- 5) prodotto_varianti_attributi — M:N variante ↔ valori attributo
-- =====================================================================
IF OBJECT_ID('dbo.prodotto_varianti_attributi', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.prodotto_varianti_attributi (
        variante_id     INT NOT NULL,
        attributo_id    INT NOT NULL,
        valore_id       INT NOT NULL,
        CONSTRAINT PK_prodotto_varianti_attributi PRIMARY KEY CLUSTERED (variante_id, attributo_id),
        CONSTRAINT FK_pva_variante  FOREIGN KEY (variante_id)  REFERENCES dbo.prodotto_varianti(id),
        CONSTRAINT FK_pva_attributo FOREIGN KEY (attributo_id) REFERENCES dbo.prodotto_attributi(id),
        CONSTRAINT FK_pva_valore    FOREIGN KEY (valore_id)    REFERENCES dbo.prodotto_attributi_valori(id)
    );
END
GO

-- =====================================================================
-- 6) ALTER 7 righe-tabelle ADD variante_id (NULLABLE → retro-compatibile)
-- =====================================================================
DECLARE @riga_tables TABLE (tname SYSNAME);
INSERT INTO @riga_tables VALUES
    ('fatture_inviate_righe'), ('fatture_ricevute_righe'),
    ('ddt_righe'), ('ordini_righe'), ('ordini_acquisto_righe'),
    ('preventivi_righe'), ('proforma_righe');

DECLARE @t SYSNAME;
DECLARE riga_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT tname FROM @riga_tables WHERE OBJECT_ID('dbo.'+tname,'U') IS NOT NULL;
OPEN riga_cursor;
FETCH NEXT FROM riga_cursor INTO @t;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.'+@t) AND name = 'variante_id')
    BEGIN
        DECLARE @sql NVARCHAR(MAX);
        SET @sql = N'ALTER TABLE dbo.' + QUOTENAME(@t) + N' ADD variante_id INT NULL CONSTRAINT '
            + QUOTENAME('FK_'+@t+'_variante') + N' REFERENCES dbo.prodotto_varianti(id)';
        EXEC sp_executesql @sql;
        PRINT 'Added variante_id to dbo.' + @t;
    END
    FETCH NEXT FROM riga_cursor INTO @t;
END
CLOSE riga_cursor; DEALLOCATE riga_cursor;
GO

-- =====================================================================
-- 7) ALTER listini_prezzi ADD variante_id + UNIQUE NULL-safe filtered
-- =====================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.listini_prezzi') AND name = 'variante_id')
BEGIN
    ALTER TABLE dbo.listini_prezzi
        ADD variante_id INT NULL CONSTRAINT FK_listini_prezzi_variante
            REFERENCES dbo.prodotto_varianti(id);
END
GO

-- Filtered UNIQUE: una sola riga per (listino, prodotto, variante) attiva.
-- NB: NULL viene trattato come un singolo "valore" dal motore, quindi al massimo
-- 1 row con variante_id=NULL per coppia (listino, prodotto) — desiderato.
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_listini_prezzi_chiave' AND object_id=OBJECT_ID('dbo.listini_prezzi'))
    DROP INDEX UX_listini_prezzi_chiave ON dbo.listini_prezzi;
GO
CREATE UNIQUE INDEX UX_listini_prezzi_chiave
  ON dbo.listini_prezzi(listino_id, prodotto_id, variante_id)
  WHERE cancellato = 0 AND attivo = 1;
GO

-- =====================================================================
-- 8) Stored sp_aggiorna_descrizione_variante
--    Compone `descrizione_estesa` da prodotto.descrizione + attributi-valori
-- =====================================================================
IF OBJECT_ID('dbo.sp_aggiorna_descrizione_variante', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_aggiorna_descrizione_variante;
GO
CREATE PROCEDURE dbo.sp_aggiorna_descrizione_variante
    @variante_id INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @desc NVARCHAR(400);
    DECLARE @prod_desc NVARCHAR(200);

    SELECT @prod_desc = p.descrizione
    FROM dbo.prodotto_varianti pv
    JOIN dbo.prodotti p ON p.id = pv.prodotto_id
    WHERE pv.id = @variante_id;

    DECLARE @attrs NVARCHAR(200) = (
        SELECT STUFF((
            SELECT ' / ' + a.codice + ':' + v.codice
            FROM dbo.prodotto_varianti_attributi pva
            JOIN dbo.prodotto_attributi a ON a.id = pva.attributo_id
            JOIN dbo.prodotto_attributi_valori v ON v.id = pva.valore_id
            WHERE pva.variante_id = @variante_id
            ORDER BY a.ordine, a.codice
            FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 3, '')
    );

    SET @desc = ISNULL(@prod_desc, '') + CASE WHEN @attrs IS NOT NULL THEN ' [' + @attrs + ']' ELSE '' END;

    UPDATE dbo.prodotto_varianti
       SET descrizione_estesa = @desc, data_modifica = GETDATE()
     WHERE id = @variante_id;
END
GO

-- =====================================================================
-- 9) Stored sp_genera_matrice_varianti
--    Genera il cartesiano taglie×colori×... in batch per un prodotto.
-- @attributi_json: '[{"attributo_id":1,"valori_id":[1,2,3]},{"attributo_id":2,"valori_id":[10,20]}]'
-- =====================================================================
IF OBJECT_ID('dbo.sp_genera_matrice_varianti', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_genera_matrice_varianti;
GO
CREATE PROCEDURE dbo.sp_genera_matrice_varianti
    @prodotto_id    INT,
    @attributi_json NVARCHAR(MAX),
    @utente_id      INT = NULL,
    @inserted       INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @inserted = 0;

    -- Estrai gli attributi dichiarati
    DECLARE @attrs TABLE (attributo_id INT, valori_id_json NVARCHAR(MAX));
    INSERT INTO @attrs
    SELECT attributo_id, valori_id
    FROM OPENJSON(@attributi_json) WITH (
        attributo_id INT '$.attributo_id',
        valori_id    NVARCHAR(MAX) '$.valori_id' AS JSON
    );

    IF NOT EXISTS (SELECT 1 FROM @attrs)
        RETURN;

    -- Espandi i valori_id come righe (attributo_id, valore_id)
    DECLARE @valori TABLE (attributo_id INT, valore_id INT);
    INSERT INTO @valori (attributo_id, valore_id)
    SELECT a.attributo_id, v.[value]
    FROM @attrs a
    CROSS APPLY OPENJSON(a.valori_id_json) v;

    -- Cartesian product dinamico: usa una recursive CTE per generare le combinazioni
    -- (numero righe = prodotto delle cardinalita' di ogni attributo). Compatto per
    -- max 4 attributi (uso pratico — taglia/colore/modello/materiale).
    DECLARE @num_attrs INT = (SELECT COUNT(*) FROM @attrs);
    IF @num_attrs > 4
    BEGIN
        RAISERROR('sp_genera_matrice_varianti supporta max 4 attributi per chiamata', 16, 1);
        RETURN;
    END

    DECLARE @prod_codice VARCHAR(40);
    SELECT @prod_codice = codice FROM dbo.prodotti WHERE id = @prodotto_id;

    -- Genera combinazioni via cross-join condizionale fino a 4 livelli
    DECLARE @combos TABLE (a1_attr INT, a1_val INT, a2_attr INT, a2_val INT, a3_attr INT, a3_val INT, a4_attr INT, a4_val INT);

    IF @num_attrs = 1
        INSERT INTO @combos (a1_attr, a1_val) SELECT attributo_id, valore_id FROM @valori;
    ELSE IF @num_attrs = 2
        INSERT INTO @combos (a1_attr, a1_val, a2_attr, a2_val)
        SELECT v1.attributo_id, v1.valore_id, v2.attributo_id, v2.valore_id
        FROM @valori v1, @valori v2
        WHERE v1.attributo_id = (SELECT MIN(attributo_id) FROM @attrs)
          AND v2.attributo_id = (SELECT MAX(attributo_id) FROM @attrs)
          AND v1.attributo_id < v2.attributo_id;
    ELSE IF @num_attrs >= 3
    BEGIN
        DECLARE @a1 INT, @a2 INT, @a3 INT, @a4 INT;
        SELECT @a1 = MIN(attributo_id), @a4 = MAX(attributo_id) FROM @attrs;
        SELECT @a2 = MIN(attributo_id) FROM @attrs WHERE attributo_id > @a1;
        SELECT @a3 = MAX(attributo_id) FROM @attrs WHERE attributo_id < @a4;
        IF @num_attrs = 3
            INSERT INTO @combos (a1_attr, a1_val, a2_attr, a2_val, a3_attr, a3_val)
            SELECT @a1, v1.valore_id, @a2, v2.valore_id, @a4, v3.valore_id
            FROM @valori v1, @valori v2, @valori v3
            WHERE v1.attributo_id = @a1 AND v2.attributo_id = @a2 AND v3.attributo_id = @a4;
        ELSE
            INSERT INTO @combos (a1_attr, a1_val, a2_attr, a2_val, a3_attr, a3_val, a4_attr, a4_val)
            SELECT @a1, v1.valore_id, @a2, v2.valore_id, @a3, v3.valore_id, @a4, v4.valore_id
            FROM @valori v1, @valori v2, @valori v3, @valori v4
            WHERE v1.attributo_id = @a1 AND v2.attributo_id = @a2 AND v3.attributo_id = @a3 AND v4.attributo_id = @a4;
    END

    DECLARE @new_id INT;
    DECLARE @sku VARCHAR(80);
    DECLARE @a1a INT, @a1v INT, @a2a INT, @a2v INT, @a3a INT, @a3v INT, @a4a INT, @a4v INT;
    DECLARE c CURSOR LOCAL FAST_FORWARD FOR
        SELECT a1_attr, a1_val, a2_attr, a2_val, a3_attr, a3_val, a4_attr, a4_val FROM @combos;
    OPEN c;
    FETCH NEXT FROM c INTO @a1a, @a1v, @a2a, @a2v, @a3a, @a3v, @a4a, @a4v;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Auto-SKU: <codice_prodotto>-<val1>-<val2>-...
        SET @sku = @prod_codice;
        SELECT @sku = @sku + '-' + v.codice FROM dbo.prodotto_attributi_valori v WHERE v.id = @a1v;
        IF @a2v IS NOT NULL SELECT @sku = @sku + '-' + v.codice FROM dbo.prodotto_attributi_valori v WHERE v.id = @a2v;
        IF @a3v IS NOT NULL SELECT @sku = @sku + '-' + v.codice FROM dbo.prodotto_attributi_valori v WHERE v.id = @a3v;
        IF @a4v IS NOT NULL SELECT @sku = @sku + '-' + v.codice FROM dbo.prodotto_attributi_valori v WHERE v.id = @a4v;

        -- Skip se SKU gia' esiste
        IF NOT EXISTS (SELECT 1 FROM dbo.prodotto_varianti WHERE sku = @sku)
        BEGIN
            INSERT INTO dbo.prodotto_varianti (prodotto_id, sku, attivo, cancellato, data_creazione, utente_creazione)
            VALUES (@prodotto_id, @sku, 1, 0, GETDATE(), @utente_id);
            SET @new_id = SCOPE_IDENTITY();

            INSERT INTO dbo.prodotto_varianti_attributi (variante_id, attributo_id, valore_id) VALUES (@new_id, @a1a, @a1v);
            IF @a2v IS NOT NULL INSERT INTO dbo.prodotto_varianti_attributi (variante_id, attributo_id, valore_id) VALUES (@new_id, @a2a, @a2v);
            IF @a3v IS NOT NULL INSERT INTO dbo.prodotto_varianti_attributi (variante_id, attributo_id, valore_id) VALUES (@new_id, @a3a, @a3v);
            IF @a4v IS NOT NULL INSERT INTO dbo.prodotto_varianti_attributi (variante_id, attributo_id, valore_id) VALUES (@new_id, @a4a, @a4v);

            EXEC dbo.sp_aggiorna_descrizione_variante @variante_id = @new_id;
            SET @inserted = @inserted + 1;
        END
        FETCH NEXT FROM c INTO @a1a, @a1v, @a2a, @a2v, @a3a, @a3v, @a4a, @a4v;
    END
    CLOSE c; DEALLOCATE c;

    -- Marca il prodotto come variante-aware
    UPDATE dbo.prodotti SET has_varianti = 1, data_modifica = GETDATE() WHERE id = @prodotto_id;
END
GO

-- =====================================================================
-- 10) Stored sp_risolvi_prezzo_variante
--     Cascade resolution: listino[variante] > listino[null] > master.override > master
-- =====================================================================
IF OBJECT_ID('dbo.sp_risolvi_prezzo_variante', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_risolvi_prezzo_variante;
GO
CREATE PROCEDURE dbo.sp_risolvi_prezzo_variante
    @prodotto_id     INT,
    @variante_id     INT = NULL,
    @cliente_id      INT = NULL,
    @data_riferimento DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @data_riferimento IS NULL SET @data_riferimento = CAST(GETDATE() AS DATE);

    DECLARE @listino_id INT = NULL;
    IF @cliente_id IS NOT NULL
        SELECT @listino_id = listino_id FROM dbo.clienti WHERE id = @cliente_id;

    DECLARE @prezzo_vendita DECIMAL(18,4) = NULL;
    DECLARE @prezzo_acquisto DECIMAL(18,4) = NULL;
    DECLARE @sconto DECIMAL(5,2) = NULL;
    DECLARE @fonte VARCHAR(20) = NULL;

    -- 1) listino + variante specifica
    IF @listino_id IS NOT NULL AND @variante_id IS NOT NULL
    BEGIN
        SELECT TOP 1
            @prezzo_vendita = prezzo_vendita,
            @prezzo_acquisto = prezzo_acquisto,
            @sconto = sconto_default,
            @fonte = 'LISTINO_VARIANTE'
        FROM dbo.listini_prezzi
        WHERE listino_id = @listino_id
          AND prodotto_id = @prodotto_id
          AND variante_id = @variante_id
          AND attivo = 1 AND cancellato = 0
          AND valid_from <= @data_riferimento
          AND (valid_to IS NULL OR valid_to >= @data_riferimento)
        ORDER BY valid_from DESC, id DESC;
    END

    -- 2) listino + default (variante_id IS NULL)
    IF @fonte IS NULL AND @listino_id IS NOT NULL
    BEGIN
        SELECT TOP 1
            @prezzo_vendita = prezzo_vendita,
            @prezzo_acquisto = prezzo_acquisto,
            @sconto = sconto_default,
            @fonte = 'LISTINO_PRODOTTO'
        FROM dbo.listini_prezzi
        WHERE listino_id = @listino_id
          AND prodotto_id = @prodotto_id
          AND variante_id IS NULL
          AND attivo = 1 AND cancellato = 0
          AND valid_from <= @data_riferimento
          AND (valid_to IS NULL OR valid_to >= @data_riferimento)
        ORDER BY valid_from DESC, id DESC;
    END

    -- 3) master variante override
    IF @fonte IS NULL AND @variante_id IS NOT NULL
    BEGIN
        SELECT
            @prezzo_vendita = prezzo_vendita_override,
            @prezzo_acquisto = prezzo_acquisto_override,
            @sconto = NULL,
            @fonte = CASE WHEN prezzo_vendita_override IS NOT NULL THEN 'MASTER_VARIANTE' ELSE NULL END
        FROM dbo.prodotto_varianti
        WHERE id = @variante_id;
    END

    -- 4) master prodotto fallback
    IF @fonte IS NULL
    BEGIN
        SELECT
            @prezzo_vendita = prezzo_vendita,
            @prezzo_acquisto = prezzo_acquisto,
            @sconto = NULL,
            @fonte = 'MASTER_PRODOTTO'
        FROM dbo.prodotti
        WHERE id = @prodotto_id;
    END

    SELECT
        @prezzo_vendita  AS prezzo_vendita,
        @prezzo_acquisto AS prezzo_acquisto,
        @sconto          AS sconto_default,
        @fonte           AS fonte,
        @listino_id      AS listino_id;
END
GO

PRINT '45_varianti.sql applicato: prodotto_attributi + valori + has_varianti + prodotto_varianti + M:N + ALTER 7 righe + listini_prezzi + 3 stored';
GO
