-- ====================================================================
-- 2026-05-08-sp-calcola-scadenze.sql
-- ====================================================================
-- Stored procedure `sp_calcola_scadenze`: dato un `pagamento_id`, una
-- `data_documento`, un `totale` e una `controparte` (cliente_id o
-- fornitore_id), CALCOLA le N rate di scadenza (n_rate del pagamento)
-- e le RITORNA come result set — NON modifica il DB.
--
-- Differenza dal trigger `tr_fatture_inviate_scadenze_auto` (file
-- `12_trigger_scadenze_auto.sql`):
--  - il trigger fired AFTER INSERT/UPDATE su fatture_inviate -> persiste
--    le scadenze nel DB
--  - questa SP e' chiamata dal CLIENT (custom edit form) PRIMA del save
--    per ottenere un'ANTEPRIMA delle scadenze, popolare la grid in-memory,
--    permettere all'utente di modificarle/eliminarle, e poi al save
--    batch le righe vanno persistite in INSERT classico (no trigger).
--
-- L'utente deve disattivare il trigger oppure il trigger non deve far
-- "doppione" se le scadenze sono gia' presenti (gia' garantito dal
-- check `NOT EXISTS s.note='AUTO_GENERATED'` nel trigger). Le scadenze
-- ritornate da questa SP NON hanno marker AUTO_GENERATED -> il trigger
-- post-save non rigenera.
--
-- Logica:
--   - n_rate, giorni_scadenza, tipo_scadenza letti da pagamenti.
--   - tipo_scadenza='DF' (Data Fattura): scadenza = data_doc + giorni*rata
--   - tipo_scadenza='FM' (Fine Mese):    scadenza = EOMONTH(data_doc) + giorni*rata
--   - importo distribuito: totale/n_rate, residuo sull'ultima rata.
--
-- Result columns (matchano la grid scadenze del custom-form):
--   tipo, data_scadenza, importo, importo_pagato, pagamento_id, stato,
--   rata_n, rata_totale, cliente_id, fornitore_id

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.sp_calcola_scadenze', 'P') IS NOT NULL
    DROP PROCEDURE dbo.sp_calcola_scadenze;
GO

CREATE PROCEDURE dbo.sp_calcola_scadenze
    @pagamento_id   INT,
    @data_documento DATE,
    @totale         DECIMAL(18,4),
    @cliente_id     INT  = NULL,
    @fornitore_id   INT  = NULL,
    @tipo           NVARCHAR(20) = 'INCASSO'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @n_rate INT,
            @giorni INT,
            @tipo_scad NVARCHAR(2);

    SELECT @n_rate    = ISNULL(n_rate, 1),
           @giorni    = ISNULL(giorni_scadenza, 0),
           @tipo_scad = ISNULL(tipo_scadenza, 'DF')
      FROM dbo.pagamenti
     WHERE id = @pagamento_id;

    IF @n_rate IS NULL OR @n_rate < 1 SET @n_rate = 1;
    IF @data_documento IS NULL SET @data_documento = CAST(GETDATE() AS DATE);
    IF @totale IS NULL OR @totale < 0 SET @totale = 0;

    DECLARE @importo_rata DECIMAL(18,4) = ROUND(@totale / @n_rate, 2);
    DECLARE @residuo      DECIMAL(18,4) = @totale - (@importo_rata * @n_rate);

    -- Costruisce result set con N righe via tally CTE.
    ;WITH N(n) AS (
        SELECT TOP (@n_rate) ROW_NUMBER() OVER (ORDER BY (SELECT NULL))
          FROM sys.all_objects
    )
    SELECT
        @tipo                                                          AS tipo,
        CASE
            WHEN @tipo_scad = 'FM'
                THEN DATEADD(day, @giorni + ((n - 1) * 30), EOMONTH(@data_documento))
            ELSE DATEADD(day, @giorni + ((n - 1) * 30), @data_documento)
        END                                                            AS data_scadenza,
        CASE WHEN n = @n_rate THEN @importo_rata + @residuo
             ELSE @importo_rata END                                    AS importo,
        CAST(0 AS DECIMAL(18,4))                                       AS importo_pagato,
        @pagamento_id                                                  AS pagamento_id,
        N'APERTA'                                                      AS stato,
        n                                                              AS rata_n,
        @n_rate                                                        AS rata_totale,
        @cliente_id                                                    AS cliente_id,
        @fornitore_id                                                  AS fornitore_id
      FROM N
     ORDER BY n;
END;
GO

PRINT 'Stored procedure dbo.sp_calcola_scadenze creata.';
GO

-- Smoke test (chiama con un pagamento esistente)
DECLARE @pid INT = (SELECT TOP 1 id FROM dbo.pagamenti WHERE n_rate > 1 ORDER BY id);
IF @pid IS NOT NULL
BEGIN
    PRINT N'Smoke test: pagamento_id=' + CAST(@pid AS NVARCHAR(10));
    EXEC dbo.sp_calcola_scadenze
        @pagamento_id   = @pid,
        @data_documento = '2026-05-08',
        @totale         = 1200.00,
        @cliente_id     = 1,
        @tipo           = 'INCASSO';
END
GO
