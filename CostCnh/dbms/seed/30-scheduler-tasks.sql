-- =============================================================================
-- CostCnh_Metadata — Sprint 3 scheduler tasks seed
-- =============================================================================
-- Target DB: MetaDataSQLConnection (CostCnh_Metadata).
-- Tabella: dbo.scheduler — framework WuicCore.Services.Scheduler.SchedulerHostedService
-- legge ogni 30s righe con enabled=1 AND next_execution<=NOW().
--
-- action_type='2'  = HTTP webservice call
-- action_cmd      = '<VERB> <URL>'  (default verb = POST)
--
-- Naming convenzione: costcnh_<verb>_<noun> snake_case (regola AGENTS).
--
-- Idempotente: ogni INSERT protetta da NOT EXISTS sull'event_name.
-- =============================================================================

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

:setvar BackendBaseUrl "http://localhost:6500"
:setvar AdminMail      ""

USE [CostCnh_Metadata];
GO

-- ----------------------------------------------------------------------------
-- 1) Outbox dispatch — ogni 30s
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_outbox_dispatch')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_outbox_dispatch',
        0, 0, 0, 0, 30,
        NULL, NULL, NULL,
        NULL, GETDATE(), NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_outbox_dispatch', NULL,
        NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);
    PRINT 'INSERT scheduler: costcnh_outbox_dispatch (30s)';
END
ELSE
    PRINT 'SKIP scheduler: costcnh_outbox_dispatch';
GO

-- ----------------------------------------------------------------------------
-- 2) Partition maintenance — daily 01:00 UTC
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_partition_maintenance')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_partition_maintenance',
        0, 1, 0, 0, 0,
        CAST('01:00:00' AS time), NULL, NULL,
        NULL, DATEADD(day, 1, CAST(GETDATE() AS date)) + CAST('01:00:00' AS datetime),
        NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_partition_maintenance', NULL,
        NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);
    PRINT 'INSERT scheduler: costcnh_partition_maintenance (daily 01:00)';
END
ELSE
    PRINT 'SKIP scheduler: costcnh_partition_maintenance';
GO

-- ----------------------------------------------------------------------------
-- 3) SAP poller — every 5 min (placeholder, full impl Sprint 4)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_poll_sap')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_poll_sap',
        0, 0, 0, 5, 0,
        NULL, NULL, NULL,
        NULL, GETDATE(), NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_poll_sap', NULL,
        NULLIF(N'$(AdminMail)', N''), 0, NULL, NULL);  -- enabled=0 fino a Sprint 4
    PRINT 'INSERT scheduler: costcnh_poll_sap (5min, disabled until Sprint 4)';
END
GO

-- ----------------------------------------------------------------------------
-- 4) BPM poller — every 15 min (placeholder)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_poll_bpm')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_poll_bpm',
        0, 0, 0, 15, 0,
        NULL, NULL, NULL,
        NULL, GETDATE(), NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_poll_bpm', NULL,
        NULLIF(N'$(AdminMail)', N''), 0, NULL, NULL);
    PRINT 'INSERT scheduler: costcnh_poll_bpm (15min, disabled until Sprint 4)';
END
GO

-- ----------------------------------------------------------------------------
-- 5) Timesheet poller — every 6 hours (placeholder)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_poll_timesheet')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_poll_timesheet',
        0, 0, 6, 0, 0,
        NULL, NULL, NULL,
        NULL, GETDATE(), NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_poll_timesheet', NULL,
        NULLIF(N'$(AdminMail)', N''), 0, NULL, NULL);
    PRINT 'INSERT scheduler: costcnh_poll_timesheet (6h, disabled until Sprint 4)';
END
GO

-- ----------------------------------------------------------------------------
-- 6) MAC poller — every 10 min (placeholder)
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'costcnh_poll_mac')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES (
        N'costcnh_poll_mac',
        0, 0, 0, 10, 0,
        NULL, NULL, NULL,
        NULL, GETDATE(), NULL, NULL,
        N'2', N'POST $(BackendBaseUrl)/api/scheduler/costcnh_poll_mac', NULL,
        NULLIF(N'$(AdminMail)', N''), 0, NULL, NULL);
    PRINT 'INSERT scheduler: costcnh_poll_mac (10min, disabled until Sprint 4)';
END
GO

-- Verifica
SELECT event_name, action_type, action_cmd,
       minute_interval, hour_interval, day_interval,
       next_execution, enabled
FROM dbo.scheduler
WHERE event_name LIKE 'costcnh_%'
ORDER BY event_name;
GO
