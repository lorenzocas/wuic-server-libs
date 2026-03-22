SET NOCOUNT ON;

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID('dbo.crm_cases', 'U') IS NULL
BEGIN
    RAISERROR('Tabella dbo.crm_cases non trovata.', 16, 1);
    RETURN;
END

IF COL_LENGTH('dbo.crm_cases', 'sla_hours') IS NULL
BEGIN
    ALTER TABLE dbo.crm_cases
    ADD sla_hours AS (
        CASE UPPER(LTRIM(RTRIM(ISNULL(priority, ''))))
            WHEN 'CRITICAL' THEN 4
            WHEN 'HIGH' THEN 8
            WHEN 'NORMAL' THEN 24
            WHEN 'LOW' THEN 72
            ELSE 24
        END
    ) PERSISTED;
END

IF COL_LENGTH('dbo.crm_cases', 'sla_due_at') IS NULL
BEGIN
    ALTER TABLE dbo.crm_cases
    ADD sla_due_at DATETIME2(3) NULL;
END

IF COL_LENGTH('dbo.crm_cases', 'sla_breached') IS NULL
BEGIN
    ALTER TABLE dbo.crm_cases
    ADD sla_breached BIT NOT NULL CONSTRAINT DF_crm_cases_sla_breached DEFAULT (0);
END
GO

UPDATE c
SET c.sla_due_at = DATEADD(HOUR, ISNULL(c.sla_hours, 24), ISNULL(c.created_at, GETUTCDATE()))
FROM dbo.crm_cases c
WHERE c.sla_due_at IS NULL;
GO

DECLARE @caseIdCol SYSNAME = CASE
    WHEN COL_LENGTH('dbo.crm_cases', 'case_id') IS NOT NULL THEN 'case_id'
    WHEN COL_LENGTH('dbo.crm_cases', 'id') IS NOT NULL THEN 'id'
    ELSE NULL
END;

IF @caseIdCol IS NOT NULL
BEGIN
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    DECLARE @sqlTrigger NVARCHAR(MAX) = N'
CREATE OR ALTER TRIGGER dbo.trg_crm_cases_set_sla_due_at
ON dbo.crm_cases
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE c
    SET
        c.sla_due_at = DATEADD(HOUR, ISNULL(i.sla_hours, 24), ISNULL(i.created_at, GETUTCDATE())),
        c.sla_breached = 0
    FROM dbo.crm_cases c
    INNER JOIN inserted i ON i.' + QUOTENAME(@caseIdCol) + ' = c.' + QUOTENAME(@caseIdCol) + ';
END;';

    EXEC sp_executesql @sqlTrigger;
END
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.crm_sp_check_sla_breach
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @updated TABLE
    (
        case_id INT NOT NULL,
        owner_user_id INT NULL,
        priority NVARCHAR(100) NULL,
        sla_due_at DATETIME2(3) NULL
    );

    UPDATE c
    SET
        c.sla_breached = 1,
        c.priority = CASE UPPER(LTRIM(RTRIM(ISNULL(c.priority, ''))))
            WHEN 'LOW' THEN 'NORMAL'
            WHEN 'NORMAL' THEN 'HIGH'
            WHEN 'HIGH' THEN 'CRITICAL'
            ELSE 'CRITICAL'
        END
    OUTPUT
        inserted.case_id,
        inserted.owner_user_id,
        inserted.priority,
        inserted.sla_due_at
    INTO @updated(case_id, owner_user_id, priority, sla_due_at)
    FROM dbo.crm_cases c
    WHERE
        ISNULL(c.Stato_Record, 0) = 0
        AND ISNULL(c.sla_breached, 0) = 0
        AND c.sla_due_at IS NOT NULL
        AND c.sla_due_at < GETUTCDATE();

    DECLARE @affectedRows INT = @@ROWCOUNT;

    IF @affectedRows > 0
       AND OBJECT_ID(N'MetadataCRM.dbo._notifications', N'U') IS NOT NULL
    BEGIN
        INSERT INTO MetadataCRM.dbo._notifications
        (
            user_id,
            [type],
            [message],
            target_json,
            payload_json,
            is_read,
            created_at,
            deleted_at,
            created_by,
            source
        )
        SELECT
            u.owner_user_id,
            N'crm_case_sla_breached',
            N'SLA superata per il case #' + CAST(u.case_id AS NVARCHAR(30)) + N' (priorita: ' + ISNULL(u.priority, N'') + N')',
            N'{"route":"crm_cases/list"}',
            N'{"case_id":' + CAST(u.case_id AS NVARCHAR(30)) + N',"priority":"' + REPLACE(ISNULL(u.priority, N''), '"', '\"') + N'"}',
            0,
            SYSUTCDATETIME(),
            NULL,
            N'crm_sp_check_sla_breach',
            N'crm_sp_check_sla_breach'
        FROM @updated u
        WHERE ISNULL(u.owner_user_id, 0) > 0
          AND NOT EXISTS
          (
              SELECT 1
              FROM MetadataCRM.dbo._notifications n
              WHERE n.deleted_at IS NULL
                AND n.user_id = u.owner_user_id
                AND n.[type] = N'crm_case_sla_breached'
                AND TRY_CONVERT(INT, JSON_VALUE(n.payload_json, '$.case_id')) = u.case_id
                AND ISNULL(JSON_VALUE(n.payload_json, '$.priority'), N'') = ISNULL(u.priority, N'')
          );
    END

    SELECT @affectedRows AS updated_rows;
