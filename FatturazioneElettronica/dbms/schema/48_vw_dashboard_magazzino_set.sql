-- ====================================================================
-- 48_vw_dashboard_magazzino_set.sql (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Viste a supporto delle 3 dashboard introdotte coi moduli Varianti + Magazzino:
--
-- DASHBOARD `magazzino_kpi`:
--   - vw_mag_kpi_totali   : 1 riga (4 KPI: valore_stock, sotto_scorta_n,
--                                   movimenti_settimana, magazzini_attivi_n)
--   - vw_mag_kpi_dettaglio: top 30 prodotti sotto-scorta per stacked bar + tabella
--
-- DASHBOARD `varianti_kpi`:
--   - vw_var_kpi_totali     : 1 riga (3 KPI: varianti_attive, prodotti_con_varianti,
--                                       attributi_configurati)
--   - vw_var_kpi_per_attr   : N righe (top attributi per numero di varianti — bar chart)
--   - vw_var_kpi_ranking    : top 20 varianti per stock + fatturato (tabella ranking)
--
-- DASHBOARD `magazzino_storico`:
--   - vw_mag_storico_totali : 1 riga (2 KPI: carichi_mese, scarichi_mese)
--   - vw_mag_storico_giorn  : 30 giorni con carichi/scarichi (line chart time-series)
--   - vw_mag_storico_recenti: ultimi 20 movimenti (tabella dettaglio)
--
-- Tutte le viste usano GETDATE() come ancora temporale (no-params), scaffoldabili
-- come datasource framework senza wrapper SP.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- =====================================================================
-- DASHBOARD `magazzino_kpi`
-- =====================================================================

IF OBJECT_ID('dbo.vw_mag_kpi_totali','V') IS NOT NULL DROP VIEW dbo.vw_mag_kpi_totali;
GO
CREATE VIEW dbo.vw_mag_kpi_totali
AS
SELECT
    1 AS id,
    ISNULL(SUM(g.quantita_disponibile * ISNULL(g.costo_medio, 0)), 0) AS valore_stock_totale,
    (SELECT COUNT(*) FROM dbo.magazzino_giacenze g2
        WHERE ISNULL(g2.cancellato,0)=0
          AND g2.livello_riordino IS NOT NULL
          AND (g2.quantita_disponibile - ISNULL(g2.quantita_riservata,0)) <= g2.livello_riordino) AS prodotti_sotto_scorta,
    (SELECT COUNT(*) FROM dbo.magazzino_movimenti m
        WHERE m.data_movimento >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))) AS movimenti_settimana,
    (SELECT COUNT(*) FROM dbo.magazzini mz WHERE ISNULL(mz.cancellato,0)=0 AND ISNULL(mz.attivo,1)=1) AS magazzini_attivi,
    CASE
        WHEN (SELECT COUNT(*) FROM dbo.magazzino_giacenze g2
                WHERE ISNULL(g2.cancellato,0)=0
                  AND g2.livello_riordino IS NOT NULL
                  AND (g2.quantita_disponibile - ISNULL(g2.quantita_riservata,0)) <= g2.livello_riordino) = 0 THEN 'OK'
        WHEN (SELECT COUNT(*) FROM dbo.magazzino_giacenze g2
                WHERE ISNULL(g2.cancellato,0)=0
                  AND g2.livello_riordino IS NOT NULL
                  AND (g2.quantita_disponibile - ISNULL(g2.quantita_riservata,0)) <= g2.livello_riordino) <= 5 THEN 'ATTENZIONE'
        ELSE 'CRITICO'
    END AS stato_scorta
FROM dbo.magazzino_giacenze g
WHERE ISNULL(g.cancellato,0)=0;
GO
PRINT 'vw_mag_kpi_totali creata.';
GO

IF OBJECT_ID('dbo.vw_mag_kpi_dettaglio','V') IS NOT NULL DROP VIEW dbo.vw_mag_kpi_dettaglio;
GO
CREATE VIEW dbo.vw_mag_kpi_dettaglio
AS
SELECT TOP 30
    g.id,
    p.codice AS prodotto_codice,
    p.descrizione AS prodotto_descrizione,
    mz.codice AS magazzino_codice,
    ISNULL(g.quantita_disponibile, 0) AS quantita_disponibile,
    ISNULL(g.quantita_riservata, 0) AS quantita_riservata,
    ISNULL(g.quantita_disponibile, 0) - ISNULL(g.quantita_riservata, 0) AS quantita_libera,
    ISNULL(g.livello_riordino, 0) AS livello_riordino,
    ISNULL(g.costo_medio, 0) AS costo_medio,
    ISNULL(g.quantita_disponibile * g.costo_medio, 0) AS valore_giacenza
