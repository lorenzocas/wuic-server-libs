-- ====================================================================
-- 22_sp_aging_crediti.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #19: Aging analysis crediti.
--
-- SP `sp_aging_crediti(@data_riferimento)`
--   - aggrega scadenze INCASSO APERTA/PARZIALI
--   - calcola per ogni scadenza: giorni_scaduti = (data_riferimento - data_scadenza)
--   - bucketa per fascia eta':
--       NON_SCADUTO     → giorni_scaduti < 0    (ancora non scaduto)
--       SCADUTO_0_30    → 0..30 giorni
--       SCADUTO_31_60   → 31..60 giorni
--       SCADUTO_61_90   → 61..90 giorni
--       SCADUTO_OVER_90 → > 90 giorni
--   - per ogni bucket: somma importi residui + count + lista clienti coinvolti
--
-- Output: una riga per bucket con num_scadenze, num_clienti, totale_residuo
--         + dataset clienti dettaglio (top scadenza per cliente per drill-down)
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_aging_crediti', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_aging_crediti;
GO

CREATE PROCEDURE dbo.sp_aging_crediti
    @data_riferimento DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @data_riferimento IS NULL SET @data_riferimento = CAST(GETDATE() AS DATE);

    -- Table variable: una CTE non puo' essere riusata su 2 SELECT successivi in T-SQL.
    -- Materializziamo le righe pre-bucketed cosi' i due result-set successivi
    -- (aggregato bucket + dettaglio cliente) leggono dallo stesso dataset.
    DECLARE @scad_b TABLE (
        id INT, cliente_id INT, data_scadenza DATE,
        importo_residuo DECIMAL(19,4),
        giorni_scaduti INT,
        bucket NVARCHAR(20)
    );
    INSERT INTO @scad_b (id, cliente_id, data_scadenza, importo_residuo, giorni_scaduti, bucket)
    SELECT
        s.id, s.cliente_id, s.data_scadenza,
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
      AND s.tipo = 'INCASSO'
      AND s.stato IN ('APERTA', 'PARZIALE')
      AND (s.importo - s.importo_pagato) > 0;

    -- Result-set 1: aggregato per bucket
    SELECT
        bucket,
        COUNT(*)                          AS num_scadenze,
        COUNT(DISTINCT cliente_id)        AS num_clienti,
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

    -- Result-set 2: dettaglio per cliente (aggregato per cliente cross-bucket)
    SELECT
        c.id            AS cliente_id,
        c.codice        AS cliente_codice,
        c.ragione_sociale AS cliente_ragione,
        SUM(CASE WHEN sb.bucket = 'NON_SCADUTO'     THEN sb.importo_residuo ELSE 0 END) AS non_scaduto,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_0_30'    THEN sb.importo_residuo ELSE 0 END) AS scaduto_0_30,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_31_60'   THEN sb.importo_residuo ELSE 0 END) AS scaduto_31_60,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_61_90'   THEN sb.importo_residuo ELSE 0 END) AS scaduto_61_90,
        SUM(CASE WHEN sb.bucket = 'SCADUTO_OVER_90' THEN sb.importo_residuo ELSE 0 END) AS scaduto_over_90,
        SUM(sb.importo_residuo) AS totale_esposizione,
        COUNT(*) AS num_scadenze
    FROM @scad_b sb
    JOIN dbo.clienti c ON c.id = sb.cliente_id
    GROUP BY c.id, c.codice, c.ragione_sociale
    ORDER BY SUM(sb.importo_residuo) DESC;
END;
GO

PRINT 'sp_aging_crediti creata.';
GO
