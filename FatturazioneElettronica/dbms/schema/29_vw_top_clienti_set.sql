-- ====================================================================
-- 29_vw_top_clienti_set.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #18 (refactor framework-first): 2 viste a supporto della dashboard
-- top clienti per fatturato.
--
--   - vw_top_clienti_totali: 1 riga KPI (totale fatturato top10, n clienti, ecc)
--   - vw_top_clienti_anno:   N righe (top 10 clienti anno corrente) per chart
--                            bar horizontal + tabella
--
-- Anno fissato a YEAR(GETDATE()) (no params).
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- Top 10 clienti per fatturato anno corrente
IF OBJECT_ID('dbo.vw_top_clienti_anno', 'V') IS NOT NULL DROP VIEW dbo.vw_top_clienti_anno;
GO
CREATE VIEW dbo.vw_top_clienti_anno
AS
SELECT TOP 10
    c.id              AS cliente_id,
    c.codice          AS cliente_codice,
    c.ragione_sociale AS cliente_ragione,
    c.tipo_soggetto   AS cliente_tipo,
    COUNT(f.id)       AS num_fatture,
    SUM(f.imponibile) AS imponibile_totale,
    SUM(f.iva)        AS iva_totale,
    SUM(f.totale)     AS totale_fatturato,
    MIN(f.data_documento) AS prima_fattura,
    MAX(f.data_documento) AS ultima_fattura
FROM dbo.fatture_inviate f
JOIN dbo.clienti c ON c.id = f.cliente_id AND ISNULL(c.cancellato, 0) = 0
WHERE ISNULL(f.cancellato, 0) = 0
  AND YEAR(f.data_documento) = YEAR(GETDATE())
  AND f.stato IN ('EMESSA', 'CONSEGNATA')
GROUP BY c.id, c.codice, c.ragione_sociale, c.tipo_soggetto;
-- NB: SQL Server non permette ORDER BY in una VIEW senza TOP+output direzionato.
-- Il TOP 10 con WITH TIES + ORDER BY sotto richiede TOP esplicito.
GO

-- Versione corretta con TOP+ORDER (Drop&Recreate per garantire ordinamento)
IF OBJECT_ID('dbo.vw_top_clienti_anno', 'V') IS NOT NULL DROP VIEW dbo.vw_top_clienti_anno;
GO
CREATE VIEW dbo.vw_top_clienti_anno
AS
SELECT TOP 10
    c.id              AS cliente_id,
    c.codice          AS cliente_codice,
    c.ragione_sociale AS cliente_ragione,
    c.tipo_soggetto   AS cliente_tipo,
    COUNT(f.id)       AS num_fatture,
    SUM(f.imponibile) AS imponibile_totale,
    SUM(f.iva)        AS iva_totale,
    SUM(f.totale)     AS totale_fatturato,
    MIN(f.data_documento) AS prima_fattura,
    MAX(f.data_documento) AS ultima_fattura
FROM dbo.fatture_inviate f
JOIN dbo.clienti c ON c.id = f.cliente_id AND ISNULL(c.cancellato, 0) = 0
WHERE ISNULL(f.cancellato, 0) = 0
  AND YEAR(f.data_documento) = YEAR(GETDATE())
  AND f.stato IN ('EMESSA', 'CONSEGNATA')
GROUP BY c.id, c.codice, c.ragione_sociale, c.tipo_soggetto
ORDER BY SUM(f.totale) DESC;
GO

-- KPI single-row aggregato sui top clienti
IF OBJECT_ID('dbo.vw_top_clienti_totali', 'V') IS NOT NULL DROP VIEW dbo.vw_top_clienti_totali;
GO
CREATE VIEW dbo.vw_top_clienti_totali
AS
SELECT
    1 AS id,
    COUNT(*)                      AS n_clienti_top,
    SUM(totale_fatturato)         AS totale_fatturato_top,
    SUM(num_fatture)              AS num_fatture_totali,
    SUM(imponibile_totale)        AS imponibile_totale_top,
    SUM(iva_totale)               AS iva_totale_top,
    MAX(totale_fatturato)         AS top_1_fatturato,
    MAX(cliente_ragione)          AS top_1_cliente_placeholder, -- sostituito sotto via subquery
    (SELECT TOP 1 cliente_ragione FROM dbo.vw_top_clienti_anno ORDER BY totale_fatturato DESC) AS top_1_cliente
FROM dbo.vw_top_clienti_anno;
GO

PRINT 'vw_top_clienti_anno + vw_top_clienti_totali create.';
GO

SELECT 'totali' AS v, COUNT(*) AS n FROM dbo.vw_top_clienti_totali
UNION ALL SELECT 'anno', COUNT(*) FROM dbo.vw_top_clienti_anno;
GO
