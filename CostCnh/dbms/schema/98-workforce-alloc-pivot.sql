-- =============================================================================
-- CostCnh — W1 8.2: wf.alloc_pivot materialized table + rebuild SP + load SP
-- =============================================================================
-- Equivalente di cp.facts_pivot ma per workforce:
--   - rows = wf.resource (FLAT, no tree)
--   - cols = 12 mesi x 3 measure (fte_percent, hours, cost_amount)
--   - aggregato per (program_id, year_num, resource_id)
--
-- DIFFERENZE vs cp.facts_pivot:
--   - NO hierarchyid roll-up (workforce è flat: resource × month)
--   - NO multi tree_kind
--   - PK semplice: (program_id, year_num, resource_id)
--   - Aggregato across N projects per la stessa coppia (program, resource)
--     (perché un resource puo' essere allocata su piu' projects dello stesso program)
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

IF OBJECT_ID(N'[wf].[alloc_pivot]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[alloc_pivot] (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        program_id              INT NOT NULL,
        year_num                INT NOT NULL,
        resource_id             INT NOT NULL,
        resource_code           NVARCHAR(80) NULL,
        resource_name           NVARCHAR(255) NULL,
        role_code               NVARCHAR(80) NULL,
        cost_center_code        NVARCHAR(80) NULL,

        -- FTE percent (0..100, somma allocations multiple del resource sullo stesso program/month)
        fte_m1  DECIMAL(7,2) NULL, fte_m2  DECIMAL(7,2) NULL, fte_m3  DECIMAL(7,2) NULL,
        fte_m4  DECIMAL(7,2) NULL, fte_m5  DECIMAL(7,2) NULL, fte_m6  DECIMAL(7,2) NULL,
        fte_m7  DECIMAL(7,2) NULL, fte_m8  DECIMAL(7,2) NULL, fte_m9  DECIMAL(7,2) NULL,
        fte_m10 DECIMAL(7,2) NULL, fte_m11 DECIMAL(7,2) NULL, fte_m12 DECIMAL(7,2) NULL,

        -- Hours
        hrs_m1  DECIMAL(11,2) NULL, hrs_m2  DECIMAL(11,2) NULL, hrs_m3  DECIMAL(11,2) NULL,
        hrs_m4  DECIMAL(11,2) NULL, hrs_m5  DECIMAL(11,2) NULL, hrs_m6  DECIMAL(11,2) NULL,
        hrs_m7  DECIMAL(11,2) NULL, hrs_m8  DECIMAL(11,2) NULL, hrs_m9  DECIMAL(11,2) NULL,
        hrs_m10 DECIMAL(11,2) NULL, hrs_m11 DECIMAL(11,2) NULL, hrs_m12 DECIMAL(11,2) NULL,

        -- Cost amount (in default currency del program, no conversion qui)
        cost_m1  DECIMAL(19,4) NULL, cost_m2  DECIMAL(19,4) NULL, cost_m3  DECIMAL(19,4) NULL,
        cost_m4  DECIMAL(19,4) NULL, cost_m5  DECIMAL(19,4) NULL, cost_m6  DECIMAL(19,4) NULL,
        cost_m7  DECIMAL(19,4) NULL, cost_m8  DECIMAL(19,4) NULL, cost_m9  DECIMAL(19,4) NULL,
        cost_m10 DECIMAL(19,4) NULL, cost_m11 DECIMAL(19,4) NULL, cost_m12 DECIMAL(19,4) NULL,

        last_rebuild_utc        DATETIME2(3) NOT NULL CONSTRAINT DF_alloc_pivot_last_rebuild DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_alloc_pivot PRIMARY KEY CLUSTERED (program_id, year_num, resource_id)
            WITH (DATA_COMPRESSION = PAGE),
        CONSTRAINT FK_alloc_pivot_program FOREIGN KEY (program_id) REFERENCES [core].[program](id),
        CONSTRAINT FK_alloc_pivot_resource FOREIGN KEY (resource_id) REFERENCES [wf].[resource](id)
    );

    CREATE INDEX ix_alloc_pivot_program_year
        ON [wf].[alloc_pivot](program_id, year_num)
        INCLUDE (resource_id, role_code, cost_center_code)
        WITH (DATA_COMPRESSION = PAGE);

    PRINT '[98-wf] wf.alloc_pivot created (36 value cols: 12mo x 3 measures)';
END
GO

