-- =============================================================================
-- CostCnh_Data — Post-deploy: columnstore NC index per analytics
-- =============================================================================
-- Da eseguire DOPO il primo carico significativo di righe in cp.facts e fc.facts.
-- Su tabella vuota o quasi vuota, il columnstore funziona ma e' overkill.
--
-- ATTENZIONE: con SYSTEM_VERSIONING ON sulla tabella base, gli ALTER per
-- aggiungere NC columnstore sono supportati senza disattivare il versioning.
-- Verifica `sys.dm_db_column_store_row_group_physical_stats` post-creazione
-- per dimensione segmenti (target: >100k righe per segment per beneficio batch mode).
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

-- ── cp.facts NCCI per analytics ──────────────────────────────────────────────
-- Include solo le colonne usate in reporting:
--   - dimensioni: program_id, project_id, project_scenario_id, xbs_node_id, time_month_id, unit_measure_id, currency_id
--   - misure: actual, planned, committed, balance
-- Per partition-aligned: applichiamo lo stesso scheme.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ncci_cp_facts'
      AND object_id = OBJECT_ID(N'[cp].[facts]')
)
BEGIN
    CREATE NONCLUSTERED COLUMNSTORE INDEX ncci_cp_facts ON [cp].[facts](
        program_id, project_id, project_scenario_id, xbs_node_id,
        time_month_id, unit_measure_id, currency_id,
        actual, planned, committed, balance,
        cancellato
    )
    WHERE cancellato = 0
    ON ps_cp_facts(time_month_id);

    PRINT '[99-postdeploy] cp.facts NCCI created (partition-aligned, filtered cancellato=0)';
END
GO

-- ── fc.facts NCCI ────────────────────────────────────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ncci_fc_facts'
      AND object_id = OBJECT_ID(N'[fc].[facts]')
)
BEGIN
    CREATE NONCLUSTERED COLUMNSTORE INDEX ncci_fc_facts ON [fc].[facts](
        program_id, project_scenario_id, xbs_node_id, forecast_cutoff_id,
        time_month_id, unit_measure_id, currency_id,
        forecast_code, value,
        cancellato
    )
    WHERE cancellato = 0
    ON ps_cp_facts(time_month_id);
    PRINT '[99-postdeploy] fc.facts NCCI created (partition-aligned, filtered cancellato=0)';
END
GO

-- ── audit.access_log NCCI ────────────────────────────────────────────────────
-- Per analytics tipo "top 10 utenti piu' attivi", "audit trail per entita'"
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'ncci_audit_access_log'
      AND object_id = OBJECT_ID(N'[audit].[access_log]')
)
BEGIN
    CREATE NONCLUSTERED COLUMNSTORE INDEX ncci_audit_access_log ON [audit].[access_log](
        user_id, app_module, action, outcome,
        entity_schema, entity_name, time_month_id
    )
    ON ps_cp_facts(time_month_id);
    PRINT '[99-postdeploy] audit.access_log NCCI created (partition-aligned)';
END
GO

-- ── Maintenance script: REORG NCCI batch settimanale ─────────────────────────
-- Va seedato come job dbo.scheduler costcnh_columnstore_reorg con cron='0 3 * * 0' (domenica 03:00)
PRINT '';
PRINT '[99-postdeploy] DONE';
PRINT 'Reminder: seedare in dbo.scheduler il job costcnh_columnstore_reorg per:';
PRINT '  ALTER INDEX ncci_cp_facts ON cp.facts REORGANIZE WITH (COMPRESS_ALL_ROW_GROUPS = ON);';
PRINT '  ALTER INDEX ncci_fc_facts ON fc.facts REORGANIZE WITH (COMPRESS_ALL_ROW_GROUPS = ON);';
PRINT '  ALTER INDEX ncci_audit_access_log ON audit.access_log REORGANIZE WITH (COMPRESS_ALL_ROW_GROUPS = ON);';
GO
