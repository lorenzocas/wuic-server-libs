-- ====================================================================
-- 24_sp_aging_debiti.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #20: Aging analysis debiti fornitori (specchio del #19).
--
-- Stesso pattern di sp_aging_crediti ma su:
--   - tipo='PAGAMENTO' (debiti verso fornitori) invece di INCASSO
--   - JOIN dbo.fornitori invece di clienti
--
-- Output: 2 result-set (buckets + dettaglio fornitori).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_aging_debiti', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_aging_debiti;
GO

CREATE PROCEDURE dbo.sp_aging_debiti
    @data_riferimento DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @data_riferimento IS NULL SET @data_riferimento = CAST(GETDATE() AS DATE);

    DECLARE @scad_b TABLE (
        id INT, fornitore_id INT, data_scadenza DATE,
        importo_residuo DECIMAL(19,4),
        giorni_scaduti INT,
        bucket NVARCHAR(20)
    );
    INSERT INTO @scad_b (id, fornitore_id, data_scadenza, importo_residuo, giorni_scaduti, bucket)
    SELECT
        s.id, s.fornitore_id, s.data_scadenza,
        (s.importo - s.importo_pagato),
        DATEDIFF(DAY, s.data_scadenza, @data_riferimento),
        CASE
            WHEN DATEDIFF(DAY, s.data_scadenza, @data_riferimento) < 0       THEN 'NON_SCADUTO'
            WHEN DATEDIFF(DAY, s.data_scadenza, @data_riferimento) BETWEEN 0   AND 30  THEN 'SCADUTO_0_30'
            WHEN DATEDIFF(DAY, s.data_scadenza, @data_riferimento) BETWEEN 31  AND 60  THEN 'SCADUTO_31_60'
            WHEN DATEDIFF(DAY, s.data_scadenza, @data_riferimento) BETWEEN 61  AND 90  THEN 'SCADUTO_61_90'
            ELSE 'SCADUTO_OVER_90'
        END
    FROM dbo.scadenze s
    WHERE ISNULL(s.cancellato, 0) = 0
      AND s.tipo = 'PAGAMENTO'
      AND s.stato IN ('APERTA', 'PARZIALE')
      AND (s.importo - s.importo_pagato) > 0
      AND s.fornitore_id IS NOT NULL;

    -- Result-set 1: aggregato per bucket
    SELECT
        bucket,
        COUNT(*)                          AS num_scadenze,
        COUNT(DISTINCT fornitore_id)      AS num_fornitori,
        SUM(importo_residuo)              AS totale_residuo,
        MIN(giorni_scaduti)               AS giorni_min,
        MAX(giorni_scaduti)               AS giorni_max
    FROM @scad_b
    GROUP BY bucket
    ORDER BY
        CASE bucket
            WHEN 'NON_SCADUTO'     THEN 0
            WHEN 'SCADUTO_0_30'    THEN 1
            WHEN 'SCADUTO_31_60'   THEN 2
            WHEN 'SCADUTO_61_90'   THEN 3
            WHEN 'SCADUTO_OVER_90' THEN 4
        END;

    -- Result-set 2: dettaglio per fornitore
    SELECT
        f.id              AS fornitore_id,
        f.codice          AS fornitore_codice,
        f.ragione_sociale AS fornitore_ragione,
        SUM(CASE WHEN sb.bucket = 'NON_SCADUTO'     THEN sb.importo_residuo ELSE 0 END) AS non_scaduto,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_0_30'    THEN sb.importo_residuo ELSE 0 END) AS scaduto_0_30,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_31_60'   THEN sb.importo_residuo ELSE 0 END) AS scaduto_31_60,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_61_90'   THEN sb.importo_residuo ELSE 0 END) AS scaduto_61_90,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_OVER_90' THEN sb.importo_residuo ELSE 0 END) AS scaduto_over_90,
        SUM(sb.importo_residuo) AS totale_esposizione,
        COUNT(*) AS num_scadenze
    FROM @scad_b sb
    JOIN dbo.fornitori f ON f.id = sb.fornitore_id
    GROUP BY f.id, f.codice, f.ragione_sociale
    ORDER BY SUM(sb.importo_residuo) DESC;
END;
GO

PRINT 'sp_aging_debiti creata.';
GO
