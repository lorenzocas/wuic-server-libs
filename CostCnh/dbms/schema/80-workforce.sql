-- =============================================================================
-- CostCnh_Data — Sprint 5b: workforce schema
-- =============================================================================
-- 4 tabelle workforce + 2 viste pre-aggregate per dashboard boardcontent:
--   - wf.role             — tipologie ruolo (Engineer, Manager, Welder...)
--   - wf.cost_center      — centri di costo
--   - wf.resource         — anagrafica risorse (people)
--   - wf.allocation       — allocazioni time-phased (resource × project × month)
--   - wf.vw_cost_center_summary    — KPI per cost_center × month
--   - wf.vw_business_unit_summary  — KPI per business_unit × month
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

IF SCHEMA_ID('wf') IS NULL EXEC('CREATE SCHEMA [wf]');
GO

-- ── wf.role ──────────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[role]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[role] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_role PRIMARY KEY CLUSTERED,
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(100) NOT NULL,
        category                NVARCHAR(40) NULL,                             -- 'Direct'/'Indirect'/'Overhead'
        hourly_rate_default     DECIMAL(19,4) NULL,
        sort_order              INT NOT NULL CONSTRAINT DF_wf_role_sort_order DEFAULT (0),
        cancellato              BIT NOT NULL CONSTRAINT DF_wf_role_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_wf_role_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_wf_role_code UNIQUE (code)
    );
    PRINT '[80-wf] wf.role created';
END
GO

-- ── wf.cost_center ───────────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[cost_center]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[cost_center] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_cost_center PRIMARY KEY CLUSTERED,
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        site_id                 INT NULL CONSTRAINT FK_wf_cost_center_site REFERENCES [core].[site](id),
        business_unit_id        INT NOT NULL,                                  -- mirror site.business_unit_id (denormalizzato per fast filter)
        manager_user_id         INT NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_wf_cost_center_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_wf_cost_center_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_wf_cost_center_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_wf_cost_center_code UNIQUE (code)
    );
    CREATE INDEX ix_wf_cost_center_site ON [wf].[cost_center](site_id) WHERE cancellato = 0;
    CREATE INDEX ix_wf_cost_center_bu ON [wf].[cost_center](business_unit_id) WHERE cancellato = 0;
    PRINT '[80-wf] wf.cost_center created';
END
GO

-- ── wf.resource ──────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[resource]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[resource] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_resource PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_wf_resource_public_id DEFAULT (NEWSEQUENTIALID()),
        code                    VARCHAR(30) NOT NULL,
        first_name              NVARCHAR(80) NOT NULL,
        last_name               NVARCHAR(80) NOT NULL,
        email                   NVARCHAR(200) NULL,
        role_id                 INT NOT NULL CONSTRAINT FK_wf_resource_role REFERENCES [wf].[role](id),
        cost_center_id          INT NOT NULL CONSTRAINT FK_wf_resource_cost_center REFERENCES [wf].[cost_center](id),
        site_id                 INT NULL CONSTRAINT FK_wf_resource_site REFERENCES [core].[site](id),
        business_unit_id        INT NOT NULL,
        manager_user_id         INT NULL,
        user_id                 INT NULL,                                       -- link a _wuic_utenti se la risorsa ha login
        hire_date               DATE NULL,
        term_date               DATE NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_wf_resource_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_wf_resource_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_wf_resource_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_wf_resource_code UNIQUE (code),
        CONSTRAINT UQ_wf_resource_public_id UNIQUE (public_id)
    );
    CREATE INDEX ix_wf_resource_cost_center ON [wf].[resource](cost_center_id) WHERE cancellato = 0;
    CREATE INDEX ix_wf_resource_role ON [wf].[resource](role_id) WHERE cancellato = 0;
    CREATE INDEX ix_wf_resource_site ON [wf].[resource](site_id) WHERE cancellato = 0;
    CREATE INDEX ix_wf_resource_bu ON [wf].[resource](business_unit_id) WHERE cancellato = 0;
    PRINT '[80-wf] wf.resource created';
