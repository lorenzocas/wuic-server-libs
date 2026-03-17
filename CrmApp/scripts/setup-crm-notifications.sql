SET NOCOUNT ON;

IF OBJECT_ID('dbo.crm_notifications', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.crm_notifications (
        notification_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_crm_notifications PRIMARY KEY,
        user_id INT NOT NULL,
        [type] NVARCHAR(50) NOT NULL,
        [message] NVARCHAR(500) NOT NULL,
        entity_type NVARCHAR(50) NULL,
        entity_id INT NULL,
        is_read BIT NOT NULL CONSTRAINT DF_crm_notifications_is_read DEFAULT(0),
        created_at DATETIME2(3) NOT NULL CONSTRAINT DF_crm_notifications_created_at DEFAULT(SYSUTCDATETIME())
    );
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_crm_notifications_user_unread_created' AND object_id = OBJECT_ID('dbo.crm_notifications'))
BEGIN
    CREATE INDEX IX_crm_notifications_user_unread_created
        ON dbo.crm_notifications(user_id, is_read, created_at DESC);
END
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.crm_sp_enqueue_notification
    @user_id INT,
    @type NVARCHAR(50),
    @message NVARCHAR(500),
    @entity_type NVARCHAR(50) = NULL,
    @entity_id INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF ISNULL(@user_id, 0) <= 0
        RETURN;

    INSERT INTO dbo.crm_notifications(user_id, [type], [message], entity_type, entity_id)
    VALUES(@user_id, ISNULL(NULLIF(@type, ''), 'info'), ISNULL(NULLIF(@message, ''), 'Nuova notifica CRM'), @entity_type, @entity_id);
END
GO

/* ===== TRIGGER: crm_leads assigned user change ===== */
IF OBJECT_ID('dbo.crm_leads', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.crm_leads', 'assigned_user_id') IS NOT NULL
BEGIN
    DECLARE @leadIdCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_leads', 'lead_id') IS NOT NULL THEN 'lead_id'
        WHEN COL_LENGTH('dbo.crm_leads', 'id') IS NOT NULL THEN 'id'
        ELSE NULL
    END;

    DECLARE @leadMsgCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_leads', 'lead_name') IS NOT NULL THEN 'lead_name'
        WHEN COL_LENGTH('dbo.crm_leads', 'full_name') IS NOT NULL THEN 'full_name'
        WHEN COL_LENGTH('dbo.crm_leads', 'company_name') IS NOT NULL THEN 'company_name'
        ELSE NULL
    END;

    IF @leadIdCol IS NOT NULL
    BEGIN
        SET ANSI_NULLS ON;
        SET QUOTED_IDENTIFIER ON;
        DECLARE @sqlLead NVARCHAR(MAX) = N'
CREATE OR ALTER TRIGGER dbo.trg_crm_leads_notify_assignment
ON dbo.crm_leads
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.crm_notifications(user_id, [type], [message], entity_type, entity_id)
    SELECT
        i.assigned_user_id,
        ''lead_assigned'',
        ''Lead assegnato'' + CASE WHEN ' + CASE WHEN @leadMsgCol IS NULL THEN '1=0' ELSE 'i.' + QUOTENAME(@leadMsgCol) + ' IS NOT NULL' END + ' THEN '': '' + CONVERT(NVARCHAR(300), i.' + ISNULL(QUOTENAME(@leadMsgCol), '[assigned_user_id]') + ') ELSE '''' END,
        ''lead'',
        i.' + QUOTENAME(@leadIdCol) + '
    FROM inserted i
    LEFT JOIN deleted d ON d.' + QUOTENAME(@leadIdCol) + ' = i.' + QUOTENAME(@leadIdCol) + '
    WHERE ISNULL(i.assigned_user_id, 0) > 0
      AND (d.' + QUOTENAME(@leadIdCol) + ' IS NULL OR ISNULL(d.assigned_user_id, 0) <> ISNULL(i.assigned_user_id, 0));
END;';
        EXEC sp_executesql @sqlLead;
    END
END
GO

/* ===== TRIGGER: crm_cases assigned user change ===== */
IF OBJECT_ID('dbo.crm_cases', 'U') IS NOT NULL
   AND (COL_LENGTH('dbo.crm_cases', 'assigned_user_id') IS NOT NULL OR COL_LENGTH('dbo.crm_cases', 'owner_user_id') IS NOT NULL)
BEGIN
    DECLARE @caseAssigneeCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_cases', 'assigned_user_id') IS NOT NULL THEN 'assigned_user_id'
        ELSE 'owner_user_id'
    END;

    DECLARE @caseIdCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_cases', 'case_id') IS NOT NULL THEN 'case_id'
        WHEN COL_LENGTH('dbo.crm_cases', 'id') IS NOT NULL THEN 'id'
        ELSE NULL
    END;

    IF @caseIdCol IS NOT NULL
    BEGIN
        SET ANSI_NULLS ON;
        SET QUOTED_IDENTIFIER ON;
        DECLARE @sqlCase NVARCHAR(MAX) = N'
CREATE OR ALTER TRIGGER dbo.trg_crm_cases_notify_assignment
ON dbo.crm_cases
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.crm_notifications(user_id, [type], [message], entity_type, entity_id)
    SELECT
        i.' + QUOTENAME(@caseAssigneeCol) + ',
        ''case_assigned'',
        ''Case assegnato'',
        ''case'',
        i.' + QUOTENAME(@caseIdCol) + '
    FROM inserted i
    LEFT JOIN deleted d ON d.' + QUOTENAME(@caseIdCol) + ' = i.' + QUOTENAME(@caseIdCol) + '
    WHERE ISNULL(i.' + QUOTENAME(@caseAssigneeCol) + ', 0) > 0
      AND (d.' + QUOTENAME(@caseIdCol) + ' IS NULL OR ISNULL(d.' + QUOTENAME(@caseAssigneeCol) + ', 0) <> ISNULL(i.' + QUOTENAME(@caseAssigneeCol) + ', 0));
END;';
        EXEC sp_executesql @sqlCase;
    END
END
GO

/* ===== TRIGGER: crm_activities due soon ===== */
IF OBJECT_ID('dbo.crm_activities', 'U') IS NOT NULL
   AND COL_LENGTH('dbo.crm_activities', 'due_date') IS NOT NULL
BEGIN
    DECLARE @activityUserCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_activities', 'owner_user_id') IS NOT NULL THEN 'owner_user_id'
        WHEN COL_LENGTH('dbo.crm_activities', 'assigned_user_id') IS NOT NULL THEN 'assigned_user_id'
        ELSE NULL
    END;

    DECLARE @activityIdCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_activities', 'activity_id') IS NOT NULL THEN 'activity_id'
        WHEN COL_LENGTH('dbo.crm_activities', 'id') IS NOT NULL THEN 'id'
        ELSE NULL
    END;

    DECLARE @activityCompletedCol SYSNAME = CASE
        WHEN COL_LENGTH('dbo.crm_activities', 'completed') IS NOT NULL THEN 'completed'
        WHEN COL_LENGTH('dbo.crm_activities', 'is_completed') IS NOT NULL THEN 'is_completed'
        ELSE NULL
    END;

    IF @activityUserCol IS NOT NULL AND @activityIdCol IS NOT NULL
    BEGIN
        DECLARE @completedExpr NVARCHAR(100) = CASE
            WHEN @activityCompletedCol IS NULL THEN '0'
            ELSE 'ISNULL(i.' + QUOTENAME(@activityCompletedCol) + ', 0)'
        END;

        SET ANSI_NULLS ON;
        SET QUOTED_IDENTIFIER ON;
        DECLARE @sqlAct NVARCHAR(MAX) = N'
CREATE OR ALTER TRIGGER dbo.trg_crm_activities_notify_due
ON dbo.crm_activities
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.crm_notifications(user_id, [type], [message], entity_type, entity_id)
    SELECT
        i.' + QUOTENAME(@activityUserCol) + ',
        ''activity_due'',
        ''Attivita in scadenza oggi'',
        ''activity'',
        i.' + QUOTENAME(@activityIdCol) + '
    FROM inserted i
    WHERE ISNULL(i.' + QUOTENAME(@activityUserCol) + ', 0) > 0
      AND CONVERT(date, i.due_date) = CONVERT(date, GETDATE())
      AND ' + @completedExpr + ' = 0;
END;';
        EXEC sp_executesql @sqlAct;
    END
END
GO
