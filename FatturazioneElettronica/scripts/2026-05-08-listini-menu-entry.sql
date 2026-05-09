-- 2026-05-08 — Aggiunge voce menu "Listini" sotto Anagrafiche (parent 6060).
-- Sibling di clienti/fornitori/prodotti/anagrafica_unificata.

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF NOT EXISTS (SELECT 1 FROM _metadati__menu WHERE mm_uri_menu = '#/listini/list')
BEGIN
  DECLARE @new_id INT = (SELECT MAX(mm_id) + 1 FROM _metadati__menu);
  DECLARE @md_id INT = (SELECT md_id FROM _metadati__tabelle WHERE md_nome_tabella = 'listini' AND mddbname = 'FatturazioneElettronica_Data');
  DECLARE @next_ord INT = ISNULL((SELECT MAX(mmordine) + 10 FROM _metadati__menu WHERE mm_parent_id = 6060), 10);

  -- mm_id NOT auto-increment; provide explicit max+1.
  INSERT INTO _metadati__menu
    (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mdid, mmpagetitle, mm_icon)
  VALUES
    (@new_id, 'listini', 'Listini', 6060, '#/listini/list', 'Gestione listini prezzi', 1, @next_ord, @md_id, 'Listini', 'pi pi-list');
END
GO

-- Verifica
SELECT mm_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mmordine
  FROM _metadati__menu
 WHERE mm_parent_id = 6060
 ORDER BY mmordine, mm_id;
GO