END
GO

-- ── wf.allocation (time-phased FTE / hours per resource × project × month) ──
IF OBJECT_ID(N'[wf].[allocation]', N'U') IS NULL
BEGIN
    CREATE TABLE [wf].[allocation] (
        id                      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_wf_allocation PRIMARY KEY CLUSTERED,
        resource_id             INT NOT NULL CONSTRAINT FK_wf_allocation_resource REFERENCES [wf].[resource](id),
        project_id              INT NULL CONSTRAINT FK_wf_allocation_project REFERENCES [core].[project](id),
        program_id              INT NULL CONSTRAINT FK_wf_allocation_program REFERENCES [core].[program](id),
        time_month_id           INT NOT NULL CONSTRAINT FK_wf_allocation_time REFERENCES [core].[dim_time](month_id),
        fte_percent             DECIMAL(5,2) NOT NULL,                          -- 0..100
        hours                   DECIMAL(9,2) NULL,
        cost_amount             DECIMAL(19,4) NULL,
        currency_id             INT NULL CONSTRAINT FK_wf_allocation_currency REFERENCES [core].[currency](id),
        cancellato              BIT NOT NULL CONSTRAINT DF_wf_allocation_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_wf_allocation_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL
    );
    CREATE INDEX ix_wf_allocation_resource_month ON [wf].[allocation](resource_id, time_month_id) WHERE cancellato = 0;
    CREATE INDEX ix_wf_allocation_project_month ON [wf].[allocation](project_id, time_month_id) WHERE cancellato = 0 AND project_id IS NOT NULL;
    CREATE INDEX ix_wf_allocation_program_month ON [wf].[allocation](program_id, time_month_id) WHERE cancellato = 0 AND program_id IS NOT NULL;
    CREATE INDEX ix_wf_allocation_month ON [wf].[allocation](time_month_id) WHERE cancellato = 0;
    PRINT '[80-wf] wf.allocation created (4 NC indexes)';
END
GO

-- ── wf.vw_cost_center_summary ───────────────────────────────────────────────
-- KPI per cost_center × month: total_fte, total_hours, total_cost, resource_count
IF OBJECT_ID(N'[wf].[vw_cost_center_summary]', N'V') IS NOT NULL DROP VIEW [wf].[vw_cost_center_summary];
GO
CREATE VIEW [wf].[vw_cost_center_summary]
AS
SELECT
    cc.id                                 AS cost_center_id,
    cc.code                               AS cost_center_code,
    cc.name                               AS cost_center_name,
    cc.business_unit_id,
    s.code                                AS site_code,
    s.name                                AS site_name,
    a.time_month_id,
    dt.year                               AS year_num,
    dt.month                              AS month_num,
    COUNT(DISTINCT a.resource_id)         AS resource_count,
    CAST(SUM(a.fte_percent) / 100.0 AS DECIMAL(10,2)) AS total_fte,
    CAST(SUM(ISNULL(a.hours, 0)) AS DECIMAL(12,2))    AS total_hours,
    CAST(SUM(ISNULL(a.cost_amount, 0)) AS DECIMAL(19,2)) AS total_cost
FROM [wf].[cost_center] cc
LEFT JOIN [core].[site] s ON s.id = cc.site_id AND ISNULL(s.cancellato, 0) = 0
LEFT JOIN [wf].[allocation] a ON a.resource_id IN (SELECT id FROM [wf].[resource] WHERE cost_center_id = cc.id AND ISNULL(cancellato,0)=0) AND ISNULL(a.cancellato, 0) = 0
LEFT JOIN [core].[dim_time] dt ON dt.month_id = a.time_month_id
WHERE ISNULL(cc.cancellato, 0) = 0
GROUP BY cc.id, cc.code, cc.name, cc.business_unit_id, s.code, s.name, a.time_month_id, dt.year, dt.month;
GO
PRINT '[80-wf] wf.vw_cost_center_summary created';
GO

