-- =============================================================================
-- CostCnh_Data — Seed dataset realistico (stress-test grade)
-- =============================================================================
-- Volumi target:
--   core.site          : 8
--   core.currency      : 5 (EUR, USD, GBP, BRL, CNY)
--   core.program_status: 5
--   core.project_class : 10
--   core.project_scen. : 6
--   cp.unit_measure    : 10
--   core.dim_time      : già popolata (mantieni)
--   xbs.tree_kind      : già popolata (mantieni o reseed 6)
--   xbs.node           : ~600 (5 trees × ~120 nodi gerarchici)
--   core.program       : 200
--   core.project       : ~600
--   core.initiative    : 20
--   cp.facts           : ~200.000
--   cp.exchange_rate   : 40
--   cp.fte_hours       : 40
--   cp.hours_currency  : 30
--   cp.supplier_rate   : 30
--   cp.resource_calendar: 96
--   wf.role / resource / allocation : 8 / 60 / ~400
--
-- Pre-req: CostCnh_Data exists con schema completo (10..98).
-- Post: cp.facts_pivot rebuilt via sp_rebuild_facts_pivot se exists.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
SET NOCOUNT ON;
GO

USE [CostCnh_Data];
GO

PRINT '=== Seed start ===';
GO

-- =============================================================================
-- STEP 0: Drop schema-bound objects che bloccano ALTER (RLS + CA helpers + xbs view)
--   Vengono ricreati alla fine (STEP 13).
-- =============================================================================
IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = 'sp_cp_facts_bu_rls')
    DROP SECURITY POLICY [core].[sp_cp_facts_bu_rls];
