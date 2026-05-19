-- =============================================================================
-- CostCnh — Menu rebuild allineato al legacy Cost_CNH
-- =============================================================================
-- Fase A: Drop top-level template/schema-named residuali dal clone WuicTest
--   (Sales, Application, Warehouse, Purchasing, Samples — template demo)
--   (core, xbs, cp, audit, wf, uploads, rep, mac — schema-named auto-scaffold)
--
-- Fase B: Rename + ridisposizione voci CostCnh business per matchare legacy.
--   Legacy aveva: Programmi/Progetti, Pianificazione (Plan/PlanDetails/PowerEdit),
--   Workforce, Forecast, Reporting (Dashboard/KPI), Revisioni, Upload Massivi,
--   Integrazioni (SAP/BPM/Timesheet/MAC), Amministrazione.
--
-- Fase C: Bump projectmetadataversion per forzare reload metadata client.
-- =============================================================================
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NOCOUNT ON;
GO

USE [CostCnh_Metadata];
GO

DECLARE @t0 DATETIME2 = SYSUTCDATETIME();
PRINT '=== Menu rebuild start ===';

-- =============================================================================
-- FASE A: Drop top-level template/schema residuali (13 voci)
-- =============================================================================
-- Children diretti già 0; drop diretto.
DECLARE @drop_ids TABLE (id INT PRIMARY KEY);
INSERT INTO @drop_ids (id) VALUES
    (3890), -- Sales
    (3893), -- Application
    (3896), -- Warehouse
    (3920), -- Purchasing
    (3959), -- Samples
    (6044), -- core
    (6055), -- xbs
    (6058), -- cp
    (6059), -- audit
    (6098), -- wf
    (6103), -- uploads
    (6104), -- rep
    (6109); -- mac

-- Pulisco eventuali authz puntate ai menu obsoleti
DELETE FROM [_mtdt__tnt__trizzazioni__menus] WHERE mmid IN (SELECT id FROM @drop_ids);

-- Pulisco eventuali figli/nipoti (se per qualche motivo esistessero)
DELETE FROM [_metadati__menu] WHERE mm_parent_id IN (SELECT id FROM @drop_ids);

-- Drop dei top-level
DELETE FROM [_metadati__menu] WHERE mm_id IN (SELECT id FROM @drop_ids);

PRINT '[A] Drop top-level template/schema: 13 voci';

-- =============================================================================
-- FASE B: Rename voci CostCnh per matchare nomi legacy + ridisposizione ordine
-- =============================================================================
-- Mapping: id corrente → nuovo display + ordine + icona

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Pianificazione',
    mm_nome_menu           = 'pianificazione',
    mmordine               = 20,
    mm_icon                = 'pi pi-calculator',
    mm_uri_menu            = ''
WHERE mm_id = 6060;  -- ex "Planning"

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Workforce',
    mm_nome_menu           = 'workforce',
    mmordine               = 30,
    mm_icon                = 'pi pi-users',
    mm_uri_menu            = ''
WHERE mm_id = 6066;  -- ex "Workforce"

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Reporting',
    mm_nome_menu           = 'reporting',
    mmordine               = 40,
    mm_icon                = 'pi pi-chart-bar',
    mm_uri_menu            = ''
WHERE mm_id = 6070;  -- ex "Reporting"

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Anagrafiche',
    mm_nome_menu           = 'anagrafiche',
    mmordine               = 10,
    mm_icon                = 'pi pi-database',
    mm_uri_menu            = ''
WHERE mm_id = 6073;  -- ex "Masterdata"

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Resource Manager',
    mm_nome_menu           = 'resource_manager',
    mmordine               = 50,
    mm_icon                = 'pi pi-user-edit',
    mm_uri_menu            = ''
WHERE mm_id = 6096;  -- "Resource Manager"

UPDATE [_metadati__menu] SET
    mm_display_string_menu = 'Integrazioni',
    mm_nome_menu           = 'integrazioni',
    mmordine               = 60,
    mm_icon                = 'pi pi-sync',
    mm_uri_menu            = ''
WHERE mm_id = 6110;  -- "Integrazioni"

UPDATE [_metadati__menu] SET
    mmordine = 99,
    mm_icon  = 'pi pi-cog'
WHERE mm_id = 750;  -- "Amministrazione" — last

PRINT '[B] Rename + reorder 7 top-level voci business';

-- =============================================================================
-- FASE C: Verifica figli + assicura icona/ord ai children noti
-- =============================================================================
-- Per assicurarci che i children siano coerenti con i nuovi nomi parent.
-- Display names italiani per i submenu più importanti.

-- Sotto "Anagrafiche" (6073): assicuro children utili
-- Le route esistono già nel DB metadata: programs, projects, initiatives, sites,
-- project_classes, project_scenarios, currencies, program_statuses, xbs_nodes,
-- xbs_tree_kinds, custom_values, fte_hours, hours_currency, exchange_rates,
-- supplier_rates, resource_calendars

