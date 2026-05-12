-- ============================================================================
-- FlottaMezzi - Menu seed (idempotente)
-- DB: FlottaMezzi_Metadata
-- mm_id NON e' IDENTITY: assegnazione manuale via MAX+1 per ogni INSERT
-- ============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- 1) Cleanup template-leftover top-level
DELETE FROM dbo._metadati__menu
WHERE mm_id IN (3893, 3920, 3890, 3959, 3896)
   OR mm_nome_menu IN (N'__Application', N'__Sales', N'__Purchasing', N'sample', N'__Samples', N'__Warehouse');
PRINT '[ok] template-leftover cancellati';
GO

-- 2) UPSERT helper inline: top-level groups
DECLARE @anag_id INT, @oper_id INT, @doc_id INT, @nextId INT;

SELECT @anag_id = mm_id FROM dbo._metadati__menu WHERE mm_parent_id IS NULL AND mm_nome_menu = N'flotta_anagrafiche';
IF @anag_id IS NULL
BEGIN
    SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
    VALUES (@nextId, N'flotta_anagrafiche', N'Anagrafiche', NULL, 10, 1, NULL, N'pi pi-id-card');
    SET @anag_id = @nextId;
END

SELECT @oper_id = mm_id FROM dbo._metadati__menu WHERE mm_parent_id IS NULL AND mm_nome_menu = N'flotta_operazioni';
IF @oper_id IS NULL
BEGIN
    SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
    VALUES (@nextId, N'flotta_operazioni', N'Operazioni', NULL, 20, 1, NULL, N'pi pi-wrench');
    SET @oper_id = @nextId;
END

SELECT @doc_id = mm_id FROM dbo._metadati__menu WHERE mm_parent_id IS NULL AND mm_nome_menu = N'flotta_documenti';
IF @doc_id IS NULL
BEGIN
    SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
    INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
    VALUES (@nextId, N'flotta_documenti', N'Documenti', NULL, 30, 1, NULL, N'pi pi-file');
    SET @doc_id = @nextId;
END

PRINT '[ok] top-level groups upsert';

-- 3) Leaf entries (table variable + cursor con mm_id manuale)
DECLARE @leafs TABLE (
    nome NVARCHAR(50),
    display NVARCHAR(150),
    uri NVARCHAR(200),
    parent INT,
    ord INT,
    icon NVARCHAR(50)
);

INSERT INTO @leafs (nome, display, uri, parent, ord, icon) VALUES
    (N'flotta_mezzi',             N'Mezzi',             N'#/mezzi/list',              @anag_id, 10, N'pi pi-truck'),
    (N'flotta_conducenti',        N'Conducenti',        N'#/conducenti/list',         @anag_id, 20, N'pi pi-user'),
    (N'flotta_tipo_mezzo',        N'Tipo mezzo',        N'#/tipo_mezzo/list',         @anag_id, 30, N'pi pi-tags'),
    (N'flotta_stato_mezzo',       N'Stato mezzo',       N'#/stato_mezzo/list',        @anag_id, 40, N'pi pi-flag'),
    (N'flotta_tipo_manutenzione', N'Tipo manutenzione', N'#/tipo_manutenzione/list',  @anag_id, 50, N'pi pi-cog'),
    (N'flotta_manutenzioni',      N'Manutenzioni',      N'#/manutenzioni/list',       @oper_id, 10, N'pi pi-wrench'),
    (N'flotta_rifornimenti',      N'Rifornimenti',      N'#/rifornimenti/list',       @oper_id, 20, N'pi pi-bolt'),
    (N'flotta_sinistri',          N'Sinistri',          N'#/sinistri/list',           @oper_id, 30, N'pi pi-exclamation-triangle'),
    (N'flotta_contratti',         N'Contratti assicurativi', N'#/contratti_assicurativi/list', @doc_id, 10, N'pi pi-shield'),
    (N'flotta_revisioni',         N'Revisioni',         N'#/revisioni/list',          @doc_id, 20, N'pi pi-verified');

DECLARE @nome NVARCHAR(50), @display NVARCHAR(150), @uri NVARCHAR(200), @parent INT, @ord INT, @icon NVARCHAR(50);
DECLARE leaf_cur CURSOR LOCAL FAST_FORWARD FOR SELECT nome, display, uri, parent, ord, icon FROM @leafs;
OPEN leaf_cur;
FETCH NEXT FROM leaf_cur INTO @nome, @display, @uri, @parent, @ord, @icon;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (SELECT 1 FROM dbo._metadati__menu WHERE mm_nome_menu = @nome)
    BEGIN
        UPDATE dbo._metadati__menu
           SET mm_display_string_menu = @display,
               mm_uri_menu            = @uri,
               mm_parent_id           = @parent,
               mmordine               = @ord,
               mm_is_visible_by_default = 1,
               mm_icon                = @icon
         WHERE mm_nome_menu = @nome;
    END
    ELSE
    BEGIN
        SELECT @nextId = ISNULL(MAX(mm_id), 0) + 1 FROM dbo._metadati__menu;
        INSERT INTO dbo._metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mmordine, mm_is_visible_by_default, mm_uri_menu, mm_icon)
        VALUES (@nextId, @nome, @display, @parent, @ord, 1, @uri, @icon);
    END
    FETCH NEXT FROM leaf_cur INTO @nome, @display, @uri, @parent, @ord, @icon;
END
CLOSE leaf_cur;
DEALLOCATE leaf_cur;
PRINT '[ok] 10 leaf entries upsert';
GO

-- 4) Verifica
PRINT '--- Top-level (atteso: <= 8) ---';
SELECT mm_id, mmordine, mm_nome_menu, mm_display_string_menu
  FROM dbo._metadati__menu WHERE mm_parent_id IS NULL ORDER BY mmordine, mm_id;

PRINT '--- Voci flotta ---';
SELECT m.mm_id, m.mm_nome_menu, m.mm_display_string_menu, m.mm_uri_menu, p.mm_nome_menu AS parent
  FROM dbo._metadati__menu m
  LEFT JOIN dbo._metadati__menu p ON p.mm_id = m.mm_parent_id
 WHERE m.mm_nome_menu LIKE N'flotta\_%' ESCAPE N'\'
 ORDER BY ISNULL(m.mm_parent_id, 0), m.mmordine, m.mm_id;
GO