GO
IF OBJECT_ID(N'[core].[fn_rls_cp_facts]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_rls_cp_facts];
GO
IF OBJECT_ID(N'[core].[fn_program_with_ca]', N'IF') IS NOT NULL
    DROP FUNCTION [core].[fn_program_with_ca];
GO
IF OBJECT_ID(N'[xbs].[vw_node_flat]', N'V') IS NOT NULL
    DROP VIEW [xbs].[vw_node_flat];
GO

-- =============================================================================
-- STEP 1: Disable temporal versioning su core.program, core.project, xbs.node
-- =============================================================================
DECLARE @tt INT;
SELECT @tt = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('core.program');
IF @tt = 2 ALTER TABLE [core].[program] SET (SYSTEM_VERSIONING = OFF);

SELECT @tt = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('core.project');
IF @tt = 2 ALTER TABLE [core].[project] SET (SYSTEM_VERSIONING = OFF);

SELECT @tt = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('xbs.node');
IF @tt = 2 ALTER TABLE [xbs].[node] SET (SYSTEM_VERSIONING = OFF);
GO

-- =============================================================================
-- STEP 2: Cleanup tabelle (DELETE in FK-safe order, top-down)
-- =============================================================================
PRINT '[seed] Cleanup...';

-- Helper: cancella se tabella esiste (idempotente vs schemi non deployati)
DECLARE @sql NVARCHAR(MAX);
DECLARE @tbls TABLE (n INT IDENTITY PRIMARY KEY, full_name NVARCHAR(200));
INSERT INTO @tbls (full_name) VALUES
 -- L0: leaf facts (no FK incoming)
 ('cp.facts_measure'),('cp.spreadsheet_change_log'),('cp.spreadsheet_lock'),
 ('cp.facts_pivot'),('cp.facts'),('fc.facts'),
 ('wf.alloc_pivot'),('wf.allocation_history'),('wf.allocation'),('wf.allocation_scenario'),
 ('wf.resource'),('wf.role'),('wf.cost_center'),
 -- mac
 ('mac.response'),('mac.request'),('mac.cursor'),
 -- uploads
 ('uploads.cell_change'),('uploads.batch_row'),('uploads.batch'),
 -- reporting params history
 ('rep.params_program_cost_history'),('rep.params_program_pivot'),('rep.params_summary_cost'),
 ('rep.params_main_project_make_buy'),('rep.params_monthly_status'),('rep.params_overall_status'),
 ('rep.params_one_page'),('rep.params_site_planning'),('rep.params_worst_planning_projects'),
 ('rep.params_fte_report'),('rep.params_labor_summary'),
 -- custom attributes
 ('core.custom_value'),('core.custom_lookup'),
 ('core.custom_attribute_permission'),('core.custom_attribute_mapping'),('core.custom_attribute'),
 -- initiative
 ('core.initiative_program'),('core.initiative'),
 -- user mappings
 ('core.user_business_unit'),('core.resource_manager'),
 -- rates (no FK incoming to these)
 ('cp.exchange_rate'),('cp.fte_hours'),('cp.hours_currency'),
 ('cp.supplier_rate'),('cp.resource_calendar'),('cp.rate_catalog'),
 -- xbs (FK to program/site, must die before)
 ('xbs.node'),
 -- project (FK to program)
 ('core.project'),
 -- program (self-FK: NULL first)
 ('core.program'),
 -- L2: master data
 ('core.project_scenario'),('core.project_class'),('core.program_status'),('core.site'),
 ('cp.unit_measure'),('core.currency'),
 -- etl
 ('etl.guid_map'),('etl.int_map'),('etl.error'),('etl.run_phase'),('etl.run');

-- Disable temporal history pointers, then loop
DECLARE @i INT = 1, @max INT = (SELECT MAX(n) FROM @tbls);
DECLARE @t NVARCHAR(200);
WHILE @i <= @max
BEGIN
    SELECT @t = full_name FROM @tbls WHERE n = @i;
    IF OBJECT_ID(QUOTENAME(PARSENAME(@t,2)) + '.' + QUOTENAME(PARSENAME(@t,1)), 'U') IS NOT NULL
    BEGIN
        -- Self-FK su core.program: nullify prima del delete
        IF @t = 'core.program'
            EXEC sp_executesql N'UPDATE [core].[program] SET program_parent_id = NULL';
        SET @sql = N'DELETE FROM ' + QUOTENAME(PARSENAME(@t,2)) + N'.' + QUOTENAME(PARSENAME(@t,1));
        EXEC sp_executesql @sql;
    END
    SET @i = @i + 1;
END

DBCC CHECKIDENT ('core.site', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.currency', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.program_status', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.project_class', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.project_scenario', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.program', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.project', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('core.initiative', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.unit_measure', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('xbs.node', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.facts', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('wf.role', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('wf.resource', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('wf.allocation', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('wf.cost_center', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.exchange_rate', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.fte_hours', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.hours_currency', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.supplier_rate', RESEED, 0) WITH NO_INFOMSGS;
DBCC CHECKIDENT ('cp.resource_calendar', RESEED, 0) WITH NO_INFOMSGS;

PRINT '[seed] Cleanup done';
GO

-- =============================================================================
-- STEP 4: Master data
-- =============================================================================
PRINT '[seed] Master data...';

-- Currencies (5)
INSERT INTO [core].[currency] (code, name, symbol, is_active, utente_creazione) VALUES
('EUR', N'Euro',         N'€', 1, 1),
('USD', N'US Dollar',    N'$', 1, 1),
('GBP', N'British Pound', N'£', 1, 1),
('BRL', N'Brazilian Real', N'R$', 1, 1),
('CNY', N'Chinese Yuan', N'¥', 1, 1);

-- Sites (8)
INSERT INTO [core].[site] (code, name, business_unit_id, country_iso, currency_code, is_active, utente_creazione) VALUES
('TO',  N'Torino HQ',         1, 'IT', 'EUR', 1, 1),
('MO',  N'Modena Plant',      1, 'IT', 'EUR', 1, 1),
('CR',  N'Cremona Plant',     1, 'IT', 'EUR', 1, 1),
('BUR', N'Burr Ridge (IL)',   2, 'US', 'USD', 1, 1),
('GOO', N'Goodfield (IL)',    2, 'US', 'USD', 1, 1),
('SP',  N'Sao Paulo Plant',   3, 'BR', 'BRL', 1, 1),
('BAS', N'Basildon (UK)',     4, 'GB', 'GBP', 1, 1),
('PUD', N'Pudong Plant',      5, 'CN', 'CNY', 1, 1);

-- Program statuses (5)
INSERT INTO [core].[program_status] (code, name, is_terminal, sort_order, utente_creazione) VALUES
('DRAFT',    N'Draft',     0, 10, 1),
('ACTIVE',   N'Active',    0, 20, 1),
('ONHOLD',   N'On hold',   0, 30, 1),
('CLOSED',   N'Closed',    1, 40, 1),
('CANCELED', N'Cancelled', 1, 50, 1);

-- Project classes (10)
INSERT INTO [core].[project_class] (code, name, description, utente_creazione) VALUES
('RND',     N'R&D',                 N'Research & Development', 1),
('ENG',     N'Engineering',         N'Engineering programs', 1),
('PROCESS', N'Process',             N'Process improvement', 1),
('QUALITY', N'Quality',             N'Quality & compliance', 1),
('COSTDWN', N'Cost-Down',           N'Cost reduction initiatives', 1),
('NPI',     N'NPI',                 N'New Product Introduction', 1),
('TOOLING', N'Tooling',             N'Tooling & fixtures', 1),
('SAFETY',  N'Safety',              N'Safety upgrades', 1),
('ENV',     N'Environment',         N'Environmental compliance', 1),
('OTHER',   N'Other',               N'Other programs', 1);

-- Project scenarios (6)
INSERT INTO [core].[project_scenario] (code, name, kind, is_active, utente_creazione) VALUES
('ORIG',  N'Original',    1, 1, 1),
('WRK',   N'Working',     1, 1, 1),
('BDG',   N'Budget',      3, 1, 1),
('BL',    N'Baseline',    4, 1, 1),
('FC_Q1', N'Forecast Q1', 1, 1, 1),
('FC_Q2', N'Forecast Q2', 1, 1, 1);

-- Unit measures (10)
INSERT INTO [cp].[unit_measure] (code, name, symbol, kind, utente_creazione) VALUES
('EUR_AMT', N'EUR amount',    N'€',  1, 1),
('USD_AMT', N'USD amount',    N'$',  1, 1),
('GBP_AMT', N'GBP amount',    N'£',  1, 1),
('HOURS',   N'Hours',         N'h',  2, 1),
('DAYS',    N'Days',          N'd',  2, 1),
('FTE',     N'Full-time equiv', N'FTE', 2, 1),
('COUNT',   N'Count',         N'#',  3, 1),
('KG',      N'Kilograms',     N'kg', 4, 1),
('M3',      N'Cubic meters',  N'm³', 4, 1),
('UNITS',   N'Units produced', N'u', 3, 1);
GO

-- =============================================================================
-- STEP 5: XBS tree_kinds + nodes (5 trees × ~120 nodi/tree con gerarchia)
-- =============================================================================
PRINT '[seed] XBS hierarchy...';

-- tree_kind already populated (verifica)
IF NOT EXISTS (SELECT 1 FROM [xbs].[tree_kind] WHERE code='COST') BEGIN
    DELETE FROM [xbs].[tree_kind];
    INSERT INTO [xbs].[tree_kind] (id, code, name, description) VALUES
    (1, 'COST', N'Cost Breakdown Structure', N'Hierarchy of cost types'),
    (2, 'WORK', N'Work Breakdown Structure', N'Hierarchy of work packages'),
    (3, 'ORG',  N'Organizational',          N'Org units & roles'),
    (4, 'PROD', N'Product Breakdown',       N'Product structure'),
    (5, 'GEO',  N'Geographic',              N'Geographic regions');
END

-- Generazione gerarchia XBS:
-- ROOT (depth 0)
--   |- L1.A (depth 1)
--   |    |- L2.A1 (depth 2)
--   |    |    |- L3.A1.1 (depth 3, leaf)
--   |    |    |- L3.A1.2 (depth 3, leaf)
--   |    |- L2.A2 ...
-- 5 tree_kinds × 1 root × 5 L1 × 4 L2 × 6 L3 = 600 nodi (di cui 600 leaf al livello 3)

;WITH
levels AS (
    -- depth=0: root per tree_kind
    SELECT tk.id AS tree_kind_id, 0 AS depth,
           CAST(tk.code AS NVARCHAR(80)) AS code,
           CAST(tk.code AS NVARCHAR(255)) AS name,
           CAST('/' AS NVARCHAR(900)) AS path_str,
           CAST(NULL AS NVARCHAR(900)) AS parent_path
      FROM [xbs].[tree_kind] tk
    UNION ALL
    -- depth=1: 5 per tree
    SELECT l.tree_kind_id, 1, CAST(CONCAT(l.code, '.L1.', n) AS NVARCHAR(80)),
           CAST(CONCAT(l.name, ' / L1-', n) AS NVARCHAR(255)),
           CAST(CONCAT('/', CAST(n AS NVARCHAR(5)), '/') AS NVARCHAR(900)),
           CAST('/' AS NVARCHAR(900))
      FROM (SELECT * FROM levels WHERE depth=0) l
      CROSS JOIN (VALUES (1),(2),(3),(4),(5)) v(n)
    UNION ALL
    -- depth=2: 4 per L1
    SELECT l.tree_kind_id, 2, CAST(CONCAT(l.code, '.L2.', m) AS NVARCHAR(80)),
           CAST(CONCAT(l.name, ' / L2-', m) AS NVARCHAR(255)),
           CAST(CONCAT(l.path_str, CAST(m AS NVARCHAR(5)), '/') AS NVARCHAR(900)),
           l.path_str
      FROM (SELECT * FROM levels WHERE depth=1) l
      CROSS JOIN (VALUES (1),(2),(3),(4)) v(m)
    UNION ALL
    -- depth=3 (LEAF): 6 per L2
    SELECT l.tree_kind_id, 3, CAST(CONCAT(l.code, '.L3.', k) AS NVARCHAR(80)),
           CAST(CONCAT(l.name, ' / L3-', k) AS NVARCHAR(255)),
           CAST(CONCAT(l.path_str, CAST(k AS NVARCHAR(5)), '/') AS NVARCHAR(900)),
           l.path_str
      FROM (SELECT * FROM levels WHERE depth=2) l
      CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6)) v(k)
)
INSERT INTO [xbs].[node] (public_id, node_path, tree_kind_id, site_id, program_id, code, name, description, is_leaf, sort_order, utente_creazione)
SELECT NEWID(),
       CAST(l.path_str AS HIERARCHYID),
       l.tree_kind_id,
       NULL, NULL,
       l.code, l.name, l.name,
       CASE WHEN l.depth = 3 THEN 1 ELSE 0 END,
       0,
       1
  FROM levels l
 ORDER BY l.tree_kind_id, l.path_str
OPTION (MAXRECURSION 1000);

PRINT '[seed] xbs.node done';
GO

-- =============================================================================
-- STEP 6: Programs (200) + Projects (~600)
-- =============================================================================
PRINT '[seed] Programs (200)...';

;WITH base AS (
    SELECT n AS num
      FROM (SELECT TOP 200 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
              FROM sys.columns a CROSS JOIN sys.columns b) x
)
INSERT INTO [core].[program]
  (public_id, code, name, short_description, long_description,
   site_id, program_status_id, project_class_id, project_scenario_id,
   currency_id, is_working, is_private, inherit_conversions, checked_out,
   launch_date, start_date, end_date, planning_end_date, time_now_month_id,
   utente_creazione)
SELECT
    NEWID(),
    CONCAT('PRG-',   FORMAT(b.num, '0000')),
    CONCAT(N'Program ', FORMAT(b.num, '0000'),
           N' — ',
           CHOOSE((b.num % 6)+1, N'Engine refresh', N'Cabin redesign', N'Powertrain hybrid',
                                  N'Hydraulic upgrade', N'Electronics platform', N'Cost reduction wave')),
    CONCAT(N'Short desc #', b.num),
    CONCAT(N'Long description for program #', b.num, N' covering engineering and cost planning across multiple sites and currencies.'),
    ((b.num - 1) % 8) + 1,                     -- site_id 1..8 round-robin
    ((b.num - 1) % 5) + 1,                     -- program_status round-robin
    ((b.num - 1) % 10) + 1,                    -- project_class round-robin
    ((b.num - 1) % 6) + 1,                     -- project_scenario round-robin
    CASE
        WHEN (b.num % 8) IN (4,5) THEN 2       -- USD (Burr Ridge / Goodfield)
        WHEN (b.num % 8) = 6      THEN 4       -- BRL (Sao Paulo)
        WHEN (b.num % 8) = 7      THEN 3       -- GBP (Basildon)
        WHEN (b.num % 8) = 0      THEN 5       -- CNY (Pudong)
        ELSE 1                                 -- EUR (Italian sites)
    END,
    CASE WHEN (b.num % 5) IN (1,2) THEN 1 ELSE 0 END,                       -- is_working
    0, 1, 0,                                                                 -- is_private, inherit_conv, checked_out
    DATEFROMPARTS(2024 + ((b.num-1) % 3), ((b.num-1) % 12)+1, 15),           -- launch_date 2024-2026
    DATEFROMPARTS(2024 + ((b.num-1) % 3), 1, 1),                             -- start_date
    DATEFROMPARTS(2027 + ((b.num-1) % 2), 12, 31),                           -- end_date
    DATEFROMPARTS(2027, 12, 31),                                              -- planning_end_date
    202601,                                                                   -- time_now_month_id
    1
FROM base b;

PRINT '[seed] core.program done';
GO

-- Projects: avg 3 per program (random 2-5)
;WITH proj_gen AS (
    SELECT p.id AS program_id, p.code AS prog_code,
           n.n AS proj_num,
           ((ABS(CAST(CHECKSUM(p.public_id) AS BIGINT)) % 4) + 2) AS proj_total       -- 2-5 per program
      FROM [core].[program] p
      CROSS APPLY (VALUES (1),(2),(3),(4),(5)) n(n)
)
INSERT INTO [core].[project] (public_id, program_id, code, name, description, is_active, sort_order, utente_creazione)
SELECT NEWID(), program_id,
       CONCAT(prog_code, '-P', proj_num),
       CONCAT(N'Project ', proj_num, N' of ', prog_code),
       N'Project description',
       1, proj_num, 1
  FROM proj_gen
 WHERE proj_num <= proj_total;

PRINT '[seed] core.project done';
GO

-- =============================================================================
-- STEP 7: Initiatives (20)
-- =============================================================================
;WITH n20 AS (SELECT TOP 20 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.columns)
INSERT INTO [core].[initiative] (code, name, description, start_date, end_date, is_active, utente_creazione)
SELECT CONCAT('INIT-', FORMAT(n, '00')),
       CONCAT(N'Initiative ', n,
              N' — ',
              CHOOSE((n % 5)+1, N'EV transition', N'Hydrogen R&D', N'Quality 4.0', N'Plant automation', N'Supply chain consolidation')),
       N'Cross-program strategic initiative.',
       DATEFROMPARTS(2024, 1, 1),
       DATEFROMPARTS(2027, 12, 31),
       1, 1
  FROM n20;

-- initiative_program: map random 5-10 program per initiative
INSERT INTO [core].[initiative_program] (initiative_id, program_id, data_creazione, utente_creazione)
SELECT DISTINCT i.id, p.id, SYSUTCDATETIME(), 1
  FROM [core].[initiative] i
  CROSS APPLY (
    SELECT TOP (5 + (ABS(CAST(CHECKSUM(i.id) AS BIGINT)) % 6)) id
      FROM [core].[program]
     ORDER BY (id + i.id * 7) % 200
  ) p;
GO

-- =============================================================================
-- STEP 8: Rates (exchange, fte_hours, hours_currency, supplier, resource_calendar)
-- =============================================================================
PRINT '[seed] Rates...';

-- exchange_rate: 4 base pairs × 5 epoch
;WITH pairs AS (
    SELECT * FROM (VALUES
        (1, 2, 1.0800), (1, 3, 0.8500), (1, 4, 5.4500), (1, 5, 7.7800),  -- EUR -> USD/GBP/BRL/CNY
        (2, 1, 0.9259), (3, 1, 1.1764), (4, 1, 0.1835), (5, 1, 0.1285)    -- inverse
    ) p(fr, t, rate)
), epochs AS (
    SELECT * FROM (VALUES (1, '2023-01-01', '2024-01-01', 1.0500),
                          (2, '2024-01-01', '2025-01-01', 1.0800),
                          (3, '2025-01-01', '2026-01-01', 1.1000),
                          (4, '2026-01-01', '2027-01-01', 1.1200),
                          (5, '2027-01-01', NULL,         1.0900)) e(epoch_num, vf, vt, eur_usd_rate)
)
INSERT INTO [cp].[exchange_rate] (from_currency_id, to_currency_id, valid_from, valid_to, rate, source, utente_creazione)
SELECT p.fr, p.t,
       CAST(e.vf AS DATE),
       CAST(e.vt AS DATE),
       CAST(p.rate * (0.95 + (CAST(e.epoch_num AS DECIMAL(10,4)) / 20.0)) AS DECIMAL(19,8)),
       N'ECB-historical',
       1
  FROM pairs p CROSS JOIN epochs e;

-- fte_hours: 8 role codes × 5 years
;WITH roles_y AS (
    SELECT * FROM (VALUES
        ('SR_ENG'),('JR_ENG'),('PM'),('CAD_DES'),('TEST_ENG'),('MECH'),('QUAL'),('PROC_ENG')
    ) r(code)
)
INSERT INTO [cp].[fte_hours] (role_code, year_num, hours_per_fte, notes, utente_creazione)
SELECT r.code, y.y, 2000.00 - ((ABS(CAST(CHECKSUM(r.code) AS BIGINT)) % 20) * 5.0),
       N'Standard yearly hours per FTE',
       1
  FROM roles_y r CROSS JOIN (VALUES (2023),(2024),(2025),(2026),(2027)) y(y);

-- hours_currency: 5 currencies × 5 years × 1 row each
INSERT INTO [cp].[hours_currency] (currency_id, year_num, hourly_rate, notes, utente_creazione)
SELECT c.id, y.y,
       CASE c.code
           WHEN 'EUR' THEN 65.00 + (y.y - 2023) * 2.5
           WHEN 'USD' THEN 75.00 + (y.y - 2023) * 3.0
           WHEN 'GBP' THEN 70.00 + (y.y - 2023) * 2.8
           WHEN 'BRL' THEN 25.00 + (y.y - 2023) * 1.5
           WHEN 'CNY' THEN 30.00 + (y.y - 2023) * 1.8
       END,
       N'Standard hourly rate',
       1
  FROM [core].[currency] c
  CROSS JOIN (VALUES (2023),(2024),(2025),(2026),(2027)) y(y);

-- supplier_rate: 30 suppliers
;WITH n30 AS (SELECT TOP 30 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.columns)
INSERT INTO [cp].[supplier_rate] (supplier_code, supplier_name, currency_id, year_num, rate, markup_pct, notes, utente_creazione)
SELECT CONCAT('SUP-', FORMAT(n, '000')),
       CONCAT(N'Supplier ', n, N' Co.'),
       ((n - 1) % 5) + 1,                                   -- round-robin currency
       2024 + (n % 3),                                       -- year 2024..2026
       CAST(50 + (ABS(CAST(CHECKSUM(n) AS BIGINT)) % 250) AS DECIMAL(19,4)),
       CAST(5 + (ABS(CAST(CHECKSUM(n) AS BIGINT)) % 20) AS DECIMAL(5,2)),
       N'Negotiated supplier rate',
       1
  FROM n30;

-- resource_calendar: 8 sites × 12 months (anno corrente 2026) → 96
INSERT INTO [cp].[resource_calendar] (site_id, year_num, month_num, working_days, holiday_days, working_hours_per_day, notes, utente_creazione)
SELECT s.id, 2026, m.m,
       CASE WHEN m.m IN (8,12) THEN 15 ELSE 21 END,        -- ago/dic ridotti
       CASE WHEN m.m IN (8,12) THEN 6 ELSE 0 END,
       CASE WHEN s.country_iso IN ('CN') THEN 9.00 ELSE 8.00 END,
       N'2026 calendar',
       1
  FROM [core].[site] s
  CROSS JOIN (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) m(m);
GO

-- =============================================================================
-- STEP 9: Workforce — cost_center, role, resource, allocation
-- =============================================================================
PRINT '[seed] Workforce...';

INSERT INTO [wf].[cost_center] (code, name, business_unit_id, utente_creazione) VALUES
('CC-ENG',  N'Engineering',     1, 1),
('CC-MAN',  N'Manufacturing',   1, 1),
('CC-QUAL', N'Quality',         1, 1),
('CC-FIN',  N'Finance',         0, 1),
('CC-IT',   N'IT',              0, 1);

INSERT INTO [wf].[role] (code, name, category, hourly_rate_default, sort_order, utente_creazione) VALUES
('SR_ENG',   N'Senior Engineer',     N'Engineering',  85.00, 10, 1),
('JR_ENG',   N'Junior Engineer',     N'Engineering',  55.00, 20, 1),
('PM',       N'Project Manager',     N'Management',   95.00, 30, 1),
('CAD_DES',  N'CAD Designer',        N'Design',       60.00, 40, 1),
('TEST_ENG', N'Test Engineer',       N'Engineering',  70.00, 50, 1),
('MECH',     N'Mechanic',            N'Manufacturing', 35.00, 60, 1),
('QUAL',     N'Quality Inspector',   N'Quality',      40.00, 70, 1),
('PROC_ENG', N'Process Engineer',    N'Process',      75.00, 80, 1);

-- Resources: 60 (random allocate to roles/sites)
;WITH n60 AS (SELECT TOP 60 ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.columns a CROSS JOIN sys.columns b)
INSERT INTO [wf].[resource] (public_id, code, first_name, last_name, email,
                              role_id, cost_center_id, site_id, business_unit_id, hire_date, is_active, utente_creazione)
SELECT NEWID(),
       CONCAT('RES-', FORMAT(n, '000')),
       CHOOSE((n % 12) + 1, N'Marco', N'Luca', N'Giovanni', N'Anna', N'Sara', N'Paolo', N'John', N'Maria', N'Wei', N'Lin', N'Pedro', N'Sofia'),
       CHOOSE((n % 10) + 1, N'Rossi', N'Bianchi', N'Verdi', N'Smith', N'Johnson', N'Wang', N'Chen', N'Silva', N'Souza', N'Garcia'),
       CONCAT('res', n, N'@costcnh.local'),
       ((n - 1) % 8) + 1,
       ((n - 1) % 5) + 1,
       ((n - 1) % 8) + 1,
       (((n - 1) % 8) / 2) + 1,
       DATEFROMPARTS(2020 + (n % 6), (n % 12) + 1, 1),
       1, 1
  FROM n60;

-- Allocations: per ogni resource, 6-8 allocations su program/progetto/mese
;WITH res_alloc AS (
    SELECT r.id AS resource_id, r.site_id, r.role_id,
           p.id AS program_id, prj.id AS project_id, t.month_id,
           ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY p.id + t.month_id) AS rn
      FROM [wf].[resource] r
      CROSS APPLY (
          SELECT TOP 8 p2.id
            FROM [core].[program] p2
           WHERE p2.site_id = r.site_id
           ORDER BY (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) + p2.id) % 100
      ) p
      CROSS APPLY (SELECT TOP 1 id FROM [core].[project] WHERE program_id = p.id ORDER BY id) prj
      CROSS APPLY (
          SELECT TOP 1 dt.month_id
            FROM [core].[dim_time] dt
           WHERE dt.month_id BETWEEN 202601 AND 202612
           ORDER BY (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) + dt.month_id + r.id) % 12
      ) t
)
INSERT INTO [wf].[allocation] (resource_id, project_id, program_id, time_month_id,
                                fte_percent, hours, cost_amount, currency_id, utente_creazione)
SELECT ra.resource_id, ra.project_id, ra.program_id, ra.month_id,
       CAST(10 + (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) % 90) AS DECIMAL(7,2)),
       NULL, NULL,
       1, 1
  FROM res_alloc ra WHERE ra.rn <= 8;

