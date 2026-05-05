/* ============================================================
   FatturazioneElettronica — voci menu + display strings per
   email_log e movimenti_bancari (scaffolded ora come route).
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;

/* ---- 1) Display strings parlanti ---- */
UPDATE dbo._metadati__tabelle
SET mm_display_string = N'Email inviate',
    mm_long_description = N'Log email inviate ai clienti (fatture, comunicazioni)'
WHERE mdroutename = 'email_log';

UPDATE dbo._metadati__tabelle
SET mm_display_string = N'Movimenti bancari',
    mm_long_description = N'Estratto conto importato da CSV per riconciliazione'
WHERE mdroutename = 'movimenti_bancari';

/* ---- 2) Voci menu ---- */
DECLARE @grpIncassi INT = (SELECT mm_id FROM dbo._metadati__menu WHERE mm_nome_menu = 'grp_incassi');
DECLARE @next_id INT = (SELECT ISNULL(MAX(mm_id), 0) FROM dbo._metadati__menu);

-- Email inviate (top-level singolo, posizione 7 fra "Fatture ricevute" e "Vendite")
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'email_inviate')
BEGIN
    SET @next_id = @next_id + 1;
    INSERT INTO dbo._metadati__menu
        (mm_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_parent_id, mm_is_visible_by_default)
    VALUES
        (@next_id, N'email_inviate', N'Email inviate', N'#/email_log/list', N'pi pi-envelope', 4, NULL, 1);
END

-- Riconciliazione (sotto "Incassi e pagamenti", come da screenshot)
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = 'riconciliazione')
BEGIN
    SET @next_id = @next_id + 1;
    INSERT INTO dbo._metadati__menu
        (mm_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_parent_id, mm_is_visible_by_default)
    VALUES
        (@next_id, N'riconciliazione', N'Riconciliazione', N'#/movimenti_bancari/list', N'pi pi-sync', 4, @grpIncassi, 1);
END

PRINT 'Display strings + voci menu Email inviate/Riconciliazione applicate.';

SELECT mm_id, mm_display_string_menu, mm_uri_menu
FROM dbo._metadati__menu
WHERE mm_nome_menu IN ('email_inviate','riconciliazione');
GO