-- ─── Rebuild SP ───────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[sp_rebuild_alloc_pivot]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_rebuild_alloc_pivot];
GO
CREATE PROCEDURE [wf].[sp_rebuild_alloc_pivot]
    @program_id INT = NULL,
    @year_num   INT = NULL,
    @verbose    BIT = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @scope TABLE (program_id INT, year_num INT, PRIMARY KEY (program_id, year_num));
    INSERT INTO @scope
    SELECT DISTINCT a.program_id, a.time_month_id / 100
      FROM [wf].[allocation] a
     WHERE ISNULL(a.cancellato, 0) = 0
       AND a.program_id IS NOT NULL
       AND (@program_id IS NULL OR a.program_id = @program_id)
       AND (@year_num   IS NULL OR a.time_month_id / 100 = @year_num);

    IF @verbose = 1
        SELECT '[wf rebuild] scope' AS step, COUNT(*) AS scope_rows FROM @scope;

    DELETE p FROM [wf].[alloc_pivot] p
     INNER JOIN @scope s ON s.program_id = p.program_id AND s.year_num = p.year_num;

    ;WITH alloc_pivoted AS (
        SELECT
            a.program_id,
            a.time_month_id / 100 AS year_num,
            a.resource_id,
            SUM(CASE WHEN a.time_month_id % 100 = 1  THEN a.fte_percent END) AS fte_m1,
            SUM(CASE WHEN a.time_month_id % 100 = 2  THEN a.fte_percent END) AS fte_m2,
            SUM(CASE WHEN a.time_month_id % 100 = 3  THEN a.fte_percent END) AS fte_m3,
            SUM(CASE WHEN a.time_month_id % 100 = 4  THEN a.fte_percent END) AS fte_m4,
            SUM(CASE WHEN a.time_month_id % 100 = 5  THEN a.fte_percent END) AS fte_m5,
            SUM(CASE WHEN a.time_month_id % 100 = 6  THEN a.fte_percent END) AS fte_m6,
            SUM(CASE WHEN a.time_month_id % 100 = 7  THEN a.fte_percent END) AS fte_m7,
            SUM(CASE WHEN a.time_month_id % 100 = 8  THEN a.fte_percent END) AS fte_m8,
            SUM(CASE WHEN a.time_month_id % 100 = 9  THEN a.fte_percent END) AS fte_m9,
            SUM(CASE WHEN a.time_month_id % 100 = 10 THEN a.fte_percent END) AS fte_m10,
            SUM(CASE WHEN a.time_month_id % 100 = 11 THEN a.fte_percent END) AS fte_m11,
            SUM(CASE WHEN a.time_month_id % 100 = 12 THEN a.fte_percent END) AS fte_m12,
            SUM(CASE WHEN a.time_month_id % 100 = 1  THEN a.hours END) AS hrs_m1,
            SUM(CASE WHEN a.time_month_id % 100 = 2  THEN a.hours END) AS hrs_m2,
            SUM(CASE WHEN a.time_month_id % 100 = 3  THEN a.hours END) AS hrs_m3,
            SUM(CASE WHEN a.time_month_id % 100 = 4  THEN a.hours END) AS hrs_m4,
            SUM(CASE WHEN a.time_month_id % 100 = 5  THEN a.hours END) AS hrs_m5,
            SUM(CASE WHEN a.time_month_id % 100 = 6  THEN a.hours END) AS hrs_m6,
            SUM(CASE WHEN a.time_month_id % 100 = 7  THEN a.hours END) AS hrs_m7,
            SUM(CASE WHEN a.time_month_id % 100 = 8  THEN a.hours END) AS hrs_m8,
            SUM(CASE WHEN a.time_month_id % 100 = 9  THEN a.hours END) AS hrs_m9,
            SUM(CASE WHEN a.time_month_id % 100 = 10 THEN a.hours END) AS hrs_m10,
            SUM(CASE WHEN a.time_month_id % 100 = 11 THEN a.hours END) AS hrs_m11,
            SUM(CASE WHEN a.time_month_id % 100 = 12 THEN a.hours END) AS hrs_m12,
            SUM(CASE WHEN a.time_month_id % 100 = 1  THEN a.cost_amount END) AS cost_m1,
            SUM(CASE WHEN a.time_month_id % 100 = 2  THEN a.cost_amount END) AS cost_m2,
            SUM(CASE WHEN a.time_month_id % 100 = 3  THEN a.cost_amount END) AS cost_m3,
            SUM(CASE WHEN a.time_month_id % 100 = 4  THEN a.cost_amount END) AS cost_m4,
            SUM(CASE WHEN a.time_month_id % 100 = 5  THEN a.cost_amount END) AS cost_m5,
            SUM(CASE WHEN a.time_month_id % 100 = 6  THEN a.cost_amount END) AS cost_m6,
            SUM(CASE WHEN a.time_month_id % 100 = 7  THEN a.cost_amount END) AS cost_m7,
            SUM(CASE WHEN a.time_month_id % 100 = 8  THEN a.cost_amount END) AS cost_m8,
            SUM(CASE WHEN a.time_month_id % 100 = 9  THEN a.cost_amount END) AS cost_m9,
            SUM(CASE WHEN a.time_month_id % 100 = 10 THEN a.cost_amount END) AS cost_m10,
            SUM(CASE WHEN a.time_month_id % 100 = 11 THEN a.cost_amount END) AS cost_m11,
            SUM(CASE WHEN a.time_month_id % 100 = 12 THEN a.cost_amount END) AS cost_m12
        FROM [wf].[allocation] a
        INNER JOIN @scope s ON s.program_id = a.program_id AND s.year_num = a.time_month_id / 100
        WHERE ISNULL(a.cancellato, 0) = 0
        GROUP BY a.program_id, a.time_month_id / 100, a.resource_id
    )
    INSERT INTO [wf].[alloc_pivot] (
        program_id, year_num, resource_id, resource_code, resource_name, role_code, cost_center_code,
        fte_m1,fte_m2,fte_m3,fte_m4,fte_m5,fte_m6,fte_m7,fte_m8,fte_m9,fte_m10,fte_m11,fte_m12,
        hrs_m1,hrs_m2,hrs_m3,hrs_m4,hrs_m5,hrs_m6,hrs_m7,hrs_m8,hrs_m9,hrs_m10,hrs_m11,hrs_m12,
        cost_m1,cost_m2,cost_m3,cost_m4,cost_m5,cost_m6,cost_m7,cost_m8,cost_m9,cost_m10,cost_m11,cost_m12,
        last_rebuild_utc
    )
    SELECT
        ap.program_id, ap.year_num, ap.resource_id,
        r.code,
        ISNULL(r.first_name, '') + ' ' + ISNULL(r.last_name, '') AS resource_name,
        ro.code, cc.code,
        ap.fte_m1,ap.fte_m2,ap.fte_m3,ap.fte_m4,ap.fte_m5,ap.fte_m6,ap.fte_m7,ap.fte_m8,ap.fte_m9,ap.fte_m10,ap.fte_m11,ap.fte_m12,
        ap.hrs_m1,ap.hrs_m2,ap.hrs_m3,ap.hrs_m4,ap.hrs_m5,ap.hrs_m6,ap.hrs_m7,ap.hrs_m8,ap.hrs_m9,ap.hrs_m10,ap.hrs_m11,ap.hrs_m12,
        ap.cost_m1,ap.cost_m2,ap.cost_m3,ap.cost_m4,ap.cost_m5,ap.cost_m6,ap.cost_m7,ap.cost_m8,ap.cost_m9,ap.cost_m10,ap.cost_m11,ap.cost_m12,
        SYSUTCDATETIME()
    FROM alloc_pivoted ap
    INNER JOIN [wf].[resource] r ON r.id = ap.resource_id AND ISNULL(r.cancellato, 0) = 0
    LEFT JOIN [wf].[role] ro ON ro.id = r.role_id AND ISNULL(ro.cancellato, 0) = 0
    LEFT JOIN [wf].[cost_center] cc ON cc.id = r.cost_center_id AND ISNULL(cc.cancellato, 0) = 0;

    DECLARE @inserted INT = @@ROWCOUNT;
    IF @verbose = 1
        PRINT '[wf rebuild] wf.alloc_pivot inserted rows: ' + CAST(@inserted AS VARCHAR(10));
