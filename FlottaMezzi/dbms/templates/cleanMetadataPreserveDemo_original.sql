



CREATE PROCEDURE [dbo].[cleanMetadataPreserveDemo]
AS
BEGIN

delete from utenti;
DELETE FROM dbo.dom_board where id1 >= 5052;
delete from _error__logs;
delete from [dbo].[_mail_recipients];
delete from [dbo].[_mailing_lists];
delete from [dbo].[_notifications];
delete from [dbo].[_progress_indicator];
delete from [dbo].[scheduler_execution];

delete from [dbo].[TestMaster];

delete from ruoli where id_ruolo > 2;


END
