-- =============================================================================
-- 2026-05-17 — Menu entries Modulo Varianti + Modulo Magazzino
-- =============================================================================
-- Strategia:
--   - 3 voci varianti sotto "Anagrafiche" (mm_id=6060): attributi, valori, varianti
--   - Nuovo gruppo top-level "Magazzino" (mm_id auto, ord=8) tra Finanze (7) e
--     Manuale (99) con: Magazzini, Giacenze, Movimenti
--   - Traduzioni 7 chiavi × 5 lingue in `_wuic_translations`
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

USE FatturazioneElettronica_Metadata;

-- =====================================================================
-- 1) Voci sotto Anagrafiche (parent 6060) + 2) Gruppo Magazzino + 3 voci
-- =====================================================================
DECLARE @all_items TABLE (
    nome VARCHAR(50), disp VARCHAR(100), uri VARCHAR(200),
    parent_marker VARCHAR(40), ord INT, icon VARCHAR(50), tooltip VARCHAR(200)
);
INSERT INTO @all_items VALUES
    -- Anagrafiche (parent_marker='ANAG' → mm_id 6060)
    ('prodotto_attributi',        'menu.invoice.product_attributes',        '#/prodotto_attributi/list',        'ANAG', 50, 'pi pi-tags',      'Attributi varianti: TAGLIA, COLORE, MODELLO, ...'),
    ('prodotto_attributi_valori', 'menu.invoice.product_attributes_values', '#/prodotto_attributi_valori/list', 'ANAG', 55, 'pi pi-list',      'Valori degli attributi (S/M/L, Rosso/Blu, ...)'),
    ('prodotto_varianti',         'menu.invoice.product_variants',          '#/prodotto_varianti/list',         'ANAG', 60, 'pi pi-th-large',  'Varianti prodotto (combinazioni attributo x valore)'),
    -- Magazzino (parent_marker='MAG' → grp_magazzino top-level)
    ('magazzini',                 'menu.invoice.warehouses',                '#/magazzini/list',                 'MAG',  10, 'pi pi-warehouse', 'Anagrafica magazzini'),
    ('magazzino_giacenze',        'menu.invoice.warehouse_stock',           '#/magazzino_giacenze/list',        'MAG',  20, 'pi pi-list',      'Giacenze (snapshot running balance)'),
    ('magazzino_movimenti',       'menu.invoice.warehouse_movements',       '#/magazzino_movimenti/list',       'MAG',  30, 'pi pi-history',   'Movimenti (event log immutable)');

-- Resolve / create grp_magazzino
DECLARE @grp_mag_id INT = NULL;
SELECT @grp_mag_id = mm_id FROM _metadati__menu WHERE mm_nome_menu = 'grp_magazzino' AND mm_parent_id IS NULL;
IF @grp_mag_id IS NULL
BEGIN
    SET @grp_mag_id = (SELECT MAX(mm_id) + 1 FROM _metadati__menu);
    INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
    VALUES (@grp_mag_id, 'grp_magazzino', 'menu.invoice.warehouse', NULL, '', 'Gestione magazzino, giacenze, movimenti', 1, 8, 'menu.invoice.warehouse', 'pi pi-box');
    PRINT 'INSERT group: grp_magazzino (mm_id=' + CAST(@grp_mag_id AS NVARCHAR(10)) + ')';
END

DECLARE @parent_anag INT = 6060;

-- Iterate (PowerShell-safe: single batch, no GO break)
DECLARE @nome VARCHAR(50), @disp VARCHAR(100), @uri VARCHAR(200), @parent_marker VARCHAR(40), @ord INT, @icon VARCHAR(50), @tooltip VARCHAR(200);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT nome, disp, uri, parent_marker, ord, icon, tooltip FROM @all_items;
OPEN c;
FETCH NEXT FROM c INTO @nome, @disp, @uri, @parent_marker, @ord, @icon, @tooltip;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _metadati__menu WHERE mm_uri_menu = @uri)
    BEGIN
        DECLARE @parent_id INT = CASE @parent_marker WHEN 'ANAG' THEN @parent_anag WHEN 'MAG' THEN @grp_mag_id END;
        DECLARE @new_id INT = (SELECT MAX(mm_id) + 1 FROM _metadati__menu);
        INSERT INTO _metadati__menu (mm_id, mm_nome_menu, mm_display_string_menu, mm_parent_id, mm_uri_menu, mm_tooltip_menu, mm_is_visible_by_default, mmordine, mmpagetitle, mm_icon)
        VALUES (@new_id, @nome, @disp, @parent_id, @uri, @tooltip, 1, @ord, @disp, @icon);
        PRINT 'INSERT menu: ' + @nome + ' (parent=' + CAST(@parent_id AS NVARCHAR(10)) + ', mm_id=' + CAST(@new_id AS NVARCHAR(10)) + ')';
    END
    FETCH NEXT FROM c INTO @nome, @disp, @uri, @parent_marker, @ord, @icon, @tooltip;
