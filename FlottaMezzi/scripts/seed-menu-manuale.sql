-- =========================================================================
-- Seed voce di menu "Manuale" per FlottaMezzi (idempotente).
-- Esegue su DB FlottaMezzi_Metadata.
--
-- Aggiunge una voce sotto "Amministrazione" (mm_parent_id=750) che punta
-- alla route Angular custom 'manuale' (app.routes.ts) che a sua volta
-- renderizza il wrapper ManualeViewerComponent (iframe su /assets/manuale.html).
-- =========================================================================

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_uri_menu = 'manuale')
BEGIN
    -- mm_id non e' IDENTITY: calcoliamo il prossimo valore esplicitamente.
    DECLARE @next_mm_id INT = (SELECT ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu);

    INSERT INTO dbo._metadati__menu (
        mm_id,
        mm_uri_menu,
        mm_tooltip_menu,
        mm_parent_id,
        mm_nome_menu,
        mm_is_visible_by_default,
        mm_display_string_menu,
        mmordine,
        mdid,
        mm_icon
    )
    VALUES (
        @next_mm_id,
        'manuale',
        'Manuale d''uso e configurazione',
        750,                       -- parent: Amministrazione
        'manuale',
        1,
        'Manuale',
        13,                        -- subito dopo framework-docs (12)
        NULL,
        'pi pi-book'
    );
    PRINT 'inserted: manuale menu entry mm_id=' + CAST(@next_mm_id AS VARCHAR(10));
END
ELSE
BEGIN
    PRINT 'skip: manuale menu entry already exists';
END

-- Verifica finale
SELECT mm_id, mm_uri_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_icon
FROM dbo._metadati__menu
WHERE mm_uri_menu = 'manuale';
