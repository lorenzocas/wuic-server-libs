-- ============================================================================
-- FlottaMezzi - Phase 3 Liv 2: tuning metadata
-- DB: FlottaMezzi_Metadata
-- Idempotente.
-- ============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ============================================================================
-- 1) LOOKUP setup (mc_ui_column_type='lookupByID' + voa_class=2)
--    Pattern (skill db-schema-scaffolding):
--      mc_ui_column_type = 'lookupByID'
--      mcuilookupentityname = '<route target>'
--      mcuilookupdata_value_field = 'id'
--      mcuilookupdata_text_field = '<col descrittiva>'
--      voa_class = 2
-- ============================================================================

-- ---- mezzi.tipo_mezzo_id -> tipo_mezzo.descrizione --------------------------
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'tipo_mezzo',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'descrizione',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'mezzi' AND c.mc_nome_colonna = N'tipo_mezzo_id';

-- ---- mezzi.stato_mezzo_id -> stato_mezzo.descrizione ------------------------
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'stato_mezzo',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'descrizione',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'mezzi' AND c.mc_nome_colonna = N'stato_mezzo_id';

-- ---- mezzi.conducente_assegnato_id -> conducenti.cognome --------------------
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'conducenti',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'cognome',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'mezzi' AND c.mc_nome_colonna = N'conducente_assegnato_id';

-- ---- manutenzioni.mezzo_id -> mezzi.targa -----------------------------------
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'mezzi',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'targa',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'manutenzioni', N'rifornimenti', N'contratti_assicurativi', N'revisioni', N'sinistri')
  AND c.mc_nome_colonna = N'mezzo_id';

-- ---- manutenzioni.tipo_manutenzione_id -> tipo_manutenzione.descrizione -----
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'tipo_manutenzione',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'descrizione',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'manutenzioni' AND c.mc_nome_colonna = N'tipo_manutenzione_id';

-- ---- rifornimenti.conducente_id -> conducenti.cognome -----------------------
-- ---- sinistri.conducente_id -> conducenti.cognome ---------------------------
UPDATE c SET
    c.mc_ui_column_type           = N'lookupByID',
    c.mcuilookupentityname        = N'conducenti',
    c.mcuilookupdata_value_field  = N'id',
    c.mcuilookupdata_text_field   = N'cognome',
    c.voa_class                   = 2
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'rifornimenti', N'sinistri') AND c.mc_nome_colonna = N'conducente_id';

PRINT '[ok] lookup setup completato';

-- ============================================================================
-- 2) VALIDAZIONI (mc_validation_*)
-- ============================================================================

-- mezzi.targa: regex italiana (AA000AA), required
UPDATE c SET
    c.mcvalidationpattern =N'^[A-Z]{2}[0-9]{3}[A-Z]{2}$',
    c.mc_validation_required = 1,
    c.mcvalidationpatternmessage =N'Formato targa italiano: 2 lettere + 3 cifre + 2 lettere (es. AB123CD)'
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'mezzi' AND c.mc_nome_colonna = N'targa';

-- conducenti.codice_fiscale: regex 16 char (lettere/numeri)
UPDATE c SET
    c.mcvalidationpattern =N'^[A-Z0-9]{16}$',
    c.mcvalidationpatternmessage =N'Codice fiscale: 16 caratteri alfanumerici maiuscoli'
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'conducenti' AND c.mc_nome_colonna = N'codice_fiscale';

-- conducenti.email: regex semplice
UPDATE c SET
    c.mcvalidationpattern =N'^[^@\s]+@[^@\s]+\.[^@\s]+$',
    c.mcvalidationpatternmessage =N'Indirizzo email non valido'
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'conducenti' AND c.mc_nome_colonna = N'email';

-- Required fields
UPDATE c SET c.mc_validation_required = 1
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE (t.mdroutename = N'conducenti' AND c.mc_nome_colonna IN (N'nome', N'cognome'))
   OR (t.mdroutename = N'manutenzioni' AND c.mc_nome_colonna IN (N'mezzo_id', N'data'))
   OR (t.mdroutename = N'rifornimenti' AND c.mc_nome_colonna IN (N'mezzo_id', N'data'))
   OR (t.mdroutename = N'contratti_assicurativi' AND c.mc_nome_colonna IN (N'mezzo_id', N'compagnia'))
   OR (t.mdroutename = N'revisioni' AND c.mc_nome_colonna IN (N'mezzo_id', N'data'))
   OR (t.mdroutename = N'sinistri' AND c.mc_nome_colonna IN (N'mezzo_id', N'data'))
   OR (t.mdroutename IN (N'tipo_mezzo', N'stato_mezzo', N'tipo_manutenzione') AND c.mc_nome_colonna = N'descrizione');

