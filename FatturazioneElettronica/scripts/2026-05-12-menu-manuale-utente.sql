-- ============================================================================
-- 2026-05-12 — Aggiunta voce di menu "Manuale utente" per FatturazioneElettronica
-- ============================================================================
-- DB metadati: FatturazioneElettronica_Metadata
--
-- Aggiunge un entry top-level (ultima posizione) che apre la route Angular
-- `#/manuale` → component `ManualeViewerComponent` che renderizza in iframe
-- il file `wwwroot/public/docs/manuale.html` (manuale utente HTML standalone).
--
-- Idempotente: usa NOT EXISTS sul mm_uri_menu prima dell'INSERT.
--
-- Vedi anche:
--   docs/manuale.html                                            (sorgente HTML)
--   wwwroot/public/docs/manuale.html                             (deploy statico)
--   wwwroot/src/app/component/manuale-viewer/manuale-viewer.component.ts
--   wwwroot/src/app/app.routes.ts                                (registrazione route)
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

GO

USE [FatturazioneElettronica_Metadata];
GO

IF NOT EXISTS (
    SELECT 1 FROM [dbo].[_metadati__menu]
    WHERE [mm_uri_menu] = N'manuale' AND [mm_parent_id] IS NULL
)
BEGIN
    -- mm_id NON e' IDENTITY: calcolo manualmente il prossimo valore disponibile.
    DECLARE @next_id INT = (SELECT ISNULL(MAX([mm_id]), 0) + 1 FROM [dbo].[_metadati__menu]);

    INSERT INTO [dbo].[_metadati__menu] (
        [mm_id],
        [mm_uri_menu],
        [mm_tooltip_menu],
        [mm_parent_id],
        [mm_nome_menu],
        [mm_is_visible_by_default],
        [mm_display_string_menu],
        [mmordine],
        [mdid],
        [mmpagetitle],
        [target1],
        [mm_css_class],
        [mm_icon],
        [mm_props_bag]
    ) VALUES (
        @next_id,
        N'manuale',
        N'Apri il manuale utente e la guida alla configurazione',
        NULL,
        N'manuale_utente',
        1,
        N'Manuale',
        99,                     -- ordine: ultimo top-level
        NULL,
        N'Manuale utente',
        N'_self',               -- naviga nello stesso tab (iframe full-viewport)
        N'',
        N'pi pi-book',
        N'{}'
    );

    PRINT CONCAT(N'[manuale-utente] menu entry inserted: mm_id=', @next_id, N', mm_uri_menu=manuale, ordine=99');
END
ELSE
BEGIN
    PRINT N'[manuale-utente] menu entry already exists, skipped.';
END
GO

-- Verifica
SELECT mm_id, mm_uri_menu, mm_display_string_menu, mm_icon, mmordine
FROM [dbo].[_metadati__menu]
WHERE mm_uri_menu = N'manuale' AND mm_parent_id IS NULL;
GO
