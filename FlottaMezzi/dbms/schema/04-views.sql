-- ============================================================================
-- FlottaMezzi DB Dati - VIEW aggregate per dashboard
-- DB: FlottaMezzi_Data
-- Idempotente.
-- Tutte le viste filtrano cancellato=0 sulle tabelle audited (skill rule).
-- ============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ----------------------------------------------------------------------------
-- vw_dash_mezzi_per_stato (HOME bar chart)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_dash_mezzi_per_stato', 'V') IS NOT NULL DROP VIEW dbo.vw_dash_mezzi_per_stato;
GO
CREATE VIEW dbo.vw_dash_mezzi_per_stato AS
SELECT
    ROW_NUMBER() OVER (ORDER BY s.id) AS id,
    ISNULL(s.descrizione, N'(nessuno)') AS stato,
    COUNT(m.id) AS num_mezzi
FROM dbo.stato_mezzo s
LEFT JOIN dbo.mezzi m ON m.stato_mezzo_id = s.id AND ISNULL(m.cancellato, 0) = 0
WHERE ISNULL(s.cancellato, 0) = 0
GROUP BY s.id, s.descrizione;
GO

-- ----------------------------------------------------------------------------
-- vw_dash_scadenze_imminenti (HOME pie chart)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_dash_scadenze_imminenti', 'V') IS NOT NULL DROP VIEW dbo.vw_dash_scadenze_imminenti;
GO
CREATE VIEW dbo.vw_dash_scadenze_imminenti AS
SELECT
    ROW_NUMBER() OVER (ORDER BY tipo) AS id,
    tipo,
    COUNT(*) AS num_scadenze
FROM (
    SELECT N'Patente' AS tipo
    FROM dbo.conducenti
    WHERE ISNULL(cancellato, 0) = 0
      AND scadenza_patente IS NOT NULL
      AND scadenza_patente >= CAST(GETDATE() AS DATE)
      AND scadenza_patente <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
    UNION ALL
    SELECT N'Assicurazione'
    FROM dbo.contratti_assicurativi
    WHERE ISNULL(cancellato, 0) = 0
      AND data_scadenza IS NOT NULL
      AND data_scadenza >= CAST(GETDATE() AS DATE)
      AND data_scadenza <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
    UNION ALL
    SELECT N'Revisione'
    FROM dbo.revisioni
    WHERE ISNULL(cancellato, 0) = 0
      AND scadenza_prossima IS NOT NULL
      AND scadenza_prossima >= CAST(GETDATE() AS DATE)
      AND scadenza_prossima <= DATEADD(day, 30, CAST(GETDATE() AS DATE))
) t
GROUP BY tipo;
GO

-- ----------------------------------------------------------------------------
-- vw_aging_scadenze (AGING dashboard) — fasce temporali patenti+assicurazioni+revisioni
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_aging_scadenze', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_scadenze;
GO
CREATE VIEW dbo.vw_aging_scadenze AS
WITH scadenze AS (
    SELECT N'Patente' AS tipo, c.id AS entita_id,
           c.cognome + N' ' + c.nome AS entita_label,
           c.scadenza_patente AS data_scadenza,
           NULL AS importo
    FROM dbo.conducenti c
    WHERE ISNULL(c.cancellato, 0) = 0 AND c.scadenza_patente IS NOT NULL
    UNION ALL
    SELECT N'Assicurazione', a.id,
           m.targa,
           a.data_scadenza, a.costo_annuo
    FROM dbo.contratti_assicurativi a
    JOIN dbo.mezzi m ON m.id = a.mezzo_id AND ISNULL(m.cancellato, 0) = 0
    WHERE ISNULL(a.cancellato, 0) = 0 AND a.data_scadenza IS NOT NULL
    UNION ALL
    SELECT N'Revisione', r.id,
           m.targa,
           r.scadenza_prossima, r.costo
    FROM dbo.revisioni r
    JOIN dbo.mezzi m ON m.id = r.mezzo_id AND ISNULL(m.cancellato, 0) = 0
    WHERE ISNULL(r.cancellato, 0) = 0 AND r.scadenza_prossima IS NOT NULL
)
SELECT
    ROW_NUMBER() OVER (ORDER BY tipo, data_scadenza) AS id,
    tipo, entita_id, entita_label, data_scadenza, importo,
    DATEDIFF(day, CAST(GETDATE() AS DATE), data_scadenza) AS giorni_a_scadenza,
    CASE
        WHEN data_scadenza < CAST(GETDATE() AS DATE) THEN N'SCADUTO'
        WHEN data_scadenza <= DATEADD(day, 30, CAST(GETDATE() AS DATE)) THEN N'0-30'
        WHEN data_scadenza <= DATEADD(day, 90, CAST(GETDATE() AS DATE)) THEN N'30-90'
        WHEN data_scadenza <= DATEADD(day, 180, CAST(GETDATE() AS DATE)) THEN N'90-180'
        ELSE N'>180'
    END AS fascia