PRINT '[ok] validazioni applicate';

-- ============================================================================
-- 3) DISPLAY STRING parlanti per le colonne business principali
-- ============================================================================

-- mezzi
UPDATE c SET
    c.mc_display_string_in_view = CASE c.mc_nome_colonna
        WHEN N'targa' THEN N'Targa'
        WHEN N'tipo_mezzo_id' THEN N'Tipo'
        WHEN N'marca' THEN N'Marca'
        WHEN N'modello' THEN N'Modello'
        WHEN N'anno' THEN N'Anno'
        WHEN N'telaio' THEN N'Telaio'
        WHEN N'alimentazione' THEN N'Alimentazione'
        WHEN N'km_attuali' THEN N'Km attuali'
        WHEN N'stato_mezzo_id' THEN N'Stato'
        WHEN N'data_immatricolazione' THEN N'Data immatricolazione'
        WHEN N'conducente_assegnato_id' THEN N'Conducente'
        WHEN N'latitudine' THEN N'Latitudine'
        WHEN N'longitudine' THEN N'Longitudine'
        WHEN N'data_ultima_posizione' THEN N'Ultima posizione'
        ELSE c.mc_display_string_in_view
    END,
    c.mc_display_string_in_edit = CASE c.mc_nome_colonna
        WHEN N'targa' THEN N'Targa'
        WHEN N'tipo_mezzo_id' THEN N'Tipo mezzo'
        WHEN N'marca' THEN N'Marca'
        WHEN N'modello' THEN N'Modello'
        WHEN N'anno' THEN N'Anno immatricolazione'
        WHEN N'telaio' THEN N'Numero telaio'
        WHEN N'alimentazione' THEN N'Alimentazione (benzina/diesel/...)'
        WHEN N'km_attuali' THEN N'Km attuali (auto-aggiornato dai rifornimenti)'
        WHEN N'stato_mezzo_id' THEN N'Stato operativo'
        WHEN N'data_immatricolazione' THEN N'Data immatricolazione'
        WHEN N'conducente_assegnato_id' THEN N'Conducente assegnato'
        WHEN N'latitudine' THEN N'Latitudine GPS'
        WHEN N'longitudine' THEN N'Longitudine GPS'
        WHEN N'data_ultima_posizione' THEN N'Data ultima posizione'
        ELSE c.mc_display_string_in_edit
    END
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'mezzi';

-- conducenti
UPDATE c SET
    c.mc_display_string_in_view = CASE c.mc_nome_colonna
        WHEN N'nome' THEN N'Nome'
        WHEN N'cognome' THEN N'Cognome'
        WHEN N'codice_fiscale' THEN N'Codice fiscale'
        WHEN N'numero_patente' THEN N'N. patente'
        WHEN N'categoria_patente' THEN N'Cat. patente'
        WHEN N'scadenza_patente' THEN N'Scadenza patente'
        WHEN N'telefono' THEN N'Telefono'
        WHEN N'email' THEN N'Email'
        ELSE c.mc_display_string_in_view
    END,
    c.mc_display_string_in_edit = CASE c.mc_nome_colonna
        WHEN N'nome' THEN N'Nome'
        WHEN N'cognome' THEN N'Cognome'
        WHEN N'codice_fiscale' THEN N'Codice fiscale (16 caratteri)'
        WHEN N'numero_patente' THEN N'Numero patente'
        WHEN N'categoria_patente' THEN N'Categoria patente'
        WHEN N'scadenza_patente' THEN N'Scadenza patente'
        WHEN N'telefono' THEN N'Telefono'
        WHEN N'email' THEN N'Email'
        ELSE c.mc_display_string_in_edit
    END
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename = N'conducenti';

