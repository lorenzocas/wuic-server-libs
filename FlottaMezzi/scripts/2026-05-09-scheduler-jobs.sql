-- ============================================================================
-- FlottaMezzi - Scheduler tasks Phase 3 Liv 7
-- DB: FlottaMezzi_Metadata (tabella dbo.scheduler)
-- Idempotente (IF NOT EXISTS su event_name).
--
-- :setvar parametri (override da chiamante con sqlcmd -v):
--    SchedulerBaseUrl  default http://localhost:5100
--    AdminMail         default ops@flottamezzi.local
-- ============================================================================
:setvar SchedulerBaseUrl "http://localhost:5100"
:setvar AdminMail "ops@flottamezzi.local"
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- ----------------------------------------------------------------------------
-- 1) flottamezzi_check_scadenze (giornaliero alle 07:00)
--    HTTP POST loopback /api/flotta/CheckScadenze
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'flottamezzi_check_scadenze')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'flottamezzi_check_scadenze',
         0, 1, 0, 0, 0,
         CAST('07:00:00' AS time), NULL, NULL,
         NULL, DATEADD(day, 1, CAST(CAST(GETDATE() AS DATE) AS datetime)) + CAST('07:00:00' AS datetime),
         NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/flotta/CheckScadenze',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);
    PRINT '[ok] flottamezzi_check_scadenze inserted';
END
ELSE
    PRINT '[skip] flottamezzi_check_scadenze already exists';
GO

-- ----------------------------------------------------------------------------
-- 2) flottamezzi_aggrega_costi (giornaliero alle 02:00)
--    HTTP POST loopback /api/flotta/AggregaCosti
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = N'flottamezzi_aggrega_costi')
BEGIN
    INSERT INTO dbo.scheduler
        (event_name, month_interval, day_interval, hour_interval, minute_interval, second_interval,
         execution_time, execution_day, execution_month,
         last_execution, next_execution, last_ex_succeded, last_ex_exception,
         action_type, action_cmd, params_values,
         notify_exception_mail, enabled, result_template, target_route)
    VALUES
        (N'flottamezzi_aggrega_costi',
         0, 1, 0, 0, 0,
         CAST('02:00:00' AS time), NULL, NULL,
         NULL, DATEADD(day, 1, CAST(CAST(GETDATE() AS DATE) AS datetime)) + CAST('02:00:00' AS datetime),
         NULL, NULL,
         N'2',
         N'POST $(SchedulerBaseUrl)/api/flotta/AggregaCosti',
         NULL,
         NULLIF(N'$(AdminMail)', N''), 1, NULL, NULL);
    PRINT '[ok] flottamezzi_aggrega_costi inserted';
END
ELSE
    PRINT '[skip] flottamezzi_aggrega_costi already exists';
GO

-- ----------------------------------------------------------------------------
-- Verifica
-- ----------------------------------------------------------------------------
SELECT id, event_name, action_type, action_cmd, day_interval, execution_time,
       next_execution, enabled
  FROM dbo.scheduler
 WHERE event_name LIKE N'flottamezzi\_%' ESCAPE N'\'
 ORDER BY event_name;
GO
