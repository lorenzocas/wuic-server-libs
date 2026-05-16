-- =============================================================================
-- CostCnh — Fixture estesa per testing end-to-end di sp_run_summary_cost
-- =============================================================================
-- Popola cp.facts + cp.facts_measure + fc.facts (baseline) con dati realistici
-- per il programma CNH-PROG-001 across 12 months × 5 XBS L1 nodes.
-- Volume risultante: ~60 cp.facts rows + ~180 facts_measure (3 measure × 60) +
--                   ~60 fc.facts baseline rows.
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

DECLARE @prog_id INT = (SELECT TOP 1 id FROM [core].[program] WHERE code = 'CNH-PROG-001');
DECLARE @scn_bl INT = (SELECT TOP 1 id FROM [core].[project_scenario] WHERE code = 'GLOBAL_BL');
DECLARE @scn_f1 INT = (SELECT TOP 1 id FROM [core].[project_scenario] WHERE code = 'GLOBAL_F1');
DECLARE @unit   INT = (SELECT TOP 1 id FROM [cp].[unit_measure] WHERE code = 'EUR_AMOUNT');
DECLARE @cur_eur INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'EUR');

IF @unit IS NULL
BEGIN
    INSERT INTO [cp].[unit_measure] (code, name, kind) VALUES ('EUR_AMOUNT', N'Importo EUR', 1);
    SET @unit = SCOPE_IDENTITY();
END

-- Clean up previous fixture for this program
DELETE FROM [cp].[facts_measure]
 WHERE facts_id IN (SELECT id FROM [cp].[facts] WHERE program_id = @prog_id);
DELETE FROM [cp].[facts] WHERE program_id = @prog_id;
DELETE FROM [fc].[facts] WHERE program_id = @prog_id;

-- ── Selezioniamo 5 XBS L1 nodes (Material, Labor, Overhead, Steel, Plastic) ─
-- da xbs.node con tree_kind_id=1 (XBS), depth=1 OR 2
DECLARE @xbs_nodes TABLE (rn INT IDENTITY, node_id BIGINT, code VARCHAR(64));
INSERT INTO @xbs_nodes (node_id, code)
SELECT TOP 5 id, code FROM [xbs].[node]
 WHERE tree_kind_id = 1 AND ISNULL(cancellato, 0) = 0 AND depth <= 2
 ORDER BY depth, sort_order, code;

DECLARE @months TABLE (month_id INT);
-- 12 months: 2026-01 .. 2026-12
INSERT INTO @months VALUES (202601),(202602),(202603),(202604),(202605),(202606),(202607),(202608),(202609),(202610),(202611),(202612);

-- ── Insert cp.facts: 5 nodes × 12 months × scenario F1 = 60 rows ────────────
;WITH grid AS (
    SELECT n.node_id, n.code AS xbs_code, n.rn, m.month_id,
           -- Distinct random patterns per node × month (deterministic via formula)
           (1000 + (n.rn * 700) + ((m.month_id - 202601) * 50)) AS planned_val,
           (CASE WHEN m.month_id <= 202606
                 THEN 800 + (n.rn * 600) + ((m.month_id - 202601) * 45)   -- past months: actual realistic
                 ELSE NULL END) AS actual_val,
           (200 + (n.rn * 50)) AS committed_val
    FROM @xbs_nodes n CROSS JOIN @months m
)
INSERT INTO [cp].[facts] (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, currency_id,
                          planned, actual, committed, balance)
SELECT month_id, @prog_id, @scn_f1, node_id, @unit, @cur_eur,
       planned_val, actual_val, committed_val,
       planned_val - ISNULL(actual_val, 0) - committed_val
FROM grid;

DECLARE @inserted_facts INT = @@ROWCOUNT;
PRINT '[fixture] cp.facts: ' + CAST(@inserted_facts AS NVARCHAR(10)) + ' rows';

-- ── Insert cp.facts_measure: EAV per F1/F2/F3 forecast levels ──────────────
-- F1 = optimistic (planned × 0.92)
-- F2 = likely    (planned × 1.00)
-- F3 = pessimistic (planned × 1.18)
-- TG = target    (planned × 0.95)
INSERT INTO [cp].[facts_measure] (facts_id, time_month_id, measure_code, value)
SELECT f.id, f.time_month_id, 'F1', CAST(f.planned * 0.92 AS DECIMAL(19,4))
FROM [cp].[facts] f WHERE f.program_id = @prog_id
UNION ALL
SELECT f.id, f.time_month_id, 'F2', f.planned
FROM [cp].[facts] f WHERE f.program_id = @prog_id
UNION ALL
SELECT f.id, f.time_month_id, 'F3', CAST(f.planned * 1.18 AS DECIMAL(19,4))
FROM [cp].[facts] f WHERE f.program_id = @prog_id
UNION ALL
SELECT f.id, f.time_month_id, 'TG', CAST(f.planned * 0.95 AS DECIMAL(19,4))
FROM [cp].[facts] f WHERE f.program_id = @prog_id;

PRINT '[fixture] cp.facts_measure: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' rows (F1/F2/F3/TG × 60 facts)';

-- ── Insert fc.facts: baseline data (forecast_code='BL') ────────────────────
-- Baseline = planned snapshot fissato a 90% del valore current (simula budget approved prima dell'aggiornamento)
INSERT INTO [fc].[facts] (time_month_id, program_id, project_scenario_id, xbs_node_id, unit_measure_id, currency_id,
                          forecast_code, value)
SELECT f.time_month_id, f.program_id, @scn_bl, f.xbs_node_id, f.unit_measure_id, f.currency_id,
       'BL', CAST(f.planned * 0.90 AS DECIMAL(19,4))
FROM [cp].[facts] f WHERE f.program_id = @prog_id;

PRINT '[fixture] fc.facts: ' + CAST(@@ROWCOUNT AS NVARCHAR(10)) + ' baseline rows';

-- ── Update core.program.time_now_month_id per testare past-vs-future split ─
UPDATE [core].[program] SET time_now_month_id = 202607 WHERE id = @prog_id;
PRINT '[fixture] program.time_now_month_id = 202607 (luglio 2026)';

PRINT '[99-summary-cost-fixture] DONE';
GO
