-- ====================================================================
-- 18_sp_riepilogo_iva_periodo.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #17: Riepilogo IVA periodico (LIPE-style).
--
-- SP `sp_riepilogo_iva_periodo(@anno INT, @periodo NVARCHAR(8))`
--   - aggrega per aliquota su fatture_inviate (IVA a debito) e
--     fatture_ricevute (IVA a credito) nel periodo richiesto.
--   - @periodo:
--       'YEAR'              → gennaio-dicembre dell'anno
--       'Q1' / 'Q2' / 'Q3' / 'Q4' → trimestri
--       '01' .. '12'        → mese specifico
--
-- Output single result-set:
--   aliquota DECIMAL(5,2),
--   imponibile_vendite, iva_vendite, num_fatture_emesse,
--   imponibile_acquisti, iva_acquisti, num_fatture_ricevute,
--   saldo_iva (vendite - acquisti)  (a debito se >0, a credito se <0)
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_riepilogo_iva_periodo', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_riepilogo_iva_periodo;
GO

CREATE PROCEDURE dbo.sp_riepilogo_iva_periodo
    @anno    INT,
    @periodo NVARCHAR(8) = N'YEAR'
AS
BEGIN
    SET NOCOUNT ON;

    -- normalizzazione periodo → range date
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

    -- Vendite per aliquota
    DECLARE @vendite TABLE (
        aliquota DECIMAL(5,2) NOT NULL,
        imponibile DECIMAL(19,4) NOT NULL,
        iva DECIMAL(19,4) NOT NULL,
        num_fatture INT NOT NULL
    );
    INSERT INTO @vendite (aliquota, imponibile, iva, num_fatture)
    SELECT ci.aliquota,
           SUM(r.imponibile_riga),
           SUM(r.iva_riga),
           COUNT(DISTINCT f.id)
    FROM dbo.fatture_inviate f
    JOIN dbo.fatture_inviate_righe r ON r.fattura_id = f.id
    JOIN dbo.codici_iva ci ON ci.id = r.codice_iva_id
    WHERE ISNULL(f.cancellato, 0) = 0
      AND f.data_documento BETWEEN @data_da AND @data_a
      AND f.stato IN ('EMESSA','CONSEGNATA')
    GROUP BY ci.aliquota;

    -- Acquisti per aliquota
    DECLARE @acquisti TABLE (
        aliquota DECIMAL(5,2) NOT NULL,
        imponibile DECIMAL(19,4) NOT NULL,
        iva DECIMAL(19,4) NOT NULL,
        num_fatture INT NOT NULL
    );
    INSERT INTO @acquisti (aliquota, imponibile, iva, num_fatture)
    SELECT ci.aliquota,
           SUM(r.imponibile_riga),
           SUM(r.iva_riga),
           COUNT(DISTINCT f.id)
    FROM dbo.fatture_ricevute f
    JOIN dbo.fatture_ricevute_righe r ON r.fattura_id = f.id
    JOIN dbo.codici_iva ci ON ci.id = r.codice_iva_id
    WHERE ISNULL(f.cancellato, 0) = 0
      AND f.data_documento BETWEEN @data_da AND @data_a
    GROUP BY ci.aliquota;

    -- FULL OUTER JOIN per avere tutte le aliquote (anche solo vendite o solo acquisti)
    SELECT
        COALESCE(v.aliquota, a.aliquota) AS aliquota,
        ISNULL(v.imponibile, 0)          AS imponibile_vendite,
        ISNULL(v.iva, 0)                 AS iva_vendite,
        ISNULL(v.num_fatture, 0)         AS num_fatture_emesse,
        ISNULL(a.imponibile, 0)          AS imponibile_acquisti,
        ISNULL(a.iva, 0)                 AS iva_acquisti,
        ISNULL(a.num_fatture, 0)         AS num_fatture_ricevute,
        (ISNULL(v.iva, 0) - ISNULL(a.iva, 0)) AS saldo_iva
    FROM @vendite v
    FULL OUTER JOIN @acquisti a ON a.aliquota = v.aliquota
    ORDER BY aliquota;
END;
GO

PRINT 'sp_riepilogo_iva_periodo creata.';
GO
