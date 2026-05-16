-- =============================================================================
-- CostCnh_Data — cp schema: cost-planning facts (hot path)
-- =============================================================================
-- Sostituisce facts.CostPlanning_Facts (miliardi righe).
--
-- Ottimizzazioni applicate:
--   - PK BIGINT IDENTITY (no GUID → 12 byte saved per row x N indexes)
--   - 5 colonne XBS legacy + 5 mask → 1 sola FK xbs_node_id
--   - Partitioning RANGE RIGHT su time_month_id (mensile, sliding window)
--   - Vertical split: hot table + cp.facts_measure EAV per sparse measures
--   - Drop del 35-col INCLUDE index legacy: rimpiazzato da columnstore NC
--   - FK-supporting NC indexes su tutte le FK
--   - PAGE compression default su tutte le partizioni
--   - Columnstore NC index applicato in script 99-columnstore.sql
--     (separato perche' richiede tabella popolata o gestione partition-by-partition)
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

-- ── cp.unit_measure ──────────────────────────────────────────────────────────
IF OBJECT_ID(N'[cp].[unit_measure]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[unit_measure] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_unit_measure PRIMARY KEY CLUSTERED,
        code                    VARCHAR(20) NOT NULL,
        name                    NVARCHAR(60) NOT NULL,
        symbol                  NVARCHAR(10) NULL,
        kind                    TINYINT NOT NULL,                              -- 1=monetary, 2=hours, 3=count, 4=physical
        cancellato              BIT NOT NULL CONSTRAINT DF_unit_measure_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_unit_measure_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_unit_measure_code UNIQUE (code)
    );
    PRINT '[30-cp] cp.unit_measure created';
END
GO

-- ── cp.facts (hot, partitioned, narrow) ──────────────────────────────────────
-- Hot row: 14 colonne business + 7 audit = 21 col totali.
-- Clustered B-tree (time_month_id, program_id, id) ottimizza:
--   - OLTP point lookups by (program, month)
--   - Time-range scans con partition elimination
-- Columnstore NC index aggiunto in 99-postdeploy.sql per analytics.
IF OBJECT_ID(N'[cp].[facts]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[facts] (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        time_month_id           INT NOT NULL CONSTRAINT FK_facts_time REFERENCES [core].[dim_time](month_id),
        program_id              INT NOT NULL CONSTRAINT FK_facts_program REFERENCES [core].[program](id),
        project_id              INT NULL CONSTRAINT FK_facts_project REFERENCES [core].[project](id),
        project_scenario_id     INT NULL CONSTRAINT FK_facts_scenario REFERENCES [core].[project_scenario](id),
        xbs_node_id             BIGINT NULL CONSTRAINT FK_facts_xbs_node REFERENCES [xbs].[node](id),
        unit_measure_id         INT NOT NULL CONSTRAINT FK_facts_unit_measure REFERENCES [cp].[unit_measure](id),
        currency_id             INT NULL CONSTRAINT FK_facts_currency REFERENCES [core].[currency](id),
        actual                  DECIMAL(19,4) NULL,
        planned                 DECIMAL(19,4) NULL,
        committed               DECIMAL(19,4) NULL,
        balance                 DECIMAL(19,4) NULL,
        -- 7 audit
        cancellato              BIT NOT NULL CONSTRAINT DF_facts_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_facts_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT PK_facts PRIMARY KEY CLUSTERED (time_month_id, program_id, id)
            WITH (DATA_COMPRESSION = PAGE)
            ON ps_cp_facts(time_month_id)
    );

    -- FK-supporting NC indexes
    CREATE INDEX ix_facts_program       ON [cp].[facts](program_id)       WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_facts_project       ON [cp].[facts](project_id)       WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_facts_scenario      ON [cp].[facts](project_scenario_id) WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_facts_xbs_node      ON [cp].[facts](xbs_node_id)      WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_facts_unit_measure  ON [cp].[facts](unit_measure_id)  WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);

    -- Thin covering NC per il path "leggi program + mese → tutti i values"
    CREATE INDEX ix_facts_program_month ON [cp].[facts](program_id, time_month_id)
        INCLUDE (actual, planned, committed, balance)
        WITH (DATA_COMPRESSION = PAGE)
        ON ps_cp_facts(time_month_id);

    PRINT '[30-cp] cp.facts created (partitioned, PAGE compression, 6 NC indexes)';