FROM scadenze;
GO

-- ----------------------------------------------------------------------------
-- vw_aging_scadenze_per_fascia (KPI per dashboard aging)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_aging_scadenze_per_fascia', 'V') IS NOT NULL DROP VIEW dbo.vw_aging_scadenze_per_fascia;
GO
CREATE VIEW dbo.vw_aging_scadenze_per_fascia AS
SELECT
    ROW_NUMBER() OVER (ORDER BY fascia, tipo) AS id,
    fascia, tipo,
    COUNT(*) AS num_scadenze,
    SUM(ISNULL(importo, 0)) AS totale_importo
FROM dbo.vw_aging_scadenze
GROUP BY fascia, tipo;
GO

-- ----------------------------------------------------------------------------
-- vw_costi_storici_mensili (COSTI FORECAST line chart - storico)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_costi_storici_mensili', 'V') IS NOT NULL DROP VIEW dbo.vw_costi_storici_mensili;
GO
CREATE VIEW dbo.vw_costi_storici_mensili AS
WITH costi_uniti AS (
    SELECT data, costo AS importo, N'Manutenzione' AS categoria FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0 AND costo IS NOT NULL
    UNION ALL
    SELECT CAST(data AS DATE), costo_totale, N'Carburante' FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0 AND costo_totale IS NOT NULL
    UNION ALL
    SELECT CAST(data AS DATE), costo_stimato, N'Sinistro' FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0 AND costo_stimato IS NOT NULL
)
SELECT
    ROW_NUMBER() OVER (ORDER BY YEAR(data), MONTH(data), categoria) AS id,
    YEAR(data) AS anno,
    MONTH(data) AS mese,
    DATEFROMPARTS(YEAR(data), MONTH(data), 1) AS periodo,
    categoria,
    SUM(importo) AS totale
FROM costi_uniti
WHERE data >= DATEADD(month, -18, CAST(GETDATE() AS DATE))
GROUP BY YEAR(data), MONTH(data), categoria;
GO

-- ----------------------------------------------------------------------------
-- vw_costi_forecast (COSTI FORECAST - proiezione lineare 90gg basata su media 12 mesi)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_costi_forecast', 'V') IS NOT NULL DROP VIEW dbo.vw_costi_forecast;
GO
CREATE VIEW dbo.vw_costi_forecast AS
WITH avg_mese AS (
    SELECT AVG(totale_mese) AS media_mensile
    FROM (
        SELECT YEAR(data) AS y, MONTH(data) AS m, SUM(importo) AS totale_mese
        FROM (
            SELECT data, costo AS importo FROM dbo.manutenzioni WHERE ISNULL(cancellato,0)=0 AND costo IS NOT NULL
            UNION ALL
            SELECT CAST(data AS DATE), costo_totale FROM dbo.rifornimenti WHERE ISNULL(cancellato,0)=0 AND costo_totale IS NOT NULL
            UNION ALL
            SELECT CAST(data AS DATE), costo_stimato FROM dbo.sinistri WHERE ISNULL(cancellato,0)=0 AND costo_stimato IS NOT NULL
        ) u
        WHERE data >= DATEADD(month, -12, CAST(GETDATE() AS DATE))
        GROUP BY YEAR(data), MONTH(data)
    ) t
)
SELECT
    ROW_NUMBER() OVER (ORDER BY mese_off) AS id,
    DATEADD(month, mese_off, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) AS periodo,
    ISNULL((SELECT media_mensile FROM avg_mese), 0) AS totale_proiettato
