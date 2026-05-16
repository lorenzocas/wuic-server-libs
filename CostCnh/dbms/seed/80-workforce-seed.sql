-- =============================================================================
-- CostCnh_Data — Sprint 5b workforce sample data
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

-- ── wf.role (8 sample roles) ─────────────────────────────────────────────────
INSERT INTO [wf].[role] (code, name, category, hourly_rate_default, sort_order)
SELECT v.code, v.name, v.cat, v.rate, v.ord
FROM (VALUES
    ('PM',       N'Project Manager',     N'Indirect', 95.00, 10),
    ('ENG_SR',   N'Senior Engineer',     N'Direct',   85.00, 20),
    ('ENG_JR',   N'Junior Engineer',     N'Direct',   55.00, 30),
    ('DESIGNER', N'Designer / CAD',      N'Direct',   65.00, 40),
    ('WELDER',   N'Welder',              N'Direct',   45.00, 50),
    ('ASSEMBLER',N'Assembler',           N'Direct',   42.00, 60),
    ('TESTER',   N'Test Engineer',       N'Direct',   60.00, 70),
    ('ADMIN',    N'Admin / Support',     N'Overhead', 38.00, 80)
) v(code, name, cat, rate, ord)
WHERE NOT EXISTS (SELECT 1 FROM [wf].[role] r WHERE r.code = v.code);
PRINT '[seed] wf.role: ensured';
GO

-- ── wf.cost_center (5 sample cost centers across 3 BU) ──────────────────────
INSERT INTO [wf].[cost_center] (code, name, site_id, business_unit_id, is_active)
SELECT v.code, v.name,
       (SELECT id FROM [core].[site] WHERE code = v.site_code), v.bu, 1
FROM (VALUES
    ('CC_SMV_ENG', N'San Mauro Engineering',   'SMV_OFF', 1),
    ('CC_SMV_MFG', N'San Mauro Manufacturing', 'SMV_OFF', 1),
    ('CC_JES_ENG', N'Jesi Engineering',        'JES_OFF', 1),
    ('CC_TUR_ENG', N'Torino Engineering',      'TUR_ON',  2),
    ('CC_CUR_ENG', N'Curitiba Engineering',    'CUR_ON',  3)
) v(code, name, site_code, bu)
WHERE NOT EXISTS (SELECT 1 FROM [wf].[cost_center] c WHERE c.code = v.code);
PRINT '[seed] wf.cost_center: ensured';
GO

-- ── wf.resource (20 sample resources) ───────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM [wf].[resource] WHERE code = 'R001')
BEGIN
    DECLARE @cc_smv_eng INT = (SELECT id FROM [wf].[cost_center] WHERE code = 'CC_SMV_ENG');
    DECLARE @cc_smv_mfg INT = (SELECT id FROM [wf].[cost_center] WHERE code = 'CC_SMV_MFG');
    DECLARE @cc_jes_eng INT = (SELECT id FROM [wf].[cost_center] WHERE code = 'CC_JES_ENG');
    DECLARE @cc_tur_eng INT = (SELECT id FROM [wf].[cost_center] WHERE code = 'CC_TUR_ENG');
    DECLARE @cc_cur_eng INT = (SELECT id FROM [wf].[cost_center] WHERE code = 'CC_CUR_ENG');

    DECLARE @site_smv INT = (SELECT id FROM [core].[site] WHERE code = 'SMV_OFF');
    DECLARE @site_jes INT = (SELECT id FROM [core].[site] WHERE code = 'JES_OFF');
    DECLARE @site_tur INT = (SELECT id FROM [core].[site] WHERE code = 'TUR_ON');
    DECLARE @site_cur INT = (SELECT id FROM [core].[site] WHERE code = 'CUR_ON');

    DECLARE @pm INT = (SELECT id FROM [wf].[role] WHERE code='PM');
    DECLARE @es INT = (SELECT id FROM [wf].[role] WHERE code='ENG_SR');
    DECLARE @ej INT = (SELECT id FROM [wf].[role] WHERE code='ENG_JR');
    DECLARE @ds INT = (SELECT id FROM [wf].[role] WHERE code='DESIGNER');
    DECLARE @we INT = (SELECT id FROM [wf].[role] WHERE code='WELDER');
    DECLARE @as INT = (SELECT id FROM [wf].[role] WHERE code='ASSEMBLER');
    DECLARE @te INT = (SELECT id FROM [wf].[role] WHERE code='TESTER');
    DECLARE @ad INT = (SELECT id FROM [wf].[role] WHERE code='ADMIN');

    INSERT INTO [wf].[resource] (code, first_name, last_name, email, role_id, cost_center_id, site_id, business_unit_id, hire_date, is_active)
    VALUES
    ('R001', N'Marco',   N'Rossi',     'marco.rossi@cnh.com',   @pm, @cc_smv_eng, @site_smv, 1, '2018-03-15', 1),
    ('R002', N'Anna',    N'Bianchi',   'anna.bianchi@cnh.com',  @es, @cc_smv_eng, @site_smv, 1, '2019-09-01', 1),
    ('R003', N'Luca',    N'Verdi',     'luca.verdi@cnh.com',    @ej, @cc_smv_eng, @site_smv, 1, '2022-01-10', 1),
    ('R004', N'Giulia',  N'Neri',      'giulia.neri@cnh.com',   @ds, @cc_smv_eng, @site_smv, 1, '2020-06-20', 1),
    ('R005', N'Paolo',   N'Galli',     'paolo.galli@cnh.com',   @we, @cc_smv_mfg, @site_smv, 1, '2017-11-05', 1),
    ('R006', N'Sara',    N'Costa',     'sara.costa@cnh.com',    @as, @cc_smv_mfg, @site_smv, 1, '2021-04-12', 1),
    ('R007', N'Davide',  N'Russo',     'davide.russo@cnh.com',  @te, @cc_smv_mfg, @site_smv, 1, '2019-02-28', 1),
    ('R008', N'Elena',   N'Marino',    'elena.marino@cnh.com',  @pm, @cc_jes_eng, @site_jes, 1, '2018-08-15', 1),
    ('R009', N'Roberto', N'Conti',     'roberto.conti@cnh.com', @es, @cc_jes_eng, @site_jes, 1, '2020-03-01', 1),
    ('R010', N'Chiara',  N'Greco',     'chiara.greco@cnh.com',  @ej, @cc_jes_eng, @site_jes, 1, '2023-01-15', 1),
    ('R011', N'Stefano', N'Ferrari',   'stefano.ferrari@cnh.com', @pm, @cc_tur_eng, @site_tur, 2, '2017-05-10', 1),
    ('R012', N'Laura',   N'Romano',    'laura.romano@cnh.com',  @es, @cc_tur_eng, @site_tur, 2, '2019-11-20', 1),
    ('R013', N'Andrea',  N'Esposito',  'andrea.esposito@cnh.com', @es, @cc_tur_eng, @site_tur, 2, '2018-09-01', 1),
    ('R014', N'Francesca', N'Ricci',   'francesca.ricci@cnh.com', @ds, @cc_tur_eng, @site_tur, 2, '2021-02-15', 1),
    ('R015', N'Matteo',  N'Lombardi',  'matteo.lombardi@cnh.com', @te, @cc_tur_eng, @site_tur, 2, '2022-06-30', 1),
    ('R016', N'Joao',    N'Silva',     'joao.silva@cnh.com',    @pm, @cc_cur_eng, @site_cur, 3, '2016-10-12', 1),
    ('R017', N'Maria',   N'Santos',    'maria.santos@cnh.com',  @es, @cc_cur_eng, @site_cur, 3, '2019-07-08', 1),
    ('R018', N'Carlos',  N'Oliveira',  'carlos.oliveira@cnh.com', @ej, @cc_cur_eng, @site_cur, 3, '2023-03-20', 1),
    ('R019', N'Ana',     N'Pereira',   'ana.pereira@cnh.com',   @ds, @cc_cur_eng, @site_cur, 3, '2021-11-01', 1),
    ('R020', N'Lucia',   N'Mancini',   'lucia.mancini@cnh.com', @ad, @cc_smv_eng, @site_smv, 1, '2015-04-01', 1);

    PRINT '[seed] wf.resource: 20 sample resources inserted';
