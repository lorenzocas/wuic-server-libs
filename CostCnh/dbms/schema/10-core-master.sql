-- =============================================================================
-- CostCnh_Data — core schema: master data
-- =============================================================================
-- Entita' master con i 7 audit columns framework + Temporal Tables abilitati
-- su entita' high-value (Program/Project/Scenario) per sostituire il legacy
-- RevisionType/RevisionCounter/RevisionReference hand-rolled versioning.
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

-- ── core.site ────────────────────────────────────────────────────────────────
-- Plant master. Replaces legacy core.Sites + schemi separati offhighway/onhighway
-- (ora discriminate via business_unit_id).
IF OBJECT_ID(N'[core].[site]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[site] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_site PRIMARY KEY CLUSTERED,
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        business_unit_id        INT NOT NULL,                                 -- 1=offhighway, 2=onhighway, 3=cnh
        country_iso             CHAR(2) NULL,
        currency_code           CHAR(3) NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_site_is_active DEFAULT (1),
        -- 7 audit columns framework
        cancellato              BIT NOT NULL CONSTRAINT DF_site_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_site_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_site_code UNIQUE (code)
    );
    CREATE INDEX ix_site_bu ON [core].[site](business_unit_id) WHERE cancellato = 0;
    PRINT '[10-core] core.site created';
END
GO

-- ── core.currency ────────────────────────────────────────────────────────────
IF OBJECT_ID(N'[core].[currency]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[currency] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_currency PRIMARY KEY CLUSTERED,
        code                    CHAR(3) NOT NULL,                              -- ISO-4217 (EUR, USD, ...)
        name                    NVARCHAR(60) NOT NULL,
        symbol                  NVARCHAR(5) NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_currency_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_currency_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_currency_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_currency_code UNIQUE (code)
    );
    PRINT '[10-core] core.currency created';
END
GO

-- ── core.program_status (lookup) ─────────────────────────────────────────────
IF OBJECT_ID(N'[core].[program_status]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[program_status] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_program_status PRIMARY KEY CLUSTERED,
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(100) NOT NULL,
        is_terminal             BIT NOT NULL CONSTRAINT DF_program_status_is_terminal DEFAULT (0),
        sort_order              INT NOT NULL CONSTRAINT DF_program_status_sort_order DEFAULT (0),
        cancellato              BIT NOT NULL CONSTRAINT DF_program_status_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_program_status_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_program_status_code UNIQUE (code)
    );
    PRINT '[10-core] core.program_status created';
END
GO

-- ── core.project_class ───────────────────────────────────────────────────────
IF OBJECT_ID(N'[core].[project_class]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[project_class] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_project_class PRIMARY KEY CLUSTERED,
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_project_class_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_project_class_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_project_class_code UNIQUE (code)
    );
    PRINT '[10-core] core.project_class created';
END
GO

-- ── core.project_scenario ────────────────────────────────────────────────────
-- Sostituisce core.ProjectScenarios.
IF OBJECT_ID(N'[core].[project_scenario]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[project_scenario] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_project_scenario PRIMARY KEY CLUSTERED,
        code                    VARCHAR(50) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        kind                    TINYINT NOT NULL,                              -- 1=working, 2=frozen, 3=budget, 4=baseline
        is_active               BIT NOT NULL CONSTRAINT DF_project_scenario_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_project_scenario_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_project_scenario_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_project_scenario_code UNIQUE (code)
    );
    CREATE INDEX ix_project_scenario_kind ON [core].[project_scenario](kind) WHERE cancellato = 0;
    PRINT '[10-core] core.project_scenario created';
END
GO

