-- ====================================================================
-- 16_sp_marca_scadenze_pagate.sql
-- ====================================================================
-- Workflow #14: bulk action "Marca pagate" su scadenze.
--
-- SP `sp_marca_scadenze_pagate(@ids_csv NVARCHAR(MAX), @aggiornate INT OUTPUT)`
--   - parsing CSV degli id scadenze (es. "12,34,56")
--   - per ogni scadenza non cancellata: stato='PAGATA', importo_pagato=importo,
--     data_pagamento=GETDATE() se non gia' settata
-- ====================================================================
SET ANSI_NULLS ON; SET ANSI_PADDING ON; SET ANSI_WARNINGS ON;
SET ARITHABORT ON; SET CONCAT_NULL_YIELDS_NULL ON; SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_marca_scadenze_pagate', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_marca_scadenze_pagate;
GO

CREATE PROCEDURE dbo.sp_marca_scadenze_pagate
    @ids_csv NVARCHAR(MAX),
    @aggiornate INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @aggiornate = 0;
    IF @ids_csv IS NULL OR LEN(@ids_csv) = 0 RETURN;

    DECLARE @ids TABLE (id INT);
    INSERT INTO @ids (id)
    SELECT TRY_CAST(LTRIM(RTRIM(value)) AS INT)
    FROM STRING_SPLIT(@ids_csv, ',')
    WHERE TRY_CAST(LTRIM(RTRIM(value)) AS INT) IS NOT NULL;

    UPDATE s
    SET stato = 'PAGATA',
        importo_pagato = s.importo,
        data_pagamento = ISNULL(s.data_pagamento, CAST(GETDATE() AS DATE))
    FROM dbo.scadenze s
    JOIN @ids i ON i.id = s.id
    WHERE ISNULL(s.cancellato, 0) = 0
      AND s.stato <> 'PAGATA';

    SET @aggiornate = @@ROWCOUNT;
END;
GO

PRINT 'sp_marca_scadenze_pagate creata.';
GO