END
ELSE
    PRINT '[seed] wf.resource: already seeded';
GO

-- ── wf.allocation (12 months × 20 resources, with project allocation) ──────
IF NOT EXISTS (SELECT 1 FROM [wf].[allocation])
BEGIN
    DECLARE @prog1 INT = (SELECT id FROM [core].[program] WHERE code = 'CNH-PROG-001');
    DECLARE @prog2 INT = (SELECT id FROM [core].[program] WHERE code = 'CNH-PROG-002');
    DECLARE @eur INT = (SELECT id FROM [core].[currency] WHERE code = 'EUR');

    -- Per ogni mese 2025-10 → 2026-09 (12 mesi), per ogni risorsa, alloca FTE su 1 dei 2 programmi
    DECLARE @m INT;
    DECLARE month_cursor CURSOR FOR
        SELECT month_id FROM [core].[dim_time]
         WHERE month_id BETWEEN 202510 AND 202609
         ORDER BY month_id;
    OPEN month_cursor;
    FETCH NEXT FROM month_cursor INTO @m;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        INSERT INTO [wf].[allocation] (resource_id, project_id, program_id, time_month_id, fte_percent, hours, cost_amount, currency_id)
        SELECT r.id,
               NULL,
               CASE WHEN r.business_unit_id IN (1,3) THEN @prog1 ELSE @prog2 END,
               @m,
               CASE
                   WHEN r.code IN ('R001','R008','R011','R016') THEN 50.0   -- PM: 50%
                   WHEN r.code = 'R020' THEN 30.0                            -- Admin: 30%
                   ELSE 80.0 + ((CAST(SUBSTRING(r.code, 2, 3) AS INT) * 7) % 20)  -- Direct: 80-99%
               END,
               160.0,                                                          -- ~160h/month standard
               160.0 * rl.hourly_rate_default *
                   CASE
                       WHEN r.code IN ('R001','R008','R011','R016') THEN 0.50
                       WHEN r.code = 'R020' THEN 0.30
                       ELSE 0.80 + ((CAST(SUBSTRING(r.code, 2, 3) AS INT) * 7) % 20) / 100.0
                   END,
               @eur
        FROM [wf].[resource] r
        INNER JOIN [wf].[role] rl ON rl.id = r.role_id
        WHERE r.is_active = 1;

        FETCH NEXT FROM month_cursor INTO @m;
    END
    CLOSE month_cursor;
    DEALLOCATE month_cursor;

    PRINT '[seed] wf.allocation: ~240 rows (20 resources x 12 months) inserted';
END
ELSE
    PRINT '[seed] wf.allocation: already seeded';
GO

PRINT '[seed] workforce DONE';
GO
