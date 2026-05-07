-- ====================================================================
-- 21_sp_dash_top_clienti.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #18: Top clienti per fatturato.
--
-- SP `sp_dash_top_clienti(@anno, @top_n, @periodo)`
--   - aggrega fatture_inviate per cliente nell'anno + periodo (YEAR/Q1-Q4/01-12)
--   - solo fatture EMESSA / CONSEGNATA (escludi BOZZA / ANNULLATA / SCARTATA)
--   - calcola: num_fatture, imponibile, iva, totale, ultima_data
--   - ritorna i TOP @top_n clienti ordinati per totale DESC
--
-- Output: array di clienti con metriche fatturato.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_dash_top_clienti', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_top_clienti;
GO

CREATE PROCEDURE dbo.sp_dash_top_clienti
    @anno    INT,
    @top_n   INT = 10,
    @periodo NVARCHAR(8) = N'YEAR'
AS
BEGIN
    SET NOCOUNT ON;

    -- normalizzazione periodo → range date (stesso pattern di sp_riepilogo_iva_periodo)
    DECLARE @data_da DATE, @data_a DATE;
    IF @periodo = N'YEAR'
    BEGIN
        SET @data_da = DATEFROMPARTS(@anno, 1, 1);
        SET @data_a  = DATEFROMPARTS(@anno, 12, 31);
    END
    ELSE IF @periodo = N'Q1' BEGIN SET @data_da = DATEFROMPARTS(@anno, 1, 1);  SET @data_a = DATEFROMPARTS(@anno, 3, 31);  END
    ELSE IF @periodo = N'Q2' BEGIN SET @data_da = DATEFROMPARTS(@anno, 4, 1);  SET @data_a = DATEFROMPARTS(@anno, 6, 30);  END
    ELSE IF @periodo = N'Q3' BEGIN SET @data_da = DATEFROMPARTS(@anno, 7, 1);  SET @data_a = DATEFROMPARTS(@anno, 9, 30);  END
    ELSE IF @periodo = N'Q4' BEGIN SET @data_da = DATEFROMPARTS(@anno, 10, 1); SET @data_a = DATEFROMPARTS(@anno, 12, 31); END
    ELSE IF TRY_CAST(@periodo AS INT) BETWEEN 1 AND 12
    BEGIN
        DECLARE @m INT = CAST(@periodo AS INT);
        SET @data_da = DATEFROMPARTS(@anno, @m, 1);
        SET @data_a  = EOMONTH(@data_da);
    END
    ELSE
    BEGIN
        RAISERROR('Periodo non valido: %s. Atteso YEAR | Q1..Q4 | 01..12', 16, 1, @periodo);
        RETURN;
    END;

    IF @top_n IS NULL OR @top_n < 1 SET @top_n = 10;
    IF @top_n > 100 SET @top_n = 100;  -- safety cap

    SELECT TOP (@top_n)
        c.id                                AS cliente_id,
        c.codice                            AS cliente_codice,
        c.ragione_sociale                   AS cliente_ragione,
        c.tipo_soggetto                     AS cliente_tipo,
        COUNT(f.id)                         AS num_fatture,
        SUM(f.imponibile)                   AS imponibile_totale,
        SUM(f.iva)                          AS iva_totale,
        SUM(f.totale)                       AS totale_fatturato,
        MIN(f.data_documento)               AS prima_fattura,
        MAX(f.data_documento)               AS ultima_fattura
    FROM dbo.fatture_inviate f
    JOIN dbo.clienti c ON c.id = f.cliente_id
    WHERE ISNULL(f.cancellato, 0) = 0
      AND f.data_documento BETWEEN @data_da AND @data_a
      AND f.stato IN ('EMESSA', 'CONSEGNATA')
    GROUP BY c.id, c.codice, c.ragione_sociale, c.tipo_soggetto
    ORDER BY SUM(f.totale) DESC;
END;
GO

PRINT 'sp_dash_top_clienti creata.';
GO
