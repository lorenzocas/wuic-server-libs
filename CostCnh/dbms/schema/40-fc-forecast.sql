-- =============================================================================
-- CostCnh_Data — fc schema: forecast facts + cutoffs (warm)
-- =============================================================================
-- Sostituisce facts.ForecastCutoffs, facts.Forecast* del legacy.
-- IMPORTANTE: fc.facts NON e' system-versioned. La baseline si recupera
-- via cp.facts FOR SYSTEM_TIME AS OF — eliminando completamente il mirror
-- facts.CostPlanning_Facts_BaseLine.
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

-- ── fc.baseline (pointer-only) ───────────────────────────────────────────────
-- Definisce uno snapshot temporale di cp.facts + core.program.
-- Il "freeze" non duplica righe: usa Temporal Tables FOR SYSTEM_TIME AS OF captured_at.
IF OBJECT_ID(N'[fc].[baseline]', N'U') IS NULL
BEGIN
    CREATE TABLE [fc].[baseline] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_baseline PRIMARY KEY CLUSTERED,
        code                    VARCHAR(50) NOT NULL,
        label                   NVARCHAR(200) NOT NULL,
        captured_at             DATETIME2(3) NOT NULL,
        captured_by_user_id     INT NULL,
        scope_program_id        INT NULL CONSTRAINT FK_baseline_program REFERENCES [core].[program](id),  -- NULL = global baseline
        scope_scenario_id       INT NULL CONSTRAINT FK_baseline_scenario REFERENCES [core].[project_scenario](id),
        description             NVARCHAR(MAX) NULL,
        is_promoted             BIT NOT NULL CONSTRAINT DF_baseline_is_promoted DEFAULT (0),
        cancellato              BIT NOT NULL CONSTRAINT DF_baseline_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_baseline_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT UQ_baseline_code UNIQUE (code)
    );
    CREATE INDEX ix_baseline_program ON [fc].[baseline](scope_program_id) WHERE cancellato = 0 AND scope_program_id IS NOT NULL;
    PRINT '[40-fc] fc.baseline created (pointer-only, no duplication)';
END
GO

-- ── fc.forecast_cutoff ───────────────────────────────────────────────────────
-- Cut-off date for forecast recalculation (es. "actuals fino al 2026-04, forecast dal 2026-05").
IF OBJECT_ID(N'[fc].[forecast_cutoff]', N'U') IS NULL
BEGIN
    CREATE TABLE [fc].[forecast_cutoff] (
        id                      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_forecast_cutoff PRIMARY KEY CLUSTERED,
        program_id              INT NOT NULL CONSTRAINT FK_forecast_cutoff_program REFERENCES [core].[program](id),
        scenario_id             INT NULL CONSTRAINT FK_forecast_cutoff_scenario REFERENCES [core].[project_scenario](id),
        cutoff_month_id         INT NOT NULL CONSTRAINT FK_forecast_cutoff_time REFERENCES [core].[dim_time](month_id),
        applied_at              DATETIME2(3) NOT NULL CONSTRAINT DF_forecast_cutoff_applied_at DEFAULT (SYSUTCDATETIME()),
        applied_by_user_id      INT NULL,
        note_short              NVARCHAR(2000) NULL,
        cancellato              BIT NOT NULL CONSTRAINT DF_forecast_cutoff_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_forecast_cutoff_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL
    );
    CREATE INDEX ix_forecast_cutoff_program_month ON [fc].[forecast_cutoff](program_id, cutoff_month_id DESC) WHERE cancellato = 0;
    PRINT '[40-fc] fc.forecast_cutoff created';
END
GO

-- ── fc.facts (forecast measures, warm path) ──────────────────────────────────
-- Misure di forecast a granularita' (program × scenario × xbs × time_month × measure_code).
-- Partizionata su time_month_id come cp.facts → JOIN partition-aligned.
IF OBJECT_ID(N'[fc].[facts]', N'U') IS NULL
BEGIN
    CREATE TABLE [fc].[facts] (
        id                      BIGINT IDENTITY(1,1) NOT NULL,
        time_month_id           INT NOT NULL CONSTRAINT FK_fc_facts_time REFERENCES [core].[dim_time](month_id),
        program_id              INT NOT NULL CONSTRAINT FK_fc_facts_program REFERENCES [core].[program](id),
        project_scenario_id     INT NOT NULL CONSTRAINT FK_fc_facts_scenario REFERENCES [core].[project_scenario](id),
        xbs_node_id             BIGINT NULL CONSTRAINT FK_fc_facts_xbs_node REFERENCES [xbs].[node](id),
        unit_measure_id         INT NOT NULL CONSTRAINT FK_fc_facts_unit_measure REFERENCES [cp].[unit_measure](id),
        currency_id             INT NULL CONSTRAINT FK_fc_facts_currency REFERENCES [core].[currency](id),
        forecast_code           VARCHAR(8) NOT NULL,                           -- 'F1','F2','F3','OPT','PESS', ...
        value                   DECIMAL(19,4) NOT NULL,
        forecast_cutoff_id      INT NULL CONSTRAINT FK_fc_facts_cutoff REFERENCES [fc].[forecast_cutoff](id),
        cancellato              BIT NOT NULL CONSTRAINT DF_fc_facts_cancellato DEFAULT (0),
        data_creazione          DATETIME2(3) NOT NULL CONSTRAINT DF_fc_facts_data_creazione DEFAULT (SYSUTCDATETIME()),
        utente_creazione        INT NULL,
        data_modifica           DATETIME2(3) NULL,
        utente_modifica         INT NULL,
        data_eliminazione       DATETIME2(3) NULL,
        utente_eliminazione     INT NULL,
        CONSTRAINT PK_fc_facts PRIMARY KEY CLUSTERED (time_month_id, program_id, project_scenario_id, id)
            WITH (DATA_COMPRESSION = PAGE)
            ON ps_cp_facts(time_month_id)
    );

    CREATE INDEX ix_fc_facts_scenario  ON [fc].[facts](project_scenario_id)  WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_fc_facts_xbs_node  ON [fc].[facts](xbs_node_id)           WITH (DATA_COMPRESSION = PAGE) ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_fc_facts_cutoff    ON [fc].[facts](forecast_cutoff_id)
        WHERE forecast_cutoff_id IS NOT NULL
        WITH (DATA_COMPRESSION = PAGE)
        ON ps_cp_facts(time_month_id);
    CREATE INDEX ix_fc_facts_program_scenario_month
        ON [fc].[facts](program_id, project_scenario_id, time_month_id)
        INCLUDE (forecast_code, value)
        WITH (DATA_COMPRESSION = PAGE)
        ON ps_cp_facts(time_month_id);

    PRINT '[40-fc] fc.facts created (partitioned, PAGE compression, 4 NC indexes)';
END
GO

PRINT '[40-fc-forecast] DONE';
GO
