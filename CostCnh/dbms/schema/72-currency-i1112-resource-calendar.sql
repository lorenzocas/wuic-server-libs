-- =============================================================================
-- Task 11.12 — Resource calendar full integration in fn_fte_to_cost
-- =============================================================================
-- (a) Estende cp.resource_calendar con working_hours_per_day (default 8)
-- (b) Re-deploy cp.fn_fte_to_cost usando il vero campo invece di hardcoded 8
-- (c) Aggiunge cp.fn_fte_to_cost_monthly (variante month-aware: usa rc.month_num
--     se presente, altrimenti aggregato annuale)
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

-- ─── (a) Aggiungi working_hours_per_day ───────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
     WHERE name = 'working_hours_per_day' AND object_id = OBJECT_ID(N'[cp].[resource_calendar]')
)
BEGIN
    ALTER TABLE [cp].[resource_calendar]
        ADD working_hours_per_day DECIMAL(5,2) NOT NULL CONSTRAINT DF_resource_calendar_hpd DEFAULT (8.00);
    PRINT '[72-I.11.12] working_hours_per_day added (default 8.00)';
END
GO

-- ─── (b) Re-deploy fn_fte_to_cost usando working_hours_per_day reale ──────────
IF OBJECT_ID(N'[wf].[tr_allocation_compute_cost]', N'TR') IS NOT NULL
    DROP TRIGGER [wf].[tr_allocation_compute_cost];     -- trigger depende su funzione
GO
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
        CAST(@fte_percent / 100.0 *
            ISNULL(
                -- resource_calendar: SUM(working_days × working_hours_per_day) per site/year
                (SELECT SUM(rc.working_days * rc.working_hours_per_day)
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND ISNULL(rc.cancellato, 0) = 0),
                -- Fallback: cp.fte_hours per role/year (legacy path)
                (SELECT TOP 1 fh.hours_per_fte
                   FROM [cp].[fte_hours] fh
                  WHERE fh.role_code = @role_code
                    AND fh.year_num = @year_num
                    AND ISNULL(fh.cancellato, 0) = 0)
            )
        AS DECIMAL(11,2)) AS computed_hours,
        CAST(@fte_percent / 100.0 *
            ISNULL(
                (SELECT SUM(rc.working_days * rc.working_hours_per_day)
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
PRINT '[72-I.11.12] cp.fn_fte_to_cost re-deployed (uses rc.working_hours_per_day)';
GO

-- ─── (c) Variante month-aware (calcolo cost per singolo mese) ─────────────────
-- Usa rc.month_num se settato (cal specifico per mese), altrimenti yearly avg.
IF OBJECT_ID(N'[cp].[fn_fte_to_cost_monthly]', N'IF') IS NOT NULL
    DROP FUNCTION [cp].[fn_fte_to_cost_monthly];
GO
CREATE FUNCTION [cp].[fn_fte_to_cost_monthly] (
    @fte_percent DECIMAL(7,2),
    @role_code VARCHAR(50),
    @year_num INT,
    @month_num INT,
    @currency_id INT,
    @site_id INT = NULL
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        CAST(@fte_percent / 100.0 *
            ISNULL(
                -- Month-specific calendar (rc.month_num = @month_num)
                (SELECT TOP 1 rc.working_days * rc.working_hours_per_day
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND rc.month_num = @month_num
                    AND ISNULL(rc.cancellato, 0) = 0),
                -- Fallback yearly summary
                (SELECT SUM(rc.working_days * rc.working_hours_per_day) / 12.0
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND ISNULL(rc.cancellato, 0) = 0)
            )
        AS DECIMAL(11,2)) AS computed_hours_month,
        CAST(@fte_percent / 100.0 *
            ISNULL(
                (SELECT TOP 1 rc.working_days * rc.working_hours_per_day
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND rc.month_num = @month_num
                    AND ISNULL(rc.cancellato, 0) = 0),
                (SELECT SUM(rc.working_days * rc.working_hours_per_day) / 12.0
                   FROM [cp].[resource_calendar] rc
                  WHERE rc.site_id = @site_id
                    AND rc.year_num = @year_num
                    AND ISNULL(rc.cancellato, 0) = 0)
            ) *
            (SELECT TOP 1 hc.hourly_rate
               FROM [cp].[hours_currency] hc
              WHERE hc.currency_id = @currency_id
                AND hc.year_num = @year_num
                AND ISNULL(hc.cancellato, 0) = 0)
        AS DECIMAL(19,4)) AS computed_cost_month;
GO
PRINT '[72-I.11.12] cp.fn_fte_to_cost_monthly created (month-aware variant)';
GO

-- ─── Re-create trigger (depende su fn_fte_to_cost) ────────────────────────────
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
          a.fte_percent, ro.code, a.time_month_id / 100, a.currency_id, r.site_id
      ) ftc
     WHERE a.cost_amount IS NULL
       AND a.fte_percent IS NOT NULL
       AND a.currency_id IS NOT NULL
       AND ftc.computed_cost IS NOT NULL;
END
GO
PRINT '[72-I.11.12] wf.tr_allocation_compute_cost re-deployed';
GO
