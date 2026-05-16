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

DECLARE @id BIGINT;
EXEC [audit].[outbox_enqueue] @event_kind = 'program_consolidation', @entity_schema = 'core', @entity_name = 'program', @entity_id = '1', @payload_json = '{"action":"consolidate","program_id":1}', @id = @id OUTPUT;
PRINT 'enqueued program_consolidation id=' + CAST(@id AS NVARCHAR(20));

EXEC [audit].[outbox_enqueue] @event_kind = 'forecast_recalc', @entity_schema = 'core', @entity_name = 'program', @entity_id = '1', @payload_json = '{"action":"recalc","program_id":1}', @id = @id OUTPUT;
PRINT 'enqueued forecast_recalc id=' + CAST(@id AS NVARCHAR(20));

EXEC [audit].[outbox_enqueue] @event_kind = 'workforce_upload', @entity_schema = 'core', @entity_name = 'program', @entity_id = '2', @payload_json = '{"action":"upload","program_id":2,"file":"sample.xlsx"}', @id = @id OUTPUT;
PRINT 'enqueued workforce_upload id=' + CAST(@id AS NVARCHAR(20));

SELECT id, event_kind, status, attempt_count, next_attempt_at
FROM [audit].[outbox]
ORDER BY id DESC;
GO
