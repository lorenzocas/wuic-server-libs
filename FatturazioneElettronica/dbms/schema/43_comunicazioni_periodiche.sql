/* ============================================================
   43_comunicazioni_periodiche.sql

   Schema per le comunicazioni periodiche all'Agenzia delle Entrate:
     - LIPE        (Liquidazione Periodica IVA, trimestrale)
     - Esterometro (Comunicazione fatture transfrontaliere, mensile/trimestrale)
     - CU          (Certificazione Unica per redditi collaboratori, annuale)

   Tabella `comunicazioni_periodiche`: una riga per ogni file generato
   (LIPE_2026Q1.xml, ESTEROMETRO_2026M03.xml, CU_2026.xml).
   ============================================================ */
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Data;

IF OBJECT_ID('dbo.comunicazioni_periodiche', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.comunicazioni_periodiche (
        id              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        tipo            NVARCHAR(20) NOT NULL,    -- LIPE | ESTEROMETRO | CU
        anno            INT NOT NULL,
        periodo         NVARCHAR(10) NULL,        -- Q1|Q2|Q3|Q4 per LIPE, M01..M12 per Esterometro, NULL per CU annuale
        nome_file       NVARCHAR(256) NOT NULL,
        xml_payload     NVARCHAR(MAX) NULL,       -- XML generato
        sha256_hash     CHAR(64) NULL,
        stato           NVARCHAR(20) NOT NULL DEFAULT 'BOZZA',  -- BOZZA | GENERATA | INVIATA | ACCETTATA | RIFIUTATA
        sdi_id          NVARCHAR(64) NULL,         -- IdentificativoSdI dopo invio
        data_creazione  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        data_invio      DATETIME2 NULL,
        utente_creazione NVARCHAR(64) NULL,
        riepilogo_json  NVARCHAR(MAX) NULL,        -- JSON con totals/aggregati per dashboard
        note            NVARCHAR(2000) NULL
    );
    PRINT 'Created table dbo.comunicazioni_periodiche';
END
ELSE
    PRINT 'Table dbo.comunicazioni_periodiche already exists';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_comunicazioni_tipo_periodo' AND object_id = OBJECT_ID('dbo.comunicazioni_periodiche'))
    CREATE UNIQUE INDEX IX_comunicazioni_tipo_periodo ON dbo.comunicazioni_periodiche(tipo, anno, periodo)
        WHERE periodo IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_comunicazioni_tipo_anno' AND object_id = OBJECT_ID('dbo.comunicazioni_periodiche'))
    CREATE UNIQUE INDEX IX_comunicazioni_tipo_anno ON dbo.comunicazioni_periodiche(tipo, anno)
        WHERE periodo IS NULL;

PRINT 'Indexes ensured';

GO

/* ============================================================
   sp_aggregato_lipe: aggrega imponibile/IVA delle fatture inviate
   e ricevute per un trimestre dato. Output: 3 result-set
   (vendite, acquisti, saldo).
   ============================================================ */
IF OBJECT_ID('dbo.sp_aggregato_lipe', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_aggregato_lipe;
GO

CREATE PROCEDURE dbo.sp_aggregato_lipe
    @anno INT,
    @trimestre INT  -- 1..4
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @startMonth INT = (@trimestre - 1) * 3 + 1;
    DECLARE @endMonth   INT = @trimestre * 3;
    DECLARE @startDate  DATE = DATEFROMPARTS(@anno, @startMonth, 1);
    DECLARE @endDate    DATE = EOMONTH(DATEFROMPARTS(@anno, @endMonth, 1));

    -- Vendite: somma imponibile/IVA fatture_inviate emesse nel trimestre
    SELECT
        'VENDITE'                       AS sezione,
        ISNULL(SUM(imponibile), 0)      AS imponibile,
        ISNULL(SUM(iva), 0)             AS imposta,
        COUNT(*)                        AS num_fatture
    FROM dbo.fatture_inviate
    WHERE COALESCE(cancellato, 0) = 0
      AND data_documento BETWEEN @startDate AND @endDate
      AND stato IN ('EMESSA', 'PAGATA');

    -- Acquisti: somma imponibile/IVA fatture_ricevute nel trimestre
    -- (assumendo tabella fatture_ricevute con colonne analoghe)
    IF OBJECT_ID('dbo.fatture_ricevute', 'U') IS NOT NULL
    BEGIN
        SELECT
            'ACQUISTI'                  AS sezione,
            ISNULL(SUM(imponibile), 0)  AS imponibile,
            ISNULL(SUM(iva), 0)         AS imposta,
            COUNT(*)                    AS num_fatture
        FROM dbo.fatture_ricevute
        WHERE COALESCE(cancellato, 0) = 0
          AND data_documento BETWEEN @startDate AND @endDate;
    END
    ELSE
    BEGIN
        SELECT 'ACQUISTI' AS sezione, CAST(0 AS DECIMAL(18,2)) AS imponibile,
               CAST(0 AS DECIMAL(18,2)) AS imposta, 0 AS num_fatture;
    END

    -- Saldo IVA = IVA vendite - IVA acquisti (positivo: IVA da versare; negativo: credito)
    DECLARE @ivaVendite  DECIMAL(18,2);
    DECLARE @ivaAcquisti DECIMAL(18,2);

    SELECT @ivaVendite = ISNULL(SUM(iva), 0)
    FROM dbo.fatture_inviate
    WHERE COALESCE(cancellato, 0) = 0
      AND data_documento BETWEEN @startDate AND @endDate
      AND stato IN ('EMESSA', 'PAGATA');

    IF OBJECT_ID('dbo.fatture_ricevute', 'U') IS NOT NULL
        SELECT @ivaAcquisti = ISNULL(SUM(iva), 0)
        FROM dbo.fatture_ricevute
        WHERE COALESCE(cancellato, 0) = 0
          AND data_documento BETWEEN @startDate AND @endDate;
    ELSE
        SELECT @ivaAcquisti = 0;

    SELECT
        'SALDO'                                   AS sezione,
        @ivaVendite                               AS iva_vendite,
        @ivaAcquisti                              AS iva_acquisti,
        @ivaVendite - @ivaAcquisti                AS saldo_iva,
        @startDate                                AS periodo_da,
        @endDate                                  AS periodo_a;
END;
GO

PRINT 'sp_aggregato_lipe created';