-- ── wf.vw_business_unit_summary ─────────────────────────────────────────────
IF OBJECT_ID(N'[wf].[vw_business_unit_summary]', N'V') IS NOT NULL DROP VIEW [wf].[vw_business_unit_summary];
GO
CREATE VIEW [wf].[vw_business_unit_summary]
AS
SELECT
    r.business_unit_id,
    CASE r.business_unit_id
        WHEN 1 THEN N'Off-Highway'
        WHEN 2 THEN N'On-Highway'
        WHEN 3 THEN N'CNH HQ'
        ELSE CAST(r.business_unit_id AS NVARCHAR(20))
    END AS business_unit_name,
    a.time_month_id,
    dt.year                               AS year_num,
    dt.month                              AS month_num,
    COUNT(DISTINCT a.resource_id)         AS resource_count,
    COUNT(DISTINCT r.cost_center_id)      AS cost_center_count,
    CAST(SUM(a.fte_percent) / 100.0 AS DECIMAL(10,2)) AS total_fte,
    CAST(SUM(ISNULL(a.hours, 0)) AS DECIMAL(12,2))    AS total_hours,
    CAST(SUM(ISNULL(a.cost_amount, 0)) AS DECIMAL(19,2)) AS total_cost
FROM [wf].[resource] r
LEFT JOIN [wf].[allocation] a ON a.resource_id = r.id AND ISNULL(a.cancellato, 0) = 0
LEFT JOIN [core].[dim_time] dt ON dt.month_id = a.time_month_id
WHERE ISNULL(r.cancellato, 0) = 0
GROUP BY r.business_unit_id, a.time_month_id, dt.year, dt.month;
GO
PRINT '[80-wf] wf.vw_business_unit_summary created';
GO

-- ── wf.vw_allocation_detail ─────────────────────────────────────────────────
-- Flat detail view per il list-grid "Worktask View" (resource × allocation con join cosmetici)
IF OBJECT_ID(N'[wf].[vw_allocation_detail]', N'V') IS NOT NULL DROP VIEW [wf].[vw_allocation_detail];
GO
CREATE VIEW [wf].[vw_allocation_detail]
AS
SELECT
    a.id,
    a.resource_id,
    r.code                                AS resource_code,
    r.first_name + N' ' + r.last_name     AS resource_name,
    r.role_id,
    rl.name                               AS role_name,
    r.cost_center_id,
    cc.name                               AS cost_center_name,
    r.business_unit_id,
    a.project_id,
    p.code                                AS project_code,
    p.name                                AS project_name,
    a.program_id,
    pr.code                               AS program_code,
    a.time_month_id,
    dt.year                               AS year_num,
    dt.month                              AS month_num,
    a.fte_percent,
    a.hours,
    a.cost_amount,
    a.currency_id,
    a.cancellato,
    a.data_creazione,
    a.utente_creazione,
    a.data_modifica,
    a.utente_modifica
FROM [wf].[allocation] a
INNER JOIN [wf].[resource]    r  ON r.id  = a.resource_id    AND ISNULL(r.cancellato,0)=0
INNER JOIN [wf].[role]        rl ON rl.id = r.role_id        AND ISNULL(rl.cancellato,0)=0
INNER JOIN [wf].[cost_center] cc ON cc.id = r.cost_center_id AND ISNULL(cc.cancellato,0)=0
LEFT  JOIN [core].[project]   p  ON p.id  = a.project_id     AND ISNULL(p.cancellato,0)=0
LEFT  JOIN [core].[program]   pr ON pr.id = a.program_id     AND ISNULL(pr.cancellato,0)=0
LEFT  JOIN [core].[dim_time]  dt ON dt.month_id = a.time_month_id
WHERE ISNULL(a.cancellato, 0) = 0;
GO
PRINT '[80-wf] wf.vw_allocation_detail created';
GO

PRINT '[80-workforce] DONE';
GO