FROM dbo.magazzino_giacenze g
INNER JOIN dbo.prodotti p ON p.id = g.prodotto_id AND ISNULL(p.cancellato,0)=0
INNER JOIN dbo.magazzini mz ON mz.id = g.magazzino_id AND ISNULL(mz.cancellato,0)=0
WHERE ISNULL(g.cancellato,0)=0
ORDER BY (ISNULL(g.quantita_disponibile,0) - ISNULL(g.quantita_riservata,0)) ASC;
GO
PRINT 'vw_mag_kpi_dettaglio creata.';
GO

-- =====================================================================
-- DASHBOARD `varianti_kpi`
-- =====================================================================

IF OBJECT_ID('dbo.vw_var_kpi_totali','V') IS NOT NULL DROP VIEW dbo.vw_var_kpi_totali;
GO
CREATE VIEW dbo.vw_var_kpi_totali
AS
SELECT
    1 AS id,
    (SELECT COUNT(*) FROM dbo.prodotto_varianti pv WHERE ISNULL(pv.cancellato,0)=0 AND ISNULL(pv.attivo,1)=1) AS varianti_attive,
    (SELECT COUNT(*) FROM dbo.prodotti p WHERE ISNULL(p.cancellato,0)=0 AND p.has_varianti = 1) AS prodotti_con_varianti,
    (SELECT COUNT(*) FROM dbo.prodotto_attributi pa WHERE ISNULL(pa.cancellato,0)=0 AND ISNULL(pa.attivo,1)=1) AS attributi_configurati,
    (SELECT COUNT(*) FROM dbo.prodotto_attributi_valori pav WHERE ISNULL(pav.cancellato,0)=0 AND ISNULL(pav.attivo,1)=1) AS valori_configurati;
GO
PRINT 'vw_var_kpi_totali creata.';
GO

IF OBJECT_ID('dbo.vw_var_kpi_per_attr','V') IS NOT NULL DROP VIEW dbo.vw_var_kpi_per_attr;
GO
CREATE VIEW dbo.vw_var_kpi_per_attr
AS
SELECT
    pa.id AS id,
    pa.codice AS attributo_codice,
    pa.descrizione AS attributo_descrizione,
    COUNT(DISTINCT pva.variante_id) AS num_varianti,
    COUNT(DISTINCT pav.id) AS num_valori
FROM dbo.prodotto_attributi pa
LEFT JOIN dbo.prodotto_attributi_valori pav ON pav.attributo_id = pa.id AND ISNULL(pav.cancellato,0)=0
LEFT JOIN dbo.prodotto_varianti_attributi pva ON pva.attributo_id = pa.id
WHERE ISNULL(pa.cancellato,0)=0
GROUP BY pa.id, pa.codice, pa.descrizione;
GO
PRINT 'vw_var_kpi_per_attr creata.';
GO

IF OBJECT_ID('dbo.vw_var_kpi_ranking','V') IS NOT NULL DROP VIEW dbo.vw_var_kpi_ranking;
GO
CREATE VIEW dbo.vw_var_kpi_ranking
AS
SELECT TOP 20
    pv.id,
    pv.sku,
    p.codice AS prodotto_codice,
    p.descrizione AS prodotto_descrizione,
    pv.descrizione_estesa AS variante_descrizione,
    ISNULL(pv.prezzo_vendita_override, p.prezzo_vendita) AS prezzo_vendita,
    ISNULL((SELECT SUM(g.quantita_disponibile)
            FROM dbo.magazzino_giacenze g
            WHERE g.variante_id = pv.id AND ISNULL(g.cancellato,0)=0), 0) AS stock_totale,
    ISNULL((SELECT SUM(g.quantita_disponibile * ISNULL(g.costo_medio,0))
            FROM dbo.magazzino_giacenze g
            WHERE g.variante_id = pv.id AND ISNULL(g.cancellato,0)=0), 0) AS valore_stock
FROM dbo.prodotto_varianti pv
INNER JOIN dbo.prodotti p ON p.id = pv.prodotto_id AND ISNULL(p.cancellato,0)=0
WHERE ISNULL(pv.cancellato,0)=0 AND ISNULL(pv.attivo,1)=1
ORDER BY (ISNULL((SELECT SUM(g.quantita_disponibile * ISNULL(g.costo_medio,0))
                  FROM dbo.magazzino_giacenze g
                  WHERE g.variante_id = pv.id AND ISNULL(g.cancellato,0)=0), 0)) DESC;
