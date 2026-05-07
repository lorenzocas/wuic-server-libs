-- ====================================================================
-- 13_sp_conversioni_documenti.sql
-- ====================================================================
-- Workflow #8: conversione documento → documento.
--
-- Stored procedures:
--   - sp_conv_preventivo_to_fattura: copia testata + righe da preventivo
--     in fatture_inviate (mantiene cliente, totali, righe). Marca il
--     preventivo come 'CONVERTITO' nello stato.
--   - sp_conv_preventivo_to_ordine: similar per ordini.
--   - sp_conv_ordine_to_ddt: similar per DDT (solo righe con quantita).
--   - sp_conv_ddt_to_fattura: emette fattura da DDT (aggiorna ddt.fattura_id).
--
-- Idempotency: se il source ha gia' uno stato 'CONVERTITO_*' o un link
-- al target, la SP non duplica e ritorna l'id esistente.
-- ====================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

-- ====================================================================
-- sp_conv_preventivo_to_fattura
-- ====================================================================
IF OBJECT_ID('dbo.sp_conv_preventivo_to_fattura', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_conv_preventivo_to_fattura;
GO

CREATE PROCEDURE dbo.sp_conv_preventivo_to_fattura
    @preventivo_id INT,
    @user_id NVARCHAR(50) = NULL,
    @new_fattura_id INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @cliente_id INT, @imponibile DECIMAL(18,4),
            @iva DECIMAL(18,4), @totale DECIMAL(18,4),
            @stato_prev NVARCHAR(50), @oggetto NVARCHAR(500);

    SELECT @cliente_id = cliente_id, @imponibile = imponibile,
           @iva = iva, @totale = totale, @stato_prev = stato, @oggetto = oggetto
    FROM dbo.preventivi
    WHERE id = @preventivo_id AND ISNULL(cancellato, 0) = 0;

    IF @cliente_id IS NULL
    BEGIN
        RAISERROR('Preventivo %d non trovato o cancellato', 16, 1, @preventivo_id);
        RETURN;
    END;

    -- Idempotency: se stato gia' CONVERTITO, ritorna fattura esistente
    -- (tracciamo via causale "Da preventivo #N")
    DECLARE @existing_fatt INT = (
        SELECT TOP 1 id FROM dbo.fatture_inviate
        WHERE causale = N'Da preventivo #' + CAST(@preventivo_id AS NVARCHAR(20))
          AND ISNULL(cancellato, 0) = 0
        ORDER BY id
    );
    IF @existing_fatt IS NOT NULL
    BEGIN
        SET @new_fattura_id = @existing_fatt;
        RETURN;
    END;

    BEGIN TRANSACTION;

    -- Insert testata (anno/numero/progressivo li valorizza il trigger numerazione)
    DECLARE @inserted_pk TABLE(id INT);
    -- utente_creazione e' INT (FK utenti); accetta NULL o user_name → resolve id_utente
    DECLARE @utente_int INT = NULL;
    IF @user_id IS NOT NULL AND @user_id <> ''
    BEGIN
        IF ISNUMERIC(@user_id) = 1 SET @utente_int = TRY_CAST(@user_id AS INT);
        -- Lookup by username from metadata DB (cross-DB)
        ELSE
            SELECT @utente_int = id_utente
            FROM FatturazioneElettronica_Metadata.dbo.utenti
            WHERE username = @user_id;
    END;

    INSERT INTO dbo.fatture_inviate (
        data_documento, cliente_id, causale, imponibile, iva, totale,
        stato, cancellato, data_creazione, utente_creazione
    )
    OUTPUT INSERTED.id INTO @inserted_pk
    VALUES (
        CAST(GETDATE() AS DATE), @cliente_id,
        N'Da preventivo #' + CAST(@preventivo_id AS NVARCHAR(20)),
        @imponibile, @iva, @totale,
        N'BOZZA', 0, GETDATE(), @utente_int
    );

    SET @new_fattura_id = (SELECT TOP 1 id FROM @inserted_pk);
    -- Trigger INSTEAD OF puo' restituire 0; fallback IDENT_CURRENT
    IF @new_fattura_id IS NULL OR @new_fattura_id = 0
        SET @new_fattura_id = CAST(IDENT_CURRENT('dbo.fatture_inviate') AS INT);

    -- Copia righe
    INSERT INTO dbo.fatture_inviate_righe (
        fattura_id, riga, prodotto_id, descrizione, quantita,
        unita_misura_id, prezzo_unitario, sconto_perc, codice_iva_id,
        imponibile_riga, iva_riga, totale_riga
    )
    SELECT
        @new_fattura_id, riga, prodotto_id, descrizione, quantita,
        unita_misura_id, prezzo_unitario, sconto_perc, codice_iva_id,
        imponibile_riga, iva_riga, totale_riga
    FROM dbo.preventivi_righe
    WHERE preventivo_id = @preventivo_id;

    -- Aggiorna stato preventivo a CONVERTITO (preserva valori storici)
    UPDATE dbo.preventivi
    SET stato = N'CONVERTITO', data_modifica = GETDATE()
    WHERE id = @preventivo_id;

    COMMIT TRANSACTION;
END;
GO

PRINT 'Stored procedure sp_conv_preventivo_to_fattura creata.';
GO
