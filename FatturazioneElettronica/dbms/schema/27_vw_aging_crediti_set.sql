-- ====================================================================
-- 27_vw_aging_crediti_set.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #19 (refactor framework-first): 3 viste a supporto della dashboard
-- aging crediti, ognuna scaffoldabile e bindabile come datasource framework.
--
--   - vw_aging_crediti_totali: 1 riga con i 4 KPI (per i 4 SPAN tile in alto)
--   - vw_aging_crediti_buckets: 5 righe, 1 per fascia eta' (per chart distribuzione)
--   - vw_aging_crediti_clienti: N righe, 1 per cliente con esposizione cross-bucket
--
-- Tutte le viste usano GETDATE() come `data_riferimento` (no-params), cosi'
-- restano scaffoldabili senza wrapper SP.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- CTE-based base view (riusabile dalle 3 viste sopra)
IF OBJECT_ID('dbo.vw_aging_crediti_base', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_crediti_base;
GO
CREATE VIEW dbo.vw_aging_crediti_base
AS
SELECT
    s.id              AS scadenza_id,
    s.cliente_id,
    s.data_scadenza,
    (s.importo - s.importo_pagato) AS importo_residuo,
    DATEDIFF(DAY, s.data_scadenza, CAST(GETDATE() AS DATE)) AS giorni_scaduti,
    CASE
        WHEN DATEDIFF(DAY, s.data_scadenza, CAST(GETDATE() AS DATE)) < 0       THEN 'NON_SCADUTO'
        WHEN DATEDIFF(DAY, s.data_scadenza, CAST(GETDATE() AS DATE)) BETWEEN 0   AND 30  THEN 'SCADUTO_0_30'
        WHEN DATEDIFF(DAY, s.data_scadenza, CAST(GETDATE() AS DATE)) BETWEEN 31  AND 60  THEN 'SCADUTO_31_60'
        WHEN DATEDIFF(DAY, s.data_scadenza, CAST(GETDATE() AS DATE)) BETWEEN 61  AND 90  THEN 'SCADUTO_61_90'
        ELSE 'SCADUTO_OVER_90'
    END AS bucket
FROM dbo.scadenze s
WHERE ISNULL(s.cancellato, 0) = 0
  AND s.tipo = 'INCASSO'
  AND s.stato IN ('APERTA', 'PARZIALE')
  AND (s.importo - s.importo_pagato) > 0;
GO
PRINT 'vw_aging_crediti_base creata.';
GO

-- ===== KPI TOTALI (1 row) =====
IF OBJECT_ID('dbo.vw_aging_crediti_totali', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_crediti_totali;
GO
CREATE VIEW dbo.vw_aging_crediti_totali
AS
SELECT
    1 AS id,                                                  -- pk virtuale fissa (single-row)
    SUM(importo_residuo)                       AS totale_esposizione,
    SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) AS totale_scaduto,
    COUNT(*)                                   AS num_scadenze_totali,
    COUNT(DISTINCT cliente_id)                 AS num_clienti_totali,
    CASE
        WHEN SUM(importo_residuo) > 0 THEN
            CAST(ROUND(SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) * 100.0, 2) AS DECIMAL(5,2))
        ELSE 0.00
    END AS perc_scaduto_su_totale,
    -- classifier: basso (<=10%), medio (11-30%), alto (>30%)
    CASE
        WHEN SUM(importo_residuo) = 0 THEN 'BASSO'
        WHEN SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) <= 0.10 THEN 'BASSO'
        WHEN SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) <= 0.30 THEN 'MEDIO'
        ELSE 'ALTO'
    END AS rischio
FROM dbo.vw_aging_crediti_base;
GO
PRINT 'vw_aging_crediti_totali creata.';
GO

-- ===== BUCKET DISTRIBUTION (5 rows) =====
IF OBJECT_ID('dbo.vw_aging_crediti_buckets', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_crediti_buckets;
GO
CREATE VIEW dbo.vw_aging_crediti_buckets
AS
SELECT
    CASE bucket
        WHEN 'NON_SCADUTO'     THEN 1
        WHEN 'SCADUTO_0_30'    THEN 2
        WHEN 'SCADUTO_31_60'   THEN 3
        WHEN 'SCADUTO_61_90'   THEN 4
        WHEN 'SCADUTO_OVER_90' THEN 5
    END AS id,                              -- pk virtuale ordinata
    bucket,
    CASE bucket
        WHEN 'NON_SCADUTO'     THEN 'Non scaduto'
        WHEN 'SCADUTO_0_30'    THEN '0-30 giorni'
        WHEN 'SCADUTO_31_60'   THEN '31-60 giorni'
        WHEN 'SCADUTO_61_90'   THEN '61-90 giorni'
        WHEN 'SCADUTO_OVER_90' THEN '> 90 giorni'
    END AS bucket_label,
    COUNT(*)                            AS num_scadenze,
    COUNT(DISTINCT cliente_id)          AS num_clienti,
    SUM(importo_residuo)                AS totale_residuo,
    MIN(giorni_scaduti)                 AS giorni_min,
    MAX(giorni_scaduti)                 AS giorni_max
FROM dbo.vw_aging_crediti_base
GROUP BY bucket;
GO
PRINT 'vw_aging_crediti_buckets creata.';
GO

-- ===== PER-CLIENTE DETAIL (N rows) =====
IF OBJECT_ID('dbo.vw_aging_crediti_clienti', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_crediti_clienti;
GO
CREATE VIEW dbo.vw_aging_crediti_clienti
AS
SELECT
    c.id              AS cliente_id,
    c.codice          AS cliente_codice,
    c.ragione_sociale AS cliente_ragione,
    SUM(CASE WHEN b.bucket = 'NON_SCADUTO'     THEN b.importo_residuo ELSE 0 END) AS non_scaduto,
    SUM(CASE WHEN b.bucket = 'SCADUTO_0_30'    THEN b.importo_residuo ELSE 0 END) AS scaduto_0_30,
    SUM(CASE WHEN b.bucket = 'SCADUTO_31_60'   THEN b.importo_residuo ELSE 0 END) AS scaduto_31_60,
    SUM(CASE WHEN b.bucket = 'SCADUTO_61_90'   THEN b.importo_residuo ELSE 0 END) AS scaduto_61_90,
    SUM(CASE WHEN b.bucket = 'SCADUTO_OVER_90' THEN b.importo_residuo ELSE 0 END) AS scaduto_over_90,
    SUM(b.importo_residuo) AS totale_esposizione,
    COUNT(*) AS num_scadenze
FROM dbo.vw_aging_crediti_base b
JOIN dbo.clienti c ON c.id = b.cliente_id
GROUP BY c.id, c.codice, c.ragione_sociale;
GO
PRINT 'vw_aging_crediti_clienti creata.';
GO

-- Verifica counts
SELECT 'totali' AS v, COUNT(*) AS n FROM dbo.vw_aging_crediti_totali
UNION ALL SELECT 'buckets',  COUNT(*) FROM dbo.vw_aging_crediti_buckets
UNION ALL SELECT 'clienti',  COUNT(*) FROM dbo.vw_aging_crediti_clienti;
GO