PRINT '[seed] wf.allocation done';
GO

-- =============================================================================
-- STEP 10: cp.facts — BIG (~200k rows)
-- =============================================================================
PRINT '[seed] cp.facts (big bulk)...';

-- Per ogni program, scelgo ~30 leaf nodes random e 33 mesi (2024-2026)
;WITH leaves AS (
    SELECT id AS xbs_node_id, tree_kind_id, code, sort_order = ROW_NUMBER() OVER (PARTITION BY tree_kind_id ORDER BY id)
      FROM [xbs].[node] WHERE is_leaf = 1
), months AS (
    SELECT month_id
      FROM [core].[dim_time]
     WHERE month_id BETWEEN 202401 AND 202612
), prog_leaf AS (
    SELECT p.id AS program_id,
           p.currency_id,
           l.xbs_node_id,
           ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) + l.xbs_node_id) % 1000) AS rn
      FROM [core].[program] p
      CROSS JOIN leaves l
     WHERE l.tree_kind_id = 1                                   -- solo COST tree leaves
)
INSERT INTO [cp].[facts] WITH (TABLOCK)
    (time_month_id, program_id, project_id, project_scenario_id, xbs_node_id,
     unit_measure_id, currency_id,
     actual, planned, committed, balance, cancellato, data_creazione, utente_creazione)