END
GO

IF OBJECT_ID('dbo.scheduler', 'U') IS NOT NULL
BEGIN
    DECLARE @schedulerHasCoreColumns BIT = CASE
        WHEN COL_LENGTH('dbo.scheduler', 'event_name') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'action_type') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'action_cmd') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'month_interval') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'day_interval') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'hour_interval') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'minute_interval') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'second_interval') IS NOT NULL
         AND COL_LENGTH('dbo.scheduler', 'enabled') IS NOT NULL
        THEN 1 ELSE 0 END;

    IF @schedulerHasCoreColumns = 1
    BEGIN
        DECLARE @eventName NVARCHAR(255) = 'CRM_Cases_SLA_Check';
        DECLARE @actionCmd NVARCHAR(MAX) = 'EXEC dbo.crm_sp_check_sla_breach';
        DECLARE @targetRouteSupported BIT = CASE WHEN COL_LENGTH('dbo.scheduler', 'target_route') IS NOT NULL THEN 1 ELSE 0 END;
        DECLARE @nextExecutionSupported BIT = CASE WHEN COL_LENGTH('dbo.scheduler', 'next_execution') IS NOT NULL THEN 1 ELSE 0 END;

        IF EXISTS (SELECT 1 FROM dbo.scheduler WHERE event_name = @eventName)
        BEGIN
            IF @targetRouteSupported = 1 AND @nextExecutionSupported = 1
            BEGIN
                UPDATE s
                SET
                    s.action_type = '1',
                    s.action_cmd = @actionCmd,
                    s.params_values = '',
                    s.month_interval = 0,
                    s.day_interval = 0,
                    s.hour_interval = 0,
                    s.minute_interval = 15,
                    s.second_interval = 0,
                    s.enabled = 1,
                    s.target_route = 0,
                    s.next_execution = DATEADD(MINUTE, 15, GETDATE())
                FROM dbo.scheduler s
                WHERE s.event_name = @eventName;
            END
            ELSE
            BEGIN
                UPDATE s
                SET
                    s.action_type = '1',
                    s.action_cmd = @actionCmd,
                    s.params_values = '',
                    s.month_interval = 0,
                    s.day_interval = 0,
                    s.hour_interval = 0,
                    s.minute_interval = 15,
                    s.second_interval = 0,
                    s.enabled = 1
                FROM dbo.scheduler s
                WHERE s.event_name = @eventName;
            END
        END
        ELSE
        BEGIN
            IF @targetRouteSupported = 1 AND @nextExecutionSupported = 1
            BEGIN
                INSERT INTO dbo.scheduler
                (
                    event_name,
                    action_type,
                    action_cmd,
                    params_values,
                    month_interval,
                    day_interval,
                    hour_interval,
                    minute_interval,
                    second_interval,
                    enabled,
                    target_route,
                    next_execution
                )
                VALUES
                (
                    @eventName,
                    '1',
                    @actionCmd,
                    '',
                    0,
                    0,
                    0,
                    15,
                    0,
                    1,
                    0,
                    DATEADD(MINUTE, 15, GETDATE())
                );
            END
            ELSE
            BEGIN
                INSERT INTO dbo.scheduler
                (
                    event_name,
                    action_type,
                    action_cmd,
                    params_values,
                    month_interval,
                    day_interval,
                    hour_interval,
                    minute_interval,
                    second_interval,
                    enabled
                )
                VALUES
                (
                    @eventName,
                    '1',
                    @actionCmd,
                    '',
                    0,
                    0,
                    0,
                    15,
                    0,
                    1
                );
            END
        END
    END
    ELSE
    BEGIN
        PRINT 'Tabella scheduler presente ma schema non compatibile: schedulazione SLA non creata.';
    END
END
GO