END
CLOSE c; DEALLOCATE c;

-- =====================================================================
-- 3) Traduzioni it/en/de/es/fr per le nuove chiavi menu.invoice.*
-- =====================================================================
DECLARE @translations TABLE (resource VARCHAR(200), lang VARCHAR(10), translation NVARCHAR(400));
INSERT INTO @translations VALUES
    ('menu.invoice.product_attributes', 'it-IT', N'Attributi varianti'),
    ('menu.invoice.product_attributes', 'en-US', N'Variant attributes'),
    ('menu.invoice.product_attributes', 'fr-FR', N'Attributs de variante'),
    ('menu.invoice.product_attributes', 'es-ES', N'Atributos de variante'),
    ('menu.invoice.product_attributes', 'de-DE', N'Variantenattribute'),
    ('menu.invoice.product_attributes_values', 'it-IT', N'Valori attributi'),
    ('menu.invoice.product_attributes_values', 'en-US', N'Attribute values'),
    ('menu.invoice.product_attributes_values', 'fr-FR', N'Valeurs d''attribut'),
    ('menu.invoice.product_attributes_values', 'es-ES', N'Valores de atributo'),
    ('menu.invoice.product_attributes_values', 'de-DE', N'Attributwerte'),
    ('menu.invoice.product_variants', 'it-IT', N'Varianti prodotto'),
    ('menu.invoice.product_variants', 'en-US', N'Product variants'),
    ('menu.invoice.product_variants', 'fr-FR', N'Variantes de produit'),
    ('menu.invoice.product_variants', 'es-ES', N'Variantes de producto'),
    ('menu.invoice.product_variants', 'de-DE', N'Produktvarianten'),
    ('menu.invoice.warehouse', 'it-IT', N'Magazzino'),
    ('menu.invoice.warehouse', 'en-US', N'Warehouse'),
    ('menu.invoice.warehouse', 'fr-FR', N'Entrepôt'),
    ('menu.invoice.warehouse', 'es-ES', N'Almacén'),
    ('menu.invoice.warehouse', 'de-DE', N'Lager'),
    ('menu.invoice.warehouses', 'it-IT', N'Magazzini'),
    ('menu.invoice.warehouses', 'en-US', N'Warehouses'),
    ('menu.invoice.warehouses', 'fr-FR', N'Entrepôts'),
    ('menu.invoice.warehouses', 'es-ES', N'Almacenes'),
    ('menu.invoice.warehouses', 'de-DE', N'Lager'),
    ('menu.invoice.warehouse_stock', 'it-IT', N'Giacenze'),
    ('menu.invoice.warehouse_stock', 'en-US', N'Stock'),
    ('menu.invoice.warehouse_stock', 'fr-FR', N'Stocks'),
    ('menu.invoice.warehouse_stock', 'es-ES', N'Existencias'),
    ('menu.invoice.warehouse_stock', 'de-DE', N'Lagerbestände'),
    ('menu.invoice.warehouse_movements', 'it-IT', N'Movimenti'),
    ('menu.invoice.warehouse_movements', 'en-US', N'Movements'),
    ('menu.invoice.warehouse_movements', 'fr-FR', N'Mouvements'),
    ('menu.invoice.warehouse_movements', 'es-ES', N'Movimientos'),
    ('menu.invoice.warehouse_movements', 'de-DE', N'Bewegungen');

INSERT INTO _wuic_translations (resource, language, translation)
SELECT t.resource, t.lang, t.translation
FROM @translations t
WHERE NOT EXISTS (
    SELECT 1 FROM _wuic_translations w
    WHERE w.resource = t.resource AND w.language = t.lang
);

PRINT '2026-05-17-magazzino-varianti-menu.sql applicato.';
