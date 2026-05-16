-- =============================================================================
-- CostCnh_Data — Sprint 5 (menu big-bang): rates + custom_values + resource_manager
-- =============================================================================
-- Tabelle aggiunte per coprire le voci del Menu_OffHighway.json legacy che
-- non rientravano nel core schema iniziale:
--   - MASTERDATA → Custom Values        → core.custom_value (EAV)
--   - MASTERDATA → Rates → FTE Hours    → cp.fte_hours
--   - MASTERDATA → Rates → Hours/Curr   → cp.hours_currency
--   - MASTERDATA → Rates → Exchange     → cp.exchange_rate
--   - MASTERDATA → Rates → Supplier     → cp.supplier_rate
--   - MASTERDATA → Rates → Calendar     → cp.resource_calendar
--   - ADMINISTRATION → Resource Manager → core.resource_manager (junction)
-- Tutte L1 (CRUD pure): scaffolding metadata → list-grid + parametric-dialog.
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

-- ── core.custom_value (EAV generico, sostituisce CustomAttributes/Values) ───
IF OBJECT_ID(N'[core].[custom_value]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[custom_value] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_custom_value PRIMARY KEY CLUSTERED,
        entity_schema           SYSNAME NOT NULL,
        entity_name             SYSNAME NOT NULL,
        entity_id               NVARCHAR(64) NOT NULL,
        attribute_code          VARCHAR(64) NOT NULL,
        value_text              NVARCHAR(4000) NULL,
        value_number            DECIMAL(19,4) NULL,
        value_date              DATE NULL,
        value_bool              BIT NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_custom_value_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_custom_value_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_custom_value_entity_attr UNIQUE (entity_schema, entity_name, entity_id, attribute_code)
    );
    CREATE INDEX ix_custom_value_entity ON [core].[custom_value](entity_schema, entity_name, entity_id) WHERE cancellato = 0;
    PRINT '[70] core.custom_value created';
END
GO

-- ── cp.fte_hours (FTE → Hours conversion per role/year) ─────────────────────
IF OBJECT_ID(N'[cp].[fte_hours]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[fte_hours] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_fte_hours PRIMARY KEY CLUSTERED,
        role_code               VARCHAR(50) NOT NULL,
        year_num                INT NOT NULL,
        hours_per_fte           DECIMAL(9,2) NOT NULL,
        notes                   NVARCHAR(500) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_fte_hours_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_fte_hours_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_fte_hours_role_year UNIQUE (role_code, year_num)
    );
    PRINT '[70] cp.fte_hours created';
END
GO

-- ── cp.hours_currency (Hours → Currency rate per year) ──────────────────────
IF OBJECT_ID(N'[cp].[hours_currency]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[hours_currency] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_hours_currency PRIMARY KEY CLUSTERED,
        currency_id             INT NOT NULL CONSTRAINT FK_hours_currency_currency REFERENCES [core].[currency](id),
        year_num                INT NOT NULL,
        hourly_rate             DECIMAL(19,4) NOT NULL,
        notes                   NVARCHAR(500) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_hours_currency_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_hours_currency_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_hours_currency_cur_year UNIQUE (currency_id, year_num)
    );
    CREATE INDEX ix_hours_currency_cur ON [cp].[hours_currency](currency_id) WHERE cancellato = 0;
    PRINT '[70] cp.hours_currency created';
END
GO

-- ── cp.exchange_rate (cross-currency rates) ─────────────────────────────────
IF OBJECT_ID(N'[cp].[exchange_rate]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[exchange_rate] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_exchange_rate PRIMARY KEY CLUSTERED,
        from_currency_id        INT NOT NULL CONSTRAINT FK_exchange_rate_from REFERENCES [core].[currency](id),
        to_currency_id          INT NOT NULL CONSTRAINT FK_exchange_rate_to   REFERENCES [core].[currency](id),
        valid_from              DATE NOT NULL,
        valid_to                DATE NULL,
        rate                    DECIMAL(19,8) NOT NULL,
        source                  NVARCHAR(60) NULL,                             -- 'ECB', 'manual', etc.
        cancellato              BIT NOT NULL CONSTRAINT DF_exchange_rate_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_exchange_rate_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_exchange_rate_from_to_from UNIQUE (from_currency_id, to_currency_id, valid_from)
    );
    CREATE INDEX ix_exchange_rate_validity ON [cp].[exchange_rate](valid_from, valid_to) WHERE cancellato = 0;
    PRINT '[70] cp.exchange_rate created';
END
GO

-- ── cp.supplier_rate (markup/standard supplier rate per year) ──────────────
IF OBJECT_ID(N'[cp].[supplier_rate]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[supplier_rate] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_supplier_rate PRIMARY KEY CLUSTERED,
        supplier_code           VARCHAR(50) NOT NULL,
        supplier_name           NVARCHAR(200) NOT NULL,
        currency_id             INT NOT NULL CONSTRAINT FK_supplier_rate_currency REFERENCES [core].[currency](id),
        year_num                INT NOT NULL,
        rate                    DECIMAL(19,4) NOT NULL,
        markup_pct              DECIMAL(5,2) NULL,
        notes                   NVARCHAR(500) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_supplier_rate_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_supplier_rate_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_supplier_rate_sup_year UNIQUE (supplier_code, year_num)
    );
    PRINT '[70] cp.supplier_rate created';
END
GO

-- ── cp.resource_calendar (working days/hours per year per site) ────────────
IF OBJECT_ID(N'[cp].[resource_calendar]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[resource_calendar] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_resource_calendar PRIMARY KEY CLUSTERED,
        site_id                 INT NULL CONSTRAINT FK_resource_calendar_site REFERENCES [core].[site](id),
        year_num                INT NOT NULL,
        month_num               INT NULL,                                       -- NULL = yearly summary, 1-12 = month-specific
        working_days            INT NOT NULL,
        holiday_days            INT NULL,
        notes                   NVARCHAR(500) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_resource_calendar_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_resource_calendar_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL
    );
    CREATE INDEX ix_resource_calendar_site_year ON [cp].[resource_calendar](site_id, year_num) WHERE cancellato = 0;
    PRINT '[70] cp.resource_calendar created';
END
GO

-- ── core.resource_manager (junction: manager → resource → scope) ───────────
-- Resource Manager Admin: chi puo' gestire le risorse di un programma/site.
IF OBJECT_ID(N'[core].[resource_manager]', N'U') IS NULL
BEGIN
    CREATE TABLE [core].[resource_manager] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_resource_manager PRIMARY KEY CLUSTERED,
        manager_user_id         INT NOT NULL,
        managed_user_id         INT NULL,                                       -- NULL = "manages all in scope"
        scope_program_id        INT NULL CONSTRAINT FK_resource_manager_program REFERENCES [core].[program](id),
        scope_site_id           INT NULL CONSTRAINT FK_resource_manager_site REFERENCES [core].[site](id),
        valid_from              DATE NOT NULL CONSTRAINT DF_resource_manager_valid_from DEFAULT (CAST(SYSUTCDATETIME() AS DATE)),
        valid_to                DATE NULL,
        notes                   NVARCHAR(500) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_resource_manager_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_resource_manager_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL
    );
    CREATE INDEX ix_resource_manager_manager ON [core].[resource_manager](manager_user_id) WHERE cancellato = 0;
    CREATE INDEX ix_resource_manager_managed ON [core].[resource_manager](managed_user_id) WHERE cancellato = 0 AND managed_user_id IS NOT NULL;
    PRINT '[70] core.resource_manager created';
END
GO

PRINT '[70-rates-and-extras] DONE';
GO
