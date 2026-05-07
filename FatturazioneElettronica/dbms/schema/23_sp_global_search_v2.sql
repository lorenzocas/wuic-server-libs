-- ====================================================================
-- 23_sp_global_search_v2.sql  (DB Dati: FatturazioneElettronica_Data)
-- ====================================================================
-- Workflow #12 (rev 2): Search globale cross-route — versione full-text-like.
--
-- Differenze rispetto a `15_sp_global_search.sql`:
--   - Cerca in TUTTI i campi testo significativi delle anagrafiche/documenti
--   - Aggiunte entita' fatture_ricevute e prodotti (mancavano in v1)
--   - Score ranking pesato:
--       100  match esatto codice o numero documento
--       80   match in ragione_sociale / oggetto / descrizione (campo "primario")
--       70   match in causale, oggetto, partita_iva, codice_fiscale
--       55   match in email, pec, telefono, sito_web, IBAN, codice_destinatario
--       40   match in indirizzo / citta / provincia / nazione / note (campo "free text")
--   - Risposta: top @top per entita', poi globale ordinato per score DESC
--
-- Backwards-compatible: stessa signature/result-set di v1 → no breaking changes
-- per il client.
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_global_search', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_global_search;
GO

CREATE PROCEDURE dbo.sp_global_search
    @q   NVARCHAR(200),
    @top INT = 5
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @qLike NVARCHAR(202) = N'%' + ISNULL(@q, '') + N'%';
    IF LEN(ISNULL(@q,'')) < 2 RETURN;

    DECLARE @results TABLE (
        entity_type NVARCHAR(40), id INT, primary_label NVARCHAR(500),
        secondary_label NVARCHAR(500), route NVARCHAR(100), score INT
    );

    -- ─────────────── CLIENTI ───────────────
    -- Match in: codice, ragione_sociale, partita_iva, codice_fiscale,
    --           email, pec, telefono, sito_web, citta, provincia, nazione,
    --           indirizzo, codice_destinatario, note
    INSERT INTO @results
    SELECT TOP (@top) 'cliente', id, ragione_sociale,
        ISNULL(codice + N' • ' + ISNULL(partita_iva, N''), codice),
        'clienti',
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN ragione_sociale LIKE @qLike                       THEN 80
            WHEN partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike THEN 70
            WHEN email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
                 OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike THEN 55
            ELSE 40
        END
    FROM dbo.clienti
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR ragione_sociale LIKE @qLike
        OR partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike
        OR email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
        OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike
        OR citta LIKE @qLike OR provincia LIKE @qLike OR nazione LIKE @qLike
        OR indirizzo LIKE @qLike OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN ragione_sociale LIKE @qLike                       THEN 80
            WHEN partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike THEN 70
            WHEN email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
                 OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── FORNITORI ───────────────
    -- Stesso ranking di clienti + IBAN
    INSERT INTO @results
    SELECT TOP (@top) 'fornitore', id, ragione_sociale,
        ISNULL(codice + N' • ' + ISNULL(partita_iva, N''), codice),
        'fornitori',
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN ragione_sociale LIKE @qLike                       THEN 80
            WHEN partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike THEN 70
            WHEN email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
                 OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike
                 OR iban LIKE @qLike THEN 55
            ELSE 40
        END
    FROM dbo.fornitori
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR ragione_sociale LIKE @qLike
        OR partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike
        OR email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
        OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike
        OR iban LIKE @qLike OR citta LIKE @qLike OR provincia LIKE @qLike
        OR nazione LIKE @qLike OR indirizzo LIKE @qLike OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN ragione_sociale LIKE @qLike                       THEN 80
            WHEN partita_iva LIKE @qLike OR codice_fiscale LIKE @qLike THEN 70
            WHEN email LIKE @qLike OR pec LIKE @qLike OR telefono LIKE @qLike
                 OR sito_web LIKE @qLike OR codice_destinatario LIKE @qLike
                 OR iban LIKE @qLike THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── FATTURE INVIATE ───────────────
    -- Match in: numero, serie, causale, riferimento_ordine, stato, sdi_id, note
    INSERT INTO @results
    SELECT TOP (@top) 'fattura_inviata', f.id,
        ISNULL(f.numero, N'#' + CAST(f.id AS NVARCHAR(20))),
        ISNULL(c.ragione_sociale, N'') + N' • ' + ISNULL(f.causale, N''),
        'fatture_inviate',
        CASE
            WHEN f.numero LIKE @qLike OR f.sdi_id LIKE @qLike      THEN 100
            WHEN f.causale LIKE @qLike OR f.riferimento_ordine LIKE @qLike THEN 70
            WHEN f.stato LIKE @qLike OR f.serie LIKE @qLike        THEN 55
            ELSE 40
        END
    FROM dbo.fatture_inviate f
    LEFT JOIN dbo.clienti c ON c.id = f.cliente_id
    WHERE ISNULL(f.cancellato,0)=0
      AND (f.numero LIKE @qLike OR f.serie LIKE @qLike OR f.causale LIKE @qLike
        OR f.riferimento_ordine LIKE @qLike OR f.stato LIKE @qLike
        OR f.sdi_id LIKE @qLike OR f.note LIKE @qLike)
    ORDER BY
        CASE
            WHEN f.numero LIKE @qLike OR f.sdi_id LIKE @qLike      THEN 100
            WHEN f.causale LIKE @qLike OR f.riferimento_ordine LIKE @qLike THEN 70
            WHEN f.stato LIKE @qLike OR f.serie LIKE @qLike        THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── FATTURE RICEVUTE (NUOVO) ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'fattura_ricevuta', f.id,
        ISNULL(f.numero_fornitore, N'#' + CAST(f.id AS NVARCHAR(20))),
        ISNULL(fo.ragione_sociale, N'') + N' • ' + ISNULL(f.causale, N''),
        'fatture_ricevute',
        CASE
            WHEN f.numero_fornitore LIKE @qLike                    THEN 100
            WHEN f.causale LIKE @qLike                             THEN 70
            WHEN f.stato LIKE @qLike                               THEN 55
            ELSE 40
        END
    FROM dbo.fatture_ricevute f
    LEFT JOIN dbo.fornitori fo ON fo.id = f.fornitore_id
    WHERE ISNULL(f.cancellato,0)=0
      AND (f.numero_fornitore LIKE @qLike OR f.causale LIKE @qLike
        OR f.stato LIKE @qLike OR f.note LIKE @qLike)
    ORDER BY
        CASE
            WHEN f.numero_fornitore LIKE @qLike                    THEN 100
            WHEN f.causale LIKE @qLike                             THEN 70
            WHEN f.stato LIKE @qLike                               THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── PREVENTIVI ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'preventivo', p.id,
        ISNULL(p.numero, N'#' + CAST(p.id AS NVARCHAR(20))),
        ISNULL(c.ragione_sociale, N'') + N' • ' + ISNULL(p.oggetto, N''),
        'preventivi',
        CASE
            WHEN p.numero LIKE @qLike                              THEN 100
            WHEN p.oggetto LIKE @qLike                             THEN 80
            WHEN p.stato LIKE @qLike                               THEN 55
            ELSE 40
        END
    FROM dbo.preventivi p
    LEFT JOIN dbo.clienti c ON c.id = p.cliente_id
    WHERE ISNULL(p.cancellato,0)=0
      AND (p.numero LIKE @qLike OR p.oggetto LIKE @qLike
        OR p.stato LIKE @qLike OR p.note LIKE @qLike)
    ORDER BY
        CASE
            WHEN p.numero LIKE @qLike                              THEN 100
            WHEN p.oggetto LIKE @qLike                             THEN 80
            WHEN p.stato LIKE @qLike                               THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── PRODOTTI (NUOVO) ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'prodotto', id, descrizione,
        ISNULL(codice + N' • ' + ISNULL(categoria, N''), codice),
        'prodotti',
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            WHEN categoria LIKE @qLike OR tipo LIKE @qLike         THEN 55
            ELSE 40
        END
    FROM dbo.prodotti
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR descrizione LIKE @qLike
        OR categoria LIKE @qLike OR tipo LIKE @qLike OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            WHEN categoria LIKE @qLike OR tipo LIKE @qLike         THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── PAGAMENTI (anagrafica supporto) ───────────────
    -- Usata per "Bonifico", "RIBA", "PagoPA" ecc. in fatture/scadenze
    INSERT INTO @results
    SELECT TOP (@top) 'pagamento', id, descrizione,
        ISNULL(N'cod. ' + codice_sdi + N' • ' + CAST(giorni_scadenza AS NVARCHAR(10)) + N' gg', N'cod. ' + ISNULL(codice_sdi, N'')),
        'pagamenti',
        CASE
            WHEN codice_sdi LIKE @qLike                            THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            ELSE 40
        END
    FROM dbo.pagamenti
    WHERE ISNULL(cancellato,0)=0
      AND (codice_sdi LIKE @qLike OR descrizione LIKE @qLike OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice_sdi LIKE @qLike                            THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            ELSE 40
        END DESC;

    -- ─────────────── BANCHE ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'banca', id,
        ISNULL(nome_banca, descrizione),
        ISNULL(intestatario + N' • ' + ISNULL(iban, N''), ISNULL(iban, N'')),
        'banche',
        CASE
            WHEN iban LIKE @qLike OR bic_swift LIKE @qLike         THEN 100
            WHEN nome_banca LIKE @qLike OR descrizione LIKE @qLike THEN 80
            WHEN intestatario LIKE @qLike                          THEN 70
            WHEN abi LIKE @qLike OR cab LIKE @qLike                THEN 55
            ELSE 40
        END
    FROM dbo.banche
    WHERE ISNULL(cancellato,0)=0
      AND (iban LIKE @qLike OR bic_swift LIKE @qLike
        OR nome_banca LIKE @qLike OR descrizione LIKE @qLike
        OR intestatario LIKE @qLike OR abi LIKE @qLike OR cab LIKE @qLike
        OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN iban LIKE @qLike OR bic_swift LIKE @qLike         THEN 100
            WHEN nome_banca LIKE @qLike OR descrizione LIKE @qLike THEN 80
            WHEN intestatario LIKE @qLike                          THEN 70
            WHEN abi LIKE @qLike OR cab LIKE @qLike                THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── CODICI IVA ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'codice_iva', id, descrizione,
        N'cod. ' + codice + N' • ' + CAST(aliquota AS NVARCHAR(20)) + N'%',
        'codici_iva',
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            WHEN natura_sdi LIKE @qLike                            THEN 55
            ELSE 40
        END
    FROM dbo.codici_iva
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR descrizione LIKE @qLike
        OR natura_sdi LIKE @qLike OR note LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            WHEN natura_sdi LIKE @qLike                            THEN 55
            ELSE 40
        END DESC;

    -- ─────────────── UNITA MISURA ───────────────
    INSERT INTO @results
    SELECT TOP (@top) 'unita_misura', id, descrizione,
        N'cod. ' + codice,
        'unita_misura',
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            ELSE 40
        END
    FROM dbo.unita_misura
    WHERE ISNULL(cancellato,0)=0
      AND (codice LIKE @qLike OR descrizione LIKE @qLike)
    ORDER BY
        CASE
            WHEN codice LIKE @qLike                                THEN 100
            WHEN descrizione LIKE @qLike                           THEN 80
            ELSE 40
        END DESC;

    SELECT entity_type, id, primary_label, secondary_label, route, score
    FROM @results
    ORDER BY score DESC, entity_type;
END;
GO

PRINT 'sp_global_search v2 creata (search full-text-like su tutti i campi).';
GO
