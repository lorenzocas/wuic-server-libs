-- ====================================================================
-- 20_sp_cashflow_forecast.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #17: Cash-flow forecast — proiezione saldo a partire da scadenze
-- aperte (APERTA/PARZIALE) nei prossimi N giorni.
--
-- SP `sp_cashflow_forecast(@data_da DATE, @giorni INT)`
--   - aggrega per data_scadenza
--   - separa incassi attesi (tipo INCASSO) da pagamenti attesi (tipo PAGAMENTO)
--   - calcola saldo_giorno = incassi - pagamenti
--   - calcola saldo_cumulato (running total) ordinato per data
--   - importi sono "residui" (importo - importo_pagato), per gestire scadenze
--     PARZIALI dove parte e' gia' stata incassata/pagata
--
-- Output: una riga per ogni data_scadenza con almeno una scadenza nel range.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_cashflow_forecast', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_cashflow_forecast;
GO

CREATE PROCEDURE dbo.sp_cashflow_forecast
    @data_da DATE = NULL,
    @giorni  INT  = 90
AS
BEGIN
    SET NOCOUNT ON;
    IF @data_da IS NULL SET @data_da = CAST(GETDATE() AS DATE);
    IF @giorni IS NULL OR @giorni < 1 SET @giorni = 90;
    IF @giorni > 730 SET @giorni = 730;  -- safety cap (~2 anni)
    DECLARE @data_a DATE = DATEADD(DAY, @giorni, @data_da);

    ;WITH daily AS (
        SELECT
            data_scadenza,
            SUM(CASE WHEN tipo = 'INCASSO'   THEN (importo - importo_pagato) ELSE 0 END) AS incassi_attesi,
            SUM(CASE WHEN tipo = 'PAGAMENTO' THEN (importo - importo_pagato) ELSE 0 END) AS pagamenti_attesi,
            SUM(CASE WHEN tipo = 'INCASSO'   THEN 1 ELSE 0 END) AS num_incassi,
            SUM(CASE WHEN tipo = 'PAGAMENTO' THEN 1 ELSE 0 END) AS num_pagamenti
        FROM dbo.scadenze
        WHERE ISNULL(cancellato, 0) = 0
          AND stato IN ('APERTA', 'PARZIALE')
          AND data_scadenza BETWEEN @data_da AND @data_a
        GROUP BY data_scadenza
    )
    SELECT
        data_scadenza,
        incassi_attesi,
        pagamenti_attesi,
        (incassi_attesi - pagamenti_attesi) AS saldo_giorno,
        SUM(incassi_attesi - pagamenti_attesi)
            OVER (ORDER BY data_scadenza ROWS UNBOUNDED PRECEDING) AS saldo_cumulato,
        num_incassi,
        num_pagamenti
    FROM daily
    ORDER BY data_scadenza;
END;
GO

PRINT 'sp_cashflow_forecast creata.';
GO