-- ── core.program (SYSTEM_VERSIONING ON) ──────────────────────────────────────
-- Sostituisce legacy core.Programs (37 col + RevisionType/Counter/Reference).
-- Versioning automatico via Temporal Tables. Baseline = FOR SYSTEM_TIME AS OF.
-- PK INT IDENTITY (non GUID) per ridurre footprint NC indexes su miliardi facts.
IF OBJECT_ID(N'[core].[program]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[program] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_program PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_program_public_id DEFAULT (NEWSEQUENTIALID()),  -- per integratori esterni
        code                    VARCHAR(30) NOT NULL,
        name                    NVARCHAR(500) NOT NULL,
        short_description       NVARCHAR(100) NULL,
        long_description        NVARCHAR(500) NULL,
        site_id                 INT NOT NULL CONSTRAINT FK_program_site REFERENCES [core].[site](id),
        program_status_id       INT NULL CONSTRAINT FK_program_status REFERENCES [core].[program_status](id),
        project_class_id        INT NULL CONSTRAINT FK_program_project_class REFERENCES [core].[project_class](id),
        project_scenario_id     INT NULL CONSTRAINT FK_program_project_scenario REFERENCES [core].[project_scenario](id),
        program_parent_id       INT NULL CONSTRAINT FK_program_parent REFERENCES [core].[program](id),
        currency_id             INT NULL CONSTRAINT FK_program_currency REFERENCES [core].[currency](id),
        is_working              BIT NOT NULL CONSTRAINT DF_program_is_working DEFAULT (1),
        is_private              BIT NOT NULL CONSTRAINT DF_program_is_private DEFAULT (0),
        inherit_conversions     BIT NOT NULL CONSTRAINT DF_program_inherit_conv DEFAULT (1),
        checked_out             BIT NOT NULL CONSTRAINT DF_program_checked_out DEFAULT (0),
        last_checked_out_at     DATETIME2(3) NULL,
        last_checked_out_user   INT NULL,
        launch_date             DATE NULL,
        start_date              DATE NULL,
        end_date                DATE NULL,
        planning_end_date       DATE NULL,
        time_now_month_id       INT NULL,
        last_contribute_at      DATETIME2(3) NULL,
        comment_short           NVARCHAR(4000) NULL,    -- comment up to 4KB inline; >4KB → core.program_long_text
        -- 7 audit columns framework
        cancellato              BIT NOT NULL CONSTRAINT DF_program_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_program_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        -- temporal
        sys_start               DATETIME2(3) GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        sys_end                 DATETIME2(3) GENERATED ALWAYS AS ROW END   HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME (sys_start, sys_end),
        CONSTRAINT UQ_program_public_id UNIQUE (public_id),
        CONSTRAINT UQ_program_code_site UNIQUE (code, site_id)
    ) WITH (
        SYSTEM_VERSIONING = ON (
            HISTORY_TABLE  = [core].[program_history],
            DATA_CONSISTENCY_CHECK = ON
            -- HISTORY_RETENTION_PERIOD = 7 YEARS  -- uncomment in production
        )
    );

    -- FK-supporting NC indexes (fix orphan-validation slowness)
    CREATE INDEX ix_program_site                ON [core].[program](site_id)                WHERE cancellato = 0;
    CREATE INDEX ix_program_program_status      ON [core].[program](program_status_id)      WHERE cancellato = 0 AND program_status_id IS NOT NULL;
    CREATE INDEX ix_program_project_class       ON [core].[program](project_class_id)       WHERE cancellato = 0 AND project_class_id IS NOT NULL;
    CREATE INDEX ix_program_project_scenario    ON [core].[program](project_scenario_id)    WHERE cancellato = 0 AND project_scenario_id IS NOT NULL;
    CREATE INDEX ix_program_program_parent      ON [core].[program](program_parent_id)      WHERE cancellato = 0 AND program_parent_id IS NOT NULL;
    CREATE INDEX ix_program_code                ON [core].[program](code) INCLUDE (site_id, name) WHERE cancellato = 0;

    PRINT '[10-core] core.program created with SYSTEM_VERSIONING + 6 NC indexes';
END
GO

-- ── core.program_long_text (vertical-partition LOB 1:1) ──────────────────────
IF OBJECT_ID(N'[core].[program_long_text]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[program_long_text] (
        program_id              INT NOT NULL CONSTRAINT PK_program_long_text PRIMARY KEY CLUSTERED
                                CONSTRAINT FK_program_long_text_program REFERENCES [core].[program](id) ON DELETE CASCADE,
        comment_long            NVARCHAR(MAX) NULL,
        notes                   NVARCHAR(MAX) NULL,
        data_modifica           DATETIME2(3) NOT NULL CONSTRAINT DF_program_long_text_data_modifica DEFAULT (SYSUTCDATETIME())
    );
    PRINT '[10-core] core.program_long_text created (vertical partition for LOB)';
