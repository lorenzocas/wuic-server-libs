-- =============================================================================
-- Task 12.5 + 12.6 — Supplier rate integration + Initiative reporting
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

-- ─── 12.5 — Supplier cost integration in upload pipeline ─────────────────────
-- SP che applica `cp.fn_supplier_cost` durante l'upload di facts.actual da
-- supplier invoices. Input: staging table (program_id, time_month_id, xbs_node_id,
-- supplier_code, quantity, target_currency_id) → calcola actual = quantity ×
-- supplier_rate × markup, converted to target currency.
IF OBJECT_ID(N'[uploads].[sp_apply_supplier_costs]', N'P') IS NOT NULL
    DROP PROCEDURE [uploads].[sp_apply_supplier_costs];
GO
IF SCHEMA_ID('uploads') IS NULL EXEC('CREATE SCHEMA uploads');
GO

IF TYPE_ID(N'[uploads].[tvp_supplier_invoice_lines]') IS NULL
BEGIN
    CREATE TYPE [uploads].[tvp_supplier_invoice_lines] AS TABLE (
        program_id INT NOT NULL,
        time_month_id INT NOT NULL,
        xbs_node_id BIGINT NOT NULL,
        supplier_code VARCHAR(50) NOT NULL,
        quantity DECIMAL(19,4) NOT NULL,
        target_currency_id INT NOT NULL,
        as_of_date DATE NOT NULL,
        PRIMARY KEY (program_id, time_month_id, xbs_node_id, supplier_code)
    );
    PRINT '[85] uploads.tvp_supplier_invoice_lines type created';
END
GO

CREATE PROCEDURE [uploads].[sp_apply_supplier_costs]
    @lines [uploads].[tvp_supplier_invoice_lines] READONLY,
    @user_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    -- Per ogni linea, calcola converted_cost via fn_supplier_cost
    -- e UPSERT cp.facts.actual.
    DECLARE @computed TABLE (
        program_id INT, time_month_id INT, xbs_node_id BIGINT,
        computed_cost DECIMAL(19,4), target_currency_id INT
    );
    INSERT INTO @computed
    SELECT
        l.program_id, l.time_month_id, l.xbs_node_id,
        sc.converted_cost,
        l.target_currency_id
      FROM @lines l
      CROSS APPLY [cp].[fn_supplier_cost] (
          l.quantity, l.supplier_code, l.time_month_id / 100, l.target_currency_id, l.as_of_date
      ) sc
     WHERE sc.converted_cost IS NOT NULL;

    -- UPSERT su cp.facts: aggiunge converted_cost a actual (ACCUMULATE per supplier multipli)
    MERGE [cp].[facts] AS tgt
    USING (
        SELECT program_id, time_month_id, xbs_node_id, target_currency_id,
               SUM(computed_cost) AS total_cost
          FROM @computed
         GROUP BY program_id, time_month_id, xbs_node_id, target_currency_id
    ) AS src
       ON tgt.program_id = src.program_id
      AND tgt.time_month_id = src.time_month_id
      AND tgt.xbs_node_id = src.xbs_node_id
      AND tgt.currency_id = src.target_currency_id
      AND ISNULL(tgt.cancellato, 0) = 0
    WHEN MATCHED THEN
        UPDATE SET actual = ISNULL(tgt.actual, 0) + src.total_cost,
                   data_modifica = SYSUTCDATETIME(), utente_modifica = @user_id
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (time_month_id, program_id, xbs_node_id, unit_measure_id, actual, currency_id,
                data_creazione, utente_creazione)
        VALUES (src.time_month_id, src.program_id, src.xbs_node_id,
                (SELECT TOP 1 id FROM [cp].[unit_measure] ORDER BY id),
                src.total_cost, src.target_currency_id, SYSUTCDATETIME(), @user_id);

    COMMIT TRANSACTION;

    SELECT 'supplier_cost_applied' AS metric, COUNT(*) AS rows_processed FROM @computed;
