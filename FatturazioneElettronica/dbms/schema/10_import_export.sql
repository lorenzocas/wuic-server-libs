/* ============================================================
   FatturazioneElettronica — Import/Export anagrafiche + import
   parametrico movimenti bancari (md_action_type=10 upload)
   ============================================================
   Pattern framework verificato 2026-05-05:
   - Per anagrafiche standard: toggle md_importable=1 e flag
     md_hide_export_xls/pdf=0 sulla route + mdpropsbag.import
     con opzioni default. Il list-grid mostra in toolbar i bottoni
     Import XLS/XLSX e Export XLS/PDF gia' implementati lato lib.
   - Per movimenti_bancari: action tabella md_action_type=10 che
     apre wtoolbox.uploadDialog con target_table=mov_bancari_imp_tmp
     e stored_name=dbo.sp_movimenti_bancari_import.
     Il framework crea/replace la temp table (colonne NVARCHAR(MAX)
     con header del file Excel) via SqlBulkCopy + chiama la stored
     con parametri standard @TableName, @UserId, @RowCount.

   sqlColumn vs csProperty (regola 25 AGENTS):
     mdimportable     -> md_importable
     mdhideexportxls  -> md_hide_export_xls
     mdhideexportpdf  -> md_hide_export_pdf
   ============================================================ */

SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON; SET NUMERIC_ROUNDABORT OFF;

/* ============================================================
   1) STORED PROCEDURE per import movimenti_bancari
   ============================================================ */
USE FatturazioneElettronica_Data;
GO

