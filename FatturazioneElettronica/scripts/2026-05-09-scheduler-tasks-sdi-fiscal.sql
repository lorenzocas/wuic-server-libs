-- =============================================================================
-- 2026-05-09-scheduler-tasks-sdi-fiscal.sql
--
-- Seed dei task ricorrenti per:
--   1. Polling notifiche SDI dalla casella PEC mittente   (10 min)
--   2. Generazione comunicazioni periodiche fiscali       (LIPE / Esterometro / CU)
--
-- Target DB: **METADATI** (MetaDataSQLConnection in appsettings.json),
-- tabella [dbo].[scheduler]. Eseguito dal framework
-- [WuicCore.Services.Scheduler.SchedulerHostedService] che gia' gira
-- nel processo del backend FE. Vedi:
--   * KonvergenceCore/Services/Scheduler/SchedulerHostedService.cs
--     (lettura righe `enabled=1 AND next_execution<=NOW()`,
--      action_type='2' = HTTP webservice call, formato action_cmd='VERB URL')
--
-- Pattern action_cmd:
--   <VERB> <URL>            (default VERB = POST se mancante)
--   es: 'POST http://localhost:5100/api/sdi/notifications/poll-now'
--
-- VARIABILI sqlcmd (sovrascrivibili):
--   :setvar SchedulerBaseUrl  http://localhost:5100
--   :setvar AdminMail         ops@example.com
--
-- Idempotenza: ogni INSERT e' protetta da NOT EXISTS sull'`event_name`.
-- Per re-applicare uno specifico task: DELETE FROM scheduler WHERE event_name=...
-- e ri-eseguire questo script.
--
-- NB: i comandi `/api/fiscal/*/generate` hanno bisogno dei query string
-- `?anno=YYYY&periodo=...` che variano per anno fiscale. Per non costringere
-- l'operatore a modificare manualmente i 4 task LIPE + 12 Esterometro + 1 CU
-- ogni anno, lo schema seguente registra **task "auto-current"** che chiamano
-- endpoint helper `*/generate-due` (vedi FiscalReportsController) che
-- auto-determinano anno/periodo correnti dal calendario fiscale.
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

:setvar SchedulerBaseUrl "http://localhost:5100"
:setvar AdminMail        ""

-- ----------------------------------------------------------------------------
-- 1) SDI Notifications: poll IMAP della PEC mittente ogni 10 min
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'fe_sdi_notifications_poll')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'fe_sdi_notifications_poll',
         0, 0, 0, 10, 0,
         NULL, NULL, NULL,
         NULL, GETDATE(), NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/sdi/notifications/poll-now',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);

    PRINT 'INSERT scheduler: fe_sdi_notifications_poll (10min)';
END
ELSE
    PRINT 'SKIP scheduler: fe_sdi_notifications_poll (gia esistente)';

-- ----------------------------------------------------------------------------
-- 2) LIPE: generate-due ogni 25 del mese (sara' un no-op se il trimestre
--    corrente non e' ancora chiuso). Frequenza giornaliera con guard
--    server-side cosi' un retry fallisce silenziosamente fino al deadline.
--    Deadline LIPE: 31 mag (Q1), 16 set (Q2), 30 nov (Q3), ult feb (Q4).
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'fe_fiscal_lipe_generate_due')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'fe_fiscal_lipe_generate_due',
         0, 1, 0, 0, 0,
         CAST('02:00:00' AS time), NULL, NULL,
         NULL, DATEADD(day, 1, CAST(GETDATE() AS date)) + CAST('02:00:00' AS datetime),
         NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/fiscal/lipe/generate-due',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);

    PRINT 'INSERT scheduler: fe_fiscal_lipe_generate_due (daily 02:00)';
END
ELSE
    PRINT 'SKIP scheduler: fe_fiscal_lipe_generate_due (gia esistente)';

-- ----------------------------------------------------------------------------
-- 3) Esterometro: mensile entro fine mese successivo. Daily at 02:30 con
--    guard server-side; il generate-due decide se il mese precedente e'
--    chiuso e non ancora generato.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'fe_fiscal_esterometro_generate_due')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'fe_fiscal_esterometro_generate_due',
         0, 1, 0, 0, 0,
         CAST('02:30:00' AS time), NULL, NULL,
         NULL, DATEADD(day, 1, CAST(GETDATE() AS date)) + CAST('02:30:00' AS datetime),
         NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/fiscal/esterometro/generate-due',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);

    PRINT 'INSERT scheduler: fe_fiscal_esterometro_generate_due (daily 02:30)';
END
ELSE
    PRINT 'SKIP scheduler: fe_fiscal_esterometro_generate_due (gia esistente)';

-- ----------------------------------------------------------------------------
-- 4) CU collaboratori: deadline 16 marzo (per anno solare precedente).
--    Daily 03:00 con guard server-side; genera la prima volta in mar e
--    si auto-skippa per il resto dell'anno.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'fe_fiscal_cu_generate_due')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'fe_fiscal_cu_generate_due',
         0, 1, 0, 0, 0,
         CAST('03:00:00' AS time), NULL, NULL,
         NULL, DATEADD(day, 1, CAST(GETDATE() AS date)) + CAST('03:00:00' AS datetime),
         NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/fiscal/cu/generate-due',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);

    PRINT 'INSERT scheduler: fe_fiscal_cu_generate_due (daily 03:00)';
END
ELSE
    PRINT 'SKIP scheduler: fe_fiscal_cu_generate_due (gia esistente)';

-- ----------------------------------------------------------------------------
-- Verifica finale
-- ----------------------------------------------------------------------------
SELECT id, event_name, action_type, action_cmd,
       month_interval, day_interval, hour_interval, minute_interval, second_interval,
       execution_time, next_execution, enabled
FROM dbo.scheduler
WHERE event_name LIKE N'fe_%'
ORDER BY event_name;
