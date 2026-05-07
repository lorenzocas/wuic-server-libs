-- ====================================================================
-- 28_vw_cashflow_set.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #17 (refactor framework-first): 2 viste a supporto della dashboard
-- cashflow forecast.
--
--   - vw_cashflow_totali:     1 riga KPI (incassi/pagamenti/saldo finale/etc)
--   - vw_cashflow_giornaliero: N righe (1 per data con movimento) per chart
--                              line+bar (saldo cumulato + saldo giorno).
--
-- Periodo fissato a 90 giorni da GETDATE() (no params).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Vista base: tutte le scadenze APERTA/PARZIALI nei prox 90gg
IF OBJECT_ID('dbo.vw_cashflow_base', 'V') IS NOT NULL DROP VIEW dbo.vw_cashflow_base;
GO
CREATE VIEW dbo.vw_cashflow_base
AS
SELECT
    s.id              AS scadenza_id,
    s.tipo,
    s.data_scadenza,
    (s.importo - s.importo_pagato) AS importo_residuo
FROM dbo.scadenze s
WHERE ISNULL(s.cancellato, 0) = 0
  AND s.stato IN ('APERTA', 'PARZIALE')
  AND s.data_scadenza BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 90, CAST(GETDATE() AS DATE))
  AND (s.importo - s.importo_pagato) > 0;
GO

-- KPI single-row
IF OBJECT_ID('dbo.vw_cashflow_totali', 'V') IS NOT NULL DROP VIEW dbo.vw_cashflow_totali;
GO
CREATE VIEW dbo.vw_cashflow_totali
AS
SELECT
    1 AS id,
    SUM(CASE WHEN tipo = 'INCASSO' THEN importo_residuo ELSE 0 END)        AS incassi_attesi,
    SUM(CASE WHEN tipo = 'PAGAMENTO' THEN importo_residuo ELSE 0 END)      AS pagamenti_attesi,
    SUM(CASE WHEN tipo = 'INCASSO' THEN importo_residuo ELSE 0 END)
        - SUM(CASE WHEN tipo = 'PAGAMENTO' THEN importo_residuo ELSE 0 END) AS saldo_finale,
    SUM(CASE WHEN tipo = 'INCASSO' THEN 1 ELSE 0 END)                      AS num_incassi,
    SUM(CASE WHEN tipo = 'PAGAMENTO' THEN 1 ELSE 0 END)                    AS num_pagamenti,
    COUNT(DISTINCT data_scadenza)                                          AS giorni_con_movimento,
    CASE
        WHEN SUM(CASE WHEN tipo = 'INCASSO' THEN importo_residuo ELSE 0 END)
             - SUM(CASE WHEN tipo = 'PAGAMENTO' THEN importo_residuo ELSE 0 END) > 0 THEN 'SURPLUS'
        WHEN SUM(CASE WHEN tipo = 'INCASSO' THEN importo_residuo ELSE 0 END)
             - SUM(CASE WHEN tipo = 'PAGAMENTO' THEN importo_residuo ELSE 0 END) < 0 THEN 'DEFICIT'
        ELSE 'PARI'
    END AS stato_saldo
FROM dbo.vw_cashflow_base;
GO

-- Daily aggregato + cumulative running total
IF OBJECT_ID('dbo.vw_cashflow_giornaliero', 'V') IS NOT NULL DROP VIEW dbo.vw_cashflow_giornaliero;
GO
CREATE VIEW dbo.vw_cashflow_giornaliero
AS
WITH daily AS (
    SELECT
        data_scadenza,
        SUM(CASE WHEN tipo = 'INCASSO'   THEN importo_residuo ELSE 0 END) AS incassi_attesi,
        SUM(CASE WHEN tipo = 'PAGAMENTO' THEN importo_residuo ELSE 0 END) AS pagamenti_attesi,
        SUM(CASE WHEN tipo = 'INCASSO'   THEN 1 ELSE 0 END) AS num_incassi,
        SUM(CASE WHEN tipo = 'PAGAMENTO' THEN 1 ELSE 0 END) AS num_pagamenti
    FROM dbo.vw_cashflow_base
    GROUP BY data_scadenza
)
SELECT
    -- ROW_NUMBER come pk virtuale ordinata
    CAST(ROW_NUMBER() OVER (ORDER BY data_scadenza) AS INT) AS id,
    data_scadenza,
    -- Etichetta corta per asse X chart (es. "21/06"). Senza questa colonna
    -- il chart label userebbe data_scadenza serializzata come "2026-06-21T00:00:00",
    -- che ruotata occuperebbe ~150px verticali e con altezza chart ~380px viene
    -- troncata da Chart.js auto-skip.
    CONVERT(CHAR(5), data_scadenza, 103) AS data_label,
    incassi_attesi,
    pagamenti_attesi,
    (incassi_attesi - pagamenti_attesi) AS saldo_giorno,
    SUM(incassi_attesi - pagamenti_attesi) OVER (ORDER BY data_scadenza ROWS UNBOUNDED PRECEDING) AS saldo_cumulato,
    num_incassi,
    num_pagamenti
FROM daily;
GO

PRINT 'vw_cashflow_totali + vw_cashflow_giornaliero create.';
GO

-- Verify
SELECT 'totali' AS v, COUNT(*) AS n FROM dbo.vw_cashflow_totali
UNION ALL SELECT 'giornaliero', COUNT(*) FROM dbo.vw_cashflow_giornaliero;
GO
