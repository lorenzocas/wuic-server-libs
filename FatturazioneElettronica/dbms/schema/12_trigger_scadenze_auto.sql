-- ====================================================================
-- 12_trigger_scadenze_auto.sql
-- ====================================================================
-- Workflow #9: pagamenti rateali automatici.
--
-- Quando una `fatture_inviate` viene insertata o aggiornata e ha:
--   - totale > 0
--   - pagamento_id NOT NULL
--   - cliente_id NOT NULL
--   - non ha gia' scadenze auto-generate
-- il trigger genera N scadenze (uno per rata) basandosi sulla config
-- del pagamento (n_rate, giorni_scadenza, tipo_scadenza DF/FM).
--
-- Idempotenza: marker `note = 'AUTO_GENERATED'` sulla scadenza.
-- Se l'utente cancella la scadenza auto e ricalcola, basta UPDATE
-- dummy della fattura (es. SET totale = totale).
-- ====================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.tr_fatture_inviate_scadenze_auto', 'TR') IS NOT NULL
    DROP TRIGGER dbo.tr_fatture_inviate_scadenze_auto;
GO

CREATE TRIGGER dbo.tr_fatture_inviate_scadenze_auto
ON dbo.fatture_inviate
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    -- Solo se totale o pagamento_id sono cambiati (evita loop su altri campi)
    IF NOT UPDATE(totale) AND NOT UPDATE(pagamento_id) AND NOT UPDATE(data_documento)
        RETURN;

    -- Estrai fatture candidate: totale > 0, pagamento_id valorizzato,
    -- senza scadenze AUTO_GENERATED gia' presenti
    DECLARE @candidates TABLE (
        fattura_id INT,
        cliente_id INT,
        data_documento DATE,
        totale DECIMAL(18,4),
        pagamento_id INT
    );

    INSERT INTO @candidates
    SELECT i.id, i.cliente_id, i.data_documento, i.totale, i.pagamento_id
    FROM inserted i
    WHERE i.totale > 0
      AND i.pagamento_id IS NOT NULL
      AND i.cliente_id IS NOT NULL
      AND ISNULL(i.cancellato, 0) = 0
      AND NOT EXISTS (
          SELECT 1 FROM dbo.scadenze s
          WHERE s.fattura_inviata_id = i.id
            AND s.note = N'AUTO_GENERATED'
            AND ISNULL(s.cancellato, 0) = 0
      );

    IF NOT EXISTS (SELECT 1 FROM @candidates) RETURN;

    -- Per ogni fattura candidata, genera N scadenze
    DECLARE @fattura_id INT, @cliente_id INT, @data_doc DATE,
            @totale DECIMAL(18,4), @pagamento_id INT;
    DECLARE @n_rate INT, @giorni INT, @tipo NVARCHAR(2);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT fattura_id, cliente_id, data_documento, totale, pagamento_id
        FROM @candidates;

    OPEN cur;
    FETCH NEXT FROM cur INTO @fattura_id, @cliente_id, @data_doc, @totale, @pagamento_id;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @n_rate = ISNULL(n_rate, 1),
               @giorni = ISNULL(giorni_scadenza, 0),
               @tipo   = ISNULL(tipo_scadenza, 'DF')
        FROM dbo.pagamenti
        WHERE id = @pagamento_id;

        IF @n_rate IS NULL OR @n_rate < 1 SET @n_rate = 1;

        DECLARE @rata INT = 1;
        DECLARE @importo_rata DECIMAL(18,4) = ROUND(@totale / @n_rate, 2);
        DECLARE @residuo DECIMAL(18,4) = @totale - (@importo_rata * @n_rate);

        WHILE @rata <= @n_rate
        BEGIN
            DECLARE @scad_data DATE;
            DECLARE @offset_days INT = @giorni + ((@rata - 1) * 30);

            IF @tipo = 'FM'
                SET @scad_data = DATEADD(day, @offset_days,
                                         EOMONTH(@data_doc));
            ELSE
                SET @scad_data = DATEADD(day, @offset_days, @data_doc);

            -- Ultima rata assorbe il residuo di arrotondamento
            DECLARE @imp_corr DECIMAL(18,4) = @importo_rata;
            IF @rata = @n_rate AND @residuo <> 0
                SET @imp_corr = @importo_rata + @residuo;

            INSERT INTO dbo.scadenze (
                tipo, fattura_inviata_id, cliente_id,
                data_scadenza, importo, importo_pagato, stato,
                rata_n, rata_totale, note,
                cancellato, data_creazione
            )
            VALUES (
                'INCASSO', @fattura_id, @cliente_id,
                @scad_data, @imp_corr, 0, 'APERTA',
                @rata, @n_rate, N'AUTO_GENERATED',
                0, GETDATE()
            );

            SET @rata = @rata + 1;
        END;

        FETCH NEXT FROM cur INTO @fattura_id, @cliente_id, @data_doc, @totale, @pagamento_id;
    END;

    CLOSE cur;
    DEALLOCATE cur;
END;
GO

PRINT 'Trigger dbo.tr_fatture_inviate_scadenze_auto creato.';
GO
