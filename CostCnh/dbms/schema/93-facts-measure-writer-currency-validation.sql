-- =============================================================================
-- Task 12.2 + 11.9 — facts_measure writer + currency validation constraint
-- =============================================================================
-- 12.2: cp.sp_set_facts_measure (UPSERT EAV measure_code per cp.facts row)
--       + extension upload pipeline che lo usa per popolare reserved/forecast.
-- 11.9: CHECK constraint su cp.facts e wf.allocation:
--       cost_amount NOT NULL → currency_id NOT NULL
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

USE [CostCnh_Data];
GO

-- ─── 12.2: facts_measure writer SP ────────────────────────────────────────────
IF OBJECT_ID(N'[cp].[sp_set_facts_measure]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_set_facts_measure];
GO
CREATE PROCEDURE [cp].[sp_set_facts_measure]
    @facts_id BIGINT,
    @measure_code VARCHAR(8),
    @value DECIMAL(19,4)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @time_month_id INT;
    SELECT @time_month_id = time_month_id FROM [cp].[facts] WHERE id = @facts_id;
    IF @time_month_id IS NULL
    BEGIN
        RAISERROR('facts_id %d not found', 16, 1, @facts_id);
        RETURN;
    END

    -- CHECK CONSTRAINT del measure_code: deve essere uno dei codici ammessi
    IF @measure_code NOT IN ('R1','R2','R3','R4','F1','F2','F3','BL','CM','CO','TG')
    BEGIN
        RAISERROR('measure_code %s not allowed. Valid: R1..R4, F1..F3, BL, CM, CO, TG', 16, 1, @measure_code);
        RETURN;
    END

    MERGE [cp].[facts_measure] AS tgt
    USING (SELECT @facts_id AS fid, @time_month_id AS tmid, @measure_code AS mc, @value AS v) AS src
       ON tgt.facts_id = src.fid AND tgt.time_month_id = src.tmid AND tgt.measure_code = src.mc
    WHEN MATCHED THEN
        UPDATE SET value = src.v
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (facts_id, time_month_id, measure_code, value)
        VALUES (src.fid, src.tmid, src.mc, src.v);
END
GO
PRINT '[93] cp.sp_set_facts_measure deployed';
GO

-- ─── 12.2: bulk version (TVP per upload pipeline) ────────────────────────────
IF TYPE_ID(N'[cp].[tvp_facts_measure_items]') IS NULL
BEGIN
    CREATE TYPE [cp].[tvp_facts_measure_items] AS TABLE (
        facts_id BIGINT NOT NULL,
        measure_code VARCHAR(8) NOT NULL,
        value DECIMAL(19,4) NULL,
        PRIMARY KEY (facts_id, measure_code)
    );
    PRINT '[93] cp.tvp_facts_measure_items type created';
END
GO

IF OBJECT_ID(N'[cp].[sp_set_facts_measure_bulk]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_set_facts_measure_bulk];
GO
CREATE PROCEDURE [cp].[sp_set_facts_measure_bulk]
    @items [cp].[tvp_facts_measure_items] READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validation: tutti i measure_code devono essere ammessi
    IF EXISTS (SELECT 1 FROM @items WHERE measure_code NOT IN ('R1','R2','R3','R4','F1','F2','F3','BL','CM','CO','TG'))
    BEGIN
        RAISERROR('Some measure_code invalid in batch. Valid: R1..R4, F1..F3, BL, CM, CO, TG', 16, 1);
        RETURN;
    END

    BEGIN TRANSACTION;
    MERGE [cp].[facts_measure] AS tgt
    USING (
        SELECT i.facts_id, f.time_month_id, i.measure_code, i.value
          FROM @items i
          INNER JOIN [cp].[facts] f ON f.id = i.facts_id AND ISNULL(f.cancellato, 0) = 0
    ) AS src
       ON tgt.facts_id = src.facts_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.measure_code = src.measure_code
    WHEN MATCHED THEN UPDATE SET value = src.value
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (facts_id, time_month_id, measure_code, value)
        VALUES (src.facts_id, src.time_month_id, src.measure_code, src.value);
    COMMIT TRANSACTION;
END
GO
PRINT '[93] cp.sp_set_facts_measure_bulk deployed';
GO

-- ─── 11.9: CHECK constraint cost_amount → currency_id required ───────────────
-- Validation: se cost_amount IS NOT NULL, currency_id deve essere valorizzato.
-- Pattern: NOCHECK + WITH NOCHECK su DB pre-popolato per evitare scan completo,
-- poi check check (validate) post-deploy.

-- cp.facts: no cost_amount column → skip
-- wf.allocation: ha cost_amount + currency_id
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_wf_allocation_cost_currency')
BEGIN
    ALTER TABLE [wf].[allocation] WITH NOCHECK ADD CONSTRAINT CK_wf_allocation_cost_currency
        CHECK (cost_amount IS NULL OR currency_id IS NOT NULL);
    PRINT '[93] CK_wf_allocation_cost_currency added (NOCHECK on existing rows)';

    -- Verifica righe esistenti che violerebbero il check
    DECLARE @bad INT = (SELECT COUNT(*) FROM [wf].[allocation] WHERE cost_amount IS NOT NULL AND currency_id IS NULL);
    IF @bad > 0
        PRINT '[93] WARN: ' + CAST(@bad AS VARCHAR) + ' existing wf.allocation rows have cost_amount but NULL currency_id. Fix manually or these will block future UPDATEs.';
    ELSE
    BEGIN
        ALTER TABLE [wf].[allocation] WITH CHECK CHECK CONSTRAINT CK_wf_allocation_cost_currency;
        PRINT '[93] CK_wf_allocation_cost_currency validated on existing data';
    END
END
GO

-- cp.rate_catalog, cp.exchange_rate, cp.supplier_rate: currency_id già NOT NULL → skip

PRINT '[93] === Task 12.2 + 11.9 deployed ===';
GO
