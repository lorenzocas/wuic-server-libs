-- =============================================================================
-- CostCnh_Data — Sprint 1 minimal anagrafica seed
-- =============================================================================
-- Popola le lookup-style table (currency, site, program_status, project_class,
-- project_scenario, dim_time) con un set minimo "smoke" cosi' che programs hanno
-- valori reali da puntare in lookup.
-- Idempotente: skippa righe con CODE gia' esistente.
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

-- ── core.currency ────────────────────────────────────────────────────────────
INSERT INTO [core].[currency] (code, name, symbol, is_active)
SELECT v.code, v.name, v.symbol, 1
FROM (VALUES
    ('EUR', N'Euro',           N'EUR'),
    ('USD', N'US Dollar',      N'USD'),
    ('GBP', N'British Pound',  N'GBP'),
    ('BRL', N'Brazilian Real', N'R$')
) v(code, name, symbol)
WHERE NOT EXISTS (SELECT 1 FROM [core].[currency] c WHERE c.code = v.code);
PRINT '[seed] core.currency: rows ensured';
GO

-- ── core.site ────────────────────────────────────────────────────────────────
INSERT INTO [core].[site] (code, name, business_unit_id, country_iso, currency_code, is_active)
SELECT v.code, v.name, v.bu, v.country, v.curr, 1
FROM (VALUES
    ('SMV_OFF', N'San Mauro Off-Highway',   1, 'IT', 'EUR'),
    ('JES_OFF', N'Jesi Off-Highway',        1, 'IT', 'EUR'),
    ('TUR_ON',  N'Torino On-Highway',       2, 'IT', 'EUR'),
    ('FOG_ON',  N'Foggia On-Highway',       2, 'IT', 'EUR'),
    ('CUR_ON',  N'Curitiba CNH',            3, 'BR', 'BRL'),
    ('BUR_CNH', N'Burr Ridge HQ',           3, 'US', 'USD')
) v(code, name, bu, country, curr)
WHERE NOT EXISTS (SELECT 1 FROM [core].[site] s WHERE s.code = v.code);
PRINT '[seed] core.site: rows ensured';
GO

-- ── core.program_status ──────────────────────────────────────────────────────
INSERT INTO [core].[program_status] (code, name, is_terminal, sort_order)
SELECT v.code, v.name, v.is_terminal, v.ord_
FROM (VALUES
    ('DRAFT',     N'Bozza',      0, 10),
    ('ACTIVE',    N'Attivo',     0, 20),
    ('FROZEN',    N'Congelato',  0, 30),
    ('CLOSED',    N'Chiuso',     1, 40),
    ('CANCELLED', N'Cancellato', 1, 50)
) v(code, name, is_terminal, ord_)
WHERE NOT EXISTS (SELECT 1 FROM [core].[program_status] ps WHERE ps.code = v.code);
PRINT '[seed] core.program_status: rows ensured';
GO

-- ── core.project_class ───────────────────────────────────────────────────────
INSERT INTO [core].[project_class] (code, name, description)
SELECT v.code, v.name, v.desc_
FROM (VALUES
    ('RND',  N'R&D',                  N'Ricerca e sviluppo'),
    ('ENG',  N'Engineering',          N'Engineering / industrializzazione'),
    ('MFG',  N'Manufacturing',        N'Manufacturing / produzione'),
    ('AFTM', N'Aftermarket',          N'Aftermarket e parts'),
    ('SUST', N'Sustaining',           N'Sustaining engineering')
) v(code, name, desc_)
WHERE NOT EXISTS (SELECT 1 FROM [core].[project_class] pc WHERE pc.code = v.code);
PRINT '[seed] core.project_class: rows ensured';
GO

-- ── core.project_scenario (kind: 1=working, 2=frozen, 3=budget, 4=baseline) ──
INSERT INTO [core].[project_scenario] (code, name, kind, is_active)
SELECT v.code, v.name, v.kind, 1
FROM (VALUES
    ('GLOBAL_BL',  N'Baseline globale', 4),
    ('GLOBAL_F1',  N'Forecast F1',      1),
    ('GLOBAL_F2',  N'Forecast F2',      1),
    ('GLOBAL_F3',  N'Forecast F3',      1),
    ('BUDGET_2026',N'Budget 2026',      3)
) v(code, name, kind)
WHERE NOT EXISTS (SELECT 1 FROM [core].[project_scenario] sc WHERE sc.code = v.code);
PRINT '[seed] core.project_scenario: rows ensured';
GO

-- ── core.dim_time (sliding window 2018-01 → 2030-12) ─────────────────────────
IF NOT EXISTS (SELECT 1 FROM [core].[dim_time])
BEGIN
    DECLARE @y INT = 2018;
    WHILE @y <= 2030
    BEGIN
        DECLARE @m INT = 1;
        WHILE @m <= 12
        BEGIN
            INSERT INTO [core].[dim_time] (month_id, first_day, last_day, is_fiscal_year_start)
            VALUES (
                @y * 100 + @m,
                DATEFROMPARTS(@y, @m, 1),
                EOMONTH(DATEFROMPARTS(@y, @m, 1)),
                CASE WHEN @m = 1 THEN 1 ELSE 0 END
            );
            SET @m = @m + 1;
        END
        SET @y = @y + 1;
    END
    PRINT '[seed] core.dim_time: 156 month rows inserted (2018-01 → 2030-12)';
END
ELSE
    PRINT '[seed] core.dim_time: already populated (skipped)';
GO

-- ── core.program (2 sample) ──────────────────────────────────────────────────
DECLARE @site_smv INT = (SELECT TOP 1 id FROM [core].[site] WHERE code = 'SMV_OFF');
DECLARE @site_tur INT = (SELECT TOP 1 id FROM [core].[site] WHERE code = 'TUR_ON');
DECLARE @stat_act INT = (SELECT TOP 1 id FROM [core].[program_status] WHERE code = 'ACTIVE');
DECLARE @stat_drf INT = (SELECT TOP 1 id FROM [core].[program_status] WHERE code = 'DRAFT');
DECLARE @cls_eng  INT = (SELECT TOP 1 id FROM [core].[project_class] WHERE code = 'ENG');
DECLARE @cls_mfg  INT = (SELECT TOP 1 id FROM [core].[project_class] WHERE code = 'MFG');
DECLARE @cur_eur  INT = (SELECT TOP 1 id FROM [core].[currency] WHERE code = 'EUR');

IF NOT EXISTS (SELECT 1 FROM [core].[program] WHERE code = 'CNH-PROG-001')
    INSERT INTO [core].[program] (code, name, short_description, site_id, program_status_id, project_class_id, currency_id, launch_date, start_date, end_date, time_now_month_id)
    VALUES ('CNH-PROG-001', N'New Off-Highway 4-cyl engine', N'Programma motore 4-cilindri Off-Highway', @site_smv, @stat_act, @cls_eng, @cur_eur, '2025-01-01', '2024-06-01', '2028-12-31', 202604);

IF NOT EXISTS (SELECT 1 FROM [core].[program] WHERE code = 'CNH-PROG-002')
    INSERT INTO [core].[program] (code, name, short_description, site_id, program_status_id, project_class_id, currency_id, launch_date, start_date, end_date, time_now_month_id)
    VALUES ('CNH-PROG-002', N'Torino tractor cabin redesign', N'Redesign cabina trattore Torino', @site_tur, @stat_drf, @cls_mfg, @cur_eur, '2025-09-01', '2025-03-01', '2027-06-30', 202604);
PRINT '[seed] core.program: 2 sample programs ensured';
GO

PRINT '[seed] anagrafica DONE';
GO
