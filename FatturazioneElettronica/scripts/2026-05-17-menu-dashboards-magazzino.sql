-- =====================================================================
-- 2026-05-17-menu-dashboards-magazzino.sql (DB Metadati)
-- Aggiunge 3 voci dashboard sotto il gruppo grp_magazzino (mm_id=6088).
-- =====================================================================
SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;
GO

DECLARE @parentId INT = (SELECT TOP 1 mm_id FROM dbo._metadati__menu WHERE mm_nome_menu = 'grp_magazzino');
IF @parentId IS NULL
BEGIN
    RAISERROR('grp_magazzino non trovato — pre-requisito non soddisfatto', 16, 1);
    RETURN;
END

DECLARE @anagrParent INT = (SELECT TOP 1 mm_parent_id FROM dbo._metadati__menu WHERE mm_nome_menu = 'prodotto_varianti');

-- Dashboard 1: magazzino_kpi
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'magazzino_kpi_dashboard')
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_uri_menu, mm_display_string_menu, mmordine, mm_icon, mm_parent_id, mm_is_visible_by_default, mm_tooltip_menu)
    VALUES ((SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu), 'magazzino_kpi_dashboard', '#/magazzino_kpi/dashboard', 'menu.invoice.warehouse_kpi', 5, 'pi pi-chart-bar', @parentId, 1, 'menu.invoice.warehouse_kpi_tooltip');

-- Dashboard 2: magazzino_storico
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'magazzino_storico_dashboard')
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_uri_menu, mm_display_string_menu, mmordine, mm_icon, mm_parent_id, mm_is_visible_by_default, mm_tooltip_menu)
    VALUES ((SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu), 'magazzino_storico_dashboard', '#/magazzino_storico/dashboard', 'menu.invoice.warehouse_history', 35, 'pi pi-chart-line', @parentId, 1, 'menu.invoice.warehouse_history_tooltip');

-- Dashboard 3: varianti_kpi (sotto Anagrafiche)
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'varianti_kpi_dashboard')
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_uri_menu, mm_display_string_menu, mmordine, mm_icon, mm_parent_id, mm_is_visible_by_default, mm_tooltip_menu)
    VALUES ((SELECT ISNULL(MAX(mm_id),0)+1 FROM dbo._metadati__menu), 'varianti_kpi_dashboard', '#/varianti_kpi/dashboard', 'menu.invoice.variants_kpi', 95, 'pi pi-th-large', @anagrParent, 1, 'menu.invoice.variants_kpi_tooltip');

PRINT 'Menu entries dashboard aggiunte.';
GO

-- =====================================================================
-- Traduzioni 5 lingue × 6 chiavi = 30 righe
-- =====================================================================
DECLARE @keys TABLE (k VARCHAR(200));
INSERT INTO @keys VALUES
    ('menu.invoice.warehouse_kpi'),         ('menu.invoice.warehouse_kpi_tooltip'),
    ('menu.invoice.warehouse_history'),     ('menu.invoice.warehouse_history_tooltip'),
    ('menu.invoice.variants_kpi'),          ('menu.invoice.variants_kpi_tooltip');

DECLARE @trans TABLE (lang VARCHAR(10), k VARCHAR(200), v NVARCHAR(500));
INSERT INTO @trans VALUES
-- Italian
('it-IT','menu.invoice.warehouse_kpi','Dashboard Magazzino'),
('it-IT','menu.invoice.warehouse_kpi_tooltip','Panoramica KPI magazzino: valore stock, sotto-scorta, movimenti settimana'),
('it-IT','menu.invoice.warehouse_history','Dashboard Storico'),
('it-IT','menu.invoice.warehouse_history_tooltip','Andamento giornaliero carichi/scarichi ultimi 30 giorni'),
('it-IT','menu.invoice.variants_kpi','Dashboard Varianti'),
('it-IT','menu.invoice.variants_kpi_tooltip','Catalogo varianti: distribuzione per attributo e ranking per stock'),
-- English
('en-US','menu.invoice.warehouse_kpi','Warehouse Dashboard'),
('en-US','menu.invoice.warehouse_kpi_tooltip','Warehouse KPI overview: stock value, low-stock alerts, weekly movements'),
('en-US','menu.invoice.warehouse_history','History Dashboard'),
('en-US','menu.invoice.warehouse_history_tooltip','Daily inflow/outflow trend for the last 30 days'),
('en-US','menu.invoice.variants_kpi','Variants Dashboard'),
('en-US','menu.invoice.variants_kpi_tooltip','Variants catalog: per-attribute distribution and stock ranking'),
-- French
('fr-FR','menu.invoice.warehouse_kpi','Tableau de bord Stock'),
('fr-FR','menu.invoice.warehouse_kpi_tooltip','Aperçu KPI entrepôt: valeur du stock, alertes, mouvements de la semaine'),
('fr-FR','menu.invoice.warehouse_history','Tableau de bord Historique'),
('fr-FR','menu.invoice.warehouse_history_tooltip','Tendance journalière entrées/sorties des 30 derniers jours'),
('fr-FR','menu.invoice.variants_kpi','Tableau de bord Variantes'),
('fr-FR','menu.invoice.variants_kpi_tooltip','Catalogue des variantes : distribution par attribut et classement par stock'),
-- Spanish
('es-ES','menu.invoice.warehouse_kpi','Panel Almacén'),
('es-ES','menu.invoice.warehouse_kpi_tooltip','Resumen KPI de almacén: valor de stock, alertas, movimientos semanales'),
('es-ES','menu.invoice.warehouse_history','Panel Histórico'),
('es-ES','menu.invoice.warehouse_history_tooltip','Tendencia diaria entradas/salidas últimos 30 días'),
('es-ES','menu.invoice.variants_kpi','Panel Variantes'),
('es-ES','menu.invoice.variants_kpi_tooltip','Catálogo de variantes: distribución por atributo y ranking por stock'),
-- German
('de-DE','menu.invoice.warehouse_kpi','Lager Dashboard'),
('de-DE','menu.invoice.warehouse_kpi_tooltip','Lager KPI Übersicht: Bestandswert, Niedrigbestand, Wochenbewegungen'),
('de-DE','menu.invoice.warehouse_history','Verlauf Dashboard'),
('de-DE','menu.invoice.warehouse_history_tooltip','Tägliche Eingang/Ausgang Trend der letzten 30 Tage'),
('de-DE','menu.invoice.variants_kpi','Varianten Dashboard'),
('de-DE','menu.invoice.variants_kpi_tooltip','Variantenkatalog: Verteilung nach Attribut und Bestandsranking');

-- Upsert (schema reale: id IDENTITY, language, resource, translation)
MERGE dbo._wuic_translations AS tgt
USING (SELECT lang, k, v FROM @trans) AS src
ON tgt.language = src.lang AND tgt.resource = src.k
WHEN MATCHED THEN UPDATE SET translation = src.v
WHEN NOT MATCHED THEN INSERT (language, resource, translation) VALUES (src.lang, src.k, src.v);

PRINT 'Traduzioni 5 lingue × 6 chiavi inserite/aggiornate.';
GO