-- Aggiungo voci anagrafiche mancanti sotto Anagrafiche (6073)
;WITH ana AS (
    SELECT * FROM (VALUES
        ('programs',           'Programmi',           'pi pi-folder',   10),
        ('projects',           'Progetti',            'pi pi-folder-open', 20),
        ('initiatives',        'Iniziative',          'pi pi-flag',     30),
        ('sites',              'Siti',                'pi pi-building', 40),
        ('program_statuses',   'Stati programma',     'pi pi-info-circle', 50),
        ('project_classes',    'Classi progetto',     'pi pi-tag',      60),
        ('project_scenarios',  'Scenari progetto',    'pi pi-clone',    70),
        ('currencies',         'Valute',              'pi pi-euro',     80),
        ('xbs_tree_kinds',     'Tipi gerarchia (XBS)', 'pi pi-list',     90),
        ('xbs_nodes',          'Nodi XBS / WBS',       'pi pi-sitemap',  100),
        ('custom_values',      'Valori personalizzati','pi pi-th-large', 110),
        ('exchange_rates',     'Tassi di cambio',      'pi pi-dollar',  120),
        ('hours_currency',     'Costo orario / valuta','pi pi-clock',   130),
        ('fte_hours',          'Ore FTE / ruolo',      'pi pi-calendar',140),
        ('supplier_rates',     'Tariffe fornitori',    'pi pi-shopping-cart', 150),
        ('resource_calendars', 'Calendari risorse',    'pi pi-calendar-plus', 160)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING ana ON tgt.mm_parent_id = 6073 AND tgt.mm_nome_menu = ana.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = ana.display,
    mm_icon                = ana.icon,
    mmordine               = ana.ord,
    mm_uri_menu            = '#/' + ana.route + '/list',
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6073, ana.route, ana.display, '#/' + ana.route + '/list', ana.icon, ana.ord, 1);

PRINT '[C.1] Anagrafiche children syncate';

-- Sotto "Pianificazione" (6060): plan_facts, e link al legacy concepts
;WITH pln AS (
    SELECT * FROM (VALUES
        ('plan_facts',          'Plan facts (PowerEdit)', 'pi pi-table',          10),
        ('project_history',     'Storico progetti',       'pi pi-history',        20),
        ('program_history',     'Storico programmi',      'pi pi-history',        30),
        ('xbs_node_history',    'Storico XBS',            'pi pi-history',        40)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING pln ON tgt.mm_parent_id = 6060 AND tgt.mm_nome_menu = pln.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = pln.display,
    mm_icon                = pln.icon,
    mmordine               = pln.ord,
    mm_uri_menu            = '#/' + pln.route + '/list',
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6060, pln.route, pln.display, '#/' + pln.route + '/list', pln.icon, pln.ord, 1);

PRINT '[C.2] Pianificazione children syncate';

-- Sotto "Workforce" (6066): roles, resources, cost_centers, allocations, views, dashboards
;WITH wf AS (
    SELECT * FROM (VALUES
        ('wf_roles',                       'Ruoli',                   'pi pi-id-card',     10),
        ('wf_cost_centers',                'Centri di costo',         'pi pi-briefcase',   20),
        ('wf_resources',                   'Risorse',                 'pi pi-user',        30),
        ('wf_allocations',                 'Allocazioni',             'pi pi-calendar-times', 40),
        ('wf_business_unit_view',          'Vista per BU',            'pi pi-eye',         50),
        ('wf_cost_center_view',            'Vista per CC',            'pi pi-eye',         60),
        ('wf_worktask_view',               'Vista dettaglio task',    'pi pi-eye',         70),
        ('wf_cost_center_dashboard',       'Dashboard Centri costo',  'pi pi-chart-pie',   80),
        ('wf_business_unit_dashboard',     'Dashboard Business Unit', 'pi pi-chart-pie',   90),
        ('wf_chart_cost_by_role',          'Chart: costo per ruolo',  'pi pi-chart-bar',   100),
        ('wf_chart_fte_by_cost_center',    'Chart: FTE per CC',       'pi pi-chart-bar',   110),
        ('wf_chart_fte_by_business_unit',  'Chart: FTE per BU',       'pi pi-chart-bar',   120),
        ('wf_chart_resources_by_role',     'Chart: Risorse per ruolo','pi pi-chart-bar',   130)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING wf ON tgt.mm_parent_id = 6066 AND tgt.mm_nome_menu = wf.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = wf.display,
    mm_icon                = wf.icon,
    mmordine               = wf.ord,
    mm_uri_menu            = CASE
        WHEN wf.route LIKE '%_dashboard' THEN '#/' + wf.route + '/dashboard'
        ELSE '#/' + wf.route + '/list'
    END,
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6066, wf.route, wf.display, CASE
    WHEN wf.route LIKE '%_dashboard' THEN '#/' + wf.route + '/dashboard'
    ELSE '#/' + wf.route + '/list'
  END, wf.icon, wf.ord, 1);

PRINT '[C.3] Workforce children syncate';

-- Sotto "Reporting" (6070): reports, executions, params
;WITH rep AS (
    SELECT * FROM (VALUES
        ('rep_reports',                      'Report definiti',       'pi pi-file', 10),
        ('rep_executions',                   'Esecuzioni report',     'pi pi-play', 20),
        ('rep_params_summary_cost',          'Param: Summary Cost',   'pi pi-cog',  30),
        ('rep_params_program_pivot',         'Param: Program Pivot',  'pi pi-cog',  40),
        ('rep_params_monthly_status',        'Param: Monthly Status', 'pi pi-cog',  50),
        ('rep_params_site_planning',         'Param: Site Planning',  'pi pi-cog',  60),
        ('rep_params_overall_status',        'Param: Overall Status', 'pi pi-cog',  70),
        ('rep_params_worst_planning_projects','Param: Worst Planning','pi pi-cog',  80),
        ('rep_params_fte_report',            'Param: FTE Report',     'pi pi-cog',  90)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING rep ON tgt.mm_parent_id = 6070 AND tgt.mm_nome_menu = rep.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = rep.display,
    mm_icon                = rep.icon,
    mmordine               = rep.ord,
    mm_uri_menu            = '#/' + rep.route + '/list',
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6070, rep.route, rep.display, '#/' + rep.route + '/list', rep.icon, rep.ord, 1);

PRINT '[C.4] Reporting children syncate';

-- Sotto "Resource Manager" (6096): resource_managers
;WITH rm AS (
    SELECT * FROM (VALUES
        ('resource_managers', 'Gestori risorse', 'pi pi-user-edit', 10)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING rm ON tgt.mm_parent_id = 6096 AND tgt.mm_nome_menu = rm.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = rm.display,
    mm_icon                = rm.icon,
    mmordine               = rm.ord,
    mm_uri_menu            = '#/' + rm.route + '/list',
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6096, rm.route, rm.display, '#/' + rm.route + '/list', rm.icon, rm.ord, 1);

PRINT '[C.5] Resource Manager children syncate';

-- Sotto "Integrazioni" (6110): mac, uploads, history_log
;WITH ig AS (
    SELECT * FROM (VALUES
        ('mac_requests',    'Richieste MAC (out)',   'pi pi-send',         10),
        ('mac_responses',   'Risposte MAC (in)',     'pi pi-inbox',        20),
        ('uploads_batches', 'Upload massivi',        'pi pi-upload',       30),
        ('history_log',     'Storico modifiche',     'pi pi-history',      40)
    ) v(route, display, icon, ord)
)
MERGE INTO [_metadati__menu] AS tgt
USING ig ON tgt.mm_parent_id = 6110 AND tgt.mm_nome_menu = ig.route
WHEN MATCHED THEN UPDATE SET
    mm_display_string_menu = ig.display,
    mm_icon                = ig.icon,
    mmordine               = ig.ord,
    mm_uri_menu            = '#/' + ig.route + '/list',
    mm_is_visible_by_default = 1
WHEN NOT MATCHED THEN INSERT
    (mm_parent_id, mm_nome_menu, mm_display_string_menu, mm_uri_menu, mm_icon, mmordine, mm_is_visible_by_default)
VALUES (6110, ig.route, ig.display, '#/' + ig.route + '/list', ig.icon, ig.ord, 1);

PRINT '[C.6] Integrazioni children syncate';

-- =============================================================================
-- FASE D: Bump projectmetadataversion per forzare client reload
-- =============================================================================
UPDATE [sys_info] SET projectmetadataversion = CONVERT(VARCHAR(20), SYSUTCDATETIME(), 112)
                                              + REPLACE(CONVERT(VARCHAR(8), SYSUTCDATETIME(), 108), ':', '');
DECLARE @nv VARCHAR(50) = (SELECT projectmetadataversion FROM [sys_info]);
PRINT '[D] projectmetadataversion bumped to: ' + @nv;

-- =============================================================================
-- FINAL STATS
-- =============================================================================
PRINT '';
PRINT '==== FINAL TOP-LEVEL MENU ====';
SELECT mm_id, mm_display_string_menu, mmordine, mm_icon,
       (SELECT COUNT(*) FROM _metadati__menu c WHERE c.mm_parent_id = m.mm_id) AS children
  FROM _metadati__menu m
 WHERE (mm_parent_id IS NULL OR mm_parent_id = 0)
 ORDER BY mmordine;

PRINT '';
PRINT '=== Menu rebuild completed ===';
GO
