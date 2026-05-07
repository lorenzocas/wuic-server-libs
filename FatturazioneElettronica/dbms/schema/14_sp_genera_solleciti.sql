-- ====================================================================
-- 14_sp_genera_solleciti.sql
-- ====================================================================
-- Workflow #11: solleciti automatici scadenze SCADUTA.
--
-- Stored procedure: sp_genera_solleciti_scadenze
--   - scansiona dbo.scadenze WHERE stato='SCADUTA' OR (stato='APERTA' AND data_scadenza < GETDATE())
--   - per ogni scadenza non ancora sollecitata negli ultimi @giorni_min_dal_ultimo_sollecito giorni
--   - inserisce record in dbo.email_log con status='PENDING' e body templatizzato
--   - ritorna count solleciti generati
--
-- Idempotency: dedupe via flag email_log con subject = "Sollecito #{scadenza_id}"
--
-- Trigger: invocata dallo scheduler (livello 3 framework via dom_scheduler)
-- oppure manualmente via custom action.
-- ====================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_genera_solleciti_scadenze', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_genera_solleciti_scadenze;
GO

CREATE PROCEDURE dbo.sp_genera_solleciti_scadenze
    @giorni_min_dal_ultimo_sollecito INT = 7,
    @numero_solleciti_generati INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @oggi DATE = CAST(GETDATE() AS DATE);

    -- Inserisci 1 email_log per ogni scadenza scaduta non ancora sollecitata di recente
    INSERT INTO dbo.email_log (
        fattura_id, recipient_to, subject, body, status, created_at
    )
    SELECT
        s.fattura_inviata_id,
        ISNULL(c.email, ISNULL(c.pec, '')) AS recipient_to,
        N'Sollecito pagamento scadenza #' + CAST(s.id AS NVARCHAR(20))
            + N' del ' + CONVERT(NVARCHAR(10), s.data_scadenza, 103),
        N'Gentile ' + ISNULL(c.ragione_sociale, '') + N',' + CHAR(13) + CHAR(10)
            + N'risulta ancora aperto il pagamento di ' + FORMAT(s.importo - ISNULL(s.importo_pagato,0), N'C2', 'it-IT')
            + N' relativo alla scadenza del ' + CONVERT(NVARCHAR(10), s.data_scadenza, 103) + N'.' + CHAR(13) + CHAR(10)
            + N'La preghiamo di provvedere al saldo alla brevita''.' + CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10)
            + N'Cordiali saluti.',
        N'PENDING',
        GETDATE()
    FROM dbo.scadenze s
    JOIN dbo.clienti c ON c.id = s.cliente_id
    WHERE ISNULL(s.cancellato, 0) = 0
      AND s.cliente_id IS NOT NULL
      AND s.tipo = 'INCASSO'
      AND (s.stato = 'SCADUTA'
           OR (s.stato = 'APERTA' AND s.data_scadenza < @oggi))
      AND s.importo > ISNULL(s.importo_pagato, 0)
      -- Idempotency: skip se sollecito gia' inserito negli ultimi N giorni
      AND NOT EXISTS (
          SELECT 1 FROM dbo.email_log el
          WHERE el.subject LIKE N'Sollecito pagamento scadenza #' + CAST(s.id AS NVARCHAR(20)) + '%'
            AND el.created_at >= DATEADD(DAY, -@giorni_min_dal_ultimo_sollecito, GETDATE())
      );

    SET @numero_solleciti_generati = @@ROWCOUNT;

    -- Aggiorna stato scadenza: APERTA con data_scadenza < oggi → SCADUTA
    UPDATE dbo.scadenze
    SET stato = 'SCADUTA'
    WHERE stato = 'APERTA'
      AND data_scadenza < @oggi
      AND ISNULL(cancellato, 0) = 0;
END;
GO

PRINT 'Stored procedure sp_genera_solleciti_scadenze creata.';
GO