SELECT
    m.month_id,
    pl.program_id,
    NULL,                                                       -- project_id NULL al primo seed
    NULL,                                                       -- scenario tracked separately
    pl.xbs_node_id,
    1,                                                          -- unit_measure_id (EUR_AMT)
    pl.currency_id,
    -- actual = planned * (0.6..1.0) (passato), planned future (NULL actual)
    CASE WHEN m.month_id <= 202609 THEN CAST(1000 + (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) % 50000) AS DECIMAL(19,4)) ELSE NULL END,
    CAST(1500 + (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) % 60000) AS DECIMAL(19,4)),
    CAST(CASE WHEN m.month_id BETWEEN 202509 AND 202612
              THEN 500 + (ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) % 30000) ELSE 0 END AS DECIMAL(19,4)),
    CAST((ABS(CAST(CHECKSUM(NEWID()) AS BIGINT)) % 5000) AS DECIMAL(19,4)),
    0, SYSUTCDATETIME(), 1
  FROM prog_leaf pl
  CROSS JOIN months m
 WHERE pl.rn <= 30;                                            -- 30 leaves per program × 36 months × 200 progs ≈ 216k

PRINT '[seed] cp.facts done';
GO

-- =============================================================================
-- STEP 11: Re-enable temporal
-- =============================================================================
PRINT '[seed] Re-enable temporal...';