FROM (VALUES (1),(2),(3)) v(mese_off);
GO

-- ----------------------------------------------------------------------------
-- vw_top_mezzi_per_costo (TOP MEZZI bar chart - costi ultimi 12 mesi)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_top_mezzi_per_costo', 'V') IS NOT NULL DROP VIEW dbo.vw_top_mezzi_per_costo;
GO
CREATE VIEW dbo.vw_top_mezzi_per_costo AS
WITH costi_per_mezzo AS (
    SELECT mezzo_id, SUM(importo) AS totale FROM (
        SELECT mezzo_id, costo AS importo FROM dbo.manutenzioni
         WHERE ISNULL(cancellato,0)=0 AND costo IS NOT NULL AND data >= DATEADD(month,-12,CAST(GETDATE() AS DATE))
        UNION ALL
        SELECT mezzo_id, costo_totale FROM dbo.rifornimenti
         WHERE ISNULL(cancellato,0)=0 AND costo_totale IS NOT NULL AND data >= DATEADD(month,-12,CAST(GETDATE() AS DATE))
        UNION ALL
        SELECT mezzo_id, costo_stimato FROM dbo.sinistri
         WHERE ISNULL(cancellato,0)=0 AND costo_stimato IS NOT NULL AND data >= DATEADD(month,-12,CAST(GETDATE() AS DATE))
    ) u
    GROUP BY mezzo_id
)
SELECT TOP 10
    ROW_NUMBER() OVER (ORDER BY c.totale DESC) AS id,
    m.id AS mezzo_id,
    m.targa,
    m.marca + N' ' + m.modello AS modello_full,
    c.totale AS totale_costi
FROM costi_per_mezzo c
JOIN dbo.mezzi m ON m.id = c.mezzo_id AND ISNULL(m.cancellato,0)=0
ORDER BY c.totale DESC;
GO

-- ----------------------------------------------------------------------------
-- vw_top_mezzi_per_km (TOP MEZZI bar chart - km percorsi)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_top_mezzi_per_km', 'V') IS NOT NULL DROP VIEW dbo.vw_top_mezzi_per_km;
GO
CREATE VIEW dbo.vw_top_mezzi_per_km AS
WITH km_delta AS (
    SELECT r.mezzo_id,
           MAX(r.km_veicolo) - MIN(r.km_veicolo) AS km_percorsi
    FROM dbo.rifornimenti r
    WHERE ISNULL(r.cancellato,0)=0
      AND r.km_veicolo IS NOT NULL
      AND r.data >= DATEADD(month,-12,CAST(GETDATE() AS DATE))
    GROUP BY r.mezzo_id
)
SELECT TOP 10
    ROW_NUMBER() OVER (ORDER BY k.km_percorsi DESC) AS id,
    m.id AS mezzo_id,
    m.targa,
    m.marca + N' ' + m.modello AS modello_full,
    k.km_percorsi
FROM km_delta k
JOIN dbo.mezzi m ON m.id = k.mezzo_id AND ISNULL(m.cancellato,0)=0
ORDER BY k.km_percorsi DESC;
GO

PRINT '[ok] 8 VIEW aggregate create';
GO
