-- =============================================================================
-- Phase I.1 part 2 — Currency runtime full (W0.2 = A, W0.3 = a strict)
-- =============================================================================
-- TVF inline (no scalar UDF — anti-pattern post-mortem cost-cnh):
--   cp.fn_convert_currency (amount, from_id, to_id, as_of_date)  → strict RAISERROR if missing
--   cp.fn_fte_to_cost (fte_percent, role_code, year, currency_id) → uses fte_hours + hours_currency + resource_calendar
--   cp.fn_supplier_cost (quantity, supplier_code, year, target_currency_id)
--
-- POLICY MISSING RATE (W0.3 = a): le inline TVF non possono fare RAISERROR.
-- Soluzione: ritornano NULL; la SP/controller chiamante DEVE controllare e fare
-- RAISERROR. Per gating strict, fornisco anche un wrapper SP `cp.sp_convert_currency`
-- che fa RAISERROR su missing-rate.
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

-- ─── 1. cp.fn_convert_currency (inline TVF) ───────────────────────────────────
-- Cerca rate in cp.exchange_rate dove valid_from <= @as_of_date < valid_to (o valid_to IS NULL).
-- Same-currency (from=to) returns input. Missing-rate returns NULL row.
IF OBJECT_ID(N'[cp].[fn_convert_currency]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_convert_currency];
GO
CREATE FUNCTION [cp].[fn_convert_currency] (
    @amount DECIMAL(19,4),
    @from_currency_id INT,
    @to_currency_id INT,
    @as_of_date DATE
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        CASE
            WHEN @amount IS NULL THEN NULL
            WHEN @from_currency_id = @to_currency_id THEN @amount
            ELSE @amount * er.rate
        END AS converted_amount,
        CASE
            WHEN @from_currency_id = @to_currency_id THEN CAST(1.0 AS DECIMAL(19,8))
            ELSE er.rate
        END AS effective_rate,
        er.id AS exchange_rate_id,
        er.valid_from,
        er.valid_to
      FROM (SELECT 1 AS dummy) d  -- always one row, even if no rate
      OUTER APPLY (
          SELECT TOP 1 e.id, e.rate, e.valid_from, e.valid_to
            FROM [cp].[exchange_rate] e
           WHERE e.from_currency_id = @from_currency_id
             AND e.to_currency_id = @to_currency_id
             AND e.valid_from <= @as_of_date
             AND (e.valid_to IS NULL OR e.valid_to > @as_of_date)
             AND ISNULL(e.cancellato, 0) = 0
           ORDER BY e.valid_from DESC
      ) er;
GO
PRINT '[72-CUR] cp.fn_convert_currency (inline TVF) created';
GO

-- ─── 2. cp.sp_convert_currency (wrapper strict per W0.3 = a) ─────────────────
IF OBJECT_ID(N'[cp].[sp_convert_currency]', N'P') IS NOT NULL
    DROP PROCEDURE [cp].[sp_convert_currency];
GO
CREATE PROCEDURE [cp].[sp_convert_currency]
    @amount DECIMAL(19,4),
    @from_currency_id INT,
    @to_currency_id INT,
    @as_of_date DATE,
    @converted DECIMAL(19,4) OUTPUT,
    @effective_rate DECIMAL(19,8) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1
        @converted = converted_amount,
        @effective_rate = effective_rate
      FROM [cp].[fn_convert_currency] (@amount, @from_currency_id, @to_currency_id, @as_of_date);

    IF @amount IS NOT NULL
       AND @from_currency_id <> @to_currency_id
       AND @effective_rate IS NULL
    BEGIN
        DECLARE @err NVARCHAR(400) = CONCAT(
            'Missing exchange rate: from_currency_id=', @from_currency_id,
            ' to_currency_id=', @to_currency_id,
            ' as_of_date=', CONVERT(VARCHAR(20), @as_of_date, 23),
            '. Insert a row in cp.exchange_rate covering this date.');
        RAISERROR(@err, 16, 1);
        RETURN;
    END
END
GO
PRINT '[72-CUR] cp.sp_convert_currency (strict wrapper) created';
GO

-- ─── 3. cp.fn_fte_to_cost (inline TVF: FTE → Hours → Cost catena) ────────────
-- Algoritmo:
--   1. hours = (fte_percent / 100) * hours_per_fte(role, year)
--      OR (fte_percent / 100) * resource_calendar.working_hours_total(site, year) se site_id passato
--   2. cost = hours * hourly_rate(currency, year)
IF OBJECT_ID(N'[cp].[fn_fte_to_cost]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_fte_to_cost];
GO
CREATE FUNCTION [cp].[fn_fte_to_cost] (
    @fte_percent DECIMAL(7,2),
    @role_code VARCHAR(50),
    @year_num INT,
    @currency_id INT,
    @site_id INT = NULL
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        -- Hours derivati: priority a resource_calendar se site_id+year matchano, else fte_hours per role
        CAST(@fte_percent / 100.0 *
            ISNULL(
                -- resource_calendar: working_days * 8h default (TODO: aggiungere working_hours_per_day col se serve granularità sub-giorno)
                (SELECT SUM(rc.working_days * 8.0)
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND ISNULL(rc.cancellato, 0) = 0),
                (SELECT TOP 1 fh.hours_per_fte
                   FROM [cp].[fte_hours] fh
                  WHERE fh.role_code = @role_code
                    AND fh.year_num = @year_num
                    AND ISNULL(fh.cancellato, 0) = 0)
            )
        AS DECIMAL(11,2)) AS computed_hours,
        -- Cost: hours * hourly_rate
        CAST(@fte_percent / 100.0 *
            ISNULL(
                -- resource_calendar: working_days * 8h default (TODO: aggiungere working_hours_per_day col se serve granularità sub-giorno)
                (SELECT SUM(rc.working_days * 8.0)
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND ISNULL(rc.cancellato, 0) = 0),
                (SELECT TOP 1 fh.hours_per_fte
                   FROM [cp].[fte_hours] fh
                  WHERE fh.role_code = @role_code
                    AND fh.year_num = @year_num
                    AND ISNULL(fh.cancellato, 0) = 0)
            ) *
            (SELECT TOP 1 hc.hourly_rate
               FROM [cp].[hours_currency] hc
              WHERE hc.currency_id = @currency_id
                AND hc.year_num = @year_num
                AND ISNULL(hc.cancellato, 0) = 0)
        AS DECIMAL(19,4)) AS computed_cost;
GO
PRINT '[72-CUR] cp.fn_fte_to_cost (inline TVF) created';
GO

-- ─── 4. cp.fn_supplier_cost (supplier rate × quantity → cost in target currency) ─
IF OBJECT_ID(N'[cp].[fn_supplier_cost]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_supplier_cost];
GO
CREATE FUNCTION [cp].[fn_supplier_cost] (
    @quantity DECIMAL(19,4),
    @supplier_code VARCHAR(50),
    @year_num INT,
    @target_currency_id INT,
    @as_of_date DATE
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    WITH sr AS (
        SELECT TOP 1 s.rate, s.currency_id AS supplier_currency_id, s.markup_pct
          FROM [cp].[supplier_rate] s
         WHERE s.supplier_code = @supplier_code
           AND s.year_num = @year_num
           AND ISNULL(s.cancellato, 0) = 0
    )
    SELECT
        -- raw cost in supplier currency
        CAST(@quantity * sr.rate * (1 + ISNULL(sr.markup_pct, 0) / 100.0) AS DECIMAL(19,4)) AS raw_cost,
        -- converted to target currency
        cc.converted_amount AS converted_cost,
        cc.effective_rate,
        sr.supplier_currency_id
      FROM sr
      CROSS APPLY [cp].[fn_convert_currency] (
          CAST(@quantity * sr.rate * (1 + ISNULL(sr.markup_pct, 0) / 100.0) AS DECIMAL(19,4)),
          sr.supplier_currency_id,
          @target_currency_id,
          @as_of_date
      ) cc;
GO
PRINT '[72-CUR] cp.fn_supplier_cost (inline TVF) created';
GO

-- ─── 5. cp.tr_allocation_compute_cost (auto-fill cost_amount su wf.allocation) ─
-- Trigger AFTER INSERT/UPDATE su wf.allocation: se cost_amount IS NULL e fte_percent
-- valorizzato, deriva cost_amount via cp.fn_fte_to_cost.
IF OBJECT_ID(N'[wf].[tr_allocation_compute_cost]', N'TR') IS NOT NULL
    DROP TRIGGER [wf].[tr_allocation_compute_cost];
GO
CREATE TRIGGER [wf].[tr_allocation_compute_cost]
ON [wf].[allocation]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(fte_percent) AND NOT UPDATE(hours) RETURN;

    UPDATE a SET
        a.cost_amount = ftc.computed_cost,
        a.hours = COALESCE(a.hours, ftc.computed_hours)
      FROM [wf].[allocation] a
      INNER JOIN inserted i ON i.id = a.id
      INNER JOIN [wf].[resource] r ON r.id = a.resource_id
      LEFT JOIN [wf].[role] ro ON ro.id = r.role_id
      CROSS APPLY [cp].[fn_fte_to_cost] (
          a.fte_percent,
          ro.code,
          a.time_month_id / 100,    -- year_num
          a.currency_id,
          r.site_id
      ) ftc
     WHERE a.cost_amount IS NULL    -- solo se non gia' settato manualmente
       AND a.fte_percent IS NOT NULL
       AND a.currency_id IS NOT NULL
       AND ftc.computed_cost IS NOT NULL;
END
GO
PRINT '[72-CUR] wf.tr_allocation_compute_cost (auto-fill cost) created';
GO

-- ─── 6. cp.vw_facts_in_currency (helper view: facts convertiti a target currency) ─
-- Inline view binding (per chart/report cross-currency).
-- USAGE: SELECT * FROM cp.vw_facts_in_currency('USD', GETDATE()) WHERE program_id = X
IF OBJECT_ID(N'[cp].[fn_facts_in_currency]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_facts_in_currency];
GO
CREATE FUNCTION [cp].[fn_facts_in_currency] (
    @target_currency_id INT,
    @as_of_date DATE
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        f.id, f.program_id, f.project_id, f.project_scenario_id, f.xbs_node_id,
        f.time_month_id,
        f.currency_id AS source_currency_id,
        @target_currency_id AS target_currency_id,
        cc_pl.converted_amount AS planned_target,
        cc_ac.converted_amount AS actual_target,
        cc_cm.converted_amount AS committed_target,
        cc_pl.effective_rate
      FROM [cp].[facts] f
      OUTER APPLY [cp].[fn_convert_currency] (f.planned,   f.currency_id, @target_currency_id, @as_of_date) cc_pl
      OUTER APPLY [cp].[fn_convert_currency] (f.actual,    f.currency_id, @target_currency_id, @as_of_date) cc_ac
      OUTER APPLY [cp].[fn_convert_currency] (f.committed, f.currency_id, @target_currency_id, @as_of_date) cc_cm
     WHERE ISNULL(f.cancellato, 0) = 0;
GO
PRINT '[72-CUR] cp.fn_facts_in_currency (inline TVF for cross-currency reporting) created';
GO

-- ─── 7. Index optimization su exchange_rate per fast range lookup ────────────
-- Pattern: WHERE from=X AND to=Y AND valid_from <= D AND valid_to > D ORDER BY valid_from DESC
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes WHERE name = 'ix_exchange_rate_pair_date'
      AND object_id = OBJECT_ID(N'[cp].[exchange_rate]')
)
BEGIN
    CREATE INDEX ix_exchange_rate_pair_date
        ON [cp].[exchange_rate](from_currency_id, to_currency_id, valid_from DESC)
        INCLUDE (valid_to, rate)
        WHERE cancellato = 0
        WITH (DATA_COMPRESSION = PAGE);
    PRINT '[72-CUR] ix_exchange_rate_pair_date created (covering NC for fast lookup)';
END
GO

-- Optimization: fte_hours / hours_currency lookup veloce
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fte_hours_role_year' AND object_id = OBJECT_ID(N'[cp].[fte_hours]'))
BEGIN
    CREATE INDEX ix_fte_hours_role_year
        ON [cp].[fte_hours](role_code, year_num) INCLUDE (hours_per_fte)
        WHERE cancellato = 0
        WITH (DATA_COMPRESSION = PAGE);
    PRINT '[72-CUR] ix_fte_hours_role_year created';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_hours_currency_cur_year' AND object_id = OBJECT_ID(N'[cp].[hours_currency]'))
BEGIN
    CREATE INDEX ix_hours_currency_cur_year
        ON [cp].[hours_currency](currency_id, year_num) INCLUDE (hourly_rate)
        WHERE cancellato = 0
        WITH (DATA_COMPRESSION = PAGE);
    PRINT '[72-CUR] ix_hours_currency_cur_year created';
END
GO

PRINT '[72-CUR] === Phase I.1 part 2 (currency runtime) deployed ===';
PRINT '  - cp.fn_convert_currency (inline TVF)';
PRINT '  - cp.sp_convert_currency (strict wrapper, RAISERROR on missing rate)';
PRINT '  - cp.fn_fte_to_cost (inline TVF: FTE chain)';
PRINT '  - cp.fn_supplier_cost (inline TVF: supplier rate + conversion)';
PRINT '  - cp.fn_facts_in_currency (cross-currency reporting view)';
PRINT '  - wf.tr_allocation_compute_cost (auto-fill cost_amount)';
PRINT '  - 3 NC indexes optimized for lookup patterns';
GO