END
GO

PRINT '[98-wf] wf.sp_rebuild_alloc_pivot created';
GO

-- ─── Load SP ──────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[sp_load_alloc_grid]', N'P') IS NOT NULL
    DROP PROCEDURE [wf].[sp_load_alloc_grid];
GO
CREATE PROCEDURE [wf].[sp_load_alloc_grid]
    @program_id INT,
    @year_num   INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        id, program_id, year_num, resource_id,
        resource_code, resource_name, role_code, cost_center_code,
        fte_m1,fte_m2,fte_m3,fte_m4,fte_m5,fte_m6,fte_m7,fte_m8,fte_m9,fte_m10,fte_m11,fte_m12,
        hrs_m1,hrs_m2,hrs_m3,hrs_m4,hrs_m5,hrs_m6,hrs_m7,hrs_m8,hrs_m9,hrs_m10,hrs_m11,hrs_m12,
        cost_m1,cost_m2,cost_m3,cost_m4,cost_m5,cost_m6,cost_m7,cost_m8,cost_m9,cost_m10,cost_m11,cost_m12,
        last_rebuild_utc
    FROM [wf].[alloc_pivot]
    WHERE program_id = @program_id AND year_num = @year_num
    ORDER BY cost_center_code, role_code, resource_code;
END
GO
PRINT '[98-wf] wf.sp_load_alloc_grid created';
GO

PRINT '[98-wf] === W1 8.2 deployed ===';
PRINT '  - wf.alloc_pivot (36 value cols)';
PRINT '  - wf.sp_rebuild_alloc_pivot (scheduler-ready)';
PRINT '  - wf.sp_load_alloc_grid (snapshot read)';
GO