DECLARE @tt2 INT;
SELECT @tt2 = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('core.program');
IF @tt2 = 0 ALTER TABLE [core].[program] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [core].[program_history], DATA_CONSISTENCY_CHECK = OFF));

SELECT @tt2 = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('core.project');
IF @tt2 = 0 ALTER TABLE [core].[project] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [core].[project_history], DATA_CONSISTENCY_CHECK = OFF));

SELECT @tt2 = temporal_type FROM sys.tables WHERE object_id = OBJECT_ID('xbs.node');
IF @tt2 = 0 ALTER TABLE [xbs].[node] SET (SYSTEM_VERSIONING = ON (HISTORY_TABLE = [xbs].[node_history], DATA_CONSISTENCY_CHECK = OFF));
GO

-- =============================================================================
-- STEP 13: Re-create dropped schema-bound objects
-- =============================================================================
CREATE VIEW [xbs].[vw_node_flat]
WITH SCHEMABINDING
AS
SELECT
    n.id, n.public_id,
    CAST(n.node_path.ToString() AS NVARCHAR(900)) AS path_string,
    n.depth, n.tree_kind_id,
    tk.code AS tree_kind_code, tk.name AS tree_kind_name,
    n.site_id, n.program_id, n.code, n.name, n.description,
    n.is_leaf, n.sort_order,
    CASE
        WHEN n.node_path.GetLevel() = 0 THEN NULL
        ELSE (
            SELECT TOP 1 p.id
            FROM [xbs].[node] p
            WHERE p.node_path = n.node_path.GetAncestor(1)
              AND p.tree_kind_id = n.tree_kind_id
              AND ISNULL(p.cancellato, 0) = 0
        )
    END AS parent_id,
    n.cancellato, n.data_creazione, n.utente_creazione, n.data_modifica, n.utente_modifica
