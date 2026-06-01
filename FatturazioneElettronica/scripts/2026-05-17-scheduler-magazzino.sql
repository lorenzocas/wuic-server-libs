-- =============================================================================
-- 2026-05-17 — Scheduler tasks per Modulo Magazzino
-- =============================================================================
-- Due job ricorrenti:
--   fe_magazzino_alert_sotto_scorta   daily 08:00  -> POST /api/magazzino/alert-sotto-scorta
--   fe_magazzino_riconcilia_giacenze  weekly Sun 03:00 -> POST /api/magazzino/riconcilia-snapshot
--
-- action_type = 2 (HTTP POST) coerente con pattern di altri scheduler FE
-- (vedi sollecito_batch_giornaliero come reference).
-- =============================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

USE FatturazioneElettronica_Metadata;
GO

-- 1) Alert sotto-scorta: daily 08:00
IF NOT EXISTS (SELECT 1 FROM scheduler WHERE event_name = 'fe_magazzino_alert_sotto_scorta')
BEGIN
    INSERT INTO scheduler
        (event_name, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, action_type, action_cmd, params_values, enabled)
    VALUES
        ('fe_magazzino_alert_sotto_scorta',
         1, 0, 0, 0,                                   -- ogni 1 giorno
         CAST('08:00:00' AS TIME),                     -- alle 08:00 ora locale
         '2',                                          -- HTTP POST
         'POST http://localhost:5100/api/magazzino/alert-sotto-scorta',
         '{}',
         1);
    PRINT 'INSERT scheduler: fe_magazzino_alert_sotto_scorta (daily 08:00)';
END
ELSE
    PRINT 'SKIP scheduler (already exists): fe_magazzino_alert_sotto_scorta';
GO

-- 2) Riconcilia giacenze: weekly Sun 03:00 (day_interval=7)
IF NOT EXISTS (SELECT 1 FROM scheduler WHERE event_name = 'fe_magazzino_riconcilia_giacenze')
BEGIN
    INSERT INTO scheduler
        (event_name, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, action_type, action_cmd, params_values, enabled)
    VALUES
        ('fe_magazzino_riconcilia_giacenze',
         7, 0, 0, 0,
         CAST('03:00:00' AS TIME),
         '2',
         'POST http://localhost:5100/api/magazzino/riconcilia-snapshot',
         '{}',
         1);
    PRINT 'INSERT scheduler: fe_magazzino_riconcilia_giacenze (weekly 03:00)';
END
ELSE
    PRINT 'SKIP scheduler (already exists): fe_magazzino_riconcilia_giacenze';
GO

SELECT event_name, day_interval, execution_time, action_cmd
FROM scheduler
WHERE event_name LIKE 'fe_magazzino_%';
GO