GO
PRINT 'vw_var_kpi_ranking creata.';
GO

-- =====================================================================
-- DASHBOARD `magazzino_storico`
-- =====================================================================

IF OBJECT_ID('dbo.vw_mag_storico_totali','V') IS NOT NULL DROP VIEW dbo.vw_mag_storico_totali;
GO
CREATE VIEW dbo.vw_mag_storico_totali
AS
SELECT
    1 AS id,
    ISNULL(SUM(CASE WHEN m.tipo_movimento IN ('CARICO','TRASFERIMENTO_IN','RILASCIO_RISERVA') THEN m.quantita ELSE 0 END), 0) AS carichi_mese,
    ISNULL(SUM(CASE WHEN m.tipo_movimento IN ('SCARICO','TRASFERIMENTO_OUT','RISERVA') THEN ABS(m.quantita) ELSE 0 END), 0) AS scarichi_mese,
    COUNT(CASE WHEN m.tipo_movimento = 'RETTIFICA' THEN 1 END) AS rettifiche_mese,
    COUNT(*) AS movimenti_totali_mese,
    ISNULL(SUM(CASE WHEN m.tipo_movimento IN ('CARICO','TRASFERIMENTO_IN') THEN m.valore_movimento ELSE 0 END), 0) AS valore_carichi_mese
FROM dbo.magazzino_movimenti m
WHERE m.data_movimento >= DATEADD(DAY, -30, CAST(GETDATE() AS DATE));
GO
PRINT 'vw_mag_storico_totali creata.';
GO

IF OBJECT_ID('dbo.vw_mag_storico_giorn','V') IS NOT NULL DROP VIEW dbo.vw_mag_storico_giorn;
GO
CREATE VIEW dbo.vw_mag_storico_giorn
AS
WITH days AS (
    SELECT CAST(DATEADD(DAY, -n, CAST(GETDATE() AS DATE)) AS DATE) AS giorno
    FROM (SELECT TOP 30 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n
          FROM sys.all_columns) x
)
SELECT
    CAST(DATEDIFF(DAY, '20000101', d.giorno) AS INT) AS id,
    d.giorno,
    FORMAT(d.giorno, 'dd/MM') AS etichetta,
    ISNULL(SUM(CASE WHEN m.tipo_movimento IN ('CARICO','TRASFERIMENTO_IN','RILASCIO_RISERVA') THEN m.quantita ELSE 0 END), 0) AS carichi,
    ISNULL(SUM(CASE WHEN m.tipo_movimento IN ('SCARICO','TRASFERIMENTO_OUT','RISERVA') THEN ABS(m.quantita) ELSE 0 END), 0) AS scarichi,
    ISNULL(SUM(CASE WHEN m.tipo_movimento = 'RETTIFICA' THEN ABS(m.quantita) ELSE 0 END), 0) AS rettifiche
FROM days d
LEFT JOIN dbo.magazzino_movimenti m ON CAST(m.data_movimento AS DATE) = d.giorno
GROUP BY d.giorno;
GO
PRINT 'vw_mag_storico_giorn creata.';
GO

IF OBJECT_ID('dbo.vw_mag_storico_recenti','V') IS NOT NULL DROP VIEW dbo.vw_mag_storico_recenti;
GO
CREATE VIEW dbo.vw_mag_storico_recenti
AS
SELECT TOP 20
    m.id,
    m.data_movimento,
    m.tipo_movimento,
    mz.codice AS magazzino_codice,
    p.codice AS prodotto_codice,
    p.descrizione AS prodotto_descrizione,
    m.quantita,
    ISNULL(m.prezzo_unitario, 0) AS prezzo_unitario,
    ISNULL(m.valore_movimento, 0) AS valore_movimento,
    m.causale
FROM dbo.magazzino_movimenti m
INNER JOIN dbo.prodotti p ON p.id = m.prodotto_id AND ISNULL(p.cancellato,0)=0
INNER JOIN dbo.magazzini mz ON mz.id = m.magazzino_id AND ISNULL(mz.cancellato,0)=0
ORDER BY m.data_movimento DESC, m.id DESC;
GO
PRINT 'vw_mag_storico_recenti creata.';
GO

PRINT '====================================================================';
PRINT 'TUTTE LE VISTE DASHBOARD (magazzino_kpi, varianti_kpi, magazzino_storico) CREATE.';
PRINT '====================================================================';
GO
