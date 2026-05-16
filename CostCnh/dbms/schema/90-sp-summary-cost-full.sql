-- =============================================================================
-- CostCnh — rep.sp_run_summary_cost (FULL BODY reference implementation)
-- =============================================================================
-- Sprint 9.2-extended: porta TUTTE e 5 le categorie di "formule pivot" legacy:
--   (1) Pivot dimensionale     — aggregazione per XBS L1 × time_month × scenario
--   (2) Running totals YTD     — SUM() OVER window function (rimpiazza self-join O(N^2))
--   (3) Variance               — (a) actual vs planned (b) current vs baseline
--   (4) Conditional past/future — actual solo se month < time_now, forecast solo se >=
--   (5) EAV scenario × measure  — JOIN cp.facts_measure per TG/CM/F1/F2/F3
--
-- DATI:
--   - cp.facts (hot, planned/actual/committed/balance — 4 colonne fisse)
--   - cp.facts_measure (sparse EAV: TG/CM/F1/F2/F3/BL...) per measure_code
--   - fc.facts WHERE forecast_code='BL' (baseline scenario, eliminato il mirror
--     CostPlanning_Facts_BaseLine legacy)
--   - core.program.time_now_month_id (per past/future cut-off, settato da user)
--
-- PARAMETERS (via @params_json):
--   - program_id INT (required)
--   - scenario_id INT (optional, filtra cp.facts.project_scenario_id)
--   - year_from INT, year_to INT (range time_month_id)
--   - baseline_forecast_code VARCHAR (default 'BL')
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

IF OBJECT_ID(N'[rep].[sp_run_summary_cost]', N'P') IS NOT NULL DROP PROCEDURE [rep].[sp_run_summary_cost];
GO