FROM [xbs].[node] n
INNER JOIN [xbs].[tree_kind] tk ON tk.id = n.tree_kind_id
WHERE ISNULL(n.cancellato, 0) = 0;
GO

CREATE FUNCTION [core].[fn_program_with_ca] (@program_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT
        p.id AS program_id, p.code AS program_code, p.name AS program_name,
        cv.attribute_code, cv.attribute_label, cv.value_type,
        cv.value_text, cv.value_number, cv.value_date, cv.value_bool,
        cv.lookup_code, cv.lookup_value, cv.lookup_descr, cv.year_num
      FROM [core].[program] p
      CROSS APPLY [core].[fn_get_custom_values]('core', 'program', CAST(p.id AS NVARCHAR(64)), NULL) cv
     WHERE p.id = @program_id AND ISNULL(p.cancellato, 0) = 0;
GO

CREATE FUNCTION [core].[fn_rls_cp_facts](@program_id INT)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN
    SELECT 1 AS can_see
     WHERE EXISTS (
         SELECT 1
           FROM [core].[program] p
           INNER JOIN [core].[site] s ON s.id = p.site_id
           CROSS APPLY [core].[fn_user_can_see_bu](s.business_unit_id) pred
          WHERE p.id = @program_id
     );
GO

CREATE SECURITY POLICY [core].[sp_cp_facts_bu_rls]
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [cp].[facts],
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [fc].[facts],
    ADD FILTER PREDICATE [core].[fn_rls_cp_facts](program_id) ON [wf].[allocation]
    WITH (STATE = ON);
GO
PRINT '[seed] Schema-bound objects re-created';
GO

-- =============================================================================
-- STEP 12: Refresh cp.facts_pivot (se SP esiste)
-- =============================================================================
IF OBJECT_ID(N'[cp].[sp_rebuild_facts_pivot]', N'P') IS NOT NULL
BEGIN
    PRINT '[seed] Rebuilding cp.facts_pivot...';
    EXEC [cp].[sp_rebuild_facts_pivot];
    DECLARE @pv INT;
    SELECT @pv = COUNT(*) FROM cp.facts_pivot;
    PRINT '[seed] cp.facts_pivot rows = ' + CAST(@pv AS VARCHAR(20));
END
ELSE
    PRINT '[seed] sp_rebuild_facts_pivot non trovato, skip';

-- =============================================================================
-- FINAL STATS
-- =============================================================================
PRINT '';
PRINT '==== FINAL COUNTS ====';
DECLARE @rep TABLE (n VARCHAR(50), v BIGINT);
INSERT INTO @rep
 SELECT 'core.site',           COUNT(*) FROM core.site UNION ALL
 SELECT 'core.currency',       COUNT(*) FROM core.currency UNION ALL
 SELECT 'core.program_status', COUNT(*) FROM core.program_status UNION ALL
 SELECT 'core.project_class',  COUNT(*) FROM core.project_class UNION ALL
 SELECT 'core.project_scenario', COUNT(*) FROM core.project_scenario UNION ALL
 SELECT 'core.program',        COUNT(*) FROM core.program UNION ALL
 SELECT 'core.project',        COUNT(*) FROM core.project UNION ALL
 SELECT 'core.initiative',     COUNT(*) FROM core.initiative UNION ALL
 SELECT 'core.initiative_program', COUNT(*) FROM core.initiative_program UNION ALL
 SELECT 'xbs.node',            COUNT(*) FROM xbs.node UNION ALL
 SELECT 'cp.unit_measure',     COUNT(*) FROM cp.unit_measure UNION ALL
 SELECT 'cp.facts',            COUNT(*) FROM cp.facts UNION ALL
 SELECT 'cp.facts_pivot',      COUNT(*) FROM cp.facts_pivot UNION ALL
 SELECT 'cp.exchange_rate',    COUNT(*) FROM cp.exchange_rate UNION ALL
 SELECT 'cp.fte_hours',        COUNT(*) FROM cp.fte_hours UNION ALL
 SELECT 'cp.hours_currency',   COUNT(*) FROM cp.hours_currency UNION ALL
 SELECT 'cp.supplier_rate',    COUNT(*) FROM cp.supplier_rate UNION ALL
 SELECT 'cp.resource_calendar', COUNT(*) FROM cp.resource_calendar UNION ALL
 SELECT 'wf.role',             COUNT(*) FROM wf.role UNION ALL
 SELECT 'wf.cost_center',      COUNT(*) FROM wf.cost_center UNION ALL
 SELECT 'wf.resource',         COUNT(*) FROM wf.resource UNION ALL
 SELECT 'wf.allocation',       COUNT(*) FROM wf.allocation;

SELECT n, v FROM @rep ORDER BY v DESC;

PRINT '';
PRINT '=== Seed completed ===';
GO