END
GO
PRINT '[85] uploads.sp_apply_supplier_costs deployed (TVP + UPSERT)';
GO

-- ─── 12.6 — Initiative reporting (rep.sp_run_initiative_pivot) ───────────────
IF OBJECT_ID(N'[rep].[sp_run_initiative_pivot]', N'P') IS NOT NULL
    DROP PROCEDURE [rep].[sp_run_initiative_pivot];
GO
CREATE PROCEDURE [rep].[sp_run_initiative_pivot]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @year_from INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @year_to INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to') AS INT);
    DECLARE @target_currency_id INT = TRY_CAST(JSON_VALUE(@params_json, '$.target_currency_id') AS INT);
    DECLARE @as_of_date DATE = COALESCE(TRY_CAST(JSON_VALUE(@params_json, '$.as_of_date') AS DATE), CAST(SYSUTCDATETIME() AS DATE));

    ;WITH initiative_aggregates AS (
        SELECT
            i.id AS initiative_id,
            i.code AS initiative_code,
            i.name AS initiative_name,
            COUNT(DISTINCT ip.program_id) AS programs_count,
            COUNT(DISTINCT f.id) AS facts_count,
            SUM(cc_pl.converted_amount) AS total_planned_target,
            SUM(cc_ac.converted_amount) AS total_actual_target,
            SUM(cc_ac.converted_amount) - SUM(cc_pl.converted_amount) AS variance_target
          FROM [core].[initiative] i
          LEFT JOIN [core].[initiative_program] ip ON ip.initiative_id = i.id
          LEFT JOIN [cp].[facts] f ON f.program_id = ip.program_id
                                  AND ISNULL(f.cancellato, 0) = 0
                                  AND (@year_from IS NULL OR f.time_month_id >= @year_from*100+1)
                                  AND (@year_to IS NULL OR f.time_month_id <= @year_to*100+12)
          OUTER APPLY [cp].[fn_convert_currency] (f.planned, f.currency_id, @target_currency_id, @as_of_date) cc_pl
          OUTER APPLY [cp].[fn_convert_currency] (f.actual,  f.currency_id, @target_currency_id, @as_of_date) cc_ac
         WHERE ISNULL(i.cancellato, 0) = 0
         GROUP BY i.id, i.code, i.name
    )
    SELECT @result_json = (
        SELECT
            @target_currency_id AS target_currency_id,
            (SELECT code FROM [core].[currency] WHERE id = @target_currency_id) AS target_currency_code,
            (SELECT * FROM initiative_aggregates ORDER BY total_planned_target DESC FOR JSON PATH) AS initiatives,
            (SELECT
                COUNT(*) AS initiative_count,
                SUM(programs_count) AS total_programs,
                SUM(facts_count) AS total_facts,
                SUM(total_planned_target) AS grand_total_planned,
                SUM(total_actual_target) AS grand_total_actual,
                SUM(variance_target) AS grand_total_variance
              FROM initiative_aggregates FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS totals
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    SELECT @result_row_count = COUNT(*) FROM initiative_aggregates;
END
GO
PRINT '[85] rep.sp_run_initiative_pivot deployed';
GO

IF NOT EXISTS (SELECT 1 FROM [rep].[report_definition] WHERE code = 'INITIATIVE_PIVOT')
BEGIN
    INSERT INTO [rep].[report_definition] (code, name, description, category, stored_name, default_params_json, output_format, is_active, data_creazione, utente_creazione)
    VALUES ('INITIATIVE_PIVOT', N'Initiative pivot',
            N'Aggregato planned/actual/variance per iniziativa, cross-currency.',
            N'Reporting', 'rep.sp_run_initiative_pivot',
            N'{"year_from":null,"year_to":null,"target_currency_id":null,"as_of_date":null}',
            'json', 1, SYSUTCDATETIME(), 1);
    PRINT '[85] report_definition INITIATIVE_PIVOT registered';
END
GO

PRINT '[85] === Batch B (12.5 + 12.6) deployed ===';
GO
