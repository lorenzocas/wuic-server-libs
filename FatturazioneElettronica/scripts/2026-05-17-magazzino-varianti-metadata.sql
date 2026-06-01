-- =============================================================================
-- 2026-05-17 — Metadata seed per Modulo 1 Varianti + Modulo 2 Magazzino
-- =============================================================================
-- Liv 1 archetype (table route) per le 7 nuove tabelle + stored route per le 6
-- SP. Pattern: clone della route 'prodotti' come template (archetypes/audit),
-- override mdroutename + mdnometabella + mdpropsbag specifico.
--
-- Idempotente: IF NOT EXISTS guard per ogni route.
-- Post-apply: chiamare MetaService.invalidateMetadataRuntime via AsmxProxy.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE FatturazioneElettronica_Metadata;
GO

-- =====================================================================
-- Helper: clona la route 'prodotti' come baseline + override
-- =====================================================================
DECLARE @table_routes TABLE (route VARCHAR(80), nome_tabella VARCHAR(80), is_stored BIT, propsbag NVARCHAR(MAX));
INSERT INTO @table_routes VALUES
    ('prodotto_attributi',        'prodotto_attributi',        0, NULL),
    ('prodotto_attributi_valori', 'prodotto_attributi_valori', 0, NULL),
    ('prodotto_varianti',         'prodotto_varianti',         0, NULL),
    ('magazzini',                 'magazzini',                 0, NULL),
    ('magazzino_movimenti',       'magazzino_movimenti',       0, NULL),
    ('magazzino_giacenze',        'magazzino_giacenze',        0, NULL);

DECLARE @stored_routes TABLE (route VARCHAR(80), propsbag NVARCHAR(MAX));
INSERT INTO @stored_routes VALUES
    ('sp_genera_matrice_varianti',
      N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@attributi_json","Type":"text","value":""},{"Name":"@utente_id","Type":"number","value":""}]}'),
    ('sp_risolvi_prezzo_variante',
      N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@variante_id","Type":"number","value":""},{"Name":"@cliente_id","Type":"number","value":""},{"Name":"@data_riferimento","Type":"date","value":""}]}'),
    ('sp_calcola_disponibilita_per_variante',
      N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@variante_id","Type":"number","value":""}]}'),
    ('sp_calcola_disponibilita_aggregata',
      N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""}]}'),
    ('sp_warmup_giacenze_da_movimenti',
      N'{"parameters":[{"Name":"@magazzino_id","Type":"number","value":""}]}');

-- =====================================================================
-- 1) Table routes (clone da 'prodotti')
-- =====================================================================
DECLARE @route VARCHAR(80), @nome VARCHAR(80), @is_stored BIT, @propsbag NVARCHAR(MAX);

DECLARE c CURSOR LOCAL FAST_FORWARD FOR
    SELECT route, nome_tabella, is_stored, propsbag FROM @table_routes;
OPEN c;
FETCH NEXT FROM c INTO @route, @nome, @is_stored, @propsbag;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = @route)
    BEGIN
        DECLARE @next_id INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
        SELECT * INTO #tmp_clone FROM _metadati__tabelle WHERE mdroutename = 'prodotti';
        UPDATE #tmp_clone SET
            md_id = @next_id,
            mdroutename = @route,
            md_nome_tabella = @nome,
            mdisstored = @is_stored,
            mdconnname = 'DataSQLConnection',
            mdschemaname = 'dbo',
            mdedittemplate = NULL,
            mddetailtemplate = NULL,
            mdnestedgridroutes = NULL,
            mdpropsbag = ISNULL(@propsbag, mdpropsbag);
        INSERT INTO _metadati__tabelle SELECT * FROM #tmp_clone;
        DROP TABLE #tmp_clone;
        PRINT 'INSERT route: ' + @route + ' (md_id=' + CAST(@next_id AS NVARCHAR(10)) + ')';
    END
    ELSE
        PRINT 'SKIP route (already exists): ' + @route;
    FETCH NEXT FROM c INTO @route, @nome, @is_stored, @propsbag;
END
CLOSE c; DEALLOCATE c;
GO

-- =====================================================================
-- 2) Stored routes (clone da 'pagamenti' = pattern stored route)
-- =====================================================================
DECLARE @sroute VARCHAR(80), @spropsbag NVARCHAR(MAX);
DECLARE cs CURSOR LOCAL FAST_FORWARD FOR
    SELECT route, propsbag FROM (VALUES
        ('sp_genera_matrice_varianti',
         N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@attributi_json","Type":"text","value":""},{"Name":"@utente_id","Type":"number","value":""}]}'),
        ('sp_risolvi_prezzo_variante',
         N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@variante_id","Type":"number","value":""},{"Name":"@cliente_id","Type":"number","value":""},{"Name":"@data_riferimento","Type":"date","value":""}]}'),
        ('sp_calcola_disponibilita_per_variante',
         N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""},{"Name":"@variante_id","Type":"number","value":""}]}'),
        ('sp_calcola_disponibilita_aggregata',
         N'{"parameters":[{"Name":"@prodotto_id","Type":"number","value":""}]}'),
        ('sp_warmup_giacenze_da_movimenti',
         N'{"parameters":[{"Name":"@magazzino_id","Type":"number","value":""}]}')
    ) AS v(route, propsbag);
OPEN cs;
FETCH NEXT FROM cs INTO @sroute, @spropsbag;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM _metadati__tabelle WHERE mdroutename = @sroute)
    BEGIN
        DECLARE @sid INT = (SELECT ISNULL(MAX(md_id),0) + 1 FROM _metadati__tabelle);
        SELECT * INTO #tmp_sclone FROM _metadati__tabelle WHERE mdroutename = 'pagamenti';
        UPDATE #tmp_sclone SET
            md_id = @sid,
            mdroutename = @sroute,
            md_nome_tabella = @sroute,
            mdisstored = 1,
            mdconnname = 'DataSQLConnection',
            mdschemaname = 'dbo',
            md_editable = 0, md_deletable = 0, md_insertable = 0,
            mddetailaction = 0,
            mdedittemplate = NULL, mddetailtemplate = NULL,
            mdnestedgridroutes = NULL,
            mdpropsbag = @spropsbag;
        INSERT INTO _metadati__tabelle SELECT * FROM #tmp_sclone;
        DROP TABLE #tmp_sclone;
        PRINT 'INSERT stored route: ' + @sroute + ' (md_id=' + CAST(@sid AS NVARCHAR(10)) + ')';
    END
    ELSE
        PRINT 'SKIP stored route (already exists): ' + @sroute;
    FETCH NEXT FROM cs INTO @sroute, @spropsbag;
END
CLOSE cs; DEALLOCATE cs;
GO

SELECT mdroutename, mdisstored, mdconnname FROM _metadati__tabelle
WHERE mdroutename IN (
    'prodotto_attributi','prodotto_attributi_valori','prodotto_varianti',
    'magazzini','magazzino_movimenti','magazzino_giacenze',
    'sp_genera_matrice_varianti','sp_risolvi_prezzo_variante',
    'sp_calcola_disponibilita_per_variante','sp_calcola_disponibilita_aggregata',
    'sp_warmup_giacenze_da_movimenti'
)
ORDER BY mdroutename;
GO