-- manutenzioni / rifornimenti / contratti / revisioni / sinistri (display essenziale)
UPDATE c SET
    c.mc_display_string_in_view = CASE c.mc_nome_colonna
        WHEN N'mezzo_id' THEN N'Mezzo'
        WHEN N'tipo_manutenzione_id' THEN N'Tipo'
        WHEN N'conducente_id' THEN N'Conducente'
        WHEN N'data' THEN N'Data'
        WHEN N'descrizione' THEN N'Descrizione'
        WHEN N'costo' THEN N'Costo'
        WHEN N'costo_totale' THEN N'Costo totale'
        WHEN N'costo_annuo' THEN N'Costo annuo'
        WHEN N'costo_stimato' THEN N'Costo stimato'
        WHEN N'officina' THEN N'Officina'
        WHEN N'fattura_numero' THEN N'N. fattura'
        WHEN N'km_alla_manutenzione' THEN N'Km alla manutenzione'
        WHEN N'km_veicolo' THEN N'Km veicolo'
        WHEN N'litri' THEN N'Litri'
        WHEN N'prezzo_litro' THEN N'€/L'
        WHEN N'distributore' THEN N'Distributore'
        WHEN N'compagnia' THEN N'Compagnia'
        WHEN N'numero_polizza' THEN N'N. polizza'
        WHEN N'data_inizio' THEN N'Data inizio'
        WHEN N'data_scadenza' THEN N'Scadenza'
        WHEN N'tipo_copertura' THEN N'Copertura'
        WHEN N'broker' THEN N'Broker'
        WHEN N'esito' THEN N'Esito'
        WHEN N'scadenza_prossima' THEN N'Prossima scadenza'
        WHEN N'centro_revisione' THEN N'Centro revisione'
        WHEN N'controparte' THEN N'Controparte'
        WHEN N'stato_pratica' THEN N'Stato pratica'
        WHEN N'numero_pratica' THEN N'N. pratica'
        WHEN N'note' THEN N'Note'
        ELSE c.mc_display_string_in_view
    END,
    c.mc_display_string_in_edit = c.mc_display_string_in_view
FROM dbo._metadati__colonne c
JOIN dbo._metadati__tabelle t ON t.md_id = c.md_id
WHERE t.mdroutename IN (N'manutenzioni', N'rifornimenti', N'contratti_assicurativi', N'revisioni', N'sinistri',
                        N'tipo_mezzo', N'stato_mezzo', N'tipo_manutenzione');

PRINT '[ok] display string applicate';

-- ============================================================================
-- 4) STILI CONDIZIONALI su mezzi (row-warning, row-danger su scadenze)
--    Pattern (skill): must_attribute_name=<classe css>, must_attribute_value=<callback js>
-- ============================================================================

-- Cleanup pre-existing rules per idempotenza (rimuovi solo se mc_nome_tabella matcha)
-- _metadati__u_i__stili__tabelle: legacy schema columns mdid/mustattributename/mustattributevalue (no underscores)
DECLARE @md_mezzi INT = (SELECT TOP 1 md_id FROM dbo._metadati__tabelle WHERE mdroutename = N'mezzi');

-- row-warning: scadenza patente conducente assegnato < 30gg
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__u_i__stili__tabelle WHERE mdid = @md_mezzi AND mustattributename = N'row-warning')
BEGIN
    INSERT INTO dbo._metadati__u_i__stili__tabelle (mdid, mustattributename, mustattributevalue)
    VALUES (@md_mezzi, N'row-warning',
        N'function(row){ if(!row.scadenza_patente){return false;} var d=new Date(row.scadenza_patente); var n=new Date(); var diff=(d-n)/(1000*60*60*24); return diff>0 && diff<=30; }');
END

-- row-danger: stato dismesso o in_riparazione
IF NOT EXISTS (SELECT 1 FROM dbo._metadati__u_i__stili__tabelle WHERE mdid = @md_mezzi AND mustattributename = N'row-danger')
BEGIN
    INSERT INTO dbo._metadati__u_i__stili__tabelle (mdid, mustattributename, mustattributevalue)
    VALUES (@md_mezzi, N'row-danger',
        N'function(row){ return row.stato_mezzo_id_lookup_text === "in_riparazione" || row.stato_mezzo_id_lookup_text === "dismesso"; }');
END

PRINT '[ok] stili condizionali applicati';

PRINT '=== Tuning metadata Liv 2 completato ===';
GO