END
GO

-- ── core.project ─────────────────────────────────────────────────────────────
-- Org/product structure dentro un Program.
IF OBJECT_ID(N'[core].[project]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[project] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_project PRIMARY KEY CLUSTERED,
        public_id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_project_public_id DEFAULT (NEWSEQUENTIALID()),
        program_id              INT NOT NULL CONSTRAINT FK_project_program REFERENCES [core].[program](id),
        code                    VARCHAR(50) NOT NULL,
        name                    NVARCHAR(500) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_project_is_active DEFAULT (1),
        sort_order              INT NOT NULL CONSTRAINT DF_project_sort_order DEFAULT (0),
        cancellato              BIT NOT NULL CONSTRAINT DF_project_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_project_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        sys_start               DATETIME2(3) GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
        sys_end                 DATETIME2(3) GENERATED ALWAYS AS ROW END   HIDDEN NOT NULL,
        PERIOD FOR SYSTEM_TIME (sys_start, sys_end),
        CONSTRAINT UQ_project_public_id UNIQUE (public_id),
        CONSTRAINT UQ_project_code_program UNIQUE (code, program_id)
    ) WITH (
        SYSTEM_VERSIONING = ON (
            HISTORY_TABLE = [core].[project_history],
            DATA_CONSISTENCY_CHECK = ON
        )
    );
    CREATE INDEX ix_project_program ON [core].[project](program_id) WHERE cancellato = 0;
    PRINT '[10-core] core.project created with SYSTEM_VERSIONING';
END
GO

-- ── core.initiative (strategic groupings) ────────────────────────────────────
IF OBJECT_ID(N'[core].[initiative]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[initiative] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_initiative PRIMARY KEY CLUSTERED,
        code                    VARCHAR(50) NOT NULL,
        name                    NVARCHAR(500) NOT NULL,
        description             NVARCHAR(MAX) NULL,
        owner_user_id           INT NULL,
        start_date              DATE NULL,
        end_date                DATE NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_initiative_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_initiative_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_initiative_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_initiative_code UNIQUE (code)
    );
    PRINT '[10-core] core.initiative created';
END
GO

-- ── core.initiative_program (N:N) ────────────────────────────────────────────
IF OBJECT_ID(N'[core].[initiative_program]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[initiative_program] (
        initiative_id           INT NOT NULL CONSTRAINT FK_initiative_program_initiative REFERENCES [core].[initiative](id) ON DELETE CASCADE,
        program_id              INT NOT NULL CONSTRAINT FK_initiative_program_program REFERENCES [core].[program](id),
        weight                  DECIMAL(5,2) NULL,
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_initiative_program_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        CONSTRAINT PK_initiative_program PRIMARY KEY CLUSTERED (initiative_id, program_id)
    );
    CREATE INDEX ix_initiative_program_program ON [core].[initiative_program](program_id);
    PRINT '[10-core] core.initiative_program created (N:N)';
END
GO

-- ── core.dim_time (calendar dimension) ───────────────────────────────────────
-- Sostituisce facts.Dim_Time. Granularita' mensile. Anchor per partition fact tables.
IF OBJECT_ID(N'[core].[dim_time]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[dim_time] (
        month_id                INT NOT NULL CONSTRAINT PK_dim_time PRIMARY KEY CLUSTERED,  -- YYYYMM
        year                    AS (month_id / 100) PERSISTED,
        month                   AS (month_id % 100) PERSISTED,
        quarter                 AS ((month_id % 100 - 1) / 3 + 1) PERSISTED,
        first_day               DATE NOT NULL,
        last_day                DATE NOT NULL,
        is_fiscal_year_start    BIT NOT NULL CONSTRAINT DF_dim_time_is_fiscal_year_start DEFAULT (0)
    );
    PRINT '[10-core] core.dim_time created';
END
GO

PRINT '[10-core-master] DONE';
GO