CREATE PROCEDURE [rep].[sp_run_summary_cost]
    @params_json NVARCHAR(MAX),
    @execution_id BIGINT,
    @result_json NVARCHAR(MAX) OUTPUT,
    @result_row_count INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    -- ── Parse params ─────────────────────────────────────────────────────────
    DECLARE @prog INT = TRY_CAST(JSON_VALUE(@params_json, '$.program_id') AS INT);
    DECLARE @scn  INT = TRY_CAST(JSON_VALUE(@params_json, '$.scenario_id') AS INT);
    DECLARE @yf   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_from') AS INT);
    DECLARE @yt   INT = TRY_CAST(JSON_VALUE(@params_json, '$.year_to') AS INT);
    DECLARE @baseline_scn_code VARCHAR(8) = COALESCE(JSON_VALUE(@params_json, '$.baseline_forecast_code'), 'BL');

    IF @prog IS NULL
    BEGIN
        SET @result_json = N'{"error":"program_id is required"}';
        SET @result_row_count = 0;
        RETURN;
    END

    -- ── Resolve @time_now: from program.time_now_month_id OR current month ──
    DECLARE @time_now INT;
    SELECT @time_now = ISNULL(time_now_month_id,
                              YEAR(SYSUTCDATETIME())*100 + MONTH(SYSUTCDATETIME()))
    FROM [core].[program] WHERE id = @prog;
    SET @time_now = ISNULL(@time_now, YEAR(SYSUTCDATETIME())*100 + MONTH(SYSUTCDATETIME()));

    -- ── CTE 1a: BASE_FACTS — aggregate cp.facts direct measures per L1 ──────
    -- NB: NO join cp.facts_measure qui (evita cardinality multiplication 4x).
    ;WITH base_facts AS (
        SELECT
            f.program_id,
            f.time_month_id,
            (f.time_month_id / 100) AS year_num,
            COALESCE(n_l1.code, '(no_xbs)') AS xbs_l1_code,
            COALESCE(n_l1.name, '(no_xbs)') AS xbs_l1_name,
            COALESCE(tk.code, '(no_kind)') AS tree_kind,

            -- (1) Pivot dimensionale: direct measures from cp.facts hot columns
            SUM(f.planned)   AS planned,
            SUM(f.actual)    AS actual,
            SUM(f.committed) AS committed,
            SUM(f.balance)   AS balance
        FROM [cp].[facts] f
        LEFT JOIN [xbs].[node] n      ON n.id = f.xbs_node_id AND ISNULL(n.cancellato, 0) = 0
        LEFT JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id
        OUTER APPLY (
            SELECT TOP 1 a.code, a.name
            FROM [xbs].[node] a
            WHERE a.tree_kind_id = n.tree_kind_id
              AND a.node_path = CASE WHEN n.depth <= 1 THEN n.node_path
                                      ELSE n.node_path.GetAncestor(n.depth - 1)
                                 END
              AND ISNULL(a.cancellato, 0) = 0
        ) n_l1
        WHERE f.program_id = @prog AND ISNULL(f.cancellato, 0) = 0
          AND (@scn IS NULL OR f.project_scenario_id = @scn)
          AND (@yf  IS NULL OR f.time_month_id >= @yf * 100 + 1)
          AND (@yt  IS NULL OR f.time_month_id <= @yt * 100 + 12)
        GROUP BY f.program_id, f.time_month_id, n_l1.code, n_l1.name, tk.code
    ),

    -- ── CTE 1b: BASE_EAV — aggregate cp.facts_measure SEPARATELY per L1 ─────
    -- (Evita cardinality multiplication: aggregata indipendentemente, poi LEFT JOIN)
    base_eav AS (
        SELECT
            f.program_id,
            f.time_month_id,
            COALESCE(n_l1.code, '(no_xbs)') AS xbs_l1_code,
            SUM(CASE WHEN fm.measure_code = 'TG' THEN fm.value END) AS target_amount,
            SUM(CASE WHEN fm.measure_code = 'CM' THEN fm.value END) AS committed_eav,
            SUM(CASE WHEN fm.measure_code = 'F1' THEN fm.value END) AS forecast_optimistic,
            SUM(CASE WHEN fm.measure_code = 'F2' THEN fm.value END) AS forecast_likely,
            SUM(CASE WHEN fm.measure_code = 'F3' THEN fm.value END) AS forecast_pessimistic
        FROM [cp].[facts] f
        INNER JOIN [cp].[facts_measure] fm ON fm.facts_id = f.id AND fm.time_month_id = f.time_month_id
        LEFT JOIN [xbs].[node] n ON n.id = f.xbs_node_id AND ISNULL(n.cancellato, 0) = 0
        OUTER APPLY (
            SELECT TOP 1 a.code
            FROM [xbs].[node] a
            WHERE a.tree_kind_id = n.tree_kind_id
              AND a.node_path = CASE WHEN n.depth <= 1 THEN n.node_path
                                      ELSE n.node_path.GetAncestor(n.depth - 1)
                                 END
              AND ISNULL(a.cancellato, 0) = 0
        ) n_l1
        WHERE f.program_id = @prog AND ISNULL(f.cancellato, 0) = 0
          AND (@scn IS NULL OR f.project_scenario_id = @scn)
          AND (@yf  IS NULL OR f.time_month_id >= @yf * 100 + 1)
          AND (@yt  IS NULL OR f.time_month_id <= @yt * 100 + 12)
        GROUP BY f.program_id, f.time_month_id, n_l1.code
    ),

    -- ── CTE 1: BASE — combina facts + eav LEFT JOIN su (program, month, L1) ─
    base AS (
        SELECT
            bf.program_id, bf.time_month_id, bf.year_num,
            bf.xbs_l1_code, bf.xbs_l1_name, bf.tree_kind,
            bf.planned, bf.actual, bf.committed, bf.balance,
            -- (5) EAV measures (no inflation)
            be.target_amount, be.committed_eav,
            be.forecast_optimistic, be.forecast_likely, be.forecast_pessimistic
        FROM base_facts bf
        LEFT JOIN base_eav be
            ON be.program_id = bf.program_id
           AND be.time_month_id = bf.time_month_id
           AND be.xbs_l1_code = bf.xbs_l1_code
    ),

    -- ── CTE 2: BASELINE — fc.facts WHERE forecast_code='BL' aggregato per L1 ─
    baseline AS (
        SELECT
            fc.program_id,
            fc.time_month_id,
            COALESCE(n_l1.code, '(no_xbs)') AS xbs_l1_code,
            SUM(fc.value) AS baseline_amount
        FROM [fc].[facts] fc
        LEFT JOIN [xbs].[node] n ON n.id = fc.xbs_node_id AND ISNULL(n.cancellato, 0) = 0
        OUTER APPLY (
            SELECT TOP 1 a.code
            FROM [xbs].[node] a
            WHERE a.tree_kind_id = n.tree_kind_id
              AND a.node_path = CASE WHEN n.depth <= 1 THEN n.node_path
                                      ELSE n.node_path.GetAncestor(n.depth - 1)
                                 END
              AND ISNULL(a.cancellato, 0) = 0
        ) n_l1
        WHERE fc.program_id = @prog AND ISNULL(fc.cancellato, 0) = 0
          AND fc.forecast_code = @baseline_scn_code
          AND (@yf IS NULL OR fc.time_month_id >= @yf * 100 + 1)
          AND (@yt IS NULL OR fc.time_month_id <= @yt * 100 + 12)
        GROUP BY fc.program_id, fc.time_month_id, n_l1.code
    ),

    -- ── CTE 3: PIVOTED — apply window functions + variances + conditionals ──
    pivoted AS (
        SELECT
            b.time_month_id,
            b.year_num,
            b.xbs_l1_code,
            b.xbs_l1_name,
            b.tree_kind,
            b.planned, b.actual, b.committed, b.balance,
            b.target_amount, b.committed_eav,
            b.forecast_optimistic, b.forecast_likely, b.forecast_pessimistic,

            -- (2) RUNNING TOTALS — SUM OVER window, partitioned per (XBS_L1, year)
            -- Sostituisce il self-join legacy O(N^2) con un window function O(N log N)
            SUM(b.planned) OVER (
                PARTITION BY b.xbs_l1_code, b.year_num
                ORDER BY b.time_month_id
                ROWS UNBOUNDED PRECEDING
            ) AS planned_ytd,
            SUM(b.actual) OVER (
                PARTITION BY b.xbs_l1_code, b.year_num
                ORDER BY b.time_month_id
                ROWS UNBOUNDED PRECEDING
            ) AS actual_ytd,

            -- (4) CONDITIONAL PAST/FUTURE SPLIT
            CASE WHEN b.time_month_id < @time_now THEN b.actual ELSE NULL END AS actual_past_only,
            CASE WHEN b.time_month_id >= @time_now THEN b.forecast_likely ELSE NULL END AS forecast_future_only,

            -- (3a) VARIANCE: actual vs planned
            (ISNULL(b.actual, 0) - ISNULL(b.planned, 0)) AS variance_amount,
            CASE WHEN b.planned IS NULL OR b.planned = 0 THEN NULL
                 ELSE CAST((ISNULL(b.actual, 0) - b.planned) / b.planned * 100 AS DECIMAL(10,2))
            END AS variance_pct,

            -- (3b) VARIANCE: current vs baseline (drift)
            bl.baseline_amount,
            (ISNULL(b.planned, 0) - ISNULL(bl.baseline_amount, 0)) AS baseline_drift_amount,
            CASE WHEN bl.baseline_amount IS NULL OR bl.baseline_amount = 0 THEN NULL
                 ELSE CAST((ISNULL(b.planned, 0) - bl.baseline_amount) / bl.baseline_amount * 100 AS DECIMAL(10,2))
            END AS baseline_drift_pct,

            -- Forecast spread (pessimistic - optimistic)
            (ISNULL(b.forecast_pessimistic, 0) - ISNULL(b.forecast_optimistic, 0)) AS forecast_spread
        FROM base b
        LEFT JOIN baseline bl
            ON bl.program_id = @prog
           AND bl.time_month_id = b.time_month_id
           AND bl.xbs_l1_code = b.xbs_l1_code
    )

    -- ── OUTPUT: serializza in result_json (rows + totals + metadata) ────────
    SELECT @result_json = (
        SELECT
            -- Header info
            (SELECT id, code, name FROM [core].[program] WHERE id = @prog
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER) AS program,
            @time_now AS time_now_month,
            @baseline_scn_code AS baseline_source_code,
            (SELECT @scn) AS filter_scenario_id,
            JSON_QUERY(CONCAT(N'{"year_from":', ISNULL(CAST(@yf AS NVARCHAR(10)), 'null'),
                              N',"year_to":', ISNULL(CAST(@yt AS NVARCHAR(10)), 'null'), N'}')) AS filter_year_range,

            -- Pivot rows
            (
                SELECT
                    time_month_id, year_num,
                    xbs_l1_code, xbs_l1_name, tree_kind,
                    -- direct measures
                    planned, actual, committed, balance,
                    -- running totals (2)
                    planned_ytd, actual_ytd,
                    -- past/future split (4)
                    actual_past_only, forecast_future_only,
                    -- variance vs planned (3a)
                    variance_amount, variance_pct,
                    -- variance vs baseline (3b)
                    baseline_amount, baseline_drift_amount, baseline_drift_pct,
                    -- EAV measures (5)
                    target_amount,
                    forecast_optimistic, forecast_likely, forecast_pessimistic,
                    forecast_spread
                FROM pivoted
                ORDER BY tree_kind, xbs_l1_code, time_month_id
                FOR JSON PATH
            ) AS rows,

            -- Totals (grand summary)
            (
                SELECT
                    COUNT(*) AS row_count,
                    COUNT(DISTINCT xbs_l1_code) AS xbs_l1_count,
                    COUNT(DISTINCT time_month_id) AS month_count,
                    ISNULL(SUM(planned), 0)              AS total_planned,
                    ISNULL(SUM(actual), 0)               AS total_actual,
                    ISNULL(SUM(committed), 0)            AS total_committed,
                    ISNULL(SUM(actual - planned), 0)     AS total_variance,
                    ISNULL(SUM(baseline_drift_amount), 0) AS total_baseline_drift,
                    ISNULL(SUM(forecast_likely), 0)      AS total_forecast_likely,
                    ISNULL(SUM(target_amount), 0)        AS total_target
                FROM pivoted
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            ) AS totals,

            -- Aggregato per XBS L1 (cross-section, ignora time)
            (
                SELECT
                    xbs_l1_code, xbs_l1_name, tree_kind,
                    ISNULL(SUM(planned), 0) AS planned,
                    ISNULL(SUM(actual), 0)  AS actual,
                    ISNULL(SUM(actual), 0) - ISNULL(SUM(planned), 0) AS variance,
                    ISNULL(SUM(baseline_amount), 0) AS baseline,
                    ISNULL(SUM(baseline_drift_amount), 0) AS baseline_drift,
                    ISNULL(SUM(forecast_likely), 0) AS forecast
                FROM pivoted
                GROUP BY xbs_l1_code, xbs_l1_name, tree_kind
                ORDER BY tree_kind, xbs_l1_code
                FOR JSON PATH
            ) AS by_xbs_l1
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    -- Output row count (input cp.facts rows considered)
    SELECT @result_row_count = COUNT(*)
    FROM [cp].[facts]
    WHERE program_id = @prog AND ISNULL(cancellato, 0) = 0
      AND (@scn IS NULL OR project_scenario_id = @scn)
      AND (@yf  IS NULL OR time_month_id >= @yf * 100 + 1)
      AND (@yt  IS NULL OR time_month_id <= @yt * 100 + 12);
END
GO

PRINT '[90-sp-summary-cost-full] rep.sp_run_summary_cost FULL BODY created';
PRINT '  5 categorie formule pivot implementate:';
PRINT '    (1) Pivot dimensionale (XBS L1 via OUTER APPLY GetAncestor)';
PRINT '    (2) Running totals (SUM OVER window, no self-join)';
PRINT '    (3) Variance — actual vs planned + current vs baseline';
PRINT '    (4) Conditional past-vs-future split (via @time_now)';
PRINT '    (5) EAV scenario × measure (TG/CM/F1/F2/F3 via cp.facts_measure)';
GO