IF OBJECT_ID('dbo.sp_movimenti_bancari_import', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_movimenti_bancari_import;
GO

/*
   Stored chiamata dal framework dopo SqlBulkCopy della temp table
   con header user-friendly italiano:

   | Data Operazione | Data Valuta | Importo | Causale | Descrizione |
     IBAN Controparte | Nome Controparte | Riferimento |

   Esempi righe:
   2026-05-04, 2026-05-05,  122,00, BONIFICO,    Pagamento f. 1/2026, IT60X..., Cliente Test SRL, F1/2026
   2026-05-06, ,            -50,00, ADDEBITO,    Commissioni bancarie, , ,
   2026-05-07, ,           1234.56, ACCREDITO,   Saldo iniziale, , ,

   Parametri dal framework:
     @TableName  = nome temp creato da bulk copy (es. 'mov_bancari_imp_tmp')
     @UserId    = utente loggato (string)
     @RowCount  = righe inserite nella temp dal framework

   Output:
     Una row con (rows_imported INT, batch_id NVARCHAR(50), banca_id INT)
*/
CREATE PROCEDURE dbo.sp_movimenti_bancari_import
    @TableName NVARCHAR(255),
    @UserId    NVARCHAR(255) = NULL,
    @RowCount  INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Risolve banca: predefinita -> prima attiva
    DECLARE @banca_id INT;
    SELECT TOP 1 @banca_id = id FROM dbo.banche
    WHERE ISNULL(cancellato, 0) = 0 AND ISNULL(predefinita, 0) = 1
    ORDER BY id;
    IF @banca_id IS NULL
        SELECT TOP 1 @banca_id = id FROM dbo.banche
        WHERE ISNULL(cancellato, 0) = 0 AND ISNULL(attivo, 1) = 1
        ORDER BY id;
    IF @banca_id IS NULL
    BEGIN
        RAISERROR('Nessuna banca configurata. Crea almeno una banca in Anagrafiche/Banche prima di importare movimenti.', 16, 1);
        RETURN;
    END

    DECLARE @batch NVARCHAR(50) = LOWER(REPLACE(CONVERT(NVARCHAR(50), NEWID()), '-', ''));

    -- Quoting safe (whitelist gia' fatta dal framework, paranoid double-check)
    IF @TableName NOT LIKE '%[^A-Za-z0-9_.]%'
        AND PATINDEX('%[A-Za-z_]%', LEFT(@TableName, 1)) = 1
    BEGIN
        DECLARE @safeQ NVARCHAR(300);
        SET @safeQ = QUOTENAME(@TableName);

        DECLARE @sql NVARCHAR(MAX) = N'
INSERT INTO dbo.movimenti_bancari (
    banca_id, data_operazione, data_valuta, importo,
    causale, descrizione, iban_controparte, nome_controparte,
    riferimento, import_batch_id, match_status, created_at
)
SELECT
    @banca_id,
    COALESCE(
        TRY_CONVERT(date, [Data Operazione], 103),  -- dd/mm/yyyy
        TRY_CONVERT(date, [Data Operazione], 23),   -- yyyy-mm-dd
        TRY_CONVERT(date, [Data Operazione])        -- default locale
    ) AS data_operazione,
    COALESCE(
        TRY_CONVERT(date, [Data Valuta], 103),
        TRY_CONVERT(date, [Data Valuta], 23),
        TRY_CONVERT(date, [Data Valuta])
    ) AS data_valuta,
    -- Importo: gestisce sia formato IT (1.234,56) sia formato EN (1234.56)
    CASE
        WHEN [Importo] LIKE ''%,%'' AND [Importo] LIKE ''%.%''
            THEN TRY_CONVERT(decimal(19,4), REPLACE(REPLACE([Importo], ''.'', ''''), '','', ''.''))
        WHEN [Importo] LIKE ''%,%''
            THEN TRY_CONVERT(decimal(19,4), REPLACE([Importo], '','', ''.''))
        ELSE TRY_CONVERT(decimal(19,4), [Importo])
    END AS importo,
    LEFT(NULLIF(LTRIM(RTRIM([Causale])), ''''), 50),
    NULLIF(LTRIM(RTRIM([Descrizione])), ''''),
    LEFT(NULLIF(LTRIM(RTRIM([IBAN Controparte])), ''''), 34),
    LEFT(NULLIF(LTRIM(RTRIM([Nome Controparte])), ''''), 300),
    LEFT(NULLIF(LTRIM(RTRIM([Riferimento])), ''''), 200),
    @batch,
    ''UNMATCHED'',
    GETDATE()
FROM ' + @safeQ + N'
WHERE NULLIF(LTRIM(RTRIM([Data Operazione])), '''') IS NOT NULL
  AND NULLIF(LTRIM(RTRIM([Importo])), '''') IS NOT NULL;
';

        EXEC sp_executesql @sql,
            N'@banca_id INT, @batch NVARCHAR(50)',
            @banca_id = @banca_id, @batch = @batch;
    END
    ELSE
    BEGIN
        RAISERROR('Nome tabella temp non valido: %s', 16, 1, @TableName);
        RETURN;
    END

    DECLARE @inserted INT;
    SELECT @inserted = COUNT(*) FROM dbo.movimenti_bancari WHERE import_batch_id = @batch;

    SELECT
        @inserted   AS rows_imported,
        @batch      AS batch_id,
        @banca_id   AS banca_id,
        @RowCount   AS rows_in_temp,
        @UserId     AS user_id;
END
GO

PRINT 'Stored sp_movimenti_bancari_import creata.';
GO

/* ============================================================
   2) Toggle import/export per 7 anagrafiche standard + propsbag
   ============================================================ */
USE FatturazioneElettronica_Metadata;
GO

DECLARE @import_propsbag NVARCHAR(MAX) = N'{
  "import": {
    "enabled": true,
    "skipsettings": false,
    "allowedExtensions": ["xls","xlsx"],
    "import_type": "I",
    "commit_level": "R",
    "use_column_captions": "C",
    "use_descriptive_fkey": true,
    "separator": ";"
  }
}';

UPDATE dbo._metadati__tabelle
SET mdimportable    = 1,
    mdhideexportxls = 0,
    mdhideexportpdf = 0,
    mdpropsbag      = @import_propsbag
WHERE mdroutename IN ('clienti','fornitori','prodotti','banche','pagamenti','codici_iva','unita_misura');

PRINT '7 anagrafiche: import/export abilitati.';

/* ============================================================
   3) Action tabella md_action_type=10 (upload) su movimenti_bancari
   ============================================================ */
DECLARE @md_movimenti INT;
SELECT @md_movimenti = md_id FROM dbo._metadati__tabelle WHERE mdroutename = 'movimenti_bancari';

IF @md_movimenti IS NULL
BEGIN
    RAISERROR('Route movimenti_bancari non trovata.', 16, 1);
    RETURN;
END

-- Habilita anche export std su movimenti_bancari (utile per controllo)
UPDATE dbo._metadati__tabelle
SET mdhideexportxls = 0, mdhideexportpdf = 0
WHERE md_id = @md_movimenti;

DECLARE @next_act INT = (SELECT ISNULL(MAX(id1), 0) FROM dbo._mtdt__cstom__actions__tabelle);

IF NOT EXISTS (SELECT 1 FROM dbo._mtdt__cstom__actions__tabelle
               WHERE mdid = @md_movimenti AND buttoncaption = N'Importa movimenti')
BEGIN
    SET @next_act = @next_act + 1;
    INSERT INTO dbo._mtdt__cstom__actions__tabelle
        (id1, mdid, buttoncaption, buttonimage, ordine1, md_action_type, actioncallback)
    VALUES (
        @next_act, @md_movimenti, N'Importa movimenti', N'pi pi-upload', 1,
        10, -- md_action_type=10 = upload
        N'// md_action_type=10 upload: dump Excel/CSV su tabella temp + chiamata stored
//
// Schema Excel atteso (header obbligatorio nella prima riga):
//   Data Operazione | Data Valuta | Importo | Causale | Descrizione |
//   IBAN Controparte | Nome Controparte | Riferimento
//
// Esempi:
//   2026-05-04 | 2026-05-05 | 122,00  | BONIFICO  | Pagamento fattura 1/2026 | IT60X... | Cliente Test SRL | F1/2026
//   2026-05-06 |            | -50,00  | ADDEBITO  | Commissioni bancarie     |          |                  |
//
// Note: importo positivo = accredito (incasso), negativo = addebito (uscita).
// Date accettate: dd/MM/yyyy (IT) o yyyy-MM-dd (ISO).
// Importo: virgola IT (1.234,56) o punto EN (1234.56).
const result = await wtoolbox.uploadDialog({
  target_table: ''mov_bancari_imp_tmp'',
  stored_name:  ''dbo.sp_movimenti_bancari_import'',
  mode:         ''replace'',
  title:        ''Importa movimenti bancari'',
  routeName:    datasource?.metaInfo?.tableMetadata?.md_route_name || ''movimenti_bancari''
});
if (!result) return;
wtoolbox.messageNotificationService.add({
    severity: ''success'',
    summary: ''Import movimenti'',
    detail: result.message || ''Movimenti importati.''
});
if (typeof datasource.refresh === ''function'') {
    try { await datasource.refresh(); } catch(_) {}
}'
    );
END

PRINT 'Action "Importa movimenti" (md_action_type=10) inserita su movimenti_bancari.';

/* ============================================================
   4) Verifica
   ============================================================ */
SELECT 'IMPORT/EXPORT FLAGS' AS section, mdroutename AS route,
       mdimportable AS importable, mdhideexportxls AS hide_xls,
       mdhideexportpdf AS hide_pdf,
       CASE WHEN mdpropsbag IS NULL THEN 0 ELSE 1 END AS has_propsbag
FROM dbo._metadati__tabelle
WHERE mdroutename IN ('clienti','fornitori','prodotti','banche','pagamenti','codici_iva','unita_misura','movimenti_bancari')
ORDER BY mdroutename;

SELECT 'UPLOAD ACTION' AS section, t.mdroutename AS route,
       a.buttoncaption AS label, a.md_action_type AS atype,
       a.buttonimage AS icon
FROM dbo._mtdt__cstom__actions__tabelle a
JOIN dbo._metadati__tabelle t ON t.md_id = a.mdid
WHERE t.mdroutename = 'movimenti_bancari';
GO
