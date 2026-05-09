-- 2026-05-09 — Aggiunge 4 voci dashboard analytics sotto "Finanze" (parent mm_id=6074).
-- Le board esistono in dom_board ma erano orfane (no menu entry):
--   aging_crediti      → #/aging_crediti/dashboard
--   aging_debiti       → #/aging_debiti/dashboard
--   cashflow_forecast  → #/cashflow_forecast/dashboard
--   top_clienti        → #/top_clienti/dashboard
--
-- Idempotenza: NOT EXISTS guard su mm_uri_menu per ogni voce.
-- Pattern: vedi 2026-05-08-listini-menu-entry.sql (reference canonico).
--
-- Post-patch: chiamare MetaService.invalidateMetadataRuntime via AsmxProxy
-- (regola 10 AGENTS) per propagare il refresh menu lato client.

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

DECLARE @parent_finanze INT = 6074;

-- 1) Aging crediti
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_uri_menu = '#/aging_crediti/dashboard')
BEGIN
    DECLARE @new_id_ac INT = (SELECT MAX(mm_id) + 1 FROM dbo._metadati__menu);
    DECLARE @ord_ac INT = ISNULL((SELECT MAX(mmordine) + 10 FROM dbo._metadati__menu WHERE mm_parent_id = @parent_finanze), 10);
    INSERT INTO dbo._metadati__menu
      (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
    VALUES
      (@new_id_ac, 'aging_crediti', 'Aging crediti', @parent_finanze, '#/aging_crediti/dashboard',
       'Distribuzione crediti per fascia eta + KPI rischio', 1, @ord_ac, 'Aging crediti', 'pi pi-chart-line');
    PRINT 'INSERT menu: Aging crediti (mm_id=' + CAST(@new_id_ac AS NVARCHAR(10)) + ')';
END
ELSE
    PRINT 'SKIP menu: Aging crediti (gia esistente)';
GO

-- 2) Aging debiti
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_uri_menu = '#/aging_debiti/dashboard')
BEGIN
    DECLARE @parent INT = 6074;
    DECLARE @new_id_ad INT = (SELECT MAX(mm_id) + 1 FROM dbo._metadati__menu);
    DECLARE @ord_ad INT = ISNULL((SELECT MAX(mmordine) + 10 FROM dbo._metadati__menu WHERE mm_parent_id = @parent), 10);
    INSERT INTO dbo._metadati__menu
      (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
    VALUES
      (@new_id_ad, 'aging_debiti', 'Aging debiti', @parent, '#/aging_debiti/dashboard',
       'Distribuzione debiti fornitori per fascia eta + KPI rischio', 1, @ord_ad, 'Aging debiti', 'pi pi-exclamation-circle');
    PRINT 'INSERT menu: Aging debiti (mm_id=' + CAST(@new_id_ad AS NVARCHAR(10)) + ')';
END
ELSE
    PRINT 'SKIP menu: Aging debiti (gia esistente)';
GO

-- 3) Cashflow forecast
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_uri_menu = '#/cashflow_forecast/dashboard')
BEGIN
    DECLARE @parent INT = 6074;
    DECLARE @new_id_cf INT = (SELECT MAX(mm_id) + 1 FROM dbo._metadati__menu);
    DECLARE @ord_cf INT = ISNULL((SELECT MAX(mmordine) + 10 FROM dbo._metadati__menu WHERE mm_parent_id = @parent), 10);
    INSERT INTO dbo._metadati__menu
      (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
    VALUES
      (@new_id_cf, 'cashflow_forecast', 'Cashflow forecast', @parent, '#/cashflow_forecast/dashboard',
       'Proiezione saldo 90 giorni + KPI incassi/pagamenti attesi', 1, @ord_cf, 'Cashflow forecast', 'pi pi-wallet');
    PRINT 'INSERT menu: Cashflow forecast (mm_id=' + CAST(@new_id_cf AS NVARCHAR(10)) + ')';
END
ELSE
    PRINT 'SKIP menu: Cashflow forecast (gia esistente)';
GO

-- 4) Top clienti
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_uri_menu = '#/top_clienti/dashboard')
BEGIN
    DECLARE @parent INT = 6074;
    DECLARE @new_id_tc INT = (SELECT MAX(mm_id) + 1 FROM dbo._metadati__menu);
    DECLARE @ord_tc INT = ISNULL((SELECT MAX(mmordine) + 10 FROM dbo._metadati__menu WHERE mm_parent_id = @parent), 10);
    INSERT INTO dbo._metadati__menu
      (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
    VALUES
      (@new_id_tc, 'top_clienti', 'Top clienti', @parent, '#/top_clienti/dashboard',
       'Top 10 clienti per fatturato anno corrente + KPI', 1, @ord_tc, 'Top clienti', 'pi pi-users');
    PRINT 'INSERT menu: Top clienti (mm_id=' + CAST(@new_id_tc AS NVARCHAR(10)) + ')';
END
ELSE
    PRINT 'SKIP menu: Top clienti (gia esistente)';
GO

-- Verifica finale
SELECT mm_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mmordine, mm_icon
FROM dbo._metadati__menu
WHERE mm_parent_id = 6074
ORDER BY mmordine, mm_id;
