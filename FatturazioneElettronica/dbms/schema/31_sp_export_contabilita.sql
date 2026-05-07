-- ====================================================================
-- 31_sp_export_contabilita.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #22 (Block 5): Export prima nota per software contabili.
--
-- Genera un flat file pipe-delimited (formato standard Primanota italiano)
-- con tutte le fatture vendita+acquisto del periodo richiesto.
-- Il file e' importabile in Profis/Zucchetti/Wolters Kluwer.
--
-- Format righe (16 campi separati da '|'):
--   TIPO|DATA|NUMERO|CODICE_CTP|RAGSOC_CTP|PIVA_CTP|CF_CTP|
--   CAUSALE|IMPONIBILE|IVA|TOTALE|COD_IVA|MODPAG|BANCA|NOTE|RIF_DOC
--
-- TIPO: 'V' = Vendita (fattura emessa), 'A' = Acquisto (fattura ricevuta)
-- CAUSALE: 'VEN' (vendita) / 'ACQ' (acquisto)
-- DATA: YYYYMMDD
-- Importi: 2 decimali, '.' come separatore
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE FatturazioneElettronica_Data;
GO

IF OBJECT_ID('dbo.sp_export_contabilita_primanota', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_export_contabilita_primanota;
GO

CREATE PROCEDURE dbo.sp_export_contabilita_primanota
    @anno INT = NULL,    -- default: anno corrente
    @mese INT = NULL,    -- default: mese corrente; 0 = tutto l'anno
    @tipo NVARCHAR(20) = 'TUTTI'  -- 'VENDITE' | 'ACQUISTI' | 'TUTTI'
AS
BEGIN
    SET NOCOUNT ON;

    IF @anno IS NULL SET @anno = YEAR(GETDATE());
    IF @mese IS NULL SET @mese = MONTH(GETDATE());

    DECLARE @dal DATE, @al DATE;
    IF @mese = 0
    BEGIN
        SET @dal = DATEFROMPARTS(@anno, 1, 1);
        SET @al  = DATEFROMPARTS(@anno, 12, 31);
    END
    ELSE
    BEGIN
        SET @dal = DATEFROMPARTS(@anno, @mese, 1);
        SET @al  = EOMONTH(@dal);
    END

    -- Output flat-file in singola colonna `riga` per facile streaming
    -- 1) Header
    SELECT 'TIPO|DATA|NUMERO|CODICE_CTP|RAGSOC_CTP|PIVA_CTP|CF_CTP|CAUSALE|IMPONIBILE|IVA|TOTALE|COD_IVA|MODPAG|BANCA|NOTE|RIF_DOC' AS riga, 0 AS ordine

    -- 2) Vendite (fatture inviate)
    UNION ALL
    SELECT
        'V' + '|' +
        CONVERT(NVARCHAR(8), f.data_documento, 112) + '|' +
        ISNULL(f.numero, CAST(f.id AS NVARCHAR)) + '|' +
        ISNULL(c.codice, '') + '|' +
        ISNULL(REPLACE(c.ragione_sociale, '|', ' '), '') + '|' +
        ISNULL(c.partita_iva, '') + '|' +
        ISNULL(c.codice_fiscale, '') + '|' +
        'VEN' + '|' +
        FORMAT(ISNULL(f.imponibile, 0), '0.00', 'en-US') + '|' +
        FORMAT(ISNULL(f.iva, 0),        '0.00', 'en-US') + '|' +
        FORMAT(ISNULL(f.totale, 0),     '0.00', 'en-US') + '|' +
        '22' + '|' +  -- TODO: aliquota da tabella codici_iva (per ora default 22)
        ISNULL(p.codice_sdi, '') + '|' +
        ISNULL(b.descrizione, '') + '|' +
        ISNULL(REPLACE(f.causale, '|', ' '), '') + '|' +
        '' AS riga,
        1 AS ordine
    FROM dbo.fatture_inviate f
    INNER JOIN dbo.clienti c ON c.id = f.cliente_id
    LEFT JOIN dbo.pagamenti p ON p.id = f.pagamento_id
    LEFT JOIN dbo.banche b ON b.id = f.banca_id
    WHERE ISNULL(f.cancellato, 0) = 0
      AND f.data_documento BETWEEN @dal AND @al
      AND (@tipo IN ('VENDITE', 'TUTTI'))

    UNION ALL
    -- 3) Acquisti (fatture ricevute)
    SELECT
        'A' + '|' +
        CONVERT(NVARCHAR(8), fr.data_documento, 112) + '|' +
        ISNULL(fr.numero_fornitore, CAST(fr.id AS NVARCHAR)) + '|' +
        ISNULL(fo.codice, '') + '|' +
        ISNULL(REPLACE(fo.ragione_sociale, '|', ' '), '') + '|' +
        ISNULL(fo.partita_iva, '') + '|' +
        ISNULL(fo.codice_fiscale, '') + '|' +
        'ACQ' + '|' +
        FORMAT(ISNULL(fr.imponibile, 0), '0.00', 'en-US') + '|' +
        FORMAT(ISNULL(fr.iva, 0),        '0.00', 'en-US') + '|' +
        FORMAT(ISNULL(fr.totale, 0),     '0.00', 'en-US') + '|' +
        '22' + '|' +
        ISNULL(p.codice_sdi, '') + '|' +
        '' + '|' +  -- banca su fattura ricevuta non standard
        ISNULL(REPLACE(fr.causale, '|', ' '), '') + '|' +
        '' AS riga,
        2 AS ordine
    FROM dbo.fatture_ricevute fr
    INNER JOIN dbo.fornitori fo ON fo.id = fr.fornitore_id
    LEFT JOIN dbo.pagamenti p ON p.id = fr.pagamento_id
    WHERE fr.data_documento BETWEEN @dal AND @al
      AND (@tipo IN ('ACQUISTI', 'TUTTI'))

    ORDER BY ordine, riga;
END
GO

PRINT 'sp_export_contabilita_primanota creata.';
GO
