-- ====================================================================
-- 30_vw_aging_debiti_set.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #20 (refactor framework-first): 3 viste a supporto della dashboard
-- aging debiti fornitori. Specchio di vw_aging_crediti_*.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.vw_aging_debiti_base', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_debiti_base;
GO
CREATE VIEW dbo.vw_aging_debiti_base
AS
SELECT
    s.id AS scadenza_id,
    s.fornitore_id,
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
  AND s.tipo = 'PAGAMENTO'
  AND s.stato IN ('APERTA', 'PARZIALE')
  AND (s.importo - s.importo_pagato) > 0
  AND s.fornitore_id IS NOT NULL;
GO

IF OBJECT_ID('dbo.vw_aging_debiti_totali', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_debiti_totali;
GO
CREATE VIEW dbo.vw_aging_debiti_totali
AS
SELECT
    1 AS id,
    SUM(importo_residuo) AS totale_esposizione,
    SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) AS totale_scaduto,
    COUNT(*) AS num_scadenze_totali,
    COUNT(DISTINCT fornitore_id) AS num_fornitori_totali,
    CASE
        WHEN SUM(importo_residuo) > 0 THEN
            CAST(ROUND(SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) * 100.0, 2) AS DECIMAL(5,2))
        ELSE 0.00
    END AS perc_scaduto_su_totale,
    CASE
        WHEN SUM(importo_residuo) = 0 THEN 'BASSO'
        WHEN SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) <= 0.10 THEN 'BASSO'
        WHEN SUM(CASE WHEN bucket <> 'NON_SCADUTO' THEN importo_residuo ELSE 0 END) / SUM(importo_residuo) <= 0.30 THEN 'MEDIO'
        ELSE 'ALTO'
    END AS rischio
FROM dbo.vw_aging_debiti_base;
GO

IF OBJECT_ID('dbo.vw_aging_debiti_buckets', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_debiti_buckets;
GO
CREATE VIEW dbo.vw_aging_debiti_buckets
AS
SELECT
    CASE bucket
        WHEN 'NON_SCADUTO' THEN 1 WHEN 'SCADUTO_0_30' THEN 2
        WHEN 'SCADUTO_31_60' THEN 3 WHEN 'SCADUTO_61_90' THEN 4
        WHEN 'SCADUTO_OVER_90' THEN 5
    END AS id,
    bucket,
    CASE bucket
        WHEN 'NON_SCADUTO' THEN 'Non scaduto' WHEN 'SCADUTO_0_30' THEN '0-30 giorni'
        WHEN 'SCADUTO_31_60' THEN '31-60 giorni' WHEN 'SCADUTO_61_90' THEN '61-90 giorni'
        WHEN 'SCADUTO_OVER_90' THEN '> 90 giorni'
    END AS bucket_label,
    COUNT(*) AS num_scadenze,
    COUNT(DISTINCT fornitore_id) AS num_fornitori,
    SUM(importo_residuo) AS totale_residuo,
    MIN(giorni_scaduti) AS giorni_min,
    MAX(giorni_scaduti) AS giorni_max
FROM dbo.vw_aging_debiti_base
GROUP BY bucket;
GO

IF OBJECT_ID('dbo.vw_aging_debiti_fornitori', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_debiti_fornitori;
GO
CREATE VIEW dbo.vw_aging_debiti_fornitori
AS
SELECT
    f.id              AS fornitore_id,
    f.codice          AS fornitore_codice,
    f.ragione_sociale AS fornitore_ragione,
    SUM(CASE WHEN b.bucket = 'NON_SCADUTO'     THEN b.importo_residuo ELSE 0 END) AS non_scaduto,
    SUM(CASE WHEN b.bucket = 'SCADUTO_0_30'    THEN b.importo_residuo ELSE 0 END) AS scaduto_0_30,
    SUM(CASE WHEN b.bucket = 'SCADUTO_31_60'   THEN b.importo_residuo ELSE 0 END) AS scaduto_31_60,
    SUM(CASE WHEN b.bucket = 'SCADUTO_61_90'   THEN b.importo_residuo ELSE 0 END) AS scaduto_61_90,
    SUM(CASE WHEN b.bucket = 'SCADUTO_OVER_90' THEN b.importo_residuo ELSE 0 END) AS scaduto_over_90,
    SUM(b.importo_residuo) AS totale_esposizione,
    COUNT(*) AS num_scadenze
FROM dbo.vw_aging_debiti_base b
JOIN dbo.fornitori f ON f.id = b.fornitore_id AND ISNULL(f.cancellato, 0) = 0
GROUP BY f.id, f.codice, f.ragione_sociale;
GO

PRINT 'vw_aging_debiti_* create.';
GO

SELECT 'totali' AS v, COUNT(*) AS n FROM dbo.vw_aging_debiti_totali
UNION ALL SELECT 'buckets', COUNT(*) FROM dbo.vw_aging_debiti_buckets
UNION ALL SELECT 'fornitori', COUNT(*) FROM dbo.vw_aging_debiti_fornitori;
GO