END
GO

-- ── cp.facts_measure (EAV per sparse extra measures) ─────────────────────────
-- Sostituisce le 7 colonne legacy reserved_1..4 + forecast_1..3 con un EAV:
--   measure_code: 'R1','R2','R3','R4','F1','F2','F3' (o custom per app)
-- Vantaggio: solo le righe non-NULL occupano storage. Risparmio ~30-50% spazio.
IF OBJECT_ID(N'[cp].[facts_measure]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[facts_measure] (
        facts_id                BIGINT NOT NULL,
        time_month_id           INT NOT NULL,                                  -- ridondante ma serve per partitioning identico
        measure_code            VARCHAR(8) NOT NULL,                           -- 'R1', 'R2', 'F1', 'F2', 'F3', ...
        value                   DECIMAL(19,4) NOT NULL,
        data_modifica           DATETIME2(3) NOT NULL CONSTRAINT DF_facts_measure_data_modifica DEFAULT (SYSUTCDATETIME()),
        utente_modifica         INT NULL,
        CONSTRAINT PK_facts_measure PRIMARY KEY CLUSTERED (time_month_id, facts_id, measure_code)
            WITH (DATA_COMPRESSION = PAGE)
            ON ps_cp_facts(time_month_id),
        CONSTRAINT CK_facts_measure_code CHECK (measure_code IN ('R1','R2','R3','R4','F1','F2','F3','BL','CM','CO','TG'))
    );
    -- NB: no FK su facts_id verso cp.facts perche' la PK di cp.facts e' (time_month_id, program_id, id)
    -- e qui non abbiamo program_id. La consistency e' garantita da application code + trigger su DELETE.
    CREATE INDEX ix_facts_measure_code ON [cp].[facts_measure](measure_code, time_month_id)
        INCLUDE (value)
        WITH (DATA_COMPRESSION = PAGE)
        ON ps_cp_facts(time_month_id);
    PRINT '[30-cp] cp.facts_measure created (EAV sparse + PAGE compression)';
END
GO

-- ── cp.rate_catalog ──────────────────────────────────────────────────────────
-- Tariffe per conversione cost. Legacy facts.RateCatalogs.
IF OBJECT_ID(N'[cp].[rate_catalog]', N'U') IS NULL
BEGIN
    CREATE TABLE [cp].[rate_catalog] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rate_catalog PRIMARY KEY CLUSTERED,
        code                    VARCHAR(50) NOT NULL,
        name                    NVARCHAR(200) NOT NULL,
        valid_from              DATE NOT NULL,
        valid_to                DATE NULL,
        currency_id             INT NOT NULL CONSTRAINT FK_rate_catalog_currency REFERENCES [core].[currency](id),
        unit_measure_id         INT NOT NULL CONSTRAINT FK_rate_catalog_unit_measure REFERENCES [cp].[unit_measure](id),
        rate                    DECIMAL(19,6) NOT NULL,
        is_active               BIT NOT NULL CONSTRAINT DF_rate_catalog_is_active DEFAULT (1),
        cancellato              BIT NOT NULL CONSTRAINT DF_rate_catalog_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_rate_catalog_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_rate_catalog_code_validity UNIQUE (code, valid_from)
    );
    CREATE INDEX ix_rate_catalog_validity ON [cp].[rate_catalog](valid_from, valid_to) WHERE cancellato = 0;
    PRINT '[30-cp] cp.rate_catalog created';
END
GO

PRINT '[30-cp-facts] DONE';
GO
